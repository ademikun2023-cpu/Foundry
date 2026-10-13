// Explicit deployment check. Never runs during normal builds or tests.
// Uses existing server environment values; prints no keys, URLs with keys,
// provider error messages, business records, or database rows.
if (!process.argv.includes('--live')) {
  console.error('Use --live to authorize one request per configured provider.');
  process.exit(1);
}
const required = ['NEXT_PUBLIC_SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'GOOGLE_PLACES_API_KEY', 'PAGESPEED_API_KEY'];
for (const name of required) {
  if (!process.env[name]) {
    console.error(`Provider check: missing ${name}`);
    process.exit(1);
  }
}
function safeCode(value) {
  return typeof value === 'string' && /^[A-Za-z][A-Za-z0-9_]{0,100}$/.test(value) ? value : undefined;
}
async function check(name, url, options, validate) {
  if (process.argv.includes('--places-only') && name !== 'places') return true;
  try {
    const res = await fetch(url, { ...options, signal: AbortSignal.timeout(55000) });
    const data = await res.json().catch(() => null);
    const result = { provider: name, http: res.status, ok: res.ok && validate(data) };
    if (!res.ok) {
      result.status = safeCode(data?.error?.status);
      result.reasons = [...(data?.error?.details ?? []), ...(data?.error?.errors ?? [])].map(d => safeCode(d.reason)).filter(Boolean);
      const message = typeof data?.error?.message === 'string' ? data.error.message : '';
      result.hints = [
        ['BILLING', /billing/i],
        ['API_NOT_ENABLED', /not enabled|disabled|has not been used|enable.*API/i],
        ['REFERRER_RESTRICTION', /referer|referrer/i],
        ['IP_RESTRICTION', /IP address/i],
        ['API_RESTRICTION', /blocked|not authorized.*API|not allowed.*API/i],
        ['INVALID_KEY', /API key.*not valid|invalid.*API key/i],
        ['QUOTA', /quota|rate limit/i],
      ].filter(([, pattern]) => pattern.test(message)).map(([code]) => code);
    }
    console.log('FOUNDRY_PROVIDER_CHECK ' + JSON.stringify(result));
    return result.ok;
  } catch {
    console.log('FOUNDRY_PROVIDER_CHECK ' + JSON.stringify({ provider: name, ok: false, reason: 'NETWORK_OR_TIMEOUT' }));
    return false;
  }
}
const speed = new URL('https://www.googleapis.com/pagespeedonline/v5/runPagespeed');
speed.searchParams.set('url', 'https://example.com');
speed.searchParams.set('strategy', 'mobile');
speed.searchParams.set('category', 'performance');
speed.searchParams.set('key', process.env.PAGESPEED_API_KEY);
const results = await Promise.all([
  check('supabase', `${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/audits?select=id&limit=0`, {
    headers: { apikey: process.env.SUPABASE_SERVICE_ROLE_KEY },
  }, data => Array.isArray(data)),
  check('places', 'https://places.googleapis.com/v1/places:searchText', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': process.env.GOOGLE_PLACES_API_KEY,
      'X-Goog-FieldMask': 'places.id,places.displayName,places.formattedAddress,places.websiteUri,places.rating,places.userRatingCount,places.googleMapsUri,places.attributions',
    },
    body: JSON.stringify({ textQuery: 'plumbers in Miami Florida', pageSize: 1 }),
  }, data => Array.isArray(data?.places) && data.places.length > 0),
  check('pagespeed', speed, {}, data => !data?.lighthouseResult?.runtimeError &&
    typeof data?.lighthouseResult?.categories?.performance?.score === 'number'),
]);
if (results.some(ok => !ok)) process.exitCode = 1;

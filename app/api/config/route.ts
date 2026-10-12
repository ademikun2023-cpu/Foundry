import { configuredAuth, json } from "@/lib/server";
export function GET() {
  const auth = configuredAuth();
  return json({
    auth,
    search: Boolean(
      auth &&
      process.env.SUPABASE_SERVICE_ROLE_KEY &&
      process.env.GOOGLE_PLACES_API_KEY,
    ),
    audits: Boolean(auth && process.env.SUPABASE_SERVICE_ROLE_KEY),
    ai: Boolean(process.env.ANTHROPIC_API_KEY && process.env.ANTHROPIC_MODEL),
    billing: Boolean(
      auth &&
      process.env.SUPABASE_SERVICE_ROLE_KEY &&
      process.env.STRIPE_SECRET_KEY &&
      process.env.STRIPE_WEBHOOK_SECRET &&
      process.env.STRIPE_PRICE_STARTER &&
      process.env.STRIPE_PRICE_GROWTH &&
      process.env.STRIPE_PRICE_AGENCY &&
      process.env.APP_URL,
    ),
  });
}

import * as cheerio from "cheerio";
import type { Audit, Business, Finding, Metrics } from "./types";
import { fetchPublicHtml, parsePublicUrl } from "./safe-fetch";
import { scoreOpportunity } from "./scoring";

export function inspectHtml(html: string, url: string) {
  const $ = cheerio.load(html);
  let bookingUrl: string | null = null;
  const socialLinks = new Set<string>();
  $("a[href],iframe[src],script[src]").each((_, element) => {
    const item = $(element);
    const raw = item.attr("href") || item.attr("src");
    if (!raw) return;
    try {
      const link = new URL(raw, url);
      if (!["https:", "http:"].includes(link.protocol)) return;
      const text = item.text().trim();
      if (
        /(^|\.)(instagram\.com|facebook\.com|linkedin\.com|tiktok\.com)$/.test(
          link.hostname,
        )
      )
        socialLinks.add(link.origin + link.pathname);
      const provider =
        /(^|\.)(calendly\.com|acuityscheduling\.com|booksy\.com|vagaro\.com|zocdoc\.com|squareup\.com|schedulicity\.com)$/.test(
          link.hostname,
        );
      const explicit =
        /\b(book (now|online|an? (appointment|visit|service))|schedule (an? )?(appointment|service|visit)|request (an? )?appointment)\b/i.test(
          text,
        ) ||
        /\/(book|booking|schedule|appointments?)(\/|$)/i.test(link.pathname);
      if (
        !bookingUrl &&
        (provider || explicit) &&
        raw !== "#" &&
        !raw.startsWith("#")
      )
        bookingUrl = link.href;
    } catch {}
  });
  return {
    booking: bookingUrl ? ("detected" as const) : ("not_detected" as const),
    bookingUrl,
    socialLinks: [...socialLinks].slice(0, 10),
    mobileViewport: Boolean(
      $('meta[name="viewport"]')
        .attr("content")
        ?.includes("width=device-width"),
    ),
    https: new URL(url).protocol === "https:",
  };
}
async function pageSpeed(url: string) {
  const endpoint = new URL(
    "https://www.googleapis.com/pagespeedonline/v5/runPagespeed",
  );
  endpoint.searchParams.set("url", url);
  endpoint.searchParams.set("strategy", "mobile");
  endpoint.searchParams.set("category", "performance");
  if (process.env.PAGESPEED_API_KEY)
    endpoint.searchParams.set("key", process.env.PAGESPEED_API_KEY);
  const res = await fetch(endpoint, {
    signal: AbortSignal.timeout(38000),
    cache: "no-store",
  });
  if (!res.ok) throw new Error("PageSpeed unavailable");
  const data = await res.json();
  const lh = data.lighthouseResult;
  if (
    lh?.runtimeError ||
    typeof lh?.categories?.performance?.score !== "number"
  )
    throw new Error("PageSpeed measurement missing");
  return {
    performance: Math.round(lh.categories.performance.score * 100),
    lcpMs:
      typeof lh.audits?.["largest-contentful-paint"]?.numericValue === "number"
        ? Math.round(lh.audits["largest-contentful-paint"].numericValue)
        : null,
  };
}
export async function runAudit(business: Business): Promise<Audit> {
  if (business.website) parsePublicUrl(business.website);
  const metrics: Metrics = {
    performance: null,
    lcpMs: null,
    https: null,
    mobileViewport: null,
    booking: "unknown",
    bookingUrl: null,
    socialLinks: [],
    reviewCount: business.reviewCount ?? null,
    reviewBenchmark: business.reviewBenchmark ?? null,
  };
  const warnings: string[] = [];
  const findings: Finding[] = [];
  if (business.website) {
    const [html, speed] = await Promise.allSettled([
      fetchPublicHtml(business.website),
      pageSpeed(business.website),
    ]);
    if (html.status === "fulfilled")
      Object.assign(metrics, inspectHtml(html.value.html, html.value.url));
    else
      warnings.push(
        "Homepage inspection was unavailable. Booking, HTTPS and viewport checks remain unknown.",
      );
    if (speed.status === "fulfilled") Object.assign(metrics, speed.value);
    else
      warnings.push(
        "PageSpeed did not return a usable mobile measurement. Speed is excluded from the score.",
      );
  } else {
    findings.push({
      title: "No website supplied",
      evidence:
        "No website was available in this record; this does not prove the business has no website.",
      action: "Verify the business website before pitching a new site.",
      severity: "unknown",
      source: "Business record",
    });
  }
  if (metrics.performance !== null)
    findings.push({
      title: "Mobile performance",
      evidence: `Lighthouse returned a mobile performance score of ${metrics.performance}/100${metrics.lcpMs !== null ? `, with a lab Largest Contentful Paint of ${(metrics.lcpMs / 1000).toFixed(1)} seconds` : ""}.`,
      action:
        "Inspect large images, scripts and server response time; retest after changes.",
      severity: metrics.performance < 90 ? "opportunity" : "good",
      source: "Google PageSpeed Insights · mobile lab test",
    });
  if (metrics.booking !== "unknown")
    findings.push({
      title: "Booking visibility",
      evidence:
        metrics.booking === "detected"
          ? "A likely booking link or provider was detected on the homepage; completion was not tested."
          : "No likely online-booking link was detected in the homepage HTML. JavaScript widgets or other pages may provide booking.",
      action:
        "Manually follow the booking journey on a phone and check that a new customer can finish it.",
      severity: metrics.booking === "detected" ? "good" : "opportunity",
      source: business.website || "Homepage HTML",
    });
  if (
    metrics.reviewCount !== null &&
    metrics.reviewBenchmark !== null &&
    metrics.reviewBenchmark > 0
  )
    findings.push({
      title: "Reviews in this search sample",
      evidence: `This listing has ${metrics.reviewCount} Google reviews. The median among the other returned businesses is ${metrics.reviewBenchmark}.`,
      action:
        "Verify the comparison group, then consider a consistent, policy-compliant review-request process.",
      severity:
        metrics.reviewCount < metrics.reviewBenchmark ? "opportunity" : "good",
      source: "Google Maps · returned search sample",
    });
  if (metrics.https !== null)
    findings.push({
      title: "HTTPS",
      evidence: metrics.https
        ? "The inspected homepage was served over HTTPS."
        : "The inspected homepage was served over HTTP.",
      action: metrics.https
        ? "Keep the certificate and redirects maintained."
        : "Enable HTTPS and redirect HTTP traffic.",
      severity: metrics.https ? "good" : "opportunity",
      source: "Final homepage URL",
    });
  if (metrics.mobileViewport !== null)
    findings.push({
      title: "Mobile viewport",
      evidence: metrics.mobileViewport
        ? "A device-width viewport tag was present. This alone does not verify mobile usability."
        : "No device-width viewport tag was detected in the homepage HTML.",
      action: "Check text size, navigation and form controls on a phone.",
      severity: metrics.mobileViewport ? "good" : "opportunity",
      source: "Homepage HTML",
    });
  warnings.push(
    "This is a point-in-time audit. Lab results vary. No revenue loss, buyer intent or willingness to pay has been measured.",
  );
  warnings.push(
    "Social links are detected from the homepage only. Posting activity is not measured.",
  );
  return {
    id: crypto.randomUUID(),
    business,
    createdAt: new Date().toISOString(),
    stage: "New lead",
    notes: "",
    metrics,
    scoring: scoreOpportunity(metrics),
    findings,
    warnings,
  };
}

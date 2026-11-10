import type { Audit, Metrics } from "./types";
import { scoreOpportunity } from "./scoring";
export function demoAudits(): Audit[] {
  return [
    {
      name: "Harbor Plumbing",
      performance: 36,
      lcp: 8200,
      reviews: 28,
      benchmark: 186,
      booking: false,
      stage: "New lead" as const,
    },
    {
      name: "Oakline Home Services",
      performance: 58,
      lcp: 5100,
      reviews: 61,
      benchmark: 186,
      booking: false,
      stage: "Contacted" as const,
    },
    {
      name: "Evergreen Plumbing",
      performance: 76,
      lcp: 3300,
      reviews: 104,
      benchmark: 186,
      booking: false,
      stage: "Interested" as const,
    },
    {
      name: "Clearwater Pipe Co.",
      performance: 93,
      lcp: 1800,
      reviews: 241,
      benchmark: 186,
      booking: true,
      stage: "New lead" as const,
    },
  ].map((b, i) => {
    const metrics: Metrics = {
      performance: b.performance,
      lcpMs: b.lcp,
      https: true,
      mobileViewport: true,
      booking: b.booking ? "detected" : "not_detected",
      bookingUrl: b.booking ? "https://example.com/book" : null,
      socialLinks: [],
      reviewCount: b.reviews,
      reviewBenchmark: b.benchmark,
    };
    return {
      id: `sample-${i}`,
      business: {
        name: b.name,
        website: "https://example.com",
        address: "Illustrative business · Florida",
        rating: 4.5,
        reviewCount: b.reviews,
        reviewBenchmark: b.benchmark,
      },
      createdAt: "2026-10-12T09:00:00.000Z",
      stage: b.stage,
      notes: "",
      metrics,
      scoring: scoreOpportunity(metrics),
      demo: true,
      findings: [
        {
          title: "Mobile performance",
          evidence: `Sample Lighthouse mobile performance: ${b.performance}/100. Illustrative lab LCP: ${(b.lcp / 1000).toFixed(1)} seconds.`,
          action:
            "Review image sizes, blocking scripts and server response time; retest after changes.",
          severity: b.performance < 90 ? "opportunity" : "good",
          source: "Fictional sample · not a live measurement",
        },
        {
          title: "Reviews in this search sample",
          evidence: `Sample review count: ${b.reviews}; comparison median: ${b.benchmark}.`,
          action:
            "Check the comparison group and design a consistent review-request process.",
          severity: b.reviews < b.benchmark ? "opportunity" : "good",
          source: "Fictional sample · not Google Maps data",
        },
        {
          title: "Booking visibility",
          evidence: b.booking
            ? "A likely booking link was detected in this fictional example."
            : "No likely booking link was detected in this fictional homepage example. Other pages or widgets may provide booking.",
          action:
            "Manually check whether a new customer can complete booking on mobile.",
          severity: b.booking ? "good" : "opportunity",
          source: "Fictional sample",
        },
      ],
      warnings: [
        "All businesses and measurements in this sample are fictional.",
        "Opportunity scores are research priorities, not buying intent or measured revenue loss.",
        "Social activity and end-to-end booking completion are not measured.",
      ],
    };
  });
}

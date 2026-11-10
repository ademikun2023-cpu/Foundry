import type { Metrics, Scoring, ScorePart } from "./types";
const clamp = (value: number) => Math.max(0, Math.min(1, value));
export function scoreOpportunity(m: Metrics): Scoring {
  const reviewGap =
    m.reviewCount !== null &&
    m.reviewBenchmark !== null &&
    m.reviewBenchmark > 0
      ? clamp(1 - m.reviewCount / m.reviewBenchmark)
      : null;
  const parts: ScorePart[] = [
    {
      key: "speed",
      label: "Mobile performance",
      weight: 40,
      opportunity:
        m.performance === null ? null : clamp(1 - m.performance / 100),
      detail:
        m.performance === null
          ? "PageSpeed measurement unavailable; excluded."
          : `${m.performance}/100 Lighthouse mobile performance. Opportunity = 1 − performance/100.`,
    },
    {
      key: "reviews",
      label: "Review gap",
      weight: 35,
      opportunity: reviewGap,
      detail:
        reviewGap === null
          ? "No usable comparison sample; excluded."
          : `${m.reviewCount} reviews versus a median of ${m.reviewBenchmark} among the other returned businesses. Opportunity = max(0, 1 − reviews/median). This is a search sample, not the entire market.`,
    },
    {
      key: "booking",
      label: "Booking visibility",
      weight: 25,
      opportunity:
        m.booking === "unknown" ? null : m.booking === "detected" ? 0 : 0.6,
      detail:
        m.booking === "unknown"
          ? "Homepage could not be inspected; excluded."
          : m.booking === "detected"
            ? "A likely booking link or embedded provider was detected; manually verify completion."
            : "No likely booking link was detected in homepage HTML. A 60% heuristic opportunity is used; JavaScript widgets and other pages may be missed.",
    },
  ];
  const known = parts.filter((p) => p.opportunity !== null);
  const coverage = known.reduce((n, p) => n + p.weight, 0);
  return {
    score: coverage
      ? Math.round(
          (100 * known.reduce((n, p) => n + p.weight * p.opportunity!, 0)) /
            coverage,
        )
      : null,
    coverage,
    parts,
  };
}
export function median(values: number[]): number | null {
  const sorted = values
    .filter((n) => Number.isFinite(n) && n >= 0)
    .sort((a, b) => a - b);
  const i = Math.floor(sorted.length / 2);
  return sorted.length
    ? sorted.length % 2
      ? sorted[i]
      : (sorted[i - 1] + sorted[i]) / 2
    : null;
}

export type PaidPlan = "starter" | "growth" | "agency";
export type BillingInterval = "monthly" | "yearly";
export const PLANS = [
  {
    key: "starter",
    name: "Starter",
    monthly: 30,
    yearly: 200,
    audits: 100,
    description: "Build a focused prospecting habit.",
  },
  {
    key: "growth",
    name: "Growth",
    monthly: 200,
    yearly: 799,
    audits: 500,
    description: "Research more markets, consistently.",
  },
  {
    key: "agency",
    name: "Agency",
    monthly: 500,
    yearly: 1199,
    audits: 2000,
    description: "Room for a busy agency pipeline.",
  },
] as const;
export const dollars = (amount: number) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: Number.isInteger(amount) ? 0 : 2,
  }).format(amount);
export function planDetails(key: PaidPlan) {
  return PLANS.find((plan) => plan.key === key)!;
}

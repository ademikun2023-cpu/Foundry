import { PLANS, type BillingInterval, type PaidPlan } from "./plans";
export type Currency = "NGN" | "USD";
export function billingAmount(
  plan: PaidPlan,
  interval: BillingInterval,
  currency: Currency,
) {
  if (currency === "USD")
    return PLANS.find((p) => p.key === plan)![interval] * 100;
  const raw =
    process.env[
      `PAYSTACK_PRICE_NGN_${plan.toUpperCase()}_${interval.toUpperCase()}`
    ];
  if (!raw || !/^\d+$/.test(raw)) return null;
  const amount = Number(raw);
  return Number.isSafeInteger(amount) && amount >= 5000 && amount <= 2147483647
    ? amount
    : null;
}
export function providerCode(
  plan: PaidPlan,
  interval: BillingInterval,
  currency: Currency,
) {
  return (
    process.env[
      `PAYSTACK_PLAN_${currency}_${plan.toUpperCase()}_${interval.toUpperCase()}`
    ] ||
    (currency === "USD"
      ? process.env[
          `PAYSTACK_PLAN_${plan.toUpperCase()}_${interval.toUpperCase()}`
        ]
      : undefined)
  );
}
export function currencyEnabled(currency: Currency) {
  return process.env[`PAYSTACK_${currency}_ENABLED`] === "true";
}
export function publicBillingCatalog() {
  return {
    currencies: (["NGN", "USD"] as const).map((currency) => ({
      currency,
      enabled: currencyEnabled(currency),
      prices: PLANS.map((p) => ({
        plan: p.key,
        monthly: billingAmount(p.key, "monthly", currency),
        yearly: billingAmount(p.key, "yearly", currency),
      })),
    })),
  };
}

"use client";
import { useEffect, useState } from "react";
import type { Currency } from "@/lib/billing-catalog";
import { ArrowRight, Check } from "lucide-react";
import ChoiceGroup from "./choice-group";
import {
  PLANS,
  type BillingInterval,
  type PaidPlan,
} from "@/lib/plans";

export function PricingCards({
  interval,
  onInterval,
  onChoose,
  currentPlan,
  disabled = false,
  available = true,
}: {
  interval: BillingInterval;
  onInterval: (value: BillingInterval) => void;
  onChoose?: (plan: PaidPlan, currency: Currency) => void;
  currentPlan?: string;
  disabled?: boolean;
  available?: boolean;
}) {
  const [currency, setCurrency] = useState<Currency>("USD");
  const [catalog, setCatalog] = useState<
    {
      currency: Currency;
      enabled: boolean;
      prices: {
        plan: PaidPlan;
        monthly: number | null;
        yearly: number | null;
      }[];
    }[]
  >([]);
  useEffect(() => {
    let active = true;
    fetch("/api/billing/catalog")
      .then((r) => {
        if (!r.ok) throw new Error();
        return r.json();
      })
      .then((r) => {
        if (active) {
          setCatalog(r.currencies);
          if (
            r.currencies.find(
              (c: { currency: string; enabled: boolean }) =>
                c.currency === "NGN" && c.enabled,
            )
          )
            setCurrency("NGN");
        }
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);
  const selected = catalog.find((c) => c.currency === currency);
  const ready = available && Boolean(selected?.enabled);
  const amount = (plan: PaidPlan, period: BillingInterval) =>
    selected?.prices.find((p) => p.plan === plan)?.[period] ??
    (currency === "USD"
      ? PLANS.find((p) => p.key === plan)![period] * 100
      : null);
  const money = (value: number) =>
    new Intl.NumberFormat(currency === "NGN" ? "en-NG" : "en-US", {
      style: "currency",
      currency,
      maximumFractionDigits: value % 100 === 0 ? 0 : 2,
    }).format(value / 100);
  return (
    <>
      <div className="billing-controls">
        <ChoiceGroup<BillingInterval>
          label="Billing period"
          value={interval}
          onChange={onInterval}
          options={[
            { value: "monthly", label: "Monthly" },
            { value: "yearly", label: "Yearly", note: "Save more" },
          ]}
        />
        <ChoiceGroup<Currency>
          label="Billing currency"
          value={currency}
          onChange={setCurrency}
          options={[
            { value: "NGN", label: "₦ NGN" },
            { value: "USD", label: "$ USD" },
          ]}
        />
        <p role="status" aria-live="polite" aria-atomic="true">
          {currency} ·{" "}
          {interval === "yearly"
            ? "One payment for a full year."
            : "Billed each month."}
        </p>
      </div>
      <div className="plans plans-switch" key={`${currency}-${interval}`}>
        {PLANS.map((p) => (
          <article
            className={`plan ${p.key === "growth" ? "featured" : ""}`}
            key={p.key}
          >
            <div className="plan-heading">
              <span className="eyebrow">{p.name}</span>
              {p.key === "growth" && (
                <span className="plan-badge">For growing teams</span>
              )}
            </div>
            <h3 className="plan-price">
              {amount(p.key, interval) === null
                ? "Coming soon"
                : money(amount(p.key, interval)!)}
              <small> / {interval === "yearly" ? "year" : "month"}</small>
            </h3>
            <div className="plan-cost-note">
              {amount(p.key, interval) === null
                ? "Naira prices are coming soon."
                : interval === "yearly"
                  ? `${money(amount(p.key, "yearly")! / 12)} / month equivalent. Billed annually.`
                  : "Renews monthly. Cancel future renewals anytime."}
            </div>
            <p>{p.description}</p>
            <ul>
              <li>
                <Check size={15} />
                {p.audits.toLocaleString("en-US")} website audits / month
              </li>
              <li>
                <Check size={15} />
                {p.audits.toLocaleString("en-US")} business searches / month*
              </li>
              <li>
                <Check size={15} />
                Saved reports, pipeline and CSV export
              </li>
              <li>
                <Check size={15} />
                Personalized outreach templates
              </li>
            </ul>
            {onChoose ? (
              <button
                className={`btn full ${p.key === "growth" ? "primary" : ""}`}
                disabled={
                  disabled ||
                  !ready ||
                  amount(p.key, interval) === null ||
                  currentPlan === p.key
                }
                onClick={() => onChoose(p.key, currency)}
              >
                {currentPlan === p.key
                  ? "Current plan"
                  : ready
                    ? `Choose ${p.name}`
                    : "Payments coming soon"}
                <ArrowRight size={15} />
              </button>
            ) : (
              <a
                className={`btn full ${p.key === "growth" ? "primary" : ""}`}
                href={`/dashboard?view=settings&plan=${p.key}&interval=${interval}`}
              >
                Explore {p.name}
                <ArrowRight size={15} />
              </a>
            )}
          </article>
        ))}
      </div>
      <p className="pricing-footnote">
        Subscriptions renew {interval === "yearly" ? "yearly" : "monthly"}.
        Cancel future renewals in Manage billing. Monthly allowances reset on
        the first day of each month (UTC), including on yearly plans. *Business
        discovery is temporarily paused.
      </p>
    </>
  );
}

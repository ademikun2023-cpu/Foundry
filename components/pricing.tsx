"use client";
import { useState } from "react";
import { ArrowRight, Check } from "lucide-react";
import {
  PLANS,
  dollars,
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
  onChoose?: (plan: PaidPlan) => void;
  currentPlan?: string;
  disabled?: boolean;
  available?: boolean;
}) {
  return (
    <>
      <div className="billing-controls">
        <div
          className="billing-toggle"
          role="group"
          aria-label="Billing period"
        >
          <button
            type="button"
            aria-pressed={interval === "monthly"}
            onClick={() => onInterval("monthly")}
          >
            Monthly
          </button>
          <button
            type="button"
            aria-pressed={interval === "yearly"}
            onClick={() => onInterval("yearly")}
          >
            Yearly <span>Save more</span>
          </button>
        </div>
        <p>
          USD ·{" "}
          {interval === "yearly"
            ? "One payment for a full year."
            : "Billed each month."}
        </p>
      </div>
      <div className="plans">
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
              {dollars(p[interval])}
              <small> / {interval === "yearly" ? "year" : "month"}</small>
            </h3>
            <div className="plan-cost-note">
              {interval === "yearly"
                ? `${dollars(p.yearly / 12)} / month equivalent · save ${dollars(p.monthly * 12 - p.yearly)} a year`
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
                disabled={disabled || !available || currentPlan === p.key}
                onClick={() => onChoose(p.key)}
              >
                {currentPlan === p.key
                  ? "Current plan"
                  : available
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

export default function LandingPricing() {
  const [interval, setInterval] = useState<BillingInterval>("monthly");
  return (
    <section id="pricing" className="landing-pricing">
      <div className="wrap">
        <div className="section-tag">Simple, transparent pricing</div>
        <h2>Find your next stage of growth.</h2>
        <p className="pricing-intro">
          Choose your pace. Every plan starts with evidence.
        </p>
        <PricingCards interval={interval} onInterval={setInterval} />
        <p className="pricing-status">
          Explore the free sample workspace today. Paid subscriptions open when
          checkout is ready.
        </p>
      </div>
    </section>
  );
}

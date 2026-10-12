import Stripe from "stripe";
import { ApiError } from "./server";
import type { Plan } from "./types";
export function stripeClient() {
  if (!process.env.STRIPE_SECRET_KEY)
    throw new ApiError(503, "Billing is not connected yet.");
  return new Stripe(process.env.STRIPE_SECRET_KEY);
}
export function priceFor(plan: Exclude<Plan, "free">) {
  const price = process.env[`STRIPE_PRICE_${plan.toUpperCase()}`];
  if (!price) throw new ApiError(503, "This plan is not available yet.");
  return price;
}
export function planFor(price: string): Plan {
  for (const plan of ["starter", "growth", "agency"] as const) {
    if (process.env[`STRIPE_PRICE_${plan.toUpperCase()}`] === price)
      return plan;
  }
  return "free";
}
export function appOrigin() {
  if (!process.env.APP_URL)
    throw new ApiError(503, "Application URL is not configured.");
  return new URL(process.env.APP_URL).origin;
}

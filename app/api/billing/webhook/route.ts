import type Stripe from "stripe";
import { adminDb, fail, json, ApiError } from "@/lib/server";
import { planFor, stripeClient } from "@/lib/billing";
export const runtime = "nodejs";
export async function POST(req: Request) {
  try {
    if (!process.env.STRIPE_WEBHOOK_SECRET)
      throw new ApiError(503, "Webhook is not configured.");
    const signature = req.headers.get("stripe-signature");
    if (!signature) throw new ApiError(400, "Missing webhook signature.");
    const stripe = stripeClient();
    let event: Stripe.Event;
    try {
      event = stripe.webhooks.constructEvent(
        await req.text(),
        signature,
        process.env.STRIPE_WEBHOOK_SECRET,
      );
    } catch {
      throw new ApiError(400, "Invalid webhook signature.");
    }
    const relevant = [
      "customer.subscription.created",
      "customer.subscription.updated",
      "customer.subscription.deleted",
    ];
    if (!relevant.includes(event.type)) return json({ received: true });
    const object = event.data.object as Stripe.Subscription;
    // Fetch the current state instead of trusting potentially out-of-order payloads.
    const subscription = await stripe.subscriptions.retrieve(object.id);
    const customer =
      typeof subscription.customer === "string"
        ? subscription.customer
        : subscription.customer.id;
    const item = subscription.items.data[0];
    const plan = ["active", "trialing"].includes(subscription.status)
      ? planFor(item?.price.id || "")
      : "free";
    const periodEnd = item?.current_period_end;
    const admin = adminDb();
    const { data: account, error: accountError } = await admin
      .from("accounts")
      .select("user_id")
      .eq("stripe_customer_id", customer)
      .maybeSingle();
    if (accountError) throw new Error("Account lookup failed");
    if (!account) return json({ received: true });
    const { error } = await admin.rpc("apply_subscription", {
      event_id: event.id,
      event_time: event.created,
      customer,
      subscription: subscription.id,
      new_plan: plan,
      new_status: subscription.status,
      expires_at: periodEnd ? new Date(periodEnd * 1000).toISOString() : null,
    });
    if (error) throw new Error("Subscription update failed");
    return json({ received: true });
  } catch (e) {
    return fail(e);
  }
}

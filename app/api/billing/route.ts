import { z } from "zod";
import {
  ApiError,
  adminDb,
  authenticate,
  json,
  quota,
  readBody,
  route,
} from "@/lib/server";
import { appOrigin, priceFor, stripeClient } from "@/lib/billing";
export async function POST(req: Request) {
  return route(req, async () => {
    const { db, user } = await authenticate(req);
    const { action, plan } = await readBody(
      req,
      z.object({
        action: z.enum(["checkout", "portal"]),
        plan: z.enum(["starter", "growth", "agency"]).optional(),
      }),
    );
    const stripe = stripeClient();
    if (!process.env.STRIPE_WEBHOOK_SECRET)
      throw new ApiError(
        503,
        "Billing webhooks must be configured before checkout.",
      );
    const origin = appOrigin();
    await quota(db, "billing");
    const admin = adminDb();
    const { data, error } = await admin
      .from("accounts")
      .select("stripe_customer_id")
      .eq("user_id", user.id)
      .single();
    if (error) throw new ApiError(503, "Billing account unavailable.");
    let customer = data.stripe_customer_id as string | null;
    if (!customer) {
      if (action === "portal")
        throw new ApiError(400, "There is no billing account to manage yet.");
      customer = (
        await stripe.customers.create(
          { email: user.email, metadata: { user_id: user.id } },
          { idempotencyKey: `foundry-customer-${user.id}` },
        )
      ).id;
      const { error: saveError } = await admin
        .from("accounts")
        .update({ stripe_customer_id: customer })
        .eq("user_id", user.id);
      if (saveError)
        throw new ApiError(503, "Could not save the billing account.");
    }
    if (action === "portal")
      return json({
        url: (
          await stripe.billingPortal.sessions.create({
            customer,
            return_url: `${origin}/dashboard?view=settings`,
          })
        ).url,
      });
    if (!plan) throw new ApiError(400, "Choose a plan.");
    const subscriptions = await stripe.subscriptions.list({
      customer,
      status: "all",
      limit: 100,
    });
    if (
      subscriptions.data.some((s) =>
        [
          "active",
          "trialing",
          "past_due",
          "unpaid",
          "incomplete",
          "paused",
        ].includes(s.status),
      )
    )
      throw new ApiError(
        409,
        "An existing subscription needs attention. Use Manage billing to change or resume it.",
      );
    // Reuse any open checkout so switching tabs cannot create duplicate subscriptions.
    const open = await stripe.checkout.sessions.list({
      customer,
      status: "open",
      limit: 1,
    });
    if (open.data[0]?.url) return json({ url: open.data[0].url });
    const session = await stripe.checkout.sessions.create(
      {
        mode: "subscription",
        customer,
        line_items: [{ price: priceFor(plan), quantity: 1 }],
        client_reference_id: user.id,
        subscription_data: { metadata: { user_id: user.id } },
        success_url: `${origin}/dashboard?view=settings&checkout=success`,
        cancel_url: `${origin}/dashboard?view=settings&checkout=cancelled`,
      },
      {
        idempotencyKey: `foundry-checkout-${user.id}-${Math.floor(Date.now() / 900000)}`,
      },
    );
    return json({ url: session.url });
  });
}

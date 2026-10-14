import { randomUUID } from "node:crypto";
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
import { appOrigin } from "@/lib/billing";
import {
  billingReady,
  confirmPayment,
  paymentUrl,
  paystack,
  verifyPlan,
} from "@/lib/paystack";
import { planDetails } from "@/lib/plans";
export const runtime = "nodejs";
export async function POST(req: Request) {
  return route(req, async () => {
    const { db, user } = await authenticate(req);
    const input = await readBody(
      req,
      z.object({
        action: z.enum(["checkout", "portal", "verify"]),
        plan: z.enum(["starter", "growth", "agency"]).optional(),
        interval: z.enum(["monthly", "yearly"]).default("monthly"),
        reference: z
          .string()
          .regex(/^[a-zA-Z0-9.=-]{1,150}$/)
          .optional(),
      }),
    );
    if (!process.env.PAYSTACK_SECRET_KEY)
      throw new ApiError(503, "Paystack is not connected yet.");
    await quota(db, "billing");
    if (input.action === "verify") {
      if (!input.reference)
        throw new ApiError(400, "Missing payment reference.");
      return json(await confirmPayment(input.reference, user.id));
    }
    const admin = adminDb();
    if (input.action === "portal") {
      const { data, error } = await admin
        .from("accounts")
        .select("paystack_subscription_code")
        .eq("user_id", user.id)
        .single();
      if (error) throw new ApiError(503, "Billing account unavailable.");
      if (!data.paystack_subscription_code)
        throw new ApiError(
          409,
          "No linked subscription yet. If you just paid, allow a moment for confirmation.",
        );
      const result = await paystack<{ link: string }>(
        `/subscription/${encodeURIComponent(data.paystack_subscription_code)}/manage/link`,
      );
      return json({ url: paymentUrl(result.link, true) });
    }
    if (!billingReady())
      throw new ApiError(503, "Paid subscriptions are not open yet.");
    if (!input.plan || !user.email || !user.email_confirmed_at)
      throw new ApiError(
        400,
        "Choose a plan and sign in with a verified email.",
      );
    const code = await verifyPlan(input.plan, input.interval);
    const { data: checkout, error } = await admin.rpc(
      "reserve_paystack_checkout",
      {
        account_id: user.id,
        new_reference: `foundry-${randomUUID()}`,
        provider_plan: code,
        new_plan: input.plan,
        new_interval: input.interval,
        customer_email: user.email,
      },
    );
    if (error || !checkout)
      throw new ApiError(503, "Could not reserve a checkout. Please retry.");
    if (checkout.error) throw new ApiError(409, checkout.error);
    if (checkout.plan_code !== code)
      throw new ApiError(
        409,
        "A checkout is already open for another plan. Select that plan to resume it.",
      );
    if (checkout.authorization_url)
      return json({ url: paymentUrl(checkout.authorization_url) });
    if (!checkout.fresh)
      throw new ApiError(
        409,
        "Checkout is still being prepared. Retry shortly. If this continues, contact support before starting another payment.",
      );
    // Do not release on timeout: the provider may have created the transaction.
    const result = await paystack<{
      authorization_url: string;
      reference: string;
    }>("/transaction/initialize", {
      email: user.email,
      amount: String(planDetails(input.plan)[input.interval] * 100),
      currency: "USD",
      reference: checkout.reference,
      plan: code,
      channels: ["card"],
      callback_url: `${appOrigin()}/dashboard?view=settings&checkout=return`,
    });
    if (result.reference !== checkout.reference)
      throw new ApiError(502, "Checkout reference mismatch.");
    const url = paymentUrl(result.authorization_url);
    const { error: saveError } = await admin
      .from("paystack_checkouts")
      .update({ authorization_url: url })
      .eq("reference", checkout.reference);
    if (saveError)
      throw new ApiError(
        503,
        "Checkout could not be saved. Contact support before retrying payment.",
      );
    return json({ url });
  });
}

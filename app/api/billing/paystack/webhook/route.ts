import { ApiError, fail, json } from "@/lib/server";
import {
  confirmPayment,
  syncSubscription,
  validSignature,
} from "@/lib/paystack";
export const runtime = "nodejs";
export async function POST(req: Request) {
  try {
    if (!process.env.PAYSTACK_SECRET_KEY)
      throw new ApiError(503, "Webhook is not configured.");
    const reader = req.body?.getReader();
    if (!reader) throw new ApiError(400, "Missing payload.");
    const chunks: Uint8Array[] = [];
    let size = 0;
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > 131072) {
        await reader.cancel();
        throw new ApiError(413, "Payload too large.");
      }
      chunks.push(value);
    }
    const raw = Buffer.concat(chunks);
    if (!validSignature(raw, req.headers.get("x-paystack-signature")))
      throw new ApiError(400, "Invalid webhook signature.");
    let event;
    try {
      event = JSON.parse(raw.toString("utf8"));
      if (!event || typeof event.event !== "string") throw new Error();
    } catch {
      throw new ApiError(400, "Invalid payload.");
    }
    if (event.event === "charge.success") {
      // Shared Paystack accounts can also receive payments unrelated to Foundry.
      const reference = event.data?.reference;
      if (
        typeof reference === "string" &&
        /^[a-zA-Z0-9.=-]{1,150}$/.test(reference)
      )
        await confirmPayment(reference);
    } else if (
      [
        "subscription.create",
        "subscription.not_renew",
        "subscription.disable",
        "invoice.payment_failed",
        "invoice.update",
      ].includes(event.event)
    ) {
      const code =
        event.data?.subscription_code ||
        event.data?.subscription?.subscription_code;
      if (typeof code === "string" && /^SUB_[a-zA-Z0-9]+$/.test(code))
        await syncSubscription(code);
    }
    return json({ received: true });
  } catch (error) {
    return fail(error);
  }
}

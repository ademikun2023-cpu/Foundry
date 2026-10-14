import { createHmac, timingSafeEqual } from "node:crypto";
import { adminDb, ApiError } from "./server";
import {
  PLANS,
  planDetails,
  type BillingInterval,
  type PaidPlan,
} from "./plans";

export function planCode(plan: PaidPlan, interval: BillingInterval) {
  const code =
    process.env[
      `PAYSTACK_PLAN_${plan.toUpperCase()}_${interval.toUpperCase()}`
    ];
  if (!code || !/^PLN_[a-zA-Z0-9]+$/.test(code))
    throw new ApiError(503, "This subscription is not configured yet.");
  return code;
}
export function billingReady() {
  return Boolean(
    process.env.PAYSTACK_BILLING_ENABLED === "true" &&
    process.env.PAYSTACK_SECRET_KEY &&
    process.env.APP_URL &&
    PLANS.every((p) =>
      ["monthly", "yearly"].every(
        (i) =>
          process.env[
            `PAYSTACK_PLAN_${p.key.toUpperCase()}_${i.toUpperCase()}`
          ],
      ),
    ),
  );
}
export function configuredPlan(code: string) {
  for (const p of PLANS)
    for (const interval of ["monthly", "yearly"] as const) {
      if (
        process.env[
          `PAYSTACK_PLAN_${p.key.toUpperCase()}_${interval.toUpperCase()}`
        ] === code
      )
        return { plan: p.key, interval, amount: p[interval] * 100 };
    }
  return null;
}
export async function paystack<T>(path: string, body?: unknown): Promise<T> {
  if (!process.env.PAYSTACK_SECRET_KEY)
    throw new ApiError(503, "Paystack is not connected yet.");
  let response: Response;
  try {
    response = await fetch(`https://api.paystack.co${path}`, {
      method: body ? "POST" : "GET",
      headers: {
        Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`,
        "Content-Type": "application/json",
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
      cache: "no-store",
      signal: AbortSignal.timeout(15000),
    });
  } catch {
    throw new ApiError(
      502,
      "Paystack is temporarily unavailable. Please retry shortly.",
    );
  }
  const result = await response.json().catch(() => null);
  if (!response.ok || !result?.status || !result.data)
    throw new ApiError(
      502,
      "Paystack could not complete this request. Please retry or contact support.",
    );
  return result.data as T;
}
export function paymentUrl(value: string, portal = false) {
  const url = new URL(value);
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    url.port ||
    (portal
      ? url.hostname !== "paystack.com" ||
        !url.pathname.startsWith("/manage/subscriptions/")
      : url.hostname !== "checkout.paystack.com")
  )
    throw new ApiError(
      502,
      "The payment provider returned an unexpected checkout address.",
    );
  return url.href;
}
export function validSignature(raw: Buffer, signature: string | null) {
  if (
    !process.env.PAYSTACK_SECRET_KEY ||
    !signature ||
    !/^[a-f0-9]{128}$/i.test(signature)
  )
    return false;
  const expected = createHmac("sha512", process.env.PAYSTACK_SECRET_KEY)
    .update(raw)
    .digest();
  return timingSafeEqual(expected, Buffer.from(signature, "hex"));
}
type ProviderPlan = {
  plan_code: string;
  amount: number;
  currency: string;
  interval: string;
};
export async function verifyPlan(plan: PaidPlan, interval: BillingInterval) {
  const code = planCode(plan, interval);
  const remote = await paystack<ProviderPlan>(
    `/plan/${encodeURIComponent(code)}`,
  );
  if (
    remote.plan_code !== code ||
    remote.amount !== planDetails(plan)[interval] * 100 ||
    remote.currency !== "USD" ||
    remote.interval !== (interval === "yearly" ? "annually" : "monthly")
  )
    throw new ApiError(
      503,
      "This plan's checkout configuration does not match the advertised USD price.",
    );
  return code;
}
export type Transaction = {
  reference: string;
  status: string;
  amount: number;
  currency: string;
  paid_at: string;
  customer: { customer_code: string; email?: string };
  plan_object?: { plan_code?: string };
  plan?: string | { plan_code?: string };
};
export function transactionPlan(tx: Transaction) {
  return (
    tx.plan_object?.plan_code ||
    (typeof tx.plan === "string" ? tx.plan : tx.plan?.plan_code) ||
    ""
  );
}
export function validatePayment(
  tx: Transaction,
  reference: string,
  code: string,
) {
  const configured = configuredPlan(code);
  if (
    tx.reference !== reference ||
    tx.status !== "success" ||
    !configured ||
    transactionPlan(tx) !== code ||
    tx.currency !== "USD" ||
    tx.amount !== configured.amount ||
    !tx.customer?.customer_code ||
    !Number.isFinite(Date.parse(tx.paid_at)) ||
    Date.parse(tx.paid_at) > Date.now() + 300000
  )
    throw new ApiError(
      409,
      "Payment has not been confirmed for the selected USD subscription.",
    );
  return configured;
}
export async function confirmPayment(reference: string, owner?: string) {
  const admin = adminDb();
  const { data: checkout, error } = await admin
    .from("paystack_checkouts")
    .select("user_id,plan_code,email")
    .eq("reference", reference)
    .maybeSingle();
  if (error) throw new ApiError(503, "Payment records are unavailable.");
  if (owner && (!checkout || checkout.user_id !== owner))
    throw new ApiError(404, "Payment reference not found.");
  const tx = await paystack<Transaction>(
    `/transaction/verify/${encodeURIComponent(reference)}`,
  );
  const code = transactionPlan(tx);
  if (!checkout && !configuredPlan(code)) return { ignored: true };
  const selected = validatePayment(tx, reference, checkout?.plan_code || code);
  let userId = checkout?.user_id;
  if (checkout) {
    if (tx.customer.email?.toLowerCase() !== checkout.email.toLowerCase())
      throw new ApiError(409, "Payment customer does not match the checkout.");
  } else {
    // Renewals have fresh references. Bind them to an already verified customer and plan.
    const { data: account, error: lookupError } = await admin
      .from("accounts")
      .select("user_id,paystack_subscription_code")
      .eq("paystack_customer_code", tx.customer.customer_code)
      .eq("paystack_plan_code", code)
      .maybeSingle();
    if (lookupError || !account?.paystack_subscription_code)
      throw new ApiError(
        503,
        "Waiting for the subscription record. This event can be retried.",
      );
    userId = account.user_id;
  }
  const { error: saveError } = await admin.rpc("apply_paystack_payment", {
    payment_reference: reference,
    account_id: userId,
    customer_code: tx.customer.customer_code,
    provider_plan: code,
    new_plan: selected.plan,
    new_interval: selected.interval,
    paid_amount: tx.amount,
    paid_currency: tx.currency,
    paid_at: tx.paid_at,
  });
  if (saveError)
    throw new ApiError(
      503,
      "Payment received; account synchronization is pending. Please retry shortly.",
    );
  return { verified: true };
}
export type Subscription = {
  subscription_code: string;
  status: string;
  customer: { customer_code: string };
  plan: ProviderPlan;
};
export async function syncSubscription(code: string) {
  const current = await paystack<Subscription>(
    `/subscription/${encodeURIComponent(code)}`,
  );
  if (
    current.subscription_code !== code ||
    !configuredPlan(current.plan.plan_code)
  )
    return;
  const admin = adminDb();
  const { data, error } = await admin
    .from("accounts")
    .select("user_id,paystack_subscription_code")
    .eq("paystack_customer_code", current.customer.customer_code)
    .eq("paystack_plan_code", current.plan.plan_code)
    .maybeSingle();
  if (error || !data)
    throw new ApiError(
      503,
      "Waiting for verified payment before linking the subscription.",
    );
  if (
    data.paystack_subscription_code &&
    data.paystack_subscription_code !== code
  )
    throw new ApiError(
      409,
      "A different subscription is already linked to this account.",
    );
  const { error: saveError } = await admin
    .from("accounts")
    .update({
      paystack_subscription_code: code,
      paystack_status: current.status,
    })
    .eq("user_id", data.user_id);
  if (saveError)
    throw new ApiError(503, "Subscription synchronization is pending.");
  // Cancellation stops renewal at Paystack; paid access remains until its expiry.
}

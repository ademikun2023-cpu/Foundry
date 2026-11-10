import { ApiError, authenticate, json, route } from "@/lib/server";
export async function GET(req: Request) {
  return route(req, async () => {
    const { db, user } = await authenticate(req);
    const { data, error } = await db.rpc("get_account");
    if (error)
      throw new ApiError(
        503,
        "Account data is unavailable. Check the database migration.",
      );
    const { data: billing, error: billingError } = await db
      .from("accounts")
      .select(
        "billing_interval,paystack_status,subscription_expires_at,paystack_subscription_code",
      )
      .eq("user_id", user.id)
      .single();
    if (billingError)
      throw new ApiError(
        503,
        "Subscription details are temporarily unavailable.",
      );
    return json({
      ...data,
      billingInterval: billing.billing_interval,
      renewalStatus: billing.paystack_status,
      paidUntil: billing.subscription_expires_at,
      hasSubscription: Boolean(billing.paystack_subscription_code),
    });
  });
}

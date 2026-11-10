import { publicBillingCatalog } from "@/lib/billing-catalog";
import { billingReady } from "@/lib/paystack";
import { json } from "@/lib/server";
export function GET() {
  const catalog = publicBillingCatalog();
  return json({
    currencies: catalog.currencies.map((c) => ({
      ...c,
      enabled: billingReady(c.currency),
    })),
  });
}

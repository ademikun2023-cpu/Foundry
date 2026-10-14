import { billingReady } from "@/lib/paystack";
import { configuredAuth, json } from "@/lib/server";
export function GET() {
  const auth = configuredAuth();
  return json({
    auth,
    search: Boolean(
      auth &&
      process.env.SUPABASE_SERVICE_ROLE_KEY &&
      process.env.GOOGLE_PLACES_API_KEY &&
      process.env.GOOGLE_PLACES_ENABLED === "true",
    ),
    audits: Boolean(auth && process.env.SUPABASE_SERVICE_ROLE_KEY),
    ai: Boolean(process.env.ANTHROPIC_API_KEY && process.env.ANTHROPIC_MODEL),
    billing: Boolean(
      auth && process.env.SUPABASE_SERVICE_ROLE_KEY && billingReady(),
    ),
  });
}

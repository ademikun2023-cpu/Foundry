import { createHmac, timingSafeEqual } from "node:crypto";
import type { Business } from "./types";
import { ApiError } from "./server";
function key() {
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY)
    throw new ApiError(503, "Server configuration is incomplete.");
  return process.env.SUPABASE_SERVICE_ROLE_KEY;
}
export function signBusiness(
  business: Business,
  userId: string,
  now = Date.now(),
): string {
  const { sourceToken: _, ...record } = business;
  const payload = Buffer.from(
    JSON.stringify({ business: record, userId, expires: now + 30 * 60 * 1000 }),
  ).toString("base64url");
  const signature = createHmac("sha256", key())
    .update("foundry-search-v1:" + payload)
    .digest("base64url");
  return `${payload}.${signature}`;
}
export function verifiedBusiness(
  token: string,
  userId: string,
  now = Date.now(),
): Business {
  try {
    const [payload, signature, extra] = token.split(".");
    if (!payload || !signature || extra) throw new Error();
    const expected = createHmac("sha256", key())
      .update("foundry-search-v1:" + payload)
      .digest();
    const received = Buffer.from(signature, "base64url");
    if (
      expected.length !== received.length ||
      !timingSafeEqual(expected, received)
    )
      throw new Error();
    const data = JSON.parse(Buffer.from(payload, "base64url").toString());
    if (data.userId !== userId || data.expires < now) throw new Error();
    return data.business;
  } catch {
    throw new ApiError(
      400,
      "This search result has expired or changed. Run the search again.",
    );
  }
}

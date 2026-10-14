import {
  ApiError,
  adminDb,
  authenticate,
  json,
  quota,
  readBody,
  route,
} from "@/lib/server";
import { businessSchema } from "@/lib/validation";
import { runAudit } from "@/lib/audit";
import { parsePublicUrl } from "@/lib/safe-fetch";
import { verifiedBusiness } from "@/lib/search-proof";
export const runtime = "nodejs";
export const maxDuration = 60;
export async function GET(req: Request) {
  return route(req, async () => {
    const { db } = await authenticate(req);
    const { data, error } = await db
      .from("audits")
      .select("payload,stage,notes,outreach")
      .order("created_at", { ascending: false })
      .limit(500);
    if (error)
      throw new ApiError(
        503,
        "Saved audits are unavailable. Check the database migration.",
      );
    return json({
      audits: data.map((a) => ({
        ...a.payload,
        stage: a.stage,
        notes: a.notes,
        outreach: a.outreach,
      })),
    });
  });
}
export async function POST(req: Request) {
  return route(req, async () => {
    const { db, user } = await authenticate(req);
    const input = await readBody(req, businessSchema);
    // Only server-signed search records can supply claims attributed to Google.
    const business = input.sourceToken
      ? verifiedBusiness(input.sourceToken, user.id)
      : { name: input.name, website: input.website };
    if (business.website) {
      try {
        parsePublicUrl(business.website);
      } catch {
        throw new ApiError(
          400,
          "Enter a public HTTP or HTTPS website on a standard port.",
        );
      }
    }
    await quota(db, "audit");
    const audit = await runAudit(business);
    const { error } = await adminDb()
      .from("audits")
      .insert({ id: audit.id, user_id: user.id, payload: audit });
    if (error)
      throw new ApiError(
        503,
        "The audit ran but could not be saved. Check database access before retrying.",
      );
    return json({ audit }, 201);
  });
}

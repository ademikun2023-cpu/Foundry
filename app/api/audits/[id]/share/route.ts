import { randomBytes } from "node:crypto";
import { z } from "zod";
import { adminDb, ApiError, authenticate, json, route } from "@/lib/server";
import { defaultProfile, type Audit } from "@/lib/types";
import { publicAudit } from "@/lib/report";
type Context = { params: Promise<{ id: string }> };
async function owned(req: Request, ctx: Context) {
  const { id } = await ctx.params;
  if (!z.uuid().safeParse(id).success)
    throw new ApiError(400, "Invalid audit ID.");
  const { db, user } = await authenticate(req);
  const { data, error } = await db
    .from("audits")
    .select("payload")
    .eq("id", id)
    .single();
  if (error || !data) throw new ApiError(404, "Audit not found.");
  return { id, db, user, audit: data.payload as Audit };
}
export async function GET(req: Request, ctx: Context) {
  return route(req, async () => {
    const { id, db } = await owned(req, ctx);
    const { data, error } = await db
      .from("report_shares")
      .select("token,expires_at")
      .eq("audit_id", id)
      .gt("expires_at", new Date().toISOString())
      .maybeSingle();
    if (error) throw new ApiError(503, "Sharing details are unavailable.");
    return json({
      share: data
        ? { path: `/reports/${data.token}`, expiresAt: data.expires_at }
        : null,
    });
  });
}
export async function POST(req: Request, ctx: Context) {
  return route(req, async () => {
    const { id, db, user, audit } = await owned(req, ctx);
    const { data: profile, error: profileError } = await db
      .from("agency_profiles")
      .select("name,logo,service,tone")
      .maybeSingle();
    if (profileError)
      throw new ApiError(503, "Save your agency settings before sharing.");
    const token = randomBytes(32).toString("hex");
    const expiresAt = new Date(Date.now() + 30 * 86400000).toISOString();
    const { error } = await adminDb()
      .from("report_shares")
      .upsert(
        {
          audit_id: id,
          user_id: user.id,
          token,
          expires_at: expiresAt,
          snapshot: {
            audit: publicAudit(audit),
            profile: profile || defaultProfile,
          },
        },
        { onConflict: "audit_id" },
      );
    if (error) throw new ApiError(503, "The report link could not be created.");
    return json({ share: { path: `/reports/${token}`, expiresAt } });
  });
}
export async function DELETE(req: Request, ctx: Context) {
  return route(req, async () => {
    const { id, user } = await owned(req, ctx);
    const { error } = await adminDb()
      .from("report_shares")
      .delete()
      .eq("audit_id", id)
      .eq("user_id", user.id);
    if (error) throw new ApiError(503, "The link could not be revoked.");
    return json({ ok: true });
  });
}

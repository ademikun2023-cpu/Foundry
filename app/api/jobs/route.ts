import { after } from "next/server";
import { z } from "zod";
import {
  adminDb,
  ApiError,
  authenticate,
  json,
  readBody,
  route,
} from "@/lib/server";
import { parsePublicUrl } from "@/lib/safe-fetch";
import { processAuditJobs } from "@/lib/jobs";
export const runtime = "nodejs";
export const maxDuration = 300;
export async function GET(req: Request) {
  return route(req, async () => {
    const { db } = await authenticate(req);
    const { data, error } = await db
      .from("audit_jobs")
      .select(
        "id,business,status,error,audit_id,created_at,started_at,attempts",
      )
      .order("created_at", { ascending: false })
      .limit(30);
    if (error)
      throw new ApiError(
        503,
        "Your audit queue could not be loaded. Please retry.",
      );
    return json({ jobs: data });
  });
}
export async function POST(req: Request) {
  return route(req, async () => {
    const { db, user } = await authenticate(req);
    const input = await readBody(
      req,
      z.discriminatedUnion("action", [
        z.object({
          action: z.literal("create"),
          requestId: z.uuid(),
          businesses: z
            .array(
              z.object({
                name: z.string().trim().min(2).max(180),
                website: z.string().url().max(2048),
              }),
            )
            .min(1)
            .max(5),
        }),
        z.object({ action: z.literal("resume") }),
        z.object({ action: z.literal("retry"), id: z.uuid() }),
      ]),
    );
    if (input.action === "create") {
      for (const b of input.businesses) {
        try {
          parsePublicUrl(b.website);
        } catch {
          throw new ApiError(
            400,
            "Use a public HTTP or HTTPS website on a standard port.",
          );
        }
      }
      const { error } = await db.rpc("enqueue_audits", {
        request_id: input.requestId,
        businesses: input.businesses,
      });
      if (error) {
        const safe = [
          "Monthly allowance reached.",
          "Please wait a minute",
          "Wait for your current batch",
        ];
        throw new ApiError(
          error.code === "P0001" ? 429 : 503,
          safe.some((s) => error.message.startsWith(s))
            ? error.message
            : "The batch could not be queued. Please retry.",
        );
      }
    } else if (input.action === "retry") {
      const { data, error } = await adminDb()
        .from("audit_jobs")
        .update({ status: "queued", error: null })
        .eq("id", input.id)
        .eq("user_id", user.id)
        .eq("status", "failed")
        .lt("attempts", 3)
        .select("id");
      if (error || !data?.length)
        throw new ApiError(
          409,
          "This audit cannot be retried. Submit its website as a new audit.",
        );
    }
    after(() => processAuditJobs(user.id));
    return json({ queued: true }, 202);
  });
}

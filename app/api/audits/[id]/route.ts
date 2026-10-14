import { z } from "zod";
import { ApiError, authenticate, json, readBody, route } from "@/lib/server";
type Context = { params: Promise<{ id: string }> };
export async function PATCH(req: Request, context: Context) {
  return route(req, async () => {
    const { id } = await context.params;
    if (!z.uuid().safeParse(id).success)
      throw new ApiError(400, "Invalid audit ID.");
    const { db } = await authenticate(req);
    const body = await readBody(
      req,
      z.object({
        stage: z
          .enum(["New lead", "Contacted", "Interested", "Closed"])
          .optional(),
        notes: z.string().max(5000).optional(),
      }),
    );
    const { data, error } = await db
      .from("audits")
      .update(body)
      .eq("id", id)
      .select("id")
      .single();
    if (error || !data) throw new ApiError(404, "Audit not found.");
    return json({ ok: true });
  });
}
export async function DELETE(req: Request, context: Context) {
  return route(req, async () => {
    const { id } = await context.params;
    const { db } = await authenticate(req);
    const { data, error } = await db
      .from("audits")
      .delete()
      .eq("id", id)
      .select("id");
    if (error) throw new ApiError(500, "Could not delete audit.");
    if (!data?.length) throw new ApiError(404, "Audit not found.");
    return json({ ok: true });
  });
}

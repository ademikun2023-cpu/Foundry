import {
  createClient,
  type SupabaseClient,
  type User,
} from "@supabase/supabase-js";
import { z } from "zod";
export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
export function configuredAuth() {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  );
}
export function adminDb() {
  if (!configuredAuth() || !process.env.SUPABASE_SERVICE_ROLE_KEY)
    throw new ApiError(
      503,
      "Connect Supabase and apply the database migration to enable live accounts.",
    );
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}
export async function authenticate(
  req: Request,
): Promise<{ db: SupabaseClient; user: User }> {
  if (!configuredAuth())
    throw new ApiError(
      503,
      "Live accounts are not configured yet. You can explore the sample workspace.",
    );
  const token = req.headers.get("authorization")?.match(/^Bearer (.+)$/)?.[1];
  if (!token || token.length > 8192)
    throw new ApiError(401, "Sign in to continue.");
  const db = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      global: { headers: { Authorization: `Bearer ${token}` } },
      auth: { persistSession: false, autoRefreshToken: false },
    },
  );
  const { data, error } = await db.auth.getUser(token);
  if (error || !data.user)
    throw new ApiError(401, "Your session has expired. Please sign in again.");
  return { db, user: data.user };
}
export function checkOrigin(req: Request) {
  const origin = req.headers.get("origin");
  const expected = process.env.APP_URL
    ? new URL(process.env.APP_URL).origin
    : new URL(req.url).origin;
  if (origin && origin !== expected && origin !== new URL(req.url).origin)
    throw new ApiError(403, "Request origin is not allowed.");
}
export async function readBody<T>(
  req: Request,
  schema: z.ZodType<T>,
): Promise<T> {
  if (Number(req.headers.get("content-length")) > 16384)
    throw new ApiError(413, "Request is too large.");
  const reader = req.body?.getReader();
  if (!reader) throw new ApiError(400, "Missing request body.");
  let size = 0;
  const chunks: Uint8Array[] = [];
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > 16384) {
      await reader.cancel();
      throw new ApiError(413, "Request is too large.");
    }
    chunks.push(value);
  }
  try {
    return schema.parse(JSON.parse(Buffer.concat(chunks).toString("utf8")));
  } catch (e) {
    if (e instanceof z.ZodError)
      throw new ApiError(400, e.issues[0]?.message || "Invalid input.");
    throw new ApiError(400, "Invalid JSON body.");
  }
}
export async function quota(
  db: SupabaseClient,
  action: "search" | "audit" | "outreach" | "billing",
) {
  const { data, error } = await db.rpc("consume_usage", {
    requested_action: action,
  });
  if (error)
    throw new ApiError(
      503,
      "Usage tracking is unavailable. Check the database migration.",
    );
  if (!data?.allowed)
    throw new ApiError(
      429,
      data?.reason ||
        "Usage limit reached. Try again later or change your plan.",
    );
}
export function json(data: unknown, status = 200) {
  return Response.json(data, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}
export function fail(error: unknown) {
  if (error instanceof ApiError)
    return json({ error: error.message }, error.status);
  console.error(
    "Foundry request failed:",
    error instanceof Error ? error.name : "UnknownError",
  );
  return json(
    { error: "The request could not be completed. Please retry." },
    500,
  );
}
export async function route(req: Request, fn: () => Promise<Response>) {
  try {
    if (req.method !== "GET") checkOrigin(req);
    return await fn();
  } catch (e) {
    return fail(e);
  }
}

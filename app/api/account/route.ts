import { ApiError, authenticate, json, route } from "@/lib/server";
export async function GET(req: Request) {
  return route(req, async () => {
    const { db } = await authenticate(req);
    const { data, error } = await db.rpc("get_account");
    if (error)
      throw new ApiError(
        503,
        "Account data is unavailable. Check the database migration.",
      );
    return json(data);
  });
}

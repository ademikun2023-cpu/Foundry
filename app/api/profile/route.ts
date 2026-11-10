import { ApiError, authenticate, json, readBody, route } from "@/lib/server";
import { profileSchema } from "@/lib/agency";
import { defaultProfile } from "@/lib/types";
export async function GET(req: Request) {
  return route(req, async () => {
    const { db } = await authenticate(req);
    const { data, error } = await db
      .from("agency_profiles")
      .select("name,logo,service,tone")
      .maybeSingle();
    if (error)
      throw new ApiError(
        503,
        "Your agency settings could not be loaded. Please retry.",
      );
    return json({ profile: data || defaultProfile });
  });
}
export async function PUT(req: Request) {
  return route(req, async () => {
    const { db, user } = await authenticate(req);
    const profile = await readBody(req, profileSchema, 200000);
    const { error } = await db
      .from("agency_profiles")
      .upsert({ user_id: user.id, ...profile });
    if (error)
      throw new ApiError(
        503,
        "Your agency settings could not be saved. Please retry.",
      );
    return json({ profile });
  });
}

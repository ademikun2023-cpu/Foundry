import { adminDb } from "@/lib/server";
import { reportHtml } from "@/lib/report";
export const dynamic = "force-dynamic";
export async function GET(
  _req: Request,
  ctx: { params: Promise<{ token: string }> },
) {
  const { token } = await ctx.params;
  const headers = {
    "Content-Type": "text/html; charset=utf-8",
    "Cache-Control": "private, no-store",
    "X-Robots-Tag": "noindex, nofollow, noarchive",
    "Referrer-Policy": "no-referrer",
    "Content-Security-Policy":
      "default-src 'none'; style-src 'unsafe-inline'; img-src data:; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
  };
  if (!/^[a-f0-9]{64}$/.test(token))
    return new Response("Report not found.", { status: 404, headers });
  try {
    const { data, error } = await adminDb()
      .from("report_shares")
      .select("snapshot")
      .eq("token", token)
      .gt("expires_at", new Date().toISOString())
      .maybeSingle();
    if (error)
      return new Response("Report temporarily unavailable. Please retry.", {
        status: 503,
        headers,
      });
    if (!data)
      return new Response("This report link has expired or been revoked.", {
        status: 404,
        headers,
      });
    return new Response(
      reportHtml(
        data.snapshot.audit,
        data.snapshot.profile.name,
        data.snapshot.profile.logo,
      ),
      { headers },
    );
  } catch {
    return new Response("Report temporarily unavailable. Please retry.", {
      status: 503,
      headers,
    });
  }
}

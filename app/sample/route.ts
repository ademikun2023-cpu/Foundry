import { demoAudits } from "@/lib/demo";
import { reportHtml } from "@/lib/report";
export function GET() {
  return new Response(reportHtml(demoAudits()[0], "Your agency"), {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "X-Robots-Tag": "noindex",
      "Content-Security-Policy":
        "default-src 'none'; style-src 'unsafe-inline'; img-src data:; base-uri 'none'; form-action 'none'",
    },
  });
}

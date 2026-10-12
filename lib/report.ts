import type { Audit } from "./types";
export function escapeHtml(value: unknown) {
  return String(value ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ]!,
  );
}
export function reportHtml(a: Audit, agency: string) {
  const e = escapeHtml;
  return `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${e(a.business.name)} — Foundry audit</title><style>body{font:16px/1.65 system-ui,sans-serif;color:#242126;max-width:800px;margin:60px auto;padding:0 24px}h1{font-size:38px;letter-spacing:-1px;line-height:1.15}h2{margin-top:32px}h3{margin-bottom:8px}p{color:#5d5761}.tag{color:#b84c6d;font-weight:600}article{border-top:1px solid #ece7e9;padding:20px 0}small{color:#756d76}.score{background:#fbf0f3;padding:20px;border-radius:12px}footer{margin-top:50px;border-top:1px solid #ddd;padding-top:20px}@media print{body{margin:0}article{break-inside:avoid}}</style><body><div class="tag">${a.demo ? "FICTIONAL SAMPLE · " : ""}${e(agency)} / WEBSITE AUDIT</div><h1>${e(a.business.name)}</h1><p>${e(a.business.website)}<br>Checked ${e(new Date(a.createdAt).toISOString())}</p><div class="score"><strong>Opportunity score: ${a.scoring.score ?? "Unknown"} / 100</strong><br>Evidence coverage: ${a.scoring.coverage}%</div><h2>Findings and next steps</h2>${a.findings.map((f) => `<article><h3>${e(f.title)}</h3><p>${e(f.evidence)}</p><p><strong>Next step:</strong> ${e(f.action)}</p><small>Source: ${e(f.source)}</small></article>`).join("")}<h2>How the score works</h2><p>Weighted average over available checks, rescaled to 100. Missing evidence is excluded. Scores indicate research priority, not buying intent.</p>${a.scoring.parts.map((p) => `<p><strong>${e(p.label)} (${p.weight}% weight)</strong><br>${e(p.detail)}</p>`).join("")}<h2>Limitations</h2>${a.warnings.map((w) => `<p>${e(w)}</p>`).join("")}${a.business.mapsUrl ? `<p>Listing source: ${e(a.business.mapsUrl)}</p>` : ""}${a.business.attribution?.map((p) => `<p>${e(p)}</p>`).join("") || ""}<footer>Prepared with Foundry. Private prospect notes and outreach drafts are excluded.</footer></body></html>`;
}

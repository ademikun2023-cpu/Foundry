import type { Audit, Outreach } from "./types";
export function templateOutreach(
  audit: Audit,
  agency = "Your agency",
): Outreach {
  const evidence = audit.findings
    .filter((f) => f.severity === "opportunity")
    .slice(0, 2)
    .map((f) => f.evidence);
  const observation = evidence.length
    ? evidence.join(" ")
    : "I reviewed your public website and put together a short digital-presence audit.";
  return {
    subject: `A website observation for ${audit.business.name}`,
    email: `Hi ${audit.business.name} team,\n\n${observation}\n\nThese are a snapshot of the checks we could run, rather than a measurement of lost revenue. I have a short report with the evidence and a few practical next steps. Would you like me to send it over?\n\nBest,\n${agency}\n\nIf this is not relevant, let me know and I will not follow up.`,
    followUp: `Hi ${audit.business.name} team,\n\nJust following up on my note about your website. Happy to share the findings if useful. If now is not a good time, no problem.\n\nBest,\n${agency}`,
    source: "template",
  };
}

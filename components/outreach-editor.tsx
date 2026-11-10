"use client";
import { useEffect, useState } from "react";
import { Copy, Mail } from "lucide-react";
import type { AgencyProfile, Audit, AuditChanges, Outreach } from "@/lib/types";
export default function OutreachEditor({
  audit,
  profile,
  onDraft,
  onUpdate,
}: {
  audit: Audit;
  profile: AgencyProfile;
  onDraft: (
    a: Audit,
    options?: Pick<AgencyProfile, "service" | "tone">,
  ) => Promise<Outreach>;
  onUpdate: (id: string, changes: AuditChanges) => Promise<void>;
}) {
  const [draft, setDraft] = useState(audit.outreach),
    [service, setService] = useState(profile.service),
    [tone, setTone] = useState(profile.tone),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState(""),
    [error, setError] = useState("");
  useEffect(() => setDraft(audit.outreach), [audit.outreach]);
  async function action(fn: () => Promise<void>) {
    setBusy(true);
    setMessage("");
    setError("");
    try {
      await fn();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="report-body">
      <h3>A specific reason to reach out.</h3>
      <p className="muted-copy">
        Choose your service and tone. Review and edit the evidence before
        copying a message.
      </p>
      <div className="outreach-options">
        <label>
          Service you offer
          <input
            value={service}
            onChange={(e) => setService(e.target.value)}
            maxLength={160}
          />
        </label>
        <label>
          Tone
          <select
            value={tone}
            onChange={(e) => setTone(e.target.value as AgencyProfile["tone"])}
          >
            <option value="friendly">Friendly</option>
            <option value="direct">Direct</option>
          </select>
        </label>
      </div>
      <button
        className="btn primary"
        disabled={busy || service.trim().length < 2}
        onClick={() =>
          action(async () => {
            if (
              draft &&
              JSON.stringify(draft) !== JSON.stringify(audit.outreach) &&
              !confirm("Replace your unsaved draft edits?")
            )
              return;
            setDraft(await onDraft(audit, { service, tone }));
          })
        }
      >
        <Mail size={16} />
        {busy ? "Working…" : draft ? "Regenerate drafts" : "Generate drafts"}
      </button>
      {error && (
        <div role="alert" className="error">
          {error}
        </div>
      )}
      {message && (
        <div role="status" className="notice">
          {message}
        </div>
      )}
      {draft && (
        <>
          <div className="draft-meta">
            {draft.source === "ai"
              ? "AI-assisted draft"
              : "Evidence-based template"}{" "}
            · Nothing has been sent
          </div>
          <div className="stack-form">
            <label>
              Email subject
              <input
                value={draft.subject}
                maxLength={200}
                onChange={(e) =>
                  setDraft({ ...draft, subject: e.target.value })
                }
              />
            </label>
            <label>
              Email
              <textarea
                rows={10}
                maxLength={6000}
                value={draft.email}
                onChange={(e) => setDraft({ ...draft, email: e.target.value })}
              />
            </label>
            <button
              className="btn"
              disabled={busy}
              onClick={() =>
                action(async () => {
                  await navigator.clipboard.writeText(
                    `Subject: ${draft.subject}\n\n${draft.email}`,
                  );
                  setMessage("Email copied.");
                })
              }
            >
              <Copy size={15} />
              Copy email
            </button>
            <label>
              Short DM
              <textarea
                rows={4}
                maxLength={2000}
                value={draft.dm || ""}
                onChange={(e) => setDraft({ ...draft, dm: e.target.value })}
              />
            </label>
            <button
              className="btn"
              disabled={busy || !draft.dm}
              onClick={() =>
                action(async () => {
                  await navigator.clipboard.writeText(draft.dm!);
                  setMessage("DM copied.");
                })
              }
            >
              <Copy size={15} />
              Copy DM
            </button>
            <label>
              Follow-up
              <textarea
                rows={5}
                maxLength={4000}
                value={draft.followUp}
                onChange={(e) =>
                  setDraft({ ...draft, followUp: e.target.value })
                }
              />
            </label>
            <div className="button-row">
              <button
                className="btn"
                disabled={busy}
                onClick={() =>
                  action(async () => {
                    await navigator.clipboard.writeText(draft.followUp);
                    setMessage("Follow-up copied.");
                  })
                }
              >
                <Copy size={15} />
                Copy follow-up
              </button>
              <button
                className="btn primary"
                disabled={
                  busy ||
                  JSON.stringify(draft) === JSON.stringify(audit.outreach)
                }
                onClick={() =>
                  action(async () => {
                    await onUpdate(audit.id, { outreach: draft });
                    setMessage("Draft edits saved.");
                  })
                }
              >
                Save all edits
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

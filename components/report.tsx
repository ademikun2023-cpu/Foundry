"use client";
import { useEffect, useRef, useState } from "react";
import {
  ArrowUpRight,
  Check,
  Download,
  FileText,
  Mail,
  Printer,
  Trash2,
  X,
} from "lucide-react";
import ReportSharing from "./report-sharing";
import OutreachEditor from "./outreach-editor";
import type {
  AgencyProfile,
  AuditChanges,
  Audit,
  Outreach,
  Stage,
} from "@/lib/types";
import { STAGES } from "@/lib/types";
import { downloadFile } from "@/lib/client";
import { reportHtml } from "@/lib/report";
export default function Report({
  audit,
  onClose,
  onUpdate,
  onDelete,
  onDraft,
  agency,
  profile,
  onRetry,
}: {
  audit: Audit;
  onClose: () => void;
  onUpdate: (id: string, changes: AuditChanges) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  onDraft: (
    audit: Audit,
    options?: Pick<AgencyProfile, "service" | "tone">,
  ) => Promise<Outreach>;
  agency: string;
  profile: AgencyProfile;
  onRetry: (audit: Audit) => Promise<void>;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const [tab, setTab] = useState("evidence");
  const [notes, setNotes] = useState(audit.notes);
  const [followUpDate, setFollowUpDate] = useState(audit.followUpDate || "");
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  useEffect(() => {
    ref.current?.showModal();
  }, []);
  async function action(name: string, fn: () => Promise<unknown>) {
    setBusy(name);
    setError("");
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Action failed.");
    } finally {
      setBusy("");
    }
  }
  return (
    <dialog
      ref={ref}
      className="report-dialog"
      onCancel={onClose}
      aria-labelledby="report-title"
    >
      <div className="report-sheet">
        <div className="report-toolbar no-print">
          <span className="eyebrow">BUSINESS AUDIT</span>
          <div className="button-row">
            <button
              className="icon-btn"
              title="Download report"
              aria-label="Download HTML report"
              onClick={() =>
                downloadFile(
                  `foundry-audit-${audit.id}.html`,
                  reportHtml(audit, agency, profile.logo),
                  "text/html",
                )
              }
            >
              <Download size={17} />
            </button>
            <button
              className="icon-btn"
              title="Print or save as PDF"
              aria-label="Print or save as PDF"
              onClick={() => {
                const url = URL.createObjectURL(
                  new Blob([reportHtml(audit, agency, profile.logo)], {
                    type: "text/html",
                  }),
                );
                const win = window.open(url, "_blank");
                if (win)
                  win.addEventListener("load", () => win.print(), {
                    once: true,
                  });
                else
                  setError(
                    "Allow pop-ups to print the report, or download the HTML report and print it from your browser.",
                  );
                setTimeout(() => URL.revokeObjectURL(url), 60000);
              }}
            >
              <Printer size={17} />
            </button>
            <button
              className="icon-btn"
              aria-label="Close report"
              onClick={onClose}
            >
              <X size={20} />
            </button>
          </div>
        </div>
        {profile.logo && (
          <img
            className="report-agency-logo"
            src={profile.logo}
            alt={`${agency} logo`}
          />
        )}
        <header className="report-header">
          <div>
            <span className="eyebrow">
              {audit.demo ? "ILLUSTRATIVE SAMPLE" : "POINT-IN-TIME AUDIT"}
            </span>
            <h2 id="report-title">{audit.business.name}</h2>
            <p>
              {audit.business.address || "Website audit"} ·{" "}
              {new Date(audit.createdAt).toLocaleDateString()}
            </p>
            {audit.business.website && (
              <a
                href={audit.business.website}
                target="_blank"
                rel="noopener noreferrer"
                className="text-link"
              >
                {audit.business.website.replace(/^https?:\/\//, "")}{" "}
                <ArrowUpRight size={14} />
              </a>
            )}
          </div>
          <div className="report-score">
            <strong>{audit.scoring.score ?? "—"}</strong>
            <span>opportunity / 100</span>
            <small>{audit.scoring.coverage}% evidence coverage</small>
          </div>
        </header>
        <div
          className="tabs no-print"
          role="tablist"
          aria-label="Report sections"
        >
          {[
            ["evidence", "Evidence", FileText],
            ["outreach", "Outreach", Mail],
          ].map(([key, label, Icon]) => (
            <button
              key={String(key)}
              role="tab"
              aria-selected={tab === key}
              onClick={() => setTab(String(key))}
            >
              {typeof Icon !== "string" && <Icon size={16} />} {String(label)}
            </button>
          ))}
        </div>
        {error && (
          <div role="alert" className="error">
            {error}
          </div>
        )}
        {tab === "evidence" ? (
          <div className="report-body">
            <div className="report-metrics">
              <div>
                <span>Mobile performance</span>
                <strong>
                  {audit.metrics.performance ?? "—"}
                  <small>/100</small>
                </strong>
              </div>
              <div>
                <span>Lab LCP</span>
                <strong>
                  {audit.metrics.lcpMs !== null
                    ? (audit.metrics.lcpMs / 1000).toFixed(1)
                    : "—"}
                  <small>s</small>
                </strong>
              </div>
              <div>
                <span>Google reviews</span>
                <strong>{audit.metrics.reviewCount ?? "—"}</strong>
              </div>
            </div>
            {!audit.demo &&
              (audit.metrics.performance === null ||
                audit.metrics.booking === "unknown") && (
                <div className="retry-checks no-print">
                  <span>
                    Some checks are unavailable. Saved findings are preserved.
                  </span>
                  <button
                    className="btn small"
                    disabled={Boolean(busy)}
                    onClick={() => action("retry-checks", () => onRetry(audit))}
                  >
                    {busy === "retry-checks" ? "Retrying…" : "Run fresh checks"}
                  </button>
                </div>
              )}
            <h3>What we found</h3>
            <div className="finding-list">
              {audit.findings.map((f, i) => (
                <article key={i} className="finding">
                  <span className={`finding-marker ${f.severity}`}>
                    {f.severity === "good" ? <Check size={13} /> : i + 1}
                  </span>
                  <div>
                    <h4>{f.title}</h4>
                    <p>{f.evidence}</p>
                    <p className="finding-action">
                      <strong>Next step:</strong> {f.action}
                    </p>
                    <small>{f.source}</small>
                  </div>
                </article>
              ))}
            </div>
            <section className="score-explainer">
              <h3>A score you can inspect</h3>
              <p>
                Weighted opportunity across available checks. Missing checks are
                excluded and the remaining weights are rescaled. Compare scores
                alongside coverage.
              </p>
              {audit.scoring.parts.map((p) => (
                <div className="score-part" key={p.key}>
                  <div>
                    <strong>{p.label}</strong>
                    <span>
                      {p.weight}% weight ·{" "}
                      {p.opportunity === null
                        ? "Unknown"
                        : `${Math.round(p.opportunity * 100)}% opportunity`}
                    </span>
                  </div>
                  <div className="meter">
                    <i style={{ width: `${(p.opportunity ?? 0) * 100}%` }} />
                  </div>
                  <p>{p.detail}</p>
                </div>
              ))}
            </section>
            <section className="limitations">
              <h3>What to keep in mind</h3>
              {audit.warnings.map((w) => (
                <p key={w}>{w}</p>
              ))}
              {audit.metrics.socialLinks.length > 0 && (
                <p>
                  Public social links found:{" "}
                  {audit.metrics.socialLinks.map((link) => (
                    <a
                      key={link}
                      href={link}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      {new URL(link).hostname}{" "}
                    </a>
                  ))}
                </p>
              )}
              {audit.business.mapsUrl && (
                <p>
                  <a
                    href={audit.business.mapsUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    View listing on Google Maps ↗
                  </a>
                </p>
              )}
              {audit.business.attribution?.map((a) => (
                <p key={a}>{a}</p>
              ))}
            </section>
            <ReportSharing id={audit.id} demo={audit.demo} />
            <section className="prospect-edit no-print">
              <h3>Your next step</h3>
              <label>
                Pipeline stage
                <select
                  value={audit.stage}
                  disabled={Boolean(busy)}
                  onChange={(e) =>
                    action("stage", () =>
                      onUpdate(audit.id, { stage: e.target.value as Stage }),
                    )
                  }
                >
                  {STAGES.map((s) => (
                    <option key={s}>{s}</option>
                  ))}
                </select>
              </label>
              <label>
                Follow-up date
                <input
                  type="date"
                  value={followUpDate}
                  onChange={(e) => setFollowUpDate(e.target.value)}
                />
                <small>
                  Shown in your workspace reminders. No message is sent
                  automatically.
                </small>
              </label>
              <label>
                Private notes
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={3}
                  maxLength={5000}
                  placeholder="What would make a useful first conversation?"
                />
              </label>
              <div className="button-row spread">
                <button
                  className="btn"
                  disabled={
                    Boolean(busy) ||
                    (notes === audit.notes &&
                      followUpDate === (audit.followUpDate || ""))
                  }
                  onClick={() =>
                    action("save", () =>
                      onUpdate(audit.id, {
                        notes,
                        followUpDate: followUpDate || null,
                      }),
                    )
                  }
                >
                  {busy === "save" ? "Saving…" : "Save next step"}
                </button>
                <button
                  className="btn danger"
                  disabled={Boolean(busy)}
                  onClick={() => {
                    if (
                      confirm(
                        `Delete the saved audit for ${audit.business.name}? This cannot be undone.`,
                      )
                    )
                      action("delete", async () => {
                        await onDelete(audit.id);
                        onClose();
                      });
                  }}
                >
                  <Trash2 size={15} />
                  Delete audit
                </button>
              </div>
            </section>
          </div>
        ) : (
          <OutreachEditor
            audit={audit}
            profile={profile}
            onDraft={onDraft}
            onUpdate={onUpdate}
          />
        )}
        <footer className="report-footer">
          Prepared with Foundry · Evidence first.
        </footer>
      </div>
    </dialog>
  );
}

"use client";
import { useEffect, useRef, useState } from "react";
import {
  ArrowUpRight,
  Check,
  Copy,
  Download,
  FileText,
  LoaderCircle,
  Mail,
  Printer,
  Trash2,
  X,
} from "lucide-react";
import type { Audit, Outreach, Stage } from "@/lib/types";
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
}: {
  audit: Audit;
  onClose: () => void;
  onUpdate: (
    id: string,
    changes: { stage?: Stage; notes?: string },
  ) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  onDraft: (audit: Audit) => Promise<Outreach>;
  agency: string;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const [tab, setTab] = useState("evidence");
  const [notes, setNotes] = useState(audit.notes);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
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
                  reportHtml(audit, agency),
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
              onClick={() => window.print()}
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
                  disabled={Boolean(busy) || notes === audit.notes}
                  onClick={() =>
                    action("save", () => onUpdate(audit.id, { notes }))
                  }
                >
                  {busy === "save" ? "Saving…" : "Save notes"}
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
          <div className="report-body">
            <div className="section-heading">
              <div>
                <h3>A specific reason to reach out.</h3>
                <p>
                  Drafts reference the evidence. Review every claim before
                  sending.
                </p>
              </div>
            </div>
            <button
              className="btn primary"
              disabled={Boolean(busy)}
              onClick={() => action("draft", () => onDraft(audit))}
            >
              {busy === "draft" ? (
                <LoaderCircle size={16} className="spin" />
              ) : (
                <Mail size={16} />
              )}{" "}
              {audit.outreach ? "Regenerate draft" : "Generate outreach"}
            </button>
            {audit.outreach && (
              <>
                <div className="draft-meta">
                  {audit.outreach.source === "ai"
                    ? "AI-assisted draft · human review required"
                    : "Evidence-based template"}{" "}
                  · Nothing has been sent
                </div>
                <div className="draft-box">
                  <span className="eyebrow">SUBJECT</span>
                  <h4>{audit.outreach.subject}</h4>
                  <hr />
                  <pre>{audit.outreach.email}</pre>
                </div>
                <button
                  className="btn"
                  onClick={() =>
                    action("copy", async () => {
                      await navigator.clipboard.writeText(
                        `Subject: ${audit.outreach!.subject}\n\n${audit.outreach!.email}`,
                      );
                      setCopied(true);
                      setTimeout(() => setCopied(false), 2000);
                    })
                  }
                >
                  {copied ? <Check size={15} /> : <Copy size={15} />}{" "}
                  {copied ? "Copied" : "Copy email"}
                </button>
                <div className="draft-box">
                  <span className="eyebrow">FOLLOW-UP</span>
                  <pre>{audit.outreach.followUp}</pre>
                </div>
                <button
                  className="btn"
                  onClick={() =>
                    action("copy-followup", () =>
                      navigator.clipboard.writeText(audit.outreach!.followUp),
                    )
                  }
                >
                  <Copy size={15} />
                  Copy follow-up
                </button>
              </>
            )}
          </div>
        )}
        <footer className="report-footer">
          Prepared with Foundry · Evidence first.
        </footer>
      </div>
    </dialog>
  );
}

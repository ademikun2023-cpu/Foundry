"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowRight,
  Check,
  FileUp,
  LoaderCircle,
  RefreshCw,
} from "lucide-react";
import { api, downloadFile } from "@/lib/client";
import { importProspects } from "@/lib/import-prospects";
import type { Audit, AuditJob, Business } from "@/lib/types";
export default function AuditQueue({
  demo,
  showForm,
  onAudits,
  onOpen,
}: {
  demo: boolean;
  showForm: boolean;
  onAudits: (a: Audit[]) => void;
  onOpen: (id: string) => void;
}) {
  const [jobs, setJobs] = useState<AuditJob[]>([]),
    [text, setText] = useState(""),
    [preview, setPreview] = useState<Business[]>([]),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false),
    [expanded, setExpanded] = useState(false);
  const requestId = useRef<string | null>(null),
    previous = useRef(""),
    onAuditsRef = useRef(onAudits),
    hasPending = useRef(false);
  onAuditsRef.current = onAudits;
  const refresh = useCallback(async () => {
    const result = await api<{ jobs: AuditJob[] }>("/api/jobs");
    setJobs(result.jobs);
    hasPending.current = result.jobs.some(
      (j) => j.status === "queued" || j.status === "running",
    );
    const signature = result.jobs
      .filter((j) => j.status === "completed")
      .map((j) => j.id)
      .join();
    if (signature !== previous.current) {
      previous.current = signature;
      const { audits } = await api<{ audits: Audit[] }>("/api/audits");
      onAuditsRef.current(audits);
    }
    return result.jobs;
  }, []);
  useEffect(() => {
    if (demo) {
      setJobs([]);
      return;
    }
    let active = true;
    async function sync() {
      if (!active || document.hidden) return;
      try {
        await refresh();
      } catch {
        if (active)
          setError(
            "Queue updates are unavailable. Refresh to check your saved progress.",
          );
      }
    }
    void sync();
    // Recover persisted queued jobs after interrupted deployments; no extra usage is charged.
    void api("/api/jobs", { action: "resume" }).catch(() => {});
    const timer = setInterval(() => {
      if (hasPending.current) void sync();
    }, 5000);
    const visible = () => {
      if (!document.hidden) void sync();
    };
    document.addEventListener("visibilitychange", visible);
    return () => {
      active = false;
      clearInterval(timer);
      document.removeEventListener("visibilitychange", visible);
    };
  }, [demo, refresh]);
  async function action(fn: () => Promise<void>) {
    setBusy(true);
    setError("");
    try {
      await fn();
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Please retry.");
    } finally {
      setBusy(false);
    }
  }
  function updateText(value: string) {
    setText(value);
    setPreview([]);
    setError("");
    requestId.current = null;
  }
  const running = jobs.filter(
    (j) => j.status === "running" || j.status === "queued",
  );
  const visible = jobs
    .filter((j) => j.status !== "completed" || jobs.indexOf(j) < 5)
    .slice(0, 10);
  const stalled = running.some((j) =>
    j.status === "queued"
      ? Date.now() - Date.parse(j.created_at) > 300000
      : j.started_at && Date.now() - Date.parse(j.started_at) > 300000,
  );
  return (
    <div className="audit-queue">
      {showForm && (
        <section className="bulk-card">
          <div className="section-heading">
            <div>
              <span className="eyebrow">LESS COPYING. MORE PROSPECTING.</span>
              <h2>Audit a list of websites.</h2>
              <p>Paste URLs or import a CSV. Up to 5 websites per batch.</p>
            </div>
            <button
              className="btn"
              onClick={() => setExpanded(!expanded)}
              aria-expanded={expanded}
            >
              <FileUp size={16} />
              {expanded ? "Close import" : "Import websites"}
            </button>
          </div>
          {expanded && (
            <div className="bulk-form">
              <label>
                One URL per line, or CSV with name and website columns
                <textarea
                  rows={5}
                  value={text}
                  onChange={(e) => updateText(e.target.value)}
                  placeholder={
                    "https://example.com\nhttps://another-business.com"
                  }
                  maxLength={50000}
                />
              </label>
              <div className="button-row">
                <label className="btn file-button">
                  <FileUp size={15} />
                  Choose CSV
                  <input
                    type="file"
                    accept=".csv,text/csv"
                    onChange={async (e) => {
                      const file = e.target.files?.[0];
                      if (!file) return;
                      if (file.size > 50000) {
                        setError("Choose a CSV smaller than 50 KB.");
                        return;
                      }
                      updateText(await file.text());
                    }}
                  />
                </label>
                <button
                  className="text-link"
                  onClick={() =>
                    downloadFile(
                      "foundry-import-template.csv",
                      "name,website\nExample business,https://example.com\n",
                      "text/csv",
                    )
                  }
                >
                  Download template
                </button>
                <button
                  className="btn"
                  onClick={() => {
                    try {
                      setPreview(importProspects(text));
                      setError("");
                    } catch (e) {
                      setError((e as Error).message);
                    }
                  }}
                >
                  Preview import
                </button>
              </div>
              {preview.length > 0 && (
                <>
                  <ul className="import-preview">
                    {preview.map((b) => (
                      <li key={b.website}>
                        <Check size={14} />
                        <strong>{b.name}</strong>
                        <span>{b.website}</span>
                      </li>
                    ))}
                  </ul>
                  {demo ? (
                    <a className="btn primary" href="/login?mode=signup">
                      Create your free account
                      <ArrowRight size={16} />
                    </a>
                  ) : (
                    <button
                      className="btn primary"
                      disabled={busy || running.length > 0}
                      onClick={() =>
                        action(async () => {
                          requestId.current ??= crypto.randomUUID();
                          await api("/api/jobs", {
                            action: "create",
                            requestId: requestId.current,
                            businesses: preview,
                          });
                          setNotice(
                            `${preview.length} websites queued. You can leave this page; progress is saved.`,
                          );
                          setText("");
                          setPreview([]);
                          requestId.current = null;
                        })
                      }
                    >
                      {busy ? (
                        <LoaderCircle className="spin" size={16} />
                      ) : (
                        <ArrowRight size={16} />
                      )}
                      Queue {preview.length} audits
                    </button>
                  )}
                  <small>
                    Each website uses one audit credit. Duplicate URLs in this
                    import are removed.
                  </small>
                </>
              )}
            </div>
          )}
        </section>
      )}
      {error && (
        <div role="alert" className="error">
          {error}
        </div>
      )}
      {notice && (
        <div role="status" className="notice">
          {notice}
        </div>
      )}
      {!demo && visible.length > 0 && (
        <section className="queue-card">
          <div className="section-heading">
            <div>
              <h2>
                {running.length
                  ? `${running.length} audits in progress`
                  : "Recent audit activity"}
              </h2>
              <p>Results are saved as each website finishes.</p>
            </div>
            {stalled && (
              <button
                className="btn"
                disabled={busy}
                onClick={() =>
                  action(async () => {
                    await api("/api/jobs", { action: "resume" });
                  })
                }
              >
                <RefreshCw size={15} />
                Resume unfinished
              </button>
            )}
          </div>
          <div className="queue-list" aria-live="polite">
            {visible.map((j) => (
              <div key={j.id} className="queue-row">
                <span className={`job-status ${j.status}`}>
                  {j.status === "running" ? (
                    <LoaderCircle className="spin" size={15} />
                  ) : j.status === "completed" ? (
                    <Check size={15} />
                  ) : (
                    <span />
                  )}
                </span>
                <div>
                  <strong>{j.business.name}</strong>
                  <small>
                    {j.error ||
                      (j.status === "running"
                        ? "Checking website and mobile performance…"
                        : j.status === "queued"
                          ? "Waiting to start"
                          : j.status === "completed"
                            ? "Report saved"
                            : "Could not complete")}
                  </small>
                </div>
                {j.audit_id ? (
                  <button
                    className="text-link"
                    onClick={() => onOpen(j.audit_id!)}
                  >
                    Open report
                    <ArrowRight size={14} />
                  </button>
                ) : j.status === "failed" && j.attempts < 3 ? (
                  <button
                    className="btn small"
                    disabled={busy}
                    onClick={() =>
                      action(async () => {
                        await api("/api/jobs", { action: "retry", id: j.id });
                      })
                    }
                  >
                    Retry
                  </button>
                ) : (
                  <span className="queue-label">{j.status}</span>
                )}
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

"use client";
import { useEffect, useState } from "react";
import { Copy, Link2 } from "lucide-react";
import { api } from "@/lib/client";
type Share = { path: string; expiresAt: string };
export default function ReportSharing({
  id,
  demo,
}: {
  id: string;
  demo?: boolean;
}) {
  const [share, setShare] = useState<Share | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [copied, setCopied] = useState(false);
  useEffect(() => {
    if (demo) return;
    let active = true;
    api<{ share: Share | null }>(`/api/audits/${id}/share`)
      .then((r) => {
        if (active) setShare(r.share);
      })
      .catch(() => {
        if (active)
          setError("Could not load sharing details. Try again shortly.");
      });
    return () => {
      active = false;
    };
  }, [id, demo]);
  async function action(fn: () => Promise<void>) {
    setBusy(true);
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
    <section className="share-card no-print">
      <h3>Send the evidence.</h3>
      <p>
        Anyone with the link can view this report for 30 days. Private notes and
        outreach are excluded.
      </p>
      {demo ? (
        <small>Sign in and run a real audit to create a shareable link.</small>
      ) : (
        <>
          <div className="button-row">
            <button
              className="btn"
              disabled={busy}
              onClick={() =>
                action(async () => {
                  const r = await api<{ share: Share }>(
                    `/api/audits/${id}/share`,
                    {},
                    "POST",
                  );
                  setShare(r.share);
                  setCopied(false);
                })
              }
            >
              <Link2 size={15} />
              {share
                ? "Replace link with latest branding"
                : "Create report link"}
            </button>
            {share && (
              <button
                className="text-link"
                disabled={busy}
                onClick={() =>
                  action(async () => {
                    await api(`/api/audits/${id}/share`, undefined, "DELETE");
                    setShare(null);
                  })
                }
              >
                Revoke link
              </button>
            )}
          </div>
          {share && (
            <>
              <div className="share-url">
                <input
                  aria-label="Shareable report link"
                  readOnly
                  value={
                    typeof location !== "undefined"
                      ? `${location.origin}${share.path}`
                      : share.path
                  }
                  onFocus={(e) => e.target.select()}
                />
                <button
                  className="btn"
                  disabled={busy}
                  onClick={() =>
                    action(async () => {
                      await navigator.clipboard.writeText(
                        `${location.origin}${share.path}`,
                      );
                      setCopied(true);
                    })
                  }
                >
                  <Copy size={15} />
                  {copied ? "Copied" : "Copy"}
                </button>
              </div>
              <small>
                Expires {new Date(share.expiresAt).toLocaleDateString()}.
                Replacing a link revokes the previous one.
              </small>
            </>
          )}
        </>
      )}
      {error && (
        <div className="error" role="alert">
          {error}
        </div>
      )}
    </section>
  );
}

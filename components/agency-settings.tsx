"use client";
import { useState } from "react";
import { Check, Upload } from "lucide-react";
import { api } from "@/lib/client";
import type { AgencyProfile } from "@/lib/types";
export default function AgencySettings({
  profile,
  onChange,
  demo,
}: {
  profile: AgencyProfile;
  onChange: (p: AgencyProfile) => void;
  demo: boolean;
}) {
  const [busy, setBusy] = useState(false),
    [message, setMessage] = useState(""),
    [error, setError] = useState("");
  async function logo(file?: File) {
    if (!file) return;
    setError("");
    if (
      !["image/png", "image/jpeg", "image/webp"].includes(file.type) ||
      file.size > 3000000
    ) {
      setError("Choose a PNG, JPEG or WebP image under 3 MB.");
      return;
    }
    try {
      const bitmap = await createImageBitmap(file);
      const scale = Math.min(1, 320 / bitmap.width, 160 / bitmap.height),
        canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(bitmap.width * scale));
      canvas.height = Math.max(1, Math.round(bitmap.height * scale));
      const context = canvas.getContext("2d");
      if (!context)
        throw new Error("Your browser could not prepare this logo.");
      context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      bitmap.close();
      const data = canvas.toDataURL("image/webp", 0.85);
      if (data.length > 180000) throw new Error("Try a smaller logo image.");
      onChange({ ...profile, logo: data });
      setMessage("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Logo could not be loaded.");
    }
  }
  return (
    <section className="settings-card">
      <h2>Your agency, on every report.</h2>
      <p>Save your branding and outreach preferences across devices.</p>
      <form
        className="stack-form"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setError("");
          setMessage("");
          try {
            if (!demo) await api("/api/profile", profile, "PUT");
            else
              localStorage.setItem(
                "foundry.sample.profile",
                JSON.stringify(profile),
              );
            setMessage(
              demo
                ? "Sample branding saved in this browser."
                : "Agency settings saved.",
            );
          } catch (e) {
            setError(e instanceof Error ? e.message : "Could not save.");
          } finally {
            setBusy(false);
          }
        }}
      >
        <label>
          Agency name
          <input
            value={profile.name}
            onChange={(e) => {
              onChange({ ...profile, name: e.target.value });
              setMessage("");
            }}
            minLength={2}
            maxLength={100}
            required
          />
        </label>
        <div className="logo-editor">
          {profile.logo ? (
            <img src={profile.logo} alt="Agency logo preview" />
          ) : (
            <span className="brand-placeholder">{profile.name[0] || "A"}</span>
          )}
          <label className="btn">
            <Upload size={15} />
            Upload logo
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp"
              onChange={(e) => logo(e.target.files?.[0])}
            />
          </label>
          {profile.logo && (
            <button
              type="button"
              className="text-link"
              onClick={() => onChange({ ...profile, logo: "" })}
            >
              Remove
            </button>
          )}
        </div>
        <label>
          Your main service
          <input
            value={profile.service}
            onChange={(e) => onChange({ ...profile, service: e.target.value })}
            placeholder="e.g. Website redesigns for plumbers"
            minLength={2}
            maxLength={160}
            required
          />
        </label>
        <label>
          Outreach tone
          <select
            value={profile.tone}
            onChange={(e) =>
              onChange({
                ...profile,
                tone: e.target.value as AgencyProfile["tone"],
              })
            }
          >
            <option value="friendly">Friendly and conversational</option>
            <option value="direct">Direct and concise</option>
          </select>
        </label>
        <small>
          New report links use your saved branding. Existing shared snapshots
          and drafts keep their original version.
        </small>
        {error && (
          <div className="error" role="alert">
            {error}
          </div>
        )}
        {message && (
          <div className="notice" role="status">
            {message}
          </div>
        )}
        <button className="btn primary" disabled={busy}>
          {busy ? (
            "Saving…"
          ) : (
            <>
              <Check size={16} />
              Save agency settings
            </>
          )}
        </button>
      </form>
    </section>
  );
}

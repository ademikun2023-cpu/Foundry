"use client";
import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { ArrowRight, LoaderCircle } from "lucide-react";
import Brand from "./brand";
import { browserDb } from "@/lib/client";
export default function Login() {
  const params = useSearchParams();
  const [mode, setMode] = useState<"login" | "signup" | "reset" | "password">(
    params.get("reset") === "1" ? "password" : "login",
  );
  const [email, setEmail] = useState(""),
    [password, setPassword] = useState(""),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState(""),
    [error, setError] = useState("");
  const db = browserDb();
  useEffect(() => {
    const sub = db?.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY") setMode("password");
    });
    return () => sub?.data.subscription.unsubscribe();
  }, [db]);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setMessage("");
    if (!db) {
      setError(
        "Live accounts are not configured yet. Explore the sample workspace below.",
      );
      return;
    }
    setBusy(true);
    try {
      if (mode === "reset") {
        const { error } = await db.auth.resetPasswordForEmail(email, {
          redirectTo: `${location.origin}/login?reset=1`,
        });
        if (error) throw error;
        setMessage(
          "If an account exists for this address, a reset link will arrive shortly.",
        );
      } else if (mode === "password") {
        const { error } = await db.auth.updateUser({ password });
        if (error) throw error;
        location.assign("/dashboard");
      } else if (mode === "signup") {
        const { data, error } = await db.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: `${location.origin}/dashboard` },
        });
        if (error) throw error;
        if (data.session) location.assign("/dashboard");
        else
          setMessage("Check your email to confirm your account, then sign in.");
      } else {
        const { error } = await db.auth.signInWithPassword({ email, password });
        if (error) throw error;
        location.assign("/dashboard");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to sign in.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="auth-page">
      <Brand />
      <div className="auth-card">
        <span className="eyebrow">YOUR NEXT CLIENT STARTS HERE</span>
        <h1>
          {mode === "signup"
            ? "Build a better pipeline."
            : mode === "reset"
              ? "Reset your password."
              : mode === "password"
                ? "Choose a new password."
                : "Welcome back."}
        </h1>
        <p>Evidence for the pitch. Clarity for the next step.</p>
        {!db && (
          <div className="notice">
            Live accounts will open once the workspace is connected. You can
            explore the sample now.
          </div>
        )}
        <form onSubmit={submit}>
          {mode !== "password" && (
            <label>
              Email address
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@agency.com"
                autoComplete="email"
                required
                maxLength={254}
              />
            </label>
          )}
          {mode !== "reset" && (
            <label>
              Password
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete={
                  mode === "login" ? "current-password" : "new-password"
                }
                minLength={8}
                maxLength={128}
                required
                placeholder="At least 8 characters"
              />
            </label>
          )}
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
          <button className="btn primary full" disabled={busy || !db}>
            {busy ? (
              <LoaderCircle className="spin" size={16} />
            ) : (
              <ArrowRight size={16} />
            )}{" "}
            {mode === "signup"
              ? "Create account"
              : mode === "reset"
                ? "Send reset link"
                : mode === "password"
                  ? "Save password"
                  : "Sign in"}
          </button>
        </form>
        <div className="auth-links">
          <button
            onClick={() => {
              setMode(mode === "signup" ? "login" : "signup");
              setMessage("");
              setError("");
            }}
          >
            {mode === "signup"
              ? "Already have an account? Sign in"
              : "New to Foundry? Create an account"}
          </button>
          {mode === "login" && (
            <button onClick={() => setMode("reset")}>Forgot password?</button>
          )}
          <a href="/dashboard">Explore the sample workspace →</a>
        </div>
      </div>
      <p className="auth-foot">Find the opportunity. Bring the evidence.</p>
    </main>
  );
}

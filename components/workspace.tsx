"use client";
import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import type { Session } from "@supabase/supabase-js";
import {
  ArrowDownToLine,
  ArrowRight,
  ArrowUpRight,
  ChartNoAxesCombined,
  Check,
  ChevronRight,
  Compass,
  FileText,
  FolderHeart,
  Globe,
  LayoutGrid,
  LoaderCircle,
  LogOut,
  Menu,
  Plus,
  Search,
  Settings2,
  ShieldCheck,
  Sparkles,
  X,
} from "lucide-react";
import { api, browserDb, csvCell, downloadFile } from "@/lib/client";
import { demoAudits } from "@/lib/demo";
import { templateOutreach } from "@/lib/outreach";
import type {
  Account,
  AppConfig,
  Audit,
  Business,
  Outreach,
  Stage,
} from "@/lib/types";
import { STAGES } from "@/lib/types";
import Brand from "./brand";
import Report from "./report";

type View = "discover" | "prospects" | "pipeline" | "settings";
const emptyConfig: AppConfig = {
  auth: false,
  search: false,
  audits: false,
  ai: false,
  billing: false,
};
const demoKey = "foundry.sample.v1";
export default function Workspace() {
  const params = useSearchParams();
  const [view, setView] = useState<View>(
    params.get("view") === "settings" ? "settings" : "discover",
  );
  const [session, setSession] = useState<Session | null>(null),
    [loading, setLoading] = useState(true),
    [config, setConfig] = useState(emptyConfig),
    [audits, setAudits] = useState<Audit[]>([]),
    [account, setAccount] = useState<Account | null>(null);
  const [niche, setNiche] = useState("Plumber"),
    [city, setCity] = useState("Miami, Florida"),
    [businesses, setBusinesses] = useState<Business[]>([]),
    [searched, setSearched] = useState(false);
  const [busy, setBusy] = useState(""),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [selected, setSelected] = useState<string | null>(null),
    [query, setQuery] = useState(""),
    [stageFilter, setStageFilter] = useState("all"),
    [sort, setSort] = useState("score");
  const [direct, setDirect] = useState(false),
    [website, setWebsite] = useState(""),
    [businessName, setBusinessName] = useState(""),
    [agency, setAgency] = useState("Your agency"),
    [mobile, setMobile] = useState(false);
  const demo = !session;
  const selectedAudit = audits.find((a) => a.id === selected);
  useEffect(() => {
    const q = params.get("q");
    if (q) {
      const parts = q.split(/·|\s+in\s+/i);
      setNiche(parts[0]?.trim() || "Plumber");
      if (parts[1]) setCity(parts[1].trim());
    }
    fetch("/api/config")
      .then((r) => r.json())
      .then(setConfig)
      .catch(() =>
        setError("Could not check service availability. Please refresh."),
      );
    const db = browserDb();
    if (!db) {
      setLoading(false);
      return;
    }
    db.auth
      .getSession()
      .then(({ data }) => {
        setSession(data.session);
        setLoading(false);
      })
      .catch(() => {
        setLoading(false);
        setError("Could not restore your session.");
      });
    const { data } = db.auth.onAuthStateChange((_event, s) => setSession(s));
    return () => data.subscription.unsubscribe();
  }, [params]);
  useEffect(() => {
    if (loading) return;
    let active = true;
    setSelected(null);
    setBusinesses([]);
    setSearched(false);
    setAccount(null);
    setError("");
    if (session) {
      setAudits([]);
      Promise.all([
        api<{ audits: Audit[] }>("/api/audits"),
        api<Account>("/api/account"),
      ])
        .then(([a, b]) => {
          if (active) {
            setAudits(a.audits);
            setAccount(b);
          }
        })
        .catch((e) => {
          if (active) setError(e.message);
        });
    } else {
      try {
        const saved = JSON.parse(localStorage.getItem(demoKey) || "null");
        setAudits(
          Array.isArray(saved) &&
            saved.every((a) => a.demo && a.id?.startsWith("sample-"))
            ? saved
            : demoAudits(),
        );
      } catch {
        setAudits(demoAudits());
      }
    }
    return () => {
      active = false;
    };
  }, [session?.user.id, loading]);
  async function refreshAccount() {
    if (!demo)
      try {
        setAccount(await api<Account>("/api/account"));
      } catch {}
  }
  function saveAudits(next: Audit[]) {
    setAudits(next);
    if (demo)
      try {
        localStorage.setItem(demoKey, JSON.stringify(next));
      } catch {
        setNotice("Sample changes could not be stored in this browser.");
      }
  }
  async function perform(key: string, fn: () => Promise<void>) {
    if (busy) return;
    setBusy(key);
    setError("");
    setNotice("");
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setBusy("");
      await refreshAccount();
    }
  }
  async function search(e: React.FormEvent) {
    e.preventDefault();
    await perform("search", async () => {
      if (demo) {
        setNotice(
          "This is a sample workspace. Sign in to search real businesses.",
        );
        return;
      }
      const result = await api<{ businesses: Business[] }>("/api/search", {
        niche,
        city,
      });
      setBusinesses(result.businesses);
      setSearched(true);
    });
  }
  async function scan(b: Business) {
    const { audit } = await api<{ audit: Audit }>("/api/audits", b);
    setAudits((current) => [audit, ...current]);
    return audit;
  }
  async function auditBusiness(b: Business) {
    await perform(`audit:${b.placeId || b.website}`, async () => {
      if (demo) {
        setNotice(
          "Sign in to audit a real website. Sample reports are available below.",
        );
        return;
      }
      const a = await scan(b);
      setSelected(a.id);
      setDirect(false);
    });
  }
  async function batch() {
    await perform("batch", async () => {
      const list = businesses
        .filter((b) => !audits.some((a) => a.business.placeId === b.placeId))
        .slice(0, 3);
      let finished = 0;
      for (const b of list) {
        setNotice(
          `Auditing ${finished + 1} of ${list.length}: ${b.name}. Each audit can take up to 45 seconds.`,
        );
        await scan(b);
        finished++;
      }
      setNotice(
        `${finished} audits saved. Open Saved prospects to review them.`,
      );
    });
  }
  async function update(
    id: string,
    changes: { stage?: Stage; notes?: string },
  ) {
    if (!demo) await api(`/api/audits/${id}`, changes, "PATCH");
    const next = audits.map((a) => (a.id === id ? { ...a, ...changes } : a));
    saveAudits(next);
  }
  async function remove(id: string) {
    if (!demo) await api(`/api/audits/${id}`, undefined, "DELETE");
    saveAudits(audits.filter((a) => a.id !== id));
  }
  async function draft(audit: Audit) {
    const outreach = demo
      ? templateOutreach(audit, agency)
      : (
          await api<{ outreach: Outreach }>("/api/outreach", {
            auditId: audit.id,
            agency,
          })
        ).outreach;
    saveAudits(audits.map((a) => (a.id === audit.id ? { ...a, outreach } : a)));
    await refreshAccount();
    return outreach;
  }
  async function billing(action: "checkout" | "portal", plan?: string) {
    await perform("billing", async () => {
      const result = await api<{ url: string }>("/api/billing", {
        action,
        plan,
      });
      if (result.url) location.assign(result.url);
    });
  }
  function exportCsv() {
    const rows = [
      [
        "Business",
        "Website",
        "Opportunity score",
        "Evidence coverage",
        "Stage",
        "Audited at",
        "Sample",
      ],
      ...filtered.map((a) => [
        a.business.name,
        a.business.website,
        a.scoring.score,
        a.scoring.coverage,
        a.stage,
        a.createdAt,
        a.demo ? "Yes" : "No",
      ]),
    ];
    downloadFile(
      "foundry-prospects.csv",
      rows.map((r) => r.map(csvCell).join(",")).join("\r\n"),
      "text/csv;charset=utf-8",
    );
  }
  const filtered = audits
    .filter(
      (a) =>
        a.business.name.toLowerCase().includes(query.toLowerCase()) &&
        (stageFilter === "all" || a.stage === stageFilter),
    )
    .sort((a, b) =>
      sort === "recent"
        ? b.createdAt.localeCompare(a.createdAt)
        : (b.scoring.score ?? -1) - (a.scoring.score ?? -1),
    );
  const qualified = audits.filter(
    (a) => (a.scoring.score ?? 0) >= 60 && a.scoring.coverage >= 65,
  ).length;
  const avg = audits.length
    ? Math.round(
        audits.reduce((n, a) => n + a.scoring.coverage, 0) / audits.length,
      )
    : 0;
  function nav(next: View) {
    setView(next);
    setMobile(false);
    setNotice("");
    setError("");
  }
  const navs = [
    { key: "discover" as View, label: "Discover", icon: Compass },
    { key: "prospects" as View, label: "Saved prospects", icon: FolderHeart },
    { key: "pipeline" as View, label: "Pipeline", icon: LayoutGrid },
    { key: "settings" as View, label: "Workspace", icon: Settings2 },
  ];
  return (
    <div className="workspace">
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <aside className={`sidebar ${mobile ? "is-open" : ""}`}>
        <div className="sidebar-brand">
          <Brand />
          <button
            className="icon-btn mobile-only"
            aria-label="Close navigation"
            onClick={() => setMobile(false)}
          >
            <X size={18} />
          </button>
        </div>
        <div className="workspace-label">
          <span className="workspace-avatar">F</span>
          <div>
            <strong>{demo ? "Sample workspace" : "Your workspace"}</strong>
            <span>Local lead intelligence</span>
          </div>
        </div>
        <div className="nav-label">WORKSPACE</div>
        <nav className="side-nav" aria-label="Main navigation">
          {navs.map((n) => (
            <button
              key={n.key}
              className={view === n.key ? "active" : ""}
              onClick={() => nav(n.key)}
            >
              <n.icon size={18} />
              {n.label}
              {n.key === "prospects" && (
                <span className="nav-count">{audits.length}</span>
              )}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="sidebar-tip">
            <Sparkles size={18} />
            <strong>A sharper first conversation.</strong>
            <p>
              Lead with a finding. Back it with evidence. Make the next step
              easy.
            </p>
            <button
              onClick={() => {
                setView("discover");
                setDirect(true);
              }}
            >
              Audit a website <ArrowRight size={14} />
            </button>
          </div>
          <div className="account-row">
            <span className="avatar">
              {session?.user.email?.[0]?.toUpperCase() || "F"}
            </span>
            <div>
              <strong>
                {session?.user.email?.split("@")[0] || "Explore Foundry"}
              </strong>
              <small>
                {demo ? "Sample mode" : `${account?.plan || "free"} workspace`}
              </small>
            </div>
            {session ? (
              <button
                className="icon-btn"
                title="Sign out"
                aria-label="Sign out"
                onClick={() =>
                  perform("signout", async () => {
                    const { error } = await browserDb()!.auth.signOut();
                    if (error) throw error;
                  })
                }
              >
                <LogOut size={16} />
              </button>
            ) : (
              <a href="/login" aria-label="Sign in">
                <ArrowUpRight size={17} />
              </a>
            )}
          </div>
        </div>
      </aside>
      <div className="workspace-main">
        <header className="topbar">
          <div className="breadcrumb">
            <button
              className="icon-btn mobile-only"
              aria-label="Open navigation"
              onClick={() => setMobile(true)}
            >
              <Menu size={20} />
            </button>
            <span>Workspace</span>
            <ChevronRight size={13} />
            <strong>{navs.find((n) => n.key === view)?.label}</strong>
          </div>
          <div className="top-actions">
            <span className="environment-dot" />
            {demo ? "Sample data" : "Live workspace"}
            {demo && (
              <a href="/login" className="btn small">
                Sign in <ArrowRight size={13} />
              </a>
            )}
          </div>
        </header>
        <main id="main" className="main-content">
          {loading ? (
            <div className="empty-state">
              <LoaderCircle className="spin" />
              <h2>Opening your workspace…</h2>
            </div>
          ) : (
            <>
              {demo && (
                <div className="demo-banner">
                  <span>
                    <Sparkles size={15} />
                    <strong>Take a look around.</strong> These businesses and
                    measurements are fictional. Changes stay in this browser.
                  </span>
                  <a href="/login">
                    Start your workspace <ArrowRight size={14} />
                  </a>
                </div>
              )}
              {error && (
                <div className="error global-message" role="alert">
                  {error}
                  <button
                    className="icon-btn"
                    aria-label="Dismiss error"
                    onClick={() => setError("")}
                  >
                    <X size={16} />
                  </button>
                </div>
              )}
              {notice && (
                <div className="notice global-message" role="status">
                  {notice}
                </div>
              )}
              {view === "discover" && (
                <>
                  <div className="page-heading">
                    <div>
                      <span className="eyebrow">
                        GOOD RESEARCH. BETTER CONVERSATIONS.
                      </span>
                      <h1>
                        Find your next opportunity<span>.</span>
                      </h1>
                      <p>
                        Discover local businesses with a specific reason to need
                        your help.
                      </p>
                    </div>
                    <button className="btn" onClick={() => setDirect(!direct)}>
                      <Plus size={16} />
                      Audit a website
                    </button>
                  </div>
                  <section className="search-card">
                    <div className="section-heading">
                      <div>
                        <h2>Where should we look?</h2>
                        <p>
                          Choose a business type and a location. Start with one
                          focused market.
                        </p>
                      </div>
                      <span className="soft-icon">
                        <Search size={22} />
                      </span>
                    </div>
                    <form className="discovery-form" onSubmit={search}>
                      <label>
                        Business type
                        <div className="input-icon">
                          <Compass size={16} />
                          <input
                            value={niche}
                            onChange={(e) => setNiche(e.target.value)}
                            required
                            minLength={2}
                            maxLength={100}
                            placeholder="e.g. Plumbers"
                          />
                        </div>
                      </label>
                      <label>
                        City or area
                        <div className="input-icon">
                          <Globe size={16} />
                          <input
                            value={city}
                            onChange={(e) => setCity(e.target.value)}
                            required
                            minLength={2}
                            maxLength={150}
                            placeholder="e.g. Miami, Florida"
                          />
                        </div>
                      </label>
                      <button className="btn primary" disabled={Boolean(busy)}>
                        {busy === "search" ? (
                          <LoaderCircle className="spin" size={16} />
                        ) : (
                          <Search size={16} />
                        )}
                        Find businesses
                      </button>
                    </form>
                    <div className="suggestions">
                      <span>Try a market</span>
                      {[
                        ["Med spa", "Austin, Texas"],
                        ["Plumber", "Miami, Florida"],
                        ["Dentist", "Denver, Colorado"],
                      ].map(([n, c]) => (
                        <button
                          key={n}
                          onClick={() => {
                            setNiche(n);
                            setCity(c);
                          }}
                        >
                          {n} <span>· {c.split(",")[0]}</span>
                        </button>
                      ))}
                    </div>
                  </section>
                  {direct && (
                    <section className="direct-card">
                      <div className="section-heading">
                        <div>
                          <h2>Already have a business in mind?</h2>
                          <p>
                            Run a website audit. Review comparisons require a
                            business search.
                          </p>
                        </div>
                        <button
                          className="icon-btn"
                          aria-label="Close website audit form"
                          onClick={() => setDirect(false)}
                        >
                          <X size={18} />
                        </button>
                      </div>
                      <form
                        className="discovery-form"
                        onSubmit={(e) => {
                          e.preventDefault();
                          auditBusiness({ name: businessName, website });
                        }}
                      >
                        <label>
                          Business name
                          <input
                            required
                            minLength={2}
                            maxLength={180}
                            placeholder="Business name"
                            value={businessName}
                            onChange={(e) => setBusinessName(e.target.value)}
                          />
                        </label>
                        <label>
                          Website URL
                          <input
                            type="url"
                            required
                            placeholder="https://example.com"
                            value={website}
                            onChange={(e) => setWebsite(e.target.value)}
                          />
                        </label>
                        <button
                          className="btn primary"
                          disabled={Boolean(busy)}
                        >
                          {busy.startsWith("audit:") ? (
                            <LoaderCircle size={16} className="spin" />
                          ) : (
                            <ArrowRight size={16} />
                          )}
                          Run audit
                        </button>
                      </form>
                    </section>
                  )}
                  <div className="stat-grid">
                    <Stat
                      label="Saved prospects"
                      value={audits.length}
                      icon={<FolderHeart size={17} />}
                      note={
                        demo
                          ? "A preview of your prospect list"
                          : "Your research, in one place"
                      }
                    />
                    <Stat
                      label="High-opportunity leads"
                      value={qualified}
                      icon={<ChartNoAxesCombined size={17} />}
                      note="Score ≥60 with ≥65% coverage"
                    />
                    <Stat
                      label="Average evidence coverage"
                      value={`${avg}%`}
                      icon={<ShieldCheck size={17} />}
                      note="Measured inputs behind the score"
                    />
                  </div>
                  {searched ? (
                    <section className="results-section">
                      <div className="section-heading">
                        <div>
                          <h2>
                            Businesses to investigate{" "}
                            <span className="count-pill">
                              {businesses.length}
                            </span>
                          </h2>
                          <p>
                            Search results are starting points. Run an audit to
                            rank the opportunity.
                          </p>
                        </div>
                        {businesses.length > 0 && (
                          <button
                            className="btn"
                            disabled={
                              Boolean(busy) ||
                              businesses.every((b) =>
                                audits.some(
                                  (a) => a.business.placeId === b.placeId,
                                ),
                              )
                            }
                            onClick={batch}
                          >
                            {busy === "batch" ? (
                              <LoaderCircle size={15} className="spin" />
                            ) : (
                              <Sparkles size={15} />
                            )}
                            Audit next 3
                          </button>
                        )}
                      </div>
                      {businesses.length === 0 ? (
                        <div className="empty-state">
                          <Search size={28} />
                          <h3>No businesses returned.</h3>
                          <p>
                            Try a broader city or a different business type.
                          </p>
                        </div>
                      ) : (
                        <div className="business-grid">
                          {businesses.map((b) => {
                            const existing = audits.find(
                              (a) => a.business.placeId === b.placeId,
                            );
                            return (
                              <article
                                className="business-card"
                                key={b.placeId}
                              >
                                <span className="business-initial">
                                  {b.name[0]}
                                </span>
                                <h3>{b.name}</h3>
                                <p>{b.address}</p>
                                <div className="business-facts">
                                  <span>{b.rating ?? "—"} rating</span>
                                  <span>{b.reviewCount ?? "—"} reviews</span>
                                </div>
                                <div className="business-site">
                                  {b.website
                                    ? new URL(b.website).hostname
                                    : "No website listed"}
                                </div>
                                <div className="button-row spread">
                                  {b.mapsUrl && (
                                    <a
                                      href={b.mapsUrl}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="text-link"
                                    >
                                      Google Maps <ArrowUpRight size={12} />
                                    </a>
                                  )}
                                  <button
                                    className="btn small"
                                    disabled={Boolean(busy)}
                                    onClick={() =>
                                      existing
                                        ? setSelected(existing.id)
                                        : auditBusiness(b)
                                    }
                                  >
                                    {busy === `audit:${b.placeId}` ? (
                                      <LoaderCircle
                                        size={14}
                                        className="spin"
                                      />
                                    ) : existing ? (
                                      <Check size={14} />
                                    ) : (
                                      <ArrowRight size={14} />
                                    )}{" "}
                                    {existing ? "View audit" : "Run audit"}
                                  </button>
                                </div>
                                {b.attribution?.map((a) => (
                                  <small key={a}>{a}</small>
                                ))}
                              </article>
                            );
                          })}
                        </div>
                      )}
                      <div className="attribution">
                        Business listings and review data:{" "}
                        <strong>Google Maps</strong> · Review comparisons use
                        only this returned sample.
                      </div>
                    </section>
                  ) : (
                    <section>
                      <div className="section-heading">
                        <div>
                          <h2>
                            {demo
                              ? "A look at the opportunities"
                              : "Recent opportunities"}
                          </h2>
                          <p>
                            {demo
                              ? "Open a sample audit to see what an evidence-led pitch looks like."
                              : "Your saved audits, ranked by measurable opportunity."}
                          </p>
                        </div>
                        <button
                          className="text-link"
                          onClick={() => setView("prospects")}
                        >
                          View all prospects <ArrowRight size={15} />
                        </button>
                      </div>
                      <AuditTable
                        audits={filtered.slice(0, 5)}
                        onOpen={setSelected}
                      />
                    </section>
                  )}
                  <div className="bottom-note">
                    <ShieldCheck size={15} />
                    <p>
                      Research signals, not buying intent. Every report
                      separates measurements, heuristics, and unknowns.
                    </p>
                  </div>
                </>
              )}
              {view === "prospects" && (
                <>
                  <div className="page-heading">
                    <div>
                      <span className="eyebrow">
                        YOUR RESEARCH, READY TO USE
                      </span>
                      <h1>
                        Saved prospects<span>.</span>
                      </h1>
                      <p>
                        A clear reason to reach out, with the evidence attached.
                      </p>
                    </div>
                    <button
                      className="btn"
                      onClick={exportCsv}
                      disabled={!filtered.length}
                    >
                      <ArrowDownToLine size={16} />
                      Export CSV
                    </button>
                  </div>
                  <div className="table-filters">
                    <div className="input-icon filter-search">
                      <Search size={16} />
                      <input
                        aria-label="Search saved prospects"
                        placeholder="Search businesses…"
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                      />
                    </div>
                    <select
                      aria-label="Filter by stage"
                      value={stageFilter}
                      onChange={(e) => setStageFilter(e.target.value)}
                    >
                      <option value="all">All stages</option>
                      {STAGES.map((s) => (
                        <option key={s}>{s}</option>
                      ))}
                    </select>
                    <select
                      aria-label="Sort prospects"
                      value={sort}
                      onChange={(e) => setSort(e.target.value)}
                    >
                      <option value="score">Highest opportunity</option>
                      <option value="recent">Most recent</option>
                    </select>
                  </div>
                  <AuditTable audits={filtered} onOpen={setSelected} />
                </>
              )}
              {view === "pipeline" && (
                <>
                  <div className="page-heading">
                    <div>
                      <span className="eyebrow">
                        FROM FIRST FINDING TO FIRST CLIENT
                      </span>
                      <h1>
                        Keep the conversation moving<span>.</span>
                      </h1>
                      <p>
                        Open a prospect to update its stage or add a private
                        note.
                      </p>
                    </div>
                    <button className="btn" onClick={() => setView("discover")}>
                      <Plus size={15} />
                      Find prospects
                    </button>
                  </div>
                  <div className="pipeline">
                    {STAGES.map((stage) => (
                      <section className="pipeline-column" key={stage}>
                        <h2>
                          <span
                            className={`stage-dot stage-${STAGES.indexOf(stage)}`}
                          />
                          {stage}
                          <span>
                            {audits.filter((a) => a.stage === stage).length}
                          </span>
                        </h2>
                        {audits
                          .filter((a) => a.stage === stage)
                          .map((a) => (
                            <button
                              className="pipeline-card"
                              key={a.id}
                              onClick={() => setSelected(a.id)}
                            >
                              <div className="button-row spread">
                                <span className="business-initial">
                                  {a.business.name[0]}
                                </span>
                                <Score value={a.scoring.score} />
                              </div>
                              <h3>{a.business.name}</h3>
                              <p>
                                {a.metrics.performance !== null
                                  ? `${a.metrics.performance}/100 mobile performance`
                                  : "Performance unknown"}
                              </p>
                              <small>
                                {a.scoring.coverage}% evidence coverage
                              </small>
                            </button>
                          ))}
                        {!audits.some((a) => a.stage === stage) && (
                          <div className="pipeline-empty">
                            No prospects here yet.
                          </div>
                        )}
                      </section>
                    ))}
                  </div>
                </>
              )}
              {view === "settings" && (
                <>
                  <div className="page-heading">
                    <div>
                      <span className="eyebrow">
                        MAKE ROOM FOR YOUR NEXT CLIENT
                      </span>
                      <h1>
                        Your workspace<span>.</span>
                      </h1>
                      <p>
                        Manage your usage, reporting name, and subscription.
                      </p>
                    </div>
                  </div>
                  <div className="settings-grid">
                    <section className="settings-card">
                      <h2>Report identity</h2>
                      <p>
                        This name appears in downloaded reports and outreach
                        drafts.
                      </p>
                      <label>
                        Agency name
                        <input
                          value={agency}
                          onChange={(e) => setAgency(e.target.value)}
                          maxLength={100}
                          minLength={2}
                        />
                      </label>
                      <small>
                        Applies to this session. Existing drafts retain the name
                        used when generated.
                      </small>
                    </section>
                    <section className="settings-card">
                      <h2>
                        Monthly usage{" "}
                        <span className="count-pill">
                          {account?.plan || "free"}
                        </span>
                      </h2>
                      <p>
                        Allowances reset on the first of each month, UTC.
                        Attempted provider calls count toward usage.
                      </p>
                      {(
                        account?.usage || [
                          { action: "search", used: 0, allowance: 20 },
                          { action: "audit", used: 0, allowance: 10 },
                          { action: "outreach", used: 0, allowance: 20 },
                        ]
                      ).map((u) => (
                        <div className="usage" key={u.action}>
                          <div>
                            <strong>
                              {u.action === "search"
                                ? "Business searches"
                                : u.action === "audit"
                                  ? "Audits"
                                  : "Outreach drafts"}
                            </strong>
                            <span>
                              {u.used} / {u.allowance}
                            </span>
                          </div>
                          <div className="meter">
                            <i
                              style={{
                                width: `${Math.min(100, (u.used / u.allowance) * 100)}%`,
                              }}
                            />
                          </div>
                        </div>
                      ))}
                      {demo && (
                        <small>
                          Sample counters. Sign in to see your actual usage.
                        </small>
                      )}
                    </section>
                  </div>
                  {params.get("checkout") === "success" && (
                    <div className="notice">
                      Checkout finished. Your plan updates after payment is
                      confirmed.{" "}
                      <button className="text-link" onClick={refreshAccount}>
                        Refresh plan
                      </button>
                    </div>
                  )}
                  <section className="billing-section">
                    <div className="section-heading">
                      <div>
                        <h2>Find your pace.</h2>
                        <p>
                          {config.billing
                            ? "Checkout shows the configured price before you subscribe."
                            : "Paid plans are not open yet. Explore the workspace while billing is being connected."}
                        </p>
                      </div>
                      <button
                        className="btn"
                        disabled={demo || !config.billing || Boolean(busy)}
                        onClick={() => billing("portal")}
                      >
                        Manage billing <ArrowUpRight size={14} />
                      </button>
                    </div>
                    <div className="plans">
                      {[
                        {
                          key: "starter",
                          name: "Starter",
                          limit: "100",
                          desc: "Build a focused prospecting habit.",
                        },
                        {
                          key: "growth",
                          name: "Growth",
                          limit: "500",
                          desc: "Research more markets, consistently.",
                        },
                        {
                          key: "agency",
                          name: "Agency",
                          limit: "2,000",
                          desc: "Room for a busy agency pipeline.",
                        },
                      ].map((p) => (
                        <article
                          className={`plan ${p.key === "growth" ? "featured" : ""}`}
                          key={p.key}
                        >
                          <span className="eyebrow">{p.name}</span>
                          <h3>
                            {p.limit}
                            <small> audits / month</small>
                          </h3>
                          <p>{p.desc}</p>
                          <ul>
                            <li>
                              <Check size={14} />
                              {p.limit} business searches
                            </li>
                            <li>
                              <Check size={14} />
                              Saved reports and CSV export
                            </li>
                            <li>
                              <Check size={14} />
                              Evidence-based outreach drafts
                            </li>
                          </ul>
                          <button
                            className="btn full"
                            disabled={
                              demo ||
                              !config.billing ||
                              Boolean(busy) ||
                              account?.plan === p.key
                            }
                            onClick={() => billing("checkout", p.key)}
                          >
                            {account?.plan === p.key
                              ? "Current plan"
                              : config.billing
                                ? "View checkout"
                                : "Coming soon"}
                            <ArrowRight size={14} />
                          </button>
                        </article>
                      ))}
                    </div>
                  </section>
                  {demo && (
                    <button
                      className="btn"
                      onClick={() => {
                        saveAudits(demoAudits());
                        setNotice("Sample workspace reset.");
                      }}
                    >
                      Reset sample workspace
                    </button>
                  )}
                </>
              )}
            </>
          )}
          <footer className="workspace-footer">
            <span>
              foundry<span className="rose-text">.</span>
            </span>
            <span>Evidence first. Opportunity next.</span>
          </footer>
        </main>
      </div>
      {selectedAudit && (
        <Report
          key={selectedAudit.id}
          audit={selectedAudit}
          agency={agency}
          onClose={() => setSelected(null)}
          onUpdate={update}
          onDelete={remove}
          onDraft={draft}
        />
      )}
    </div>
  );
}
function Stat({
  label,
  value,
  icon,
  note,
}: {
  label: string;
  value: string | number;
  icon: React.ReactNode;
  note: string;
}) {
  return (
    <article className="stat-card">
      <div>
        <span>{label}</span>
        {icon}
      </div>
      <strong>{value}</strong>
      <p>{note}</p>
    </article>
  );
}
function Score({ value }: { value: number | null }) {
  return (
    <span
      className={`score-badge ${value === null ? "unknown" : value >= 60 ? "high" : value >= 35 ? "medium" : "low"}`}
    >
      {value ?? "—"}
    </span>
  );
}
function AuditTable({
  audits,
  onOpen,
}: {
  audits: Audit[];
  onOpen: (id: string) => void;
}) {
  return audits.length ? (
    <div className="table-shell">
      <table className="audit-table">
        <thead>
          <tr>
            <th>Business</th>
            <th>Mobile speed</th>
            <th>Booking link</th>
            <th>Opportunity</th>
            <th>Stage</th>
            <th>
              <span className="sr-only">Open audit</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {audits.map((a) => (
            <tr key={a.id}>
              <td>
                <button className="business-name" onClick={() => onOpen(a.id)}>
                  <span className="business-initial">{a.business.name[0]}</span>
                  <span>
                    <strong>{a.business.name}</strong>
                    <small>
                      {a.business.address ||
                        a.business.website ||
                        "Website not supplied"}
                    </small>
                  </span>
                </button>
              </td>
              <td>
                <span
                  className={
                    a.metrics.performance !== null && a.metrics.performance < 50
                      ? "rose-text"
                      : ""
                  }
                >
                  {a.metrics.performance ?? "—"}
                  <small> / 100</small>
                </span>
              </td>
              <td>
                <span
                  className={`booking-tag ${a.metrics.booking === "detected" ? "detected" : ""}`}
                >
                  {a.metrics.booking === "detected"
                    ? "Detected"
                    : a.metrics.booking === "not_detected"
                      ? "Not detected"
                      : "Unknown"}
                </span>
              </td>
              <td>
                <div className="score-cell">
                  <Score value={a.scoring.score} />
                  <small>{a.scoring.coverage}% coverage</small>
                </div>
              </td>
              <td>
                <span className="stage-tag">{a.stage}</span>
              </td>
              <td>
                <button
                  className="icon-btn"
                  aria-label={`Open audit for ${a.business.name}`}
                  onClick={() => onOpen(a.id)}
                >
                  <ArrowUpRight size={17} />
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  ) : (
    <div className="empty-state">
      <FileText size={30} />
      <h3>No prospects to show.</h3>
      <p>Run your first audit or adjust your filters.</p>
    </div>
  );
}

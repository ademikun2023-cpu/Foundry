# Foundry

Local lead intelligence for agencies: business discovery, evidence-based website audits, transparent opportunity scores, saved prospects and outreach drafts.

The existing rose-and-white landing-page design is retained. The application is now a Next.js / TypeScript project with Supabase authentication and PostgreSQL persistence, ready for a Vercel deployment once provider accounts are connected.

## Run locally

Use Node.js 22 or later. From the **repository root**:

```bash
npm ci
cp .env.example .env.local
npm run dev
```

On Windows PowerShell, use `Copy-Item .env.example .env.local` instead of `cp`.

Open `http://localhost:3000`. No keys are required to explore `/dashboard` with clearly labelled fictional examples. Sample changes are stored only in the browser. Live requests require authentication and configured services; a failed live request never silently becomes sample data.

## Implemented

- Original landing-page visual direction, with working navigation into the workspace. Unsupported marketing statistics and the fake waitlist success message are removed from the served landing page.
- Email/password sign-up, email confirmation, sign-in, reset and sign-out through Supabase Auth.
- Google Places text search by business type and location (up to 10 results per search).
- Individual audits and sequential batches of up to 3 businesses per batch.
- Direct website audit for an existing prospect.
- Lighthouse mobile performance and lab Largest Contentful Paint via PageSpeed Insights.
- Homepage HTTPS, viewport, likely booking links and public social links.
- Review-count comparison against the median of the other returned search results.
- Transparent weighted scoring, evidence coverage, explicit unknowns and limitations.
- Saved reports, pipeline stages, private notes, deletion, search, filtering and CSV export.
- Downloadable standalone HTML reports and browser print / save-as-PDF.
- Evidence-based email and follow-up drafts; optional Claude generation, with a template fallback.
- Stripe Checkout, customer portal and signature-verified, idempotent subscription webhooks.
- Server-enforced monthly allowances and per-action burst limits.
- Automated CI, security-focused tests, and a deployable production build.

## Connect services

Follow [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md). `.env.example` contains every required variable. Secrets belong in `.env.local` locally and in the hosting provider's environment settings in production. Never commit them or paste them into a chat.

1. Create or select a Supabase project and apply `supabase/migrations/001_foundry.sql` once.
2. Set the Supabase public URL, public anon key and server-only service-role key.
3. Enable Google Places API (New) and PageSpeed Insights API; set their server-side keys.
4. Optionally enable Claude outreach and Stripe subscriptions.
5. Import the repository into Vercel, using the repository root and the Next.js framework.

The provider calls and deployment cannot be live-tested until those accounts and values are connected. Nothing in this repository creates paid provider accounts or purchases a plan.

## Score methodology

| Input | Weight | Opportunity value |
| --- | --- | --- |
| Mobile performance | 40% | `1 - Lighthouse performance / 100` |
| Review gap | 35% | `max(0, 1 - review count / comparison median)` |
| Booking visibility | 25% | Detected = 0; not detected in homepage HTML = 0.6; unknown = excluded |

The score is `100 × weighted opportunity sum / available weight`. Coverage is the sum of weights with available evidence. With no evidence, the score is **unknown**, not zero. No website listed does not automatically receive a high score. Zero/missing review benchmarks are excluded.

Booking visibility is a heuristic. JavaScript widgets and other pages may be missed, and a detected booking link does not prove completion works. A viewport tag does not prove mobile usability. LCP is a lab rendering metric, not a page's complete load time. Social posting activity is not measured. The score does not establish buying intent, willingness to pay, or revenue loss.

## Architecture

- `app/` — pages and authenticated API routes.
- `components/` — workspace, login and report UI.
- `lib/audit.ts` — inspection and evidence assembly.
- `lib/safe-fetch.ts` — bounded, DNS-pinned website requests with redirect validation.
- `lib/scoring.ts` — scoring formula and coverage.
- `lib/search-proof.ts` — short-lived, user-bound signatures over Google search data.
- `supabase/migrations/001_foundry.sql` — tables, row-level security, atomic usage and billing functions.
- `tests/` — scoring, SSRF, ownership, quota, billing and provider-simulated integration tests.

The original `index.html` and `Foundry/` files remain in the repository for reference. Next.js serves the application from `app/`; do not configure Vercel to use the nested `Foundry/` directory. `app/landing-html.ts` contains the served static landing markup and `app/landing.css` its retained styling.

## Validation

```bash
npm run check
npm audit --omit=dev
```

`check` runs TypeScript, 28 tests, and a production build. Database tests execute the migration in embedded PostgreSQL (PGlite), including real role and RLS checks. The integration test simulates Google, Supabase HTTP responses and provider persistence; it does not claim a live provider run. A real-browser walkthrough and live account/payment checks remain required before a paid launch.

## Current scope and limits

- A workspace belongs to one signed-in user; team invitations, shared agency workspaces and white-label custom domains are future work.
- The UI currently loads the 500 most recent saved audits. Add cursor pagination before large-volume agency use.
- Batches run in the open browser tab. Closing the tab can interrupt remaining work; a durable background job queue is future work.
- Searches and attempted audit/draft calls consume quota even when an upstream provider fails. Per-action bursts are limited to five calls per minute.
- Allowances reset by UTC calendar month, independently of Stripe's billing anniversary. Plan limits are editable in the migration; Stripe prices are configured in the Stripe dashboard, not hardcoded.
- Agency/report name is session-local. Private prospect notes are persisted; notes and outreach are excluded from client report exports.
- No email or DM is sent automatically. Review generated drafts and factual claims before sending.
- Google Analytics, Search Console, Meta Ads, recurring client reports and social activity monitoring are not included.
- Google Maps data is attributed. Review the applicable Google Maps content-storage, export, attribution and customer-facing policy requirements before commercial launch; this implementation does not claim policy/legal certification.
- Live launch requires the business owner's billing/provider eligibility, privacy/terms, and support arrangements. No invented company details or legal guarantees are published.

## Provider references

- [Supabase Auth getUser](https://supabase.com/docs/reference/javascript/auth-getuser)
- [Google Places Text Search](https://developers.google.com/maps/documentation/places/web-service/text-search)
- [PageSpeed Insights API](https://developers.google.com/speed/docs/insights/v5/get-started)
- [Stripe subscription webhooks](https://docs.stripe.com/billing/subscriptions/webhooks)

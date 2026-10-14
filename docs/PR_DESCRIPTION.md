## Why

Foundry currently serves a static landing page. Its scan button only scrolls to hardcoded results, and its waitlist form displays a success message without saving anything. Agencies cannot use it to research or manage real prospects.

## What changes

This branch retains the existing visual direction and adds a Next.js acquisition MVP: Supabase accounts, Google Places discovery, website audits, transparent scoring with evidence coverage, saved prospects, pipeline stages, private notes, downloadable reports, CSV export and outreach drafts. Clearly labelled fictional examples let visitors explore without configured providers. Stripe subscriptions and server-enforced usage limits are implemented behind provider configuration.

Audits distinguish observations from heuristics and unknowns. Homepage checks use bounded, DNS-pinned requests with validation on every redirect. Search records are signed to prevent altered client values being presented as Google evidence. Database policies isolate users and prevent clients from changing audit evidence, billing entitlements or usage counters.

## Verification

- `npm run check`: TypeScript, 28 tests and production build pass.
- Real PostgreSQL role/RLS tests run through PGlite.
- Provider-simulated integration covers search → signed audit → persistence → outreach.
- `npm audit --omit=dev`: no known production dependency vulnerabilities reported at implementation time.
- Browser visual QA and live Supabase/Google/Stripe/Vercel checks have not run; the environment lacks the necessary connected services and supported browser tooling.

## Deployment and limits

Apply the included database migration and configure `.env.example` values as described in `docs/DEPLOYMENT.md`. Paid prices are owner-configured in Stripe. This branch does not create paid accounts, send outreach or activate live payments. Phase 2 analytics/reporting integrations and multi-user agency accounts are outside this MVP. Saved-audit listing currently returns the 500 newest records; batches are browser-driven, not background jobs.

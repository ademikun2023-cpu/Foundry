# Agency workflows release

## Customer changes

- First free audit: public sample report, signup CTA, URL carried through signup in the same browser, direct-audit form shown first. Existing free allowance stays at 10 audits/month.
- CSV/URL imports: up to five websites, duplicate removal, preview, durable per-website status, server-side processing after submission, bounded retries and resume after interruption.
- Agency identity: name, uploaded raster logo, service and tone saved per user.
- Reports: share snapshots with unguessable tokens, 30-day expiry and revocation. Notes, follow-up dates, outreach and signed source tokens are excluded. Print/save PDF opens a clean report independent of the active editor tab.
- Outreach: editable email, short DM and follow-up, service/tone controls, copy and save. Nothing sends automatically. AI generation remains optional and requires the existing provider configuration.
- Follow-up dates: persisted alongside notes, due/overdue panel, closed prospects excluded.
- Mobile: responsive import/queue/editor/branding panels, touch targets, readable inputs and reduced-motion support.
- Payments: NGN and USD only. NGN prices are intentionally unconfigured until the owner chooses amounts. Each currency requires its own enable flag, approved Paystack account and matching recurring plans. No live key has been copied from VerifyPlug.

## Database change

The owner approved this migration on November 10, 2026. It was applied to the existing Foundry project as `20261110105918_agency_workflows`; the filename matches the recorded database version. Do not apply it again. The SQL contents are unchanged from the reviewed migration.

This adds an optional follow-up date to audits, grants owners access to their follow-up dates and draft edits, and creates isolated agency profiles, report shares, audit jobs, and a service-only billing price catalogue. It adds owner-checked queue/quota functions and service-only worker functions. The existing payment validator is extended to accept explicitly configured NGN plans as well as existing exact USD prices. No user rows are deleted or existing account plans changed by the migration.

The migration is transactional. Its permission and payment-validation changes were explicitly approved before application. Automated tests exercise cross-user access denial, queue quota atomicity, duplicate submissions, worker leases, private report-data exclusion and NGN amount/currency checks.

## Release order

1. Completed: migration applied; tables, ownership policies and privileges verified. Production transaction checks passed for profile saving, queue quota/idempotence, worker leases/completion, follow-up and outreach edits, and share ownership. All verification data was rolled back. Security advisors reported no critical finding; leaked-password protection remains disabled (existing setting).
2. Deploy this exact tested commit to the existing Foundry Vercel project.
3. Use a dedicated test account to check saved branding, URL/CSV submission, persistence, report sharing/revocation, follow-up dates and edited drafts.
4. Configure payments separately after the merchant-profile decision, explicit NGN prices and currency approvals. Use test keys first. Do not collect live payments until checkout/webhook/renewal/cancellation checks pass.

## Limits and recovery

- An imported website uses one audit credit when accepted. A duplicate request ID does not consume credits twice. Failed submission of a batch rolls back all its quota reservations.
- Maximum five active imported jobs per user at submission. Workers claim jobs atomically; leases recover after five minutes. Failed jobs have up to three attempts. Reopening the workspace or Resume unfinished restarts recoverable work after platform interruption.
- Provider failures can yield a completed report with explicit unknown checks. Run fresh checks creates a new audit and uses a credit, preserving the old report.
- Sharing makes only the selected report snapshot accessible to anyone holding its link. Revoking a link cannot retract copies already downloaded by a recipient.
- The migration is installed. Full signed-in browser/API verification still requires a dedicated test account; database-level checks and sample-mode browser checks do not substitute for that end-to-end flow.

## Rollback

Redeploy the previous production commit if application issues arise. The added nullable column and tables are compatible with the old app; leave them in place to avoid losing new records. Disable Paystack collection before rolling back if any NGN subscriptions have been activated, since the old application only understands USD. Do not drop new tables as an automatic rollback.

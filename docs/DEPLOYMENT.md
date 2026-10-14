# Deployment runbook

Status: the code builds and tests without secrets. A live deployment needs access to the owner's Supabase and Vercel projects, Google API configuration, and optionally Paystack/Anthropic. These are not created by running the build.

## 1. Supabase

1. Select or create the intended project in Supabase.
2. Apply every SQL file in `supabase/migrations/` once, in filename order, using the SQL editor or your migration workflow. Do not re-run a successful migration. The follow-up migrations remove direct default grants from API roles and isolate privileged account functions in a private schema.
3. Copy the project URL and modern publishable key into `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` (the variable retains its legacy name for compatibility).
4. Put a Supabase secret key (or legacy service-role key) in `SUPABASE_SERVICE_ROLE_KEY`, **server-only**, as a Vercel Secret for Production. It is needed to save server-generated evidence and apply billing updates. Authenticated clients can update only their own stages/notes, never the evidence payload, plan or quota counters.
5. Enable email/password auth and email confirmation. Configure an email sender suitable for production in Supabase.
6. Set the Auth Site URL to the final production origin. Add exact allowed redirects for `/dashboard` and `/login?reset=1`; use separate preview URLs for any staging deployment.

Each user's audits and usage are isolated with row-level security. There is no public report-sharing route. Account deletion, if administered in Supabase, cascades to the user's audits and counters; cancel any billing subscription separately before deleting an account.

## 2. Google APIs

1. In the intended Google Cloud project, enable **Places API (New)** and **PageSpeed Insights API**.
2. Add `GOOGLE_PLACES_API_KEY` and `PAGESPEED_API_KEY` to server environment settings. Apply API restrictions appropriate to each key.
3. Places requires an eligible configured billing account. Set provider budgets/quotas before opening access. Foundry also enforces its own user limits. Discovery is currently paused: keep `GOOGLE_PLACES_ENABLED=false` until billing is restored.
4. PageSpeed may work without a key but can be rate-limited. A key is recommended for live use.

Searches return up to 10 businesses, with a median comparison excluding each business itself. Search proofs expire after 30 minutes. Re-run a search if an audit reports an expired result. Direct website audits ignore client-supplied review claims.

## 3. Optional Claude outreach

Set `ANTHROPIC_API_KEY` and an enabled model identifier in `ANTHROPIC_MODEL`. The provider receives the business name, audit findings, limitations and agency name. Keys remain on the server. Without these values, or if Claude fails or returns invalid output, Foundry returns an explicitly identified evidence-based template.

## 4. Paystack billing

Follow [PAYMENTS.md](PAYMENTS.md). Start in test mode. `PAYSTACK_BILLING_ENABLED=false` keeps new checkout disabled until account eligibility, dollar settlement, webhook delivery, business policies and lifecycle tests are ready. Do not mix test and live keys or plan codes. The old Paystack webhook route is retained solely for backwards compatibility; new checkout uses Paystack.

| Plan | Searches/month | Audits/month | Drafts/month |
| --- | --- | --- | --- |
| Free | 20 | 10 | 20 |
| Starter | 100 | 100 | 200 |
| Growth | 500 | 500 | 1,000 |
| Agency | 2,000 | 2,000 | 4,000 |

These are enforced monthly allowances, including for annual subscriptions. Updating production limits after migration requires a new migration replacing `plan_limit`.

## 5. Vercel

1. Connect `ademikun2023-cpu/Foundry` to the intended Vercel account/project.
2. Use the repository root, framework **Next.js**, Node.js **24.x**, build `npm run build`, and the default Next.js output directory. Clear any old static-site output-directory override.
3. Add environment values from `.env.example` for the intended environment. Public Supabase values are embedded at build time; redeploy after changing them.
4. Deploy the feature branch to a preview first. Keep production on `main` until the preview is verified.
5. Set preview `APP_URL` and Supabase redirects to the preview origin before testing accounts there.
6. After validation, merge the branch and deploy production. Set production `APP_URL`, Supabase redirects and Paystack webhook to the final production URL.

The audit route requests a 60-second function duration, with a 38-second PageSpeed timeout and bounded homepage inspection. Verify that the hosting plan supports that duration. A saved result is returned only after its database write succeeds.

## Live acceptance checks

- Create and confirm an account, sign out/in, reset the password, and refresh the session.
- Search a niche/city and verify Google attribution and review comparisons.
- Audit a public website; inspect the source URL, performance units, booking caveats and timestamp.
- Run a search-result batch; reload and confirm reports are saved.
- Use a second account and confirm it cannot retrieve the first account's audit IDs.
- Change stage/notes, export a report, copy an outreach draft, and delete a disposable audit.
- Check on a phone-sized browser and desktop. Keyboard navigation must reach all controls; the report dialog should retain focus and close with Escape.
- Use Paystack test mode to check payment, duplicate checkout attempts, cancellation and failed renewal. Plan changes currently require support; self-service prorated upgrades are not implemented. Replay a webhook; verify no duplicate entitlement changes.
- Confirm API errors never reveal secret values and missing providers return an honest unavailable state.

## Troubleshooting

- **Sample workspace after sign-in:** verify public Supabase environment values were present during the build, then redeploy.
- **Database unavailable:** verify migration completion and the correct project URL/key pairing.
- **Search unavailable:** verify Places API (New), billing, key restrictions and provider quota.
- **PageSpeed unknown:** upstream failure is recorded as unknown, not scored as a slow website; check the key/quota and retry later.
- **Paid plan not reflected:** check Paystack webhook delivery, mapped plan code, verified transaction amount/currency, customer association and paid expiry.
- **GitHub changes not visible:** a local commit is not a push. Publishing requires authenticated repository write access.

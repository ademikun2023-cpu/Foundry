# Paystack setup and launch checks

## Exact USD subscriptions

| Plan | Monthly amount | Annual amount | Annual monthly equivalent |
| --- | ---: | ---: | ---: |
| Starter | $30 | $200 | $16.67 |
| Growth | $200 | $799 | $66.58 |
| Agency | $500 | $1,199 | $99.92 |

Annual amounts are one charge for a full year. The displayed monthly equivalent is explanatory, never the charge amount. Allowances still reset monthly. These amounts are checked against Paystack before checkout and again when granting access. No automatic NGN conversion is performed.

## Account and environment

For a Nigerian business, Paystack USD collection requires approval and an eligible Zenith USD domiciliary settlement account. International-card acceptance alone does not imply USD settlement is enabled. Confirm eligibility with Paystack before enabling live checkout. Use the business account intended for Foundry.

1. Keep `PAYSTACK_BILLING_ENABLED=false` in production while preparing.
2. Set a **test** secret key as `PAYSTACK_SECRET_KEY` in a staging environment. Never paste it in chat, commit it, or use a NEXT_PUBLIC prefix. Hosted checkout does not require a public key here.
3. Create six USD recurring plans in Paystack. Monthly interval: `monthly`; yearly interval: `annually`. Amounts in cents: 3000, 20000, 20000, 79900, 50000, 119900. Use new dedicated Foundry plans; do not edit existing unrelated subscriptions.
4. Save the plan codes in the six `PAYSTACK_PLAN_*` variables listed in `.env.example`.
5. Set `APP_URL` to the deployment origin. Add the webhook URL `https://YOUR_DOMAIN/api/billing/paystack/webhook` in the same Paystack test environment. Paystack signs payloads with the secret key; there is no separate webhook secret for this integration.
6. Apply `20261013201300_paystack_billing.sql`. Payment tables/functions are accessible only to service_role; authenticated users cannot grant paid access.
7. Enable billing in staging and run every acceptance check below. Keep production disabled until these pass and support, privacy, terms, tax and refund arrangements are ready.
8. Repeat with live credentials and live plan codes only after USD approval. Redeploy after changing environment values. Avoid real payment tests without the owner's explicit approval.

## Implemented behavior

- Signed-in checkout reserves one pending payment per account under a database lock. Repeated clicks resume its URL. A different plan cannot open a competing checkout.
- Paystack hosts payment details. Foundry stores references, customer/subscription codes and payment timestamps; it does not store cards or reusable card authorizations.
- A return URL never grants access by itself. The authenticated return verifies the owned reference with Paystack; signed webhooks also verify transaction status, amount, USD currency, plan, customer and date.
- Recurring charges bind to the previously verified customer and plan. Unknown products in a shared Paystack account are ignored.
- References are idempotent. Older events cannot replace a newer paid period. Access expires after the verified month/year even if renewal webhooks stop arriving.
- Subscription events fetch the current provider state. Cancelling future renewal preserves already paid access. Manage billing opens the provider's subscription management page.
- New checkout is disabled independently of webhook processing and existing subscription management.

## Required staging acceptance checks

- All six plans show the exact prices and recurring intervals in hosted checkout.
- Successful checkout, return before webhook, webhook before return, and return while signed out.
- Repeated clicks/tabs, an abandoned checkout, declined card, provider timeout and lost network.
- Renewals, failed renewal, cancellation and duplicate/out-of-order webhook delivery.
- Access expires on a failed renewal; cancelling does not erase the paid period.
- Account A cannot verify account B's reference or read payment records.
- Refund/chargeback operations and support handling are rehearsed before launch.

Local automated tests simulate provider responses and run SQL under real PostgreSQL roles. They are not evidence of a successful live Paystack checkout or USD account approval.

## Current operational limits

Plan changes, restarting a previously cancelled subscription, refunds and disputes require support. No self-service prorations or automatic refund/chargeback entitlement changes are implemented. Before opening paid access, define and test the support process: verify the transaction and subscription in Paystack, stop any future renewal when appropriate, and adjust the paid entitlement through an authorized server-side operation. Never use the browser client to edit an account plan.

A checkout initialization timeout deliberately leaves its reservation intact because Paystack may have created the transaction. Operators must verify that reference with Paystack before recovery. Recover an existing authorization URL if available; do not clear an uncertain pending reference and create a second billable checkout. Do not delete accounts without first cancelling their provider subscription.

## Sources

- https://support.paystack.com/en/articles/2130690
- https://paystack.com/docs/payments/subscriptions/
- https://paystack.com/docs/api/transaction/
- https://paystack.com/docs/payments/webhooks/

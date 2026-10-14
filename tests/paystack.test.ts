import test from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import {
  billingReady,
  validatePayment,
  validSignature,
  verifyPlan,
  paymentUrl,
  confirmPayment,
  type Transaction,
} from "../lib/paystack";
import { PLANS } from "../lib/plans";
import { POST as webhook } from "../app/api/billing/paystack/webhook/route";
import { POST as billing } from "../app/api/billing/route";
const planKeys = PLANS.flatMap((p) =>
  ["monthly", "yearly"].map(
    (i) => `PAYSTACK_PLAN_${p.key.toUpperCase()}_${i.toUpperCase()}`,
  ),
);
function setup() {
  process.env.PAYSTACK_SECRET_KEY = "sk_test_fake";
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://test.supabase.co";
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "test-anon";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "test-service";
  process.env.APP_URL = "http://localhost:3000";
  planKeys.forEach((key, i) => {
    process.env[key] = `PLN_test${i}`;
  });
}
function cleanup() {
  for (const key of [
    ...planKeys,
    "PAYSTACK_SECRET_KEY",
    "PAYSTACK_BILLING_ENABLED",
    "NEXT_PUBLIC_SUPABASE_URL",
    "NEXT_PUBLIC_SUPABASE_ANON_KEY",
    "SUPABASE_SERVICE_ROLE_KEY",
    "APP_URL",
  ])
    delete process.env[key];
}
const uid = "11111111-1111-4111-8111-111111111111";
function transaction(overrides: Partial<Transaction> = {}): Transaction {
  return {
    reference: "foundry-test",
    status: "success",
    currency: "USD",
    amount: 20000,
    paid_at: new Date().toISOString(),
    customer: { customer_code: "CUS_test", email: "owner@example.com" },
    plan_object: { plan_code: "PLN_test1" },
    ...overrides,
  };
}
test("all six prices are exact and checkout requires explicit enablement", () => {
  setup();
  try {
    assert.deepEqual(
      PLANS.map((p) => [p.monthly, p.yearly]),
      [
        [30, 200],
        [200, 799],
        [500, 1199],
      ],
    );
    assert.equal(billingReady(), false);
    process.env.PAYSTACK_BILLING_ENABLED = "true";
    assert.equal(billingReady(), true);
    assert.deepEqual(
      validatePayment(transaction(), "foundry-test", "PLN_test1"),
      { plan: "starter", interval: "yearly", amount: 20000 },
    );
    for (const change of [
      { amount: 3000 },
      { currency: "NGN" },
      { status: "pending" },
      { reference: "another" },
      { plan_object: { plan_code: "PLN_test0" } },
      { paid_at: "invalid" },
    ])
      assert.throws(() =>
        validatePayment(transaction(change), "foundry-test", "PLN_test1"),
      );
  } finally {
    cleanup();
  }
});
test("Paystack signature validates raw bytes and rejects forged or changed payloads", async () => {
  setup();
  try {
    const body = Buffer.from('{"event":"unrelated.event"}');
    const signature = createHmac("sha512", process.env.PAYSTACK_SECRET_KEY!)
      .update(body)
      .digest("hex");
    assert.equal(validSignature(body, signature), true);
    assert.equal(validSignature(Buffer.from(body + " "), signature), false);
    for (const value of [null, "bad", "0".repeat(128)])
      assert.equal(validSignature(body, value), false);
    assert.equal(
      (
        await webhook(
          new Request("http://localhost/api/webhook", {
            method: "POST",
            headers: { "x-paystack-signature": signature },
            body,
          }),
        )
      ).status,
      200,
    );
    assert.equal(
      (
        await webhook(
          new Request("http://localhost/api/webhook", { method: "POST", body }),
        )
      ).status,
      400,
    );
    assert.equal(
      (
        await webhook(
          new Request("http://localhost/api/webhook", {
            method: "POST",
            body: "x".repeat(140000),
          }),
        )
      ).status,
      413,
    );
  } finally {
    cleanup();
  }
});
test("provider checkout plan must match advertised amount, currency and interval", async (t) => {
  setup();
  let plan = {
    plan_code: "PLN_test1",
    amount: 20000,
    currency: "USD",
    interval: "annually",
  };
  const stub = t.mock.method(globalThis, "fetch", async () =>
    Response.json({ status: true, data: plan }),
  );
  try {
    assert.equal(await verifyPlan("starter", "yearly"), "PLN_test1");
    plan = { ...plan, amount: 3000 };
    await assert.rejects(verifyPlan("starter", "yearly"), /advertised/);
    plan = { ...plan, amount: 20000, currency: "NGN" };
    await assert.rejects(verifyPlan("starter", "yearly"), /advertised/);
    plan = { ...plan, currency: "USD", interval: "monthly" };
    await assert.rejects(verifyPlan("starter", "yearly"), /advertised/);
    assert.throws(() =>
      paymentUrl("https://checkout.paystack.com.evil.example/pay"),
    );
    assert.throws(() => paymentUrl("https://evil.example/pay"));
    assert.equal(
      paymentUrl("https://checkout.paystack.com/test"),
      "https://checkout.paystack.com/test",
    );
  } finally {
    stub.mock.restore();
    cleanup();
  }
});
test("initial payment, authenticated return, recurring renewal and cancellation sync use verified ownership", async (t) => {
  setup();
  let checkout: object | null = {
    user_id: uid,
    plan_code: "PLN_test1",
    email: "owner@example.com",
  };
  let tx = transaction();
  const payments: object[] = [],
    accountUpdates: Record<string, unknown>[] = [];
  let verifies = 0;
  const stub = t.mock.method(
    globalThis,
    "fetch",
    async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      if (url.includes("paystack_checkouts")) return Response.json(checkout);
      if (url.includes("/transaction/verify/")) {
        verifies++;
        return Response.json({ status: true, data: tx });
      }
      if (url.includes("/rpc/apply_paystack_payment")) {
        payments.push(JSON.parse(String(init?.body)));
        return new Response(null, { status: 204 });
      }
      if (url.includes("/subscription/"))
        return Response.json({
          status: true,
          data: {
            subscription_code: "SUB_test",
            status: "non-renewing",
            customer: { customer_code: "CUS_test" },
            plan: { plan_code: "PLN_test1" },
          },
        });
      if (url.includes("/accounts")) {
        if (init?.method === "PATCH") {
          accountUpdates.push(JSON.parse(String(init.body)));
          return new Response(null, { status: 204 });
        }
        return Response.json({
          user_id: uid,
          paystack_subscription_code: "SUB_test",
        });
      }
      throw new Error("Unexpected request: " + url);
    },
  );
  try {
    await assert.rejects(
      confirmPayment("foundry-test", "another-user"),
      /not found/,
    );
    assert.equal(verifies, 0);
    assert.deepEqual(await confirmPayment("foundry-test", uid), {
      verified: true,
    });
    assert.equal(payments.length, 1);
    tx = transaction({ amount: 20001 });
    await assert.rejects(confirmPayment("foundry-test", uid));
    assert.equal(payments.length, 1);
    tx = transaction({
      customer: { customer_code: "CUS_test", email: "other@example.com" },
    });
    await assert.rejects(confirmPayment("foundry-test", uid), /customer/);
    checkout = null;
    tx = transaction({ reference: "renewal-1" });
    await confirmPayment("renewal-1");
    assert.equal(payments.length, 2);
    const body = JSON.stringify({
      event: "subscription.not_renew",
      data: { subscription_code: "SUB_test" },
    });
    const signature = createHmac("sha512", process.env.PAYSTACK_SECRET_KEY!)
      .update(body)
      .digest("hex");
    const res = await webhook(
      new Request("http://localhost/api/webhook", {
        method: "POST",
        headers: { "x-paystack-signature": signature },
        body,
      }),
    );
    assert.equal(res.status, 200);
    assert.deepEqual(accountUpdates[0], {
      paystack_subscription_code: "SUB_test",
      paystack_status: "non-renewing",
    });
    // No cancellation webhook can erase the already paid expiry.
    assert.equal("subscription_expires_at" in accountUpdates[0], false);
  } finally {
    stub.mock.restore();
    cleanup();
  }
});
test("billing return cannot grant access without a session", async () => {
  setup();
  try {
    const res = await billing(
      new Request("http://localhost:3000/api/billing", {
        method: "POST",
        body: JSON.stringify({ action: "verify", reference: "foundry-test" }),
      }),
    );
    assert.equal(res.status, 401);
  } finally {
    cleanup();
  }
});
test("checkout sends the server-selected yearly total and reuses a saved provider URL", async (t) => {
  setup();
  process.env.PAYSTACK_BILLING_ENABLED = "true";
  let savedUrl: string | undefined;
  let initializes = 0;
  const stub = t.mock.method(
    globalThis,
    "fetch",
    async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      if (url.includes("/auth/v1/user"))
        return Response.json({
          id: uid,
          email: "owner@example.com",
          email_confirmed_at: new Date().toISOString(),
          aud: "authenticated",
        });
      if (url.includes("/rpc/consume_usage"))
        return Response.json({ allowed: true });
      if (url.includes("/plan/"))
        return Response.json({
          status: true,
          data: {
            plan_code: "PLN_test3",
            amount: 79900,
            currency: "USD",
            interval: "annually",
          },
        });
      if (url.includes("/rpc/reserve_paystack_checkout"))
        return Response.json({
          reference: "foundry-reserved",
          plan_code: "PLN_test3",
          authorization_url: savedUrl,
          fresh: !savedUrl,
        });
      if (url.includes("/transaction/initialize")) {
        initializes++;
        const body = JSON.parse(String(init?.body));
        assert.equal(body.amount, "79900");
        assert.equal(body.currency, "USD");
        assert.equal(body.plan, "PLN_test3");
        assert.equal(body.reference, "foundry-reserved");
        assert.equal(body.email, "owner@example.com");
        return Response.json({
          status: true,
          data: {
            reference: "foundry-reserved",
            authorization_url: "https://checkout.paystack.com/test",
          },
        });
      }
      if (url.includes("/paystack_checkouts") && init?.method === "PATCH") {
        savedUrl = JSON.parse(String(init.body)).authorization_url;
        return new Response(null, { status: 204 });
      }
      throw new Error("Unexpected request: " + url);
    },
  );
  try {
    const request = () =>
      new Request("http://localhost:3000/api/billing", {
        method: "POST",
        headers: { authorization: "Bearer test-token" },
        body: JSON.stringify({
          action: "checkout",
          plan: "growth",
          interval: "yearly",
          amount: 1,
        }),
      });
    const first = await billing(request());
    assert.equal(first.status, 200);
    assert.equal(
      (await first.json()).url,
      "https://checkout.paystack.com/test",
    );
    assert.equal((await billing(request())).status, 200);
    assert.equal(initializes, 1);
  } finally {
    stub.mock.restore();
    cleanup();
  }
});

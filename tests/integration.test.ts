import test from "node:test";
import assert from "node:assert/strict";
import { POST as search } from "../app/api/search/route";
import { POST as audit } from "../app/api/audits/route";
import { POST as outreach } from "../app/api/outreach/route";
import { POST as webhook } from "../app/api/billing/webhook/route";
import type { Audit, Business } from "../lib/types";
test("search → signed audit → persisted report → outreach with simulated providers", async (t) => {
  const env = {
    NEXT_PUBLIC_SUPABASE_URL: "https://test.supabase.co",
    NEXT_PUBLIC_SUPABASE_ANON_KEY: "test-anon",
    SUPABASE_SERVICE_ROLE_KEY: "test-service",
    GOOGLE_PLACES_API_KEY: "test-google",
    GOOGLE_PLACES_ENABLED: "true",
  };
  Object.assign(process.env, env);
  let saved: Audit | undefined;
  let draftStored = false;
  const userId = "11111111-1111-4111-8111-111111111111";
  const stub = t.mock.method(
    globalThis,
    "fetch",
    async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      const method = init?.method || "GET";
      if (url.includes("/auth/v1/user"))
        return Response.json({
          id: userId,
          email: "test@example.com",
          aud: "authenticated",
          app_metadata: {},
          user_metadata: {},
        });
      if (url.includes("/rest/v1/rpc/consume_usage"))
        return Response.json({ allowed: true });
      if (url.includes("places.googleapis.com"))
        return Response.json({
          places: [
            {
              id: "place-1",
              displayName: { text: "Test plumbing" },
              userRatingCount: 10,
              googleMapsUri: "https://maps.google.com/?cid=1",
            },
            {
              id: "place-2",
              displayName: { text: "Test competitor" },
              userRatingCount: 100,
            },
          ],
        });
      if (url.includes("/rest/v1/audits") && method === "POST") {
        const body = JSON.parse(String(init?.body));
        assert.equal(body.user_id, userId);
        saved = body.payload;
        return new Response(null, { status: 201 });
      }
      if (url.includes("/rest/v1/audits") && method === "GET")
        return Response.json({ payload: saved });
      if (url.includes("/rest/v1/audits") && method === "PATCH") {
        const body = JSON.parse(String(init?.body));
        assert.deepEqual(Object.keys(body), ["outreach"]);
        assert.ok(url.includes(`user_id=eq.${userId}`));
        draftStored = true;
        return new Response(null, { status: 204 });
      }
      throw new Error("Unexpected test request: " + url);
    },
  );
  function request(path: string, body: unknown) {
    return new Request("http://localhost:3000" + path, {
      method: "POST",
      headers: {
        Authorization: "Bearer test-token",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
  }
  try {
    const result = await search(
      request("/api/search", { niche: "plumbers", city: "Miami" }),
    );
    assert.equal(result.status, 200);
    const data = (await result.json()) as { businesses: Business[] };
    assert.equal(data.businesses[0].reviewBenchmark, 100);
    assert.ok(data.businesses[0].sourceToken);
    // A changed review count in the submitted body cannot change signed evidence.
    const scan = await audit(
      request("/api/audits", { ...data.businesses[0], reviewCount: 999 }),
    );
    assert.equal(scan.status, 201);
    const record = (await scan.json()).audit as Audit;
    assert.equal(record.metrics.reviewCount, 10);
    assert.equal(record.metrics.reviewBenchmark, 100);
    assert.equal(record.scoring.score, 90);
    assert.equal(record.scoring.coverage, 35);
    assert.equal(saved?.id, record.id);
    const draft = await outreach(
      request("/api/outreach", { auditId: record.id, agency: "Test agency" }),
    );
    assert.equal(draft.status, 200);
    assert.equal((await draft.json()).outreach.source, "template");
    assert.equal(draftStored, true);
    const direct = await audit(
      request("/api/audits", {
        name: "Direct business",
        website: null,
        reviewCount: 999,
        reviewBenchmark: 1000,
      }),
    );
    assert.equal(direct.status, 201);
    assert.equal((await direct.json()).audit.metrics.reviewCount, null);
  } finally {
    stub.mock.restore();
    for (const key of Object.keys(env)) delete process.env[key];
  }
});
test("configured webhook rejects a forged Stripe signature", async () => {
  process.env.STRIPE_SECRET_KEY = "sk_test_not_real";
  process.env.STRIPE_WEBHOOK_SECRET = "whsec_not_real";
  try {
    const response = await webhook(
      new Request("http://localhost/api/billing/webhook", {
        method: "POST",
        headers: { "stripe-signature": "t=1,v1=fake" },
        body: "{}",
      }),
    );
    assert.equal(response.status, 400);
  } finally {
    delete process.env.STRIPE_SECRET_KEY;
    delete process.env.STRIPE_WEBHOOK_SECRET;
  }
});

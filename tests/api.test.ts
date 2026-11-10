import test from "node:test";
import assert from "node:assert/strict";
import { GET as config } from "../app/api/config/route";
import { POST as search } from "../app/api/search/route";
import { POST as audit } from "../app/api/audits/route";
import { POST as billing } from "../app/api/billing/route";
import { POST as webhook } from "../app/api/billing/webhook/route";
import { readBody } from "../lib/server";
import { z } from "zod";
test("configuration exposes availability, never credentials", async () => {
  const res = config();
  assert.equal(res.status, 200);
  const data = await res.json();
  assert.ok(Object.values(data).every((x) => typeof x === "boolean"));
  assert.equal(data.auth, false);
});
test("unconfigured live endpoints fail closed", async () => {
  for (const handler of [search, audit, billing]) {
    const res = await handler(
      new Request("http://localhost:3000/api/test", {
        method: "POST",
        body: "{}",
      }),
    );
    assert.equal(res.status, 503);
  }
});
test("configured endpoints require a verified session", async () => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://test.supabase.co";
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "test-only";
  try {
    const res = await search(
      new Request("http://localhost:3000/api/search", {
        method: "POST",
        body: "{}",
      }),
    );
    assert.equal(res.status, 401);
  } finally {
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  }
});
test("cross-origin mutation is rejected before provider calls", async () => {
  const res = await audit(
    new Request("http://localhost:3000/api/audits", {
      method: "POST",
      headers: { origin: "https://evil.example" },
      body: "{}",
    }),
  );
  assert.equal(res.status, 403);
});
test("unconfigured webhook cannot grant access", async () => {
  assert.equal(
    (
      await webhook(
        new Request("http://localhost:3000/api/billing/webhook", {
          method: "POST",
          body: "{}",
        }),
      )
    ).status,
    503,
  );
});
test("request limits work even without a content-length header", async () => {
  await assert.rejects(
    readBody(
      new Request("http://localhost", {
        method: "POST",
        body: JSON.stringify({ text: "x".repeat(20000) }),
      }),
      z.object({ text: z.string() }),
    ),
    /too large/,
  );
});

import test from "node:test";
import assert from "node:assert/strict";
import { scoreOpportunity, median } from "../lib/scoring";
import { isPublicAddress, parsePublicUrl } from "../lib/safe-fetch";
import { inspectHtml } from "../lib/audit";
import { reportHtml } from "../lib/report";
import { demoAudits } from "../lib/demo";
import { signBusiness, verifiedBusiness } from "../lib/search-proof";
import { templateOutreach } from "../lib/outreach";
import type { Metrics } from "../lib/types";
const empty: Metrics = {
  performance: null,
  lcpMs: null,
  https: null,
  mobileViewport: null,
  booking: "unknown",
  bookingUrl: null,
  socialLinks: [],
  reviewCount: null,
  reviewBenchmark: null,
};
test("unknown evidence never becomes a poor score", () => {
  assert.deepEqual(scoreOpportunity(empty).score, null);
  assert.equal(scoreOpportunity(empty).coverage, 0);
});
test("score rescaling reports its reduced evidence coverage", () => {
  const s = scoreOpportunity({ ...empty, performance: 25 });
  assert.equal(s.score, 75);
  assert.equal(s.coverage, 40);
});
test("known good performance, review count and booking yield zero opportunity", () => {
  assert.equal(
    scoreOpportunity({
      ...empty,
      performance: 100,
      reviewCount: 200,
      reviewBenchmark: 100,
      booking: "detected",
    }).score,
    0,
  );
});
test("zero or missing benchmark does not invent a review gap", () => {
  assert.equal(
    scoreOpportunity({ ...empty, reviewCount: 0, reviewBenchmark: 0 }).coverage,
    0,
  );
  assert.equal(median([]), null);
  assert.equal(median([1, 3, 7, 9]), 5);
});
test("scores stay bounded over realistic metrics", () => {
  for (let performance = 0; performance <= 100; performance += 10) {
    const s = scoreOpportunity({
      ...empty,
      performance,
      reviewCount: 0,
      reviewBenchmark: 100,
      booking: "not_detected",
    });
    assert.ok(s.score! >= 0 && s.score! <= 100);
    assert.equal(s.coverage, 100);
  }
});
test("SSRF blocks private, mapped, reserved and alternate IPv4 formats", () => {
  for (const ip of [
    "127.0.0.1",
    "10.0.0.1",
    "172.16.0.1",
    "192.168.1.1",
    "169.254.169.254",
    "0.0.0.0",
    "100.64.0.1",
    "224.0.0.1",
    "::1",
    "::ffff:127.0.0.1",
    "fc00::1",
    "fe80::1",
    "2001:db8::1",
  ])
    assert.equal(isPublicAddress(ip), false, ip);
  for (const url of [
    "http://localhost",
    "http://127.1",
    "http://2130706433",
    "http://0x7f000001",
    "http://[::1]",
    "http://169.254.169.254",
    "https://example.com:8080",
    "file:///etc/passwd",
    "https://user:secret@example.com",
  ])
    assert.throws(() => parsePublicUrl(url), url);
  assert.equal(isPublicAddress("8.8.8.8"), true);
  assert.equal(parsePublicUrl("https://example.com").hostname, "example.com");
});
test("booking inspection distinguishes links from mere marketing text", () => {
  assert.equal(
    inspectHtml("<p>Book now for great service</p>", "https://example.com")
      .booking,
    "not_detected",
  );
  assert.equal(
    inspectHtml(
      '<a href="javascript:alert(1)">Book now</a>',
      "https://example.com",
    ).booking,
    "not_detected",
  );
  assert.equal(
    inspectHtml('<a href="#">Book now</a>', "https://example.com").booking,
    "not_detected",
  );
  const check = inspectHtml(
    '<meta name="viewport" content="width=device-width"><a href="/booking">Book now</a><a href="https://instagram.com/sample">Social</a>',
    "https://example.com",
  );
  assert.equal(check.booking, "detected");
  assert.equal(check.bookingUrl, "https://example.com/booking");
  assert.equal(check.mobileViewport, true);
  assert.deepEqual(check.socialLinks, ["https://instagram.com/sample"]);
});
test("downloaded reports escape stored values and exclude private notes", () => {
  const a = demoAudits()[0];
  a.business.name = "<script>alert(1)</script>";
  a.notes = "SECRET PRIVATE NOTE";
  const html = reportHtml(a, "<img src=x onerror=alert(1)>");
  assert.ok(!html.includes("<script>"));
  assert.ok(!html.includes("<img"));
  assert.ok(!html.includes("SECRET PRIVATE NOTE"));
  assert.ok(html.includes("FICTIONAL SAMPLE"));
});
test("search proof rejects edits, wrong users and expiration", () => {
  process.env.SUPABASE_SERVICE_ROLE_KEY = "test-only-not-a-real-secret";
  const business = {
    name: "Test business",
    website: "https://example.com",
    reviewCount: 12,
  };
  const token = signBusiness(business, "owner", 1000);
  assert.deepEqual(verifiedBusiness(token, "owner", 2000), business);
  assert.throws(() => verifiedBusiness(token, "someone-else", 2000));
  assert.throws(() => verifiedBusiness(token, "owner", 1000 + 31 * 60 * 1000));
  const [payload, sig] = token.split(".");
  const changed = JSON.parse(Buffer.from(payload, "base64url").toString());
  changed.business.reviewCount = 999;
  assert.throws(() =>
    verifiedBusiness(
      Buffer.from(JSON.stringify(changed)).toString("base64url") + "." + sig,
      "owner",
      2000,
    ),
  );
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;
});
test("outreach identifies limitations and does not invent lost revenue", () => {
  const draft = templateOutreach(demoAudits()[0], "Sample agency");
  assert.equal(draft.source, "template");
  assert.ok(draft.email.includes("rather than a measurement of lost revenue"));
  assert.ok(draft.email.includes("Sample agency"));
  assert.ok(!draft.email.includes("$"));
});

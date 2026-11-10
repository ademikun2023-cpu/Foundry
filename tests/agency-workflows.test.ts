import test from "node:test";
import assert from "node:assert/strict";
import { PGlite } from "@electric-sql/pglite";
import { readFile, readdir } from "node:fs/promises";
import { importProspects } from "../lib/import-prospects";
import { demoAudits } from "../lib/demo";
import { publicAudit, reportHtml } from "../lib/report";
import { isFollowUpDue, profileSchema } from "../lib/agency";
import { templateOutreach } from "../lib/outreach";
import { billingAmount } from "../lib/billing-catalog";
const a = "11111111-1111-4111-8111-111111111111",
  b = "22222222-2222-4222-8222-222222222222";
test("CSV import accepts quoted names, removes duplicate URLs and rejects oversized batches", () => {
  assert.deepEqual(
    importProspects(
      'name,website\r\n"Smith, Plumbing",https://example.com\r\nDuplicate,https://example.com/',
    ),
    [{ name: "Smith, Plumbing", website: "https://example.com/" }],
  );
  assert.equal(importProspects("example.com\nhttps://two.example").length, 2);
  assert.throws(
    () =>
      importProspects(
        Array.from({ length: 6 }, (_, i) => `https://site${i}.example`).join(
          "\n",
        ),
      ),
    /up to 5/,
  );
  assert.throws(
    () => importProspects('"unclosed,https://example.com'),
    /unclosed/,
  );
  assert.throws(
    () => importProspects("https://user:password@example.com"),
    /public HTTP/,
  );
});
test("shared report snapshots exclude private data and escape branding", () => {
  const audit = demoAudits()[0];
  audit.notes = "PRIVATE NOTE";
  audit.followUpDate = "2030-01-01";
  audit.outreach = templateOutreach(audit, "Private agency");
  audit.business.sourceToken = "SECRET PROOF";
  const published = publicAudit(audit),
    raw = JSON.stringify(published);
  assert.ok(
    !raw.includes("PRIVATE NOTE") &&
      !raw.includes("SECRET PROOF") &&
      !raw.includes("followUpDate") &&
      !raw.includes('"outreach"'),
  );
  const html = reportHtml(
    published,
    "<script>alert(1)</script>",
    "javascript:alert(1)",
  );
  assert.ok(!html.includes("<script>") && !html.includes('src="javascript:'));
  assert.ok(html.includes("&lt;script&gt;"));
  assert.equal(
    profileSchema.safeParse({
      name: "Agency",
      logo: "data:image/svg+xml;base64,AAAA",
      service: "Web design",
      tone: "friendly",
    }).success,
    false,
  );
});
test("follow-up reminders exclude future dates and closed prospects", () => {
  assert.ok(
    isFollowUpDue(
      { stage: "Contacted", followUpDate: "2026-11-09" },
      "2026-11-10",
    ),
  );
  assert.ok(
    !isFollowUpDue(
      { stage: "Closed", followUpDate: "2026-11-09" },
      "2026-11-10",
    ),
  );
  assert.ok(
    !isFollowUpDue(
      { stage: "New lead", followUpDate: "2026-11-11" },
      "2026-11-10",
    ),
  );
});
test("NGN prices must be explicitly configured, never guessed from USD", () => {
  assert.equal(billingAmount("starter", "monthly", "NGN"), null);
  process.env.PAYSTACK_PRICE_NGN_STARTER_MONTHLY = "5000000";
  assert.equal(billingAmount("starter", "monthly", "NGN"), 5000000);
  process.env.PAYSTACK_PRICE_NGN_STARTER_MONTHLY = "50.50";
  assert.equal(billingAmount("starter", "monthly", "NGN"), null);
  delete process.env.PAYSTACK_PRICE_NGN_STARTER_MONTHLY;
});
test("agency database ownership, atomic job quotas, leases and NGN verification", async () => {
  const db = new PGlite();
  try {
    await db.exec(
      `create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema auth to authenticated;grant execute on function auth.uid() to authenticated;insert into auth.users values('${a}'),('${b}');alter default privileges in schema public grant execute on functions to anon,authenticated,service_role;`,
    );
    const folder = new URL("../supabase/migrations/", import.meta.url);
    for (const file of (await readdir(folder))
      .filter((f) => f.endsWith(".sql"))
      .sort())
      await db.exec(await readFile(new URL(file, folder), "utf8"));
    await db.exec(
      `grant usage on schema public to anon,authenticated,service_role;set role authenticated;set request.jwt.claim.sub='${a}';`,
    );
    await db.query(
      "insert into agency_profiles(user_id,name) values($1,'Agency A')",
      [a],
    );
    await assert.rejects(
      db.query("insert into agency_profiles(user_id,name) values($1,'Other')", [
        b,
      ]),
    );
    const input = JSON.stringify([
      { name: "One", website: "https://one.example", reviewCount: 999 },
      { name: "Two", website: "https://two.example" },
    ]);
    const request = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
    const queue = () =>
      db.query<{ ids: string[] }>("select enqueue_audits($1,$2::jsonb) ids", [
        request,
        input,
      ]);
    const first = (await queue()).rows[0].ids;
    assert.equal(first.length, 2);
    assert.deepEqual((await queue()).rows[0].ids, first);
    assert.equal(
      (
        await db.query<{ used: number }>(
          "select used from usage_counters where action='audit' and length(period)=7",
        )
      ).rows[0].used,
      2,
    );
    assert.ok(
      !(
        await db.query<{ business: object }>("select business from audit_jobs")
      ).rows.some((r) => "reviewCount" in r.business),
    );
    await assert.rejects(db.query("select claim_audit_job($1)", [a]));
    await assert.rejects(db.query("update audit_jobs set status='completed'"));
    await db.exec(`set request.jwt.claim.sub='${b}'`);
    assert.equal((await db.query("select * from audit_jobs")).rows.length, 0);
    assert.equal(
      (await db.query("select * from agency_profiles")).rows.length,
      0,
    );
    await db.exec("reset role;set role service_role");
    const claim = () =>
      db.query<{ job: { id: string; run_token: string } }>(
        "select claim_audit_job($1) job",
        [a],
      );
    const jobs = await Promise.all([claim(), claim()]);
    assert.notEqual(jobs[0].rows[0].job.id, jobs[1].rows[0].job.id);
    assert.equal((await claim()).rows[0].job, null);
    const job = jobs[0].rows[0].job;
    assert.equal(
      (
        await db.query<{ ok: boolean }>(
          "select finish_audit_job($1,$2,'{}',null) ok",
          [job.id, request],
        )
      ).rows[0].ok,
      false,
    );
    const audit = demoAudits()[0];
    audit.id = job.id;
    assert.equal(
      (
        await db.query<{ ok: boolean }>(
          "select finish_audit_job($1,$2,$3,null) ok",
          [job.id, job.run_token, JSON.stringify(audit)],
        )
      ).rows[0].ok,
      true,
    );
    assert.equal(
      (
        await db.query<{ ok: boolean }>(
          "select finish_audit_job($1,$2,$3,null) ok",
          [job.id, job.run_token, JSON.stringify(audit)],
        )
      ).rows[0].ok,
      false,
    );
    const second = jobs[1].rows[0].job;
    await db.query(
      "select finish_audit_job($1,$2,null,'Provider unavailable')",
      [second.id, second.run_token],
    );
    await db.exec(`set role authenticated;set request.jwt.claim.sub='${a}'`);
    await db.query(
      "update audits set follow_up_date='2026-11-10',notes='My private note' where id=$1",
      [job.id],
    );
    await assert.rejects(
      db.query("select enqueue_audits($1,$2::jsonb)", [
        b,
        JSON.stringify(
          Array.from({ length: 4 }, (_, i) => ({
            name: "Batch " + i,
            website: `https://b${i}.example`,
          })),
        ),
      ]),
    );
    assert.equal(
      (
        await db.query<{ used: number }>(
          "select used from usage_counters where action='audit' and length(period)=7",
        )
      ).rows[0].used,
      2,
    );
    await db.exec("reset role;set role service_role");
    await db.query(
      "insert into report_shares(token,audit_id,user_id,snapshot,expires_at) values($1,$2,$3,$4,now()+interval '30 days')",
      [
        "a".repeat(64),
        job.id,
        a,
        JSON.stringify({ audit: publicAudit(audit) }),
      ],
    );
    await db.exec(`set role authenticated;set request.jwt.claim.sub='${b}'`);
    assert.equal(
      (await db.query("select * from report_shares")).rows.length,
      0,
    );
    await db.exec("reset role;set role anon");
    await assert.rejects(db.query("select * from report_shares"));
    await assert.rejects(
      db.query("select enqueue_audits($1,$2::jsonb)", [request, input]),
    );
    await db.exec("reset role;set role service_role");
    await db.query(
      "insert into billing_prices values('PLN_naira','starter','monthly','NGN',5000000)",
    );
    await db.query(
      "select reserve_paystack_checkout($1,'ngn-payment','PLN_naira','starter','monthly','test@example.com')",
      [a],
    );
    const pay = (amount: number, currency: string) =>
      db.query(
        "select apply_paystack_payment('ngn-payment',$1,'CUS_naira','PLN_naira','starter','monthly',$2,$3,now())",
        [a, amount, currency],
      );
    await assert.rejects(pay(5000, "NGN"));
    await assert.rejects(pay(5000000, "GBP"));
    await pay(5000000, "NGN");
    assert.equal(
      (
        await db.query<{ currency: string }>(
          "select currency from paystack_payments",
        )
      ).rows[0].currency,
      "NGN",
    );
  } finally {
    await db.close();
  }
});

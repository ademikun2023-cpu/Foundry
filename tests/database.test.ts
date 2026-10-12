import { PGlite } from "@electric-sql/pglite";
import { readFile, readdir } from "node:fs/promises";
import test from "node:test";
import assert from "node:assert/strict";
const userA = "11111111-1111-4111-8111-111111111111",
  userB = "22222222-2222-4222-8222-222222222222";
test("database migration enforces ownership, quotas and billing authority", async (t) => {
  const db = new PGlite();
  await db.exec(
    `create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema auth to authenticated;grant execute on function auth.uid() to authenticated;insert into auth.users values('${userA}'),('${userB}');`,
  );
  // Reproduce Supabase's direct default grants, not just vanilla PostgreSQL.
  await db.exec("alter default privileges in schema public grant execute on functions to anon, authenticated, service_role");
  const migrations = new URL("../supabase/migrations/", import.meta.url);
  for (const file of (await readdir(migrations)).filter((f) => f.endsWith(".sql")).sort()) {
    await db.exec(await readFile(new URL(file, migrations), "utf8"));
  }
  await db.exec(
    `grant usage on schema public to authenticated,anon,service_role;set role authenticated;set request.jwt.claim.sub='${userA}';`,
  );
  await t.test("new accounts start on free with zero usage", async () => {
    const { rows } = await db.query<{
      account: { plan: string; usage: { used: number }[] };
    }>("select get_account() as account");
    assert.equal(rows[0].account.plan, "free");
    assert.ok(rows[0].account.usage.every((u) => u.used === 0));
  });
  await t.test("burst limits are atomic", async () => {
    const values = await Promise.all(
      Array.from({ length: 8 }, () =>
        db.query<{ result: { allowed: boolean } }>(
          "select consume_usage('audit') as result",
        ),
      ),
    );
    assert.equal(values.filter((v) => v.rows[0].result.allowed).length, 5);
  });
  await t.test(
    "server creates evidence; owner can read and annotate it",
    async () => {
      await db.exec("reset role");
      await db.query("insert into audits(user_id,payload) values($1,$2)", [
        userA,
        JSON.stringify({ business: { name: "A business" } }),
      ]);
      await db.exec("set role authenticated");
      const { rows } = await db.query("select * from audits");
      assert.equal(rows.length, 1);
      await db.query("update audits set notes='My note',stage='Contacted'");
      await assert.rejects(db.query("update audits set payload='{}'"));
      await assert.rejects(
        db.query("insert into audits(user_id,payload) values($1,$2)", [
          userA,
          "{}",
        ]),
      );
    },
  );
  await t.test(
    "second account cannot read, update, delete or insert the first account’s data",
    async () => {
      await db.exec(`set request.jwt.claim.sub='${userB}'`);
      assert.equal((await db.query("select * from audits")).rows.length, 0);
      assert.equal(
        (await db.query("update audits set notes='hijacked' returning id")).rows
          .length,
        0,
      );
      assert.equal(
        (await db.query("delete from audits returning id")).rows.length,
        0,
      );
      await assert.rejects(
        db.query("insert into audits(user_id,payload) values($1,$2)", [
          userA,
          "{}",
        ]),
      );
    },
  );
  await t.test(
    "authenticated users cannot set their plan or forge a webhook",
    async () => {
      await assert.rejects(db.query("update accounts set plan='agency'"));
      await assert.rejects(
        db.query(
          "select apply_subscription('fake',1,'cus_test','sub_test','agency','active',now())",
        ),
      );
      await assert.rejects(db.query("update usage_counters set used=0"));
    },
  );
  await t.test("monthly allowance cannot be exceeded", async () => {
    await db.exec(
      `reset role;update usage_counters set used=10 where user_id='${userA}' and action='audit' and length(period)=7;set role authenticated;set request.jwt.claim.sub='${userA}';`,
    );
    const { rows } = await db.query<{
      result: { allowed: boolean; reason: string };
    }>("select consume_usage('audit') as result");
    assert.equal(rows[0].result.allowed, false);
    assert.match(rows[0].result.reason, /Monthly/);
  });
  await t.test(
    "webhooks are idempotent and older events cannot downgrade newer state",
    async () => {
      await db.exec(
        `reset role;update accounts set stripe_customer_id='cus_test' where user_id='${userA}';select apply_subscription('evt_new',200,'cus_test','sub_test','growth','active',now()+interval '1 month');select apply_subscription('evt_old',100,'cus_test','sub_test','free','canceled',now());select apply_subscription('evt_new',201,'cus_test','sub_test','free','canceled',now());`,
      );
      const { rows } = await db.query<{ plan: string }>(
        `select plan from accounts where user_id='${userA}'`,
      );
      assert.equal(rows[0].plan, "growth");
    },
  );
  await t.test("expired paid plans cannot retain paid allowances", async () => {
    await db.exec(
      `update accounts set subscription_expires_at=now()-interval '1 day' where user_id='${userA}';set role authenticated;set request.jwt.claim.sub='${userA}';`,
    );
    const { rows } = await db.query<{ account: { plan: string } }>(
      "select get_account() as account",
    );
    assert.equal(rows[0].account.plan, "free");
  });
  await t.test(
    "anonymous callers cannot consume quotas or see audits",
    async () => {
      await db.exec("reset role;set role anon");
      await assert.rejects(db.query("select consume_usage('audit')"));
      await assert.rejects(db.query("select * from audits"));
    },
  );
  await db.close();
});

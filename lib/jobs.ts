import { adminDb } from "./server";
import { runAudit } from "./audit";
import type { AuditJob } from "./types";
export async function processAuditJobs(userId: string) {
  const db = adminDb();
  async function worker() {
    for (let i = 0; i < 5; i++) {
      const { data, error } = await db.rpc("claim_audit_job", {
        owner_id: userId,
      });
      if (error || !data) return;
      const job = data as AuditJob & { run_token: string };
      try {
        const audit = await runAudit(job.business);
        const { error: saveError } = await db.rpc("finish_audit_job", {
          job_id: job.id,
          lease: job.run_token,
          result: audit,
          failure: null,
        });
        if (saveError)
          console.error("Audit queue save failed; lease will be recoverable.");
      } catch {
        await db.rpc("finish_audit_job", {
          job_id: job.id,
          lease: job.run_token,
          result: null,
          failure:
            "We could not complete this website audit. Check the address and retry.",
        });
      }
    }
  }
  await Promise.all([worker(), worker()]);
}

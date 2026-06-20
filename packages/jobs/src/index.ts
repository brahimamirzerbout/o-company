// =============================================================================
// o.company · background jobs
// =============================================================================
// A tiny Postgres-backed job runner. No Redis, no Sidekiq, no Temporal.
// We use SKIP LOCKED on a single table and pull work in a tight loop.
// This is intentionally small; in production we'd swap it for Inngest or
// Cloudflare Queues, but the API is the same.

import { sql, eq, and, lt } from "drizzle-orm";
import { jobs } from "@o/db/schema";
import { getDb, getClient } from "@o/db/client";
import { logger } from "@o/logger";

type Handler<T = unknown> = (payload: T, ctx: { jobId: string; orgId: string | null }) => Promise<void>;

const handlers = new Map<string, Handler>();

/** Register a job handler. The kind string is the contract. */
export function registerJob<T>(kind: string, handler: Handler<T>) {
  handlers.set(kind, handler as Handler);
}

/** Enqueue a job. The payload must be JSON-serializable. */
export async function enqueue<T>(opts: {
  kind: string;
  payload: T;
  orgId?: string;
  runAt?: Date;
}) {
  const db = getDb();
  const [job] = await db.insert(jobs).values({
    kind: opts.kind,
    payload: opts.payload as unknown,
    runAt: opts.runAt ?? new Date(),
    orgId: opts.orgId ?? null,
  }).returning();
  logger.info("job.enqueued", { jobId: job.id, kind: opts.kind });
  return job;
}

/** Run the worker loop. Polls every `intervalMs` until cancelled. */
export async function runWorker(opts: { intervalMs?: number; batchSize?: number } = {}) {
  const interval = opts.intervalMs ?? 1000;
  const batch = opts.batchSize ?? 10;
  const stop = { v: false };
  const onSignal = () => { stop.v = true; };
  process.once("SIGINT", onSignal);
  process.once("SIGTERM", onSignal);

  logger.info("worker.started", { interval, batch });
  while (!stop.v) {
    const processed = await processBatch(batch);
    if (processed === 0) await sleep(interval);
  }
  logger.info("worker.stopped");
}

async function processBatch(limit: number): Promise<number> {
  const db = getDb();
  // Atomically claim a batch of jobs. SKIP LOCKED keeps multiple workers
  // from picking up the same job. UPDATE … RETURNING gives us the rows.
  const claimed = await db.execute(sql`
    UPDATE jobs
    SET status = 'running', started_at = NOW(), attempts = attempts + 1
    WHERE id IN (
      SELECT id FROM jobs
      WHERE status = 'queued' AND run_at <= NOW()
      ORDER BY run_at
      LIMIT ${limit}
      FOR UPDATE SKIP LOCKED
    )
    RETURNING id, kind, payload, org_id
  `);
  const rows = (claimed as unknown as { rows: Array<{ id: string; kind: string; payload: unknown; org_id: string | null }> }).rows;
  if (rows.length === 0) return 0;

  for (const row of rows) {
    const handler = handlers.get(row.kind);
    if (!handler) {
      logger.warn("job.no_handler", { jobId: row.id, kind: row.kind });
      await db.update(jobs)
        .set({ status: "failed", lastError: `No handler for kind: ${row.kind}`, finishedAt: new Date() })
        .where(eq(jobs.id, row.id));
      continue;
    }
    try {
      await handler(row.payload, { jobId: row.id, orgId: row.org_id });
      await db.update(jobs)
        .set({ status: "succeeded", finishedAt: new Date() })
        .where(eq(jobs.id, row.id));
      logger.info("job.ok", { jobId: row.id, kind: row.kind });
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      const attempts = (await db.select({ a: jobs.attempts }).from(jobs).where(eq(jobs.id, row.id)))[0]?.a ?? 1;
      const isDead = attempts >= 5;
      await db.update(jobs)
        .set({ status: isDead ? "dead" : "queued", lastError: message, finishedAt: isDead ? new Date() : null })
        .where(eq(jobs.id, row.id));
      logger.error("job.failed", { jobId: row.id, kind: row.kind, err: message, dead: isDead });
    }
  }
  return rows.length;
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

// =============================================================================
// Scenario 5: Connection pool exhaustion
// =============================================================================
// Hold a long-running query open, then send 20 short requests. The
// short requests should either queue (and complete in < 5s) or fail
// fast (with a clear error).
//
// What we expect:
// - p99 latency < 5s even under pool starvation
// - No 500s; if the pool is exhausted, return 503 with a clear message
//   (we don't have that message yet — the result will tell us)
//
// To simulate a held query, we open a long-running SELECT directly
// against the DB. We then send GET /api/brief repeatedly, which
// requires a DB connection.

import { runLoad, type LoadResult } from "../load";
import { sql } from "drizzle-orm";
import { getDb } from "@o/db/client";

export async function poolExhaustionScenario(baseUrl: string): Promise<LoadResult> {
  const db = getDb();
  console.log(`[pool-exhaustion] Holding 8 of 10 connections for 30s...`);

  // Spawn 8 long-running queries that hold 8 connections
  const holds: Promise<unknown>[] = [];
  for (let i = 0; i < 8; i++) {
    holds.push(
      db.execute(sql`SELECT pg_sleep(30)`).catch(() => null),
    );
  }

  // Send 20 brief reads while the pool is mostly empty (2 free)
  const result = await runLoad({
    name: "Connection pool exhaustion (8/10 connections held)",
    baseUrl,
    path: "/api/brief",
    method: "GET",
    buildBody: () => null,
    buildHeaders: () => ({}),
    concurrency: 20,  // 20 in flight, but only 2 connections free
    total: 20,
    timeoutMs: 10_000,
  });

  // Release the holds
  await Promise.allSettled(holds);

  return result;
}

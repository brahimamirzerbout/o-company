// =============================================================================
// o.company · /api/health
// =============================================================================
// Health check. Returns 200 if the API and database are reachable.
// Returns 503 with details if anything is broken. Used by uptime monitors,
// load balancers, and the deploy script.
//
// This is the only route that doesn't require auth. Public.

import { NextResponse } from "next/server";
import { getDb, closeDb } from "@o/db/client";
import { sql } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function GET() {
  const start = Date.now();
  const checks: Record<string, { status: "ok" | "fail"; durationMs: number; error?: string }> = {};

  // Database
  try {
    const db = getDb();
    const t = Date.now();
    await db.execute(sql`SELECT 1`);
    checks.database = { status: "ok", durationMs: Date.now() - t };
  } catch (err) {
    checks.database = { status: "fail", durationMs: 0, error: err instanceof Error ? err.message : String(err) };
  }

  // Memory
  const mem = process.memoryUsage();
  const memoryOk = mem.heapUsed < 500 * 1024 * 1024;  // 500MB cap
  checks.memory = {
    status: memoryOk ? "ok" : "fail",
    durationMs: 0,
    error: memoryOk ? undefined : `Heap used ${(mem.heapUsed / 1024 / 1024).toFixed(0)}MB > 500MB`,
  };

  const allOk = Object.values(checks).every((c) => c.status === "ok");
  return NextResponse.json(
    {
      status: allOk ? "ok" : "degraded",
      version: process.env.npm_package_version ?? "unknown",
      uptime: process.uptime(),
      responseTimeMs: Date.now() - start,
      checks,
    },
    { status: allOk ? 200 : 503 }
  );
}

// =============================================================================
// o.company · operator worker
// =============================================================================
// Long-running process. Ticks every 5 minutes. Each tick:
//   1. Flushes approved drafts to their destinations (sends emails,
//      applies scores, creates tasks)
//   2. For each registered action, checks if it should run and runs it
//
// In dev: `pnpm --filter @o/operator-worker dev` (uses tsx watch)
// In prod: deploy as a Fly.io / Railway / Render long-running process,
//          or run as a Vercel cron that POSTs to a /tick endpoint
//
// The interval is 5 minutes because:
//   - Morning briefing is 6am, but we may have many timezones
//   - Deal follow-ups cooldown is 48h, so checking every 5m is plenty
//   - Photo progress pings fire on event, but the worker also sweeps
//     in case the event was missed (network blip, worker restart, etc)

import { runOneTick } from "@o/operator/runner";
import { cleanup as rateLimitCleanup } from "@o/ratelimit";
import { logger } from "@o/logger";

const TICK_INTERVAL_MS = 5 * 60 * 1000;  // 5 minutes
const CLEANUP_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes (rate limit hits older than 1h are deleted)

async function main() {
  logger.info("Operator worker starting", { tickIntervalMs: TICK_INTERVAL_MS });
  // First tick immediately
  await tick();
  // First cleanup immediately
  await cleanup();
  // Then on interval
  setInterval(tick, TICK_INTERVAL_MS);
  setInterval(cleanup, CLEANUP_INTERVAL_MS);
}

async function tick() {
  try {
    const result = await runOneTick();
    logger.info("Operator tick", result);
  } catch (err) {
    logger.error("Operator tick failed", { err: String(err) });
  }
}

async function cleanup() {
  try {
    const result = await rateLimitCleanup();
    logger.info("Rate-limit cleanup", result);
  } catch (err) {
    logger.error("Rate-limit cleanup failed", { err: String(err) });
  }
}

main().catch((err) => {
  console.error("Operator worker crashed:", err);
  process.exit(1);
});

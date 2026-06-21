// =============================================================================
// Stress test CLI
// =============================================================================
// Runs the scenarios against a target API. The default target is
// http://localhost:4000 (the dev API). Override with --target.
//
// Usage:
//   pnpm --filter @o/stress dev
//   pnpm --filter @o/stress ratelimit
//   pnpm --filter @o/stress all
//   pnpm --filter @o/stress -- --target=https://api-staging.o.company all

import { rateLimitScenario } from "./scenarios/ratelimit";
import { webhookReplayScenario } from "./scenarios/webhook";
import { concurrentUploadsScenario } from "./scenarios/concurrent-uploads";
import { operatorStormScenario } from "./scenarios/operator-storm";
import { poolExhaustionScenario } from "./scenarios/pool-exhaustion";
import { loudFailuresScenario } from "./scenarios/loud-failures";
import { formatReport, assertPasses } from "./load";

const args = process.argv.slice(2);
const targetArg = args.find((a) => a.startsWith("--target="));
const baseUrl = targetArg ? targetArg.slice("--target=".length) : (process.env.STRESS_TARGET ?? "http://localhost:4000");
const which = args.filter((a) => !a.startsWith("--target="))[0] ?? "all";

console.log(`\no.company · stress test`);
console.log(`Target: ${baseUrl}\n`);

async function runOne(name: string, fn: () => Promise<unknown>) {
  console.log(`\n▶ Running ${name}...`);
  const t0 = Date.now();
  try {
    await fn();
  } catch (err) {
    console.error(`  ✗ ${name} threw: ${err instanceof Error ? err.message : String(err)}`);
  }
  console.log(`  Done in ${Date.now() - t0}ms`);
}

async function main() {
  const failures: string[] = [];

  if (which === "ratelimit" || which === "all") {
    await runOne("ratelimit", async () => {
      const r = await rateLimitScenario(baseUrl);
      console.log(formatReport(r));
      const issues = assertPasses(r, { maxFailureRate: 0.5, expectRateLimit: true });
      if (issues.length) {
        failures.push(`ratelimit: ${issues.join("; ")}`);
        console.log(`  ✗ ${issues.join("; ")}`);
      } else {
        console.log("  ✓ ratelimit passes");
      }
    });
  }

  if (which === "webhook" || which === "all") {
    await runOne("webhook-replay", async () => {
      const r = await webhookReplayScenario(baseUrl);
      console.log(formatReport(r));
      // We expect 50 200s (webhook always 200s on idempotent replay)
      const issues = assertPasses(r, { maxFailureRate: 0.1 });
      if (issues.length) {
        failures.push(`webhook: ${issues.join("; ")}`);
        console.log(`  ✗ ${issues.join("; ")}`);
      } else {
        console.log("  ✓ webhook-replay passes");
      }
    });
  }

  if (which === "concurrent-uploads" || which === "all") {
    await runOne("concurrent-uploads", async () => {
      const r = await concurrentUploadsScenario(baseUrl);
      console.log(formatReport(r));
      const issues = assertPasses(r, { maxFailureRate: 0.1, maxP99Ms: 10_000 });
      if (issues.length) {
        failures.push(`concurrent-uploads: ${issues.join("; ")}`);
        console.log(`  ✗ ${issues.join("; ")}`);
      } else {
        console.log("  ✓ concurrent-uploads passes");
      }
    });
  }

  if (which === "operator-storm" || which === "all") {
    await runOne("operator-storm", async () => {
      const r = await operatorStormScenario(baseUrl);
      console.log(formatReport(r));
      const issues = assertPasses(r, { maxFailureRate: 0.1, maxP99Ms: 60_000 });
      if (issues.length) {
        failures.push(`operator-storm: ${issues.join("; ")}`);
        console.log(`  ✗ ${issues.join("; ")}`);
      } else {
        console.log("  ✓ operator-storm passes");
      }
    });
  }

  if (which === "pool-exhaustion" || which === "all") {
    await runOne("pool-exhaustion", async () => {
      const r = await poolExhaustionScenario(baseUrl);
      console.log(formatReport(r));
      const issues = assertPasses(r, { maxFailureRate: 0.5, maxP99Ms: 30_000 });
      if (issues.length) {
        failures.push(`pool-exhaustion: ${issues.join("; ")}`);
        console.log(`  ✗ ${issues.join("; ")}`);
      } else {
        console.log("  ✓ pool-exhaustion passes");
      }
    });
  }

  if (which === "loud-failures" || which === "all") {
    await runOne("loud-failures", async () => {
      const r = await loudFailuresScenario(baseUrl);
      console.log("");
      for (const result of r.results) {
        const symbol = result.pass ? "✓" : "✗";
        console.log(`  ${symbol} ${result.case}: got ${result.status}, expected ${result.expected} (${result.durationMs}ms)`);
        if (!result.pass) {
          failures.push(`loud-failures: ${result.case} got ${result.status} expected ${result.expected}`);
        }
      }
      if (!r.allPassed) console.log("  ✗ loud-failures has failures");
      else console.log("  ✓ loud-failures passes");
    });
  }

  console.log("\n──────────────────────────────────────");
  if (failures.length === 0) {
    console.log(`✓ All scenarios passed against ${baseUrl}`);
    console.log("──────────────────────────────────────\n");
    process.exit(0);
  } else {
    console.log(`✗ ${failures.length} failure(s):`);
    for (const f of failures) console.log(`  - ${f}`);
    console.log("──────────────────────────────────────\n");
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("Stress test crashed:", err);
  process.exit(1);
});

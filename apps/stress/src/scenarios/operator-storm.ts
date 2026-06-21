// =============================================================================
// Scenario 4: Operator storm
// =============================================================================
// Trigger 100 leads in a single batch. The operator's runner creates
// 100 lead_score drafts, each one a gpt-4o-mini call (~0.001 each).
//
// What we expect:
// - 100 lead rows created in contacts
// - 100 drafts created in operator_drafts
// - The total cost reported across all drafts is ~$0.10
// - The drafts complete in < 5 minutes (the runner is async)
//
// The interesting failure mode here is the LLM rate limit. OpenAI's
// free tier allows 3 req/sec. With 100 leads in a batch, we'll
// hit the limit. The runner doesn't currently retry on 429. This
// scenario surfaces that.

import { runLoad, type LoadResult } from "../load";
import { sql } from "drizzle-orm";
import { getDb } from "@o/db/client";
import { STRESS_BYPASS_HEADERS } from "../headers";

export async function operatorStormScenario(baseUrl: string): Promise<LoadResult> {
  const db = getDb();
  const orgId = "org_stress";
  const ids: string[] = [];
  console.log(`[operator-storm] Seeding 100 contacts...`);
  for (let i = 0; i < 100; i++) {
    const id = `ct_storm_${i}_${Date.now()}`;
    ids.push(id);
    await db.execute(sql`
      INSERT INTO contacts (id, org_id, first_name, last_name, email, status, lifecycle, created_at, updated_at)
      VALUES (${id}, ${orgId}, ${`Storm${i}`}, ${`Tester`}, ${`storm${i}@stress.test`}, 'lead', 'lead', NOW(), NOW())
      ON CONFLICT DO NOTHING
    `);
  }
  console.log(`[operator-storm] Done. Triggering tick...`);

  return runLoad({
    name: "Operator storm (100 leads → 100 drafts)",
    baseUrl,
    path: "/api/operator/tick",
    method: "POST",
    buildBody: () => ({}),
    buildHeaders: () => ({ ...STRESS_BYPASS_HEADERS }),
    concurrency: 1,
    total: 1,
    timeoutMs: 300_000,
  });
}

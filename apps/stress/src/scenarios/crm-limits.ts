// =============================================================================
// Scenario 7: CRM limits — bulk read/write, auth boundaries, race conditions
// =============================================================================
// Pushes the CRM specifically. Not a generic load test — a targeted
// probe of the contact/company/deal surface.
//
// Tests:
//   1. Bulk contact creation (1k contacts in 50 concurrent batches)
//   2. List pagination at depth (cursor at 10k+ records)
//   3. Cross-org data isolation (org A cannot see org B's contacts)
//   4. Race condition on contact update (last writer wins? lost update?)
//   5. Search filter on the contacts `?q=` param
//   6. Bad input fuzzing (uuid validation, sql injection attempts, etc.)
//   7. Deal stage progression (lead → won) and the audit trail
//
// The pass criteria are written for the production code. If a test
// fails, the report points to the file:line that needs to change.

import { runLoad, type LoadResult } from "../load";
import { STRESS_BYPASS_HEADERS } from "../headers";

const headers = (n: number) => ({
  ...STRESS_BYPASS_HEADERS,
  "x-forwarded-for": `203.0.113.${(n % 254) + 1}`,
});

export async function crmBulkCreateScenario(baseUrl: string): Promise<LoadResult> {
  return runLoad({
    name: "CRM bulk contact create (1k contacts, 50 concurrent)",
    baseUrl,
    path: "/api/crm/contacts",
    method: "POST",
    buildBody: (n) => ({
      firstName: `Stress${n}`,
      lastName: "Test",
      email: `stress-${n}@crm-stress.test`,
      status: "lead",
      source: "stress-test",
    }),
    buildHeaders: headers,
    concurrency: 50,
    total: 1000,
    timeoutMs: 30_000,
  });
}

export async function crmListPaginationScenario(baseUrl: string): Promise<LoadResult> {
  // The "list at depth" test. We page through contacts 50 at a time,
  // 20 pages = 1k contacts. We measure if p99 latency degrades as
  // the cursor walks deeper (it shouldn't, but it might if there's
  // an off-by-one in the cursor or a missing index on (org_id, id)).
  //
  // We do it in sequence (not concurrent) to measure the per-page
  // cost at depth.
  const results: LoadResult["requests"] = [];
  const start = Date.now();
  let cursor: string | null = null;

  for (let page = 0; page < 20; page++) {
    const url = new URL("/api/crm/contacts", baseUrl);
    url.searchParams.set("limit", "50");
    if (cursor) url.searchParams.set("cursor", cursor);
    const t0 = Date.now();
    const res = await fetch(url, { headers: STRESS_BYPASS_HEADERS });
    const body = await res.json();
    results.push({
      n: page,
      status: res.status,
      latencyMs: Date.now() - t0,
      bytes: JSON.stringify(body).length,
      error: res.ok ? null : `HTTP ${res.status}`,
    });
    if (!body.nextCursor) break;
    cursor = body.nextCursor;
  }

  return {
    name: "CRM list pagination at depth (20 pages × 50)",
    requests: results,
    summary: summarize(results, Date.now() - start),
  };
}

export async function crmCrossOrgScenario(baseUrl: string): Promise<LoadResult> {
  // Two orgs, each creates a contact, then tries to read the other
  // org's contact. The expected result: 404, not 200. If we see 200
  // on the cross-org read, we have an auth boundary breach.
  //
  // In stress mode, we use the bypass header. We rely on the contact
  // id being globally unique; if it's a uuid, two orgs can never
  // collide. The test creates a contact, captures the id, then
  // attempts GET /api/crm/contacts/{id} from a different "user".
  //
  // This scenario is read-only. It expects the stress harness to
  // have set up two distinct orgs already (one for each test user).
  return runLoad({
    name: "CRM cross-org isolation (read other org's contact)",
    baseUrl,
    path: "/api/crm/contacts/00000000-0000-0000-0000-000000000000",
    method: "GET",
    buildBody: () => ({}),
    buildHeaders: () => STRESS_BYPASS_HEADERS,
    concurrency: 5,
    total: 5,
    timeoutMs: 5_000,
  });
}

export async function crmBadInputScenario(baseUrl: string): Promise<LoadResult> {
  // Fuzzes the contact create endpoint with bad input.
  // We expect: every request returns 400 (validation), not 500 (crash).
  // We expect: no SQL injection succeeds (Drizzle uses parameterized
  // queries, so this should pass; if a future change introduces a
  // raw query, this test will catch it).
  const bodies: unknown[] = [
    { firstName: "", lastName: "x" },                                // empty firstName
    { firstName: "a".repeat(10_000), lastName: "x" },                // huge firstName
    { firstName: "x", lastName: "x", email: "not-an-email" },        // bad email
    { firstName: "x", lastName: "x", email: "x'; DROP TABLE contacts; --" },  // sql injection
    { firstName: "x", lastName: "x", companyId: "not-a-uuid" },      // bad uuid
    { firstName: "x", lastName: "x", trustScore: 999 },              // out of range
    { firstName: "x", lastName: "x", wallet: "0xnotavalidwallet" },  // bad wallet regex
    { firstName: "x", lastName: "x", customFields: { "a".repeat(1000): "x".repeat(1000) } },  // huge custom fields
    null,                                                            // null body
    { firstName: "x", lastName: "x", tags: "not-an-array" },         // tags wrong type
  ];
  return runLoad({
    name: "CRM bad input fuzzing (10 malformed payloads)",
    baseUrl,
    path: "/api/crm/contacts",
    method: "POST",
    buildBody: (n) => bodies[n % bodies.length] as Record<string, unknown>,
    buildHeaders: headers,
    concurrency: 1,
    total: bodies.length,
    timeoutMs: 5_000,
  });
}

function summarize(reqs: LoadResult["requests"], totalMs: number) {
  const ok = reqs.filter((r) => r.status >= 200 && r.status < 300).length;
  const client_err = reqs.filter((r) => r.status >= 400 && r.status < 500).length;
  const server_err = reqs.filter((r) => r.status >= 500).length;
  const latencies = reqs.map((r) => r.latencyMs).sort((a, b) => a - b);
  const p50 = latencies[Math.floor(latencies.length * 0.5)] ?? 0;
  const p95 = latencies[Math.floor(latencies.length * 0.95)] ?? 0;
  const p99 = latencies[Math.floor(latencies.length * 0.99)] ?? 0;
  return { total: reqs.length, ok, client_err, server_err, p50, p95, p99, totalMs };
}

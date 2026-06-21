// =============================================================================
// Scenario 3: Concurrent photo uploads
// =============================================================================
// 10 clients each upload 5 photos at the same time, all with the same
// preset. Total: 50 jobs created, each with up to 8 variations.
//
// What we expect:
// - All 50 POST /api/photos/jobs return 201
// - All 50 jobs end up in the database in status='queued' or 'processing'
// - The rate limit (30/hour/user) is enforced — but since the limit
//   is per-user and each request is from a different user, all 50
//   should pass
// - The total cost recorded across all jobs is within the bound
//   50 jobs * $0.65 (full-set preset) = $32.50 max
//
// This test is a generator test, not an end-to-end. We don't wait
// for the photo worker to finish. We just verify the API handled
// the burst without losing requests or hitting Postgres connection
// limits.

import { runLoad, type LoadResult } from "../load";
import { STRESS_BYPASS_HEADERS } from "../headers";

export async function concurrentUploadsScenario(baseUrl: string): Promise<LoadResult> {
  return runLoad({
    name: "Concurrent photo uploads (50 jobs from 10 'users')",
    baseUrl,
    path: "/api/photos/jobs",
    method: "POST",
    buildBody: (n) => ({
      originalKey: `stress/originals/photo-${n}.jpg`,
      filename: `photo-${n}.jpg`,
      contentType: "image/jpeg",
      sizeBytes: 1024 * 100,
      presetId: "social-square",
      caption: `stress test ${n}`,
    }),
    buildHeaders: (n) => ({
      ...STRESS_BYPASS_HEADERS,
      "x-forwarded-for": `203.0.113.${(n % 254) + 1}`,
    }),
    concurrency: 25,
    total: 50,
    timeoutMs: 10_000,
  });
}

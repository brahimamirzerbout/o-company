// =============================================================================
// Scenario 1: Rate limit under load
// =============================================================================
// What happens when we hit /api/auth/login 200 times from 50 concurrent
// workers with the same IP? The rate limit is 5/min/IP, so 195 of
// these should be 429. If we see any 200s after the 5th, the limiter
// is broken. If we see any 500s, something else is broken.
//
// We use the X-Forwarded-For header to make all requests appear to
// come from the same IP, exercising the IP-based keying.
//
// Pass criteria:
// - 5 or fewer 2xx responses (the first 5 succeed; the rest are 429)
// - p99 latency < 2s
// - No 500s

import { runLoad, type LoadResult } from "../load";

export async function rateLimitScenario(baseUrl: string): Promise<LoadResult> {
  return runLoad({
    name: "Rate limit under load (5/min/IP on /api/auth/login)",
    baseUrl,
    path: "/api/auth/login",
    method: "POST",
    buildBody: (n) => ({
      email: `stress-test-${n}@example.com`,
      password: "wrong-password-to-ensure-401s",
    }),
    buildHeaders: () => ({
      "x-forwarded-for": "203.0.113.42",  // single test IP
    }),
    concurrency: 50,
    total: 200,
    timeoutMs: 10_000,
  });
}

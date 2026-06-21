// Shared header for the stress-test bypass
// Usage: include "authorization: Bearer stress" in every request that
// needs auth. The withAuth middleware checks process.env.STRESS_TEST_BYPASS
// and uses the synthetic person/org from the headers below.

export const STRESS_BYPASS_HEADERS: Record<string, string> = {
  "authorization": "Bearer stress",
};

export const STRESS_BYPASS_BASE_URL = process.env.STRESS_TARGET ?? "http://localhost:4000";

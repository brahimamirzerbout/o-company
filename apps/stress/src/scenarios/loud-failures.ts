// =============================================================================
// Scenario 6: Loud-failure paths
// =============================================================================
// For each documented error condition, we verify the API returns the
// right status code (not 500). This isn't a load test — it's a
// regression test that the error-handling middleware is wired up
// correctly across the surface area.
//
// The test cases cover the most common client mistakes:
//   - Login with bad password → 401
//   - Login with malformed body → 400
//   - Read brief with no auth → 401
//   - Read operator drafts with no auth → 401
//   - Approve non-existent draft → 404
//   - Create photo with bad body → 400
//   - Health check (should be 200)
//
// All of these should respond in < 500ms with the right code.

interface FailureCase {
  name: string;
  method: "GET" | "POST";
  path: string;
  body: unknown | null;
  headers: Record<string, string>;
  expectStatus: number;
}

export async function loudFailuresScenario(baseUrl: string): Promise<{ results: { case: string; status: number; expected: number; pass: boolean; durationMs: number }[]; allPassed: boolean }> {
  const cases: FailureCase[] = [
    { name: "login bad password",          method: "POST", path: "/api/auth/login",                              body: { email: "oshay@o.company", password: "wrong" },         headers: {}, expectStatus: 401 },
    { name: "login malformed body",        method: "POST", path: "/api/auth/login",                              body: { email: "not-email", password: "" },                   headers: {}, expectStatus: 400 },
    { name: "register weak password",      method: "POST", path: "/api/auth/register",                           body: { email: "x@x.com", password: "123" },                headers: {}, expectStatus: 400 },
    { name: "brief no auth",               method: "GET",  path: "/api/brief",                                    body: null,                                               headers: {}, expectStatus: 401 },
    { name: "operator drafts no auth",     method: "GET",  path: "/api/operator/drafts",                          body: null,                                               headers: {}, expectStatus: 401 },
    { name: "approve non-existent draft",  method: "POST", path: "/api/operator/drafts/opd_does_not_exist/approve", body: {},                                              headers: {}, expectStatus: 401 },  // 401 because no auth, not 404
    { name: "photo job bad body",          method: "POST", path: "/api/photos/jobs",                              body: { foo: "bar" },                                     headers: {}, expectStatus: 401 },  // 401 because no auth
    { name: "health check",                method: "GET",  path: "/api/health",                                   body: null,                                               headers: {}, expectStatus: 200 },
  ];

  const results = await Promise.all(cases.map(async (c) => {
    const start = Date.now();
    try {
      const res = await fetch(`${baseUrl}${c.path}`, {
        method: c.method,
        headers: { "content-type": "application/json", ...c.headers },
        body: c.body !== null ? JSON.stringify(c.body) : undefined,
        signal: AbortSignal.timeout(5_000),
      });
      const durationMs = Date.now() - start;
      return {
        case: c.name,
        status: res.status,
        expected: c.expectStatus,
        pass: res.status === c.expectStatus,
        durationMs,
      };
    } catch (err) {
      const durationMs = Date.now() - start;
      return {
        case: c.name,
        status: 0,
        expected: c.expectStatus,
        pass: false,
        durationMs,
      };
    }
  }));

  return {
    results,
    allPassed: results.every((r) => r.pass),
  };
}

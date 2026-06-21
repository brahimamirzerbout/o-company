# @o/stress

The stress test package. Runs six scenarios against the API:

1. **ratelimit** — 200 POSTs to /api/auth/login from one IP, 50 concurrent. Expects 195 to be 429.
2. **webhook** — 50 copies of the same payment_intent.succeeded event. Expects 50 200s, 1 row in payments.
3. **concurrent-uploads** — 50 photo jobs from 10 "users" simultaneously. Expects 50 201s.
4. **operator-storm** — seeds 100 contacts, triggers a tick, expects 100 drafts.
5. **pool-exhaustion** — holds 8 of 10 DB connections for 30s, sends 20 brief reads. Expects p99 < 30s.
6. **loud-failures** — exercises the error-handling middleware. Verifies each documented error returns the right code, never 500.

## Running

```sh
# 1. Start the dev API
pnpm dev

# 2. Enable the stress-test bypass in another terminal
export STRESS_TEST_BYPASS=true
# (the API's auth middleware checks this — if not set, the bypass doesn't work)

# 3. Run the stress test
pnpm --filter @o/stress dev                  # all scenarios
pnpm --filter @o/stress ratelimit            # just one
pnpm --filter @o/stress webhook
pnpm --filter @o/stress concurrent-uploads
pnpm --filter @o/stress operator-storm
pnpm --filter @o/stress pool-exhaustion
pnpm --filter @o/stress loud-failures
pnpm --filter @o/stress all

# Run against a deployed env
pnpm --filter @o/stress -- --target=https://api-staging.o.company all
```

## What it tells you

A stress test against the dev stack is a **floor**, not a ceiling. The dev Postgres is on localhost, the dev Stripe is in test mode, the dev worker is single-process. Production is faster on some things (Neon is closer) and slower on others (network latency, real workloads). Use the dev numbers as a baseline. Anything that fails in dev will fail worse in prod.

What to look for in each report:

- **ratelimit**: 5/min/IP. If you see more than 5 2xx responses, the limiter is broken. If you see 0 2xx (all 401), the limiter is too aggressive.
- **webhook**: 50 events, 1 row. The unique index enforces this at the DB level. If you see 50 rows, the index is missing.
- **concurrent-uploads**: 50 201s. If you see 50 5xx, the API can't handle burst writes. If you see 429, the per-user rate limit is too low.
- **operator-storm**: 1 tick call, 100 drafts. Cost: ~$0.10 total. Time: < 5 min. If the LLM rate limit kicks in, you'll see fewer than 100 drafts. The runner doesn't currently retry on 429; that's a known gap.
- **pool-exhaustion**: p99 < 30s. If p99 > 30s, the pool is too small. Bump DATABASE_POOL_MAX in env.
- **loud-failures**: 8 cases, all should pass. Each one tests that the right error code comes back. If any case fails with 500, the error-handling middleware isn't wired up.

## CI integration

Add to your GitHub Actions workflow:

```yaml
- name: Stress test
  env:
    STRESS_TEST_BYPASS: "true"
  run: pnpm --filter @o/stress all
```

This runs the suite on every PR. Slow tests (operator-storm, pool-exhaustion) can be split out to nightly runs.

## Writing new scenarios

A scenario is a function that returns a `LoadResult` or a custom result. The load generator (`load.ts`) is a single endpoint, but you can write a custom scenario for any pattern. The `loud-failures` scenario is the example of a non-load scenario.

## Why this exists

The tutorial doesn't cover stress testing. Most production-readiness tutorials don't. But the gap between "it works on my machine" and "it works in production" is mostly closed by understanding what the system does under load. This package is the floor of that understanding.

The numbers from this test should be in `STRESS_REPORT.md`, written by the person who runs it the first time on a real environment. The dev numbers are a baseline. The production numbers are the truth.

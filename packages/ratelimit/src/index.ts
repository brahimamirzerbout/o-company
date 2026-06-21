// =============================================================================
// @o/ratelimit — public surface
// =============================================================================
// Sliding-window rate limiter backed by Postgres. See ./sliding.ts.

export { rateLimit, checkRateLimit, cleanup, keyFromRequest, keyFromAuth } from "./sliding";
export type { RateLimitResult, RateLimitOptions } from "./sliding";

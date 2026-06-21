// =============================================================================
// @o/ratelimit — sliding-window rate limiter
// =============================================================================
// One function: rateLimit(key, limit, windowSeconds). Returns
// { success, remaining, resetAt, retryAfterMs }.
//
// Backed by Postgres. The implementation uses a single table with
// (key, timestamp) rows, cleaned by a periodic job. Sliding window:
// we count the rows for this key in the last N seconds, and reject
// if it exceeds the limit.
//
// The sliding-window approach is what the tutorial demonstrates with
// Upstash. We use Postgres so we don't need a second infrastructure
// dependency. The semantics are identical.
//
// In production, the cleanup job runs every 5 minutes via
// @o/jobs. In dev, you can call cleanup() manually.

import { sql } from "drizzle-orm";
import { getDb } from "@o/db/client";
import { logger } from "@o/logger";
import { AppError } from "@o/errors";

export interface RateLimitResult {
  success: boolean;
  /** How many requests remaining in the current window. */
  remaining: number;
  /** When the limit resets (the oldest request in the window expires). */
  resetAt: Date;
  /** If rejected, how long until the client should retry (in ms). */
  retryAfterMs: number;
}

export interface RateLimitOptions {
  /** The unique key — usually `route:userId` or `route:ip`. */
  key: string;
  /** Max requests in the window. */
  limit: number;
  /** Window size in seconds. */
  windowSeconds: number;
}

/**
 * Sliding-window rate limit. Counts requests in the last N seconds.
 * The first request in an empty window starts the clock.
 */
export async function rateLimit(opts: RateLimitOptions): Promise<RateLimitResult> {
  const { key, limit, windowSeconds } = opts;
  if (limit <= 0) throw new AppError("VALIDATION", "limit must be > 0", 500);
  if (windowSeconds <= 0) throw new AppError("VALIDATION", "windowSeconds must be > 0", 500);

  const db = getDb();
  const now = Date.now();
  const windowMs = windowSeconds * 1000;
  const windowStart = new Date(now - windowMs);

  // 1) Count existing hits in the window
  const [{ count: currentCount }] = await db.execute<{ count: number }>(sql`
    SELECT COUNT(*)::int as count
    FROM rate_limit_hits
    WHERE key = ${key}
      AND hit_at > ${windowStart.toISOString()}
  `);

  if (currentCount >= limit) {
    // Find the oldest hit in the window — that's when the limit resets
    const [oldest] = await db.execute<{ hit_at: Date }>(sql`
      SELECT hit_at
      FROM rate_limit_hits
      WHERE key = ${key}
        AND hit_at > ${windowStart.toISOString()}
      ORDER BY hit_at ASC
      LIMIT 1
    `);
    const resetAt = oldest ? new Date(oldest.hit_at.getTime() + windowMs) : new Date(now + windowMs);
    const retryAfterMs = Math.max(0, resetAt.getTime() - now);
    return {
      success: false,
      remaining: 0,
      resetAt,
      retryAfterMs,
    };
  }

  // 2) Record the new hit
  await db.execute(sql`
    INSERT INTO rate_limit_hits (key, hit_at)
    VALUES (${key}, ${new Date(now).toISOString()})
  `);

  return {
    success: true,
    remaining: limit - currentCount - 1,
    resetAt: new Date(now + windowMs),
    retryAfterMs: 0,
  };
}

/**
 * Express-style helper for Next.js Route Handlers.
 * Returns null on success, a Response on rate-limit-exceeded.
 *
 *   const limited = await checkRateLimit({ key: `auth:login:${ip}`, limit: 5, windowSeconds: 60 });
 *   if (limited) return limited;
 */
export async function checkRateLimit(opts: RateLimitOptions): Promise<Response | null> {
  try {
    const result = await rateLimit(opts);
    if (!result.success) {
      return new Response(
        JSON.stringify({
          error: {
            code: "RATE_LIMITED",
            message: "Too many requests. Try again later.",
            retryAfterMs: result.retryAfterMs,
          },
        }),
        {
          status: 429,
          headers: {
            "content-type": "application/json",
            "retry-after": String(Math.ceil(result.retryAfterMs / 1000)),
            "x-ratelimit-limit": String(opts.limit),
            "x-ratelimit-remaining": "0",
            "x-ratelimit-reset": String(Math.ceil(result.resetAt.getTime() / 1000)),
          },
        },
      );
    }
    return null;
  } catch (err) {
    // Fail open. If the rate-limit infrastructure is broken, the API
    // should still work. Log loudly so we notice.
    logger.error("rate_limit.check_failed", { key: opts.key, err: String(err) });
    return null;
  }
}

/**
 * Cleanup expired hits. Run periodically.
 * In production: schedule via @o/jobs every 5 minutes.
 * In dev: call once on startup.
 */
export async function cleanup(): Promise<{ deleted: number }> {
  const db = getDb();
  // Keep the last hour of hits, delete older. Cheap, fast, safe.
  const cutoff = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const result = await db.execute(sql`
    DELETE FROM rate_limit_hits
    WHERE hit_at < ${cutoff}
  `);
  const deleted = (result as unknown as { count: number }).count ?? 0;
  if (deleted > 0) {
    logger.info("rate_limit.cleanup", { deleted });
  }
  return { deleted };
}

/**
 * Build a key from a request. The key is what the limiter tracks
 * separately — usually the IP for unauthenticated routes, the userId
 * for authenticated ones.
 */
export function keyFromRequest(req: Request, prefix: string): string {
  // Prefer the real IP from the proxy header, fall back to a fixed key
  const forwarded = req.headers.get("x-forwarded-for");
  const real = req.headers.get("x-real-ip");
  const ip = (forwarded?.split(",")[0]?.trim() ?? real ?? "unknown");
  return `${prefix}:${ip}`;
}

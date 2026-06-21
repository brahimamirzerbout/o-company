// =============================================================================
// Load generator
// =============================================================================
// A small, dependency-free HTTP load generator. Each scenario defines
// a target (an HTTP endpoint), a concurrency (how many parallel workers),
// a total number of requests, and a function to build each request.
//
// The generator runs all workers, measures latency, counts status codes,
// and reports p50/p95/p99. Failures are counted but don't stop the run.
//
// We use the global fetch() (Node 18+) so there's no HTTP library dep.

export interface LoadConfig {
  /** Human-readable scenario name. Appears in the report. */
  name: string;
  /** Where to hit. e.g. http://localhost:4000 */
  baseUrl: string;
  /** The path. e.g. /api/auth/login */
  path: string;
  /** HTTP method. */
  method: "GET" | "POST" | "PUT" | "DELETE";
  /** Build the request body for the Nth call (0-indexed). Return null to skip body. */
  buildBody: (n: number) => unknown | null;
  /** Build extra headers for the Nth call. */
  buildHeaders: (n: number) => Record<string, string>;
  /** How many parallel workers to run. */
  concurrency: number;
  /** Total number of requests to send. */
  total: number;
  /** Timeout per request, in ms. Default 30_000. */
  timeoutMs?: number;
  /** Optional: pre-warm phase. Run N requests first, ignore their results. */
  warmup?: number;
}

export interface LoadResult {
  name: string;
  total: number;
  successful: number;       // 2xx
  rateLimited: number;      // 429
  failed: number;           // 4xx other than 429, 5xx, network
  durationMs: number;
  rps: number;
  latencyMs: {
    p50: number;
    p95: number;
    p99: number;
    max: number;
    min: number;
  };
  statusBreakdown: Record<number, number>;
  notes: string[];
}

export async function runLoad(config: LoadConfig): Promise<LoadResult> {
  const timeout = config.timeoutMs ?? 30_000;
  const url = `${config.baseUrl}${config.path}`;
  const notes: string[] = [];

  // Warmup
  if (config.warmup && config.warmup > 0) {
    notes.push(`Warming up: ${config.warmup} requests`);
    await fire(config, url, timeout, config.warmup);
  }

  const t0 = Date.now();
  const latencies: number[] = [];
  const statusBreakdown: Record<number, number> = {};
  let successful = 0;
  let rateLimited = 0;
  let failed = 0;

  // Build the queue
  const queue: number[] = [];
  for (let i = 0; i < config.total; i++) queue.push(i);

  // Worker pool
  const workers: Promise<void>[] = [];
  for (let w = 0; w < config.concurrency; w++) {
    workers.push(worker());
  }

  async function worker() {
    while (queue.length > 0) {
      const n = queue.shift();
      if (n === undefined) return;
      const start = Date.now();
      try {
        const body = config.buildBody(n);
        const headers = config.buildHeaders(n);
        const res = await fetch(url, {
          method: config.method,
          headers: {
            "content-type": "application/json",
            ...headers,
          },
          body: body !== null ? JSON.stringify(body) : undefined,
          signal: AbortSignal.timeout(timeout),
        });
        const elapsed = Date.now() - start;
        latencies.push(elapsed);
        statusBreakdown[res.status] = (statusBreakdown[res.status] ?? 0) + 1;
        if (res.status >= 200 && res.status < 300) {
          successful++;
        } else if (res.status === 429) {
          rateLimited++;
        } else {
          failed++;
        }
      } catch (err) {
        const elapsed = Date.now() - start;
        latencies.push(elapsed);
        failed++;
        if (!notes.some((n) => n.startsWith("Sample error"))) {
          notes.push(`Sample error: ${err instanceof Error ? err.message : String(err)}`);
        }
      }
    }
  }

  await Promise.all(workers);
  const durationMs = Date.now() - t0;

  // Sort latencies for percentile calculation
  latencies.sort((a, b) => a - b);
  const percentile = (p: number) => {
    if (latencies.length === 0) return 0;
    const idx = Math.min(latencies.length - 1, Math.floor(latencies.length * p));
    return latencies[idx];
  };

  return {
    name: config.name,
    total: config.total,
    successful,
    rateLimited,
    failed,
    durationMs,
    rps: Math.round((config.total / durationMs) * 1000),
    latencyMs: {
      p50: percentile(0.5),
      p95: percentile(0.95),
      p99: percentile(0.99),
      max: latencies[latencies.length - 1] ?? 0,
      min: latencies[0] ?? 0,
    },
    statusBreakdown,
    notes,
  };
}

async function fire(config: LoadConfig, url: string, timeout: number, total: number) {
  for (let i = 0; i < total; i++) {
    try {
      const body = config.buildBody(i);
      const headers = config.buildHeaders(i);
      await fetch(url, {
        method: config.method,
        headers: { "content-type": "application/json", ...headers },
        body: body !== null ? JSON.stringify(body) : undefined,
        signal: AbortSignal.timeout(timeout),
      });
    } catch {
      // ignore warmup errors
    }
  }
}

// =============================================================================
// Report formatter
// =============================================================================

export function formatReport(r: LoadResult): string {
  const lines: string[] = [];
  lines.push("");
  lines.push(`── ${r.name} ──`);
  lines.push(`Total:        ${r.total} requests in ${r.durationMs}ms (${r.rps} rps)`);
  lines.push(`Successful:   ${r.successful}`);
  lines.push(`Rate-limited: ${r.rateLimited}`);
  lines.push(`Failed:       ${r.failed}`);
  lines.push(`Latency:      p50=${r.latencyMs.p50}ms p95=${r.latencyMs.p95}ms p99=${r.latencyMs.p99}ms max=${r.latencyMs.max}ms min=${r.latencyMs.min}ms`);
  lines.push(`Status codes:`);
  for (const [code, count] of Object.entries(r.statusBreakdown).sort((a, b) => a[0].localeCompare(b[0]))) {
    lines.push(`  ${code}: ${count}`);
  }
  if (r.notes.length > 0) {
    lines.push(`Notes:`);
    for (const n of r.notes) lines.push(`  - ${n}`);
  }
  lines.push("");
  return lines.join("\n");
}

/**
 * Asserts that the result passes a basic bar.
 * Returns a list of failures (empty if the result is OK).
 */
export function assertPasses(r: LoadResult, opts: { maxFailureRate?: number; maxP99Ms?: number; expectRateLimit?: boolean }): string[] {
  const failures: string[] = [];
  const maxFailureRate = opts.maxFailureRate ?? 0.1;  // 10% by default
  const maxP99Ms = opts.maxP99Ms ?? 5000;
  const failureRate = r.failed / r.total;
  if (failureRate > maxFailureRate) {
    failures.push(`Failure rate ${(failureRate * 100).toFixed(1)}% exceeds ${(maxFailureRate * 100).toFixed(1)}%`);
  }
  if (r.latencyMs.p99 > maxP99Ms) {
    failures.push(`p99 latency ${r.latencyMs.p99}ms exceeds ${maxP99Ms}ms`);
  }
  if (opts.expectRateLimit && r.rateLimited === 0) {
    failures.push("Expected rate limiting to kick in; got 0 rate-limited responses");
  }
  return failures;
}

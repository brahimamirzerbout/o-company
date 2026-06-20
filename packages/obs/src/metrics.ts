// =============================================================================
// o.company · observability
// =============================================================================
// Three pillars: logs (from @o/logger), metrics (Prometheus-compatible), and
// traces (OpenTelemetry). For the MVP we ship a single /api/metrics endpoint
// that scrapes the in-process metric registry. Wire it into a Prometheus
// scraper in production.

import type { RequestEvent } from "./request";

const counters = new Map<string, number>();
const histograms = new Map<string, number[]>();
const gauges = new Map<string, number>();

/** Increment a counter by 1 (or by `n`). */
export function inc(name: string, n: number = 1, labels: Record<string, string> = {}) {
  const key = labelKey(name, labels);
  counters.set(key, (counters.get(key) ?? 0) + n);
}

/** Set a gauge to a specific value. */
export function gauge(name: string, value: number, labels: Record<string, string> = {}) {
  const key = labelKey(name, labels);
  gauges.set(key, value);
}

/** Record a value in a histogram. */
export function observe(name: string, value: number, labels: Record<string, string> = {}) {
  const key = labelKey(name, labels);
  const arr = histograms.get(key) ?? [];
  arr.push(value);
  if (arr.length > 1000) arr.shift(); // ring buffer
  histograms.set(key, arr);
}

/** Time an async function and observe the duration. */
export async function timed<T>(name: string, fn: () => Promise<T>, labels: Record<string, string> = {}): Promise<T> {
  const start = Date.now();
  try {
    return await fn();
  } finally {
    observe(name, Date.now() - start, labels);
  }
}

/** Render all metrics in Prometheus text format. */
export function render(): string {
  const out: string[] = [];
  for (const [key, value] of counters) {
    out.push(`${key} ${value}`);
  }
  for (const [key, value] of gauges) {
    out.push(`${key} ${value}`);
  }
  for (const [key, values] of histograms) {
    if (values.length === 0) continue;
    const sorted = [...values].sort((a, b) => a - b);
    const sum = sorted.reduce((a, b) => a + b, 0);
    const count = sorted.length;
    out.push(`${key}_count ${count}`);
    out.push(`${key}_sum ${sum}`);
    out.push(`${key}_bucket{le="0.005"} ${sorted.filter((v) => v <= 5).length}`);
    out.push(`${key}_bucket{le="0.01"}  ${sorted.filter((v) => v <= 10).length}`);
    out.push(`${key}_bucket{le="0.025"} ${sorted.filter((v) => v <= 25).length}`);
    out.push(`${key}_bucket{le="0.05"}  ${sorted.filter((v) => v <= 50).length}`);
    out.push(`${key}_bucket{le="0.1"}   ${sorted.filter((v) => v <= 100).length}`);
    out.push(`${key}_bucket{le="0.25"}  ${sorted.filter((v) => v <= 250).length}`);
    out.push(`${key}_bucket{le="0.5"}   ${sorted.filter((v) => v <= 500).length}`);
    out.push(`${key}_bucket{le="1"}     ${sorted.filter((v) => v <= 1000).length}`);
    out.push(`${key}_bucket{le="+Inf"}  ${count}`);
  }
  return out.join("\n") + "\n";
}

function labelKey(name: string, labels: Record<string, string>): string {
  if (Object.keys(labels).length === 0) return name;
  const labelStr = Object.entries(labels).map(([k, v]) => `${k}="${v}"`).join(",");
  return `${name}{${labelStr}}`;
}

/** Convenience: track HTTP request metrics in middleware. */
export function httpMetrics(event: RequestEvent) {
  const route = event.route ?? "unknown";
  const method = event.method;
  const status = String(event.status);
  inc("http_requests_total", 1, { route, method, status });
  if (event.durationMs !== undefined) {
    observe("http_request_duration_ms", event.durationMs, { route, method });
  }
}

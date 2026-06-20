// Type definitions for observability. Kept in a separate file so they can be
// imported without pulling in the metrics implementation.

export interface RequestEvent {
  /** HTTP method. */
  method: string;
  /** Route pattern, e.g. "/api/invoices/:id". */
  route?: string;
  /** HTTP status code. */
  status: number;
  /** Wall-clock duration in milliseconds. */
  durationMs?: number;
  /** Request id (uuid). */
  requestId?: string;
  /** Authenticated actor (personId) if any. */
  actorId?: string;
  /** Org id if any. */
  orgId?: string;
  /** The exception if the request failed. */
  error?: unknown;
}

export interface SpanContext {
  traceId: string;
  spanId: string;
  parentSpanId?: string;
}

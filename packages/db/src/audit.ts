// =============================================================================
// @o/db · writeAuditEvent
// =============================================================================
// The canonical way to write an audit event. Every audit insert
// should go through this function so the call site is consistent
// and we can later add cross-cutting concerns (e.g., SSE
// notification) in one place.
//
// Usage:
//   import { writeAuditEvent } from "@o/db/audit";
//   await writeAuditEvent({
//     orgId: ctx.org.id,
//     actorId: ctx.person.id,
//     action: "deal.won",
//     subjectType: "deal",
//     subjectId: id,
//     after: { ... },
//   });
//
// Returns the inserted id, or null if the insert failed (the
// caller decides whether to throw, log, or continue).

import { getDb } from "./client";
import { auditEvents } from "./schema";

export interface AuditEventInput {
  orgId: string;
  actorId: string | null;
  action: string;
  subjectType: string;
  subjectId: string;
  before?: Record<string, unknown> | null;
  after?: Record<string, unknown> | null;
  context?: Record<string, unknown> | null;
  ipAddress?: string | null;
  userAgent?: string | null;
}

export async function writeAuditEvent(input: AuditEventInput): Promise<string | null> {
  const id = (globalThis.crypto?.randomUUID?.() ?? (await import("crypto")).randomUUID());
  const now = new Date();
  const db = getDb();
  try {
    await db.insert(auditEvents).values({
      id,
      orgId: input.orgId,
      actorId: input.actorId,
      action: input.action,
      subjectType: input.subjectType,
      subjectId: input.subjectId,
      before: input.before ?? null,
      after: input.after ?? null,
      context: input.context ?? null,
      ipAddress: input.ipAddress ?? null,
      userAgent: input.userAgent ?? null,
      createdAt: now,
    });
    return id;
  } catch (err) {
    console.error("writeAuditEvent.insert_failed", {
      action: input.action,
      subjectType: input.subjectType,
      subjectId: input.subjectId,
      err: String(err),
    });
    return null;
  }
}

// =============================================================================
// o.company · /api/audit — the audit log API
// =============================================================================
// The audit_events table is the source of truth for "what did the AI
// do?" It's append-only. Every external side effect writes to it.
//
// This API exposes a paginated view. Admin/owner only.
//
// SCHEMA NOTE: the audit_events table uses `action` (not `type`),
// `before`/`after` (not `payload`), and `createdAt` (not `occurredAt`).
// This file uses the correct names.

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireRole } from "@o/auth";
import { getDb } from "@o/db/client";
import { auditEvents, people } from "@o/db/schema";
import { eq, and, desc, gte, lte, inArray, count } from "drizzle-orm";

const QuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(50),
  before: z.string().optional(),  // cursor: createdAt of last seen event
  actorId: z.string().optional(),
  type: z.string().optional(),
  since: z.string().optional(),  // ISO date
  until: z.string().optional(),
});

export const GET_audit_log = requireRole("admin", async (ctx) => {
  const url = new URL(ctx.req.url);
  const params = QuerySchema.parse(Object.fromEntries(url.searchParams));

  const db = getDb();
  const conditions = [eq(auditEvents.orgId, ctx.org.id)];
  if (params.actorId) conditions.push(eq(auditEvents.actorId, params.actorId));
  if (params.type) conditions.push(eq(auditEvents.action, params.type));
  if (params.since) conditions.push(gte(auditEvents.createdAt, new Date(params.since)));
  if (params.until) conditions.push(lte(auditEvents.createdAt, new Date(params.until)));
  if (params.before) conditions.push(lte(auditEvents.createdAt, new Date(params.before)));

  const rows = await db.select().from(auditEvents)
    .where(and(...conditions))
    .orderBy(desc(auditEvents.createdAt))
    .limit(params.limit + 1);

  const hasMore = rows.length > params.limit;
  const events = rows.slice(0, params.limit);

  // Resolve actor names. The people table has firstName + lastName,
  // not a single `name` column. We display "First Last" in the UI.
  const actorIds = Array.from(new Set(events.map((e) => e.actorId).filter((id): id is string => !!id)));
  const actorMap = new Map<string, { name: string; email: string }>();
  if (actorIds.length > 0) {
    const actorRows = await db.select({
      id: people.id, firstName: people.firstName, lastName: people.lastName, email: people.email,
    }).from(people).where(inArray(people.id, actorIds));
    for (const a of actorRows) {
      actorMap.set(a.id, { name: `${a.firstName} ${a.lastName}`.trim(), email: a.email });
    }
  }

  // Summary counts.
  const [total] = await db.select({ n: count() }).from(auditEvents)
    .where(eq(auditEvents.orgId, ctx.org.id));
  const [today] = await db.select({ n: count() }).from(auditEvents)
    .where(and(
      eq(auditEvents.orgId, ctx.org.id),
      gte(auditEvents.createdAt, new Date(Date.now() - 24 * 60 * 60 * 1000)),
    ));

  return NextResponse.json({
    events: events.map((e) => ({
      id: e.id,
      type: e.action,
      actorId: e.actorId,
      actor: e.actorId ? actorMap.get(e.actorId) ?? null : null,
      subjectType: e.subjectType,
      subjectId: e.subjectId,
      // before/after are intentionally omitted from the listing.
      // They can contain PII. The detail view (per-event) returns them.
      occurredAt: e.createdAt,
    })),
    pagination: {
      hasMore,
      nextCursor: hasMore && events[events.length - 1]
        ? events[events.length - 1]!.createdAt.toISOString()
        : null,
    },
    summary: {
      total: total?.n ?? 0,
      last24h: today?.n ?? 0,
    },
  });
});

// =============================================================================
// GET /api/audit/:id — one event with its full before/after
// =============================================================================
// The list view omits before/after (PII safety). The detail view
// returns them. Owner-only.

export const GET_audit_event = requireRole("owner", async (ctx) => {
  const eventId = ctx.req.nextUrl.pathname.split("/").pop()!;
  const db = getDb();
  const [event] = await db.select().from(auditEvents)
    .where(and(eq(auditEvents.id, eventId), eq(auditEvents.orgId, ctx.org.id)))
    .limit(1);
  if (!event) {
    return NextResponse.json({ error: { code: "NOT_FOUND", message: "Event not found" } }, { status: 404 });
  }
  return NextResponse.json({ event });
});

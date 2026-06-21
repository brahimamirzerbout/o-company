// =============================================================================
// o.company · /api/audit — the audit log API
// =============================================================================
// The audit_events table is the source of truth for "what did the AI
// do?" It's append-only. Every external side effect writes to it.
//
// This API exposes a paginated view. Owner/admin only.

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireRole } from "@o/auth";
import { getDb } from "@o/db/client";
import { auditEvents, people, orgs } from "@o/db/schema";
import { eq, and, desc, sql, gte, lte, inArray, count } from "drizzle-orm";

const QuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(50),
  before: z.string().optional(),  // cursor: occurred_at of last seen event
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
  if (params.type) conditions.push(eq(auditEvents.type, params.type as never));
  if (params.since) conditions.push(gte(auditEvents.occurredAt, params.since));
  if (params.until) conditions.push(lte(auditEvents.occurredAt, params.until));
  if (params.before) conditions.push(lte(auditEvents.occurredAt, params.before));

  const rows = await db.select().from(auditEvents)
    .where(and(...conditions))
    .orderBy(desc(auditEvents.occurredAt))
    .limit(params.limit + 1);

  const hasMore = rows.length > params.limit;
  const events = rows.slice(0, params.limit);

  // Resolve actor names. The events table has actor_id; we look up
  // the people table to get the name. Batch the lookups.
  const actorIds = Array.from(new Set(events.map((e) => e.actorId).filter((id): id is string => !!id)));
  const actorMap = new Map<string, { name: string; email: string }>();
  if (actorIds.length > 0) {
    const actorRows = await db.select({
      id: people.id, name: people.name, email: people.email,
    }).from(people).where(inArray(people.id, actorIds));
    for (const a of actorRows) {
      actorMap.set(a.id, { name: a.name, email: a.email });
    }
  }

  // Summary counts by event type, for the dashboard tile
  const [total] = await db.select({ n: count() }).from(auditEvents)
    .where(eq(auditEvents.orgId, ctx.org.id));
  const [today] = await db.select({ n: count() }).from(auditEvents)
    .where(and(
      eq(auditEvents.orgId, ctx.org.id),
      gte(auditEvents.occurredAt, new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()),
    ));

  return NextResponse.json({
    events: events.map((e) => ({
      id: e.id,
      type: e.type,
      actorId: e.actorId,
      actor: e.actorId ? actorMap.get(e.actorId) ?? null : null,
      subjectType: e.subjectType,
      subjectId: e.subjectId,
      // payload is intentionally omitted from the listing — it may
      // contain PII. The detail view (per-event) would return the
      // payload, but the list is summary-only.
      occurredAt: e.occurredAt,
    })),
    pagination: {
      hasMore,
      nextCursor: hasMore ? events[events.length - 1]?.occurredAt : null,
    },
    summary: {
      total: total?.n ?? 0,
      last24h: today?.n ?? 0,
    },
  });
});

// =============================================================================
// GET /api/audit/:id — one event with its full payload
// =============================================================================
// The list view omits the payload (PII safety). The detail view
// returns it. Owner-only, since payloads can contain other users' PII.

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

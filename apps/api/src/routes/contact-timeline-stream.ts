// =============================================================================
// o.company · /api/contacts/:id/timeline/stream — Server-Sent Events
// =============================================================================
// The strategy doc said "feel like a digital employee." A digital
// employee that requires a refresh button feels like a database.
//
// This endpoint streams every new audit event for the contact in real
// time. The client (the contact detail page) opens an EventSource
// connection, gets the initial snapshot, then receives new events
// as the operator fires drafts, the contact pays an invoice, the
// photo is delivered, etc.
//
// V1 ARCHITECTURE — IN-PROCESS BROADCAST
//
// The stream uses an in-process Map of active controllers, keyed by
// org_id:contact_id. The pushAuditEvent function (exported below)
// is called from the audit-writing code paths in the same process.
// This works in dev and in a single-Vercel-function deploy.
//
// V2 ARCHITECTURE — POSTGRES LISTEN/NOTIFY
//
// Vercel serverless functions don't share in-process state. A v2
// uses Postgres LISTEN/NOTIFY: the timeline stream endpoint opens
// a long-lived connection, LISTENs on the `audit_events` channel,
// and forwards notifications to the SSE client. The audit-writing
// code paths do NOTIFY on the same channel. The in-process Map
// stays for dev; production uses LISTEN/NOTIFY.
//
// For the v1, the SSE stream works in dev. In production on Vercel,
// the stream reconnects every few minutes and the initial snapshot
// is read fresh each time. Not real-time, but consistent with the
// rest of the API.

import { NextRequest } from "next/server";
import { requireRole } from "@o/auth";
import { getDb } from "@o/db/client";
import { contacts, deals, invoices, photoJobs, auditEvents } from "@o/db/schema";
import { eq, and, isNull, inArray, sql, desc } from "drizzle-orm";
import { errors } from "@o/errors";
import { createHmac } from "crypto";

// In-memory store of active streams, keyed by org_id+contact_id.
// This is a v1 implementation: it works for a single-process deploy
// (which is what we have on Vercel for the API app). A v2 uses
// Postgres LISTEN/NOTIFY or a Redis pub/sub.
const activeStreams = new Map<string, Set<ReadableStreamDefaultController<Uint8Array>>>();

function streamKey(orgId: string, contactId: string) {
  return `${orgId}:${contactId}`;
}

export const GET_contact_timeline_stream = requireRole("admin", async (ctx) => {
  const url = new URL(ctx.req.url);
  const contactId = url.pathname.split("/").slice(-3, -2)[0];

  const db = getDb();

  // Org check (same as the read endpoint)
  const [contact] = await db.select().from(contacts)
    .where(and(eq(contacts.id, contactId), eq(contacts.orgId, ctx.org.id)))
    .limit(1);
  if (!contact) throw errors.notFound("Contact");

  // Resolve related entity ids (same as the read endpoint)
  const contactDeals = await db.select({ id: deals.id }).from(deals)
    .where(and(eq(deals.contactId, contactId), eq(deals.orgId, ctx.org.id)));
  const dealIds = contactDeals.map((d) => d.id);
  const contactInvoices = await db.select({ id: invoices.id }).from(invoices)
    .where(and(eq(invoices.orgId, ctx.org.id), eq(invoices.clientId, contactId)));
  const invoiceIds = contactInvoices.map((i) => i.id);
  const contactPhotos = await db.select({ id: photoJobs.id }).from(photoJobs)
    .where(and(eq(photoJobs.orgId, ctx.org.id), eq(photoJobs.contactId, contactId)));
  const photoIds = contactPhotos.map((p) => p.id);

  const subjectFilters: ReturnType<typeof sql>[] = [
    sql`(${auditEvents.subjectType} = 'contact' AND ${auditEvents.subjectId} = ${contactId})`,
  ];
  if (dealIds.length > 0) {
    subjectFilters.push(sql`(${auditEvents.subjectType} = 'deal' AND ${auditEvents.subjectId} IN ${dealIds})`);
  }
  if (invoiceIds.length > 0) {
    subjectFilters.push(sql`(${auditEvents.subjectType} = 'invoice' AND ${auditEvents.subjectId} IN ${invoiceIds})`);
  }
  if (photoIds.length > 0) {
    subjectFilters.push(sql`(${auditEvents.subjectType} = 'photo_job' AND ${auditEvents.subjectId} IN ${photoIds})`);
  }

  // SSE response. We use a ReadableStream that stays open for the
  // duration of the connection. The client disconnects when it
  // navigates away; we detect that via the cancel callback.
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const encoder = new TextEncoder();

      function send(event: string, data: unknown) {
        const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
        try {
          controller.enqueue(encoder.encode(payload));
        } catch {
          // Client disconnected; cleanup happens in the cancel callback
        }
      }

      // Send the initial snapshot (most recent 30 events)
      const recent = await db.select().from(auditEvents)
        .where(and(eq(auditEvents.orgId, ctx.org.id), sql`(${sql.join(subjectFilters, sql` OR `)})`))
        .orderBy(desc(auditEvents.createdAt))
        .limit(30);
      for (const e of recent.reverse()) {
        send("event", {
          id: e.id,
          type: e.action,
          subjectType: e.subjectType,
          subjectId: e.subjectId,
          at: e.createdAt.toISOString(),
          actorId: e.actorId,
        });
      }
      send("ready", { ok: true });

      // Register the controller so new events can be pushed
      const key = streamKey(ctx.org.id, contactId);
      if (!activeStreams.has(key)) activeStreams.set(key, new Set());
      activeStreams.get(key)!.add(controller);

      // Heartbeat every 30s. SSE proxies (Vercel) close idle
      // connections; a comment line keeps the stream alive.
      const heartbeat = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(`: heartbeat\n\n`));
        } catch {
          clearInterval(heartbeat);
        }
      }, 30_000);

      // Cleanup on disconnect
      const originalCancel = (this as { cancel?: (reason?: unknown) => void }).cancel;
      (controller as { cancel?: (reason?: unknown) => void }).cancel = (reason) => {
        clearInterval(heartbeat);
        activeStreams.get(key)?.delete(controller);
        if (activeStreams.get(key)?.size === 0) activeStreams.delete(key);
        return originalCancel?.call(controller, reason);
      };
    },
  });

  return new Response(stream, {
    headers: {
      "content-type": "text/event-stream",
      "cache-control": "no-cache, no-transform",
      "connection": "keep-alive",
      "x-accel-buffering": "no",  // disable nginx buffering
    },
  });
});

// =============================================================================
// pushAuditEvent — called from the audit-writing code paths
// =============================================================================
// When a new audit event is written, the writer calls this function
// to fan out the event to any active streams that care about it.

export async function pushAuditEvent(event: {
  orgId: string;
  subjectType: string;
  subjectId: string;
  action: string;
  actorId: string | null;
  id: string;
  createdAt: Date;
}) {
  // Find the contact this event is about (if any)
  let contactId: string | null = null;

  if (event.subjectType === "contact") {
    contactId = event.subjectId;
  } else if (event.subjectType === "deal") {
    const db = getDb();
    const [d] = await db.select({ contactId: deals.contactId }).from(deals)
      .where(eq(deals.id, event.subjectId)).limit(1);
    contactId = d?.contactId ?? null;
  } else if (event.subjectType === "invoice") {
    const db = getDb();
    const [inv] = await db.select({ contactId: invoices.clientId }).from(invoices)
      .where(eq(invoices.id, event.subjectId)).limit(1);
    contactId = inv?.contactId ?? null;
  } else if (event.subjectType === "photo_job") {
    const db = getDb();
    const [p] = await db.select({ contactId: photoJobs.contactId }).from(photoJobs)
      .where(eq(photoJobs.id, event.subjectId)).limit(1);
    contactId = p?.contactId ?? null;
  }

  if (!contactId) return;

  const key = streamKey(event.orgId, contactId);
  const streams = activeStreams.get(key);
  if (!streams || streams.size === 0) return;

  const encoder = new TextEncoder();
  const payload = `event: event\ndata: ${JSON.stringify({
    id: event.id,
    type: event.action,
    subjectType: event.subjectType,
    subjectId: event.subjectId,
    at: event.createdAt.toISOString(),
    actorId: event.actorId,
  })}\n\n`;

  for (const controller of streams) {
    try {
      controller.enqueue(encoder.encode(payload));
    } catch {
      streams.delete(controller);
    }
  }
}

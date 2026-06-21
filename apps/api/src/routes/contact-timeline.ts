// =============================================================================
// o.company · /api/contacts/:id/timeline — the contact activity timeline
// =============================================================================
// Every external side effect the platform takes for a contact — email
// drafts, sent emails, invoice events, payment events, ticket events,
// photo deliveries — aggregated into a single timeline, newest first.
//
// The trust model says every external side effect writes to the audit
// log. The timeline is a *read-side* view of the audit log, joined
// with the human-readable details from the relevant tables. It does
// not write anything; it reads from `audit_events` and joins the
// `subject_id` and `subject_type` of the event to the contact.
//
// Why this is the "ambient signal capture" the strategy asked for:
// the strategy wanted "no manual entry" by having AI watch screens.
// We can't do that (trust model). What we CAN do is make sure every
// signal the platform already produces — a draft, a send, a payment,
// a reply — appears in one place. The rep doesn't have to click
// through five tabs. The timeline is the answer.

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { eq, and, desc, inArray, or, sql, SQL } from "drizzle-orm";
import { requireRole } from "@o/auth";
import { getDb } from "@o/db/client";
import { auditEvents, contacts, deals, invoices, operatorDrafts, photoJobs } from "@o/db/schema";
import { errors } from "@o/errors";

const QuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(30),
  before: z.string().optional(),  // cursor: createdAt of last seen event
});

interface TimelineEvent {
  id: string;
  at: string;
  type: string;        // "draft.sent", "invoice.paid", "ticket.opened", etc.
  channel: "email" | "sms" | "in_app" | "system" | "payment" | "ticket" | "photo";
  summary: string;     // one-line human description
  actorName: string | null;  // who did it (O'Shay, the AI, the prospect via Stripe)
  meta: Record<string, unknown>;
  // Optional deep links
  link?: string;
}

export const GET_contact_timeline = requireRole("admin", async (ctx) => {
  const url = new URL(ctx.req.url);
  const contactId = url.pathname.split("/").slice(-2, -1)[0];
  const params = QuerySchema.parse(Object.fromEntries(url.searchParams));

  const db = getDb();

  // 1. Verify the contact belongs to this org. Without this, the
  //    timeline becomes a cross-org data exfiltration vector.
  const [contact] = await db.select().from(contacts)
    .where(and(eq(contacts.id, contactId), eq(contacts.orgId, ctx.org.id)))
    .limit(1);
  if (!contact) throw errors.notFound("Contact");

  // 2. Find the related entity ids: deals for this contact, invoices
  //    linked to those deals, payments linked to those invoices, etc.
  //    We do this in one query each and assemble a list of
  //    (subjectType, subjectId) pairs to look up in audit_events.
  const contactDeals = await db.select({ id: deals.id }).from(deals)
    .where(and(eq(deals.contactId, contactId), eq(deals.orgId, ctx.org.id)));
  const dealIds = contactDeals.map((d) => d.id);

  // Invoices for the contact (the invoice schema uses clientId, the
  // column for "contact this invoice is billed to")
  const contactInvoices = await db.select({ id: invoices.id }).from(invoices)
    .where(and(eq(invoices.orgId, ctx.org.id), eq(invoices.clientId, contactId)));
  const invoiceIds = contactInvoices.map((i) => i.id);

  // Photo jobs for the contact
  const contactPhotos = await db.select({ id: photoJobs.id }).from(photoJobs)
    .where(and(eq(photoJobs.orgId, ctx.org.id), eq(photoJobs.contactId, contactId)));
  const photoIds = contactPhotos.map((p) => p.id);

  // Tickets aren't in v1 of the timeline — they're filed by people
  // (requesterId), not by contact. A future add would join through
  // people.email. The strategy doc's "everything in one place" idea
  // is right; the join is the next step.

  // 3. Build the subject filter for the audit query. We want events
  //    where subject is any of: the contact itself, one of the
  //    contact's deals, one of the contact's invoices, or one of
  //    the contact's photo jobs.
  const subjectFilters: SQL[] = [
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

  const conditions = [
    eq(auditEvents.orgId, ctx.org.id),
    or(...subjectFilters)!,
  ];
  if (params.before) conditions.push(sql`${auditEvents.createdAt} < ${new Date(params.before)}`);

  const rows = await db.select().from(auditEvents)
    .where(and(...conditions))
    .orderBy(desc(auditEvents.createdAt))
    .limit(params.limit + 1);

  const hasMore = rows.length > params.limit;
  const events: TimelineEvent[] = rows.slice(0, params.limit).map((e) => {
    return {
      id: e.id,
      at: e.createdAt.toISOString(),
      type: e.action,
      channel: inferChannel(e.action),
      summary: humanize(e.action, e.before, e.after, e.context),
      actorName: null,  // resolved below
      meta: { ...(e.before ?? {}), ...(e.after ?? {}) },
    };
  });

  // 4. Resolve actor names. We do a single batched lookup.
  const actorIds = Array.from(new Set(rows.map((r) => r.actorId).filter((id): id is string => !!id)));
  const actorMap = new Map<string, string>();
  if (actorIds.length > 0) {
    const { people } = await import("@o/db/schema");
    const actors = await db.select({
      id: people.id, firstName: people.firstName, lastName: people.lastName,
    }).from(people).where(inArray(people.id, actorIds));
    for (const a of actors) {
      actorMap.set(a.id, `${a.firstName} ${a.lastName}`.trim() || "Unknown");
    }
  }
  for (const e of events) {
    const row = rows.find((r) => r.id === e.id);
    if (row?.actorId) e.actorName = actorMap.get(row.actorId) ?? null;
  }

  return NextResponse.json({
    contactId,
    contactName: `${contact.firstName} ${contact.lastName}`.trim(),
    events,
    pagination: {
      hasMore,
      nextCursor: hasMore && rows[params.limit - 1]
        ? rows[params.limit - 1]!.createdAt.toISOString()
        : null,
    },
  });
});

// Channel inference from action name. Email, system, payment, ticket, photo.
function inferChannel(action: string): TimelineEvent["channel"] {
  if (action.startsWith("operator.")) return "email";
  if (action.startsWith("invoice.") || action.startsWith("payment.")) return "payment";
  if (action.startsWith("ticket.")) return "ticket";
  if (action.startsWith("photo.")) return "photo";
  if (action.startsWith("auth.")) return "system";
  return "in_app";
}

// Humanize the event into a one-line summary. The strategy wanted
// "feels like a digital employee" — the summary is the digital
// employee's voice. We try to make it readable, not literal.
function humanize(
  action: string,
  before: Record<string, unknown> | null,
  after: Record<string, unknown> | null,
  context: Record<string, unknown> | null,
): string {
  switch (action) {
    case "operator.draft_created":    return "Operator drafted a follow-up";
    case "operator.draft_approved":   return "Approved a draft and prepared it to send";
    case "operator.draft_rejected":   return "Rejected a draft";
    case "operator.draft_sent":       return "Sent an email";
    case "invoice.create":            return "Invoice drafted";
    case "invoice.send":              return "Invoice sent";
    case "invoice.pay":               return "Invoice paid";
    case "invoice.refund":            return "Invoice refunded";
    case "ticket.create":             return "Ticket opened";
    case "ticket.reply":              return "Replied to ticket";
    case "ticket.resolve":            return "Ticket resolved";
    case "photo.upload":              return "Photo uploaded";
    case "photo.deliver":             return "Photo delivered";
    case "deal.create":               return "Deal created";
    case "deal.stage_change": {
      const newStage = (after as { stage?: string } | null)?.stage;
      return newStage ? `Moved deal to ${newStage}` : "Deal stage changed";
    }
    case "deal.delete":               return "Deal deleted";
    case "contact.create":            return "Contact added";
    case "contact.update":            return "Contact updated";
    case "person.invite":             return "Invited to the team";
    case "auth.login":                return "Signed in";
    default:
      // Fall back to a label of the action
      return action.replace(/[._]/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
  }
}

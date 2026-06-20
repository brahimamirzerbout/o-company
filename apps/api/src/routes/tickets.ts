// =============================================================================
// o.company · tickets (support) routes
// =============================================================================
// Tickets are the inbound communication channel from any audience
// (customer, prospect, employee, vendor). Anyone with an org can create
// them; employees + the org's support reps respond; customers see only
// their own.

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { eq, and, desc } from "drizzle-orm";
import { getDb } from "@o/db/client";
import { tickets, ticketMessages } from "@o/db/schema";
import { errors } from "@o/errors";
import { withAuth } from "@/middleware/with-auth";
import { requirePermission, can } from "@o/auth/rbac";
import { sendEmail } from "@o/email";
import { TicketReplyTemplate, TicketResolvedTemplate } from "@o/email/templates";
import { logger } from "@o/logger";
import { enqueue } from "@o/jobs";

// ---- GET /api/tickets ----
export const GET_tickets = withAuth(async (ctx) => {
  // Clients only see their own; staff see all in the org
  if (!can(ctx.person, "support:read")) {
    // Client path: scope to this person as requester
    const db = getDb();
    const list = await db.select().from(tickets).where(and(eq(tickets.orgId, ctx.org.id), eq(tickets.requesterId, ctx.person.id))).orderBy(desc(tickets.createdAt));
    return NextResponse.json({ items: list });
  }
  const db = getDb();
  const list = await db.select().from(tickets).where(eq(tickets.orgId, ctx.org.id)).orderBy(desc(tickets.createdAt));
  return NextResponse.json({ items: list });
});

// ---- POST /api/tickets ----
const createSchema = z.object({
  subject: z.string().min(1),
  body: z.string().min(1),
  priority: z.enum(["low", "normal", "high", "urgent"]).default("normal"),
  tags: z.array(z.string()).default([]),
});
export const POST_tickets = withAuth(async (ctx, { body }) => {
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) throw errors.validation("Invalid input");
  const db = getDb();
  const [ticket] = await db.insert(tickets).values({
    orgId: ctx.org.id,
    subject: parsed.data.subject,
    body: parsed.data.body,
    priority: parsed.data.priority,
    requesterId: ctx.person.id,
    tags: parsed.data.tags,
    status: "open",
  }).returning();
  // Drop the first message
  await db.insert(ticketMessages).values({
    ticketId: ticket.id,
    authorId: ctx.person.id,
    body: parsed.data.body,
  });
  return NextResponse.json(ticket, { status: 201 });
});

// ---- GET /api/tickets/:id ----
export const GET_ticket = withAuth(async (ctx) => {
  const id = pathLast(ctx.req);
  const db = getDb();
  const [ticket] = await db.select().from(tickets).where(and(eq(tickets.id, id), eq(tickets.orgId, ctx.org.id)));
  if (!ticket) throw errors.notFound("Ticket");
  // RBAC: client can only see their own
  if (!can(ctx.person, "support:read") && ticket.requesterId !== ctx.person.id) {
    throw errors.forbidden();
  }
  const messages = await db.select().from(ticketMessages).where(eq(ticketMessages.ticketId, id));
  return NextResponse.json({ ...ticket, messages });
});

// ---- POST /api/tickets/:id/reply ----
const replySchema = z.object({ body: z.string().min(1) });
export const POST_ticket_reply = withAuth(async (ctx, { body }) => {
  const ticketId = pathAt(ctx.req, -2);
  const parsed = replySchema.safeParse(body);
  if (!parsed.success) throw errors.validation("Invalid input");
  const db = getDb();
  const [ticket] = await db.select().from(tickets).where(and(eq(tickets.id, ticketId), eq(tickets.orgId, ctx.org.id)));
  if (!ticket) throw errors.notFound("Ticket");
  if (!can(ctx.person, "support:respond") && ticket.requesterId !== ctx.person.id) {
    throw errors.forbidden();
  }
  const [msg] = await db.insert(ticketMessages).values({
    ticketId,
    authorId: ctx.person.id,
    body: parsed.data.body,
  }).returning();
  // Move out of "waiting_customer" if internal
  if (can(ctx.person, "support:respond") && ticket.status === "waiting_customer") {
    await db.update(tickets).set({ status: "in_progress", updatedAt: new Date() }).where(eq(tickets.id, ticketId));
  }
  // Email the other party
  const requester = ticket.requesterId === ctx.person.id
    ? ctx.person
    : await db.query.people.findFirst({ where: (p, { eq }) => eq(p.id, ticket.requesterId) });
  if (requester) {
    await sendEmail({
      to: requester.email,
      template: "ticket_reply",
      props: {
        orgName: ctx.org.name,
        ticketSubject: ticket.subject,
        ticketId,
        responderName: `${ctx.person.firstName} ${ctx.person.lastName}`,
        replyBody: parsed.data.body,
        ticketUrl: `${process.env.NEXT_PUBLIC_APP_URL}/tickets/${ticketId}`,
      },
    });
  }
  logger.info("ticket.replied", { ticketId, by: ctx.person.id });
  return NextResponse.json(msg, { status: 201 });
});

// ---- POST /api/tickets/:id/resolve ----
export const POST_ticket_resolve = withAuth(async (ctx) => {
  const ticketId = pathAt(ctx.req, -2);
  requirePermission(ctx.person, "support:respond");
  const db = getDb();
  const [ticket] = await db.select().from(tickets).where(and(eq(tickets.id, ticketId), eq(tickets.orgId, ctx.org.id)));
  if (!ticket) throw errors.notFound("Ticket");
  await db.update(tickets).set({ status: "resolved", resolvedAt: new Date() }).where(eq(tickets.id, ticketId));
  const requester = await db.query.people.findFirst({ where: (p, { eq }) => eq(p.id, ticket.requesterId) });
  if (requester) {
    await sendEmail({
      to: requester.email,
      template: "ticket_resolved",
      props: { ticketSubject: ticket.subject, ticketId, ticketUrl: `${process.env.NEXT_PUBLIC_APP_URL}/tickets/${ticketId}` },
    });
  }
  return NextResponse.json({ ok: true });
});

function pathLast(req: NextRequest): string { return req.nextUrl.pathname.split("/").pop()!; }
function pathAt(req: NextRequest, i: number): string { return req.nextUrl.pathname.split("/").filter(Boolean).at(i) ?? ""; }

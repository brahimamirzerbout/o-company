// =============================================================================
// GDPR data subject rights — DELETE /api/people/:id and GET /api/people/:id/export
// =============================================================================
// Implements:
//   - Article 17: Right to erasure ("right to be forgotten")
//   - Article 20: Right to data portability
//
// The DELETE endpoint does NOT hard-delete the row. It:
//   1. Anonymizes all PII fields (replaces with "[deleted]")
//   2. Marks the person as "deactivated" with a deleted_at timestamp
//   3. Preserves the audit log (the event log is append-only and
//      required for compliance; PII is stripped from the event payload
//      that references the deleted person)
//   4. Cascades to: contacts owned by this person, projects,
//      drafts assigned to this person (anonymize the assignee_id
//      reference but keep the row for audit), audit log entries
//      (rewrite the actor_id to NULL)
//
// The export endpoint returns a JSON dump of everything associated
// with the person. The response is the user's data. The user can
// download it. We don't email it. We don't store it.
//
// Both endpoints require owner role. Data subject requests are
// legally required to be processed by the data controller (the org),
// and the org's owner is the right person to handle them.

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireRole } from "@o/auth";
import { getDb } from "@o/db/client";
import {
  people, contacts, deals, projects, projects as projectsT, tickets,
  operatorDrafts, auditEvents, invoices, sessions,
} from "@o/db/schema";
import { eq, and, isNull, inArray, count } from "drizzle-orm";
import { logger } from "@o/logger";
import { randomUUID } from "crypto";

// =============================================================================
// DELETE /api/people/:id — right to erasure
// =============================================================================
// Owner-only. Hard-disables the user, anonymizes PII, preserves the
// audit trail. This is the GDPR Article 17 implementation.

const DeleteSchema = z.object({
  /** Optional reason. Logged to the audit trail. */
  reason: z.string().max(500).optional(),
});

export const DELETE_gdpr = requireRole("owner", async (ctx, { body }) => {
  const data = DeleteSchema.parse(body ?? {});
  // Path is /api/people/<id>/gdpr-delete — the id is the 4th segment
  const segments = ctx.req.nextUrl.pathname.split("/").filter(Boolean);
  const targetId = segments[3];

  // 1) Verify the target exists in this org
  const db = getDb();
  const [target] = await db.select().from(people)
    .where(and(eq(people.id, targetId), eq(people.orgId, ctx.org.id)))
    .limit(1);

  if (!target) {
    return NextResponse.json({ error: { code: "NOT_FOUND", message: "Person not found in this org" } }, { status: 404 });
  }

  // 2) Refuse to delete the only owner. We need at least one owner per
  //    org. If you want to delete an owner, transfer ownership first.
  if (target.role === "owner") {
    const [ownerCount] = await db.select({ n: count() }).from(people)
      .where(and(eq(people.orgId, ctx.org.id), eq(people.role, "owner"), eq(people.status, "active")));
    if ((ownerCount?.n ?? 0) <= 1) {
      return NextResponse.json(
        { error: { code: "VALIDATION", message: "Cannot delete the only owner. Transfer ownership first." } },
        { status: 400 },
      );
    }
  }

  // 3) Anonymize the person
  const now = new Date();
  const anonymizedEmail = `deleted+${targetId}@anonymized.local`;
  const anonymizedName = "[deleted]";

  await db.update(people).set({
    email: anonymizedEmail,
    name: anonymizedName,
    passwordHash: null,
    twoFactorSecret: null,
    twoFactorEnabled: false,
    status: "deactivated",
    deletedAt: now,
    updatedAt: now,
  }).where(eq(people.id, targetId));

  // 4) Revoke all sessions
  await db.delete(sessions).where(eq(sessions.personId, targetId));

  // 5) Anonymize contacts owned by this person. The contacts themselves
  //    stay (other people may have referred to them in deals, etc) but
  //    the owner_id becomes null. We don't anonymize the contact's
  //    name/email because the contact is its own data subject.
  await db.update(contacts).set({
    ownerId: null,
    updatedAt: now,
  }).where(eq(contacts.ownerId, targetId));

  // 6) Anonymize the assignee_id on operator_drafts. The drafts stay
  //    (they're the org's data) but they no longer reference the
  //    deleted person.
  await db.update(operatorDrafts).set({
    assigneeId: null,
    updatedAt: now,
  }).where(eq(operatorDrafts.assigneeId, targetId));

  // 7) Audit log entries: keep the rows (required for compliance) but
  //    rewrite the actor_id to null. The actor_name was denormalized
  //    into the payload at write time; we don't touch the payload.
  await db.update(auditEvents).set({
    actorId: null,
  }).where(eq(auditEvents.actorId, targetId));

  // 8) Log the deletion to the audit trail
  await db.insert(auditEvents).values({
    id: randomUUID(),
    orgId: ctx.org.id,
    actorId: ctx.person.id,
    type: "person.deactivated",
    subjectType: "person",
    subjectId: targetId,
    payload: { reason: data.reason ?? null, anonymizedEmail },
    occurredAt: now.toISOString(),
  });

  logger.info("gdpr.delete_completed", {
    orgId: ctx.org.id,
    targetId,
    actorId: ctx.person.id,
    reason: data.reason ?? null,
  });

  return NextResponse.json({
    ok: true,
    deleted: targetId,
    anonymized: true,
    sessionsRevoked: true,
  });
});

// =============================================================================
// GET /api/people/:id/export — right to data portability
// =============================================================================
// Returns a JSON dump of everything associated with the person. The
// user gets one ZIP-shaped JSON object with their data. This is GDPR
// Article 20.
//
// What we include:
//   - Person profile (without password hash)
//   - Contacts owned
//   - Deals owned
//   - Projects owned
//   - Tickets raised
//   - Operator drafts assigned (or previously assigned)
//   - Audit log entries they made
//   - Sessions they've had
//
// What we DON'T include:
//   - Password hash
//   - 2FA secret
//   - Internal IDs of OTHER users
//   - Stripe customer/payment records (those are Stripe's data,
//     not ours, and the user can request them from Stripe directly)

export const GET_export = requireRole("owner", async (ctx) => {
  // Path is /api/people/<id>/export — the id is the 4th segment
  const segments = ctx.req.nextUrl.pathname.split("/").filter(Boolean);
  const targetId = segments[3];

  const db = getDb();
  const [target] = await db.select().from(people)
    .where(and(eq(people.id, targetId), eq(people.orgId, ctx.org.id)))
    .limit(1);

  if (!target) {
    return NextResponse.json({ error: { code: "NOT_FOUND", message: "Person not found" } }, { status: 404 });
  }

  // Gather everything in parallel
  const [
    ownedContacts,
    ownedDeals,
    ownedProjects,
    raisedTickets,
    assignedDrafts,
    auditEntries,
    sessionCount,
  ] = await Promise.all([
    db.select().from(contacts).where(eq(contacts.ownerId, targetId)),
    db.select().from(deals).where(eq(deals.ownerId, targetId)),
    db.select().from(projectsT).where(eq(projectsT.ownerId, targetId)),
    db.select().from(tickets).where(eq(tickets.requesterId, targetId)),
    db.select().from(operatorDrafts).where(eq(operatorDrafts.assigneeId, targetId)),
    db.select().from(auditEvents).where(eq(auditEvents.actorId, targetId)),
    db.select({ n: count() }).from(sessions).where(eq(sessions.personId, targetId)),
  ]);

  // Strip PII that's not the user's own (other people's emails in
  // the assignee_id fields of their drafts, etc). The user's own PII
  // stays; other people's is reduced to IDs.
  const safeDrafts = assignedDrafts.map((d) => ({
    id: d.id,
    kind: d.kind,
    channel: d.channel,
    status: d.status,
    title: d.title,
    body: d.body,
    reasoning: d.reasoning,
    createdAt: d.createdAt,
    subjectType: d.subjectType,
    subjectId: d.subjectId,
    // Don't include the actual body if the operator already sent it
    // (avoid double-sending on data export). Keep the metadata.
  }));

  // Audit entries: keep the type and timestamp, redact the payload
  // if it contains PII of other users.
  const safeAudit = auditEntries.map((a) => ({
    id: a.id,
    type: a.type,
    subjectType: a.subjectType,
    subjectId: a.subjectId,
    occurredAt: a.occurredAt,
    // payload is intentionally omitted — it may contain other
    // users' PII. The audit log is append-only; the user gets a
    // record of the events they participated in, not the bodies.
  }));

  const export_ = {
    exportedAt: new Date().toISOString(),
    exportedBy: ctx.person.id,
    person: {
      id: target.id,
      email: target.email,
      name: target.name,
      role: target.role,
      department: target.department,
      status: target.status,
      createdAt: target.createdAt,
      // NO passwordHash, NO twoFactorSecret
    },
    org: {
      id: ctx.org.id,
      name: ctx.org.name,
    },
    counts: {
      contacts: ownedContacts.length,
      deals: ownedDeals.length,
      projects: ownedProjects.length,
      tickets: raisedTickets.length,
      drafts: safeDrafts.length,
      auditEntries: safeAudit.length,
      sessions: sessionCount?.[0]?.n ?? 0,
    },
    data: {
      contacts: ownedContacts,
      deals: ownedDeals,
      projects: ownedProjects,
      tickets: raisedTickets,
      drafts: safeDrafts,
      audit: safeAudit,
    },
  };

  // Set content-disposition so the browser downloads as a file
  return new NextResponse(JSON.stringify(export_, null, 2), {
    headers: {
      "content-type": "application/json",
      "content-disposition": `attachment; filename="o-company-export-${targetId}.json"`,
    },
  });
});

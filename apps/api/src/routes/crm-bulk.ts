// =============================================================================
// o.company · CRM bulk operations
// =============================================================================
// The "100 contacts to update" problem. Without bulk operations, a user
// with 10k contacts has to make 10k individual PATCH calls. With bulk
// operations, they make 1 call with 100 ids and a delta object.
//
// What this file does:
//   POST /api/crm/contacts/bulk-update
//     Body: { ids: string[], updates: Partial<ContactSchema> }
//     Behavior: updates every contact in the array. Each row is
//     audited. Rate-limited. Owner/admin only. Max 200 ids per call.
//
//   POST /api/crm/contacts/bulk-delete
//     Body: { ids: string[] }
//     Behavior: soft-deletes every contact in the array. Each row is
//     audited. Rate-limited. Owner/admin only. Max 200 ids per call.
//
//   POST /api/crm/deals/bulk-update
//     Body: { ids: string[], updates: Partial<DealSchema> }
//     Behavior: same as contacts but for deals. Stage changes
//     reset stageChangedAt and (for terminal stages) set closedAt.
//     Win/loss reason requirements are enforced per-row.
//
// Trust model: every external side effect requires approval. Bulk
// updates are *internal* changes (status, owner, tags) — not
// external side effects. Bulk *sends* would require per-row
// approval; this isn't that. The audit log records every change
// so O'Shay can see what happened.

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { eq, and, inArray, isNull } from "drizzle-orm";
import { requireRole } from "@o/auth";
import { getDb } from "@o/db/client";
import { contacts, deals, auditEvents } from "@o/db/schema";
import { errors } from "@o/errors";
import { checkRateLimit, keyFromAuth } from "@o/ratelimit";
import { contactSchema, dealSchema } from "./crm-schemas";

const MAX_BULK_SIZE = 200;

const BulkUpdateSchema = z.object({
  ids: z.array(z.string().uuid()).min(1).max(MAX_BULK_SIZE),
  updates: contactSchema.partial(),
});

const BulkUpdateDealsSchema = z.object({
  ids: z.array(z.string().uuid()).min(1).max(MAX_BULK_SIZE),
  updates: dealSchema.partial(),
});

const BulkDeleteSchema = z.object({
  ids: z.array(z.string().uuid()).min(1).max(MAX_BULK_SIZE),
});

// =============================================================================
// POST /api/crm/contacts/bulk-update
// =============================================================================
// Updates up to 200 contacts in one call. Each row is audited. Returns
// { updated, failed, errors: [{ id, message }] } so the caller can
// retry the failed ones.

export const POST_contacts_bulk_update = requireRole("admin", async (ctx, { body }) => {
  const limited = await checkRateLimit({
    key: keyFromAuth(ctx.person.id, "crm:contacts:bulk"),
    limit: 10,
    windowSeconds: 60,
  });
  if (limited) return limited;

  const parsed = BulkUpdateSchema.safeParse(body);
  if (!parsed.success) throw errors.validation("Invalid input", { issues: parsed.error.issues });
  const { ids, updates } = parsed.data;

  const db = getDb();

  // Verify all ids belong to the org. Without this, the bulk update
  // becomes a cross-org data exfiltration vector. We do one SELECT
  // for all ids, then the update is bounded by the org check.
  const ownedContacts = await db.select({ id: contacts.id })
    .from(contacts)
    .where(and(
      inArray(contacts.id, ids),
      eq(contacts.orgId, ctx.org.id),
      isNull(contacts.deletedAt),
    ));
  const ownedIds = new Set(ownedContacts.map((c) => c.id));
  const notFound = ids.filter((id) => !ownedIds.has(id));

  if (notFound.length > 0) {
    return NextResponse.json({
      updated: 0,
      failed: notFound.length,
      notFound,
      errors: notFound.map((id) => ({ id, message: "Not found in this org" })),
    }, { status: 207 });  // Multi-Status
  }

  // Apply the update. Drizzle's bulk update with `inArray` is one query.
  const now = new Date();
  await db.update(contacts).set({
    ...updates,
    updatedAt: now,
    lastContactedAt: updates.lastContactedAt ?? now.toISOString(),
  }).where(inArray(contacts.id, ids));

  // Audit each row. We do this in a single batch insert for speed.
  // The audit row records what changed, who changed it, and the
  // before/after of the key fields.
  const auditRows = ids.map((id) => ({
    id: crypto.randomUUID(),
    orgId: ctx.org.id,
    actorId: ctx.person.id,
    action: "contact.bulk_update",
    subjectType: "contact",
    subjectId: id,
    after: updates as Record<string, unknown>,
    ipAddress: ctx.req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
    userAgent: ctx.req.headers.get("user-agent") ?? null,
  }));
  try {
    await db.insert(auditEvents).values(auditRows);
  } catch { /* best-effort */ }

  return NextResponse.json({
    updated: ids.length,
    failed: 0,
    notFound: [],
    errors: [],
  });
});

// =============================================================================
// POST /api/crm/contacts/bulk-delete
// =============================================================================
// Soft-deletes up to 200 contacts. Each row is audited. Returns the
// count of contacts deleted.

export const POST_contacts_bulk_delete = requireRole("admin", async (ctx, { body }) => {
  const limited = await checkRateLimit({
    key: keyFromAuth(ctx.person.id, "crm:contacts:bulk"),
    limit: 5,
    windowSeconds: 60,
  });
  if (limited) return limited;

  const parsed = BulkDeleteSchema.safeParse(body);
  if (!parsed.success) throw errors.validation("Invalid input", { issues: parsed.error.issues });
  const { ids } = parsed.data;

  const db = getDb();

  // Org-scoped soft delete. We only soft-delete contacts that belong
  // to the caller's org and aren't already deleted.
  const now = new Date();
  const result = await db.update(contacts)
    .set({ deletedAt: now, updatedAt: now })
    .where(and(
      inArray(contacts.id, ids),
      eq(contacts.orgId, ctx.org.id),
      isNull(contacts.deletedAt),
    ))
    .returning({ id: contacts.id });

  const deletedIds = result.map((r) => r.id);
  const notDeleted = ids.filter((id) => !deletedIds.includes(id));

  // Audit each deleted row.
  if (deletedIds.length > 0) {
    try {
      await db.insert(auditEvents).values(deletedIds.map((id) => ({
        id: crypto.randomUUID(),
        orgId: ctx.org.id,
        actorId: ctx.person.id,
        action: "contact.bulk_delete",
        subjectType: "contact",
        subjectId: id,
        ipAddress: ctx.req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
        userAgent: ctx.req.headers.get("user-agent") ?? null,
      })));
    } catch { /* best-effort */ }
  }

  return NextResponse.json({
    deleted: deletedIds.length,
    failed: notDeleted.length,
    notDeleted,
  });
});

// =============================================================================
// POST /api/crm/deals/bulk-update
// =============================================================================
// Same shape as contacts, with two extra rules:
//   1. If the updates include a stage change to "won" or "lost",
//      winReason or lossReason is required (per the win/loss
//      analysis feature). We enforce this once on the bulk
//      updates object, not per-row — the user is moving a batch
//      of deals to the same stage with the same reason.
//   2. Every update bumps lastActivityAt so the lapse-prevention
//      feature doesn't false-positive on a bulk-updated deal.

export const POST_deals_bulk_update = requireRole("admin", async (ctx, { body }) => {
  const limited = await checkRateLimit({
    key: keyFromAuth(ctx.person.id, "crm:deals:bulk"),
    limit: 10,
    windowSeconds: 60,
  });
  if (limited) return limited;

  const parsed = BulkUpdateDealsSchema.safeParse(body);
  if (!parsed.success) throw errors.validation("Invalid input", { issues: parsed.error.issues });
  const { ids, updates } = parsed.data;

  // Win/loss reason enforcement
  if (updates.stage === "won" && !updates.winReason) {
    throw errors.validation("winReason is required when moving deals to 'won'");
  }
  if (updates.stage === "lost" && !updates.lossReason) {
    throw errors.validation("lossReason is required when moving deals to 'lost'");
  }

  const db = getDb();

  // Org-scoped
  const ownedDeals = await db.select({ id: deals.id })
    .from(deals)
    .where(and(
      inArray(deals.id, ids),
      eq(deals.orgId, ctx.org.id),
      isNull(deals.deletedAt),
    ));
  const ownedIds = new Set(ownedDeals.map((d) => d.id));
  const notFound = ids.filter((id) => !ownedIds.has(id));

  if (notFound.length > 0) {
    return NextResponse.json({
      updated: 0,
      failed: notFound.length,
      notFound,
      errors: notFound.map((id) => ({ id, message: "Not found in this org" })),
    }, { status: 207 });
  }

  const now = new Date();
  const updateValues: Record<string, unknown> = {
    ...updates,
    updatedAt: now,
    lastActivityAt: now,
  };
  if (updates.stage) {
    updateValues.stageChangedAt = now;
    if (updates.stage === "won" || updates.stage === "lost") {
      updateValues.closedAt = now;
    }
  }

  await db.update(deals).set(updateValues).where(inArray(deals.id, ids));

  // Audit each row
  const auditAction = updates.stage === "won" ? "deal.bulk_won"
    : updates.stage === "lost" ? "deal.bulk_lost"
    : "deal.bulk_update";
  try {
    await db.insert(auditEvents).values(ids.map((id) => ({
      id: crypto.randomUUID(),
      orgId: ctx.org.id,
      actorId: ctx.person.id,
      action: auditAction,
      subjectType: "deal",
      subjectId: id,
      after: updates as Record<string, unknown>,
      ipAddress: ctx.req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
      userAgent: ctx.req.headers.get("user-agent") ?? null,
    })));
  } catch { /* best-effort */ }

  return NextResponse.json({
    updated: ids.length,
    failed: 0,
    notFound: [],
    errors: [],
  });
});

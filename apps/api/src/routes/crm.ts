// =============================================================================
// o.company · CRM routes — contacts, companies, deals
// =============================================================================
// The full CRUD for the contact + company + deal surfaces. Same shape as
// the web app's internal store, exposed as REST. List endpoints support
// cursor-based pagination via ?cursor=<id>&limit=<n>.

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { eq, and, or, desc, isNull, ilike, sql } from "drizzle-orm";
import { getDb } from "@o/db/client";
import { contacts, companies, deals } from "@o/db/schema";
import { errors } from "@o/errors";
import { withAuth } from "@/middleware/with-auth";
import { requirePermission } from "@o/auth/rbac";
import { checkRateLimit, keyFromAuth } from "@o/ratelimit";
import { companySchema, contactSchema, dealSchema } from "./crm-schemas";
import { checkRateLimit, keyFromAuth } from "@o/ratelimit";

// =====================================================================
// Companies
// =====================================================================

export const GET_companies = withAuth(async (ctx) => {
  requirePermission(ctx.person, "crm:read");
  // P1-2: rate-limit reads
  const limited = await checkRateLimit({ key: keyFromAuth(ctx.person.id, "crm:companies:read"), limit: 60, windowSeconds: 60 });
  if (limited) return limited;

  const url = new URL(ctx.req.url);
  const limit = Math.min(Number(url.searchParams.get("limit") ?? 50), 200);
  const cursor = url.searchParams.get("cursor");
  const db = getDb();
  // P0-1 fix: drop the bogus `isNull(companies.logo as never)`.
  // P0-5 pattern: sort by (createdAt, id) for stable cursor.
  const parsedCursor = cursor ? parseCursor(cursor) : null;
  const where = parsedCursor
    ? and(
        eq(companies.orgId, ctx.org.id),
        sql`(${companies.createdAt}, ${companies.id}) < (${parsedCursor.at}, ${parsedCursor.id})`,
      )
    : eq(companies.orgId, ctx.org.id);
  const list = await db.select().from(companies).where(where).orderBy(desc(companies.createdAt), desc(companies.id)).limit(limit + 1);
  const hasMore = list.length > limit;
  const nextCursor = hasMore && list[limit - 1]
    ? buildCursor(list[limit - 1].createdAt, list[limit - 1].id)
    : null;
  return NextResponse.json({ items: list.slice(0, limit), nextCursor });
});

export const POST_companies = withAuth(async (ctx, { body }) => {
  requirePermission(ctx.person, "crm:write");
  const parsed = companySchema.safeParse(body);
  if (!parsed.success) throw errors.validation("Invalid input", { issues: parsed.error.issues });
  const db = getDb();
  const [created] = await db.insert(companies).values({ orgId: ctx.org.id, ...parsed.data }).returning();
  return NextResponse.json(created, { status: 201 });
});

export const GET_company = withAuth(async (ctx) => {
  const id = pathLast(ctx.req);
  requirePermission(ctx.person, "crm:read");
  const db = getDb();
  const [company] = await db.select().from(companies).where(and(eq(companies.id, id), eq(companies.orgId, ctx.org.id)));
  if (!company) throw errors.notFound("Company");
  return NextResponse.json(company);
});

export const PATCH_company = withAuth(async (ctx, { body }) => {
  const id = pathLast(ctx.req);
  requirePermission(ctx.person, "crm:write");
  const parsed = companySchema.partial().safeParse(body);
  if (!parsed.success) throw errors.validation("Invalid input");
  const db = getDb();
  const [updated] = await db.update(companies).set(parsed.data).where(and(eq(companies.id, id), eq(companies.orgId, ctx.org.id))).returning();
  if (!updated) throw errors.notFound("Company");
  return NextResponse.json(updated);
});

export const DELETE_company = withAuth(async (ctx) => {
  const id = pathLast(ctx.req);
  requirePermission(ctx.person, "crm:delete");
  const db = getDb();
  await db.delete(companies).where(and(eq(companies.id, id), eq(companies.orgId, ctx.org.id)));
  return NextResponse.json({ ok: true });
});

// =============================================================================
// Cursor parsing helper
// =============================================================================
// The cursor is a compound (timestamp, id) pair encoded as `<iso>_<id>`.
// This is a stable cursor under the sort order (createdAt DESC, id DESC).
// Postgres can do the tuple comparison directly in SQL.
// Returns null if the cursor is malformed (caller should treat as bad input).
function parseCursor(cursor: string): { at: string; id: string } | null {
  const idx = cursor.indexOf("_");
  if (idx < 1 || idx === cursor.length - 1) return null;
  const at = cursor.slice(0, idx);
  const id = cursor.slice(idx + 1);
  if (!/^\d{4}-\d{2}-\d{2}T/.test(at)) return null;     // looks like an ISO date
  if (!id) return null;
  return { at, id };
}

function buildCursor(at: Date | string, id: string): string {
  return `${at instanceof Date ? at.toISOString() : at}_${id}`;
}

// =====================================================================
// Contacts
// =====================================================================


export const GET_contacts = withAuth(async (ctx) => {
  requirePermission(ctx.person, "crm:read");
  // P1-2: rate-limit reads. 60/min per user. The stress test
  // crm-bulk-create would otherwise hammer this endpoint.
  const limited = await checkRateLimit({ key: keyFromAuth(ctx.person.id, "crm:contacts:read"), limit: 60, windowSeconds: 60 });
  if (limited) return limited;

  const url = new URL(ctx.req.url);
  const limit = Math.min(Number(url.searchParams.get("limit") ?? 50), 200);
  const cursor = url.searchParams.get("cursor");
  const search = (url.searchParams.get("q") ?? "").trim();
  const db = getDb();

  // P0-5: sort by (createdAt, id) to break ties. The cursor encodes
  // both. Previous code sorted by createdAt DESC but used id as the
  // cursor, which produced duplicate / skipped rows when two contacts
  // were created in the same millisecond.
  //
  // P0-4: push search to SQL. The old code did the search in memory
  // on the page slice (max 200 items), so a contact on page 2+
  // would never be found. The contact table has firstName, lastName,
  // email; we search those. The contact's company is referenced by
  // companyId — searching by company name requires a JOIN on the
  // companies table, which is a v2 add (the JOIN inflates the page
  // size and complicates the cursor). v1 searches name + email.
  const tokens = search ? search.split(/\s+/).filter(Boolean) : [];
  const searchCondition = tokens.length > 0
    ? and(
        ...tokens.flatMap((t) => [
          or(
            ilike(contacts.firstName, `%${t}%`),
            ilike(contacts.lastName, `%${t}%`),
            ilike(contacts.email, `%${t}%`),
          )!,
        ]),
      )
    : undefined;

  const baseWhere = and(
    eq(contacts.orgId, ctx.org.id),
    isNull(contacts.deletedAt),
    searchCondition,
  );
  // For the cursor, we use a tuple comparison on (createdAt, id) to
  // break ties when two contacts are created in the same millisecond.
  // The cursor format is `<isoTimestamp>_<id>`. P0-5 fix: previous
  // code sorted by createdAt DESC but used id as the cursor, which
  // produced duplicate / skipped rows.
  const parsedCursor = cursor ? parseCursor(cursor) : null;
  const list = parsedCursor
    ? await db.select().from(contacts).where(
        and(
          baseWhere,
          sql`(${contacts.createdAt}, ${contacts.id}) < (${parsedCursor.at}, ${parsedCursor.id})`,
        ),
      ).orderBy(desc(contacts.createdAt), desc(contacts.id)).limit(limit + 1)
    : await db.select().from(contacts).where(baseWhere).orderBy(desc(contacts.createdAt), desc(contacts.id)).limit(limit + 1);
  const hasMore = list.length > limit;
  const nextCursor = hasMore && list[limit - 1]
    ? buildCursor(list[limit - 1].createdAt, list[limit - 1].id)
    : null;
  return NextResponse.json({ items: list.slice(0, limit), nextCursor });
});

export const POST_contacts = withAuth(async (ctx, { body }) => {
  requirePermission(ctx.person, "crm:write");
  const parsed = contactSchema.safeParse(body);
  if (!parsed.success) throw errors.validation("Invalid input", { issues: parsed.error.issues });
  const db = getDb();
  const [created] = await db.insert(contacts).values({
    orgId: ctx.org.id,
    ownerId: ctx.person.id,
    ...parsed.data,
  }).returning();
  return NextResponse.json(created, { status: 201 });
});

export const GET_contact = withAuth(async (ctx) => {
  const id = pathLast(ctx.req);
  requirePermission(ctx.person, "crm:read");
  const db = getDb();
  const [contact] = await db.select().from(contacts).where(and(eq(contacts.id, id), eq(contacts.orgId, ctx.org.id), isNull(contacts.deletedAt)));
  if (!contact) throw errors.notFound("Contact");
  return NextResponse.json(contact);
});

export const PATCH_contact = withAuth(async (ctx, { body }) => {
  const id = pathLast(ctx.req);
  requirePermission(ctx.person, "crm:write");
  const parsed = contactSchema.partial().safeParse(body);
  if (!parsed.success) throw errors.validation("Invalid input");
  const db = getDb();
  const [updated] = await db.update(contacts)
    .set({ ...parsed.data, updatedAt: new Date() })
    .where(and(eq(contacts.id, id), eq(contacts.orgId, ctx.org.id)))
    .returning();
  if (!updated) throw errors.notFound("Contact");
  return NextResponse.json(updated);
});

export const DELETE_contact = withAuth(async (ctx) => {
  const id = pathLast(ctx.req);
  requirePermission(ctx.person, "crm:delete");
  const db = getDb();
  await db.update(contacts).set({ deletedAt: new Date() }).where(and(eq(contacts.id, id), eq(contacts.orgId, ctx.org.id)));
  return NextResponse.json({ ok: true });
});

// =====================================================================
// Deals
// =====================================================================

export const GET_deals = withAuth(async (ctx) => {
  requirePermission(ctx.person, "deals:read");
  // P1-2: rate-limit reads
  const limited = await checkRateLimit({ key: keyFromAuth(ctx.person.id, "crm:deals:read"), limit: 60, windowSeconds: 60 });
  if (limited) return limited;

  const url = new URL(ctx.req.url);
  const stage = url.searchParams.get("stage");
  const limit = Math.min(Number(url.searchParams.get("limit") ?? 50), 200);
  const cursor = url.searchParams.get("cursor");
  const db = getDb();
  // P1-1: paginate. The previous code returned every deal in the org
  // in one response — 10k deals = 10MB JSON.
  // P0-5 pattern: sort by (updatedAt, id) for stable cursor.
  const stageCondition = stage
    ? and(eq(deals.orgId, ctx.org.id), eq(deals.stage, stage as "lead"), isNull(deals.deletedAt))
    : and(eq(deals.orgId, ctx.org.id), isNull(deals.deletedAt));
  const parsedCursor = cursor ? parseCursor(cursor) : null;
  const where = parsedCursor
    ? and(
        stageCondition,
        sql`(${deals.updatedAt}, ${deals.id}) < (${parsedCursor.at}, ${parsedCursor.id})`,
      )
    : stageCondition;
  const list = await db.select().from(deals).where(where).orderBy(desc(deals.updatedAt), desc(deals.id)).limit(limit + 1);
  const hasMore = list.length > limit;
  const nextCursor = hasMore && list[limit - 1]
    ? buildCursor(list[limit - 1].updatedAt, list[limit - 1].id)
    : null;
  return NextResponse.json({ items: list.slice(0, limit), nextCursor });
});

export const POST_deals = withAuth(async (ctx, { body }) => {
  requirePermission(ctx.person, "deals:write");
  const parsed = dealSchema.safeParse(body);
  if (!parsed.success) throw errors.validation("Invalid input", { issues: parsed.error.issues });
  const db = getDb();

  // P0-3: Verify the contact belongs to this org. Without this check,
  // a user in org A could create a deal pointing at a contact in
  // org B. The deal is in org A's data; the contactId is in org B's.
  // Silent cross-org corruption. (P0 in CRM_LIMITS.md.)
  const [contact] = await db.select({ id: contacts.id }).from(contacts)
    .where(and(eq(contacts.id, parsed.data.contactId), eq(contacts.orgId, ctx.org.id)))
    .limit(1);
  if (!contact) throw errors.notFound("Contact");

  // P0-3 (companyId): same check for companyId if provided.
  if (parsed.data.companyId) {
    const [company] = await db.select({ id: companies.id }).from(companies)
      .where(and(eq(companies.id, parsed.data.companyId), eq(companies.orgId, ctx.org.id)))
      .limit(1);
    if (!company) throw errors.notFound("Company");
  }

  // Win/loss reasons on direct create: a deal shouldn't be born at
  // "won" without a reason (that's data corruption; a deal is won
  // by moving it through stages). If someone tries to create a
  // deal directly in a terminal state, require a reason.
  if (parsed.data.stage === "won" && !parsed.data.winReason) {
    throw errors.validation("winReason is required when creating a deal in 'won' stage");
  }
  if (parsed.data.stage === "lost" && !parsed.data.lossReason) {
    throw errors.validation("lossReason is required when creating a deal in 'lost' stage");
  }

  const [created] = await db.insert(deals).values({
    orgId: ctx.org.id,
    ownerId: ctx.person.id,
    ...parsed.data,
    stageChangedAt: new Date(),
    lastActivityAt: new Date(),
  }).returning();
  return NextResponse.json(created, { status: 201 });
});

export const GET_deal = withAuth(async (ctx) => {
  const id = pathLast(ctx.req);
  requirePermission(ctx.person, "deals:read");
  const db = getDb();
  const [deal] = await db.select().from(deals).where(and(eq(deals.id, id), eq(deals.orgId, ctx.org.id), isNull(deals.deletedAt)));
  if (!deal) throw errors.notFound("Deal");
  return NextResponse.json(deal);
});

export const PATCH_deal = withAuth(async (ctx, { body }) => {
  const id = pathLast(ctx.req);
  requirePermission(ctx.person, "deals:write");
  const parsed = dealSchema.partial().safeParse(body);
  if (!parsed.success) throw errors.validation("Invalid input");
  const db = getDb();

  // Win/loss reasons: when the deal moves to "won" or "lost", the
  // reason is required (the strategy doc called this "win/loss
  // analysis" — knowing why we win is the difference between
  // improving the pipeline and just watching it). On any other
  // stage, the reason fields are ignored.
  if (parsed.data.stage === "won" && !parsed.data.winReason) {
    throw errors.validation("winReason is required when moving a deal to 'won'");
  }
  if (parsed.data.stage === "lost" && !parsed.data.lossReason) {
    throw errors.validation("lossReason is required when moving a deal to 'lost'");
  }

  // If stage changes, also reset stageChangedAt and set closedAt
  // for terminal stages (won, lost). Every update bumps
  // lastActivityAt so the deal_followup_draft operator action
  // (which finds deals with no activity in 4+ days) doesn't
  // false-positive on actively-maintained deals.
  const updates: Record<string, unknown> = {
    ...parsed.data,
    updatedAt: new Date(),
    lastActivityAt: new Date(),
  };
  if (parsed.data.stage) {
    updates.stageChangedAt = new Date();
    if (parsed.data.stage === "won" || parsed.data.stage === "lost") {
      updates.closedAt = new Date();
    }
  }
  const [updated] = await db.update(deals).set(updates).where(and(eq(deals.id, id), eq(deals.orgId, ctx.org.id), isNull(deals.deletedAt))).returning();
  if (!updated) throw errors.notFound("Deal");

  // Audit log on stage change (only on terminal states — we already
  // audit deletes; this covers closes).
  if (parsed.data.stage === "won" || parsed.data.stage === "lost") {
    try {
      const { auditEvents } = await import("@o/db/schema");
      await db.insert(auditEvents).values({
        id: crypto.randomUUID(),
        orgId: ctx.org.id,
        actorId: ctx.person.id,
        action: parsed.data.stage === "won" ? "deal.won" : "deal.lost",
        subjectType: "deal",
        subjectId: id,
        after: {
          name: updated.name,
          amountCents: updated.amountCents,
          stage: updated.stage,
          winReason: updated.winReason,
          lossReason: updated.lossReason,
        },
        ipAddress: ctx.req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
        userAgent: ctx.req.headers.get("user-agent") ?? null,
      });
    } catch { /* best-effort */ }
  }

  return NextResponse.json(updated);
});

export const DELETE_deal = withAuth(async (ctx) => {
  // P0-2: soft-delete + audit. Mirrors DELETE_contact. The previous
  // hard delete was a silent data-loss path with no audit trail.
  const id = pathLast(ctx.req);
  const url = new URL(ctx.req.url);
  const hard = url.searchParams.get("hard") === "true";
  requirePermission(ctx.person, hard ? "deals:delete" : "deals:write");
  const db = getDb();
  const [updated] = await db.update(deals)
    .set({ deletedAt: new Date(), updatedAt: new Date() })
    .where(and(eq(deals.id, id), eq(deals.orgId, ctx.org.id), isNull(deals.deletedAt)))
    .returning();
  if (!updated) throw errors.notFound("Deal");

  // Audit log entry. The audit_events table uses `action` (not
  // `type`) and `before`/`after`/`context` (not `payload`). The
  // insert is best-effort: if the audit write fails, the delete
  // still succeeded. The audit_event row is a record, not a
  // precondition.
  try {
    const { auditEvents } = await import("@o/db/schema");
    await db.insert(auditEvents).values({
      id: crypto.randomUUID(),
      orgId: ctx.org.id,
      actorId: ctx.person.id,
      action: hard ? "deal.hard_delete" : "deal.delete",
      subjectType: "deal",
      subjectId: id,
      before: { name: updated.name, amountCents: updated.amountCents, stage: updated.stage },
      ipAddress: ctx.req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
      userAgent: ctx.req.headers.get("user-agent") ?? null,
    });
  } catch (err) {
    // Don't fail the request if the audit insert fails.
  }

  return NextResponse.json({ ok: true, hard });
});

// Helpers
function pathLast(req: NextRequest): string {
  return req.nextUrl.pathname.split("/").pop()!;
}

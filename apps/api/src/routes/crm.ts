// =============================================================================
// o.company · CRM routes — contacts, companies, deals
// =============================================================================
// The full CRUD for the contact + company + deal surfaces. Same shape as
// the web app's internal store, exposed as REST. List endpoints support
// cursor-based pagination via ?cursor=<id>&limit=<n>.

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { eq, and, lt, desc, asc, isNull } from "drizzle-orm";
import { getDb } from "@o/db/client";
import { contacts, companies, deals, type Contact, type Company, type Deal } from "@o/db/schema";
import { errors } from "@o/errors";
import { withAuth } from "@/middleware/with-auth";
import { requirePermission } from "@o/auth/rbac";

// =====================================================================
// Companies
// =====================================================================

const companySchema = z.object({
  name: z.string().min(1),
  domain: z.string().optional(),
  industry: z.string().optional(),
  size: z.string().optional(),
  logo: z.string().url().optional(),
  address: z.string().optional(),
});

export const GET_companies = withAuth(async (ctx) => {
  requirePermission(ctx.person, "contacts:read");
  const url = new URL(ctx.req.url);
  const limit = Math.min(Number(url.searchParams.get("limit") ?? 50), 200);
  const cursor = url.searchParams.get("cursor");
  const db = getDb();
  const where = cursor
    ? and(eq(companies.orgId, ctx.org.id), isNull(companies.logo as never), lt(companies.id, cursor))
    : eq(companies.orgId, ctx.org.id);
  const list = await db.select().from(companies).where(where).orderBy(desc(companies.createdAt)).limit(limit + 1);
  const hasMore = list.length > limit;
  return NextResponse.json({ items: list.slice(0, limit), nextCursor: hasMore ? list[limit - 1].id : null });
});

export const POST_companies = withAuth(async (ctx, { body }) => {
  requirePermission(ctx.person, "contacts:write");
  const parsed = companySchema.safeParse(body);
  if (!parsed.success) throw errors.validation("Invalid input", { issues: parsed.error.issues });
  const db = getDb();
  const [created] = await db.insert(companies).values({ orgId: ctx.org.id, ...parsed.data }).returning();
  return NextResponse.json(created, { status: 201 });
});

export const GET_company = withAuth(async (ctx) => {
  const id = pathLast(ctx.req);
  requirePermission(ctx.person, "contacts:read");
  const db = getDb();
  const [company] = await db.select().from(companies).where(and(eq(companies.id, id), eq(companies.orgId, ctx.org.id)));
  if (!company) throw errors.notFound("Company");
  return NextResponse.json(company);
});

export const PATCH_company = withAuth(async (ctx, { body }) => {
  const id = pathLast(ctx.req);
  requirePermission(ctx.person, "contacts:write");
  const parsed = companySchema.partial().safeParse(body);
  if (!parsed.success) throw errors.validation("Invalid input");
  const db = getDb();
  const [updated] = await db.update(companies).set(parsed.data).where(and(eq(companies.id, id), eq(companies.orgId, ctx.org.id))).returning();
  if (!updated) throw errors.notFound("Company");
  return NextResponse.json(updated);
});

export const DELETE_company = withAuth(async (ctx) => {
  const id = pathLast(ctx.req);
  requirePermission(ctx.person, "contacts:delete");
  const db = getDb();
  await db.delete(companies).where(and(eq(companies.id, id), eq(companies.orgId, ctx.org.id)));
  return NextResponse.json({ ok: true });
});

// =====================================================================
// Contacts
// =====================================================================

const contactSchema = z.object({
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  email: z.string().email().optional().or(z.literal("")),
  phone: z.string().optional(),
  companyId: z.string().uuid().optional(),
  title: z.string().optional(),
  status: z.enum(["lead", "active", "customer", "churned", "archived"]).default("lead"),
  lifecycle: z.enum(["subscriber", "lead", "mql", "sql", "opportunity", "customer", "evangelist"]).default("lead"),
  source: z.string().optional(),
  tags: z.array(z.string()).default([]),
  customFields: z.record(z.unknown()).default({}),
  wallet: z.string().regex(/^0x[a-fA-F0-9]{40}$/).optional(),
  ensName: z.string().optional(),
  trustScore: z.number().int().min(0).max(100).optional(),
  lastContactedAt: z.string().optional(),
  avatar: z.string().url().optional(),
});

export const GET_contacts = withAuth(async (ctx) => {
  requirePermission(ctx.person, "contacts:read");
  const url = new URL(ctx.req.url);
  const limit = Math.min(Number(url.searchParams.get("limit") ?? 50), 200);
  const cursor = url.searchParams.get("cursor");
  const search = url.searchParams.get("q") ?? "";
  const db = getDb();
  const where = cursor
    ? and(eq(contacts.orgId, ctx.org.id), isNull(contacts.deletedAt), lt(contacts.id, cursor))
    : and(eq(contacts.orgId, ctx.org.id), isNull(contacts.deletedAt));
  const list = await db.select().from(contacts).where(where).orderBy(desc(contacts.createdAt)).limit(limit + 1);
  const filtered = search
    ? list.filter(c => `${c.firstName} ${c.lastName} ${c.email ?? ""}`.toLowerCase().includes(search.toLowerCase()))
    : list;
  const hasMore = list.length > limit;
  return NextResponse.json({ items: filtered.slice(0, limit), nextCursor: hasMore ? list[limit - 1].id : null });
});

export const POST_contacts = withAuth(async (ctx, { body }) => {
  requirePermission(ctx.person, "contacts:write");
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
  requirePermission(ctx.person, "contacts:read");
  const db = getDb();
  const [contact] = await db.select().from(contacts).where(and(eq(contacts.id, id), eq(contacts.orgId, ctx.org.id), isNull(contacts.deletedAt)));
  if (!contact) throw errors.notFound("Contact");
  return NextResponse.json(contact);
});

export const PATCH_contact = withAuth(async (ctx, { body }) => {
  const id = pathLast(ctx.req);
  requirePermission(ctx.person, "contacts:write");
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
  requirePermission(ctx.person, "contacts:delete");
  const db = getDb();
  await db.update(contacts).set({ deletedAt: new Date() }).where(and(eq(contacts.id, id), eq(contacts.orgId, ctx.org.id)));
  return NextResponse.json({ ok: true });
});

// =====================================================================
// Deals
// =====================================================================

const dealSchema = z.object({
  name: z.string().min(1),
  contactId: z.string().uuid(),
  companyId: z.string().uuid().optional(),
  amountCents: z.number().int().nonnegative(),
  currency: z.string().default("USD"),
  stage: z.enum(["lead", "qualified", "proposal", "negotiation", "won", "lost"]).default("lead"),
  probability: z.number().min(0).max(1).default(0.1),
  expectedCloseDate: z.string(), // ISO date
  description: z.string().optional(),
});

export const GET_deals = withAuth(async (ctx) => {
  requirePermission(ctx.person, "deals:read");
  const url = new URL(ctx.req.url);
  const stage = url.searchParams.get("stage");
  const db = getDb();
  const where = stage
    ? and(eq(deals.orgId, ctx.org.id), eq(deals.stage, stage as "lead"))
    : eq(deals.orgId, ctx.org.id);
  const list = await db.select().from(deals).where(where).orderBy(desc(deals.updatedAt));
  return NextResponse.json({ items: list });
});

export const POST_deals = withAuth(async (ctx, { body }) => {
  requirePermission(ctx.person, "deals:write");
  const parsed = dealSchema.safeParse(body);
  if (!parsed.success) throw errors.validation("Invalid input", { issues: parsed.error.issues });
  const db = getDb();
  const [created] = await db.insert(deals).values({
    orgId: ctx.org.id,
    ownerId: ctx.person.id,
    ...parsed.data,
    stageChangedAt: new Date(),
  }).returning();
  return NextResponse.json(created, { status: 201 });
});

export const GET_deal = withAuth(async (ctx) => {
  const id = pathLast(ctx.req);
  requirePermission(ctx.person, "deals:read");
  const db = getDb();
  const [deal] = await db.select().from(deals).where(and(eq(deals.id, id), eq(deals.orgId, ctx.org.id)));
  if (!deal) throw errors.notFound("Deal");
  return NextResponse.json(deal);
});

export const PATCH_deal = withAuth(async (ctx, { body }) => {
  const id = pathLast(ctx.req);
  requirePermission(ctx.person, "deals:write");
  const parsed = dealSchema.partial().safeParse(body);
  if (!parsed.success) throw errors.validation("Invalid input");
  // If stage changes, also reset stageChangedAt
  const db = getDb();
  const updates: Record<string, unknown> = { ...parsed.data, updatedAt: new Date() };
  if (parsed.data.stage) updates.stageChangedAt = new Date();
  const [updated] = await db.update(deals).set(updates).where(and(eq(deals.id, id), eq(deals.orgId, ctx.org.id))).returning();
  if (!updated) throw errors.notFound("Deal");
  return NextResponse.json(updated);
});

export const DELETE_deal = withAuth(async (ctx) => {
  const id = pathLast(ctx.req);
  requirePermission(ctx.person, "deals:delete");
  const db = getDb();
  await db.delete(deals).where(and(eq(deals.id, id), eq(deals.orgId, ctx.org.id)));
  return NextResponse.json({ ok: true });
});

// Helpers
function pathLast(req: NextRequest): string {
  return req.nextUrl.pathname.split("/").pop()!;
}

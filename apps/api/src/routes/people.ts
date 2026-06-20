// =============================================================================
// o.company · people + orgs routes
// =============================================================================
// GET  /api/org                      — current org
// PATCH /api/org                     — update org (admin+)
// POST /api/org/transfer-ownership   — transfer to another person (owner only)
// GET  /api/people                   — list people in org
// POST /api/people/invite             — invite a new person (manager+)
// POST /api/people/invite/:id/accept — accept an invite
// GET  /api/people/:id               — get a person
// PATCH /api/people/:id              — update (admin+ or self)
// POST /api/people/:id/role          — change role (owner only)
// DELETE /api/people/:id             — deactivate (admin+)

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { eq, and, ne, desc } from "drizzle-orm";
import { getDb } from "@o/db/client";
import { people, orgs, invitations } from "@o/db/schema";
import { errors } from "@o/errors";
import { withAuth } from "@/middleware/with-auth";
import { requirePermission, can } from "@o/auth/rbac";
import { generateRefreshToken } from "@o/auth/session";
import { sendEmail } from "@o/email";
import { InviteTemplate, WelcomeTemplate } from "@o/email/templates";
import { logger } from "@o/logger";
import { enqueue } from "@o/jobs";
import { createHash } from "crypto";

// ---- GET /api/org ----
export const GET_org = withAuth(async (ctx) => {
  return NextResponse.json(ctx.org);
});

// ---- PATCH /api/org ----
const patchOrgSchema = z.object({
  name: z.string().min(1).optional(),
  legalName: z.string().min(1).optional(),
  taxId: z.string().optional(),
  taxJurisdiction: z.string().optional(),
  baseCurrency: z.string().optional(),
  timezone: z.string().optional(),
  contactEmail: z.string().email().optional(),
  supportEmail: z.string().email().optional(),
  billingEmail: z.string().email().optional(),
  logo: z.string().url().optional(),
  website: z.string().url().optional(),
});
export const PATCH_org = withAuth(async (ctx, { body }) => {
  requirePermission(ctx.person, "org:write");
  const parsed = patchOrgSchema.safeParse(body);
  if (!parsed.success) throw errors.validation("Invalid input");
  const db = getDb();
  const [updated] = await db.update(orgs).set(parsed.data).where(eq(orgs.id, ctx.org.id)).returning();
  return NextResponse.json(updated);
});

// ---- POST /api/org/transfer-ownership ----
const transferSchema = z.object({ toPersonId: z.string().uuid() });
export const POST_transfer_ownership = withAuth(async (ctx, { body }) => {
  requirePermission(ctx.person, "org:transfer_ownership");
  const parsed = transferSchema.safeParse(body);
  if (!parsed.success) throw errors.validation("Invalid input");
  if (parsed.data.toPersonId === ctx.person.id) throw errors.validation("Cannot transfer to yourself");
  const db = getDb();
  const [target] = await db.select().from(people).where(and(eq(people.id, parsed.data.toPersonId), eq(people.orgId, ctx.org.id)));
  if (!target) throw errors.notFound("Target person");
  await db.transaction(async (tx) => {
    await tx.update(people).set({ role: "admin" }).where(eq(people.id, ctx.person.id));
    await tx.update(people).set({ role: "owner" }).where(eq(people.id, target.id));
  });
  logger.info("org.ownership_transferred", { from: ctx.person.id, to: target.id, orgId: ctx.org.id });
  return NextResponse.json({ ok: true });
});

// ---- GET /api/people ----
export const GET_people = withAuth(async (ctx) => {
  requirePermission(ctx.person, "people:read");
  const db = getDb();
  const list = await db.select({
    id: people.id,
    firstName: people.firstName,
    lastName: people.lastName,
    email: people.email,
    role: people.role,
    department: people.department,
    title: people.title,
    status: people.status,
    lastSeenAt: people.lastSeenAt,
  })
  .from(people)
  .where(and(eq(people.orgId, ctx.org.id), ne(people.status, "deactivated")))
  .orderBy(desc(people.createdAt));
  return NextResponse.json({ items: list });
});

// ---- POST /api/people/invite ----
const inviteSchema = z.object({
  email: z.string().email(),
  role: z.enum(["admin", "manager", "operator", "client", "guest"]),
  department: z.enum(["engineering", "operations", "sales", "creative", "finance", "people"]).optional(),
  title: z.string().optional(),
});
export const POST_invite = withAuth(async (ctx, { body }) => {
  requirePermission(ctx.person, "people:invite");
  const parsed = inviteSchema.safeParse(body);
  if (!parsed.success) throw errors.validation("Invalid input");
  const { email, role, department, title } = parsed.data;
  const db = getDb();
  // Reject duplicate
  const existing = await db.select().from(people).where(and(eq(people.orgId, ctx.org.id), eq(people.email, email)));
  if (existing.length > 0) throw errors.conflict("Email already in org");
  // Issue a fresh token
  const { token } = generateRefreshToken();
  const tokenHash = createHash("sha256").update(token).digest("hex");
  const expiresAt = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000); // 14 days
  const [inv] = await db.insert(invitations).values({
    orgId: ctx.org.id,
    email,
    role,
    invitedBy: ctx.person.id,
    tokenHash,
    expiresAt,
  }).returning();
  const url = `${process.env.NEXT_PUBLIC_APP_URL}/auth/accept?token=${token}`;
  await sendEmail({
    to: email,
    template: "invite",
    props: {
      orgName: ctx.org.name,
      inviterName: `${ctx.person.firstName} ${ctx.person.lastName}`,
      inviteUrl: url,
      expiresInDays: 14,
      role,
    },
  });
  logger.info("people.invited", { inviteId: inv.id, email, role, by: ctx.person.id });
  return NextResponse.json({ id: inv.id, email, role, expiresAt }, { status: 201 });
});

// ---- GET /api/people/:id ----
export const GET_person = withAuth(async (ctx) => {
  const id = (await ctx.req.url.pathname.split("/").pop())!;
  requirePermission(ctx.person, "people:read");
  const db = getDb();
  const [person] = await db.select().from(people).where(and(eq(people.id, id), eq(people.orgId, ctx.org.id)));
  if (!person) throw errors.notFound("Person");
  return NextResponse.json(person);
});

// ---- PATCH /api/people/:id ----
const patchPersonSchema = z.object({
  firstName: z.string().min(1).optional(),
  lastName: z.string().min(1).optional(),
  title: z.string().optional(),
  department: z.enum(["engineering", "operations", "sales", "creative", "finance", "people"]).optional(),
  phone: z.string().optional(),
  locale: z.string().optional(),
  timezone: z.string().optional(),
  baseSalaryCents: z.number().int().optional(),
  extraPermissions: z.array(z.string()).optional(),
});
export const PATCH_person = withAuth(async (ctx, { body }) => {
  const id = (await ctx.req.url.pathname.split("/").pop())!;
  const parsed = patchPersonSchema.safeParse(body);
  if (!parsed.success) throw errors.validation("Invalid input");
  // Self-edit is allowed for non-sensitive fields; admin+ for sensitive
  if (ctx.person.id !== id) requirePermission(ctx.person, "people:write");
  if (parsed.data.baseSalaryCents !== undefined && ctx.person.id !== id) requirePermission(ctx.person, "people:assign_role");
  const db = getDb();
  const [updated] = await db.update(people).set(parsed.data).where(and(eq(people.id, id), eq(people.orgId, ctx.org.id))).returning();
  if (!updated) throw errors.notFound("Person");
  return NextResponse.json(updated);
});

// ---- POST /api/people/:id/role ----
const roleSchema = z.object({ role: z.enum(["owner", "admin", "manager", "operator", "client", "guest"]) });
export const POST_role = withAuth(async (ctx, { body }) => {
  const id = (await ctx.req.url.pathname.split("/").slice(-2, -1)[0])!;
  requirePermission(ctx.person, "people:assign_role");
  const parsed = roleSchema.safeParse(body);
  if (!parsed.success) throw errors.validation("Invalid input");
  if (parsed.data.role === "owner") throw errors.validation("Use the ownership transfer endpoint");
  const db = getDb();
  const [updated] = await db.update(people).set({ role: parsed.data.role }).where(and(eq(people.id, id), eq(people.orgId, ctx.org.id))).returning();
  if (!updated) throw errors.notFound("Person");
  return NextResponse.json(updated);
});

// ---- DELETE /api/people/:id ----
export const DELETE_person = withAuth(async (ctx) => {
  const id = (await ctx.req.url.pathname.split("/").pop())!;
  requirePermission(ctx.person, "people:terminate");
  if (ctx.person.id === id) throw errors.validation("Cannot deactivate yourself");
  const db = getDb();
  await db.update(people).set({ status: "deactivated" }).where(and(eq(people.id, id), eq(people.orgId, ctx.org.id)));
  // Revoke sessions
  await db.execute(`DELETE FROM sessions WHERE person_id = '${id.replace(/'/g, "")}'`);
  return NextResponse.json({ ok: true });
});

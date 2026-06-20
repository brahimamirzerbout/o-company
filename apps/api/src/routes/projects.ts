// =============================================================================
// o.company · projects + time-tracking routes
// =============================================================================
// Projects are the operator's primary unit of work. Each project belongs
// to a client (contact), has milestones, an optional contract value, and
// a billing schedule. Time entries are hours logged against milestones
// and feed into invoices on completion.

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { eq, and, desc, gte, lte } from "drizzle-orm";
import { getDb } from "@o/db/client";
import { projects, milestones, timeEntries, projectTeam } from "@o/db/schema";
import { errors } from "@o/errors";
import { withAuth } from "@/middleware/with-auth";
import { requirePermission } from "@o/auth/rbac";

// ---- GET /api/projects ----
export const GET_projects = withAuth(async (ctx) => {
  requirePermission(ctx.person, "projects:read");
  const url = new URL(ctx.req.url);
  const status = url.searchParams.get("status");
  const clientId = url.searchParams.get("clientId");
  const db = getDb();
  const conditions = [eq(projects.orgId, ctx.org.id)];
  if (status) conditions.push(eq(projects.status, status as "active"));
  if (clientId) conditions.push(eq(projects.clientId, clientId));
  const list = await db.select().from(projects).where(and(...conditions)).orderBy(desc(projects.createdAt));
  return NextResponse.json({ items: list });
});

// ---- POST /api/projects ----
const projectSchema = z.object({
  clientId: z.string().uuid(),
  name: z.string().min(1),
  description: z.string().optional(),
  service: z.enum(["website", "lead_form", "automation", "crm_setup", "photo_pipeline", "creative", "custom"]),
  contractValueCents: z.number().int().nonnegative(),
  currency: z.string().default("USD"),
  billing: z.enum(["fixed", "hourly", "retainer", "milestone"]).default("fixed"),
  hourlyRateCents: z.number().int().optional(),
  retainerHoursPerMonth: z.number().int().optional(),
  startDate: z.string(),
  dueDate: z.string().optional(),
  teamIds: z.array(z.string().uuid()).default([]),
  tags: z.array(z.string()).default([]),
  milestones: z.array(z.object({
    name: z.string(),
    description: z.string().optional(),
    dueDate: z.string(),
    position: z.number().int().default(0),
  })).default([]),
});

export const POST_projects = withAuth(async (ctx, { body }) => {
  requirePermission(ctx.person, "projects:write");
  const parsed = projectSchema.safeParse(body);
  if (!parsed.success) throw errors.validation("Invalid input", { issues: parsed.error.issues });
  const { teamIds, milestones: ms, ...rest } = parsed.data;
  const db = getDb();
  const [project] = await db.insert(projects).values({
    orgId: ctx.org.id,
    ownerId: ctx.person.id,
    ...rest,
  }).returning();
  if (teamIds.length > 0) {
    await db.insert(projectTeam).values(teamIds.map((personId) => ({ projectId: project.id, personId })));
  }
  if (ms.length > 0) {
    await db.insert(milestones).values(ms.map((m) => ({ ...m, projectId: project.id })));
  }
  return NextResponse.json(project, { status: 201 });
});

// ---- GET /api/projects/:id ----
export const GET_project = withAuth(async (ctx) => {
  const id = pathLast(ctx.req);
  requirePermission(ctx.person, "projects:read");
  const db = getDb();
  const [project] = await db.select().from(projects).where(and(eq(projects.id, id), eq(projects.orgId, ctx.org.id)));
  if (!project) throw errors.notFound("Project");
  const ms = await db.select().from(milestones).where(eq(milestones.projectId, id));
  const team = await db.select().from(projectTeam).where(eq(projectTeam.projectId, id));
  return NextResponse.json({ ...project, milestones: ms, team });
});

// ---- PATCH /api/projects/:id ----
const patchSchema = projectSchema.partial();
export const PATCH_project = withAuth(async (ctx, { body }) => {
  const id = pathLast(ctx.req);
  requirePermission(ctx.person, "projects:write");
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) throw errors.validation("Invalid input");
  const { teamIds, milestones: _ms, ...rest } = parsed.data;
  const db = getDb();
  const [updated] = await db.update(projects).set(rest).where(and(eq(projects.id, id), eq(projects.orgId, ctx.org.id))).returning();
  if (!updated) throw errors.notFound("Project");
  if (teamIds) {
    await db.delete(projectTeam).where(eq(projectTeam.projectId, id));
    if (teamIds.length > 0) await db.insert(projectTeam).values(teamIds.map((pid) => ({ projectId: id, personId: pid })));
  }
  return NextResponse.json(updated);
});

// ---- DELETE /api/projects/:id ----
export const DELETE_project = withAuth(async (ctx) => {
  const id = pathLast(ctx.req);
  requirePermission(ctx.person, "projects:delete");
  const db = getDb();
  await db.delete(projects).where(and(eq(projects.id, id), eq(projects.orgId, ctx.org.id)));
  return NextResponse.json({ ok: true });
});

// ---- POST /api/projects/:id/milestones ----
const milestoneSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  dueDate: z.string(),
  position: z.number().int().default(0),
});
export const POST_milestone = withAuth(async (ctx, { body }) => {
  const projectId = pathAt(ctx.req, -2);
  requirePermission(ctx.person, "projects:write");
  const parsed = milestoneSchema.safeParse(body);
  if (!parsed.success) throw errors.validation("Invalid input");
  const db = getDb();
  const [m] = await db.insert(milestones).values({ ...parsed.data, projectId }).returning();
  return NextResponse.json(m, { status: 201 });
});

// ---- PATCH /api/milestones/:id ----
export const PATCH_milestone = withAuth(async (ctx, { body }) => {
  const id = pathLast(ctx.req);
  const parsed = z.object({
    name: z.string().optional(),
    description: z.string().optional(),
    dueDate: z.string().optional(),
    status: z.enum(["pending", "in_progress", "review", "complete", "blocked"]).optional(),
    hoursLogged: z.number().optional(),
  }).safeParse(body);
  if (!parsed.success) throw errors.validation("Invalid input");
  const db = getDb();
  const updates: Record<string, unknown> = { ...parsed.data };
  if (parsed.data.status === "complete" && !parsed.data.hoursLogged) updates.completedAt = new Date();
  const [m] = await db.update(milestones).set(updates).where(eq(milestones.id, id)).returning();
  if (!m) throw errors.notFound("Milestone");
  return NextResponse.json(m);
});

// =====================================================================
// Time entries
// =====================================================================

const timeEntrySchema = z.object({
  projectId: z.string().uuid(),
  milestoneId: z.string().uuid().optional(),
  date: z.string(),
  hours: z.number().positive(),
  description: z.string().default(""),
  billable: z.boolean().default(true),
});

export const GET_time = withAuth(async (ctx) => {
  const url = new URL(ctx.req.url);
  const from = url.searchParams.get("from");
  const to = url.searchParams.get("to");
  const projectId = url.searchParams.get("projectId");
  const db = getDb();
  const conditions = [eq(timeEntries.orgId, ctx.org.id)];
  if (from) conditions.push(gte(timeEntries.date, from));
  if (to) conditions.push(lte(timeEntries.date, to));
  if (projectId) conditions.push(eq(timeEntries.projectId, projectId));
  const list = await db.select().from(timeEntries).where(and(...conditions)).orderBy(desc(timeEntries.date));
  return NextResponse.json({ items: list });
});

export const POST_time = withAuth(async (ctx, { body }) => {
  const parsed = timeEntrySchema.safeParse(body);
  if (!parsed.success) throw errors.validation("Invalid input");
  const db = getDb();
  const [entry] = await db.insert(timeEntries).values({
    orgId: ctx.org.id,
    personId: ctx.person.id,
    ...parsed.data,
  }).returning();
  return NextResponse.json(entry, { status: 201 });
});

export const DELETE_time = withAuth(async (ctx) => {
  const id = pathLast(ctx.req);
  const db = getDb();
  await db.delete(timeEntries).where(and(eq(timeEntries.id, id), eq(timeEntries.orgId, ctx.org.id)));
  return NextResponse.json({ ok: true });
});

// Helpers
function pathLast(req: NextRequest): string {
  return req.nextUrl.pathname.split("/").pop()!;
}
function pathAt(req: NextRequest, i: number): string {
  return req.nextUrl.pathname.split("/").filter(Boolean).at(i) ?? "";
}

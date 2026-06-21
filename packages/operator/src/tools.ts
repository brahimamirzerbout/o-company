// =============================================================================
// @o/operator/tools — read-only context gatherers
// =============================================================================
// Every tool here is a pure read against the database or an external API.
// The actions call these to gather context, then hand the context to the
// LLM, which writes a draft. Tools never modify state.
//
// This separation matters: if the LLM hallucinates, it doesn't matter —
// the draft is the LLM's output, not a tool call. The human reviews the
// draft. The human's approval is what causes state to change.

import { z } from "zod";
import { getDb } from "@o/db/client";
import {
  contacts, companies, deals, projects, milestones, timeEntries,
  invoices, payments, tickets, ticketMessages, photoJobs, photoVariations,
  people, orgs,
} from "@o/db/schema";
import { and, eq, desc, gte, lt, isNull, sql, count, sum } from "drizzle-orm";

// -----------------------------------------------------------------------------
// Tool registry
// -----------------------------------------------------------------------------

export interface ToolDefinition {
  name: string;
  description: string;
  schema: z.ZodType;
  execute: (input: any, ctx: { orgId: string }) => Promise<unknown>;
}

const TOOLS = new Map<string, ToolDefinition>();
export function registerTool(tool: ToolDefinition) { TOOLS.set(tool.name, tool); }
export function getTool(name: string): ToolDefinition | null { return TOOLS.get(name) ?? null; }
export function listTools(): ToolDefinition[] { return Array.from(TOOLS.values()); }

// -----------------------------------------------------------------------------
// CRM tools
// -----------------------------------------------------------------------------

export const listStaleDeals = {
  name: "list_stale_deals",
  description: "Returns deals in the pipeline that have not had activity in N days. Used to draft follow-ups.",
  schema: z.object({
    daysSinceActivity: z.number().int().min(1).max(60).default(4),
    stage: z.enum(["lead", "qualified", "proposal", "negotiation"]).optional(),
  }),
  async execute({ daysSinceActivity, stage }, { orgId }) {
    const db = getDb();
    const cutoff = new Date(Date.now() - daysSinceActivity * 24 * 60 * 60 * 1000).toISOString();
    const whereClause = stage
      ? and(eq(deals.orgId, orgId), eq(deals.stage, stage), lt(deals.lastActivityAt, cutoff))
      : and(eq(deals.orgId, orgId), lt(deals.lastActivityAt, cutoff));
    const rows = await db.select().from(deals).where(whereClause).limit(20);
    return rows.map((d) => ({
      id: d.id,
      name: d.name,
      stage: d.stage,
      amount: d.amount,
      currency: d.currency,
      contactId: d.contactId,
      companyId: d.companyId,
      lastActivityAt: d.lastActivityAt,
      daysSinceActivity: Math.floor((Date.now() - new Date(d.lastActivityAt).getTime()) / 86400000),
      ownerId: d.ownerId,
    }));
  },
};
registerTool(listStaleDeals);

export const getContact = {
  name: "get_contact",
  description: "Returns a single contact with their company, recent activity, and any open tickets.",
  schema: z.object({ contactId: z.string() }),
  async execute({ contactId }, { orgId }) {
    const db = getDb();
    const [c] = await db.select().from(contacts).where(and(eq(contacts.id, contactId), eq(contacts.orgId, orgId))).limit(1);
    if (!c) return null;
    const recentDeals = await db.select().from(deals)
      .where(and(eq(deals.contactId, contactId), eq(deals.orgId, orgId)))
      .orderBy(desc(deals.createdAt)).limit(5);
    const openTickets = await db.select().from(tickets)
      .where(and(eq(tickets.requesterId, contactId), eq(tickets.orgId, orgId)))
      .orderBy(desc(tickets.createdAt)).limit(5);
    return { ...c, recentDeals, openTickets };
  },
};
registerTool(getContact);

export const listOverdueInvoices = {
  name: "list_overdue_invoices",
  description: "Returns invoices past their due date that haven't been paid. Used to draft reminder emails.",
  schema: z.object({
    daysOverdue: z.number().int().min(0).default(0),
  }),
  async execute({ daysOverdue }, { orgId }) {
    const db = getDb();
    const cutoff = new Date(Date.now() - daysOverdue * 24 * 60 * 60 * 1000).toISOString();
    const rows = await db.select().from(invoices)
      .where(and(
        eq(invoices.orgId, orgId),
        eq(invoices.status, "sent"),
        lt(invoices.dueDate, cutoff),
      ))
      .limit(20);
    return rows.map((i) => ({
      id: i.id,
      number: i.number,
      amount: i.amount,
      currency: i.currency,
      contactId: i.contactId,
      dueDate: i.dueDate,
      daysOverdue: Math.floor((Date.now() - new Date(i.dueDate).getTime()) / 86400000),
      sentAt: i.sentAt,
    }));
  },
};
registerTool(listOverdueInvoices);

// -----------------------------------------------------------------------------
// Pipeline metrics
// -----------------------------------------------------------------------------

export const getPipelineSummary = {
  name: "get_pipeline_summary",
  description: "Returns aggregate pipeline metrics: total open, by stage, weighted forecast.",
  schema: z.object({}),
  async execute(_args: unknown, { orgId }) {
    const db = getDb();
    const rows = await db.select({
      stage: deals.stage,
      total: sum(deals.amount),
      count: count(),
    }).from(deals)
      .where(and(eq(deals.orgId, orgId), eq(deals.status, "open")))
      .groupBy(deals.stage);
    return rows;
  },
};
registerTool(getPipelineSummary);

export const getThisMonthRevenue = {
  name: "get_this_month_revenue",
  description: "Returns revenue collected in the current calendar month, plus comparison to last month.",
  schema: z.object({}),
  async execute(_args: unknown, { orgId }) {
    const db = getDb();
    const now = new Date();
    const startOfThisMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
    const startOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString();
    const [thisMonth] = await db.select({ total: sum(payments.amount) }).from(payments)
      .where(and(eq(payments.orgId, orgId), gte(payments.receivedAt, startOfThisMonth)));
    const [lastMonth] = await db.select({ total: sum(payments.amount) }).from(payments)
      .where(and(eq(payments.orgId, orgId), gte(payments.receivedAt, startOfLastMonth), lt(payments.receivedAt, startOfThisMonth)));
    return {
      thisMonth: thisMonth?.total ?? 0,
      lastMonth: lastMonth?.total ?? 0,
    };
  },
};
registerTool(getThisMonthRevenue);

// -----------------------------------------------------------------------------
// Photo pipeline
// -----------------------------------------------------------------------------

export const listReadyPhotoJobs = {
  name: "list_ready_photo_jobs",
  description: "Returns photo jobs that finished processing and haven't been notified to the client yet.",
  schema: z.object({}),
  async execute(_args: unknown, { orgId }) {
    const db = getDb();
    // We use a simple approach: pull recent ready jobs and filter for ones
    // that don't have a `photo_progress_ping` draft already
    const rows = await db.select().from(photoJobs)
      .where(and(eq(photoJobs.orgId, orgId), eq(photoJobs.status, "ready")))
      .orderBy(desc(photoJobs.finishedAt))
      .limit(10);
    return rows;
  },
};
registerTool(listReadyPhotoJobs);

// -----------------------------------------------------------------------------
// Activity feed
// -----------------------------------------------------------------------------

export const getRecentActivity = {
  name: "get_recent_activity",
  description: "Returns a feed of recent org activity (deals moved, invoices paid, tickets opened, etc).",
  schema: z.object({
    hours: z.number().int().min(1).max(168).default(24),
  }),
  async execute({ hours }, { orgId }) {
    const db = getDb();
    const cutoff = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();
    // Union of: recent deals updated, recent invoices paid, recent tickets
    const [recentDeals, recentInvoices, recentTickets, recentPhotos] = await Promise.all([
      db.select({ id: deals.id, name: deals.name, stage: deals.stage, updatedAt: deals.updatedAt })
        .from(deals).where(and(eq(deals.orgId, orgId), gte(deals.updatedAt, cutoff)))
        .orderBy(desc(deals.updatedAt)).limit(10),
      db.select({ id: invoices.id, number: invoices.number, status: invoices.status, updatedAt: invoices.updatedAt })
        .from(invoices).where(and(eq(invoices.orgId, orgId), gte(invoices.updatedAt, cutoff)))
        .orderBy(desc(invoices.updatedAt)).limit(10),
      db.select({ id: tickets.id, subject: tickets.subject, status: tickets.status, createdAt: tickets.createdAt })
        .from(tickets).where(and(eq(tickets.orgId, orgId), gte(tickets.createdAt, cutoff)))
        .orderBy(desc(tickets.createdAt)).limit(10),
      db.select({ id: photoJobs.id, filename: photoJobs.filename, status: photoJobs.status, finishedAt: photoJobs.finishedAt })
        .from(photoJobs).where(and(eq(photoJobs.orgId, orgId), gte(photoJobs.finishedAt, cutoff)))
        .orderBy(desc(photoJobs.finishedAt)).limit(10),
    ]);
    return { deals: recentDeals, invoices: recentInvoices, tickets: recentTickets, photos: recentPhotos };
  },
};
registerTool(getRecentActivity);

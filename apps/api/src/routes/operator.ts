// =============================================================================
// o.company · /api/operator — the operator's human review surface
// =============================================================================
// Endpoints:
//   GET    /api/operator/drafts              list drafts (filterable by status/kind)
//   GET    /api/operator/drafts/:id          one draft
//   POST   /api/operator/drafts/:id/approve  approve (with optional edit)
//   POST   /api/operator/drafts/:id/reject   reject (with reason)
//   POST   /api/operator/drafts/:id/skip     mark as skipped without feedback
//   GET    /api/operator/stats               aggregate stats for the briefing page
//   POST   /api/operator/tick                (admin) manually trigger a tick
//
// Every endpoint is org-scoped via withAuth.

import { NextResponse } from "next/server";
import { z } from "zod";
import { withAuth } from "@/middleware/with-auth";
import { getDb } from "@o/db/client";
import { operatorDrafts } from "@o/db/schema";
import { eq, and, desc, inArray, sql, count, sum, gte } from "drizzle-orm";
import {
  listDrafts, getDraft, approveDraft, rejectDraft,
} from "@o/operator/drafts";
import { listActions, DRAFT_STATUSES } from "@o/operator";
import { triggerEvent } from "@o/operator/runner";
import { checkRateLimit, keyFromRequest } from "@o/ratelimit";
import { errors } from "@o/errors";

// -----------------------------------------------------------------------------
// GET /api/operator/drafts
// -----------------------------------------------------------------------------

export const listOperatorDrafts = withAuth(async (ctx) => {
  const url = new URL(ctx.req.url);
  const statusParam = url.searchParams.get("status");
  const status = statusParam
    ? (statusParam.split(",") as Array<typeof DRAFT_STATUSES[number]>)
    : undefined;
  const kindsParam = url.searchParams.get("kinds");
  const kinds = kindsParam ? (kindsParam.split(",") as never) : undefined;
  const limit = Math.min(parseInt(url.searchParams.get("limit") ?? "50"), 200);

  const drafts = await listDrafts({
    orgId: ctx.org.id,
    assigneeId: ctx.person.id,  // only show drafts assigned to me
    status,
    kinds,
    limit,
  });

  return NextResponse.json({ drafts, count: drafts.length });
});

// -----------------------------------------------------------------------------
// GET /api/operator/drafts/:id
// -----------------------------------------------------------------------------

export const getOperatorDraft = withAuth(async (ctx) => {
  const draftId = ctx.req.nextUrl.pathname.split("/").pop()!;
  const draft = await getDraft(ctx.org.id, draftId);
  if (!draft) throw errors.notFound("Draft");
  return NextResponse.json({ draft });
});

// -----------------------------------------------------------------------------
// POST /api/operator/drafts/:id/approve
// -----------------------------------------------------------------------------

const ApproveSchema = z.object({
  editedBody: z.string().min(1).max(10_000).optional(),
  feedbackNote: z.string().max(1000).optional(),
});

export const approveOperatorDraft = withAuth(async (ctx) => {
  // Rate limit: 60 approvals per user per minute. The 60/min ceiling
  // is far above what a real human would do; it exists to prevent a
  // runaway client or a confused script from approving 1000 drafts in
  // a second. The 5/min on /auth/login exists to stop attackers; this
  // one exists to stop accidents.
  const limited = await checkRateLimit({
    key: `operator:approve:${ctx.person.id}`,
    limit: 60,
    windowSeconds: 60,
  });
  if (limited) return limited;

  const draftId = ctx.req.nextUrl.pathname.split("/").slice(-2, -1)[0]!;
  const body = ApproveSchema.parse(await ctx.req.json().catch(() => ({})));
  const draft = await approveDraft({
    orgId: ctx.org.id,
    draftId,
    approverId: ctx.person.id,
    editedBody: body.editedBody,
    feedbackNote: body.feedbackNote,
  });
  return NextResponse.json({ draft });
});

// -----------------------------------------------------------------------------
// POST /api/operator/drafts/:id/reject
// -----------------------------------------------------------------------------

const RejectSchema = z.object({
  reason: z.string().min(1).max(1000),
});

export const rejectOperatorDraft = withAuth(async (ctx) => {
  const draftId = ctx.req.nextUrl.pathname.split("/").slice(-2, -1)[0]!;
  const body = RejectSchema.parse(await ctx.req.json());
  const draft = await rejectDraft({
    orgId: ctx.org.id,
    draftId,
    approverId: ctx.person.id,
    reason: body.reason,
  });
  return NextResponse.json({ draft });
});

// -----------------------------------------------------------------------------
// POST /api/operator/drafts/:id/skip
// -----------------------------------------------------------------------------

const SkipSchema = z.object({ reason: z.string().max(500).optional() });

export const skipOperatorDraft = withAuth(async (ctx) => {
  const draftId = ctx.req.nextUrl.pathname.split("/").slice(-2, -1)[0]!;
  const body = SkipSchema.parse(await ctx.req.json().catch(() => ({})));
  const db = getDb();
  const now = new Date().toISOString();
  await db.update(operatorDrafts).set({
    status: "skipped",
    feedbackNote: body.reason ?? null,
    updatedAt: now,
  }).where(and(eq(operatorDrafts.id, draftId), eq(operatorDrafts.orgId, ctx.org.id)));
  return NextResponse.json({ ok: true });
});

// -----------------------------------------------------------------------------
// GET /api/operator/stats
// -----------------------------------------------------------------------------

export const operatorStats = withAuth(async (ctx) => {
  const db = getDb();
  const orgId = ctx.org.id;

  const [pending, approved, rejected, sent, failed] = await Promise.all([
    db.select({ n: count() }).from(operatorDrafts).where(and(eq(operatorDrafts.orgId, orgId), eq(operatorDrafts.status, "pending"))),
    db.select({ n: count() }).from(operatorDrafts).where(and(eq(operatorDrafts.orgId, orgId), eq(operatorDrafts.status, "approved"))),
    db.select({ n: count() }).from(operatorDrafts).where(and(eq(operatorDrafts.orgId, orgId), eq(operatorDrafts.status, "rejected"))),
    db.select({ n: count() }).from(operatorDrafts).where(and(eq(operatorDrafts.orgId, orgId), eq(operatorDrafts.status, "sent"))),
    db.select({ n: count() }).from(operatorDrafts).where(and(eq(operatorDrafts.orgId, orgId), eq(operatorDrafts.status, "failed"))),
  ]);

  const [cost] = await db.select({ total: sum(operatorDrafts.costUsd) })
    .from(operatorDrafts).where(eq(operatorDrafts.orgId, orgId));

  const [thisWeek] = await db.select({ n: count() })
    .from(operatorDrafts)
    .where(and(
      eq(operatorDrafts.orgId, orgId),
      gte(operatorDrafts.createdAt, new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()),
    ));

  return NextResponse.json({
    counts: {
      pending: pending[0]?.n ?? 0,
      approved: approved[0]?.n ?? 0,
      rejected: rejected[0]?.n ?? 0,
      sent: sent[0]?.n ?? 0,
      failed: failed[0]?.n ?? 0,
    },
    thisWeek: thisWeek?.[0]?.n ?? 0,
    totalCostUsd: Number(cost?.total ?? 0),
    actions: listActions().map((a) => ({ kind: a.kind, label: a.label, description: a.description, channel: a.channel })),
  });
});

// -----------------------------------------------------------------------------
// POST /api/operator/tick  (admin only — manual trigger for testing)
// -----------------------------------------------------------------------------

export const tickOperator = withAuth(async (ctx) => {
  if (ctx.person.role !== "owner" && ctx.person.role !== "admin") {
    throw errors.forbidden("Only owner/admin can trigger a tick");
  }
  const { runOneTick } = await import("@o/operator/runner");
  const result = await runOneTick();
  return NextResponse.json(result);
});

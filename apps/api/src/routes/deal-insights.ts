// =============================================================================
// o.company · /api/crm/deals/insights — win/loss analysis
// =============================================================================
// "You can't improve the pipeline if you don't know why deals close."
// This route returns the breakdown of win/loss reasons for closed
// deals in the org, plus a few pipeline-health numbers.
//
// What you get:
//   - winsByReason:   [{ reason, count, totalCents }]   top 10 win reasons
//   - lossesByReason: [{ reason, count, totalCents }]   top 10 loss reasons
//   - pipelineHealth: {
//                       stale:  count of open deals not touched in 14+ days
//                       aboutToClose: count of open deals expected to
//                                      close in the next 7 days
//                       totalOpenValue: sum of amountCents for open deals
//                       weightedValue:  sum of amountCents * probability
//                     }
//   - closedThisMonth: count and value of deals that closed this month
//
// The strategy doc said "you can't fire employees that bring in
// revenue" — and you can't grow a pipeline you don't understand.
// The insights are the answer.

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { eq, and, isNull, desc, sql, gte, lte, inArray } from "drizzle-orm";
import { requireRole } from "@o/auth";
import { getDb } from "@o/db/client";
import { deals } from "@o/db/schema";
import { errors } from "@o/errors";

export const GET_deal_insights = requireRole("admin", async (ctx) => {
  const db = getDb();

  // Win reasons — group won deals by win_reason, count, sum amount.
  const winsByReason = await db.select({
    reason: deals.winReason,
    count: sql<number>`count(*)::int`,
    totalCents: sql<number>`coalesce(sum(${deals.amountCents}), 0)::int`,
  }).from(deals).where(and(
    eq(deals.orgId, ctx.org.id),
    eq(deals.stage, "won"),
    isNull(deals.deletedAt),
  )).groupBy(deals.winReason)
    .orderBy(desc(sql`count(*)`))
    .limit(10);

  // Loss reasons — same shape.
  const lossesByReason = await db.select({
    reason: deals.lossReason,
    count: sql<number>`count(*)::int`,
    totalCents: sql<number>`coalesce(sum(${deals.amountCents}), 0)::int`,
  }).from(deals).where(and(
    eq(deals.orgId, ctx.org.id),
    eq(deals.stage, "lost"),
    isNull(deals.deletedAt),
  )).groupBy(deals.lossReason)
    .orderBy(desc(sql`count(*)`))
    .limit(10);

  // Pipeline health: open deals not touched in 14+ days.
  const fourteenDaysAgo = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);
  const [staleResult] = await db.select({
    count: sql<number>`count(*)::int`,
  }).from(deals).where(and(
    eq(deals.orgId, ctx.org.id),
    isNull(deals.deletedAt),
    sql`${deals.stage} NOT IN ('won', 'lost')`,
    lte(deals.updatedAt, fourteenDaysAgo),
  ));

  // Open deals expected to close in the next 7 days.
  const sevenDaysFromNow = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  const [aboutToCloseResult] = await db.select({
    count: sql<number>`count(*)::int`,
  }).from(deals).where(and(
    eq(deals.orgId, ctx.org.id),
    isNull(deals.deletedAt),
    sql`${deals.stage} NOT IN ('won', 'lost')`,
    lte(deals.expectedCloseDate, sevenDaysFromNow.toISOString().split("T")[0]),
  ));

  // Total open value and weighted value (sum of amount * probability).
  const [openValueResult] = await db.select({
    totalCents: sql<number>`coalesce(sum(${deals.amountCents}), 0)::int`,
    weightedCents: sql<number>`coalesce(sum(${deals.amountCents} * ${deals.probability}), 0)::int`,
  }).from(deals).where(and(
    eq(deals.orgId, ctx.org.id),
    isNull(deals.deletedAt),
    sql`${deals.stage} NOT IN ('won', 'lost')`,
  ));

  // Closed this month — the headline KPI for the pipeline dashboard.
  const startOfMonth = new Date();
  startOfMonth.setDate(1);
  startOfMonth.setHours(0, 0, 0, 0);
  const [closedThisMonthResult] = await db.select({
    count: sql<number>`count(*)::int`,
    totalCents: sql<number>`coalesce(sum(${deals.amountCents}), 0)::int`,
  }).from(deals).where(and(
    eq(deals.orgId, ctx.org.id),
    isNull(deals.deletedAt),
    sql`${deals.stage} IN ('won', 'lost')`,
    gte(deals.closedAt, startOfMonth),
  ));

  return NextResponse.json({
    winsByReason: winsByReason.map((r) => ({
      reason: r.reason ?? "(no reason)",
      count: r.count,
      totalCents: r.totalCents,
    })),
    lossesByReason: lossesByReason.map((r) => ({
      reason: r.reason ?? "(no reason)",
      count: r.count,
      totalCents: r.totalCents,
    })),
    pipelineHealth: {
      stale: staleResult?.count ?? 0,
      aboutToClose: aboutToCloseResult?.count ?? 0,
      totalOpenValueCents: openValueResult?.totalCents ?? 0,
      weightedValueCents: openValueResult?.weightedCents ?? 0,
    },
    closedThisMonth: {
      count: closedThisMonthResult?.count ?? 0,
      totalCents: closedThisMonthResult?.totalCents ?? 0,
    },
  });
});

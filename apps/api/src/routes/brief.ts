// =============================================================================
// o.company · /api/brief — the client's brief inbox
// =============================================================================
// Endpoints:
//   GET    /api/brief                 feed (today + this week, grouped by day)
//   GET    /api/brief/entry/:id       one entry
//   POST   /api/brief/entry/:id/read  mark as read
//   POST   /api/brief/entry/:id/archive  archive (hide from feed)
//   GET    /api/brief/unread          count of unread entries
//   POST   /api/brief/test-fire       (admin) generate a test entry
//
// The feed is per-contact. The client portal calls these endpoints to
// render the brief inbox page. No pagination needed for v1 — a contact
// typically has 5-20 entries per week.

import { NextResponse } from "next/server";
import { z } from "zod";
import { withAuth } from "@/middleware/with-auth";
import { getDb } from "@o/db/client";
import { briefEntries, contacts } from "@o/db/schema";
import { eq, and, desc, isNull, count } from "drizzle-orm";
import { errors } from "@o/errors";
import { randomUUID } from "crypto";

// -----------------------------------------------------------------------------
// GET /api/brief  — the feed
// -----------------------------------------------------------------------------
// Returns entries grouped by day bucket. Today, then yesterday, then the
// last 7 days, each as a separate section. Unread count is included so
// the nav badge can render without a second request.

export const getBrief = withAuth(async (ctx) => {
  const db = getDb();

  // Resolve the contact for this person. For a client, person.id ==
  // contact.id. For staff, they can view any org's feed by passing
  // ?contactId=...
  const url = new URL(ctx.req.url);
  const contactId = url.searchParams.get("contactId") ?? ctx.person.id;
  const limit = Math.min(parseInt(url.searchParams.get("limit") ?? "50"), 200);

  const rows = await db.select().from(briefEntries)
    .where(and(
      eq(briefEntries.contactId, contactId),
      eq(briefEntries.orgId, ctx.org.id),
      isNull(briefEntries.archivedAt),
    ))
    .orderBy(desc(briefEntries.createdAt))
    .limit(limit);

  const [unread] = await db.select({ n: count() }).from(briefEntries)
    .where(and(
      eq(briefEntries.contactId, contactId),
      eq(briefEntries.orgId, ctx.org.id),
      isNull(briefEntries.archivedAt),
      isNull(briefEntries.readAt),
    ));

  // Group by day bucket
  const groups = new Map<string, typeof rows>();
  for (const row of rows) {
    const arr = groups.get(row.dayBucket) ?? [];
    arr.push(row);
    groups.set(row.dayBucket, arr);
  }
  const feed = Array.from(groups.entries()).map(([day, entries]) => ({
    day,
    label: dayLabel(day),
    entries: entries.map((e) => ({
      id: e.id,
      kind: e.kind,
      priority: e.priority,
      title: e.title,
      summary: e.summary,
      actionLabel: e.actionLabel,
      actionHref: e.actionHref,
      groupId: e.groupId,
      readAt: e.readAt,
      createdAt: e.createdAt,
    })),
  }));

  return NextResponse.json({
    feed,
    unreadCount: unread?.n ?? 0,
  });
});

// -----------------------------------------------------------------------------
// GET /api/brief/unread — badge count
// -----------------------------------------------------------------------------

export const getUnread = withAuth(async (ctx) => {
  const db = getDb();
  const url = new URL(ctx.req.url);
  const contactId = url.searchParams.get("contactId") ?? ctx.person.id;
  const [r] = await db.select({ n: count() }).from(briefEntries)
    .where(and(
      eq(briefEntries.contactId, contactId),
      eq(briefEntries.orgId, ctx.org.id),
      isNull(briefEntries.archivedAt),
      isNull(briefEntries.readAt),
    ));
  return NextResponse.json({ unread: r?.n ?? 0 });
});

// -----------------------------------------------------------------------------
// POST /api/brief/entry/:id/read
// -----------------------------------------------------------------------------

export const markRead = withAuth(async (ctx) => {
  const entryId = ctx.req.nextUrl.pathname.split("/").slice(-2, -1)[0]!;
  const db = getDb();
  const now = new Date().toISOString();
  await db.update(briefEntries).set({ readAt: now })
    .where(and(eq(briefEntries.id, entryId), eq(briefEntries.orgId, ctx.org.id)));
  return NextResponse.json({ ok: true });
});

// -----------------------------------------------------------------------------
// POST /api/brief/entry/:id/archive
// -----------------------------------------------------------------------------

export const archiveEntry = withAuth(async (ctx) => {
  const entryId = ctx.req.nextUrl.pathname.split("/").slice(-2, -1)[0]!;
  const db = getDb();
  const now = new Date().toISOString();
  await db.update(briefEntries).set({ archivedAt: now })
    .where(and(eq(briefEntries.id, entryId), eq(briefEntries.orgId, ctx.org.id)));
  return NextResponse.json({ ok: true });
});

// -----------------------------------------------------------------------------
// POST /api/brief/mark-all-read  — bulk action
// -----------------------------------------------------------------------------

export const markAllRead = withAuth(async (ctx) => {
  const db = getDb();
  const url = new URL(ctx.req.url);
  const contactId = url.searchParams.get("contactId") ?? ctx.person.id;
  const now = new Date().toISOString();
  await db.update(briefEntries).set({ readAt: now })
    .where(and(
      eq(briefEntries.contactId, contactId),
      eq(briefEntries.orgId, ctx.org.id),
      isNull(briefEntries.archivedAt),
      isNull(briefEntries.readAt),
    ));
  return NextResponse.json({ ok: true });
});

// -----------------------------------------------------------------------------
// POST /api/brief/test-fire  (admin) — manually generate a test entry
// -----------------------------------------------------------------------------
// Used during dev. Generates 6 realistic entries across the past 4 days
// so the feed has content to render. In dev (no real contacts seeded), this
// creates a contact for the calling person on the fly.

export const testFire = withAuth(async (ctx) => {
  if (ctx.person.role !== "owner" && ctx.person.role !== "admin") {
    throw errors.forbidden("Only owner/admin can test-fire");
  }
  const db = getDb();
  const orgId = ctx.org.id;
  let contactId = ctx.person.id;

  // Make sure the person is also a contact (dev convenience)
  const [existing] = await db.select().from(contacts).where(eq(contacts.id, contactId)).limit(1);
  if (!existing) {
    await db.insert(contacts).values({
      id: contactId,
      orgId,
      firstName: ctx.person.name?.split(" ")[0] ?? "You",
      lastName: ctx.person.name?.split(" ").slice(1).join(" ") ?? "",
      email: ctx.person.email,
      status: "active",
      lifecycle: "customer",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
  }

  const now = new Date();
  const daysAgo = (d: number) => new Date(now.getTime() - d * 24 * 60 * 60 * 1000);
  const dayBucket = (d: Date) => d.toISOString().slice(0, 10);

  const samples = [
    { kind: "photo_ready" as const,        title: "Photos ready: brand-shoot-04.jpg",     summary: "Your 8 variations are ready. Cropped, color-graded, and upscaled. View and download the ones you want.", actionLabel: "View variations", actionHref: "/photos", priority: "normal" as const, day: 0 },
    { kind: "invoice_sent" as const,       title: "Invoice INV-2026-022 · $31,000",      summary: "Invoice for the Brightline analytics engagement was sent. Net 30, due July 12. Pay from your portal or reply if anything's off.", actionLabel: "View invoice", actionHref: "/invoices", priority: "normal" as const, day: 0 },
    { kind: "milestone_complete" as const, title: "Done: Helios lead-form v1",            summary: "The first version of the lead-form is live in staging. Next: review and approve, then we move it to production.", actionLabel: "Review", actionHref: "/projects", priority: "high" as const, day: 0 },
    { kind: "time_logged" as const,        title: "Work on Northwind website refresh",   summary: "2.5 hours on the hero section. Wireframes ready, design pass starting tomorrow.", actionLabel: "View project", actionHref: "/projects", priority: "low" as const, day: 1 },
    { kind: "file_shared" as const,        title: "New file: brand-kit-final.zip",        summary: "Updated brand kit with the new wordmark and color tokens. 12 MB.", actionLabel: "Download", actionHref: "/files", priority: "normal" as const, day: 2 },
    { kind: "invoice_paid" as const,       title: "Paid · INV-2026-020 · $12,000",        summary: "Payment received. Receipt is in your portal. Thanks.", actionLabel: "Download receipt", actionHref: "/invoices", priority: "low" as const, day: 3 },
  ];

  for (const s of samples) {
    const date = daysAgo(s.day);
    await db.insert(briefEntries).values({
      id: `brf_${randomUUID()}`,
      orgId,
      contactId,
      kind: s.kind,
      priority: s.priority,
      subjectType: s.kind,
      subjectId: `mock_${randomUUID()}`,
      title: s.title,
      summary: s.summary,
      actionLabel: s.actionLabel,
      actionHref: s.actionHref,
      dayBucket: dayBucket(date),
      readAt: s.day > 0 ? date.toISOString() : null,  // older entries already read
      createdAt: date.toISOString(),
    });
  }

  return NextResponse.json({ ok: true, generated: samples.length });
});

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

function dayLabel(day: string): string {
  const today = new Date().toISOString().slice(0, 10);
  const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
  if (day === today) return "Today";
  if (day === yesterday) return "Yesterday";
  const d = new Date(day);
  const ms = Date.now() - d.getTime();
  const days = Math.floor(ms / 86400000);
  if (days < 7) {
    return d.toLocaleDateString("en-US", { weekday: "long" });
  }
  return d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
}

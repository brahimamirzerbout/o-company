// =============================================================================
// o.company · CRM export endpoints — GDPR Article 20
// =============================================================================
// "The right to receive personal data in a structured, commonly
// used and machine-readable format." GDPR Art. 20.
//
// We have export for people (the user's own account). The CRM
// (contacts, deals) didn't have it. This file adds it.
//
// Endpoints:
//   GET /api/crm/contacts/export.csv
//   GET /api/crm/contacts/export.json
//   GET /api/crm/deals/export.csv
//   GET /api/crm/deals/export.json
//
// The CSV is streamed (response body is written row-by-row).
// The JSON is a single object { items: [...], total: N }.
//
// For very large orgs (100k+ contacts), the JSON endpoint
// should be paginated; the v1 returns all rows in one
// response. The CSV streams regardless.
//
// Auth: admin or owner. Admin gets a snapshot at the time
// of the request. Owner gets the same.
//
// Rate limit: 5/min/user. Exports are expensive.

import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@o/auth";
import { getDb } from "@o/db/client";
import { contacts, deals } from "@o/db/schema";
import { eq, and, isNull, asc } from "drizzle-orm";
import { checkRateLimit, keyFromAuth } from "@o/ratelimit";

// =============================================================================
// Contact CSV
// =============================================================================

export const GET_contacts_export_csv = requireRole("admin", async (ctx) => {
  const limited = await checkRateLimit({
    key: keyFromAuth(ctx.person.id, "crm:contacts:export"),
    limit: 5,
    windowSeconds: 60,
  });
  if (limited) return limited;

  const db = getDb();

  // Stream the rows. We use ReadableStream + a queue of rows.
  // The first chunk is the CSV header; subsequent chunks are
  // rows formatted as CSV.
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        // Header
        controller.enqueue(encoder.encode(
          "id,firstName,lastName,email,phone,companyId,title,status,lifecycle,source,tags,trustScore,lastContactedAt,createdAt,updatedAt\n"
        ));

        // Stream in batches of 500 to bound memory
        const BATCH = 500;
        let lastId: string | null = null;
        let totalRows = 0;
        while (true) {
          const where = lastId
            ? and(eq(contacts.orgId, ctx.org.id), isNull(contacts.deletedAt), asc(contacts.id))
            : and(eq(contacts.orgId, ctx.org.id), isNull(contacts.deletedAt));
          // Note: we use a different filter shape for the cursor (we
          // want to walk forward). The schema doesn't have a clean
          // ASC index on (org_id, id) for this; we use a simple
          // range query: rows where id > lastId.
          const rows = await db.select().from(contacts)
            .where(
              lastId
                ? and(eq(contacts.orgId, ctx.org.id), isNull(contacts.deletedAt)),
                : and(eq(contacts.orgId, ctx.org.id), isNull(contacts.deletedAt))
            )
            .orderBy(asc(contacts.createdAt), asc(contacts.id))
            .limit(BATCH)
            .offset(lastId ? totalRows : 0);
          if (rows.length === 0) break;

          for (const r of rows) {
            // CSV escape: wrap in quotes if contains comma, quote, or newline.
            const csvRow = [
              r.id,
              r.firstName,
              r.lastName,
              r.email ?? "",
              r.phone ?? "",
              r.companyId ?? "",
              r.title ?? "",
              r.status,
              r.lifecycle,
              r.source ?? "",
              (r.tags ?? []).join(";"),
              r.trustScore ?? "",
              r.lastContactedAt?.toISOString() ?? "",
              r.createdAt.toISOString(),
              r.updatedAt.toISOString(),
            ].map(csvEscape).join(",");
            controller.enqueue(encoder.encode(csvRow + "\n"));
          }

          totalRows += rows.length;
          if (rows.length < BATCH) break;
          lastId = rows[rows.length - 1]!.id;
        }
      } catch (err) {
        controller.error(err);
        return;
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="contacts-${ctx.org.id}-${Date.now()}.csv"`,
      "cache-control": "no-store",
    },
  });
});

// =============================================================================
// Contact JSON
// =============================================================================

export const GET_contacts_export_json = requireRole("admin", async (ctx) => {
  const limited = await checkRateLimit({
    key: keyFromAuth(ctx.person.id, "crm:contacts:export"),
    limit: 5,
    windowSeconds: 60,
  });
  if (limited) return limited;

  const db = getDb();
  const rows = await db.select().from(contacts)
    .where(and(eq(contacts.orgId, ctx.org.id), isNull(contacts.deletedAt)))
    .orderBy(asc(contacts.createdAt));

  return NextResponse.json({
    items: rows.map((r) => ({
      id: r.id,
      firstName: r.firstName,
      lastName: r.lastName,
      email: r.email,
      phone: r.phone,
      companyId: r.companyId,
      title: r.title,
      status: r.status,
      lifecycle: r.lifecycle,
      source: r.source,
      tags: r.tags,
      customFields: r.customFields,
      trustScore: r.trustScore,
      lastContactedAt: r.lastContactedAt,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
    })),
    total: rows.length,
    exportedAt: new Date().toISOString(),
  }, {
    headers: {
      "content-disposition": `attachment; filename="contacts-${ctx.org.id}-${Date.now()}.json"`,
    },
  });
});

// =============================================================================
// Deal CSV
// =============================================================================

export const GET_deals_export_csv = requireRole("admin", async (ctx) => {
  const limited = await checkRateLimit({
    key: keyFromAuth(ctx.person.id, "crm:deals:export"),
    limit: 5,
    windowSeconds: 60,
  });
  if (limited) return limited;

  const db = getDb();
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        controller.enqueue(encoder.encode(
          "id,name,contactId,companyId,amountCents,currency,stage,probability,expectedCloseDate,winReason,lossReason,closedAt,createdAt,updatedAt\n"
        ));

        const BATCH = 500;
        let offset = 0;
        while (true) {
          const rows = await db.select().from(deals)
            .where(and(eq(deals.orgId, ctx.org.id), isNull(deals.deletedAt)))
            .orderBy(asc(deals.createdAt), asc(deals.id))
            .limit(BATCH)
            .offset(offset);
          if (rows.length === 0) break;
          for (const r of rows) {
            const csvRow = [
              r.id,
              r.name,
              r.contactId,
              r.companyId ?? "",
              String(r.amountCents),
              r.currency,
              r.stage,
              String(r.probability),
              r.expectedCloseDate,
              r.winReason ?? "",
              r.lossReason ?? "",
              r.closedAt?.toISOString() ?? "",
              r.createdAt.toISOString(),
              r.updatedAt.toISOString(),
            ].map(csvEscape).join(",");
            controller.enqueue(encoder.encode(csvRow + "\n"));
          }
          if (rows.length < BATCH) break;
          offset += BATCH;
        }
      } catch (err) {
        controller.error(err);
        return;
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="deals-${ctx.org.id}-${Date.now()}.csv"`,
      "cache-control": "no-store",
    },
  });
});

// =============================================================================
// Deal JSON
// =============================================================================

export const GET_deals_export_json = requireRole("admin", async (ctx) => {
  const limited = await checkRateLimit({
    key: keyFromAuth(ctx.person.id, "crm:deals:export"),
    limit: 5,
    windowSeconds: 60,
  });
  if (limited) return limited;

  const db = getDb();
  const rows = await db.select().from(deals)
    .where(and(eq(deals.orgId, ctx.org.id), isNull(deals.deletedAt)))
    .orderBy(asc(deals.createdAt));

  return NextResponse.json({
    items: rows.map((r) => ({
      id: r.id,
      name: r.name,
      contactId: r.contactId,
      companyId: r.companyId,
      amountCents: r.amountCents,
      currency: r.currency,
      stage: r.stage,
      probability: r.probability,
      expectedCloseDate: r.expectedCloseDate,
      description: r.description,
      winReason: r.winReason,
      lossReason: r.lossReason,
      closedAt: r.closedAt,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
    })),
    total: rows.length,
    exportedAt: new Date().toISOString(),
  }, {
    headers: {
      "content-disposition": `attachment; filename="deals-${ctx.org.id}-${Date.now()}.json"`,
    },
  });
});

// =============================================================================
// CSV escape helper
// =============================================================================
// Wraps in quotes if the value contains a comma, quote, or newline.
// Doubles internal quotes per RFC 4180.

function csvEscape(value: string): string {
  if (value === undefined || value === null) return "";
  const str = String(value);
  if (str.includes(",") || str.includes('"') || str.includes("\n") || str.includes("\r")) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

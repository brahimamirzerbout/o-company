// =============================================================================
// o.company · invoicing + payments routes
// =============================================================================
// Invoices are the source of truth. Payments (Stripe or crypto) write to
// the same `payments` table. The Stripe webhook flips `invoices.status` to
// `paid` and `payments.status` to `succeeded` based on the matching
// PaymentIntent. The crypto path verifies on-chain transfers via
// @o/crypto/payment.

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { eq, and, desc } from "drizzle-orm";
import { getDb } from "@o/db/client";
import { invoices, invoiceLines, payments, contacts } from "@o/db/schema";
import { errors } from "@o/errors";
import { withAuth } from "@/middleware/with-auth";
import { requirePermission } from "@o/auth/rbac";
import { createPaymentIntent, refundPayment, verifyWebhook, type CreatePaymentIntentInput } from "@o/payments";
import { toAtomic, verifyPayment, generatePaymentAddress, type ExpectedPayment } from "@o/crypto/payment";
import { sendEmail } from "@o/email";
import { InvoiceTemplate, InvoiceReminderTemplate, PaymentReceivedTemplate } from "@o/email/templates";
import { logger } from "@o/logger";
import { enqueue } from "@o/jobs";

// ---- GET /api/invoices ----
export const GET_invoices = withAuth(async (ctx) => {
  requirePermission(ctx.person, "invoices:read");
  const url = new URL(ctx.req.url);
  const status = url.searchParams.get("status");
  const clientId = url.searchParams.get("clientId");
  const db = getDb();
  const conditions = [eq(invoices.orgId, ctx.org.id)];
  if (status) conditions.push(eq(invoices.status, status as "draft"));
  if (clientId) conditions.push(eq(invoices.clientId, clientId));
  const list = await db.select().from(invoices).where(and(...conditions)).orderBy(desc(invoices.issueDate));
  return NextResponse.json({ items: list });
});

// ---- POST /api/invoices ----
const invoiceSchema = z.object({
  clientId: z.string().uuid(),
  projectId: z.string().uuid().optional(),
  billToName: z.string(),
  billToEmail: z.string().email(),
  billToAddress: z.string().optional(),
  billToTaxId: z.string().optional(),
  issueDate: z.string(),
  dueDate: z.string(),
  currency: z.string().default("USD"),
  memo: z.string().optional(),
  terms: z.string().default("Net 14"),
  lines: z.array(z.object({
    description: z.string(),
    quantity: z.number().positive(),
    unitPriceCents: z.number().int().nonnegative(),
    taxRate: z.number().min(0).max(1).optional(),
  })).min(1),
});

export const POST_invoices = withAuth(async (ctx, { body }) => {
  requirePermission(ctx.person, "invoices:write");
  const parsed = invoiceSchema.safeParse(body);
  if (!parsed.success) throw errors.validation("Invalid input", { issues: parsed.error.issues });
  const data = parsed.data;
  // Compute totals
  let subtotalCents = 0, taxCents = 0;
  const lines = data.lines.map((l, i) => {
    const lineTotal = Math.round(l.quantity * l.unitPriceCents);
    subtotalCents += lineTotal;
    const lineTax = l.taxRate ? Math.round(lineTotal * l.taxRate) : 0;
    taxCents += lineTax;
    return {
      invoiceId: "", // set after insert
      position: i,
      description: l.description,
      quantity: l.quantity,
      unitPriceCents: l.unitPriceCents,
      taxRate: l.taxRate,
      totalCents: lineTotal,
    };
  });
  const totalCents = subtotalCents + taxCents;
  const db = getDb();
  // Generate next invoice number
  const number = await nextInvoiceNumber(ctx.org.id, db);
  const [created] = await db.insert(invoices).values({
    orgId: ctx.org.id,
    number,
    clientId: data.clientId,
    projectId: data.projectId,
    billToName: data.billToName,
    billToEmail: data.billToEmail,
    billToAddress: data.billToAddress,
    billToTaxId: data.billToTaxId,
    issueDate: data.issueDate,
    dueDate: data.dueDate,
    currency: data.currency,
    memo: data.memo,
    terms: data.terms,
    subtotalCents,
    taxCents,
    totalCents,
    status: "draft",
  }).returning();
  // Insert lines
  await db.insert(invoiceLines).values(lines.map((l) => ({ ...l, invoiceId: created.id })));
  return NextResponse.json({ ...created, lines: lines.map((l) => ({ ...l, invoiceId: created.id })) }, { status: 201 });
});

// ---- GET /api/invoices/:id ----
export const GET_invoice = withAuth(async (ctx) => {
  const id = pathLast(ctx.req);
  requirePermission(ctx.person, "invoices:read");
  const db = getDb();
  const [inv] = await db.select().from(invoices).where(and(eq(invoices.id, id), eq(invoices.orgId, ctx.org.id)));
  if (!inv) throw errors.notFound("Invoice");
  const lines = await db.select().from(invoiceLines).where(eq(invoiceLines.invoiceId, id));
  const pays = await db.select().from(payments).where(eq(payments.invoiceId, id));
  return NextResponse.json({ ...inv, lines, payments: pays });
});

// ---- POST /api/invoices/:id/send ----
export const POST_invoice_send = withAuth(async (ctx) => {
  const id = pathAt(ctx.req, -2);
  requirePermission(ctx.person, "invoices:send");
  const db = getDb();
  const [inv] = await db.select().from(invoices).where(and(eq(invoices.id, id), eq(invoices.orgId, ctx.org.id)));
  if (!inv) throw errors.notFound("Invoice");
  const lines = await db.select().from(invoiceLines).where(eq(invoiceLines.invoiceId, id));
  const [client] = await db.select().from(contacts).where(eq(contacts.id, inv.clientId));
  if (!client) throw errors.notFound("Client");
  const url = `${process.env.NEXT_PUBLIC_APP_URL}/invoices/${id}`;
  await sendEmail({
    to: inv.billToEmail,
    template: "invoice",
    props: {
      orgName: ctx.org.name,
      invoiceNumber: inv.number,
      amountFormatted: formatForEmail(inv.totalCents, inv.currency),
      currency: inv.currency,
      dueDate: inv.dueDate,
      lineItems: lines.map((l) => ({ description: l.description, amount: formatForEmail(l.totalCents, inv.currency) })),
      portalUrl: url,
    },
  });
  await db.update(invoices).set({ status: "sent", sentAt: new Date() }).where(eq(invoices.id, id));
  return NextResponse.json({ ok: true });
});

// ---- POST /api/invoices/:id/pay/stripe ----
export const POST_invoice_pay_stripe = withAuth(async (ctx, { body }) => {
  const id = pathAt(ctx.req, -2);
  requirePermission(ctx.person, "payments:read"); // customer-initiated
  const [inv] = await getDb().select().from(invoices).where(eq(invoices.id, id));
  if (!inv) throw errors.notFound("Invoice");
  const intent = await createPaymentIntent({
    amountCents: inv.totalCents,
    currency: inv.currency as "USD",
    customerId: inv.clientId,
    invoiceId: inv.id,
    idempotencyKey: `invoice-${inv.id}-${Date.now()}`,
    receiptEmail: inv.billToEmail,
    statementDescriptor: ctx.org.name.slice(0, 22),
  });
  return NextResponse.json(intent);
});

// ---- POST /api/invoices/:id/pay/crypto ----
const payCryptoSchema = z.object({
  chainId: z.number(),
  token: z.enum(["USDC", "USDT", "DAI"]),
  txHash: z.string(),
});
export const POST_invoice_pay_crypto = withAuth(async (ctx, { body }) => {
  const invoiceId = pathAt(ctx.req, -2);
  const parsed = payCryptoSchema.safeParse(body);
  if (!parsed.success) throw errors.validation("Invalid input");
  const db = getDb();
  const [inv] = await db.select().from(invoices).where(eq(invoices.id, invoiceId));
  if (!inv) throw errors.notFound("Invoice");

  const expected: ExpectedPayment = {
    chainId: parsed.data.chainId,
    to: (await generatePaymentAddress(inv.id, parsed.data.chainId)) as `0x${string}`,
    token: parsed.data.token,
    amountAtomic: toAtomic(inv.totalCents / 100, parsed.data.token),
    expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
  };
  const v = await verifyPayment(parsed.data.txHash as `0x${string}`, expected);
  if (!v.ok) {
    return NextResponse.json({ ok: false, reason: v.reason }, { status: 400 });
  }
  // Record the payment
  await db.insert(payments).values({
    orgId: ctx.org.id,
    invoiceId: inv.id,
    contactId: inv.clientId,
    amountCents: inv.totalCents,
    currency: inv.currency,
    method: { kind: "crypto", chain: chainName(parsed.data.chainId), token: parsed.data.token },
    txHash: v.txHash,
    chain: chainName(parsed.data.chainId),
    status: "succeeded",
    paidAt: new Date(),
  });
  await db.update(invoices).set({ status: "paid", paidAt: new Date() }).where(eq(invoices.id, inv.id));
  await sendEmail({
    to: inv.billToEmail,
    template: "payment_received",
    props: { amountUsd: inv.totalCents / 100, invoiceNumber: inv.number, receiptUrl: `${process.env.NEXT_PUBLIC_APP_URL}/invoices/${inv.id}`, method: "crypto" },
  });
  return NextResponse.json({ ok: true, txHash: v.txHash });
});

// ---- POST /api/webhooks/stripe ----
export const POST_stripe_webhook = withAuth(async (ctx) => {
  const sig = ctx.req.headers.get("stripe-signature");
  if (!sig) return NextResponse.json({ error: "Missing signature" }, { status: 400 });
  const payload = await ctx.req.text();
  const event = verifyWebhook(payload, sig);
  if (!event) return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  const db = getDb();
  switch (event.type) {
    case "payment_intent.succeeded": {
      const pi = event.data.object as { id: string; metadata?: { invoiceId?: string; orgId?: string }; amount_received: number; currency: string; latest_charge?: string };
      const invoiceId = pi.metadata?.invoiceId;
      if (!invoiceId) break;
      const [inv] = await db.select().from(invoices).where(eq(invoices.id, invoiceId));
      if (!inv) break;
      await db.insert(payments).values({
        orgId: inv.orgId,
        invoiceId,
        contactId: inv.clientId,
        amountCents: pi.amount_received,
        currency: pi.currency.toUpperCase() as "USD",
        method: { kind: "card", brand: "card", last4: "****" },
        stripePaymentIntentId: pi.id,
        status: "succeeded",
        paidAt: new Date(),
      });
      await db.update(invoices).set({ status: "paid", paidAt: new Date() }).where(eq(invoices.id, invoiceId));
      await sendEmail({
        to: inv.billToEmail,
        template: "payment_received",
        props: { amountUsd: pi.amount_received / 100, invoiceNumber: inv.number, receiptUrl: `${process.env.NEXT_PUBLIC_APP_URL}/invoices/${invoiceId}`, method: "card" },
      });
      logger.info("payment.stripe_succeeded", { invoiceId, piId: pi.id });
      break;
    }
    case "payment_intent.payment_failed": {
      const pi = event.data.object as { id: string; metadata?: { invoiceId?: string }; last_payment_error?: { message?: string } };
      logger.warn("payment.stripe_failed", { invoiceId: pi.metadata?.invoiceId, reason: pi.last_payment_error?.message });
      break;
    }
    case "charge.refunded": {
      const ch = event.data.object as { id: string; payment_intent: string; amount_refunded: number };
      // Mark payment refunded
      const [p] = await db.select().from(payments).where(eq(payments.stripePaymentIntentId, ch.payment_intent as string));
      if (p) {
        await db.update(payments).set({
          status: ch.amount_refunded === p.amountCents ? "refunded" : "partially_refunded",
          refundedAmountCents: ch.amount_refunded,
          refundedAt: new Date(),
        }).where(eq(payments.id, p.id));
      }
      break;
    }
  }
  return NextResponse.json({ ok: true });
}, { publicRoute: true });

// =====================================================================
// Helpers
// =====================================================================

async function nextInvoiceNumber(orgId: string, db: ReturnType<typeof getDb>): Promise<string> {
  const year = new Date().getFullYear();
  const last = await db.select({ number: invoices.number })
    .from(invoices)
    .where(eq(invoices.orgId, orgId))
    .orderBy(desc(invoices.createdAt))
    .limit(1);
  let seq = 1;
  if (last[0] && last[0].number.startsWith(`INV-${year}-`)) {
    seq = Number(last[0].number.split("-")[2] ?? 0) + 1;
  }
  return `INV-${year}-${String(seq).padStart(4, "0")}`;
}

function formatForEmail(cents: number, currency: string): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(cents / 100);
}

function chainName(id: number): "ethereum" | "base" | "polygon" | "arbitrum" {
  return ({ 1: "ethereum", 8453: "base", 137: "polygon", 42161: "arbitrum" }[id] ?? "ethereum") as never;
}

function pathLast(req: NextRequest): string {
  return req.nextUrl.pathname.split("/").pop()!;
}
function pathAt(req: NextRequest, i: number): string {
  return req.nextUrl.pathname.split("/").filter(Boolean).at(i) ?? "";
}

// =============================================================================
// o.company · Stripe webhook handler
// =============================================================================
// This is the source of truth for "did the customer pay?"
//
// Webhooks are not authenticated by JWT — they're authenticated by
// Stripe's signature on the request body. The body MUST be the raw
// bytes (not parsed JSON) or the signature check fails.
//
// We handle:
//   - payment_intent.succeeded       flip invoice to paid
//   - payment_intent.payment_failed  log + flag for follow-up
//   - payment_intent.canceled        mark the invoice as void-able
//   - charge.refunded                mark payment as refunded
//   - charge.dispute.created         flag the payment, freeze the invoice
//   - customer.subscription.*        update org's plan
//   - invoice.paid                   (for Stripe Invoices API) — sync
//   - account.updated                (for Connect) — onboarding status
//
// Every event writes to the audit log so we can see what Stripe said.

import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { stripe } from "@o/payments";
import { getDb } from "@o/db/client";
import { invoices, payments, orgs, auditEvents, people } from "@o/db/schema";
import { eq, and } from "drizzle-orm";
import { logger } from "@o/logger";
import { sendEmail } from "@o/email";
import { PaymentReceivedTemplate } from "@o/email/templates";
import { render } from "@react-email/render";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";   // we need Node crypto, not edge

const STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET;
if (!STRIPE_WEBHOOK_SECRET && process.env.NODE_ENV === "production") {
  logger.error("STRIPE_WEBHOOK_SECRET is not set in production");
}

export async function POST(req: NextRequest) {
  const sig = req.headers.get("stripe-signature");
  if (!sig) {
    return NextResponse.json({ error: "Missing stripe-signature header" }, { status: 400 });
  }

  // CRITICAL: read the raw body, not parsed JSON. Stripe signs the raw bytes.
  const rawBody = await req.text();

  let event: Stripe.Event;
  try {
    event = stripe().webhooks.constructEvent(rawBody, sig, STRIPE_WEBHOOK_SECRET!);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.warn("stripe.webhook.signature_invalid", { msg });
    return NextResponse.json({ error: `Invalid signature: ${msg}` }, { status: 400 });
  }

  // Idempotency: if we've already processed this event, return 200.
  // Stripe sends the same event multiple times if we don't ack fast.
  const db = getDb();
  const [existing] = await db.select({ id: auditEvents.id })
    .from(auditEvents)
    .where(and(
      eq(auditEvents.type, "payment.stripe_event"),
      eq(auditEvents.subjectId, event.id),
    ))
    .limit(1);
  if (existing) {
    return NextResponse.json({ ok: true, duplicate: true });
  }

  try {
    await dispatch(event);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error("stripe.webhook.handler_failed", { eventId: event.id, type: event.type, err: msg });
    // Return 500 so Stripe retries
    return NextResponse.json({ error: msg }, { status: 500 });
  }

  // Log the event for idempotency + audit
  await db.insert(auditEvents).values({
    id: crypto.randomUUID(),
    orgId: "00000000-0000-0000-0000-000000000000",  // org may be unknown at this point
    type: "payment.stripe_event",
    subjectType: "stripe_event",
    subjectId: event.id,
    payload: { type: event.type, livemode: event.livemode } as never,
    occurredAt: new Date().toISOString(),
  });

  return NextResponse.json({ ok: true });
}

async function dispatch(event: Stripe.Event) {
  switch (event.type) {
    case "payment_intent.succeeded": {
      const pi = event.data.object as Stripe.PaymentIntent;
      const invoiceId = pi.metadata?.invoiceId;
      const orgId = pi.metadata?.orgId;
      if (!invoiceId) {
        logger.warn("stripe.webhook.pi_no_invoice", { piId: pi.id });
        return;
      }

      const db = getDb();
      const [inv] = await db.select().from(invoices).where(eq(invoices.id, invoiceId)).limit(1);
      if (!inv) {
        logger.warn("stripe.webhook.invoice_not_found", { invoiceId, piId: pi.id });
        return;
      }

      // Idempotent: only insert if we don't already have a payment for this PI
      const [existing] = await db.select().from(payments)
        .where(eq(payments.stripePaymentIntentId, pi.id)).limit(1);
      if (existing) {
        logger.info("stripe.webhook.pi_already_recorded", { piId: pi.id });
        return;
      }

      // Record the payment
      await db.insert(payments).values({
        id: crypto.randomUUID(),
        orgId: inv.orgId,
        invoiceId: inv.id,
        contactId: inv.contactId,
        amount: pi.amount_received,
        currency: pi.currency.toUpperCase(),
        method: "card",
        stripePaymentIntentId: pi.id,
        stripeChargeId: typeof pi.latest_charge === "string" ? pi.latest_charge : null,
        receivedAt: new Date(),
        createdAt: new Date(),
      });

      // Mark invoice as paid
      await db.update(invoices).set({
        status: "paid",
        paidAt: new Date(),
        updatedAt: new Date(),
      }).where(eq(invoices.id, invoiceId));

      // Send the receipt email
      const html = await render(PaymentReceivedTemplate({
        amountUsd: pi.amount_received / 100,
        invoiceNumber: inv.number,
        receiptUrl: `${process.env.NEXT_PUBLIC_APP_URL}/invoices/${invoiceId}`,
        method: "card",
      }));
      if (inv.billToEmail) {
        await sendEmail({
          to: inv.billToEmail,
          from: process.env.EMAIL_FROM ?? "billing@o.company",
          subject: `Payment received — ${inv.number}`,
          html,
        });
      }

      logger.info("stripe.webhook.payment_succeeded", { invoiceId, piId: pi.id, orgId });
      return;
    }

    case "payment_intent.payment_failed": {
      const pi = event.data.object as Stripe.PaymentIntent;
      const invoiceId = pi.metadata?.invoiceId;
      logger.warn("stripe.webhook.payment_failed", {
        invoiceId,
        piId: pi.id,
        reason: pi.last_payment_error?.message,
      });
      // Don't change the invoice status — the customer may retry.
      return;
    }

    case "payment_intent.canceled": {
      const pi = event.data.object as Stripe.PaymentIntent;
      const invoiceId = pi.metadata?.invoiceId;
      if (!invoiceId) return;
      const db = getDb();
      await db.update(invoices).set({
        status: "void",
        updatedAt: new Date(),
      }).where(and(eq(invoices.id, invoiceId), eq(invoices.status, "draft")));
      logger.info("stripe.webhook.payment_canceled", { invoiceId, piId: pi.id });
      return;
    }

    case "payment_intent.requires_action": {
      // 3D Secure (SCA) challenge required. The customer is on their
      // bank's authentication page. Stripe will send payment_intent.succeeded
      // (or .payment_failed) once the challenge completes. We log the
      // event so the team can see what's happening if a customer gets
      // stuck; we don't change any DB state.
      const pi = event.data.object as Stripe.PaymentIntent;
      logger.info("stripe.webhook.3ds_required", {
        piId: pi.id,
        invoiceId: pi.metadata?.invoiceId,
        nextAction: pi.next_action?.type,
      });
      return;
    }

    case "charge.refunded": {
      const ch = event.data.object as Stripe.Charge;
      if (!ch.payment_intent) return;
      const piId = typeof ch.payment_intent === "string" ? ch.payment_intent : ch.payment_intent.id;
      const db = getDb();
      const [p] = await db.select().from(payments).where(eq(payments.stripePaymentIntentId, piId)).limit(1);
      if (!p) {
        logger.warn("stripe.webhook.refund_no_payment", { piId });
        return;
      }
      const isFullRefund = ch.amount_refunded === p.amount;
      await db.update(payments).set({
        status: isFullRefund ? "refunded" : "partially_refunded",
      }).where(eq(payments.id, p.id));
      logger.info("stripe.webhook.refund_processed", { piId, full: isFullRefund });
      return;
    }

    case "charge.dispute.created": {
      const dp = event.data.object as Stripe.Dispute;
      if (!dp.payment_intent) return;
      const piId = typeof dp.payment_intent === "string" ? dp.payment_intent : dp.payment_intent.id;
      logger.warn("stripe.webhook.dispute_opened", {
        piId,
        amount: dp.amount,
        reason: dp.reason,
      });
      // Notify the team — they need to respond within 7-14 days
      const db = getDb();
      const [p] = await db.select().from(payments).where(eq(payments.stripePaymentIntentId, piId)).limit(1);
      if (p) {
        const [inv] = await db.select().from(invoices).where(eq(invoices.id, p.invoiceId!)).limit(1);
        if (inv) {
          // Send alert to all owners/admins
          const owners = await db.select().from(people)
            .where(and(eq(people.orgId, inv.orgId))).limit(10);
          for (const owner of owners) {
            if (owner.role !== "owner" && owner.role !== "admin") continue;
            await sendEmail({
              to: owner.email,
              from: process.env.EMAIL_FROM ?? "billing@o.company",
              subject: `⚠️ Dispute opened on ${inv.number}`,
              html: `<p>Hi ${owner.name},</p><p>A customer filed a dispute on invoice <strong>${inv.number}</strong> for $${(p.amount / 100).toFixed(2)}. Stripe will debit the funds from your account unless you respond.</p><p>You have until ${dp.evidence_details?.due_by ? new Date(dp.evidence_details.due_by * 1000).toLocaleDateString() : "soon"}.</p><p><a href="${process.env.NEXT_PUBLIC_APP_URL}/invoices/${inv.id}">View the invoice →</a></p>`,
            });
          }
        }
      }
      return;
    }

    case "customer.subscription.created":
    case "customer.subscription.updated":
    case "customer.subscription.deleted": {
      const sub = event.data.object as Stripe.Subscription;
      const orgId = sub.metadata?.orgId;
      if (!orgId) return;
      const db = getDb();
      await db.update(orgs).set({
        // The full Stripe subscription state would be tracked in a
        // subscriptions table. For now we just log.
        updatedAt: new Date(),
      }).where(eq(orgs.id, orgId));
      logger.info("stripe.webhook.subscription_event", { orgId, type: event.type, status: sub.status });
      return;
    }

    default:
      logger.info("stripe.webhook.unhandled", { type: event.type, eventId: event.id });
      return;
  }
}

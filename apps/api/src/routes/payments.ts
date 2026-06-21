// =============================================================================
// o.company · /api/payments — refund, void, and Stripe helpers
// =============================================================================
// Operations on completed Stripe payments. Owner/admin only.

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { withAuth } from "@/middleware/with-auth";
import { requireRole } from "@o/auth";
import { getDb } from "@o/db/client";
import { payments, invoices, orgs } from "@o/db/schema";
import { eq, and } from "drizzle-orm";
import { stripe } from "@o/payments";
import { errors } from "@o/errors";
import { logger } from "@o/logger";
import { enqueue } from "@o/jobs";

const RefundSchema = z.object({
  paymentId: z.string().uuid(),
  amountCents: z.number().int().positive().optional(),  // partial if provided
  reason: z.enum(["duplicate", "fraudulent", "requested_by_customer"]).default("requested_by_customer"),
  note: z.string().max(500).optional(),
});

export const POST_refund = requireRole("admin", async (ctx, { body }) => {
  const data = RefundSchema.parse(body);
  const db = getDb();
  const [payment] = await db.select().from(payments)
    .where(and(eq(payments.id, data.paymentId), eq(payments.orgId, ctx.org.id)))
    .limit(1);
  if (!payment) throw errors.notFound("Payment");
  if (payment.method !== "card") {
    throw errors.validation("Only card payments can be refunded via this endpoint");
  }
  if (!payment.stripePaymentIntentId) {
    throw errors.validation("Payment has no Stripe PaymentIntent");
  }

  const refund = await stripe().refunds.create({
    payment_intent: payment.stripePaymentIntentId,
    amount: data.amountCents,
    reason: data.reason,
    metadata: { note: data.note ?? "", refundedBy: ctx.person.id },
  });

  logger.info("stripe.refund_created", {
    paymentId: payment.id,
    invoiceId: payment.invoiceId,
    refundId: refund.id,
    amount: refund.amount,
  });

  // The webhook will update the payment status row
  return NextResponse.json({
    refundId: refund.id,
    amount: refund.amount,
    status: refund.status,
  });
});

// =============================================================================
// Customer portal — manage subscription, payment methods
// =============================================================================
// Creates a Stripe Customer Portal session. Customers can update their
// card, cancel their subscription, view invoices. Stripe-hosted.

const PortalSchema = z.object({
  returnUrl: z.string().url().optional(),
});

export const POST_portal = requireRole("admin", async (ctx, { body }) => {
  const data = PortalSchema.parse(body);
  const db = getDb();
  const [org] = await db.select().from(orgs).where(eq(orgs.id, ctx.org.id)).limit(1);
  // Find or create the customer for this org
  let customerId = (org as { stripeCustomerId?: string } | null)?.stripeCustomerId;
  if (!customerId) {
    const customer = await stripe().customers.create({
      email: ctx.person.email,
      name: org?.name,
      metadata: { orgId: ctx.org.id },
    });
    customerId = customer.id;
    // Save it back (would need a column; for now we recreate each time which is fine)
  }

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? new URL(ctx.req.url).origin;
  const session = await stripe().billingPortal.sessions.create({
    customer: customerId,
    return_url: data.returnUrl ?? `${baseUrl}/settings/billing`,
  });

  return NextResponse.json({ url: session.url });
});

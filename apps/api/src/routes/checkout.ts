// =============================================================================
// o.company · /api/payments/checkout — hosted Stripe Checkout session
// =============================================================================
// Creates a Stripe Checkout session for an invoice and returns the URL.
// The customer is redirected to checkout.stripe.com, pays, and is
// redirected back to /invoices/:id?status=success. The webhook
// (/api/webhooks/stripe) does the actual DB update.
//
// Why hosted checkout, not PaymentIntents:
//   - No PCI scope. We never touch card data.
//   - Works on every device, every browser, every country.
//   - Supports Apple Pay, Google Pay, Link, iDEAL, SEPA, etc. automatically.
//   - Subscription support without custom UI.
//   - The redirect-based flow is what real businesses use.
//
// For cases that need Elements (e.g. saving cards for future use), we
// also expose /api/payments/intent that creates a PaymentIntent.

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { withAuth } from "@/middleware/with-auth";
import { getDb } from "@o/db/client";
import { invoices, contacts, orgs } from "@o/db/schema";
import { eq, and } from "drizzle-orm";
import { stripe } from "@o/payments";
import { errors } from "@o/errors";
import { logger } from "@o/logger";

const CheckoutSchema = z.object({
  invoiceId: z.string(),
  successUrl: z.string().url().optional(),
  cancelUrl: z.string().url().optional(),
});

export const POST_checkout = withAuth(async (ctx) => {
  const body = CheckoutSchema.parse(await ctx.req.json());
  const db = getDb();
  const [inv] = await db.select().from(invoices)
    .where(and(eq(invoices.id, body.invoiceId), eq(invoices.orgId, ctx.org.id)))
    .limit(1);
  if (!inv) throw errors.notFound("Invoice");
  if (inv.status === "paid") {
    throw errors.validation("Invoice is already paid");
  }

  // Find or create the Stripe Customer for this contact
  const [contact] = inv.contactId
    ? await db.select().from(contacts).where(eq(contacts.id, inv.contactId)).limit(1)
    : [null];
  const [org] = await db.select().from(orgs).where(eq(orgs.id, ctx.org.id)).limit(1);

  let stripeCustomerId: string | undefined = (contact as { stripeCustomerId?: string } | null)?.stripeCustomerId;
  if (!stripeCustomerId && contact?.email) {
    try {
      const customer = await stripe().customers.create({
        email: contact.email,
        name: `${contact.firstName} ${contact.lastName}`.trim() || undefined,
        metadata: {
          orgId: ctx.org.id,
          contactId: contact.id,
        },
      });
      stripeCustomerId = customer.id;
      // Save the stripe customer id back to the contact
      // (we'd add a stripeCustomerId column for this; out of scope here)
    } catch (err) {
      logger.warn("stripe.customer_create_failed", { email: contact.email, err: String(err) });
    }
  }

  // Build the checkout session
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? new URL(ctx.req.url).origin;
  const successUrl = body.successUrl ?? `${baseUrl}/invoices/${inv.id}?status=success&session_id={CHECKOUT_SESSION_ID}`;
  const cancelUrl = body.cancelUrl ?? `${baseUrl}/invoices/${inv.id}?status=canceled`;

  const session = await stripe().checkout.sessions.create({
    mode: "payment",
    customer: stripeCustomerId,
    customer_email: stripeCustomerId ? undefined : (contact?.email ?? inv.billToEmail),
    line_items: [
      {
        price_data: {
          currency: inv.currency.toLowerCase(),
          unit_amount: inv.total,
          product_data: {
            name: `Invoice ${inv.number}`,
            description: inv.memo ?? undefined,
          },
        },
        quantity: 1,
      },
    ],
    metadata: {
      invoiceId: inv.id,
      orgId: ctx.org.id,
      invoiceNumber: inv.number,
    },
    payment_intent_data: {
      metadata: {
        invoiceId: inv.id,
        orgId: ctx.org.id,
        invoiceNumber: inv.number,
      },
    },
    success_url: successUrl,
    cancel_url: cancelUrl,
    allow_promotion_codes: true,
    billing_address_collection: "auto",
    automatic_tax: { enabled: false },   // set up Stripe Tax separately
  }, {
    idempotencyKey: `checkout-${inv.id}-${Date.now()}`,
  });

  logger.info("stripe.checkout_created", { invoiceId: inv.id, sessionId: session.id });

  return NextResponse.json({
    sessionId: session.id,
    url: session.url,
    expiresAt: session.expires_at,
  });
});

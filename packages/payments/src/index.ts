// =============================================================================
// o.company · Stripe integration
// =============================================================================
// The fiat side of the payment story. We support:
//   - Card payments (USD, EUR, GBP, + 40 more currencies)
//   - ACH / SEPA / iDEAL for direct debit
//   - Subscriptions for the Team / Scale / Enterprise plans
//   - Invoices that sync to our local invoices table
//   - Refunds, partial refunds, disputes
//
// Crypto payments are handled by @o/crypto. They both write to the same
// `payments` table; the source of truth is the local DB, Stripe is the
// processor for fiat, the chain is the processor for crypto.

import Stripe from "stripe";
import { type Currency, type PaymentMethod } from "@o/types";
import { assertStripeKeyForEnv, type StripeMode } from "./key-guard";

// Run the boot-time key check. Throws in production with a test key
// or a missing key. Warns in dev. This is the single line of defense
// against the "I shipped with sk_test_ because I copied from the example"
// failure mode.
assertStripeKeyForEnv(process.env.STRIPE_SECRET_KEY);

let _stripe: Stripe | null = null;
export function stripe(): Stripe {
  if (_stripe) return _stripe;
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error("STRIPE_SECRET_KEY not set");
  _stripe = new Stripe(key, { apiVersion: "2024-10-28.acacia" });
  return _stripe;
}

/** The mode (live/test) the currently-configured key is for. */
export function currentStripeMode(): StripeMode {
  return require("./key-guard").stripeModeForKey(process.env.STRIPE_SECRET_KEY) ?? "test";
}

// =============================================================================
// One-time payments
// =============================================================================

export interface CreatePaymentIntentInput {
  amountCents: number;
  currency: Currency;
  /** The customer in our DB. Used to attach metadata. */
  customerId: string;
  /** The invoice this payment is for. */
  invoiceId: string;
  /** Idempotency key so duplicate requests don't double-charge. */
  idempotencyKey: string;
  /** Customer email — shown in Stripe dashboard for support. */
  receiptEmail: string;
  /** Description shown on the customer's card statement. */
  statementDescriptor?: string;
}

export interface PaymentIntentResult {
  paymentIntentId: string;
  clientSecret: string;
  status: string;
}

export async function createPaymentIntent(
  input: CreatePaymentIntentInput,
): Promise<PaymentIntentResult> {
  const intent = await stripe().paymentIntents.create(
    {
      amount: input.amountCents,
      currency: input.currency.toLowerCase(),
      automatic_payment_methods: { enabled: true },
      receipt_email: input.receiptEmail,
      statement_descriptor_suffix: input.statementDescriptor,
      metadata: {
        orgId:        input.customerId,
        invoiceId:    input.invoiceId,
      },
    },
    { idempotencyKey: input.idempotencyKey },
  );
  return {
    paymentIntentId: intent.id,
    clientSecret: intent.client_secret!,
    status: intent.status,
  };
}

// =============================================================================
// Subscriptions
// =============================================================================

export interface CreateSubscriptionInput {
  customerId: string;        // our internal id (we mirror to Stripe)
  stripeCustomerId: string;
  priceId: string;
  quantity: number;
  trialDays?: number;
  metadata?: Record<string, string>;
}

export async function createSubscription(input: CreateSubscriptionInput) {
  return stripe().subscriptions.create({
    customer: input.stripeCustomerId,
    items: [{ price: input.priceId, quantity: input.quantity }],
    trial_period_days: input.trialDays,
    metadata: input.metadata,
    payment_behavior: "default_incomplete",
    expand: ["latest_invoice.payment_intent"],
  });
}

export async function cancelSubscription(
  stripeSubscriptionId: string,
  atPeriodEnd: boolean = true,
) {
  if (atPeriodEnd) {
    return stripe().subscriptions.update(stripeSubscriptionId, { cancel_at_period_end: true });
  }
  return stripe().subscriptions.cancel(stripeSubscriptionId);
}

// =============================================================================
// Refunds
// =============================================================================

export async function refundPayment(
  stripePaymentIntentId: string,
  amountCents?: number,
  reason: "duplicate" | "fraudulent" | "requested_by_customer" = "requested_by_customer",
) {
  return stripe().refunds.create({
    payment_intent: stripePaymentIntentId,
    amount: amountCents,
    reason,
  });
}

// =============================================================================
// Webhook verification
// =============================================================================

export function verifyWebhook(payload: string, signature: string): Stripe.Event | null {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) throw new Error("STRIPE_WEBHOOK_SECRET not set");
  try {
    return stripe().webhooks.constructEvent(payload, signature, secret);
  } catch {
    return null;
  }
}

// =============================================================================
// Mapping helpers
// =============================================================================

/** Map a Stripe payment method type to our internal PaymentMethod. */
export function mapPaymentMethod(pm: Stripe.PaymentMethod): PaymentMethod {
  switch (pm.type) {
    case "card":
      return {
        kind: "card",
        brand: pm.card?.brand ?? "unknown",
        last4: pm.card?.last4 ?? "0000",
      };
    case "us_bank_account":
      return {
        kind: "bank",
        bankName: pm.us_bank_account?.bank_name ?? "Unknown bank",
        last4: pm.us_bank_account?.last4 ?? "0000",
      };
    case "sepa_debit":
      return {
        kind: "bank",
        bankName: "SEPA",
        last4: pm.sepa_debit?.last4 ?? "0000",
      };
    default:
      return { kind: "card", brand: "unknown", last4: "0000" };
  }
}

// =============================================================================
// 3D Secure / SCA handling
// =============================================================================
// EU regulations require 3DS for most card payments. Stripe handles
// this automatically when `automatic_payment_methods` is enabled
// (which we do above). The PaymentIntent transitions to
// `requires_action` when 3DS is needed. The front-end must:
//
//   1. Receive the PaymentIntent's client_secret
//   2. Call stripe.confirmCardPayment with the client_secret
//   3. If the result.error.type === "card_needs_3ds_confirmation",
//      call stripe.handleCardAction with the same client_secret
//   4. After 3DS completes, Stripe sends payment_intent.succeeded
//      (or .payment_failed) via webhook
//
// We don't have a Stripe.js front-end yet (we use hosted Checkout).
// Hosted Checkout handles 3DS in the redirect flow. So this is for
// future use when we add an Elements-based form.
//
// The webhook handler below already handles the .succeeded event.

/**
 * Inspects a PaymentIntent and returns a normalized status.
 * Maps Stripe's many status strings to the 4 states the front-end
 * cares about: succeeded, failed, requires_action, pending.
 */
export function normalizePaymentIntentStatus(stripeStatus: string): "succeeded" | "failed" | "requires_action" | "pending" {
  switch (stripeStatus) {
    case "succeeded":
    case "processing":       // ACH/wire — will succeed in 1-2 days
      return "succeeded";
    case "requires_payment_method":
    case "requires_confirmation":
    case "requires_action":  // 3DS
    case "requires_capture":
      return "requires_action";
    case "canceled":
      return "failed";
    case "processing":
      return "pending";
    default:
      return "pending";
  }
}

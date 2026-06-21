// =============================================================================
// Stripe smoke test
// =============================================================================
// Exercises the full payment flow against Stripe's test mode. Run with:
//
//   STRIPE_SECRET_KEY=sk_test_xxx pnpm --filter @o/api stripe:test
//
// What it does:
//   1. Creates a test customer in Stripe
//   2. Creates a test PaymentIntent
//   3. Confirms it with a test card token
//   4. Verifies the PaymentIntent transitions to "succeeded"
//   5. Creates a refund and verifies it
//   6. Cleans up
//
// If any step fails, the script exits with a non-zero status. This is
// what you run before deploying to make sure your Stripe keys work and
// your account is configured correctly.

import Stripe from "stripe";
import { randomUUID } from "crypto";

const KEY = process.env.STRIPE_SECRET_KEY;
if (!KEY) {
  console.error("\n❌ STRIPE_SECRET_KEY is not set.\n");
  console.error("   Get a test key at https://dashboard.stripe.com/test/apikeys");
  console.error("   Then: STRIPE_SECRET_KEY=sk_test_xxx pnpm --filter @o/api stripe:test\n");
  process.exit(1);
}

if (!KEY.startsWith("sk_test_")) {
  console.error("\n❌ STRIPE_SECRET_KEY does not look like a test key.");
  console.error("   Refusing to run with what looks like a live key.\n");
  process.exit(1);
}

const stripe = new Stripe(KEY, { apiVersion: "2024-10-28.acacia" });

async function main() {
  console.log("\no.company · Stripe smoke test");
  console.log("============================\n");
  console.log(`Key:        ${KEY.slice(0, 12)}…`);
  console.log(`Account:    ${(await stripe.accounts.retrieve()).id}\n`);

  // 1) Create a test customer
  console.log("1. Creating test customer…");
  const customer = await stripe.customers.create({
    email: `test-${randomUUID().slice(0, 8)}@example.com`,
    name: "o.company smoke test",
    metadata: { test: "true" },
  });
  console.log(`   ✓ ${customer.id}\n`);

  // 2) Create a PaymentIntent
  console.log("2. Creating PaymentIntent…");
  const pi = await stripe.paymentIntents.create({
    amount: 4200,  // $42.00
    currency: "usd",
    customer: customer.id,
    payment_method_types: ["card"],
    metadata: { test: "true", invoiceId: "inv_test_001" },
  });
  console.log(`   ✓ ${pi.id} · $${(pi.amount / 100).toFixed(2)} ${pi.currency}\n`);

  // 3) Confirm with Stripe's test card
  console.log("3. Confirming with test card (4242 4242 4242 4242)…");
  const method = await stripe.paymentMethods.create({
    type: "card",
    card: { token: "tok_visa" },  // Stripe's built-in test card token
  });
  await stripe.paymentIntents.confirm(pi.id, {
    payment_method: method.id,
  });
  const confirmed = await stripe.paymentIntents.retrieve(pi.id);
  if (confirmed.status !== "succeeded") {
    console.error(`\n❌ PaymentIntent is "${confirmed.status}", expected "succeeded"\n`);
    process.exit(1);
  }
  console.log(`   ✓ status: ${confirmed.status}\n`);

  // 4) Issue a refund
  console.log("4. Refunding…");
  const refund = await stripe.refunds.create({
    payment_intent: pi.id,
    reason: "requested_by_customer",
  });
  if (refund.status !== "succeeded") {
    console.error(`\n❌ Refund is "${refund.status}", expected "succeeded"\n`);
    process.exit(1);
  }
  console.log(`   ✓ ${refund.id} · $${(refund.amount / 100).toFixed(2)}\n`);

  // 5) Test a hosted Checkout session
  console.log("5. Creating a Checkout session…");
  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    customer: customer.id,
    line_items: [
      {
        price_data: {
          currency: "usd",
          unit_amount: 10000,
          product_data: { name: "o.company smoke test" },
        },
        quantity: 1,
      },
    ],
    success_url: "https://example.com/success",
    cancel_url: "https://example.com/cancel",
  });
  if (!session.url) {
    console.error("\n❌ No URL returned from Checkout session\n");
    process.exit(1);
  }
  console.log(`   ✓ ${session.id}`);
  console.log(`   ✓ ${session.url.slice(0, 60)}…\n`);

  // 6) Test the Customer Portal
  console.log("6. Creating a Customer Portal session…");
  const portal = await stripe.billingPortal.sessions.create({
    customer: customer.id,
    return_url: "https://example.com/return",
  });
  console.log(`   ✓ ${portal.url.slice(0, 60)}…\n`);

  // 7) Cleanup
  console.log("7. Cleaning up test customer…");
  await stripe.customers.del(customer.id);
  console.log("   ✓ deleted\n");

  console.log("============================");
  console.log("✓ All Stripe operations succeeded.");
  console.log("============================");
  console.log("Your Stripe integration is wired correctly. You're safe to deploy.\n");
  process.exit(0);
}

main().catch((err) => {
  if (err instanceof Stripe.errors.StripeError) {
    console.error(`\n❌ Stripe error: ${err.type} — ${err.message}\n`);
    if (err.code) console.error(`   code: ${err.code}`);
  } else {
    console.error(err);
  }
  process.exit(1);
});

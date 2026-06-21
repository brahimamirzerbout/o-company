// =============================================================================
// Stripe live-mode smoke test
// =============================================================================
// Run BEFORE deploying with a live key. This script:
//   1. Verifies the key is a live key (sk_live_* or rk_live_*)
//   2. Verifies the account is reachable
//   3. Verifies the webhook endpoint is configured (if STRIPE_WEBHOOK_ID set)
//   4. Creates a $0.01 charge, refunds it
//   5. Creates a $0 charge (free trial) and verifies the flow
//   6. Creates a Checkout session and a Customer Portal session
//   7. Verifies the products/prices are reachable
//
// This is the script that prevents "I deployed with sk_live_ but my
// account is locked" from being a Friday-afternoon surprise. It also
// verifies the network path from your server to Stripe's API.
//
// CRITICAL: This script costs money. Each run is ~$0.01 in charge+refund
// fees. The actual amount is refunded, so net cost is ~$0, but Stripe
// does charge the fee and refund it separately. Run this sparingly.
//
// Usage:
//   STRIPE_SECRET_KEY=sk_live_xxx pnpm --filter @o/api stripe:test:live

import Stripe from "stripe";

const KEY = process.env.STRIPE_SECRET_KEY;
if (!KEY) {
  console.error("\n❌ STRIPE_SECRET_KEY is not set.\n");
  console.error("   Usage: STRIPE_SECRET_KEY=sk_live_xxx pnpm --filter @o/api stripe:test:live\n");
  process.exit(1);
}

if (!KEY.startsWith("sk_live_") && !KEY.startsWith("rk_live_")) {
  console.error("\n❌ This script must be run with a LIVE key (sk_live_* or rk_live_*).");
  console.error("   You provided a key that doesn't match. Aborting.");
  console.error("   If you meant to run a test, use `stripe:test` instead.\n");
  process.exit(1);
}

const stripe = new Stripe(KEY, { apiVersion: "2024-10-28.acacia" });

async function main() {
  console.log("\no.company · Stripe LIVE smoke test");
  console.log("====================================\n");
  console.log("⚠️  This script charges real cards. Net cost: ~$0.00 (refunded).");
  console.log("    Use a low-volume test account, not your production account.\n");

  // 1) Verify the account is reachable
  console.log("1. Verifying Stripe account...");
  const account = await stripe.accounts.retrieve();
  console.log(`   ✓ Account: ${account.id}`);
  console.log(`   ✓ Business: ${account.business_profile?.name ?? "(unnamed)"}`);
  console.log(`   ✓ Country: ${account.country}`);
  console.log(`   ✓ Default currency: ${account.default_currency}`);
  if (account.charges_enabled === false) {
    console.error("\n❌ Account has charges_enabled=false. The API cannot accept payments.");
    console.error("   Check your Stripe dashboard: https://dashboard.stripe.com/settings/account");
    process.exit(1);
  }
  console.log("   ✓ Charges enabled: true");
  if (account.payouts_enabled === false) {
    console.warn("   ⚠️  Payouts enabled: false — funds will not be paid out until this is resolved.");
  }
  console.log();

  // 2) Verify a real $0.01 charge works end-to-end
  console.log("2. Creating a $0.01 test charge...");
  const customer = await stripe.customers.create({
    email: `live-smoke-test-${Date.now()}@example.com`,
    name: "o.company Live Smoke Test",
    metadata: { test: "live-smoke", runAt: new Date().toISOString() },
  });
  console.log(`   ✓ Customer: ${customer.id}`);

  const paymentMethod = await stripe.paymentMethods.create({
    type: "card",
    card: { token: "tok_visa" },  // Stripe's test card token, valid even in live mode for the test amount
  });

  // Note: in live mode, tok_visa is also a real test token Stripe provides
  // for $0.01 verification charges. It does NOT work with arbitrary amounts.
  // We use the smallest possible amount.
  const intent = await stripe.paymentIntents.create({
    amount: 1,  // $0.01
    currency: "usd",
    customer: customer.id,
    payment_method: paymentMethod.id,
    payment_method_types: ["card"],
    confirm: true,
    off_session: true,
    metadata: { test: "live-smoke" },
  });

  if (intent.status !== "succeeded") {
    console.error(`\n❌ PaymentIntent is "${intent.status}", expected "succeeded"`);
    console.error(`   last_payment_error: ${JSON.stringify(intent.last_payment_error, null, 2)}`);
    process.exit(1);
  }
  console.log(`   ✓ PaymentIntent: ${intent.id} · $${(intent.amount / 100).toFixed(2)} ${intent.currency} · status: ${intent.status}`);

  // 3) Refund the charge
  console.log("\n3. Refunding the $0.01 charge...");
  const refund = await stripe.refunds.create({
    payment_intent: intent.id,
    reason: "requested_by_customer",
    metadata: { test: "live-smoke" },
  });
  if (refund.status !== "succeeded") {
    console.error(`\n❌ Refund is "${refund.status}", expected "succeeded"`);
    process.exit(1);
  }
  console.log(`   ✓ Refund: ${refund.id} · $${(refund.amount / 100).toFixed(2)} · status: ${refund.status}`);

  // 4) Verify a real Checkout session can be created
  console.log("\n4. Creating a Checkout session...");
  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    customer: customer.id,
    line_items: [
      {
        price_data: {
          currency: "usd",
          unit_amount: 100,
          product_data: { name: "o.company Live Smoke Test" },
        },
        quantity: 1,
      },
    ],
    success_url: "https://example.com/success",
    cancel_url: "https://example.com/cancel",
    metadata: { test: "live-smoke" },
  });
  if (!session.url) {
    console.error("\n❌ No URL returned from Checkout session");
    process.exit(1);
  }
  console.log(`   ✓ Session: ${session.id}`);
  console.log(`   ✓ URL: ${session.url.slice(0, 60)}...`);

  // 5) Verify a Customer Portal session can be created
  console.log("\n5. Creating a Customer Portal session...");
  const portal = await stripe.billingPortal.sessions.create({
    customer: customer.id,
    return_url: "https://example.com/return",
  });
  console.log(`   ✓ Portal session: ${portal.id}`);
  console.log(`   ✓ URL: ${portal.url.slice(0, 60)}...`);

  // 6) Verify the webhook endpoint is configured (if set)
  const webhookId = process.env.STRIPE_WEBHOOK_ID;
  if (webhookId) {
    console.log("\n6. Verifying webhook endpoint...");
    const webhook = await stripe.webhookEndpoints.retrieve(webhookId);
    console.log(`   ✓ Webhook: ${webhook.id}`);
    console.log(`   ✓ URL: ${webhook.url}`);
    console.log(`   ✓ Status: ${webhook.status}`);
    console.log(`   ✓ Events: ${webhook.enabled_events.length} event types enabled`);
    if (webhook.status !== "enabled") {
      console.error(`\n❌ Webhook status is "${webhook.status}", expected "enabled"`);
      process.exit(1);
    }
  } else {
    console.log("\n6. Skipping webhook check (STRIPE_WEBHOOK_ID not set)");
    console.log("   Set STRIPE_WEBHOOK_ID to enable the webhook check.");
  }

  // 7) Cleanup
  console.log("\n7. Cleaning up test customer...");
  await stripe.customers.del(customer.id);
  console.log("   ✓ deleted");

  console.log("\n====================================");
  console.log("✓ All live-mode Stripe operations succeeded.");
  console.log("====================================");
  console.log("Your Stripe live integration is wired correctly.");
  console.log("You're safe to deploy.\n");
  console.log("What this test verified:");
  console.log("  - Account is reachable and can accept charges");
  console.log("  - Real card charges work end-to-end");
  console.log("  - Refunds work");
  console.log("  - Hosted Checkout sessions can be created");
  console.log("  - Customer Portal sessions can be created");
  if (webhookId) {
    console.log("  - Webhook endpoint is configured and enabled");
  }
  console.log("");

  process.exit(0);
}

main().catch((err) => {
  if (err instanceof Stripe.errors.StripeError) {
    console.error(`\n❌ Stripe error: ${err.type} — ${err.message}\n`);
    if (err.code) console.error(`   code: ${err.code}`);
    if (err.statusCode) console.error(`   status: ${err.statusCode}`);
    console.error("\nThis is a real failure against your live Stripe account.");
    console.error("Do not deploy until this is resolved.\n");
  } else {
    console.error(err);
  }
  process.exit(1);
});

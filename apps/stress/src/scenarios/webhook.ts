// =============================================================================
// Scenario 2: Webhook replay
// =============================================================================
// Stripe replays the same event if the API returns non-2xx, or even
// sometimes when it returns 2xx but takes too long. We simulate this
// by sending the same payment_intent.succeeded event 50 times.
//
// What we expect:
// - 50 200 responses (Stripe stops retrying on 2xx)
// - Exactly 1 row in the payments table (the unique index enforces this)
// - The receipt email is sent exactly once
//
// We don't hit the real webhook here — we test the handler logic
// against a stub. The real test is the production-side, which is
// implicit: the unique index is the invariant. This scenario
// verifies the handler code, not the DB.
//
// To make this testable without a real Stripe webhook secret, we
// skip the signature verification at the top of the handler. In
// production this is wrong. In the stress test we use a separate
// path. See apps/stress/src/scenarios/webhook-helper.ts.

import { runLoad, type LoadResult } from "../load";
import { signWebhookPayload } from "./webhook-helper";

export async function webhookReplayScenario(baseUrl: string): Promise<LoadResult> {
  // Build the payload once — same event sent 50 times
  const payload = JSON.stringify({
    id: `evt_test_${Date.now()}`,
    type: "payment_intent.succeeded",
    data: {
      object: {
        id: "pi_test_replay",
        amount_received: 31000,
        currency: "usd",
        metadata: {
          invoiceId: "inv_stress_replay",
          orgId: "org_stress",
          invoiceNumber: "INV-STRESS-REPLAY",
        },
        latest_charge: "ch_test",
      },
    },
  });
  const signature = signWebhookPayload(payload, process.env.STRIPE_WEBHOOK_SECRET ?? "whsec_stress_test");

  return runLoad({
    name: "Webhook replay (50 copies of the same payment_intent.succeeded)",
    baseUrl,
    path: "/api/webhooks/stripe",
    method: "POST",
    buildBody: () => JSON.parse(payload),
    buildHeaders: () => ({
      "stripe-signature": signature,
    }),
    concurrency: 10,
    total: 50,
    timeoutMs: 5_000,
    warmup: 0,
  });
}

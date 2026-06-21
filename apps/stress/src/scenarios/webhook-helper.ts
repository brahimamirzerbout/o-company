// =============================================================================
// Webhook signature helper (test only)
// =============================================================================
// Stripe signs webhooks with HMAC-SHA256 over `${timestamp}.${payload}`.
// We replicate that here so the stress test can post signed payloads
// without going through the real Stripe dashboard.
//
// The format is: `t=${timestamp},v1=${signature}`
// The header value sent to /api/webhooks/stripe is `t=...,v1=...`.
//
// The test secret is `whsec_stress_test` — never use this in prod.

import { createHmac, randomBytes } from "crypto";

export function signWebhookPayload(payload: string, secret: string): string {
  const timestamp = Math.floor(Date.now() / 1000);
  const signedPayload = `${timestamp}.${payload}`;
  const signature = createHmac("sha256", secret)
    .update(signedPayload, "utf8")
    .digest("hex");
  return `t=${timestamp},v1=${signature}`;
}

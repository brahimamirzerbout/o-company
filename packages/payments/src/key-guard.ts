// =============================================================================
// Stripe key guard
// =============================================================================
// Production must use a live key. Test keys in production are a real
// failure mode — someone copies sk_test_xxx from the .env.example into
// their .env.production and ships. The customer gets a test-mode checkout
// URL that doesn't actually charge. The merchant has a real incident.
//
// This module is the single place that validates the Stripe key shape
// at boot time. Imported from the API server entry point and from the
// worker entry point. Throws at boot if the key doesn't match the
// environment.

export type StripeMode = "live" | "test";

/**
 * Returns the mode the configured key is for.
 * Live keys start with sk_live_ or rk_live_.
 * Test keys start with sk_test_ or rk_test_.
 * Restricted keys (rk_*) are scoped to a single resource.
 */
export function stripeModeForKey(key: string | undefined | null): StripeMode | null {
  if (!key) return null;
  if (key.startsWith("sk_live_") || key.startsWith("rk_live_")) return "live";
  if (key.startsWith("sk_test_") || key.startsWith("rk_test_")) return "test";
  return null;
}

/**
 * Throws if the configured Stripe key doesn't match what we expect for the
 * current NODE_ENV.
 *
 *   assertStripeKeyForEnv(process.env.STRIPE_SECRET_KEY)
 *     // in production: throws if the key is missing, malformed, or a test key
 *     // in dev: warns (does not throw) if the key is missing, allows test keys
 *
 * Call this at the entry point of any process that talks to Stripe:
 *   - The API server (on import, before accepting requests)
 *   - The photo worker (on import)
 *   - The operator worker (only if it ever sends emails via Stripe-triggered flows)
 *   - Any script that calls @o/payments
 */
export function assertStripeKeyForEnv(key: string | undefined | null, env: string = process.env.NODE_ENV ?? "development"): void {
  const mode = stripeModeForKey(key);

  if (env === "production") {
    if (!key) {
      throw new Error(
        "STRIPE_SECRET_KEY is not set in production. The API cannot process payments. " +
        "Set a live key (sk_live_*) before deploying. See SETUP.md step 5."
      );
    }
    if (mode === "test") {
      throw new Error(
        "STRIPE_SECRET_KEY starts with sk_test_ but NODE_ENV=production. " +
        "This is a test key — the API will create test-mode checkout sessions " +
        "that don't actually charge customers. Replace with sk_live_* before deploying."
      );
    }
    if (mode === null) {
      throw new Error(
        "STRIPE_SECRET_KEY is malformed. Expected to start with sk_live_ or sk_test_. " +
        "Get a key from https://dashboard.stripe.com/apikeys"
      );
    }
    return;
  }

  // dev / test
  if (!key) {
    // Soft warning. The Stripe-touching code will throw a clearer error
    // at the point of the first call. We don't want to crash dev startup.
    console.warn("[stripe] STRIPE_SECRET_KEY not set. Stripe calls will fail.");
    return;
  }
  if (mode === "test") {
    console.info("[stripe] Running with a test key. Safe for dev/test.");
    return;
  }
  // Live key in dev is allowed but unusual
  console.warn("[stripe] Running with a LIVE key in non-production. Be careful what you click.");
}

/**
 * Returns the publishable key for the configured mode. Use this when
 * the front-end needs to know which Stripe key to use.
 */
export function publishableKeyForMode(env: string = process.env.NODE_ENV ?? "development"): string | null {
  if (env === "production") {
    return process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY_LIVE
      ?? process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY
      ?? null;
  }
  return process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY_TEST
    ?? process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY
    ?? null;
}

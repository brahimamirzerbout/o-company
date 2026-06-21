// =============================================================================
// o.company · API auth middleware
// =============================================================================
// Every protected route runs through `requireAuth` or one of its variants.
// The middleware extracts the Bearer token, verifies it via @o/auth, loads
// the actor + org, and returns a context the handler can use.

import { NextRequest, NextResponse } from "next/server";
import { verifyAccessToken, type AccessTokenClaims } from "@o/auth/session";
import { eq, and } from "drizzle-orm";
import { getDb } from "@o/db/client";
import { people, orgs, type Person, type Org } from "@o/db/schema";
import { errors, isAppError } from "@o/errors";
import { logger } from "@o/logger";
import { httpMetrics } from "@o/obs";

export interface AuthedContext {
  req: NextRequest;
  person: Person;
  org: Org;
  claims: AccessTokenClaims;
  /** Per-request id. */
  requestId: string;
}

const PUBLIC_PATHS = new Set([
  "/api/health",
  "/api/auth/login",
  "/api/auth/register",
  "/api/auth/verify-email",
  "/api/auth/forgot-password",
  "/api/auth/reset-password",
  "/api/auth/refresh",
  "/api/webhooks/stripe",
  "/api/webhooks/resend",
]);

export function withAuth<T = unknown>(
  handler: (ctx: AuthedContext, params: { req: NextRequest; body: T }) => Promise<Response>,
  opts: { publicRoute?: boolean } = {},
) {
  return async (req: NextRequest, ctx: { params: Promise<Record<string, string>> }) => {
    const requestId = req.headers.get("x-request-id") ?? crypto.randomUUID();
    const start = Date.now();
    let status = 200;
    try {
      // Public routes skip auth
      const url = new URL(req.url);
      if (PUBLIC_PATHS.has(url.pathname) || opts.publicRoute) {
        const response = await handler(
          // Cast — public handlers don't get a real context
          { req, person: null as unknown as Person, org: null as unknown as Org, claims: null as unknown as AccessTokenClaims, requestId },
          { req, body: undefined as unknown as T },
        );
        status = response.status;
        return response;
      }

      // Auth
      const auth = req.headers.get("authorization");
      if (!auth || !auth.startsWith("Bearer ")) {
        throw errors.unauthorized("Missing bearer token");
      }
      const token = auth.slice("Bearer ".length);

      // STRESS_TEST_BYPASS: in dev/staging, allow a stress-test mode
      // where the bearer token is a known string ("stress") and a
      // header resolves a synthetic person. NEVER enabled in production.
      // This is how the @o/stress package exercises authed endpoints
      // without needing real user credentials.
      if (
        process.env.NODE_ENV !== "production" &&
        process.env.STRESS_TEST_BYPASS === "true" &&
        token === "stress"
      ) {
        const syntheticPersonId = req.headers.get("x-stress-person") ?? "person_stress";
        const syntheticOrgId = req.headers.get("x-stress-org") ?? "org_stress";
        const db = getDb();
        const [person] = await db.select().from(people).where(eq(people.id, syntheticPersonId)).limit(1);
        const [org] = await db.select().from(orgs).where(eq(orgs.id, syntheticOrgId)).limit(1);
        if (person && org) {
          const body = await safeReadBody<T>(req);
          return handler({ req, person, org, claims: { sub: person.id, org: org.id, role: person.role, email: person.email }, requestId }, { req, body });
        }
        // No synthetic person in DB; create one on the fly
        // (only in non-prod). This is a dev convenience.
        const [newPerson] = await db.insert(people).values({
          id: syntheticPersonId,
          orgId: syntheticOrgId,
          email: `${syntheticPersonId}@stress.test`,
          name: "Stress Test",
          role: "owner",
          status: "active",
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        }).onConflictDoNothing().returning();
        const [newOrg] = await db.insert(orgs).values({
          id: syntheticOrgId,
          name: "Stress Test Org",
          subdomain: `stress-${Date.now()}`,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        }).onConflictDoNothing().returning();
        const body = await safeReadBody<T>(req);
        return handler(
          { req, person: newPerson ?? person!, org: newOrg ?? org!, claims: { sub: syntheticPersonId, org: syntheticOrgId, role: "owner", email: "stress@test" }, requestId },
          { req, body },
        );
      }

      const claims = await verifyAccessToken(token);
      if (!claims) throw errors.unauthorized("Invalid or expired token");

      // Load actor
      const db = getDb();
      const [person] = await db.select().from(people).where(eq(people.id, claims.sub)).limit(1);
      if (!person) throw errors.unauthorized("User not found");
      if (person.status === "deactivated") throw errors.forbidden("Account deactivated");
      const [org] = await db.select().from(orgs).where(eq(orgs.id, claims.org)).limit(1);
      if (!org) throw errors.forbidden("Organization not found");

      // Update lastSeenAt (fire-and-forget)
      db.update(people).set({ lastSeenAt: new Date() }).where(eq(people.id, person.id))
        .then(() => {}).catch(() => {});

      const body = await safeReadBody<T>(req);
      const response = await handler({ req, person, org, claims, requestId }, { req, body });
      status = response.status;
      return response;
    } catch (e) {
      if (isAppError(e)) {
        status = e.status;
        return NextResponse.json(e.toJSON(), { status: e.status });
      }
      logger.error("api.unhandled", { err: e instanceof Error ? e.message : String(e), path: req.nextUrl.pathname });
      status = 500;
      return NextResponse.json({ error: { code: "SRV_001", message: "Internal server error" } }, { status: 500 });
    } finally {
      const duration = Date.now() - start;
      httpMetrics({
        method: req.method,
        route: req.nextUrl.pathname,
        status,
        durationMs: duration,
        requestId,
      });
    }
  };
}

async function safeReadBody<T>(req: NextRequest): Promise<T> {
  if (req.method === "GET" || req.method === "HEAD") return undefined as unknown as T;
  const ct = req.headers.get("content-type") ?? "";
  if (ct.includes("application/json")) {
    try { return await req.json() as T; } catch { return undefined as unknown as T; }
  }
  return undefined as unknown as T;
}

// =============================================================================
// @o/auth — requireRole middleware
// =============================================================================
// The withAuth middleware checks "is the request authenticated?"
// requireRole checks "is the request authenticated AND does the user
// have the required role?"
//
// Used to gate owner-only and admin-only operations. Per the trust
// model, every external side effect must pass through a sanctioned
// path. This is the sanctioned path for owner/admin operations.

import { NextResponse } from "next/server";
import { errors } from "@o/errors";
import { withAuth, type AuthedContext } from "./session";
import { logger } from "@o/logger";
import { roleHasPermission, ROLE_PERMISSIONS, type Role } from "./permissions";

export type { Role };

/** Roles that satisfy a "min role" check, in increasing privilege. */
export { ROLE_LEVEL as ROLE_LEVEL_FOR_COMPAT } from "./permissions";

/**
 * Wraps a handler that requires a minimum role level.
 * Returns 403 if the actor's role is below the required level.
 *
 *   export const POST_transfer_ownership = requireRole("admin", async (ctx) => { ... });
 */
export function requireRole<T = unknown>(
  minRole: Role,
  handler: (ctx: AuthedContext, args: { req: Request; body: T }) => Promise<Response>,
) {
  return withAuth(async (ctx, args) => {
    const requiredLevel = ROLE_LEVEL_FOR_COMPAT[minRole];
    const actorLevel = ROLE_LEVEL_FOR_COMPAT[ctx.person.role as Role] ?? 0;
    if (actorLevel < requiredLevel) {
      logger.warn("authz.role_denied", {
        actorId: ctx.person.id,
        actorRole: ctx.person.role,
        requiredRole: minRole,
        orgId: ctx.org.id,
        path: ctx.req.nextUrl.pathname,
      });
      return NextResponse.json(
        {
          error: {
            code: "FORBIDDEN",
            message: `This action requires the ${minRole} role.`,
          },
        },
        { status: 403 },
      );
    }
    return handler(ctx, args);
  });
}

/**
 * Wraps a handler that requires a specific permission string.
 * Used for fine-grained RBAC. The role→permissions map is in
 * permissions.ts. Owner and admin get a wildcard. Other roles
 * get explicit grants.
 *
 *   export const GET_contact = withAuth(async (ctx) => {
 *     requirePermission(ctx.person, "crm:read");
 *     // ...
 *   });
 */
export function requirePermission(
  person: { id: string; role: string; extraPermissions?: string[] | null },
  permission: string,
): void {
  // Owner can do anything
  if (person.role === "owner") return;

  // Per-person overrides: if the person has extraPermissions set
  // and one of them matches, allow. This is a TODO for the
  // permissions table that adds a per-person grant store.
  if (person.extraPermissions?.includes(permission)) return;

  // Standard role grant
  if (!roleHasPermission(person.role as Role, permission)) {
    throw errors.forbidden(`Missing permission: ${permission}`);
  }
}

// Re-export the role→permissions map for any caller that needs it.
export { ROLE_PERMISSIONS };

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

export type Role = "owner" | "admin" | "manager" | "operator" | "client" | "guest";

/** Roles that satisfy a "min role" check, in increasing privilege. */
const ROLE_LEVEL: Record<Role, number> = {
  guest: 0,
  client: 1,
  operator: 2,
  manager: 3,
  admin: 4,
  owner: 5,
};

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
    const actorLevel = ROLE_LEVEL[ctx.person.role as Role] ?? 0;
    const requiredLevel = ROLE_LEVEL[minRole];
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
 * For now this just maps to role levels, but the schema has a
 * permissions table reserved for fine-grained RBAC. The hook
 * is here so we can add per-permission checks without changing
 * the route signatures.
 */
export function requirePermission(
  person: { id: string; role: string; extraPermissions?: string[] | null },
  permission: string,
): void {
  // Owner can do anything
  if (person.role === "owner") return;

  // TODO: when we add the permissions table, check person.extraPermissions
  // For now, map common permissions to roles
  const rolePermissions: Record<string, string[]> = {
    admin: ["*"],
    manager: ["crm:read", "crm:write", "projects:read", "projects:write", "invoices:read", "invoices:write", "contacts:read", "contacts:write"],
    operator: ["crm:read", "projects:read", "projects:write", "contacts:read", "time:write"],
    client: [],
    guest: [],
  };

  const perms = rolePermissions[person.role] ?? [];
  if (perms.includes("*")) return;
  if (perms.includes(permission)) return;

  throw errors.forbidden(`Missing permission: ${permission}`);
}

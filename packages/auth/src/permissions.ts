// =============================================================================
// @o/auth — role-to-permission mapping
// =============================================================================
// One source of truth for "what can this role do?" The map is
// intentionally flat: each role has an explicit list of
// permissions. Adding a new permission is a one-line change here
// + a check at the route. There's no inheritance hierarchy
// because hidden hierarchies cause surprise (a manager
// shouldn't inherit "everything the operator can do" without
// us saying so explicitly).
//
// HISTORY: this map used to have both `crm:*` and `contacts:*`
// permissions, and the routes checked `contacts:*` for some
// things and `crm:*` for others. The operator role had
// `crm:read` but not `contacts:read`, which meant the operator
// could read companies (crm:read) but not contacts (contacts:
// read), which is broken for a tool whose job is to surface
// contact-driven drafts. The half-defined state was a P1 in
// the limits pass (P1-3).
//
// THIS FILE standardizes on `crm:*` because:
//   1. The CRM is the surface — contacts, companies, deals
//      all live there
//   2. The `contacts:*` shape is a leftover from when
//      contacts were a separate module
//   3. The operator needs read access to function, and
//      `crm:read` is the more semantically correct grant
//
// MIGRATION: routes that checked `contacts:read` now check
// `crm:read`. The role grants are updated to use the
// unified shape. No data migration is needed (permissions
// are not stored in the DB; they're hardcoded here).

export type Role = "owner" | "admin" | "manager" | "operator" | "client" | "guest";

/** Roles that satisfy a "min role" check, in increasing privilege. */
export const ROLE_LEVEL: Record<Role, number> = {
  guest: 0,
  client: 1,
  operator: 2,
  manager: 3,
  admin: 4,
  owner: 5,
};

/**
 * The role→permissions map. The single source of truth.
 *
 * Permissions follow a `<resource>:<action>` shape:
 *   crm:read          - list/read contacts, companies, deals
 *   crm:write         - create/update contacts, companies, deals
 *   crm:delete        - delete (or soft-delete) any of the above
 *   projects:read     - list/read projects
 *   projects:write    - create/update projects
 *   invoices:read     - list/read invoices
 *   invoices:write    - create/update invoices, send
 *   invoices:refund   - issue refunds
 *   tickets:read      - list/read tickets
 *   tickets:write     - reply to / resolve tickets
 *   people:read       - list/read people in the org
 *   people:write      - invite / update people
 *   people:admin      - role changes, deactivation
 *   billing:portal    - access the Stripe customer portal
 *   photos:upload     - upload photos
 *   photos:process    - trigger photo processing
 *   org:write         - update org settings
 *   audit:read        - read the audit log
 *
 * The wildcard `*` matches anything. Owner has it. Admin
 * has it. Manager has the explicit list they need; not
 * the wildcard.
 */
export const ROLE_PERMISSIONS: Record<Role, string[]> = {
  owner:   ["*"],
  admin:   ["*"],
  manager: [
    "crm:read", "crm:write", "crm:delete",
    "projects:read", "projects:write",
    "invoices:read", "invoices:write", "invoices:refund", "invoices:send",
    "tickets:read", "tickets:write", "support:respond",
    "people:read", "people:write", "people:admin",
    "photos:upload", "photos:process",
    "audit:read",
    "org:write", "org:transfer_ownership",
  ],
  operator: [
    // The operator is the digital employee. It needs to read
    // the CRM to draft, but it doesn't write to the CRM
    // directly. The operator writes via the drafts it creates,
    // which require human approval.
    "crm:read",
    "projects:read", "projects:write",
    "tickets:read", "tickets:write", "support:respond",
    "invoices:read",
    "photos:upload", "photos:process",
  ],
  client: [
    // The client portal. Read-only on the org's data they
    // can see (their own projects, their own invoices).
    "invoices:read",
    "projects:read",
    "photos:upload",
  ],
  guest: [],
};

/**
 * Returns true if the role has the given permission.
 * Wildcard ("*") matches anything.
 */
export function roleHasPermission(role: Role, permission: string): boolean {
  const perms = ROLE_PERMISSIONS[role] ?? [];
  if (perms.includes("*")) return true;
  return perms.includes(permission);
}

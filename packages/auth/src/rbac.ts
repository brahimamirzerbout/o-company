// =============================================================================
// o.company · role-based access control
// =============================================================================
// Single source of truth for "can this person do this thing?" Every app
// calls `can(person, permission)` and gets a boolean. There is no per-app
// auth logic — that was the biggest source of bugs in our previous lives.

import { ROLE_PERMISSIONS, type Permission, type Role, type Person } from "@o/types";

export interface AuthContext {
  /** The person making the request. */
  person: Person;
  /** Optional: the org they're acting on behalf of. */
  orgId: string;
}

/** Check whether a person has a permission. */
export function can(person: Person, permission: Permission): boolean {
  const granted = ROLE_PERMISSIONS[person.role];
  if (granted.includes(permission)) return true;
  if (person.extraPermissions?.includes(permission)) return true;
  return false;
}

/** Check that a person has ALL of the given permissions. */
export function canAll(person: Person, ...permissions: Permission[]): boolean {
  return permissions.every((p) => can(person, p));
}

/** Check that a person has ANY of the given permissions. */
export function canAny(person: Person, ...permissions: Permission[]): boolean {
  return permissions.some((p) => can(person, p));
}

/**
 * Throws if the person doesn't have the permission. Use in API handlers:
 *
 *   const person = await requirePerson();
 *   requirePermission(person, "invoices:write");
 *   // …continue with authorized request
 */
export class PermissionDeniedError extends Error {
  constructor(public permission: Permission) {
    super(`Missing permission: ${permission}`);
    this.name = "PermissionDeniedError";
  }
}

export function requirePermission(person: Person, permission: Permission): void {
  if (!can(person, permission)) throw new PermissionDeniedError(permission);
}

/** Whether a person is "internal" (works for the company) or "external" (client/guest). */
export function isInternal(person: Person): boolean {
  return ["owner", "admin", "manager", "operator"].includes(person.role);
}

export function isOwner(person: Person): boolean {
  return person.role === "owner";
}

export function isAdminOrAbove(person: Person): boolean {
  return ["owner", "admin"].includes(person.role);
}

export function isManagerOrAbove(person: Person): boolean {
  return ["owner", "admin", "manager"].includes(person.role);
}

/** Build a human-readable role label. */
export function roleLabel(role: Role): string {
  return {
    owner:    "Owner",
    admin:    "Administrator",
    manager:  "Manager",
    operator: "Operator",
    client:   "Client",
    guest:    "Guest",
  }[role];
}

/** "Department at a glance" — for org chart displays. */
export function hierarchyLabel(person: Person): string {
  return [person.title, roleLabel(person.role)].filter(Boolean).join(" · ");
}

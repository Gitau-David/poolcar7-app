// Single source of truth for who can do what. Pure TypeScript (no server
// imports), so the same table drives the sidebar in the browser AND the
// guard on every API route on the server — the two can never drift apart.
//
//   Fleet Manager    — keeps vehicles available, compliant and in good condition
//   Operations Lead  — keeps trips running: approves, allocates, reassigns, manages drivers
//   IT Admin         — platform owner: all of the above, plus users, audit, settings

export const ROLES = ["user", "fleet_manager", "operations_lead", "it_admin"] as const;
export type Role = (typeof ROLES)[number];

export const BACK_OFFICE_ROLES = ["fleet_manager", "operations_lead", "it_admin"] as const;
export type BackOfficeRole = (typeof BACK_OFFICE_ROLES)[number];

export type Permission =
  | "fleet:write" // add/edit vehicles, assign default driver, mark unavailable
  | "fleet:maintenance" // schedule maintenance, fuel logs, insurance/inspection records
  | "fleet:reports" // vehicle usage reports
  | "trips:allocate" // approve/deny, allocate, complete early, cancel approved trips
  | "trips:reassign" // move an approved trip to another vehicle/driver
  | "drivers:manage" // add/remove/restore drivers, relay driver notices
  | "ops:reports" // operational performance reports
  | "users:manage" // create accounts, assign roles, reset PINs, enable/disable
  | "audit:view" // full activity log
  | "settings:manage"; // system settings, module toggles

const GRANTS: Record<Role, readonly Permission[]> = {
  user: [],
  fleet_manager: ["fleet:write", "fleet:maintenance", "fleet:reports"],
  operations_lead: ["trips:allocate", "trips:reassign", "drivers:manage", "ops:reports", "fleet:reports"],
  it_admin: [
    "fleet:write",
    "fleet:maintenance",
    "fleet:reports",
    "trips:allocate",
    "trips:reassign",
    "drivers:manage",
    "ops:reports",
    "users:manage",
    "audit:view",
    "settings:manage",
  ],
};

export function can(role: Role | null | undefined, permission: Permission): boolean {
  return !!role && GRANTS[role].includes(permission);
}

export function isBackOffice(role: Role | null | undefined): role is BackOfficeRole {
  return !!role && (BACK_OFFICE_ROLES as readonly string[]).includes(role);
}

export const ROLE_LABEL: Record<Role, string> = {
  user: "Staff",
  fleet_manager: "Fleet Manager",
  operations_lead: "Operations Lead",
  it_admin: "IT Admin",
};

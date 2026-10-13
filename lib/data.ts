import { supabase } from "./supabase";
import { hashPin } from "./session";
import type {
  Vehicle,
  Driver,
  Requisition,
  Role,
  AdminUser,
  ActivityLogEntry,
  Message,
  DirectoryUser,
  Notification,
  VehicleOverride,
  MaintenanceRecord,
  MaintenanceKind,
  FuelLog,
  AppSettings,
  ComplianceAlert,
  FleetUsageRow,
  OpsReport,
} from "./types";
import { computeStatus } from "./types";
import { BACK_OFFICE_ROLES, ROLES } from "./permissions";

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Attach the computed status field to a raw requisitions row (see computeStatus in lib/types.ts). */
function withStatus(row: any): Requisition {
  return {
    ...row,
    status: computeStatus({
      vehicleId: row.vehicle_id,
      startDate: row.start_date,
      endDate: row.end_date,
      deniedAt: row.denied_at,
      cancelledAt: row.cancelled_at,
      completedAt: row.completed_at,
    }),
  };
}

// ---------------- accounts ----------------
// Every back-office account (Fleet Manager, Operations Lead, IT Admin) has
// its own PIN (hashed) in the `users` table — see lib/session.ts hashPin().
// Staff ("user") sign in with just a name. Deactivated accounts never match.
function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, "\\$&");
}

export async function findPrivilegedByName(name: string): Promise<AdminUser | null> {
  const { data, error } = await supabase
    .from("users")
    .select("*")
    .in("role", [...BACK_OFFICE_ROLES])
    .eq("active", true)
    .ilike("name", escapeLike(name.trim()))
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data as AdminUser) ?? null;
}

/**
 * Re-checks a name + PIN against the database — used as a step-up
 * confirmation for actions that reverse a decision someone already relied
 * on (completing early, cancelling an approval, reapproving a denial,
 * reassigning). Being logged in isn't enough on its own for these; the
 * person has to prove their credentials again for this specific action.
 */
export async function verifyAdminCredentials(name: string, pin: string): Promise<AdminUser | null> {
  const admin = await findPrivilegedByName(name);
  if (!admin) return null;
  return hashPin(pin) === admin.pin_hash ? admin : null;
}

const USER_COLS = "id,name,role,last_login,created_at,active";

/** IT Admin: every account of every role. pin_hash is never selected. */
export async function listUsers(): Promise<DirectoryUser[]> {
  const { data, error } = await supabase.from("users").select(USER_COLS).order("role").order("name");
  if (error) throw new Error(error.message);
  return data as DirectoryUser[];
}

export async function createUser(
  name: string,
  role: Role,
  pin: string | undefined,
  actor: Actor | null
): Promise<{ ok: boolean; reason?: string; user?: DirectoryUser }> {
  const cleanName = name.trim();
  if (!cleanName) return { ok: false, reason: "Name is required" };
  if (!(ROLES as readonly string[]).includes(role)) return { ok: false, reason: "Unknown role" };
  if (role !== "user" && (!pin || pin.trim().length < 4)) {
    return { ok: false, reason: "Back-office accounts need a PIN of at least 4 characters" };
  }
  const { data, error } = await supabase
    .from("users")
    .insert({ name: cleanName, role, pin_hash: role === "user" ? null : hashPin(pin!.trim()) })
    .select(USER_COLS)
    .single();
  if (error) {
    if (error.code === "23505") return { ok: false, reason: `An account named "${cleanName}" already exists` };
    throw new Error(error.message);
  }
  await logAs(null, actor, "user_created", { name: cleanName, role });
  return { ok: true, user: data as DirectoryUser };
}

/**
 * Change someone's role, enable/disable them, or reset their PIN. Takes
 * effect immediately: guard() re-reads back-office accounts from the
 * database on every request, so a disabled or demoted account loses access
 * on its next click rather than when its 8-hour token runs out.
 */
export async function updateUser(
  id: number,
  patch: { role?: Role; active?: boolean; pin?: string },
  actor: Actor | null
): Promise<{ ok: boolean; reason?: string; user?: DirectoryUser }> {
  const { data: target, error: findErr } = await supabase.from("users").select("*").eq("id", id).maybeSingle();
  if (findErr) throw new Error(findErr.message);
  if (!target) return { ok: false, reason: "No such account" };

  const update: Record<string, unknown> = {};
  const changes: string[] = [];
  const newRole = patch.role ?? target.role;
  const newActive = patch.active ?? target.active;

  if (patch.role && patch.role !== target.role) {
    if (!(ROLES as readonly string[]).includes(patch.role)) return { ok: false, reason: "Unknown role" };
    update.role = patch.role;
    changes.push(`role ${target.role} → ${patch.role}`);
    if (patch.role === "user") update.pin_hash = null;
  }
  if (typeof patch.active === "boolean" && patch.active !== target.active) {
    update.active = patch.active;
    changes.push(patch.active ? "enabled" : "disabled");
  }
  if (patch.pin !== undefined) {
    if (newRole === "user") return { ok: false, reason: "Staff accounts don't use a PIN" };
    if (patch.pin.trim().length < 4) return { ok: false, reason: "PIN must be at least 4 characters" };
    update.pin_hash = hashPin(patch.pin.trim());
    changes.push("PIN reset");
  }
  if (newRole !== "user" && !update.pin_hash && !target.pin_hash) {
    return { ok: false, reason: "Set a PIN when promoting a staff account to a back-office role" };
  }

  // Never let the platform lose its last IT admin.
  const losesItAdmin =
    target.role === "it_admin" && target.active && (newRole !== "it_admin" || newActive === false);
  if (losesItAdmin) {
    const { count, error: countErr } = await supabase
      .from("users")
      .select("id", { count: "exact", head: true })
      .eq("role", "it_admin")
      .eq("active", true)
      .neq("id", id);
    if (countErr) throw new Error(countErr.message);
    if (!count) return { ok: false, reason: "This is the last active IT Admin — create another one first" };
  }

  if (changes.length === 0) return { ok: false, reason: "Nothing to change" };

  const { data, error } = await supabase.from("users").update(update).eq("id", id).select(USER_COLS).single();
  if (error) {
    if (error.code === "23505") return { ok: false, reason: "Another back-office account already uses that name" };
    throw new Error(error.message);
  }
  await logAs(null, actor, "user_updated", { id, name: target.name, changes });
  return { ok: true, user: data as DirectoryUser };
}

/** Who did something: name + the role they hold right now (never client-supplied). */
export type Actor = { name: string; role: Role };

export async function logActivity(
  requisitionId: number | null,
  actorRole: Role | "system",
  actorName: string | null,
  action: string,
  details?: unknown
) {
  const { error } = await supabase.from("activity_log").insert({
    requisition_id: requisitionId,
    actor_role: actorRole,
    actor_name: actorName,
    action,
    details: details ?? null,
  });
  if (error) console.error("logActivity failed:", error.message);
}

function logAs(requisitionId: number | null, actor: Actor | null, action: string, details?: unknown) {
  return logActivity(requisitionId, actor?.role ?? "system", actor?.name ?? null, action, details);
}

/** Admin Activity Log page — most recent first, with the related requisition's S.no/requester embedded. */
export async function listActivityLog(date?: string, limit = 500): Promise<ActivityLogEntry[]> {
  let query = supabase.from("activity_log").select("*, requisitions(sno, requester)");
  if (date) {
    // date is a plain YYYY-MM-DD from the UI's date picker — treat it as a
    // whole-day window in the server's local calendar.
    const start = `${date}T00:00:00.000Z`;
    const end = `${date}T23:59:59.999Z`;
    query = query.gte("created_at", start).lte("created_at", end);
  }
  const { data, error } = await query.order("created_at", { ascending: false }).limit(limit);
  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as ActivityLogEntry[];
}

export async function deleteActivityLogEntry(id: number): Promise<void> {
  const { error } = await supabase.from("activity_log").delete().eq("id", id);
  if (error) throw new Error(error.message);
}

// ---------------- vehicles ----------------
type OpenMaintenance = { vehicle_id: number; scheduled_for: string; expected_back: string | null };

async function openMaintenance(): Promise<OpenMaintenance[]> {
  const { data, error } = await supabase
    .from("maintenance")
    .select("vehicle_id, scheduled_for, expected_back")
    .is("completed_on", null)
    .is("cancelled_at", null);
  if (error) {
    // Table missing (schema not re-run yet) shouldn't take the whole dashboard down.
    console.error("openMaintenance failed:", error.message);
    return [];
  }
  return (data ?? []) as OpenMaintenance[];
}

/**
 * Does an open workshop job keep the vehicle off the road during [start, end]?
 * A job that's past its expected return but not marked complete still blocks —
 * the vehicle is physically still in the workshop until someone says otherwise.
 */
function maintBlocks(m: OpenMaintenance, start: string, end: string, today: string): boolean {
  const mEnd = m.expected_back ?? m.scheduled_for;
  const overdue = mEnd < today;
  return m.scheduled_for <= end && (overdue || mEnd >= start);
}

export async function listVehicles(activeOnly = true): Promise<Vehicle[]> {
  let query = supabase.from("vehicles").select("*").order("reg_no");
  if (activeOnly) query = query.eq("active", true);
  const [{ data, error }, maint] = await Promise.all([query, openMaintenance()]);
  if (error) throw new Error(error.message);
  const today = todayISO();
  const inWorkshop = new Set(maint.filter((m) => maintBlocks(m, today, today, today)).map((m) => m.vehicle_id));
  return (data ?? []).map((v: any) => ({
    ...v,
    unavailable_reason: v.status_override ?? (inWorkshop.has(v.id) ? "maintenance" : null),
  })) as Vehicle[];
}

export interface VehiclePatch {
  reg_no?: string;
  model?: string;
  insurance_expiry?: string | null;
  inspection_expiry?: string | null;
  odometer_km?: number | null;
  default_driver_id?: number | null;
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Validates + normalises a vehicle patch. Returns an error string or the clean column map. */
function cleanVehiclePatch(patch: VehiclePatch): { error: string } | { update: Record<string, unknown> } {
  const update: Record<string, unknown> = {};
  if (patch.reg_no !== undefined) {
    if (!patch.reg_no.trim()) return { error: "Reg. no can't be empty" };
    update.reg_no = patch.reg_no.trim();
  }
  if (patch.model !== undefined) {
    if (!patch.model.trim()) return { error: "Model can't be empty" };
    update.model = patch.model.trim();
  }
  for (const key of ["insurance_expiry", "inspection_expiry"] as const) {
    const v = patch[key];
    if (v === undefined) continue;
    if (v === null || v === "") update[key] = null;
    else if (!DATE_RE.test(v)) return { error: `${key.replace("_", " ")} must be a date` };
    else update[key] = v;
  }
  if (patch.odometer_km !== undefined) {
    if (patch.odometer_km !== null && (!Number.isFinite(patch.odometer_km) || patch.odometer_km < 0)) {
      return { error: "Odometer must be a positive number" };
    }
    update.odometer_km = patch.odometer_km === null ? null : Math.round(patch.odometer_km);
  }
  if (patch.default_driver_id !== undefined) update.default_driver_id = patch.default_driver_id || null;
  return { update };
}

export async function addVehicle(
  reg_no: string,
  model: string,
  actor: Actor | null,
  extra: Omit<VehiclePatch, "reg_no" | "model"> = {}
): Promise<{ ok: boolean; reason?: string; vehicle?: Vehicle }> {
  const cleaned = cleanVehiclePatch({ ...extra, reg_no, model });
  if ("error" in cleaned) return { ok: false, reason: cleaned.error };
  // Upsert on reg_no: adding back a previously-removed vehicle by the same
  // reg number reactivates it (and updates its model) instead of failing
  // on the unique constraint. Only the columns provided are touched.
  const { data, error } = await supabase
    .from("vehicles")
    .upsert({ ...cleaned.update, active: true }, { onConflict: "reg_no" })
    .select()
    .single();
  if (error) throw new Error(error.message);
  await logAs(null, actor, "vehicle_added", { reg_no: cleaned.update.reg_no, model: cleaned.update.model });
  return { ok: true, vehicle: data as Vehicle };
}

export async function updateVehicle(
  id: number,
  patch: VehiclePatch,
  actor: Actor | null
): Promise<{ ok: boolean; reason?: string; vehicle?: Vehicle }> {
  const cleaned = cleanVehiclePatch(patch);
  if ("error" in cleaned) return { ok: false, reason: cleaned.error };
  if (Object.keys(cleaned.update).length === 0) return { ok: false, reason: "Nothing to change" };
  const { data, error } = await supabase.from("vehicles").update(cleaned.update).eq("id", id).select().maybeSingle();
  if (error) {
    if (error.code === "23505") return { ok: false, reason: "Another vehicle already has that reg. no" };
    throw new Error(error.message);
  }
  if (!data) return { ok: false, reason: "Vehicle not found" };
  await logAs(null, actor, "vehicle_updated", { id, reg_no: data.reg_no, fields: Object.keys(cleaned.update) });
  return { ok: true, vehicle: data as Vehicle };
}

/** Trips that still hold this vehicle somewhere in [from, to]: allocated, not denied/cancelled/completed. */
async function allocatedTripsFor(vehicleId: number, from: string, to: string): Promise<Requisition[]> {
  const { data, error } = await supabase
    .from("requisitions")
    .select("*")
    .eq("vehicle_id", vehicleId)
    .is("denied_at", null)
    .is("cancelled_at", null)
    .is("completed_at", null)
    .lte("start_date", to)
    .gte("end_date", from)
    .order("start_date");
  if (error) throw new Error(error.message);
  return (data ?? []).map(withStatus);
}

/**
 * Fleet Manager: take a vehicle out of allocation (or put it back).
 * Planned reasons (maintenance / unavailable) are refused while the vehicle
 * still has trips — Operations has to move those first. A breakdown is the
 * exception: it can't wait, so it's always accepted, and every affected
 * requester is notified that Operations will reassign their trip.
 */
export async function setVehicleAvailability(
  id: number,
  override: VehicleOverride | null,
  note: string | undefined,
  actor: Actor | null
): Promise<{ ok: boolean; reason?: string; vehicle?: Vehicle; affected?: number[] }> {
  const { data: v, error: findErr } = await supabase.from("vehicles").select("*").eq("id", id).maybeSingle();
  if (findErr) throw new Error(findErr.message);
  if (!v) return { ok: false, reason: "Vehicle not found" };

  let affected: Requisition[] = [];
  if (override) {
    affected = await allocatedTripsFor(id, todayISO(), "9999-12-31");
    if (override !== "breakdown" && affected.length > 0) {
      const list = affected.map((r) => `#${r.sno}`).join(", ");
      return {
        ok: false,
        reason: `${v.reg_no} still has trip(s) ${list}. Ask Operations to reassign them first — or record it as a breakdown if it can't wait.`,
      };
    }
  }

  const { data, error } = await supabase
    .from("vehicles")
    .update({ status_override: override, override_note: override ? note?.trim() || null : null })
    .eq("id", id)
    .select()
    .single();
  if (error) throw new Error(error.message);

  await logAs(null, actor, override ? "vehicle_unavailable" : "vehicle_available", {
    id,
    reg_no: v.reg_no,
    override,
    note: note?.trim() || null,
    affected_trips: affected.map((r) => r.sno),
  });

  if (override === "breakdown") {
    for (const r of affected) {
      await notifyRequisitionPeople(
        r,
        `Vehicle ${v.reg_no} was reported broken down. Operations will reassign your trip #${r.sno} — you'll be notified.`
      );
    }
  }
  return { ok: true, vehicle: data as Vehicle, affected: affected.map((r) => r.sno) };
}

export async function restoreDriver(id: number, actor: Actor | null): Promise<Driver> {
  const { data, error } = await supabase.from("drivers").update({ active: true }).eq("id", id).select().single();
  if (error) throw new Error(error.message);
  await logAs(null, actor, "driver_restored", { id });
  return data as Driver;
}

export async function removeVehicle(
  id: number,
  actor: Actor | null
): Promise<{ ok: boolean; reason?: string }> {
  // "Scheduled or Active" == has this vehicle assigned, isn't denied/cancelled, and isn't over yet.
  // (Status isn't a DB column — see the note in db/schema.sql — so this is
  // the same check expressed directly as a date filter.)
  const { data: inUse, error: checkErr } = await supabase
    .from("requisitions")
    .select("id")
    .eq("vehicle_id", id)
    .is("cancelled_at", null)
    .is("completed_at", null)
    .gte("end_date", todayISO())
    .limit(1);
  if (checkErr) throw new Error(checkErr.message);
  if (inUse && inUse.length > 0) {
    return { ok: false, reason: "Vehicle has a scheduled or active trip" };
  }
  const { data: removed, error } = await supabase.from("vehicles").update({ active: false }).eq("id", id).select("id");
  if (error) throw new Error(error.message);
  if (!removed || removed.length === 0) return { ok: false, reason: "Vehicle not found" };
  await logAs(null, actor, "vehicle_removed", { id });
  return { ok: true };
}

// ---------------- drivers ----------------
export async function listDrivers(activeOnly = true): Promise<Driver[]> {
  let query = supabase.from("drivers").select("*").order("name");
  if (activeOnly) query = query.eq("active", true);
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return data as Driver[];
}

export async function addDriver(name: string, phone: string | undefined, actor: Actor | null): Promise<Driver> {
  const { data, error } = await supabase
    .from("drivers")
    .insert({ name, phone: phone ?? null })
    .select()
    .single();
  if (error) throw new Error(error.message);
  await logAs(null, actor, "driver_added", { name });
  return data as Driver;
}

export async function removeDriver(
  id: number,
  actor: Actor | null
): Promise<{ ok: boolean; reason?: string }> {
  const { data: inUse, error: checkErr } = await supabase
    .from("requisitions")
    .select("id")
    .eq("driver_id", id)
    .is("cancelled_at", null)
    .is("completed_at", null)
    .gte("end_date", todayISO())
    .limit(1);
  if (checkErr) throw new Error(checkErr.message);
  if (inUse && inUse.length > 0) {
    return { ok: false, reason: "Driver has a scheduled or active trip" };
  }
  const { data: removed, error } = await supabase.from("drivers").update({ active: false }).eq("id", id).select("id");
  if (error) throw new Error(error.message);
  if (!removed || removed.length === 0) return { ok: false, reason: "Driver not found" };
  await logAs(null, actor, "driver_removed", { id });
  return { ok: true };
}

// ---------------- requisitions ----------------
export async function listRequisitions(): Promise<Requisition[]> {
  const { data, error } = await supabase.from("requisitions").select("*").order("sno");
  if (error) throw new Error(error.message);
  return (data ?? []).map(withStatus);
}

export async function getRequisition(id: number): Promise<Requisition | undefined> {
  const { data, error } = await supabase.from("requisitions").select("*").eq("id", id).maybeSingle();
  if (error) throw new Error(error.message);
  return data ? withStatus(data) : undefined;
}

export interface NewRequisitionInput {
  requester: string;
  submittedBy: string;
  department: string;
  start_date: string;
  end_date: string;
  origin: string;
  destination: string;
  purpose?: string;
}

export async function createRequisition(input: NewRequisitionInput): Promise<Requisition> {
  const { submittedBy, ...rest } = input;
  // sno is an identity column, so Postgres assigns it automatically — we just insert.
  const { data, error } = await supabase
    .from("requisitions")
    .insert({ ...rest, submitted_by: submittedBy, purpose: input.purpose ?? null })
    .select()
    .single();
  if (error) throw new Error(error.message);
  const req = withStatus(data);
  await logActivity(req.id, "user", submittedBy, "submitted", { sno: req.sno });
  return req;
}

/**
 * The System's automatic availability check — mirrors the flowchart's "Checks availability" step.
 * A vehicle is offered only if it's active, not flagged unavailable by the Fleet Manager,
 * not in (or due in) the workshop for these dates, and not held by another trip.
 * `excludeReqId` lets a reassignment ignore the trip being moved, so its own current
 * vehicle/driver don't count as "busy" against itself.
 */
export async function availableFor(
  start: string,
  end: string,
  excludeReqId?: number
): Promise<{ vehicles: Vehicle[]; drivers: Driver[] }> {
  // Any requisition whose date range overlaps [start, end] holds its vehicle/driver busy —
  // unless that requisition was denied, cancelled, or already completed (returned early),
  // in which case it's not actually occupying anything for these dates anymore.
  let overlapQuery = supabase
    .from("requisitions")
    .select("vehicle_id, driver_id")
    .is("denied_at", null)
    .is("cancelled_at", null)
    .is("completed_at", null)
    .lte("start_date", end)
    .gte("end_date", start);
  if (excludeReqId) overlapQuery = overlapQuery.neq("id", excludeReqId);
  const { data: overlapping, error } = await overlapQuery;
  if (error) throw new Error(error.message);

  const busyVehicleIds = new Set((overlapping ?? []).map((r) => r.vehicle_id).filter(Boolean));
  const busyDriverIds = new Set((overlapping ?? []).map((r) => r.driver_id).filter(Boolean));

  const [vehicles, drivers, maint] = await Promise.all([listVehicles(), listDrivers(), openMaintenance()]);
  const today = todayISO();
  const inWorkshop = new Set(maint.filter((m) => maintBlocks(m, start, end, today)).map((m) => m.vehicle_id));
  return {
    vehicles: vehicles.filter((v) => !v.status_override && !inWorkshop.has(v.id) && !busyVehicleIds.has(v.id)),
    drivers: drivers.filter((d) => !busyDriverIds.has(d.id)),
  };
}

export async function allocate(
  reqId: number,
  vehicleId: number,
  driverId: number,
  actor: Actor | null
): Promise<{ ok: boolean; reason?: string; requisition?: Requisition }> {
  const req = await getRequisition(reqId);
  if (!req) return { ok: false, reason: "Requisition not found" };
  if (req.cancelled_at) return { ok: false, reason: "Requisition was cancelled" };
  if (req.denied_at) return { ok: false, reason: "Requisition was already denied" };
  if (req.vehicle_id !== null) return { ok: false, reason: "Already allocated" };

  // Final server-side conflict check — never trust the client's earlier read.
  const { vehicles, drivers } = await availableFor(req.start_date, req.end_date);
  if (!vehicles.some((v) => v.id === vehicleId)) {
    return { ok: false, reason: "Vehicle no longer available for these dates" };
  }
  if (!drivers.some((d) => d.id === driverId)) {
    return { ok: false, reason: "Driver no longer available for these dates" };
  }

  const { data, error } = await supabase
    .from("requisitions")
    .update({ vehicle_id: vehicleId, driver_id: driverId, allocated_at: new Date().toISOString() })
    .eq("id", reqId)
    .select()
    .single();
  if (error) throw new Error(error.message);

  await logAs(reqId, actor, "allocated", { vehicleId, driverId });
  return { ok: true, requisition: withStatus(data) };
}

export async function denyRequisition(
  reqId: number,
  reason: string | undefined,
  actor: Actor | null
): Promise<{ ok: boolean; reason?: string; requisition?: Requisition }> {
  const req = await getRequisition(reqId);
  if (!req) return { ok: false, reason: "Requisition not found" };
  if (req.cancelled_at) return { ok: false, reason: "Requisition was cancelled" };
  if (req.vehicle_id !== null) return { ok: false, reason: "Already allocated, cannot deny" };
  if (req.denied_at) return { ok: false, reason: "Already denied" };

  const { data, error } = await supabase
    .from("requisitions")
    .update({ denied_at: new Date().toISOString(), denial_reason: reason ?? null })
    .eq("id", reqId)
    .select()
    .single();
  if (error) throw new Error(error.message);

  await logAs(reqId, actor, "denied", { reason });
  return { ok: true, requisition: withStatus(data) };
}

/**
 * A staff member cancelling their own request. `submittedByName` is the
 * signed-in session's name, matched case-insensitively against the
 * requisition's `submitted_by` field (falling back to `requester` for rows
 * from before that column existed) — `requester` itself is editable free
 * text now, so it's no longer trusted for ownership. Admins/IT admins can
 * cancel any request (isAdmin = true); actorRole is recorded as-is in the
 * activity log so an IT admin's cancellation shows up as 'it_admin', not
 * a generic 'admin'.
 */
export async function cancelRequisition(
  reqId: number,
  submittedByName: string,
  isAdmin: boolean,
  actorRole: Role
): Promise<{ ok: boolean; reason?: string; requisition?: Requisition }> {
  const req = await getRequisition(reqId);
  if (!req) return { ok: false, reason: "Requisition not found" };
  const owner = (req.submitted_by || req.requester).trim().toLowerCase();
  if (!isAdmin && owner !== submittedByName.trim().toLowerCase()) {
    return { ok: false, reason: "You can only cancel your own requests" };
  }
  if (req.status !== "Pending Allocation" && req.status !== "Scheduled") {
    return { ok: false, reason: `Cannot cancel a request that is ${req.status}` };
  }

  const { data, error } = await supabase
    .from("requisitions")
    .update({ cancelled_at: new Date().toISOString() })
    .eq("id", reqId)
    .select()
    .single();
  if (error) throw new Error(error.message);

  await logActivity(reqId, actorRole, submittedByName, "cancelled", {});
  return { ok: true, requisition: withStatus(data) };
}

/**
 * Lets an admin close out a trip early — e.g. the vehicle came back ahead
 * of the original end_date — instead of waiting for end_date to pass.
 * Freeing it up here matters: availableFor() above excludes completed rows
 * from the busy check, so the vehicle/driver become allocatable again for
 * those dates immediately, not just once end_date arrives naturally.
 * Mirrors complete_requisition() in db/schema.sql.
 */
/**
 * Notifies whoever submitted a trip about an admin action taken on it after
 * the fact — mirrors notify_requisition_people() in db/schema.sql. Drivers
 * have no login of their own, so their name/phone ride along on the row for
 * whoever reads the notification to relay it.
 */
async function pushNotification(opts: {
  requisitionId: number | null;
  recipient: string;
  message: string;
  driverId?: number | null;
}): Promise<void> {
  let driverName: string | null = null;
  let driverPhone: string | null = null;
  if (opts.driverId) {
    const { data } = await supabase.from("drivers").select("name, phone").eq("id", opts.driverId).maybeSingle();
    if (data) {
      driverName = data.name;
      driverPhone = data.phone;
    }
  }
  const { error } = await supabase.from("notifications").insert({
    requisition_id: opts.requisitionId,
    recipient_name: opts.recipient,
    message: opts.message,
    driver_name: driverName,
    driver_phone: driverPhone,
  });
  if (error) console.error("pushNotification failed:", error.message);
}

async function notifyRequisitionPeople(req: Requisition, message: string): Promise<void> {
  await pushNotification({
    requisitionId: req.id,
    recipient: req.submitted_by || req.requester,
    message,
    driverId: req.driver_id,
  });
}

export async function listNotifications(recipientName: string, unreadOnly = false): Promise<Notification[]> {
  let query = supabase
    .from("notifications")
    .select("*")
    .ilike("recipient_name", recipientName.trim())
    .order("created_at", { ascending: false });
  if (unreadOnly) query = query.is("read_at", null);
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return (data ?? []) as Notification[];
}

/**
 * Admin-facing: every notification that has a driver attached, regardless
 * of who the requester was. Drivers have no login of their own, so this is
 * how an admin sees "who needs to be called" and relays it by phone —
 * driver_name/driver_phone ride along on the notification row for exactly
 * this purpose.
 */
export async function listDriverNotices(unreadOnly = false): Promise<Notification[]> {
  let query = supabase.from("notifications").select("*").not("driver_name", "is", null).order("created_at", {
    ascending: false,
  });
  if (unreadOnly) query = query.is("read_at", null);
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return (data ?? []) as Notification[];
}

export async function markNotificationRead(id: number): Promise<void> {
  const { error } = await supabase.from("notifications").update({ read_at: new Date().toISOString() }).eq("id", id);
  if (error) throw new Error(error.message);
}

export async function completeRequisition(
  reqId: number,
  actor: Actor | null
): Promise<{ ok: boolean; reason?: string; requisition?: Requisition }> {
  const req = await getRequisition(reqId);
  if (!req) return { ok: false, reason: "Requisition not found" };
  if (req.vehicle_id === null) return { ok: false, reason: "Not allocated yet" };
  if (req.denied_at) return { ok: false, reason: "This request was denied" };
  if (req.cancelled_at) return { ok: false, reason: "This request was cancelled" };
  if (req.completed_at) return { ok: false, reason: "Already completed" };

  const { data, error } = await supabase
    .from("requisitions")
    .update({ completed_at: new Date().toISOString() })
    .eq("id", reqId)
    .select()
    .single();
  if (error) throw new Error(error.message);

  await logAs(reqId, actor, "completed", {});
  const updated = withStatus(data);
  await notifyRequisitionPeople(updated, `Your trip #${updated.sno} was marked completed by ${actor?.name ?? "an admin"}.`);
  return { ok: true, requisition: updated };
}

/**
 * Admin overturning an approval that already happened — cancels a
 * Scheduled or Active trip. Distinct from cancelRequisition, which is the
 * requester cancelling their own still-unresolved request; this always
 * requires a reason, since it reverses a decision someone was counting on.
 */
export async function adminCancelRequisition(
  reqId: number,
  reason: string,
  actor: Actor | null
): Promise<{ ok: boolean; reason?: string; requisition?: Requisition }> {
  const req = await getRequisition(reqId);
  if (!req) return { ok: false, reason: "Requisition not found" };
  if (req.vehicle_id === null) return { ok: false, reason: "This request was never approved" };
  if (req.denied_at) return { ok: false, reason: "This request was denied" };
  if (req.cancelled_at) return { ok: false, reason: "Already cancelled" };
  if (req.completed_at) return { ok: false, reason: "Already completed" };

  const { data, error } = await supabase
    .from("requisitions")
    .update({ cancelled_at: new Date().toISOString(), cancellation_reason: reason })
    .eq("id", reqId)
    .select()
    .single();
  if (error) throw new Error(error.message);

  await logAs(reqId, actor, "admin_cancelled", { reason });
  const updated = withStatus(data);
  await notifyRequisitionPeople(
    updated,
    `Your approved trip #${updated.sno} was cancelled by ${actor?.name ?? "an admin"}. Reason: ${reason}`
  );
  return { ok: true, requisition: updated };
}

/**
 * Admin reversing an earlier denial and approving it after all. Runs the
 * same conflict checks as allocate() — the vehicle/driver still need to
 * actually be free for these dates, someone else may have taken them since.
 */
export async function reapproveRequisition(
  reqId: number,
  vehicleId: number,
  driverId: number,
  actor: Actor | null
): Promise<{ ok: boolean; reason?: string; requisition?: Requisition }> {
  const req = await getRequisition(reqId);
  if (!req) return { ok: false, reason: "Requisition not found" };
  if (!req.denied_at) return { ok: false, reason: "This request was never denied" };
  if (req.cancelled_at) return { ok: false, reason: "Already cancelled" };
  if (req.vehicle_id !== null) return { ok: false, reason: "Already allocated" };

  const { vehicles, drivers } = await availableFor(req.start_date, req.end_date);
  if (!vehicles.some((v) => v.id === vehicleId)) {
    return { ok: false, reason: "Vehicle no longer available for these dates" };
  }
  if (!drivers.some((d) => d.id === driverId)) {
    return { ok: false, reason: "Driver no longer available for these dates" };
  }

  const { data, error } = await supabase
    .from("requisitions")
    .update({
      vehicle_id: vehicleId,
      driver_id: driverId,
      allocated_at: new Date().toISOString(),
      denied_at: null,
      denial_reason: null,
    })
    .eq("id", reqId)
    .select()
    .single();
  if (error) throw new Error(error.message);

  await logAs(reqId, actor, "reapproved", { vehicleId, driverId });
  const updated = withStatus(data);
  await notifyRequisitionPeople(
    updated,
    `Your previously denied trip #${updated.sno} has been approved after all, by ${actor?.name ?? "an admin"}.`
  );
  return { ok: true, requisition: updated };
}

// ---------------- login tracking ----------------
// Records last_login for admins, and auto-registers + tracks staff on their
// first (and every) login — see record_login() in db/schema.sql. Best-effort:
// a failure here shouldn't block someone from actually signing in.
export async function recordLogin(name: string, role: Role): Promise<void> {
  const { error } = await supabase.rpc("record_login", { p_name: name, p_role: role });
  if (error) console.error("recordLogin failed:", error.message);
}

// ---------------- messages (shared chatroom) ----------------
export async function listMessages(limit = 200): Promise<Message[]> {
  const { data, error } = await supabase
    .from("messages")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw new Error(error.message);
  return ((data ?? []) as Message[]).reverse();
}

export async function sendMessage(senderName: string, senderRole: Role, body: string): Promise<Message> {
  const { data, error } = await supabase
    .from("messages")
    .insert({ sender_name: senderName, sender_role: senderRole, body: body.trim() })
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data as Message;
}

// ---------------- reassign (Operations Lead) ----------------
/**
 * Move an already-approved (Scheduled/Active) trip to a different vehicle
 * and/or driver — e.g. after a breakdown or a driver falling sick. Runs the
 * same conflict checks as allocate(), ignoring the trip itself. The
 * requester is told what changed, and if the driver changed, the actor is
 * handed a "relay this" notice for the driver being taken off the trip
 * (drivers have no login, so someone has to phone them).
 */
export async function reassignRequisition(
  reqId: number,
  vehicleId: number,
  driverId: number,
  reason: string,
  actor: Actor | null
): Promise<{ ok: boolean; reason?: string; requisition?: Requisition }> {
  const req = await getRequisition(reqId);
  if (!req) return { ok: false, reason: "Requisition not found" };
  if (req.status !== "Scheduled" && req.status !== "Active") {
    return { ok: false, reason: `Only Scheduled or Active trips can be reassigned (this one is ${req.status})` };
  }
  if (req.vehicle_id === vehicleId && req.driver_id === driverId) {
    return { ok: false, reason: "That is already this trip's vehicle and driver" };
  }

  const { vehicles, drivers } = await availableFor(req.start_date, req.end_date, reqId);
  if (!vehicles.some((v) => v.id === vehicleId)) {
    return { ok: false, reason: "Vehicle isn't available for these dates" };
  }
  if (!drivers.some((d) => d.id === driverId)) {
    return { ok: false, reason: "Driver isn't available for these dates" };
  }

  const [{ data: oldV }, { data: newV }, { data: oldD }, { data: newD }] = await Promise.all([
    supabase.from("vehicles").select("reg_no").eq("id", req.vehicle_id).maybeSingle(),
    supabase.from("vehicles").select("reg_no").eq("id", vehicleId).maybeSingle(),
    supabase.from("drivers").select("name").eq("id", req.driver_id).maybeSingle(),
    supabase.from("drivers").select("name").eq("id", driverId).maybeSingle(),
  ]);

  const { data, error } = await supabase
    .from("requisitions")
    .update({ vehicle_id: vehicleId, driver_id: driverId })
    .eq("id", reqId)
    .select()
    .single();
  if (error) throw new Error(error.message);

  await logAs(reqId, actor, "reassigned", {
    reason,
    from: { vehicleId: req.vehicle_id, driverId: req.driver_id },
    to: { vehicleId, driverId },
  });

  const updated = withStatus(data);
  await notifyRequisitionPeople(
    updated,
    `Your trip #${updated.sno} was reassigned by ${actor?.name ?? "an admin"}: now ${newV?.reg_no ?? "a new vehicle"} with ${
      newD?.name ?? "a new driver"
    } (was ${oldV?.reg_no ?? "—"} / ${oldD?.name ?? "—"}). Reason: ${reason}`
  );
  if (req.driver_id && req.driver_id !== driverId) {
    await pushNotification({
      requisitionId: reqId,
      recipient: actor?.name ?? updated.submitted_by ?? updated.requester,
      message: `Relay to ${oldD?.name ?? "the previous driver"}: trip #${updated.sno} has been reassigned — they are no longer on it.`,
      driverId: req.driver_id,
    });
  }
  return { ok: true, requisition: updated };
}

// ---------------- maintenance, fuel, compliance (Fleet Manager) ----------------
const MAINTENANCE_KINDS: MaintenanceKind[] = ["service", "repair", "inspection", "insurance", "other"];

export async function listMaintenance(): Promise<MaintenanceRecord[]> {
  const { data, error } = await supabase
    .from("maintenance")
    .select("*")
    .is("cancelled_at", null)
    .order("scheduled_for", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as MaintenanceRecord[];
}

export async function scheduleMaintenance(
  input: { vehicle_id: number; kind: string; scheduled_for: string; expected_back?: string | null; notes?: string },
  actor: Actor | null
): Promise<{ ok: boolean; reason?: string; record?: MaintenanceRecord }> {
  if (!MAINTENANCE_KINDS.includes(input.kind as MaintenanceKind)) return { ok: false, reason: "Unknown job type" };
  if (!DATE_RE.test(input.scheduled_for ?? "")) return { ok: false, reason: "Choose a date for the job" };
  const back = input.expected_back || null;
  if (back && !DATE_RE.test(back)) return { ok: false, reason: "Expected-back must be a date" };
  if (back && back < input.scheduled_for) return { ok: false, reason: "Expected back can't be before the start date" };

  const { data: v } = await supabase.from("vehicles").select("id, reg_no, active").eq("id", input.vehicle_id).maybeSingle();
  if (!v || !v.active) return { ok: false, reason: "Vehicle not found" };

  // A job that would take a vehicle off the road under an approved trip has to wait for Operations to move that trip.
  const conflicts = await allocatedTripsFor(v.id, input.scheduled_for, back ?? input.scheduled_for);
  if (conflicts.length > 0) {
    return {
      ok: false,
      reason: `${v.reg_no} is booked for trip(s) ${conflicts.map((r) => `#${r.sno}`).join(", ")} on those dates. Ask Operations to reassign first, or pick other dates.`,
    };
  }

  const { data, error } = await supabase
    .from("maintenance")
    .insert({
      vehicle_id: v.id,
      kind: input.kind,
      scheduled_for: input.scheduled_for,
      expected_back: back,
      notes: input.notes?.trim() || null,
      created_by: actor?.name ?? null,
    })
    .select()
    .single();
  if (error) throw new Error(error.message);
  await logAs(null, actor, "maintenance_scheduled", {
    reg_no: v.reg_no,
    kind: input.kind,
    scheduled_for: input.scheduled_for,
    expected_back: back,
  });
  return { ok: true, record: data as MaintenanceRecord };
}

/**
 * Close out a workshop job. For insurance/inspection jobs, passing `renewed_until`
 * also updates the vehicle's expiry date — "renews insurance, updates records"
 * in one step, which clears the compliance alert.
 */
export async function completeMaintenance(
  id: number,
  input: { cost?: number | null; completed_on?: string; renewed_until?: string | null },
  actor: Actor | null
): Promise<{ ok: boolean; reason?: string; record?: MaintenanceRecord }> {
  const { data: m } = await supabase.from("maintenance").select("*").eq("id", id).maybeSingle();
  if (!m || m.cancelled_at) return { ok: false, reason: "Job not found" };
  if (m.completed_on) return { ok: false, reason: "Already completed" };
  const doneOn = input.completed_on || todayISO();
  if (!DATE_RE.test(doneOn)) return { ok: false, reason: "Completed-on must be a date" };
  if (input.cost != null && (!Number.isFinite(input.cost) || input.cost < 0)) {
    return { ok: false, reason: "Cost must be a positive number" };
  }
  if (input.renewed_until && !DATE_RE.test(input.renewed_until)) {
    return { ok: false, reason: "Renewed-until must be a date" };
  }

  const { data, error } = await supabase
    .from("maintenance")
    .update({ completed_on: doneOn, cost: input.cost ?? null })
    .eq("id", id)
    .select()
    .single();
  if (error) throw new Error(error.message);

  if (input.renewed_until && (m.kind === "insurance" || m.kind === "inspection")) {
    const column = m.kind === "insurance" ? "insurance_expiry" : "inspection_expiry";
    await supabase.from("vehicles").update({ [column]: input.renewed_until }).eq("id", m.vehicle_id);
  }
  await logAs(null, actor, "maintenance_completed", {
    id,
    vehicle_id: m.vehicle_id,
    kind: m.kind,
    cost: input.cost ?? null,
    renewed_until: input.renewed_until ?? null,
  });
  return { ok: true, record: data as MaintenanceRecord };
}

export async function cancelMaintenance(id: number, actor: Actor | null): Promise<{ ok: boolean; reason?: string }> {
  const { data, error } = await supabase
    .from("maintenance")
    .update({ cancelled_at: new Date().toISOString() })
    .eq("id", id)
    .is("completed_on", null)
    .is("cancelled_at", null)
    .select("id, vehicle_id, kind")
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return { ok: false, reason: "Job not found, or already finished" };
  await logAs(null, actor, "maintenance_cancelled", { id, vehicle_id: data.vehicle_id, kind: data.kind });
  return { ok: true };
}

export async function listFuelLogs(limit = 200): Promise<FuelLog[]> {
  const { data, error } = await supabase
    .from("fuel_logs")
    .select("*")
    .order("logged_on", { ascending: false })
    .order("id", { ascending: false })
    .limit(limit);
  if (error) throw new Error(error.message);
  return (data ?? []) as FuelLog[];
}

export async function addFuelLog(
  input: { vehicle_id: number; litres: number; cost?: number | null; odometer_km?: number | null; logged_on?: string },
  actor: Actor | null
): Promise<{ ok: boolean; reason?: string; log?: FuelLog }> {
  if (!Number.isFinite(input.litres) || input.litres <= 0) return { ok: false, reason: "Litres must be more than 0" };
  if (input.cost != null && (!Number.isFinite(input.cost) || input.cost < 0)) {
    return { ok: false, reason: "Cost must be a positive number" };
  }
  if (input.odometer_km != null && (!Number.isFinite(input.odometer_km) || input.odometer_km < 0)) {
    return { ok: false, reason: "Odometer must be a positive number" };
  }
  const on = input.logged_on || todayISO();
  if (!DATE_RE.test(on)) return { ok: false, reason: "Date is invalid" };

  const { data: v } = await supabase.from("vehicles").select("id, reg_no, odometer_km").eq("id", input.vehicle_id).maybeSingle();
  if (!v) return { ok: false, reason: "Vehicle not found" };

  const { data, error } = await supabase
    .from("fuel_logs")
    .insert({
      vehicle_id: v.id,
      litres: input.litres,
      cost: input.cost ?? null,
      odometer_km: input.odometer_km != null ? Math.round(input.odometer_km) : null,
      logged_on: on,
      created_by: actor?.name ?? null,
    })
    .select()
    .single();
  if (error) throw new Error(error.message);

  // Keep the vehicle's current mileage in step with the highest reading logged.
  if (input.odometer_km != null && (v.odometer_km == null || input.odometer_km > v.odometer_km)) {
    await supabase.from("vehicles").update({ odometer_km: Math.round(input.odometer_km) }).eq("id", v.id);
  }
  await logAs(null, actor, "fuel_logged", { reg_no: v.reg_no, litres: input.litres, cost: input.cost ?? null });
  return { ok: true, log: data as FuelLog };
}

function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(to) - Date.parse(from)) / 86400000);
}
function addDays(date: string, n: number): string {
  return new Date(Date.parse(date) + n * 86400000).toISOString().slice(0, 10);
}
const round1 = (n: number) => Math.round(n * 10) / 10;
const round2 = (n: number) => Math.round(n * 100) / 100;

/** Expired or soon-to-expire insurance/inspection, plus workshop jobs about to start. Soonest first. */
export async function getComplianceAlerts(days?: number): Promise<ComplianceAlert[]> {
  const window = days ?? (await getSettings()).compliance_alert_days;
  const today = todayISO();
  const [vehicles, maint] = await Promise.all([listVehicles(), listMaintenance()]);
  const byId = new Map(vehicles.map((v) => [v.id, v]));
  const alerts: ComplianceAlert[] = [];

  for (const v of vehicles) {
    for (const [kind, due] of [
      ["insurance", v.insurance_expiry],
      ["inspection", v.inspection_expiry],
    ] as const) {
      if (!due) continue;
      const left = daysBetween(today, due);
      if (left <= window) {
        alerts.push({
          vehicle_id: v.id,
          reg_no: v.reg_no,
          model: v.model,
          kind,
          due_date: due,
          days_left: left,
          severity: left < 0 ? "expired" : "soon",
        });
      }
    }
  }
  for (const m of maint) {
    const v = byId.get(m.vehicle_id);
    if (!v || m.completed_on) continue;
    const left = daysBetween(today, m.scheduled_for);
    if (left <= window) {
      alerts.push({
        vehicle_id: v.id,
        reg_no: v.reg_no,
        model: v.model,
        kind: "maintenance",
        due_date: m.scheduled_for,
        days_left: left,
        severity: left < 0 ? "expired" : "soon",
      });
    }
  }
  return alerts.sort((a, b) => a.days_left - b.days_left);
}

// ---------------- reports ----------------
/** Per-vehicle usage over the last `days` days (including today). */
export async function getFleetUsageReport(days = 30): Promise<FleetUsageRow[]> {
  const today = todayISO();
  const periodStart = addDays(today, -(days - 1));
  const [vehicles, reqs, fuelRes, maintRes] = await Promise.all([
    listVehicles(),
    listRequisitions(),
    supabase
      .from("fuel_logs")
      .select("*")
      .gte("logged_on", periodStart)
      .lte("logged_on", today)
      .order("logged_on")
      .order("id"),
    supabase.from("maintenance").select("vehicle_id, cost, completed_on").gte("completed_on", periodStart).lte("completed_on", today),
  ]);
  if (fuelRes.error) throw new Error(fuelRes.error.message);
  if (maintRes.error) throw new Error(maintRes.error.message);
  const fuel = (fuelRes.data ?? []) as FuelLog[];
  const maint = (maintRes.data ?? []) as { vehicle_id: number; cost: number | null }[];

  return vehicles.map((v) => {
    let daysBooked = 0;
    let trips = 0;
    for (const r of reqs) {
      if (r.vehicle_id !== v.id || r.denied_at || r.cancelled_at) continue;
      const doneOn = r.completed_at ? r.completed_at.slice(0, 10) : null;
      const effEnd = doneOn && doneOn < r.end_date ? doneOn : r.end_date;
      const from = r.start_date > periodStart ? r.start_date : periodStart;
      const to = effEnd < today ? effEnd : today;
      if (to >= from) {
        daysBooked += daysBetween(from, to) + 1;
        trips++;
      }
    }
    daysBooked = Math.min(daysBooked, days);

    const logs = fuel.filter((f) => f.vehicle_id === v.id);
    const litres = logs.reduce((n, f) => n + Number(f.litres), 0);
    const fuelCost = logs.reduce((n, f) => n + Number(f.cost ?? 0), 0);
    const withOdo = logs.filter((f) => f.odometer_km != null);
    let kmLogged: number | null = null;
    let kmPerLitre: number | null = null;
    if (withOdo.length >= 2) {
      kmLogged = withOdo[withOdo.length - 1].odometer_km! - withOdo[0].odometer_km!;
      // Litres burned *getting* from the first reading to the last = everything logged after the first reading.
      const litresAfterFirst = withOdo.slice(1).reduce((n, f) => n + Number(f.litres), 0);
      if (kmLogged > 0 && litresAfterFirst > 0) kmPerLitre = round1(kmLogged / litresAfterFirst);
    }
    return {
      vehicle_id: v.id,
      reg_no: v.reg_no,
      model: v.model,
      trips,
      days_booked: daysBooked,
      utilisation_pct: Math.round((daysBooked / days) * 100),
      fuel_litres: round1(litres),
      fuel_cost: round2(fuelCost),
      maintenance_cost: round2(maint.filter((m) => m.vehicle_id === v.id).reduce((n, m) => n + Number(m.cost ?? 0), 0)),
      odometer_km: v.odometer_km,
      km_logged: kmLogged,
      km_per_litre: kmPerLitre,
      unavailable_reason: v.unavailable_reason ?? null,
    };
  });
}

/** Operations performance over the last `days` days: throughput, time-to-decision vs SLA, backlog. */
export async function getOpsReport(days = 30): Promise<OpsReport> {
  const today = todayISO();
  const periodStart = addDays(today, -(days - 1));
  const { sla_hours } = await getSettings();
  const reqs = await listRequisitions();
  const now = Date.now();
  const hours = (from: string, to: string | number) =>
    ((typeof to === "number" ? to : Date.parse(to)) - Date.parse(from)) / 3600000;

  const inPeriod = reqs.filter((r) => r.created_at.slice(0, 10) >= periodStart);
  const decided = inPeriod.filter((r) => r.allocated_at || r.denied_at);
  const turnaround = decided.map((r) => hours(r.created_at, (r.allocated_at ?? r.denied_at)!));

  const pending = reqs.filter((r) => r.status === "Pending Allocation");
  const overSla = pending
    .map((r) => ({ sno: r.sno, requester: r.requester, hours_waiting: round1(hours(r.created_at, now)) }))
    .filter((r) => r.hours_waiting > sla_hours)
    .sort((a, b) => b.hours_waiting - a.hours_waiting)
    .slice(0, 10);

  const { count: reassignments, error } = await supabase
    .from("activity_log")
    .select("id", { count: "exact", head: true })
    .eq("action", "reassigned")
    .gte("created_at", `${periodStart}T00:00:00.000Z`);
  if (error) throw new Error(error.message);

  const dept = new Map<string, { department: string; count: number }>();
  for (const r of inPeriod) {
    const key = r.department.trim().toLowerCase();
    const row = dept.get(key) ?? { department: r.department.trim(), count: 0 };
    row.count++;
    dept.set(key, row);
  }

  return {
    period_days: days,
    sla_hours,
    submitted: inPeriod.length,
    decided: decided.length,
    approved: inPeriod.filter((r) => r.allocated_at).length,
    denied: inPeriod.filter((r) => r.status === "Denied").length,
    cancelled: inPeriod.filter((r) => r.status === "Cancelled").length,
    pending_now: pending.length,
    pending_over_sla: overSla,
    avg_hours_to_decision: turnaround.length ? round1(turnaround.reduce((a, b) => a + b, 0) / turnaround.length) : null,
    sla_met_pct: turnaround.length
      ? Math.round((turnaround.filter((h) => h <= sla_hours).length / turnaround.length) * 100)
      : null,
    trips_active_now: reqs.filter((r) => r.status === "Active").length,
    reassignments: reassignments ?? 0,
    by_department: Array.from(...dept.values()).sort((a, b) => b.count - a.count).slice(0, 8),
  };
}

// ---------------- settings (IT Admin) ----------------
export const DEFAULT_SETTINGS: AppSettings = {
  compliance_alert_days: 14,
  sla_hours: 24,
  module_messages: true,
  module_maintenance: true,
};

/** Defaults fill any gap, so a missing settings table (schema not re-run yet) never breaks the app. */
export async function getSettings(): Promise<AppSettings> {
  const out: Record<string, unknown> = { ...DEFAULT_SETTINGS };
  const { data, error } = await supabase.from("settings").select("key, value");
  if (error) {
    console.error("getSettings failed:", error.message);
    return out as unknown as AppSettings;
  }
  for (const row of data ?? []) {
    const fallback = (DEFAULT_SETTINGS as unknown as Record<string, unknown>)[row.key];
    if (fallback !== undefined && typeof row.value === typeof fallback) out[row.key] = row.value;
  }
  return out as unknown as AppSettings;
}

export async function updateSettings(
  patch: Partial<AppSettings>,
  actor: Actor | null
): Promise<{ ok: boolean; reason?: string; settings?: AppSettings }> {
  const rows: { key: string; value: unknown; updated_by: string | null; updated_at: string }[] = [];
  for (const [key, value] of Object.entries(patch)) {
    const fallback = (DEFAULT_SETTINGS as unknown as Record<string, unknown>)[key];
    if (fallback === undefined) return { ok: false, reason: `Unknown setting: ${key}` };
    if (typeof value !== typeof fallback) return { ok: false, reason: `${key} has the wrong type` };
    if (key === "compliance_alert_days" && !(Number.isInteger(value) && (value as number) >= 1 && (value as number) <= 365)) {
      return { ok: false, reason: "Alert window must be 1–365 days" };
    }
    if (key === "sla_hours" && !(Number.isInteger(value) && (value as number) >= 1 && (value as number) <= 720)) {
      return { ok: false, reason: "SLA must be 1–720 hours" };
    }
    rows.push({ key, value, updated_by: actor?.name ?? null, updated_at: new Date().toISOString() });
  }
  if (rows.length === 0) return { ok: false, reason: "Nothing to change" };
  const { error } = await supabase.from("settings").upsert(rows, { onConflict: "key" });
  if (error) throw new Error(error.message);
  await logAs(null, actor, "settings_updated", Object.fromEntries(rows.map((r) => [r.key, r.value])));
  return { ok: true, settings: await getSettings() };
}

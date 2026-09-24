import { supabase } from "./supabase";
import { hashPin } from "./session";
import type { Vehicle, Driver, Requisition, Role, AdminUser, ActivityLogEntry, Message, DirectoryUser, Notification } from "./types";
import { computeStatus } from "./types";

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

// ---------------- admin accounts ----------------
// Each admin has their own PIN (hashed) stored in the `users` table, rather
// than one shared PIN — see lib/session.ts hashPin() for the hashing used.
// Covers both regular admins and the IT admin tier; the caller decides what
// to do with whichever role comes back. Excludes deactivated accounts.
export async function findAdminByName(name: string): Promise<AdminUser | null> {
  const { data, error } = await supabase
    .from("users")
    .select("*")
    .in("role", ["admin", "it_admin"])
    .eq("active", true)
    .ilike("name", name.trim())
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data as AdminUser) ?? null;
}

/**
 * Re-checks a name + PIN against the database — used as a step-up
 * confirmation for actions that reverse a decision someone already relied
 * on (completing early, cancelling an approval, reapproving a denial).
 * Being logged in as an admin isn't enough on its own for these; the admin
 * has to prove their credentials again for this specific action, the same
 * check login itself does. Returns the matched admin, or null if the name
 * has no active admin account or the PIN doesn't match.
 */
export async function verifyAdminCredentials(name: string, pin: string): Promise<AdminUser | null> {
  const admin = await findAdminByName(name);
  if (!admin) return null;
  return hashPin(pin) === admin.pin_hash ? admin : null;
}

/** IT Admin page: every admin + it_admin account, active or not. */
export async function listAdminAccounts(): Promise<DirectoryUser[]> {
  const { data, error } = await supabase
    .from("users")
    .select("id,name,role,last_login,created_at,active")
    .in("role", ["admin", "it_admin"])
    .order("role")
    .order("name");
  if (error) throw new Error(error.message);
  return data as DirectoryUser[];
}

export async function addAdmin(name: string, pinHash: string, actorName: string | null): Promise<AdminUser> {
  const { data, error } = await supabase
    .from("users")
    .insert({ name: name.trim(), role: "admin", pin_hash: pinHash })
    .select()
    .single();
  if (error) throw new Error(error.message);
  await logActivity(null, "it_admin", actorName, "admin_added", { name });
  return data as AdminUser;
}

/** Soft-deactivates a regular admin (never an it_admin) — mirrors remove_admin() in db/schema.sql. */
export async function removeAdmin(id: number, actorName: string | null): Promise<{ ok: boolean; reason?: string }> {
  const { data, error } = await supabase
    .from("users")
    .update({ active: false })
    .eq("id", id)
    .eq("role", "admin")
    .select()
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return { ok: false, reason: "No admin with that id" };
  await logActivity(null, "it_admin", actorName, "admin_removed", { id, name: data.name });
  return { ok: true };
}

/** IT Admin page's people directory — everyone who has ever logged in, any role. */
export async function listDirectory(): Promise<DirectoryUser[]> {
  const { data, error } = await supabase
    .from("users")
    .select("id,name,role,last_login,created_at,active")
    .order("role")
    .order("name");
  if (error) throw new Error(error.message);
  return data as DirectoryUser[];
}

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
export async function listVehicles(activeOnly = true): Promise<Vehicle[]> {
  let query = supabase.from("vehicles").select("*").order("reg_no");
  if (activeOnly) query = query.eq("active", true);
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return data as Vehicle[];
}

export async function addVehicle(reg_no: string, model: string, actorName: string | null): Promise<Vehicle> {
  // Upsert on reg_no: adding back a previously-removed vehicle by the same
  // reg number reactivates it (and updates its model) instead of failing
  // on the unique constraint.
  const { data, error } = await supabase
    .from("vehicles")
    .upsert({ reg_no, model, active: true }, { onConflict: "reg_no" })
    .select()
    .single();
  if (error) throw new Error(error.message);
  await logActivity(null, "admin", actorName, "vehicle_added", { reg_no, model });
  return data as Vehicle;
}

export async function restoreDriver(id: number, actorName: string | null): Promise<Driver> {
  const { data, error } = await supabase.from("drivers").update({ active: true }).eq("id", id).select().single();
  if (error) throw new Error(error.message);
  await logActivity(null, "admin", actorName, "driver_restored", { id });
  return data as Driver;
}

export async function removeVehicle(
  id: number,
  actorName: string | null
): Promise<{ ok: boolean; reason?: string }> {
  // "Scheduled or Active" == has this vehicle assigned, isn't denied/cancelled, and isn't over yet.
  // (Status isn't a DB column — see the note in db/schema.sql — so this is
  // the same check expressed directly as a date filter.)
  const { data: inUse, error: checkErr } = await supabase
    .from("requisitions")
    .select("id")
    .eq("vehicle_id", id)
    .is("cancelled_at", null)
    .gte("end_date", todayISO())
    .limit(1);
  if (checkErr) throw new Error(checkErr.message);
  if (inUse && inUse.length > 0) {
    return { ok: false, reason: "Vehicle has a scheduled or active trip" };
  }
  const { error } = await supabase.from("vehicles").update({ active: false }).eq("id", id);
  if (error) throw new Error(error.message);
  await logActivity(null, "admin", actorName, "vehicle_removed", { id });
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

export async function addDriver(name: string, phone: string | undefined, actorName: string | null): Promise<Driver> {
  const { data, error } = await supabase
    .from("drivers")
    .insert({ name, phone: phone ?? null })
    .select()
    .single();
  if (error) throw new Error(error.message);
  await logActivity(null, "admin", actorName, "driver_added", { name });
  return data as Driver;
}

export async function removeDriver(
  id: number,
  actorName: string | null
): Promise<{ ok: boolean; reason?: string }> {
  const { data: inUse, error: checkErr } = await supabase
    .from("requisitions")
    .select("id")
    .eq("driver_id", id)
    .is("cancelled_at", null)
    .gte("end_date", todayISO())
    .limit(1);
  if (checkErr) throw new Error(checkErr.message);
  if (inUse && inUse.length > 0) {
    return { ok: false, reason: "Driver has a scheduled or active trip" };
  }
  const { error } = await supabase.from("drivers").update({ active: false }).eq("id", id);
  if (error) throw new Error(error.message);
  await logActivity(null, "admin", actorName, "driver_removed", { id });
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

/** The System's automatic availability check — mirrors the flowchart's "Checks availability" step. */
export async function availableFor(
  start: string,
  end: string
): Promise<{ vehicles: Vehicle[]; drivers: Driver[] }> {
  // Any requisition whose date range overlaps [start, end] holds its vehicle/driver busy —
  // unless that requisition was denied, cancelled, or already completed (returned early),
  // in which case it's not actually occupying anything for these dates anymore.
  const { data: overlapping, error } = await supabase
    .from("requisitions")
    .select("vehicle_id, driver_id")
    .is("denied_at", null)
    .is("cancelled_at", null)
    .is("completed_at", null)
    .lte("start_date", end)
    .gte("end_date", start);
  if (error) throw new Error(error.message);

  const busyVehicleIds = new Set((overlapping ?? []).map((r) => r.vehicle_id).filter(Boolean));
  const busyDriverIds = new Set((overlapping ?? []).map((r) => r.driver_id).filter(Boolean));

  const [vehicles, drivers] = await Promise.all([listVehicles(), listDrivers()]);
  return {
    vehicles: vehicles.filter((v) => !busyVehicleIds.has(v.id)),
    drivers: drivers.filter((d) => !busyDriverIds.has(d.id)),
  };
}

export async function allocate(
  reqId: number,
  vehicleId: number,
  driverId: number,
  actorName: string | null
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

  await logActivity(reqId, "admin", actorName, "allocated", { vehicleId, driverId });
  return { ok: true, requisition: withStatus(data) };
}

export async function denyRequisition(
  reqId: number,
  reason: string | undefined,
  actorName: string | null
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

  await logActivity(reqId, "admin", actorName, "denied", { reason });
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
async function notifyRequisitionPeople(req: Requisition, message: string): Promise<void> {
  let driverName: string | null = null;
  let driverPhone: string | null = null;
  if (req.driver_id) {
    const { data } = await supabase.from("drivers").select("name, phone").eq("id", req.driver_id).maybeSingle();
    if (data) {
      driverName = data.name;
      driverPhone = data.phone;
    }
  }
  const { error } = await supabase.from("notifications").insert({
    requisition_id: req.id,
    recipient_name: req.submitted_by || req.requester,
    message,
    driver_name: driverName,
    driver_phone: driverPhone,
  });
  if (error) console.error("notifyRequisitionPeople failed:", error.message);
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
  actorName: string | null
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

  await logActivity(reqId, "admin", actorName, "completed", {});
  const updated = withStatus(data);
  await notifyRequisitionPeople(updated, `Your trip #${updated.sno} was marked completed by ${actorName ?? "an admin"}.`);
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
  actorName: string | null
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

  await logActivity(reqId, "admin", actorName, "admin_cancelled", { reason });
  const updated = withStatus(data);
  await notifyRequisitionPeople(
    updated,
    `Your approved trip #${updated.sno} was cancelled by ${actorName ?? "an admin"}. Reason: ${reason}`
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
  actorName: string | null
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

  await logActivity(reqId, "admin", actorName, "reapproved", { vehicleId, driverId });
  const updated = withStatus(data);
  await notifyRequisitionPeople(
    updated,
    `Your previously denied trip #${updated.sno} has been approved after all, by ${actorName ?? "an admin"}.`
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

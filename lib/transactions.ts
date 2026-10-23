import type { ActivityLogEntry, Driver, Notification, TransactionEvent, Vehicle } from "./types";

const ACTION_LABEL: Record<string, string> = {
  login: "Signed in",
  submitted: "Requisition submitted",
  allocated: "Vehicle allocated",
  reapproved: "Denied request approved after all",
  denied: "Request denied",
  cancelled: "Request cancelled",
  admin_cancelled: "Approved trip cancelled by admin",
  completed: "Trip marked completed",
  vehicle_added: "Vehicle added",
  vehicle_removed: "Vehicle removed",
  driver_added: "Driver added",
  driver_removed: "Driver removed",
  driver_restored: "Driver restored",
  admin_added: "Admin account added",
  admin_removed: "Admin account removed",
};

function describe(
  action: string,
  details: unknown,
  vehicles: Map<number, Vehicle>,
  drivers: Map<number, Driver>
): string | null {
  if (!details || typeof details !== "object") return null;
  const d = details as Record<string, unknown>;
  switch (action) {
    case "denied":
    case "admin_cancelled":
      return typeof d.reason === "string" && d.reason ? `Reason: ${d.reason}` : null;
    case "allocated":
    case "reapproved": {
      const v = vehicles.get(Number(d.vehicleId));
      const dr = drivers.get(Number(d.driverId));
      const parts = [v ? `${v.reg_no} (${v.model})` : null, dr ? dr.name : null].filter(Boolean);
      return parts.length ? parts.join(" · ") : null;
    }
    case "vehicle_added":
      return typeof d.reg_no === "string" ? `${d.reg_no}${d.model ? ` — ${d.model}` : ""}` : null;
    case "vehicle_removed": {
      const v = vehicles.get(Number(d.id));
      return v ? `${v.reg_no} (${v.model})` : null;
    }
    case "driver_removed":
    case "driver_restored": {
      const dr = drivers.get(Number(d.id));
      return dr ? dr.name : null;
    }
    case "driver_added":
    case "admin_added":
    case "admin_removed":
      return typeof d.name === "string" ? d.name : null;
    default:
      return null;
  }
}

/** Merges activity-log rows and notifications into one newest-first feed. */
export function buildEvents(opts: {
  me: string;
  activity: ActivityLogEntry[];
  notifications: Notification[];
  vehicles: Vehicle[];
  drivers: Driver[];
}): TransactionEvent[] {
  const me = opts.me.trim().toLowerCase();
  const vMap = new Map(opts.vehicles.map((v) => [v.id, v]));
  const dMap = new Map(opts.drivers.map((d) => [d.id, d]));
  const events: TransactionEvent[] = [];

  for (const e of opts.activity) {
    const mine = (e.actor_name ?? "").trim().toLowerCase() === me;
    // Other people's sign-ins are noise here — the IT Admin's Activity Log page covers those.
    if (e.action === "login" && !mine) continue;
    events.push({
      id: `a-${e.id}`,
      kind: "activity",
      at: e.created_at,
      actor: e.actor_name,
      mine,
      action: e.action,
      label: ACTION_LABEL[e.action] ?? e.action,
      detail: describe(e.action, e.details, vMap, dMap),
      tripLabel: e.requisitions ? `#${e.requisitions.sno} — ${e.requisitions.requester}` : null,
      driverName: null,
      driverPhone: null,
      unread: false,
    });
  }

  for (const n of opts.notifications) {
    events.push({
      id: `n-${n.id}`,
      kind: "notice",
      at: n.created_at,
      actor: null,
      mine: false,
      action: "notice",
      label: n.message,
      detail: null,
      tripLabel: null,
      driverName: n.driver_name,
      driverPhone: n.driver_phone,
      unread: !n.read_at,
    });
  }

  return events.sort((a, b) => b.at.localeCompare(a.at));
}

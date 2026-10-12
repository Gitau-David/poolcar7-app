import type {
  ActivityLogEntry,
  AppSettings,
  ComplianceAlert,
  DirectoryUser,
  Driver,
  FleetUsageRow,
  FuelLog,
  MaintenanceRecord,
  Message,
  Notification,
  OpsReport,
  Requisition,
  Role,
  Session,
  Vehicle,
  VehicleOverride,
} from "./types";

// The session token lives in sessionStorage, not a cookie — sessionStorage
// is isolated per browser tab (unlike cookies, which every tab shares), so
// logging in as a different person/role in another tab can't silently
// swap the session out from under this one. See lib/auth.ts for the
// server-side half of this.
const TOKEN_KEY = "poolcar_token";

function getToken(): string | null {
  if (typeof window === "undefined") return null;
  return sessionStorage.getItem(TOKEN_KEY);
}

function setToken(token: string) {
  sessionStorage.setItem(TOKEN_KEY, token);
}

function clearToken() {
  sessionStorage.removeItem(TOKEN_KEY);
}

function authHeaders(): HeadersInit {
  const token = getToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function json<T>(res: Response): Promise<T> {
  // Read as text first — calling res.json() directly throws a cryptic
  // "Unexpected end of JSON input" whenever a response body is empty (e.g.
  // a network hiccup, an aborted request, or a route that returned no
  // body), which is confusing to see as a user-facing error. Parsing text
  // ourselves lets us fail with a clear message instead.
  const text = await res.text();
  let body: any = {};
  if (text) {
    try {
      body = JSON.parse(text);
    } catch {
      body = { error: "The server sent back an unreadable response. Please try again." };
    }
  } else if (!res.ok) {
    body = { error: `Request failed (${res.status})` };
  }
  if (!res.ok) throw new Error(body.error || `Request failed (${res.status})`);
  return body as T;
}

export const api = {
  me: () => fetch("/api/auth/me", { headers: authHeaders() }).then((r) => json<{ session: Session | null }>(r)),

  login: async (role: "user" | "admin", name: string, pin?: string) => {
    const result = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role, name, pin }),
    }).then((r) => json<Session & { token: string }>(r));
    setToken(result.token);
    return result;
  },

  logout: async () => {
    clearToken();
    return fetch("/api/auth/logout", { method: "POST" }).then((r) => json<{ ok: true }>(r));
  },

  listRequisitions: () =>
    fetch("/api/requisitions", { headers: authHeaders() }).then((r) => json<{ requisitions: Requisition[] }>(r)),

  createRequisition: (input: {
    requester: string;
    department: string;
    start_date: string;
    end_date: string;
    origin: string;
    destination: string;
    purpose?: string;
  }) =>
    fetch("/api/requisitions", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeaders() },
      body: JSON.stringify(input),
    }).then((r) => json<{ requisition: Requisition }>(r)),

  availability: (start: string, end: string, excludeReq?: number) =>
    fetch(`/api/availability?start=${start}&end=${end}${excludeReq ? `&excludeReq=${excludeReq}` : ""}`, {
      headers: authHeaders(),
    }).then((r) =>
      json<{ vehicles: Vehicle[]; drivers: Driver[] }>(r)
    ),

  allocate: (reqId: number, vehicleId: number, driverId: number) =>
    fetch(`/api/requisitions/${reqId}/allocate`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeaders() },
      body: JSON.stringify({ vehicleId, driverId }),
    }).then((r) => json<{ requisition: Requisition }>(r)),

  deny: (reqId: number, reason?: string) =>
    fetch(`/api/requisitions/${reqId}/deny`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeaders() },
      body: JSON.stringify({ reason }),
    }).then((r) => json<{ requisition: Requisition }>(r)),

  complete: (reqId: number, name: string, pin: string) =>
    fetch(`/api/requisitions/${reqId}/complete`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeaders() },
      body: JSON.stringify({ name, pin }),
    }).then((r) => json<{ requisition: Requisition }>(r)),

  adminCancelRequisition: (reqId: number, reason: string, name: string, pin: string) =>
    fetch(`/api/requisitions/${reqId}/admin-cancel`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeaders() },
      body: JSON.stringify({ reason, name, pin }),
    }).then((r) => json<{ requisition: Requisition }>(r)),

  reapprove: (reqId: number, vehicleId: number, driverId: number, name: string, pin: string) =>
    fetch(`/api/requisitions/${reqId}/reapprove`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeaders() },
      body: JSON.stringify({ vehicleId, driverId, name, pin }),
    }).then((r) => json<{ requisition: Requisition }>(r)),

  reassign: (reqId: number, vehicleId: number, driverId: number, name: string, pin: string, reason: string) =>
    fetch(`/api/requisitions/${reqId}/reassign`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeaders() },
      body: JSON.stringify({ vehicleId, driverId, name, pin, reason }),
    }).then((r) => json<{ requisition: Requisition }>(r)),

  cancelRequisition: (reqId: number) =>
    fetch(`/api/requisitions/${reqId}/cancel`, { method: "POST", headers: authHeaders() }).then((r) =>
      json<{ requisition: Requisition }>(r)
    ),

  listActivityLog: (date?: string) =>
    fetch(`/api/activity-log${date ? `?date=${date}` : ""}`, { headers: authHeaders() }).then((r) =>
      json<{ entries: ActivityLogEntry[] }>(r)
    ),

  deleteActivityLogEntry: (id: number) =>
    fetch(`/api/activity-log/${id}`, { method: "DELETE", headers: authHeaders() }).then((r) =>
      json<{ ok: true }>(r)
    ),

  listVehicles: (all = false) =>
    fetch(`/api/vehicles${all ? "?all=true" : ""}`, { headers: authHeaders() }).then((r) =>
      json<{ vehicles: Vehicle[] }>(r)
    ),

  addVehicle: (
    reg_no: string,
    model: string,
    extra: {
      insurance_expiry?: string;
      inspection_expiry?: string;
      odometer_km?: number | "";
      default_driver_id?: number | null;
    } = {}
  ) =>
    fetch("/api/vehicles", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeaders() },
      body: JSON.stringify({ reg_no, model, ...extra }),
    }).then((r) => json<{ vehicle: Vehicle }>(r)),

  updateVehicle: (
    id: number,
    patch: Partial<{
      reg_no: string;
      model: string;
      insurance_expiry: string | null;
      inspection_expiry: string | null;
      odometer_km: number | "" | null;
      default_driver_id: number | null;
    }>
  ) =>
    fetch(`/api/vehicles/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", ...authHeaders() },
      body: JSON.stringify(patch),
    }).then((r) => json<{ vehicle: Vehicle }>(r)),

  setVehicleAvailability: (id: number, override: VehicleOverride | null, note?: string) =>
    fetch(`/api/vehicles/${id}/availability`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeaders() },
      body: JSON.stringify({ override, note }),
    }).then((r) => json<{ vehicle: Vehicle; affected: number[] }>(r)),

  removeVehicle: (id: number) =>
    fetch(`/api/vehicles/${id}`, { method: "DELETE", headers: authHeaders() }).then((r) => json<{ ok: true }>(r)),

  listDrivers: (all = false) =>
    fetch(`/api/drivers${all ? "?all=true" : ""}`, { headers: authHeaders() }).then((r) =>
      json<{ drivers: Driver[] }>(r)
    ),

  addDriver: (name: string, phone?: string) =>
    fetch("/api/drivers", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeaders() },
      body: JSON.stringify({ name, phone }),
    }).then((r) => json<{ driver: Driver }>(r)),

  removeDriver: (id: number) =>
    fetch(`/api/drivers/${id}`, { method: "DELETE", headers: authHeaders() }).then((r) => json<{ ok: true }>(r)),

  restoreDriver: (id: number) =>
    fetch(`/api/drivers/${id}/restore`, { method: "POST", headers: authHeaders() }).then((r) =>
      json<{ driver: Driver }>(r)
    ),

  listMessages: () => fetch("/api/messages", { headers: authHeaders() }).then((r) => json<{ messages: Message[] }>(r)),

  sendMessage: (body: string) =>
    fetch("/api/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeaders() },
      body: JSON.stringify({ body }),
    }).then((r) => json<{ message: Message }>(r)),

  // ---- Fleet Manager ----
  listMaintenance: () =>
    fetch("/api/maintenance", { headers: authHeaders() }).then((r) => json<{ records: MaintenanceRecord[] }>(r)),

  scheduleMaintenance: (input: {
    vehicle_id: number;
    kind: string;
    scheduled_for: string;
    expected_back?: string;
    notes?: string;
  }) =>
    fetch("/api/maintenance", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeaders() },
      body: JSON.stringify(input),
    }).then((r) => json<{ record: MaintenanceRecord }>(r)),

  completeMaintenance: (id: number, input: { cost?: number | ""; completed_on?: string; renewed_until?: string }) =>
    fetch(`/api/maintenance/${id}/complete`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeaders() },
      body: JSON.stringify(input),
    }).then((r) => json<{ record: MaintenanceRecord }>(r)),

  cancelMaintenance: (id: number) =>
    fetch(`/api/maintenance/${id}`, { method: "DELETE", headers: authHeaders() }).then((r) => json<{ ok: true }>(r)),

  listFuelLogs: () => fetch("/api/fuel", { headers: authHeaders() }).then((r) => json<{ logs: FuelLog[] }>(r)),

  addFuelLog: (input: {
    vehicle_id: number;
    litres: number;
    cost?: number | "";
    odometer_km?: number | "";
    logged_on?: string;
  }) =>
    fetch("/api/fuel", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeaders() },
      body: JSON.stringify(input),
    }).then((r) => json<{ log: FuelLog }>(r)),

  complianceAlerts: () =>
    fetch("/api/compliance", { headers: authHeaders() }).then((r) => json<{ alerts: ComplianceAlert[] }>(r)),

  // ---- Reports ----
  fleetReport: (days = 30) =>
    fetch(`/api/reports/fleet?days=${days}`, { headers: authHeaders() }).then((r) =>
      json<{ days: number; rows: FleetUsageRow[] }>(r)
    ),

  opsReport: (days = 30) =>
    fetch(`/api/reports/ops?days=${days}`, { headers: authHeaders() }).then((r) => json<{ report: OpsReport }>(r)),

  // ---- Settings (read: everyone; write: IT Admin) ----
  getSettings: () => fetch("/api/settings", { headers: authHeaders() }).then((r) => json<{ settings: AppSettings }>(r)),

  updateSettings: (patch: Partial<AppSettings>) =>
    fetch("/api/settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json", ...authHeaders() },
      body: JSON.stringify(patch),
    }).then((r) => json<{ settings: AppSettings }>(r)),

  // ---- IT Admin: accounts ----
  listUsers: () => fetch("/api/users", { headers: authHeaders() }).then((r) => json<{ users: DirectoryUser[] }>(r)),

  createUser: (name: string, role: Role, pin?: string) =>
    fetch("/api/users", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeaders() },
      body: JSON.stringify({ name, role, pin }),
    }).then((r) => json<{ user: DirectoryUser }>(r)),

  updateUser: (id: number, patch: { role?: Role; active?: boolean; pin?: string }) =>
    fetch(`/api/users/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", ...authHeaders() },
      body: JSON.stringify(patch),
    }).then((r) => json<{ user: DirectoryUser }>(r)),

  listNotifications: (unreadOnly = false) =>
    fetch(`/api/notifications${unreadOnly ? "?unreadOnly=true" : ""}`, { headers: authHeaders() }).then((r) =>
      json<{ notifications: Notification[] }>(r)
    ),

  listDriverNotices: (unreadOnly = false) =>
    fetch(`/api/notifications/drivers${unreadOnly ? "?unreadOnly=true" : ""}`, { headers: authHeaders() }).then(
      (r) => json<{ notifications: Notification[] }>(r)
    ),

  markNotificationRead: (id: number) =>
    fetch(`/api/notifications/${id}/read`, { method: "POST", headers: authHeaders() }).then((r) =>
      json<{ ok: true }>(r)
    ),
};

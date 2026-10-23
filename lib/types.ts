import type { Role, BackOfficeRole } from "./permissions";
export type { Role, BackOfficeRole };

export type VehicleOverride = "maintenance" | "breakdown" | "unavailable";

export interface Vehicle {
  id: number;
  reg_no: string;
  model: string;
  active: boolean;
  /** Set by the Fleet Manager — takes the vehicle out of allocation until cleared. */
  status_override: VehicleOverride | null;
  override_note: string | null;
  insurance_expiry: string | null;
  inspection_expiry: string | null;
  odometer_km: number | null;
  /** Fleet Manager's default driver for this vehicle — pre-selected on the Allocate page. */
  default_driver_id: number | null;
  /** Computed on read: the override, or "maintenance" if an open workshop job covers today. */
  unavailable_reason?: string | null;
}

export interface Driver {
  id: number;
  name: string;
  phone: string | null;
  active: boolean;
}

export type RequisitionStatus = "Pending Allocation" | "Scheduled" | "Active" | "Completed" | "Denied" | "Cancelled";

/**
 * Mirrors requisition_status() in db/schema.sql exactly. Postgres can't
 * express this as a generated column (it depends on today's date, which
 * isn't immutable), so status is computed here instead — every read goes
 * through this one function, so it's still never something that can be set
 * directly on a row.
 */
export function computeStatus(params: {
  vehicleId: number | null;
  startDate: string;
  endDate: string;
  deniedAt?: string | null;
  cancelledAt?: string | null;
  completedAt?: string | null;
  today?: string;
}): RequisitionStatus {
  const { vehicleId, startDate, endDate, deniedAt = null, cancelledAt = null, completedAt = null } = params;
  const today = params.today ?? new Date().toISOString().slice(0, 10);
  if (cancelledAt) return "Cancelled";
  if (deniedAt) return "Denied";
  if (vehicleId === null) return "Pending Allocation";
  if (completedAt) return "Completed";
  if (today > endDate) return "Completed";
  if (today >= startDate) return "Active";
  return "Scheduled";
}

export interface Requisition {
  id: number;
  sno: number;
  requester: string;
  submitted_by: string | null;
  department: string;
  start_date: string;
  end_date: string;
  origin: string;
  destination: string;
  purpose: string | null;
  vehicle_id: number | null;
  driver_id: number | null;
  status: RequisitionStatus;
  created_at: string;
  allocated_at: string | null;
  denied_at: string | null;
  denial_reason: string | null;
  cancelled_at: string | null;
  cancellation_reason: string | null;
  completed_at: string | null;
}

export interface Session {
  name: string;
  role: Role;
}

export interface AdminUser {
  id: number;
  name: string;
  role: BackOfficeRole;
  pin_hash: string;
  active: boolean;
  last_login: string | null;
}

export interface DirectoryUser {
  id: number;
  name: string;
  role: Role;
  last_login: string | null;
  created_at: string;
  active: boolean;
}

export interface ActivityLogEntry {
  id: number;
  requisition_id: number | null;
  actor_role: Role | "system";
  actor_name: string | null;
  action: string;
  details: unknown;
  created_at: string;
  requisitions: { sno: number; requester: string } | null;
}

export interface Message {
  id: number;
  sender_name: string;
  sender_role: Role;
  body: string;
  created_at: string;
}

export interface Notification {
  id: number;
  requisition_id: number | null;
  recipient_name: string;
  message: string;
  driver_name: string | null;
  driver_phone: string | null;
  read_at: string | null;
  created_at: string;
}

export type MaintenanceKind = "service" | "repair" | "inspection" | "insurance" | "other";

export interface MaintenanceRecord {
  id: number;
  vehicle_id: number;
  kind: MaintenanceKind;
  scheduled_for: string;
  expected_back: string | null;
  completed_on: string | null;
  cost: number | null;
  notes: string | null;
  cancelled_at: string | null;
  created_by: string | null;
  created_at: string;
}

export interface FuelLog {
  id: number;
  vehicle_id: number;
  litres: number;
  cost: number | null;
  odometer_km: number | null;
  logged_on: string;
  created_by: string | null;
}

export interface AppSettings {
  /** How many days ahead insurance/inspection/maintenance alerts start showing. */
  compliance_alert_days: number;
  /** Target time (hours) to decide a pending request — drives the SLA figure in Ops reports. */
  sla_hours: number;
  module_messages: boolean;
  module_maintenance: boolean;
}

export interface ComplianceAlert {
  vehicle_id: number;
  reg_no: string;
  model: string;
  kind: "insurance" | "inspection" | "maintenance";
  due_date: string;
  days_left: number;
  severity: "expired" | "soon";
}

export interface FleetUsageRow {
  vehicle_id: number;
  reg_no: string;
  model: string;
  trips: number;
  days_booked: number;
  utilisation_pct: number;
  fuel_litres: number;
  fuel_cost: number;
  maintenance_cost: number;
  odometer_km: number | null;
  km_logged: number | null;
  km_per_litre: number | null;
  unavailable_reason: string | null;
}

export interface OpsReport {
  period_days: number;
  sla_hours: number;
  submitted: number;
  decided: number;
  approved: number;
  denied: number;
  cancelled: number;
  pending_now: number;
  pending_over_sla: { sno: number; requester: string; hours_waiting: number }[];
  avg_hours_to_decision: number | null;
  sla_met_pct: number | null;
  trips_active_now: number;
  reassignments: number;
  by_department: { department: string; count: number }[];
}
export interface TransactionEvent {
  id: string;
  kind: "activity" | "notice";
  at: string;
  actor: string | null;
  mine: boolean;
  action: string;
  label: string;
  detail: string | null;
  tripLabel: string | null;
  driverName: string | null;
  driverPhone: string | null;
  unread: boolean;
}

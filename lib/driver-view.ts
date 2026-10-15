import type { Requisition, Vehicle } from "./types";

export interface DriverJourney {
  requisition: Requisition;
  vehicle: Vehicle | null;
}

export interface DriverView {
  /** Trip the driver is on right now (status Active), with its vehicle. */
  current: DriverJourney | null;
  /** Their next Scheduled trip. */
  next: DriverJourney | null;
  /** Every Scheduled trip, soonest first (includes `next`). */
  upcoming: DriverJourney[];
  /** Completed or cancelled trips that carried this driver, most recent first. */
  past: DriverJourney[];
  /** Vehicles the Fleet Manager has set this driver as the default for. */
  defaultVehicles: Vehicle[];
  /** The vehicle to show as "assigned": the one in use now, otherwise the next one. */
  assignedVehicle: Vehicle | null;
  assignedVehicleKind: "in use now" | "next trip" | null;
  /** Total approved days across upcoming + current trips, for a quick workload read. */
  committedDays: number;
}

const dayCount = (start: string, end: string) =>
  Math.round((Date.parse(end) - Date.parse(start)) / 86400000) + 1;

/**
 * Everything the dashboard shows when a driver is selected: who they are
 * driving for, in what, and when. Pure function over data the dashboard has
 * already loaded — so what you see is exactly what the allocation log holds.
 * Denied and still-pending requests never carry a driver, so they can't appear.
 */
export function buildDriverView(driverId: number, requisitions: Requisition[], vehicles: Vehicle[]): DriverView {
  const vehicleById = new Map(vehicles.map((v) => [v.id, v]));
  const mine = requisitions
    .filter((r) => r.driver_id === driverId)
    .map((r): DriverJourney => ({ requisition: r, vehicle: r.vehicle_id ? vehicleById.get(r.vehicle_id) ?? null : null }));

  const byStatus = (s: Requisition["status"]) => mine.filter((j) => j.requisition.status === s);
  const active = byStatus("Active").sort((a, b) => a.requisition.start_date.localeCompare(b.requisition.start_date));
  const upcoming = byStatus("Scheduled").sort((a, b) => a.requisition.start_date.localeCompare(b.requisition.start_date));
  const past = mine
    .filter((j) => j.requisition.status === "Completed" || j.requisition.status === "Cancelled")
    .sort((a, b) => b.requisition.end_date.localeCompare(a.requisition.end_date));

  const current = active[0] ?? null;
  const next = upcoming[0] ?? null;
  const assigned = current ?? next;

  return {
    current,
    next,
    upcoming,
    past,
    defaultVehicles: vehicles.filter((v) => v.active && v.default_driver_id === driverId),
    assignedVehicle: assigned?.vehicle ?? null,
    assignedVehicleKind: current ? "in use now" : next ? "next trip" : null,
    committedDays: [...active, ...upcoming].reduce((n, j) => n + dayCount(j.requisition.start_date, j.requisition.end_date), 0),
  };
}

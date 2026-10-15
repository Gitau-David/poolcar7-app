"use client";

import { useEffect, useState, useCallback } from "react";
import AppShell from "@/components/AppShell";
import StatusBadge from "@/components/StatusBadge";
import AdminConfirmDialog from "@/components/AdminConfirmDialog";
import { api } from "@/lib/api";
import { useSession } from "@/lib/session-context";
import { can, isBackOffice } from "@/lib/permissions";
import { buildDriverView } from "@/lib/driver-view";
import DriverPanel from "@/components/DriverPanel";
import type { Requisition, Vehicle, Driver, ComplianceAlert } from "@/lib/types";
import { CheckCircle2, XCircle, Car, Users, Clock3, Wrench, ShieldAlert, Phone, X, MapPin, ChevronRight } from "lucide-react";
import { SkeletonCards, SkeletonTable } from "@/components/Skeleton";
import EmptyState from "@/components/EmptyState";

const POLL_MS = 8000; // "no manual refresh needed" — poll quietly in the background

type PendingAction = { kind: "complete" | "cancel"; reqId: number; sno: number };

const REASON_LABEL: Record<string, string> = {
  maintenance: "In maintenance",
  breakdown: "Broken down",
  unavailable: "Out of service",
};

function StatCard({
  icon: Icon,
  label,
  value,
  accent,
}: {
  icon: typeof Car;
  label: string;
  value: number;
  accent: string;
}) {
  return (
    <div className="rounded-xl border border-border bg-surface shadow-soft px-4 py-3.5 flex items-center gap-3">
      <div className={`h-9 w-9 rounded-lg flex items-center justify-center shrink-0 ${accent}`}>
        <Icon size={16} />
      </div>
      <div>
        <div className="font-mono text-lg text-ink leading-none">{value}</div>
        <div className="text-[11px] text-muted mt-1">{label}</div>
      </div>
    </div>
  );
}

function alertText(a: ComplianceAlert): string {
  const what = a.kind === "maintenance" ? "Workshop job" : a.kind === "insurance" ? "Insurance" : "Inspection";
  if (a.days_left < 0) return `${what} ${a.kind === "maintenance" ? "was due" : "expired"} ${-a.days_left} day${a.days_left === -1 ? "" : "s"} ago`;
  if (a.days_left === 0) return `${what} ${a.kind === "maintenance" ? "starts" : "expires"} today`;
  return `${what} ${a.kind === "maintenance" ? "starts" : "expires"} in ${a.days_left} day${a.days_left === 1 ? "" : "s"}`;
}

export default function DashboardPage() {
  const session = useSession();
  const role = session?.role;
  const canManageTrips = can(role, "trips:allocate");
  const canSeeCompliance = can(role, "fleet:maintenance");
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  // Includes retired vehicles, so a driver's past journeys still show the vehicle that was used.
  const [allVehicles, setAllVehicles] = useState<Vehicle[]>([]);
  const [selectedDriverId, setSelectedDriverId] = useState<number | null>(null);
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [requisitions, setRequisitions] = useState<Requisition[]>([]);
  const [alerts, setAlerts] = useState<ComplianceAlert[]>([]);
  const [loading, setLoading] = useState(true);
  const [pendingAction, setPendingAction] = useState<PendingAction | null>(null);

  const load = useCallback(async () => {
    const [v, d, r] = await Promise.all([api.listVehicles(true), api.listDrivers(), api.listRequisitions()]);
    setAllVehicles(v.vehicles);
    setVehicles(v.vehicles.filter((x) => x.active));
    setDrivers(d.drivers);
    setRequisitions(r.requisitions);
    setLoading(false);
    if (canSeeCompliance) {
      // The compliance feed is a bonus — a failure (e.g. maintenance module off) shouldn't blank the dashboard.
      api
        .complianceAlerts()
        .then((res) => setAlerts(res.alerts))
        .catch(() => setAlerts([]));
    }
  }, [canSeeCompliance]);

  useEffect(() => {
    load();
    const id = setInterval(load, POLL_MS);
    return () => clearInterval(id);
  }, [load]);

  useEffect(() => {
    if (selectedDriverId === null) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setSelectedDriverId(null);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selectedDriverId]);

  async function confirmAction(name: string, pin: string, reason?: string) {
    if (!pendingAction) return;
    if (pendingAction.kind === "complete") {
      await api.complete(pendingAction.reqId, name, pin);
    } else {
      await api.adminCancelRequisition(pendingAction.reqId, reason ?? "", name, pin);
    }
    setPendingAction(null);
    await load();
  }

  const today = new Date().toISOString().slice(0, 10);
  // Exclude cancelled/denied/completed trips — cancelling doesn't clear
  // vehicle_id/driver_id, it just marks cancelled_at, so without this a
  // cancelled trip would keep showing its vehicle as booked.
  const live = requisitions.filter((r) => !r.cancelled_at && !r.denied_at && !r.completed_at);
  const busyVehicleIds = new Set(
    live.filter((r) => r.vehicle_id && r.start_date <= today && r.end_date >= today).map((r) => r.vehicle_id)
  );
  const busyDriverIds = new Set(
    live.filter((r) => r.driver_id && r.start_date <= today && r.end_date >= today).map((r) => r.driver_id)
  );

  const outOfService = vehicles.filter((v) => v.unavailable_reason);
  const vehiclesFree = vehicles.filter((v) => !busyVehicleIds.has(v.id) && !v.unavailable_reason).length;
  const vehicleById = new Map(allVehicles.map((v) => [v.id, v]));
  const driverById = new Map(drivers.map((d) => [d.id, d]));

  const activeTrips = requisitions.filter(
    (r) => r.status === "Pending Allocation" || r.status === "Scheduled" || r.status === "Active"
  );
  const pendingCount = requisitions.filter((r) => r.status === "Pending Allocation").length;
  const showActions = canManageTrips;

  // Selected driver: details, assigned vehicle and journeys, all derived from the data already on screen.
  const selectedDriver = drivers.find((d) => d.id === selectedDriverId) ?? null;
  const driverView = selectedDriver ? buildDriverView(selectedDriver.id, requisitions, allVehicles) : null;

  return (
    <AppShell>
      <div className="mb-7">
        <h1 className="font-head font-semibold text-xl text-ink">Dashboard</h1>
        <p className="text-sm text-muted mt-1">Live vehicle availability and trip status — updates automatically.</p>
      </div>

      {loading ? (
        <div className="space-y-8">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="rounded-xl border border-border bg-surface shadow-soft px-4 py-3.5 h-[60px]" />
            ))}
          </div>
          <SkeletonCards count={3} />
          <SkeletonTable rows={4} cols={7} />
        </div>
      ) : (
        <div className="space-y-8">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <StatCard icon={Car} label="Vehicles free now" value={vehiclesFree} accent="bg-teal/15 text-teal" />
            <StatCard
              icon={Users}
              label="Drivers free now"
              value={drivers.length - busyDriverIds.size}
              accent="bg-teal/15 text-teal"
            />
            <StatCard icon={Clock3} label="Awaiting allocation" value={pendingCount} accent="bg-amber/15 text-amber" />
            <StatCard icon={Wrench} label="Out of service" value={outOfService.length} accent="bg-red/15 text-red" />
          </div>

          {canSeeCompliance && alerts.length > 0 && (
            <section className="rounded-xl border border-amber/30 bg-amber/5 overflow-hidden">
              <div className="flex items-center gap-2 px-4 py-3 border-b border-amber/20 text-xs font-medium text-amber uppercase tracking-wider2">
                <ShieldAlert size={14} />
                Compliance alerts ({alerts.length})
              </div>
              <div className="divide-y divide-border">
                {alerts.map((a) => (
                  <div key={`${a.vehicle_id}-${a.kind}-${a.due_date}`} className="px-4 py-2.5 flex items-center justify-between gap-4 text-sm">
                    <div>
                      <span className="font-mono text-ink mr-2">{a.reg_no}</span>
                      <span className={a.severity === "expired" ? "text-red" : "text-ink"}>{alertText(a)}</span>
                    </div>
                    <span className="text-xs text-muted font-mono shrink-0">{a.due_date}</span>
                  </div>
                ))}
              </div>
            </section>
          )}

          <section>
            <h2 className="text-xs font-medium text-muted uppercase tracking-wider2 mb-3">Fleet availability</h2>
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {vehicles.map((v) => {
                const out = v.unavailable_reason;
                const busy = busyVehicleIds.has(v.id);
                const tone = out ? "amber" : busy ? "red" : "teal";
                const label = out ? REASON_LABEL[out] ?? "Unavailable" : busy ? "Booked today" : "Available";
                return (
                  <div
                    key={v.id}
                    className={`rounded-xl border bg-surface shadow-soft px-4 py-3.5 border-l-4 border-border transition-colors ${
                      tone === "amber" ? "border-l-amber" : tone === "red" ? "border-l-red" : "border-l-teal"
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-mono text-sm text-ink">{v.reg_no}</span>
                      <span
                        className={`flex items-center gap-1.5 text-[11px] font-medium ${
                          tone === "amber" ? "text-amber" : tone === "red" ? "text-red" : "text-teal"
                        }`}
                      >
                        <span
                          className={`h-1.5 w-1.5 rounded-full ${
                            tone === "amber" ? "bg-amber" : tone === "red" ? "bg-red" : "bg-teal"
                          }`}
                        />
                        {label}
                      </span>
                    </div>
                    <div className="text-xs text-muted mt-1">{v.model}</div>
                    {out && v.override_note && <div className="text-xs text-muted mt-1">{v.override_note}</div>}
                  </div>
                );
              })}
              {vehicles.length === 0 && (
                <div className="col-span-full">
                  <EmptyState icon={Car} title="No vehicles in the fleet yet" description="Add one from Manage Fleet to start tracking availability." />
                </div>
              )}
            </div>
          </section>

          <section>
            <h2 className="text-xs font-medium text-muted uppercase tracking-wider2 mb-3">Driver availability</h2>
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {drivers.map((d) => {
                const busy = busyDriverIds.has(d.id);
                return (
                  <button
                    key={d.id}
                    onClick={() => setSelectedDriverId(d.id)}
                    aria-label={`Show details for ${d.name}`}
                    className={`text-left rounded-xl border bg-surface shadow-soft px-4 py-3.5 border-l-4 transition-colors hover:bg-surface2/50 ${
                      busy ? "border-l-red border-border" : "border-l-teal border-border"
                    } ${selectedDriverId === d.id ? "ring-1 ring-teal/50" : ""}`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-ink">{d.name}</span>
                      <span className={`flex items-center gap-1.5 text-[11px] font-medium ${busy ? "text-red" : "text-teal"}`}>
                        <span className={`h-1.5 w-1.5 rounded-full ${busy ? "bg-red" : "bg-teal"}`} />
                        {busy ? "Booked today" : "Available"}
                      </span>
                    </div>
                    <div className="flex items-center justify-between mt-1">
                      <span className="text-xs text-muted font-mono">{d.phone ?? ""}</span>
                      <ChevronRight size={13} className="text-muted" />
                    </div>
                  </button>
                );
              })}
              {drivers.length === 0 && (
                <div className="col-span-full">
                  <EmptyState icon={Users} title="No drivers in the fleet yet" description="Add one from Drivers to start tracking availability." />
                </div>
              )}
            </div>
          </section>

          <section>
            <h2 className="text-xs font-medium text-muted uppercase tracking-wider2 mb-3">
              Requisitions &amp; Scheduled Trips
            </h2>
            <div className="rounded-xl border border-border bg-surface shadow-soft overflow-hidden overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-muted text-[11px] uppercase tracking-wider2 bg-surface2/40 border-b border-border">
                    <th className="px-4 py-3 font-medium">S.no</th>
                    <th className="px-4 py-3 font-medium">Requester</th>
                    <th className="px-4 py-3 font-medium">Dept.</th>
                    <th className="px-4 py-3 font-medium">Dates</th>
                    <th className="px-4 py-3 font-medium">Route</th>
                    <th className="px-4 py-3 font-medium">Vehicle</th>
                    <th className="px-4 py-3 font-medium">Driver</th>
                    <th className="px-4 py-3 font-medium">Status</th>
                    {showActions && <th className="px-4 py-3 font-medium"></th>}
                  </tr>
                </thead>
                <tbody>
                  {activeTrips.map((r) => {
                    const v = r.vehicle_id ? vehicleById.get(r.vehicle_id) : undefined;
                    const needsReassign = !!v?.status_override && (r.status === "Scheduled" || r.status === "Active");
                    return (
                      <tr key={r.id} className="border-b border-border last:border-0 hover:bg-surface2/30 transition-colors">
                        <td className="px-4 py-3 font-mono text-ink">{r.sno}</td>
                        <td className="px-4 py-3 text-ink">{r.requester}</td>
                        <td className="px-4 py-3 text-muted">{r.department}</td>
                        <td className="px-4 py-3 text-muted whitespace-nowrap">
                          {r.start_date} → {r.end_date}
                        </td>
                        <td className="px-4 py-3 text-muted">
                          {r.origin} → {r.destination}
                        </td>
                        <td className="px-4 py-3 font-mono text-ink">{v?.reg_no ?? "—"}</td>
                        <td className="px-4 py-3 text-ink">
                          {(r.driver_id && driverById.get(r.driver_id)?.name) || "—"}
                        </td>
                        <td className="px-4 py-3">
                          <StatusBadge status={r.status} />
                          {needsReassign && (
                            <div className="text-xs text-amber mt-1">
                              Vehicle {REASON_LABEL[v!.status_override!]?.toLowerCase()} — needs reassigning
                            </div>
                          )}
                        </td>
                        {showActions && (
                          <td className="px-4 py-3">
                            {(r.status === "Scheduled" || r.status === "Active") && (
                              <div className="flex items-center gap-3 whitespace-nowrap">
                                <button
                                  onClick={() => setPendingAction({ kind: "complete", reqId: r.id, sno: r.sno })}
                                  className="flex items-center gap-1.5 text-xs text-muted hover:text-teal transition-colors"
                                  title="Mark this trip as done — frees the vehicle and driver up immediately"
                                >
                                  <CheckCircle2 size={13} />
                                  Mark completed
                                </button>
                                <button
                                  onClick={() => setPendingAction({ kind: "cancel", reqId: r.id, sno: r.sno })}
                                  className="flex items-center gap-1.5 text-xs text-muted hover:text-red transition-colors"
                                  title="Cancel this already-approved trip"
                                >
                                  <XCircle size={13} />
                                  Cancel
                                </button>
                              </div>
                            )}
                          </td>
                        )}
                      </tr>
                    );
                  })}
                  {activeTrips.length === 0 && (
                    <tr>
                      <td colSpan={showActions ? 9 : 8} className="px-4 py-6 text-center text-muted text-sm">
                        No pending or scheduled trips right now.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      )}


      {selectedDriver && driverView && (
        <div className="fixed inset-0 z-40 flex justify-end">
          <div className="absolute inset-0 bg-black/60" onClick={() => setSelectedDriverId(null)} />
          <aside role="dialog" aria-label={`${selectedDriver.name} details`} className="relative w-full max-w-lg overflow-y-auto">
            <DriverPanel
              driver={selectedDriver}
              view={driverView}
              busyToday={busyDriverIds.has(selectedDriver.id)}
              showPurpose={isBackOffice(role)}
              onClose={() => setSelectedDriverId(null)}
            />
          </aside>
        </div>
      )}

      {pendingAction && (
        <AdminConfirmDialog
          title={pendingAction.kind === "complete" ? "Mark trip completed" : "Cancel approved trip"}
          description={
            pendingAction.kind === "complete"
              ? `Confirm your admin credentials to mark trip #${pendingAction.sno} as completed. This frees the vehicle and driver up immediately.`
              : `Confirm your admin credentials to cancel trip #${pendingAction.sno}. The requester and driver will be notified.`
          }
          confirmLabel={pendingAction.kind === "complete" ? "Mark completed" : "Cancel trip"}
          defaultName={session?.name ?? ""}
          requireReason={pendingAction.kind === "cancel"}
          onConfirm={confirmAction}
          onClose={() => setPendingAction(null)}
        />
      )}
    </AppShell>
  );
}

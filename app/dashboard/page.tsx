"use client";

import { useEffect, useState, useCallback } from "react";
import AppShell from "@/components/AppShell";
import StatusBadge from "@/components/StatusBadge";
import AdminConfirmDialog from "@/components/AdminConfirmDialog";
import { api } from "@/lib/api";
import { useSession } from "@/lib/session-context";
import type { Requisition, Vehicle, Driver } from "@/lib/types";
import { CheckCircle2, XCircle } from "lucide-react";

const POLL_MS = 8000; // "no manual refresh needed" — poll quietly in the background

type PendingAction = { kind: "complete" | "cancel"; reqId: number; sno: number };

export default function DashboardPage() {
  const session = useSession();
  const isAdminLike = session?.role === "admin" || session?.role === "it_admin";
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [requisitions, setRequisitions] = useState<Requisition[]>([]);
  const [loading, setLoading] = useState(true);
  const [pendingAction, setPendingAction] = useState<PendingAction | null>(null);

  const load = useCallback(async () => {
    const [v, d, r] = await Promise.all([api.listVehicles(), api.listDrivers(), api.listRequisitions()]);
    setVehicles(v.vehicles);
    setDrivers(d.drivers);
    setRequisitions(r.requisitions);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
    const id = setInterval(load, POLL_MS);
    return () => clearInterval(id);
  }, [load]);

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
  // Exclude cancelled trips — cancelling doesn't clear vehicle_id/driver_id,
  // it just marks cancelled_at, so without this a cancelled trip would keep
  // showing its vehicle as booked.
  const live = requisitions.filter((r) => !r.cancelled_at && !r.denied_at);
  const busyVehicleIds = new Set(
    live.filter((r) => r.vehicle_id && r.start_date <= today && r.end_date >= today).map((r) => r.vehicle_id)
  );
  const busyDriverIds = new Set(
    live.filter((r) => r.driver_id && r.start_date <= today && r.end_date >= today).map((r) => r.driver_id)
  );

  const activeTrips = requisitions.filter((r) => r.status === "Pending Allocation" || r.status === "Scheduled" || r.status === "Active");

  return (
    <AppShell>
      <div className="mb-7">
        <h1 className="font-head font-semibold text-xl text-ink">Dashboard</h1>
        <p className="text-sm text-muted mt-1">Live vehicle availability and trip status — updates automatically.</p>
      </div>

      {loading ? (
        <p className="text-sm text-muted">Loading…</p>
      ) : (
        <div className="space-y-8">
          <section>
            <h2 className="text-xs font-medium text-muted uppercase tracking-wide mb-3">Fleet availability</h2>
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {vehicles.map((v) => {
                const busy = busyVehicleIds.has(v.id);
                return (
                  <div
                    key={v.id}
                    className={`rounded-xl border bg-surface px-4 py-3.5 border-l-4 ${
                      busy ? "border-l-red border-border" : "border-l-teal border-border"
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-mono text-sm text-ink">{v.reg_no}</span>
                      <span className={`text-[11px] font-medium ${busy ? "text-red" : "text-teal"}`}>
                        {busy ? "Booked today" : "Available"}
                      </span>
                    </div>
                    <div className="text-xs text-muted mt-1">{v.model}</div>
                  </div>
                );
              })}
              {vehicles.length === 0 && <p className="text-sm text-muted">No vehicles in the fleet yet.</p>}
            </div>
          </section>

          <section>
            <h2 className="text-xs font-medium text-muted uppercase tracking-wide mb-3">Driver availability</h2>
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {drivers.map((d) => {
                const busy = busyDriverIds.has(d.id);
                return (
                  <div
                    key={d.id}
                    className={`rounded-xl border bg-surface px-4 py-3.5 border-l-4 ${
                      busy ? "border-l-red border-border" : "border-l-teal border-border"
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-ink">{d.name}</span>
                      <span className={`text-[11px] font-medium ${busy ? "text-red" : "text-teal"}`}>
                        {busy ? "Booked today" : "Available"}
                      </span>
                    </div>
                    {d.phone && <div className="text-xs text-muted mt-1 font-mono">{d.phone}</div>}
                  </div>
                );
              })}
              {drivers.length === 0 && <p className="text-sm text-muted">No drivers in the fleet yet.</p>}
            </div>
          </section>

          <section>
            <h2 className="text-xs font-medium text-muted uppercase tracking-wide mb-3">
              Requisitions &amp; Scheduled Trips
            </h2>
            <div className="rounded-xl border border-border bg-surface overflow-hidden overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-muted text-xs uppercase tracking-wide border-b border-border">
                    <th className="px-4 py-3 font-medium">S.no</th>
                    <th className="px-4 py-3 font-medium">Requester</th>
                    <th className="px-4 py-3 font-medium">Dept.</th>
                    <th className="px-4 py-3 font-medium">Dates</th>
                    <th className="px-4 py-3 font-medium">Route</th>
                    <th className="px-4 py-3 font-medium">Vehicle</th>
                    <th className="px-4 py-3 font-medium">Status</th>
                    {isAdminLike && <th className="px-4 py-3 font-medium"></th>}
                  </tr>
                </thead>
                <tbody>
                  {activeTrips.map((r) => (
                    <tr key={r.id} className="border-b border-border last:border-0">
                      <td className="px-4 py-3 font-mono text-ink">{r.sno}</td>
                      <td className="px-4 py-3 text-ink">{r.requester}</td>
                      <td className="px-4 py-3 text-muted">{r.department}</td>
                      <td className="px-4 py-3 text-muted whitespace-nowrap">
                        {r.start_date} → {r.end_date}
                      </td>
                      <td className="px-4 py-3 text-muted">
                        {r.origin} → {r.destination}
                      </td>
                      <td className="px-4 py-3 font-mono text-ink">
                        {vehicles.find((v) => v.id === r.vehicle_id)?.reg_no ?? "—"}
                      </td>
                      <td className="px-4 py-3">
                        <StatusBadge status={r.status} />
                      </td>
                      {isAdminLike && (
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
                  ))}
                  {activeTrips.length === 0 && (
                    <tr>
                      <td colSpan={isAdminLike ? 8 : 7} className="px-4 py-6 text-center text-muted text-sm">
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

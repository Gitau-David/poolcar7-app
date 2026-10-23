"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import AppShell from "@/components/AppShell";
import StatusBadge from "@/components/StatusBadge";
import { api } from "@/lib/api";
import { useSession } from "@/lib/session-context";
import type { Requisition, TransactionEvent, Vehicle, Driver } from "@/lib/types";
import { Download, History, Phone } from "lucide-react";
import { SkeletonTable } from "@/components/Skeleton";
import EmptyState from "@/components/EmptyState";

type Tab = "all" | "trips" | "notices";

function csvEscape(value: string): string {
  if (/[",\n]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}

function downloadCsv(filename: string, rows: string[][]) {
  const csv = rows.map((row) => row.map(csvEscape).join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function totalDays(start: string, end: string): number {
  const ms = new Date(end).getTime() - new Date(start).getTime();
  return Math.round(ms / (1000 * 60 * 60 * 24)) + 1;
}

export default function TransactionsPage() {
  const session = useSession();
  const isAdminLike = session?.role === "admin" || session?.role === "it_admin";
  const [requisitions, setRequisitions] = useState<Requisition[]>([]);
  const [events, setEvents] = useState<TransactionEvent[]>([]);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [tab, setTab] = useState<Tab>("all");

  const load = useCallback(async () => {
    try {
      const [t, v, d] = await Promise.all([api.listTransactions(), api.listVehicles(true), api.listDrivers(true)]);
      setRequisitions(t.requisitions);
      setEvents(t.events);
      setVehicles(v.vehicles);
      setDrivers(d.drivers);
    } catch (err: any) {
      setError(err.message || "Could not load your history.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const vehicleById = useMemo(() => new Map(vehicles.map((v) => [v.id, v])), [vehicles]);
  const driverById = useMemo(() => new Map(drivers.map((d) => [d.id, d])), [drivers]);

  // Trips: every resolved outcome (allocated, denied, cancelled), newest first.
  // Still-pending requests show up as "Requisition submitted" events instead.
  const trips = useMemo(
    () =>
      requisitions
        .filter((r) => r.status !== "Pending Allocation")
        .sort((a, b) => b.created_at.localeCompare(a.created_at)),
    [requisitions]
  );
  const notices = useMemo(() => events.filter((e) => e.kind === "notice"), [events]);
  const shownEvents = tab === "notices" ? notices : events;

  function exportCsv() {
    const scope = isAdminLike ? "all" : "mine";
    const day = new Date().toISOString().slice(0, 10);
    if (tab === "trips") {
      const header = [
        "S.no", "Visitor / Employee", "Host / Department", "Start Date", "End Date", "Total Days",
        "Pickup Location", "Drop Location", "Purpose", "Vehicle Reg No", "Vehicle Model",
        "Driver Name", "Driver Phone", "Status", "Allocated At", "Denied At", "Denial Reason", "Cancelled At",
      ];
      const rows = trips.map((r) => {
        const v = r.vehicle_id ? vehicleById.get(r.vehicle_id) : undefined;
        const d = r.driver_id ? driverById.get(r.driver_id) : undefined;
        return [
          String(r.sno), r.requester, r.department, r.start_date, r.end_date,
          String(totalDays(r.start_date, r.end_date)), r.origin, r.destination, r.purpose ?? "",
          v?.reg_no ?? "", v?.model ?? "", d?.name ?? "", d?.phone ?? "", r.status,
          r.allocated_at ?? "", r.denied_at ?? "", r.denial_reason ?? "", r.cancelled_at ?? "",
        ];
      });
      downloadCsv(`pool-car-trips-${scope}-${day}.csv`, [header, ...rows]);
      return;
    }
    const header = ["When", "Type", "Who", "What", "Trip", "Details", "Driver", "Driver Phone"];
    const rows = shownEvents.map((e) => [
      e.at,
      e.kind === "notice" ? "Notice" : "Activity",
      e.kind === "activity" ? (e.mine ? "You" : e.actor ?? "System") : "",
      e.label,
      e.tripLabel ?? "",
      e.detail ?? "",
      e.driverName ?? "",
      e.driverPhone ?? "",
    ]);
    downloadCsv(`pool-car-${tab === "notices" ? "notices" : "activity"}-${scope}-${day}.csv`, [header, ...rows]);
  }

  const tabs: { key: Tab; label: string; count: number }[] = [
    { key: "all", label: "All activity", count: events.length },
    { key: "trips", label: "Trips", count: trips.length },
    { key: "notices", label: "Notices", count: notices.length },
  ];
  const exportEmpty = tab === "trips" ? trips.length === 0 : shownEvents.length === 0;

  return (
    <AppShell>
      <div className="mb-7 flex items-start justify-between gap-4">
        <div>
          <h1 className="font-head font-semibold text-xl text-ink">Transaction History</h1>
          <p className="text-sm text-muted mt-1">
            {isAdminLike
              ? "Every trip decision, fleet change, account change and notice across the system — plus your own sign-ins."
              : "Everything you've done, everything done to your trips, and every notice sent to you."}
          </p>
        </div>
        <button
          onClick={exportCsv}
          disabled={exportEmpty}
          className="shrink-0 flex items-center gap-2 rounded-lg border border-border text-ink text-sm px-3.5 py-2 hover:bg-surface2 disabled:opacity-40 transition-colors"
        >
          <Download size={15} />
          Export CSV
        </button>
      </div>

      <div className="flex gap-1.5 mb-5 border-b border-border">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-3.5 py-2 text-sm -mb-px border-b-2 transition-colors ${
              tab === t.key ? "border-teal text-ink font-medium" : "border-transparent text-muted hover:text-ink"
            }`}
          >
            {t.label} <span className="font-mono text-[11px] text-muted ml-1">{t.count}</span>
          </button>
        ))}
      </div>

      {error && <p className="text-xs text-red mb-4">{error}</p>}

      {loading ? (
        <SkeletonTable rows={6} cols={6} />
      ) : tab === "trips" ? (
        trips.length === 0 ? (
          <EmptyState
            icon={History}
            title="No decided trips yet"
            description="Approved, denied, and cancelled requisitions will show up here as they happen."
          />
        ) : (
          <div className="rounded-xl border border-border bg-surface shadow-soft overflow-hidden overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-muted text-xs uppercase tracking-wide border-b border-border">
                  <th className="px-4 py-3 font-medium">S.no</th>
                  <th className="px-4 py-3 font-medium">Requester</th>
                  <th className="px-4 py-3 font-medium">Dates</th>
                  <th className="px-4 py-3 font-medium">Route</th>
                  <th className="px-4 py-3 font-medium">Vehicle</th>
                  <th className="px-4 py-3 font-medium">Driver</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium">Resolved</th>
                </tr>
              </thead>
              <tbody>
                {trips.map((r) => {
                  const v = r.vehicle_id ? vehicleById.get(r.vehicle_id) : undefined;
                  const d = r.driver_id ? driverById.get(r.driver_id) : undefined;
                  const resolvedAt = r.cancelled_at || r.denied_at || r.completed_at || r.allocated_at;
                  return (
                    <tr key={r.id} className="border-b border-border last:border-0 align-top">
                      <td className="px-4 py-3 font-mono text-ink">{r.sno}</td>
                      <td className="px-4 py-3 text-ink">{r.requester}</td>
                      <td className="px-4 py-3 text-muted whitespace-nowrap">{r.start_date} → {r.end_date}</td>
                      <td className="px-4 py-3 text-muted">{r.origin} → {r.destination}</td>
                      <td className="px-4 py-3 font-mono text-ink">{v?.reg_no ?? "—"}</td>
                      <td className="px-4 py-3 text-ink">{d?.name ?? "—"}</td>
                      <td className="px-4 py-3">
                        <StatusBadge status={r.status} />
                        {r.denial_reason && <div className="text-xs text-red mt-1">Reason: {r.denial_reason}</div>}
                        {r.cancellation_reason && (
                          <div className="text-xs text-red mt-1">Reason: {r.cancellation_reason}</div>
                        )}
                      </td>
                      <td className="px-4 py-3 text-muted whitespace-nowrap">
                        {resolvedAt ? new Date(resolvedAt).toLocaleString() : "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )
      ) : shownEvents.length === 0 ? (
        <EmptyState
          icon={History}
          title={tab === "notices" ? "No notices yet" : "Nothing here yet"}
          description="Sign-ins, submissions, decisions, fleet changes and notices will appear here as they happen."
        />
      ) : (
        <ul className="rounded-xl border border-border bg-surface shadow-soft divide-y divide-border">
          {shownEvents.map((e) => (
            <li key={e.id} className="px-4 py-3 flex items-start gap-3">
              <span
                className={`mt-1.5 h-1.5 w-1.5 rounded-full shrink-0 ${
                  e.kind === "notice" ? (e.unread ? "bg-amber" : "bg-muted") : "bg-teal"
                }`}
              />
              <div className="min-w-0 flex-1">
                <div className={`text-sm ${e.unread ? "text-ink font-medium" : "text-ink"}`}>
                  {e.label}
                  {e.tripLabel && <span className="font-mono text-xs text-muted ml-2">{e.tripLabel}</span>}
                </div>
                {e.detail && <div className="text-xs text-muted mt-0.5">{e.detail}</div>}
                {e.driverName && (
                  <div className="text-xs text-muted mt-1 flex items-center gap-3">
                    <span>Driver: {e.driverName}</span>
                    {e.driverPhone && (
                      <span className="flex items-center gap-1 font-mono">
                        <Phone size={11} />
                        {e.driverPhone}
                      </span>
                    )}
                  </div>
                )}
                <div className="text-[11px] text-muted mt-1">
                  {e.kind === "activity" && <>{e.mine ? "You" : e.actor ?? "System"} · </>}
                  {new Date(e.at).toLocaleString()}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </AppShell>
  );
}

"use client";

import { useEffect, useState, useCallback } from "react";
import AppShell from "@/components/AppShell";
import { api } from "@/lib/api";
import type { ActivityLogEntry } from "@/lib/types";
import type { SVGProps } from "react";
import { SkeletonTable } from "@/components/Skeleton";
import EmptyState from "@/components/EmptyState";

type IconProps = SVGProps<SVGSVGElement> & { size?: number };

function Printer({ size = 24, ...props }: IconProps) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}><polyline points="6 9 6 2 18 2 18 9" /><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" /><rect x="6" y="14" width="12" height="8" /></svg>;
}

function Trash2({ size = 24, ...props }: IconProps) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}><path d="M3 6h18M8 6V4h8v2m3 0-1 14H6L5 6m4 4v6m6-6v6" /></svg>;
}

function ScrollText({ size = 24, ...props }: IconProps) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}><path d="M8 21h12a2 2 0 0 0 2-2V5a2 2 0 0 0-2-2H8" /><path d="M6 3H5a3 3 0 0 0 0 6h1v12H5a3 3 0 0 1 0-6h1m4-9h8m-8 4h8m-8 4h5" /></svg>;
}

const ACTION_LABEL: Record<string, string> = {
  login: "Logged in",
  submitted: "Requisition submitted",
  allocated: "Vehicle allocated",
  denied: "Request denied",
  cancelled: "Request cancelled",
  vehicle_added: "Vehicle added",
  vehicle_removed: "Vehicle removed",
  driver_added: "Driver added",
  driver_removed: "Driver removed",
  driver_restored: "Driver restored",
  completed: "Trip marked completed",
  admin_cancelled: "Approved trip cancelled",
  reapproved: "Denial reversed",
  reassigned: "Trip reassigned",
  vehicle_updated: "Vehicle details edited",
  vehicle_unavailable: "Vehicle taken out of service",
  vehicle_available: "Vehicle back in service",
  maintenance_scheduled: "Maintenance scheduled",
  maintenance_completed: "Maintenance completed",
  maintenance_cancelled: "Maintenance cancelled",
  fuel_logged: "Fuel logged",
  user_created: "Account created",
  user_updated: "Account changed",
  settings_updated: "Settings changed",
};

function describeDetails(action: string, details: unknown): string | null {
  if (!details || typeof details !== "object") return null;
  const d = details as Record<string, unknown>;
  switch (action) {
    case "denied":
      return d.reason ? `Reason: ${d.reason}` : null;
    case "vehicle_added":
      return d.reg_no ? `${d.reg_no} — ${d.model ?? ""}`.trim() : null;
    case "driver_added":
      return typeof d.name === "string" ? d.name : null;
    case "reassigned":
      return d.reason ? `Reason: ${d.reason}` : null;
    case "admin_cancelled":
      return d.reason ? `Reason: ${d.reason}` : null;
    case "vehicle_unavailable":
      return [d.reg_no, d.override, d.note].filter(Boolean).join(" — ") || null;
    case "vehicle_available":
    case "vehicle_updated":
      return typeof d.reg_no === "string" ? d.reg_no : null;
    case "maintenance_scheduled":
      return [d.reg_no, d.kind, d.scheduled_for].filter(Boolean).join(" — ") || null;
    case "fuel_logged":
      return d.reg_no ? `${d.reg_no} — ${d.litres} L` : null;
    case "user_created":
      return d.name ? `${d.name} (${d.role})` : null;
    case "user_updated":
      return d.name ? `${d.name}: ${Array.isArray(d.changes) ? d.changes.join(", ") : ""}` : null;
    case "allocated":
      return d.vehicleId ? `Vehicle #${d.vehicleId}, driver #${d.driverId}` : null;
    default:
      return null;
  }
}

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

export default function ActivityLogPage() {
  const [date, setDate] = useState(todayISO());
  const [showAllDates, setShowAllDates] = useState(true);
  const [entries, setEntries] = useState<ActivityLogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await api.listActivityLog(showAllDates ? undefined : date);
      setEntries(r.entries);
    } catch (err: any) {
      setError(err.message || "Could not load the activity log.");
    } finally {
      setLoading(false);
    }
  }, [date, showAllDates]);

  useEffect(() => {
    load();
  }, [load]);

  async function handleDelete(id: number) {
    setError("");
    setBusyId(id);
    try {
      await api.deleteActivityLogEntry(id);
      setEntries((prev) => prev.filter((e) => e.id !== id));
    } catch (err: any) {
      setError(err.message || "Could not delete that entry.");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <AppShell>
      <div className="mb-7 flex items-start justify-between gap-4 print:hidden">
        <div>
          <h1 className="font-head font-semibold text-xl text-ink">Activity Log</h1>
          <p className="text-sm text-muted mt-1">
            Every login, submit, allocation, reassignment, denial, cancellation, fleet, maintenance and account change — most recent first.
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <label className="flex items-center gap-1.5 text-xs text-muted">
            <input
              type="checkbox"
              checked={showAllDates}
              onChange={(e) => setShowAllDates(e.target.checked)}
              className="accent-teal"
            />
            All dates
          </label>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            disabled={showAllDates}
            className="rounded-lg bg-surface2 border border-border px-3 py-2 text-sm text-ink outline-none focus:border-teal/60 disabled:opacity-40"
          />
          <button
            onClick={() => window.print()}
            className="flex items-center gap-1.5 rounded-lg border border-border text-ink text-sm px-3 py-2 hover:bg-surface2 transition-colors"
          >
            <Printer size={15} />
            Print
          </button>
        </div>
      </div>

      {error && <p className="text-xs text-red mb-4 print:hidden">{error}</p>}

      {loading ? (
        <SkeletonTable rows={7} cols={7} />
      ) : entries.length === 0 ? (
        <EmptyState
          icon={ScrollText}
          title={showAllDates ? "No activity recorded yet" : "Nothing on this date"}
          description={showAllDates ? undefined : "Try toggling \"All dates\" or picking a different day."}
        />
      ) : (
        <div className="rounded-xl border border-border bg-surface shadow-soft overflow-hidden overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-muted text-xs uppercase tracking-wide border-b border-border">
                <th className="px-4 py-3 font-medium">When</th>
                <th className="px-4 py-3 font-medium">Who</th>
                <th className="px-4 py-3 font-medium">Role</th>
                <th className="px-4 py-3 font-medium">Action</th>
                <th className="px-4 py-3 font-medium">Requisition</th>
                <th className="px-4 py-3 font-medium">Details</th>
                <th className="px-4 py-3 font-medium print:hidden"></th>
              </tr>
            </thead>
            <tbody>
              {entries.map((e) => (
                <tr key={e.id} className="border-b border-border last:border-0">
                  <td className="px-4 py-3 text-muted whitespace-nowrap">
                    {new Date(e.created_at).toLocaleString()}
                  </td>
                  <td className="px-4 py-3 text-ink">{e.actor_name ?? "—"}</td>
                  <td className="px-4 py-3 text-muted capitalize">{e.actor_role.replace("_", " ")}</td>
                  <td className="px-4 py-3 text-ink">{ACTION_LABEL[e.action] ?? e.action}</td>
                  <td className="px-4 py-3 font-mono text-muted">
                    {e.requisitions ? `#${e.requisitions.sno} — ${e.requisitions.requester}` : "—"}
                  </td>
                  <td className="px-4 py-3 text-muted">{describeDetails(e.action, e.details) ?? "—"}</td>
                  <td className="px-4 py-3 print:hidden">
                    <button
                      onClick={() => handleDelete(e.id)}
                      disabled={busyId === e.id}
                      className="text-muted hover:text-red transition-colors disabled:opacity-50"
                      aria-label="Delete entry"
                    >
                      <Trash2 size={14} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </AppShell>
  );
}

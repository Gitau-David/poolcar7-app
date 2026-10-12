"use client";

import { useEffect, useState, useCallback } from "react";
import AppShell from "@/components/AppShell";
import { api } from "@/lib/api";
import { useSession } from "@/lib/session-context";
import { can } from "@/lib/permissions";
import type { FleetUsageRow, OpsReport } from "@/lib/types";
import { SkeletonTable } from "@/components/Skeleton";

const PERIODS = [7, 30, 90];

function Stat({ label, value, hint }: { label: string; value: string | number; hint?: string }) {
  return (
    <div className="rounded-xl border border-border bg-surface shadow-soft px-4 py-3.5">
      <div className="font-mono text-lg text-ink leading-none">{value}</div>
      <div className="text-[11px] text-muted mt-1.5">{label}</div>
      {hint && <div className="text-[11px] text-muted/70 mt-0.5">{hint}</div>}
    </div>
  );
}

export default function ReportsPage() {
  const session = useSession();
  const showFleet = can(session?.role, "fleet:reports");
  const showOps = can(session?.role, "ops:reports");
  const [days, setDays] = useState(30);
  const [fleet, setFleet] = useState<FleetUsageRow[] | null>(null);
  const [ops, setOps] = useState<OpsReport | null>(null);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setError("");
    try {
      if (showFleet) setFleet((await api.fleetReport(days)).rows);
      if (showOps) setOps((await api.opsReport(days)).report);
    } catch (err: any) {
      setError(err.message || "Could not load reports.");
    }
  }, [days, showFleet, showOps]);

  useEffect(() => {
    if (session) load();
  }, [load, session]);

  return (
    <AppShell>
      <div className="mb-7 flex items-start justify-between gap-4">
        <div>
          <h1 className="font-head font-semibold text-xl text-ink">Reports</h1>
          <p className="text-sm text-muted mt-1">
            {showFleet && showOps
              ? "Vehicle usage and operational performance."
              : showFleet
              ? "How each vehicle has been used, fuelled and maintained."
              : "How quickly requests are being decided, and what's waiting."}
          </p>
        </div>
        <div className="flex rounded-lg border border-border overflow-hidden shrink-0">
          {PERIODS.map((p) => (
            <button
              key={p}
              onClick={() => setDays(p)}
              className={`px-3 py-2 text-sm transition-colors ${days === p ? "bg-teal/15 text-ink" : "text-muted hover:text-ink"}`}
            >
              {p}d
            </button>
          ))}
        </div>
      </div>

      {error && <p className="text-xs text-red mb-4">{error}</p>}

      <div className="space-y-10">
        {showOps && (
          <section>
            <h2 className="text-xs font-medium text-muted uppercase tracking-wide mb-3">Operations — last {days} days</h2>
            {!ops ? (
              <SkeletonTable rows={2} cols={4} />
            ) : (
              <div className="space-y-4">
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <Stat label="Requests submitted" value={ops.submitted} />
                  <Stat label="Approved / denied / cancelled" value={`${ops.approved} / ${ops.denied} / ${ops.cancelled}`} />
                  <Stat
                    label="Average time to decide"
                    value={ops.avg_hours_to_decision != null ? `${ops.avg_hours_to_decision} h` : "—"}
                  />
                  <Stat
                    label={`Decided within ${ops.sla_hours} h (SLA)`}
                    value={ops.sla_met_pct != null ? `${ops.sla_met_pct}%` : "—"}
                  />
                  <Stat label="Waiting for a decision now" value={ops.pending_now} />
                  <Stat label="Trips active now" value={ops.trips_active_now} />
                  <Stat label="Reassignments" value={ops.reassignments} />
                </div>

                {ops.pending_over_sla.length > 0 && (
                  <div className="rounded-xl border border-amber/30 bg-amber/5 overflow-hidden">
                    <div className="px-4 py-3 border-b border-amber/20 text-xs font-medium text-amber uppercase tracking-wide">
                      Past the {ops.sla_hours}-hour target
                    </div>
                    <div className="divide-y divide-border">
                      {ops.pending_over_sla.map((r) => (
                        <div key={r.sno} className="px-4 py-2.5 flex items-center justify-between text-sm">
                          <span className="text-ink">
                            <span className="font-mono text-amber mr-2">#{r.sno}</span>
                            {r.requester}
                          </span>
                          <span className="text-xs text-muted font-mono">waiting {r.hours_waiting} h</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {ops.by_department.length > 0 && (
                  <div className="rounded-xl border border-border bg-surface shadow-soft overflow-hidden max-w-md">
                    <div className="px-4 py-3 border-b border-border text-xs font-medium text-muted uppercase tracking-wide">
                      Requests by department
                    </div>
                    <div className="divide-y divide-border">
                      {ops.by_department.map((d) => (
                        <div key={d.department} className="px-4 py-2.5 flex items-center justify-between text-sm">
                          <span className="text-ink">{d.department}</span>
                          <span className="font-mono text-muted">{d.count}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </section>
        )}

        {showFleet && (
          <section>
            <h2 className="text-xs font-medium text-muted uppercase tracking-wide mb-3">Vehicle usage — last {days} days</h2>
            {!fleet ? (
              <SkeletonTable rows={4} cols={8} />
            ) : (
              <div className="rounded-xl border border-border bg-surface shadow-soft overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-muted text-xs border-b border-border">
                      <th className="px-4 py-3 font-medium">Vehicle</th>
                      <th className="px-4 py-3 font-medium text-right">Trips</th>
                      <th className="px-4 py-3 font-medium text-right">Days booked</th>
                      <th className="px-4 py-3 font-medium text-right">Utilisation</th>
                      <th className="px-4 py-3 font-medium text-right">Fuel (L)</th>
                      <th className="px-4 py-3 font-medium text-right">Fuel cost</th>
                      <th className="px-4 py-3 font-medium text-right">km / L</th>
                      <th className="px-4 py-3 font-medium text-right">Maintenance cost</th>
                      <th className="px-4 py-3 font-medium text-right">Odometer</th>
                    </tr>
                  </thead>
                  <tbody>
                    {fleet.map((r) => (
                      <tr key={r.vehicle_id} className="border-b border-border last:border-0">
                        <td className="px-4 py-3">
                          <div className="font-mono text-ink">{r.reg_no}</div>
                          <div className="text-xs text-muted">
                            {r.model}
                            {r.unavailable_reason && <span className="text-amber ml-2">{r.unavailable_reason}</span>}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-right font-mono text-ink">{r.trips}</td>
                        <td className="px-4 py-3 text-right font-mono text-ink">{r.days_booked}</td>
                        <td className="px-4 py-3 text-right">
                          <div className="inline-flex items-center gap-2">
                            <span className="h-1.5 w-16 rounded-full bg-surface2 overflow-hidden">
                              <span className="block h-full bg-teal" style={{ width: `${r.utilisation_pct}%` }} />
                            </span>
                            <span className="font-mono text-ink w-9">{r.utilisation_pct}%</span>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-right font-mono text-ink">{r.fuel_litres}</td>
                        <td className="px-4 py-3 text-right font-mono text-muted">{r.fuel_cost.toLocaleString()}</td>
                        <td className="px-4 py-3 text-right font-mono text-muted">{r.km_per_litre ?? "—"}</td>
                        <td className="px-4 py-3 text-right font-mono text-muted">{r.maintenance_cost.toLocaleString()}</td>
                        <td className="px-4 py-3 text-right font-mono text-muted">{r.odometer_km != null ? r.odometer_km.toLocaleString() : "—"}</td>
                      </tr>
                    ))}
                    {fleet.length === 0 && (
                      <tr>
                        <td colSpan={9} className="px-4 py-6 text-center text-muted text-sm">
                          No vehicles yet.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}
            <p className="text-xs text-muted mt-2">
              Utilisation counts days a vehicle was on an approved trip. km / L needs at least two fuel logs with
              odometer readings in the period.
            </p>
          </section>
        )}
      </div>
    </AppShell>
  );
}

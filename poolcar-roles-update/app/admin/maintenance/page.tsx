"use client";

import { useEffect, useState, useCallback } from "react";
import AppShell from "@/components/AppShell";
import { api } from "@/lib/api";
import type { Vehicle, MaintenanceRecord, FuelLog } from "@/lib/types";
import { Plus, CheckCircle2, XCircle, Fuel } from "lucide-react";

const KINDS = [
  { value: "service", label: "Service" },
  { value: "repair", label: "Repair" },
  { value: "inspection", label: "Inspection" },
  { value: "insurance", label: "Insurance renewal" },
  { value: "other", label: "Other" },
];

const inputCls =
  "rounded-lg bg-surface2 border border-border px-3 py-2 text-sm text-ink outline-none focus:border-teal/60 w-full";

export default function MaintenancePage() {
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [records, setRecords] = useState<MaintenanceRecord[]>([]);
  const [fuel, setFuel] = useState<FuelLog[]>([]);
  const [error, setError] = useState("");

  const [job, setJob] = useState({ vehicle_id: "", kind: "service", scheduled_for: "", expected_back: "", notes: "" });
  const [jobError, setJobError] = useState("");

  const [fuelForm, setFuelForm] = useState({ vehicle_id: "", litres: "", cost: "", odometer_km: "", logged_on: "" });
  const [fuelError, setFuelError] = useState("");

  const [completingId, setCompletingId] = useState<number | null>(null);
  const [done, setDone] = useState({ cost: "", completed_on: "", renewed_until: "" });
  const [rowError, setRowError] = useState<{ id: number; message: string } | null>(null);

  const load = useCallback(async () => {
    try {
      const [v, m, f] = await Promise.all([api.listVehicles(true), api.listMaintenance(), api.listFuelLogs()]);
      setVehicles(v.vehicles);
      setRecords(m.records);
      setFuel(f.logs);
      setError("");
    } catch (err: any) {
      setError(err.message || "Could not load maintenance data.");
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const active = vehicles.filter((v) => v.active);
  const reg = (id: number) => vehicles.find((v) => v.id === id)?.reg_no ?? `#${id}`;
  const today = new Date().toISOString().slice(0, 10);
  const open = records.filter((r) => !r.completed_on).sort((a, b) => a.scheduled_for.localeCompare(b.scheduled_for));
  const finished = records.filter((r) => r.completed_on).slice(0, 10);

  async function schedule(e: React.FormEvent) {
    e.preventDefault();
    setJobError("");
    if (!job.vehicle_id || !job.scheduled_for) return setJobError("Pick a vehicle and a start date.");
    try {
      await api.scheduleMaintenance({
        vehicle_id: Number(job.vehicle_id),
        kind: job.kind,
        scheduled_for: job.scheduled_for,
        expected_back: job.expected_back || undefined,
        notes: job.notes || undefined,
      });
      setJob({ vehicle_id: "", kind: "service", scheduled_for: "", expected_back: "", notes: "" });
      load();
    } catch (err: any) {
      setJobError(err.message);
    }
  }

  async function complete(r: MaintenanceRecord) {
    setRowError(null);
    try {
      await api.completeMaintenance(r.id, {
        cost: done.cost === "" ? "" : Number(done.cost),
        completed_on: done.completed_on || undefined,
        renewed_until: done.renewed_until || undefined,
      });
      setCompletingId(null);
      setDone({ cost: "", completed_on: "", renewed_until: "" });
      load();
    } catch (err: any) {
      setRowError({ id: r.id, message: err.message });
    }
  }

  async function cancel(id: number) {
    setRowError(null);
    try {
      await api.cancelMaintenance(id);
      load();
    } catch (err: any) {
      setRowError({ id, message: err.message });
    }
  }

  async function logFuel(e: React.FormEvent) {
    e.preventDefault();
    setFuelError("");
    if (!fuelForm.vehicle_id || !fuelForm.litres) return setFuelError("Pick a vehicle and enter the litres.");
    try {
      await api.addFuelLog({
        vehicle_id: Number(fuelForm.vehicle_id),
        litres: Number(fuelForm.litres),
        cost: fuelForm.cost === "" ? "" : Number(fuelForm.cost),
        odometer_km: fuelForm.odometer_km === "" ? "" : Number(fuelForm.odometer_km),
        logged_on: fuelForm.logged_on || undefined,
      });
      setFuelForm({ vehicle_id: fuelForm.vehicle_id, litres: "", cost: "", odometer_km: "", logged_on: "" });
      load();
    } catch (err: any) {
      setFuelError(err.message);
    }
  }

  return (
    <AppShell>
      <div className="mb-7">
        <h1 className="font-head font-semibold text-xl text-ink">Maintenance &amp; Fuel</h1>
        <p className="text-sm text-muted mt-1">
          Schedule servicing, inspections and insurance renewals — a vehicle with an open job is kept out of
          allocation for those dates automatically. Log fuel to track consumption and mileage.
        </p>
      </div>

      {error && <p className="text-xs text-red mb-4">{error}</p>}

      <div className="grid lg:grid-cols-2 gap-6">
        <section className="space-y-4">
          <h2 className="text-xs font-medium text-muted uppercase tracking-wide">Schedule a job</h2>
          <form onSubmit={schedule} className="rounded-xl border border-border bg-surface shadow-soft p-4 space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <label className="block">
                <span className="text-xs text-muted mb-1 block">Vehicle</span>
                <select value={job.vehicle_id} onChange={(e) => setJob({ ...job, vehicle_id: e.target.value })} className={inputCls}>
                  <option value="">Select…</option>
                  {active.map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.reg_no}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block">
                <span className="text-xs text-muted mb-1 block">Job type</span>
                <select value={job.kind} onChange={(e) => setJob({ ...job, kind: e.target.value })} className={inputCls}>
                  {KINDS.map((k) => (
                    <option key={k.value} value={k.value}>
                      {k.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block">
                <span className="text-xs text-muted mb-1 block">Starts</span>
                <input type="date" value={job.scheduled_for} onChange={(e) => setJob({ ...job, scheduled_for: e.target.value })} className={inputCls} />
              </label>
              <label className="block">
                <span className="text-xs text-muted mb-1 block">Expected back</span>
                <input type="date" value={job.expected_back} onChange={(e) => setJob({ ...job, expected_back: e.target.value })} className={inputCls} />
              </label>
            </div>
            <input value={job.notes} onChange={(e) => setJob({ ...job, notes: e.target.value })} placeholder="Notes (optional)" className={inputCls} />
            {jobError && <p className="text-xs text-red">{jobError}</p>}
            <button className="flex items-center gap-1.5 rounded-lg bg-teal text-bg font-medium text-sm px-4 py-2 hover:opacity-90">
              <Plus size={15} />
              Schedule
            </button>
          </form>

          <h2 className="text-xs font-medium text-muted uppercase tracking-wide pt-2">Open jobs</h2>
          <div className="space-y-2">
            {open.map((r) => {
              const overdue = (r.expected_back ?? r.scheduled_for) < today;
              const canRenew = r.kind === "insurance" || r.kind === "inspection";
              return (
                <div key={r.id} className="rounded-xl border border-border bg-surface shadow-soft px-4 py-3">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="text-sm text-ink">
                        <span className="font-mono mr-2">{reg(r.vehicle_id)}</span>
                        {KINDS.find((k) => k.value === r.kind)?.label ?? r.kind}
                      </div>
                      <div className="text-xs text-muted mt-0.5">
                        {r.scheduled_for}
                        {r.expected_back && ` → ${r.expected_back}`}
                        {overdue && <span className="text-red ml-2">overdue</span>}
                        {r.notes && <> · {r.notes}</>}
                      </div>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      <button
                        onClick={() => { setCompletingId(completingId === r.id ? null : r.id); setRowError(null); }}
                        className="flex items-center gap-1.5 text-xs text-muted hover:text-teal transition-colors"
                      >
                        <CheckCircle2 size={13} />
                        Complete
                      </button>
                      <button onClick={() => cancel(r.id)} className="flex items-center gap-1.5 text-xs text-muted hover:text-red transition-colors">
                        <XCircle size={13} />
                        Cancel
                      </button>
                    </div>
                  </div>
                  {completingId === r.id && (
                    <div className="mt-3 grid grid-cols-2 gap-2">
                      <input type="number" min={0} step="0.01" value={done.cost} onChange={(e) => setDone({ ...done, cost: e.target.value })} placeholder="Cost" className={inputCls} />
                      <input type="date" value={done.completed_on} onChange={(e) => setDone({ ...done, completed_on: e.target.value })} className={inputCls} aria-label="Completed on" />
                      {canRenew && (
                        <label className="col-span-2 block">
                          <span className="text-xs text-muted mb-1 block">
                            New {r.kind === "insurance" ? "insurance expiry" : "inspection due date"} (updates the vehicle record)
                          </span>
                          <input type="date" value={done.renewed_until} onChange={(e) => setDone({ ...done, renewed_until: e.target.value })} className={inputCls} />
                        </label>
                      )}
                      <button onClick={() => complete(r)} className="col-span-2 rounded-lg bg-teal text-bg font-medium text-sm py-2 hover:opacity-90">
                        Mark complete
                      </button>
                    </div>
                  )}
                  {rowError?.id === r.id && <p className="text-xs text-red mt-2">{rowError.message}</p>}
                </div>
              );
            })}
            {open.length === 0 && <p className="text-sm text-muted">No open jobs.</p>}
          </div>

          {finished.length > 0 && (
            <>
              <h2 className="text-xs font-medium text-muted uppercase tracking-wide pt-2">Recently completed</h2>
              <div className="rounded-xl border border-border bg-surface shadow-soft divide-y divide-border">
                {finished.map((r) => (
                  <div key={r.id} className="px-4 py-2.5 flex items-center justify-between text-sm">
                    <span className="text-ink">
                      <span className="font-mono mr-2">{reg(r.vehicle_id)}</span>
                      {KINDS.find((k) => k.value === r.kind)?.label ?? r.kind}
                    </span>
                    <span className="text-xs text-muted font-mono">
                      {r.completed_on}
                      {r.cost != null && ` · ${Number(r.cost).toLocaleString()}`}
                    </span>
                  </div>
                ))}
              </div>
            </>
          )}
        </section>

        <section className="space-y-4">
          <h2 className="text-xs font-medium text-muted uppercase tracking-wide">Log fuel</h2>
          <form onSubmit={logFuel} className="rounded-xl border border-border bg-surface shadow-soft p-4 space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <label className="block">
                <span className="text-xs text-muted mb-1 block">Vehicle</span>
                <select value={fuelForm.vehicle_id} onChange={(e) => setFuelForm({ ...fuelForm, vehicle_id: e.target.value })} className={inputCls}>
                  <option value="">Select…</option>
                  {active.map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.reg_no}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block">
                <span className="text-xs text-muted mb-1 block">Date</span>
                <input type="date" value={fuelForm.logged_on} onChange={(e) => setFuelForm({ ...fuelForm, logged_on: e.target.value })} className={inputCls} />
              </label>
              <label className="block">
                <span className="text-xs text-muted mb-1 block">Litres</span>
                <input type="number" min={0} step="0.01" value={fuelForm.litres} onChange={(e) => setFuelForm({ ...fuelForm, litres: e.target.value })} className={`${inputCls} font-mono`} />
              </label>
              <label className="block">
                <span className="text-xs text-muted mb-1 block">Cost</span>
                <input type="number" min={0} step="0.01" value={fuelForm.cost} onChange={(e) => setFuelForm({ ...fuelForm, cost: e.target.value })} className={`${inputCls} font-mono`} />
              </label>
              <label className="block col-span-2">
                <span className="text-xs text-muted mb-1 block">Odometer reading (km) — also updates the vehicle&apos;s mileage</span>
                <input type="number" min={0} value={fuelForm.odometer_km} onChange={(e) => setFuelForm({ ...fuelForm, odometer_km: e.target.value })} className={`${inputCls} font-mono`} />
              </label>
            </div>
            {fuelError && <p className="text-xs text-red">{fuelError}</p>}
            <button className="flex items-center gap-1.5 rounded-lg bg-teal text-bg font-medium text-sm px-4 py-2 hover:opacity-90">
              <Fuel size={15} />
              Log fuel
            </button>
          </form>

          <h2 className="text-xs font-medium text-muted uppercase tracking-wide pt-2">Recent fuel logs</h2>
          <div className="rounded-xl border border-border bg-surface shadow-soft overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-muted text-xs border-b border-border">
                  <th className="px-4 py-2.5 font-medium">Date</th>
                  <th className="px-4 py-2.5 font-medium">Vehicle</th>
                  <th className="px-4 py-2.5 font-medium text-right">Litres</th>
                  <th className="px-4 py-2.5 font-medium text-right">Cost</th>
                  <th className="px-4 py-2.5 font-medium text-right">Odometer</th>
                </tr>
              </thead>
              <tbody>
                {fuel.slice(0, 15).map((f) => (
                  <tr key={f.id} className="border-b border-border last:border-0">
                    <td className="px-4 py-2.5 text-muted font-mono">{f.logged_on}</td>
                    <td className="px-4 py-2.5 font-mono text-ink">{reg(f.vehicle_id)}</td>
                    <td className="px-4 py-2.5 text-right font-mono text-ink">{Number(f.litres).toFixed(1)}</td>
                    <td className="px-4 py-2.5 text-right font-mono text-muted">{f.cost != null ? Number(f.cost).toLocaleString() : "—"}</td>
                    <td className="px-4 py-2.5 text-right font-mono text-muted">{f.odometer_km != null ? f.odometer_km.toLocaleString() : "—"}</td>
                  </tr>
                ))}
                {fuel.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-4 py-6 text-center text-muted text-sm">
                      No fuel logged yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </AppShell>
  );
}

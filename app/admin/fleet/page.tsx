"use client";

import { useEffect, useState, useCallback } from "react";
import AppShell from "@/components/AppShell";
import { api } from "@/lib/api";
import type { Vehicle, Driver, VehicleOverride } from "@/lib/types";
function Icon({ size = 16, children }: { size?: number; children: React.ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}

const Trash2 = ({ size }: { size?: number }) => <Icon size={size}><path d="M3 6h18M8 6V4h8v2m3 0-1 14H6L5 6m4 4v6m6-6v6" /></Icon>;
const Plus = ({ size }: { size?: number }) => <Icon size={size}><path d="M12 5v14M5 12h14" /></Icon>;
const RotateCcw = ({ size }: { size?: number }) => <Icon size={size}><path d="M3 12a9 9 0 1 0 2.6-6.4L3 8m0-5v5h5" /></Icon>;
const Pencil = ({ size }: { size?: number }) => <Icon size={size}><path d="m15 5 4 4M4 20l4-.8L19 8a2.8 2.8 0 0 0-4-4L4 15z" /></Icon>;
const PowerOff = ({ size }: { size?: number }) => <Icon size={size}><path d="M18.4 6.6a9 9 0 1 1-12.8 0M12 2v10" /></Icon>;
const Power = ({ size }: { size?: number }) => <Icon size={size}><path d="M18.4 6.6a9 9 0 1 1-12.8 0M12 2v10" /></Icon>;
const X = ({ size }: { size?: number }) => <Icon size={size}><path d="m18 6-12 12M6 6l12 12" /></Icon>;

const OVERRIDE_LABEL: Record<VehicleOverride, string> = {
  maintenance: "In maintenance",
  breakdown: "Broken down",
  unavailable: "Out of service",
};

function daysUntil(date: string | null): number | null {
  if (!date) return null;
  const today = new Date().toISOString().slice(0, 10);
  return Math.round((Date.parse(date) - Date.parse(today)) / 86400000);
}

function Expiry({ label, date }: { label: string; date: string | null }) {
  const left = daysUntil(date);
  const tone = left === null ? "text-muted" : left < 0 ? "text-red" : left <= 14 ? "text-amber" : "text-muted";
  return (
    <span className={tone}>
      {label}: {date ?? "not set"}
      {left !== null && left < 0 && " (expired)"}
      {left !== null && left >= 0 && left <= 14 && ` (${left}d)`}
    </span>
  );
}

type EditForm = {
  reg_no: string;
  model: string;
  insurance_expiry: string;
  inspection_expiry: string;
  odometer_km: string;
  default_driver_id: string;
};

export default function FleetPage() {
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [add, setAdd] = useState<EditForm>({
    reg_no: "",
    model: "",
    insurance_expiry: "",
    inspection_expiry: "",
    odometer_km: "",
    default_driver_id: "",
  });
  const [addError, setAddError] = useState("");
  const [rowError, setRowError] = useState<{ id: number; message: string } | null>(null);
  const [notice, setNotice] = useState("");
  const [editingId, setEditingId] = useState<number | null>(null);
  const [edit, setEdit] = useState<EditForm | null>(null);
  const [offlineId, setOfflineId] = useState<number | null>(null);
  const [offlineKind, setOfflineKind] = useState<VehicleOverride>("unavailable");
  const [offlineNote, setOfflineNote] = useState("");

  // Fetch with all=true so removed (inactive) vehicles are still visible here —
  // dimmed, with a Restore button — instead of just vanishing.
  const load = useCallback(async () => {
    const [v, d] = await Promise.all([api.listVehicles(true), api.listDrivers()]);
    setVehicles(v.vehicles);
    setDrivers(d.drivers);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const driverName = (id: number | null) => drivers.find((d) => d.id === id)?.name;

  async function addVehicle(e: React.FormEvent) {
    e.preventDefault();
    setAddError("");
    if (!add.reg_no.trim() || !add.model.trim()) return setAddError("Reg. no and model are required.");
    try {
      await api.addVehicle(add.reg_no.trim(), add.model.trim(), {
        insurance_expiry: add.insurance_expiry || undefined,
        inspection_expiry: add.inspection_expiry || undefined,
        odometer_km: add.odometer_km === "" ? "" : Number(add.odometer_km),
        default_driver_id: add.default_driver_id ? Number(add.default_driver_id) : null,
      });
      setAdd({ reg_no: "", model: "", insurance_expiry: "", inspection_expiry: "", odometer_km: "", default_driver_id: "" });
      load();
    } catch (err: any) {
      setAddError(err.message);
    }
  }

  function startEdit(v: Vehicle) {
    setRowError(null);
    setEditingId(v.id);
    setEdit({
      reg_no: v.reg_no,
      model: v.model,
      insurance_expiry: v.insurance_expiry ?? "",
      inspection_expiry: v.inspection_expiry ?? "",
      odometer_km: v.odometer_km != null ? String(v.odometer_km) : "",
      default_driver_id: v.default_driver_id ? String(v.default_driver_id) : "",
    });
  }

  async function saveEdit(id: number) {
    if (!edit) return;
    setRowError(null);
    try {
      await api.updateVehicle(id, {
        reg_no: edit.reg_no,
        model: edit.model,
        insurance_expiry: edit.insurance_expiry || null,
        inspection_expiry: edit.inspection_expiry || null,
        odometer_km: edit.odometer_km === "" ? null : Number(edit.odometer_km),
        default_driver_id: edit.default_driver_id ? Number(edit.default_driver_id) : null,
      });
      setEditingId(null);
      setEdit(null);
      load();
    } catch (err: any) {
      setRowError({ id, message: err.message });
    }
  }

  async function takeOffline(id: number) {
    setRowError(null);
    setNotice("");
    try {
      const { affected } = await api.setVehicleAvailability(id, offlineKind, offlineNote.trim() || undefined);
      setOfflineId(null);
      setOfflineNote("");
      if (affected.length > 0) {
        setNotice(
          `Marked ${OFFLINE_WORD[offlineKind]}. Trip(s) ${affected.map((n) => `#${n}`).join(", ")} now need reassigning — requesters were notified and Operations will see them flagged.`
        );
      }
      load();
    } catch (err: any) {
      setRowError({ id, message: err.message });
    }
  }

  async function backInService(id: number) {
    setRowError(null);
    setNotice("");
    try {
      await api.setVehicleAvailability(id, null);
      load();
    } catch (err: any) {
      setRowError({ id, message: err.message });
    }
  }

  async function removeVehicle(id: number) {
    setRowError(null);
    try {
      await api.removeVehicle(id);
      load();
    } catch (err: any) {
      setRowError({ id, message: err.message });
    }
  }

  async function restoreVehicle(v: Vehicle) {
    setRowError(null);
    try {
      await api.addVehicle(v.reg_no, v.model);
      load();
    } catch (err: any) {
      setRowError({ id: v.id, message: err.message });
    }
  }

  const inputCls =
    "rounded-lg bg-surface2 border border-border px-3 py-2 text-sm text-ink outline-none focus:border-teal/60 w-full";

  return (
    <AppShell>
      <div className="mb-7">
        <h1 className="font-head font-semibold text-xl text-ink">Manage Fleet</h1>
        <p className="text-sm text-muted mt-1">
          Register and edit vehicles, keep insurance and inspection dates current, set a default driver, and take a
          vehicle out of service. A vehicle with a Scheduled or Active trip can&apos;t be removed or taken out for
          planned work until Operations moves that trip — a breakdown is the exception. Removal never deletes history.
          Drivers are managed by Operations.
        </p>
      </div>

      {notice && <div className="mb-6 rounded-xl border border-amber/30 bg-amber/5 px-4 py-3 text-sm text-ink">{notice}</div>}

      <section>
        <h2 className="text-xs font-medium text-muted uppercase tracking-wide mb-3">Add a vehicle</h2>
        <form onSubmit={addVehicle} className="rounded-xl border border-border bg-surface shadow-soft p-4 mb-3">
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
            <label className="block">
              <span className="text-xs text-muted mb-1 block">Reg. no</span>
              <input value={add.reg_no} onChange={(e) => setAdd({ ...add, reg_no: e.target.value })} className={`${inputCls} font-mono`} />
            </label>
            <label className="block">
              <span className="text-xs text-muted mb-1 block">Model</span>
              <input value={add.model} onChange={(e) => setAdd({ ...add, model: e.target.value })} className={inputCls} />
            </label>
            <label className="block">
              <span className="text-xs text-muted mb-1 block">Odometer (km)</span>
              <input type="number" min={0} value={add.odometer_km} onChange={(e) => setAdd({ ...add, odometer_km: e.target.value })} className={`${inputCls} font-mono`} />
            </label>
            <label className="block">
              <span className="text-xs text-muted mb-1 block">Insurance expires</span>
              <input type="date" value={add.insurance_expiry} onChange={(e) => setAdd({ ...add, insurance_expiry: e.target.value })} className={inputCls} />
            </label>
            <label className="block">
              <span className="text-xs text-muted mb-1 block">Inspection due</span>
              <input type="date" value={add.inspection_expiry} onChange={(e) => setAdd({ ...add, inspection_expiry: e.target.value })} className={inputCls} />
            </label>
            <label className="block">
              <span className="text-xs text-muted mb-1 block">Default driver</span>
              <select value={add.default_driver_id} onChange={(e) => setAdd({ ...add, default_driver_id: e.target.value })} className={inputCls}>
                <option value="">None</option>
                {drivers.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <button className="mt-4 flex items-center gap-1.5 rounded-lg bg-teal text-bg font-medium text-sm px-4 py-2 hover:opacity-90 transition-opacity">
            <Plus size={15} />
            Add vehicle
          </button>
        </form>
        {addError && <p className="text-xs text-red mb-3">{addError}</p>}
      </section>

      <section className="mt-7">
        <h2 className="text-xs font-medium text-muted uppercase tracking-wide mb-3">Vehicles</h2>
        <div className="space-y-2">
          {vehicles.map((v) => (
            <div
              key={v.id}
              className={`rounded-xl border border-border bg-surface shadow-soft px-4 py-3 ${!v.active ? "opacity-50" : ""}`}
            >
              {editingId === v.id && edit ? (
                <div className="space-y-3">
                  <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
                    <input value={edit.reg_no} onChange={(e) => setEdit({ ...edit, reg_no: e.target.value })} className={`${inputCls} font-mono`} aria-label="Reg. no" />
                    <input value={edit.model} onChange={(e) => setEdit({ ...edit, model: e.target.value })} className={inputCls} aria-label="Model" />
                    <input type="number" min={0} value={edit.odometer_km} onChange={(e) => setEdit({ ...edit, odometer_km: e.target.value })} placeholder="Odometer km" className={`${inputCls} font-mono`} />
                    <label className="block">
                      <span className="text-xs text-muted mb-1 block">Insurance expires</span>
                      <input type="date" value={edit.insurance_expiry} onChange={(e) => setEdit({ ...edit, insurance_expiry: e.target.value })} className={inputCls} />
                    </label>
                    <label className="block">
                      <span className="text-xs text-muted mb-1 block">Inspection due</span>
                      <input type="date" value={edit.inspection_expiry} onChange={(e) => setEdit({ ...edit, inspection_expiry: e.target.value })} className={inputCls} />
                    </label>
                    <label className="block">
                      <span className="text-xs text-muted mb-1 block">Default driver</span>
                      <select value={edit.default_driver_id} onChange={(e) => setEdit({ ...edit, default_driver_id: e.target.value })} className={inputCls}>
                        <option value="">None</option>
                        {drivers.map((d) => (
                          <option key={d.id} value={d.id}>
                            {d.name}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>
                  <div className="flex gap-2">
                    <button onClick={() => saveEdit(v.id)} className="rounded-lg bg-teal text-bg font-medium text-sm px-4 py-2 hover:opacity-90">
                      Save
                    </button>
                    <button onClick={() => { setEditingId(null); setEdit(null); }} className="rounded-lg border border-border text-ink text-sm px-4 py-2 hover:bg-surface2">
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <div className="text-sm text-ink font-mono flex flex-wrap items-center gap-2">
                      {v.reg_no}
                      {!v.active && <span className="text-[10px] uppercase tracking-wide text-red font-sans">Removed</span>}
                      {v.active && v.unavailable_reason && (
                        <span className="text-[10px] uppercase tracking-wide text-amber font-sans">
                          {OVERRIDE_LABEL[v.unavailable_reason as VehicleOverride] ?? "In maintenance"}
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-muted">
                      {v.model}
                      {v.odometer_km != null && <> · {v.odometer_km.toLocaleString()} km</>}
                      {driverName(v.default_driver_id) && <> · default driver {driverName(v.default_driver_id)}</>}
                    </div>
                    <div className="text-xs mt-1 flex flex-wrap gap-x-4">
                      <Expiry label="Insurance" date={v.insurance_expiry} />
                      <Expiry label="Inspection" date={v.inspection_expiry} />
                    </div>
                    {v.status_override && v.override_note && <div className="text-xs text-muted mt-1">Note: {v.override_note}</div>}
                    {rowError?.id === v.id && <p className="text-xs text-red mt-1.5">{rowError.message}</p>}

                    {offlineId === v.id && (
                      <div className="mt-3 flex flex-wrap items-center gap-2">
                        <select value={offlineKind} onChange={(e) => setOfflineKind(e.target.value as VehicleOverride)} className="rounded-lg bg-surface2 border border-border px-3 py-2 text-sm text-ink outline-none">
                          <option value="unavailable">Out of service</option>
                          <option value="maintenance">In maintenance</option>
                          <option value="breakdown">Broken down (urgent)</option>
                        </select>
                        <input value={offlineNote} onChange={(e) => setOfflineNote(e.target.value)} placeholder="Note (optional)" className="rounded-lg bg-surface2 border border-border px-3 py-2 text-sm text-ink outline-none flex-1 min-w-[10rem]" />
                        <button onClick={() => takeOffline(v.id)} className="rounded-lg bg-amber text-bg font-medium text-sm px-3 py-2 hover:opacity-90">
                          Confirm
                        </button>
                        <button onClick={() => setOfflineId(null)} aria-label="Close" className="text-muted hover:text-ink p-1">
                          <X size={15} />
                        </button>
                      </div>
                    )}
                  </div>

                  <div className="flex items-center gap-1 shrink-0">
                    {v.active ? (
                      <>
                        <button onClick={() => startEdit(v)} className="text-muted hover:text-ink transition-colors p-1.5" aria-label={`Edit ${v.reg_no}`}>
                          <Pencil size={15} />
                        </button>
                        {v.status_override ? (
                          <button onClick={() => backInService(v.id)} className="flex items-center gap-1.5 text-xs text-teal hover:opacity-80 px-2 py-1">
                            <Power size={13} />
                            Back in service
                          </button>
                        ) : (
                          <button
                            onClick={() => { setOfflineId(v.id); setOfflineKind("unavailable"); setRowError(null); }}
                            className="text-muted hover:text-amber transition-colors p-1.5"
                            aria-label={`Take ${v.reg_no} out of service`}
                            title="Mark unavailable"
                          >
                            <PowerOff size={15} />
                          </button>
                        )}
                        <button onClick={() => removeVehicle(v.id)} className="text-muted hover:text-red transition-colors p-1.5" aria-label={`Remove ${v.reg_no}`}>
                          <Trash2 size={15} />
                        </button>
                      </>
                    ) : (
                      <button onClick={() => restoreVehicle(v)} className="flex items-center gap-1.5 text-xs text-teal hover:opacity-80 px-2 py-1">
                        <RotateCcw size={13} />
                        Restore
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>
          ))}
          {vehicles.length === 0 && <p className="text-sm text-muted">No vehicles yet.</p>}
        </div>
      </section>
    </AppShell>
  );
}

const OFFLINE_WORD: Record<VehicleOverride, string> = {
  maintenance: "in maintenance",
  breakdown: "broken down",
  unavailable: "out of service",
};

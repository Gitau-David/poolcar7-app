"use client";

import { useEffect, useState, useCallback, type SVGProps } from "react";
import AppShell from "@/components/AppShell";
import StatusBadge from "@/components/StatusBadge";
import AdminConfirmDialog from "@/components/AdminConfirmDialog";
import { api } from "@/lib/api";
import { useSession } from "@/lib/session-context";
import { can } from "@/lib/permissions";
import type { Requisition, Vehicle, Driver } from "@/lib/types";

type IconProps = SVGProps<SVGSVGElement> & { size?: number };

function IconBase(props: IconProps) {
  const { size = 16, ...rest } = props;
  return <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...rest} />;
}

function CheckCircleIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <circle cx="12" cy="12" r="9" />
      <path d="M8.5 12.5l2.5 2.5 5-6" />
    </IconBase>
  );
}

function ChevronRightIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <path d="M9 6l6 6-6 6" />
    </IconBase>
  );
}

function XCircleIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <circle cx="12" cy="12" r="9" />
      <path d="M9 9l6 6M15 9l-6 6" />
    </IconBase>
  );
}

function RotateCcwIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <path d="M3 12a9 9 0 1 0 2.64-6.36" />
      <path d="M3 4v5h5" />
    </IconBase>
  );
}

function ArrowLeftRightIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <path d="M7 7h10l-3-3" />
      <path d="M17 17H7l3 3" />
      <path d="M7 7v10" />
      <path d="M17 17V7" />
    </IconBase>
  );
}

type Selection = { requisition: Requisition; kind: "pending" | "denied" | "reassign" };
type Resolved = { kind: "approved" | "denied" | "reapproved" | "reassigned"; requisition: Requisition };

export default function AllocatePage() {
  const session = useSession();
  const canReassign = can(session?.role, "trips:reassign");
  const [requisitions, setRequisitions] = useState<Requisition[]>([]);
  const [denied, setDenied] = useState<Requisition[]>([]);
  const [trips, setTrips] = useState<Requisition[]>([]);
  const [allVehicles, setAllVehicles] = useState<Vehicle[]>([]);
  const [allDrivers, setAllDrivers] = useState<Driver[]>([]);
  const [selection, setSelection] = useState<Selection | null>(null);
  const [options, setOptions] = useState<{ vehicles: Vehicle[]; drivers: Driver[] } | null>(null);
  const [vehicleId, setVehicleId] = useState<number | "">("");
  const [driverId, setDriverId] = useState<number | "">("");
  const [denyReason, setDenyReason] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [confirming, setConfirming] = useState<"reapprove" | "reassign" | null>(null);
  const [justResolved, setJustResolved] = useState<Resolved | null>(null);

  const load = useCallback(async () => {
    const [{ requisitions: all }, v, d] = await Promise.all([
      api.listRequisitions(),
      api.listVehicles(true),
      api.listDrivers(true),
    ]);
    setRequisitions(all.filter((r) => r.status === "Pending Allocation"));
    setDenied(all.filter((r) => r.status === "Denied").slice(-5).reverse());
    setTrips(all.filter((r) => r.status === "Scheduled" || r.status === "Active"));
    setAllVehicles(v.vehicles);
    setAllDrivers(d.drivers);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function selectRequisition(r: Requisition, kind: Selection["kind"]) {
    setSelection({ requisition: r, kind });
    setVehicleId("");
    setDriverId("");
    setDenyReason("");
    setError("");
    setJustResolved(null);
    // The system computes availability server-side — nobody checks by hand.
    // For a reassignment the trip's own booking is ignored, so its current vehicle/driver stay selectable.
    const result = await api.availability(r.start_date, r.end_date, kind === "reassign" ? r.id : undefined);
    setOptions(result);
  }

  function pickVehicle(value: number | "") {
    setVehicleId(value);
    // Fleet Manager can set a default driver per vehicle — pre-select it when that driver is actually free.
    if (value && !driverId && options) {
      const v = options.vehicles.find((x) => x.id === value);
      if (v?.default_driver_id && options.drivers.some((d) => d.id === v.default_driver_id)) {
        setDriverId(v.default_driver_id);
      }
    }
  }

  function finish(resolved: Resolved) {
    setJustResolved(resolved);
    setSelection(null);
    setOptions(null);
    load();
  }

  async function handleApprove() {
    if (!selection || !vehicleId || !driverId) return;
    setError("");
    setSubmitting(true);
    try {
      const { requisition } = await api.allocate(selection.requisition.id, Number(vehicleId), Number(driverId));
      finish({ kind: "approved", requisition });
    } catch (err: any) {
      setError(err.message || "Could not allocate.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDeny() {
    if (!selection) return;
    setError("");
    setSubmitting(true);
    try {
      const { requisition } = await api.deny(selection.requisition.id, denyReason.trim() || undefined);
      finish({ kind: "denied", requisition });
    } catch (err: any) {
      setError(err.message || "Could not deny.");
    } finally {
      setSubmitting(false);
    }
  }

  async function confirmStepUp(name: string, pin: string, reason?: string) {
    if (!selection || !vehicleId || !driverId) return;
    if (confirming === "reassign") {
      const { requisition } = await api.reassign(
        selection.requisition.id,
        Number(vehicleId),
        Number(driverId),
        name,
        pin,
        reason ?? ""
      );
      setConfirming(null);
      finish({ kind: "reassigned", requisition });
    } else {
      const { requisition } = await api.reapprove(selection.requisition.id, Number(vehicleId), Number(driverId), name, pin);
      setConfirming(null);
      finish({ kind: "reapproved", requisition });
    }
  }

  const regOf = (id: number | null) => allVehicles.find((v) => v.id === id)?.reg_no ?? "—";
  const driverOf = (id: number | null) => allDrivers.find((d) => d.id === id)?.name ?? "—";
  const flaggedTrips = trips.filter((t) => allVehicles.find((v) => v.id === t.vehicle_id)?.status_override);

  return (
    <AppShell>
      <div className="mb-7">
        <h1 className="font-head font-semibold text-xl text-ink">Allocate Vehicle</h1>
        <p className="text-sm text-muted mt-1">
          Pick a request — the system checks the database for real conflicts and only shows vehicles and drivers
          that are actually free for those dates (vehicles the Fleet Manager has taken out of service are left out).
          Approve or deny it, or reassign a trip that&apos;s already approved.
        </p>
      </div>

      {justResolved && (
        <div
          className={`mb-6 rounded-xl border px-4 py-3.5 flex items-start gap-3 ${
            justResolved.kind === "denied" ? "border-red/40 bg-red/10" : "border-teal/40 bg-teal/10"
          }`}
        >
          {justResolved.kind === "denied" ? (
            <XCircleIcon size={18} className="text-red mt-0.5 shrink-0" />
          ) : (
            <CheckCircleIcon size={18} className="text-teal mt-0.5 shrink-0" />
          )}
          <div className="text-sm text-ink">
            {justResolved.kind === "approved" && (
              <>
                Allocated for <span className="font-mono text-teal">S.no {justResolved.requisition.sno}</span>. It now
                shows on the dashboard and in the allocation log.
              </>
            )}
            {justResolved.kind === "denied" && (
              <>
                Denied <span className="font-mono text-red">S.no {justResolved.requisition.sno}</span>.
              </>
            )}
            {justResolved.kind === "reapproved" && (
              <>
                Reapproved <span className="font-mono text-teal">S.no {justResolved.requisition.sno}</span> — the
                requester has been notified.
              </>
            )}
            {justResolved.kind === "reassigned" && (
              <>
                Reassigned <span className="font-mono text-teal">S.no {justResolved.requisition.sno}</span> — the
                requester has been notified, and any driver change is waiting under Drivers to be relayed.
              </>
            )}
          </div>
        </div>
      )}

      <div className="grid lg:grid-cols-2 gap-6">
        <section>
          <h2 className="text-xs font-medium text-muted uppercase tracking-wide mb-3">Pending Allocation</h2>
          <div className="space-y-2">
            {requisitions.map((r) => (
              <button
                key={r.id}
                onClick={() => selectRequisition(r, "pending")}
                className={`w-full text-left rounded-xl border bg-surface px-4 py-3.5 flex items-center justify-between transition-colors ${
                  selection?.requisition.id === r.id
                    ? "border-amber/60 bg-surface2"
                    : "border-border hover:bg-surface2/60"
                }`}
              >
                <div>
                  <div className="text-sm text-ink">
                    <span className="font-mono text-amber mr-2">#{r.sno}</span>
                    {r.requester} · {r.department}
                  </div>
                  <div className="text-xs text-muted mt-0.5">
                    {r.start_date} → {r.end_date} · {r.origin} → {r.destination}
                  </div>
                </div>
                <ChevronRightIcon size={16} className="text-muted shrink-0" />
              </button>
            ))}
            {requisitions.length === 0 && <p className="text-sm text-muted">No pending requisitions — all caught up.</p>}
          </div>

          {canReassign && trips.length > 0 && (
            <div className="mt-6">
              <h2 className="text-xs font-medium text-muted uppercase tracking-wide mb-3">
                Approved trips — reassign
                {flaggedTrips.length > 0 && <span className="ml-2 text-amber normal-case">{flaggedTrips.length} need attention</span>}
              </h2>
              <div className="space-y-2">
                {trips.map((r) => {
                  const flagged = !!allVehicles.find((v) => v.id === r.vehicle_id)?.status_override;
                  return (
                    <button
                      key={r.id}
                      onClick={() => selectRequisition(r, "reassign")}
                      className={`w-full text-left rounded-xl border bg-surface px-4 py-3 transition-colors ${
                        selection?.requisition.id === r.id
                          ? "border-amber/60 bg-surface2"
                          : flagged
                          ? "border-amber/40 hover:bg-surface2/60"
                          : "border-border hover:bg-surface2/60"
                      }`}
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div className="text-sm text-ink">
                          <span className="font-mono text-muted mr-2">#{r.sno}</span>
                          {r.requester} · {r.start_date} → {r.end_date}
                        </div>
                        <StatusBadge status={r.status} />
                      </div>
                      <div className="text-xs text-muted mt-1">
                        <span className="font-mono text-ink">{regOf(r.vehicle_id)}</span> · {driverOf(r.driver_id)}
                        {flagged && <span className="text-amber ml-2">vehicle out of service</span>}
                      </div>
                      <div className="flex items-center gap-1.5 text-xs text-teal mt-1.5">
                        <ArrowLeftRightIcon size={12} />
                        Reassign
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {denied.length > 0 && (
            <div className="mt-6">
              <h2 className="text-xs font-medium text-muted uppercase tracking-wide mb-3">Recently denied</h2>
              <div className="space-y-2">
                {denied.map((r) => (
                  <button
                    key={r.id}
                    onClick={() => selectRequisition(r, "denied")}
                    className={`w-full text-left rounded-xl border bg-surface px-4 py-3 transition-colors ${
                      selection?.requisition.id === r.id
                        ? "border-amber/60 bg-surface2"
                        : "border-border hover:bg-surface2/60"
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="text-sm text-ink">
                        <span className="font-mono text-red mr-2">#{r.sno}</span>
                        {r.requester} · {r.department}
                      </div>
                      <StatusBadge status={r.status} />
                    </div>
                    {r.denial_reason && <div className="text-xs text-muted mt-1">{r.denial_reason}</div>}
                    <div className="flex items-center gap-1.5 text-xs text-teal mt-1.5">
                      <RotateCcwIcon size={12} />
                      Reapprove instead
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}
        </section>

        <section>
          <h2 className="text-xs font-medium text-muted uppercase tracking-wide mb-3">
            {selection
              ? selection.kind === "pending"
                ? `Decide on #${selection.requisition.sno}`
                : selection.kind === "denied"
                ? `Reapprove #${selection.requisition.sno}?`
                : `Reassign #${selection.requisition.sno}`
              : "Select a request"}
          </h2>

          {!selection && (
            <div className="rounded-xl border border-dashed border-border px-4 py-8 text-center text-sm text-muted">
              Choose a pending requisition on the left to see what&apos;s actually free for its dates, pick a
              recently denied one to reapprove it, or pick an approved trip to move it to another vehicle or driver.
            </div>
          )}

          {selection && options && (
            <div className="rounded-2xl border border-border bg-surface shadow-soft p-5 space-y-5">
              {selection.kind === "reassign" && (
                <div className="text-xs text-muted rounded-lg bg-surface2 px-3 py-2.5">
                  Currently <span className="font-mono text-ink">{regOf(selection.requisition.vehicle_id)}</span> with{" "}
                  <span className="text-ink">{driverOf(selection.requisition.driver_id)}</span>. Pick the new vehicle and
                  driver below — you can keep one and change the other.
                </div>
              )}

              <div>
                <label className="text-xs text-muted mb-1.5 block">Vehicle</label>
                <select
                  value={vehicleId}
                  onChange={(e) => pickVehicle(e.target.value ? Number(e.target.value) : "")}
                  className="w-full rounded-lg bg-surface2 border border-border px-3.5 py-2.5 text-sm text-ink outline-none focus:border-amber/60"
                >
                  <option value="">Select vehicle…</option>
                  {options.vehicles.map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.reg_no} — {v.model}
                    </option>
                  ))}
                </select>
                {options.vehicles.length === 0 && (
                  <p className="text-xs text-red mt-1.5">No vehicles free for these dates.</p>
                )}
              </div>

              <div>
                <label className="text-xs text-muted mb-1.5 block">Driver</label>
                <select
                  value={driverId}
                  onChange={(e) => setDriverId(e.target.value ? Number(e.target.value) : "")}
                  className="w-full rounded-lg bg-surface2 border border-border px-3.5 py-2.5 text-sm text-ink outline-none focus:border-amber/60"
                >
                  <option value="">Select driver…</option>
                  {options.drivers.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name}
                    </option>
                  ))}
                </select>
                {options.drivers.length === 0 && (
                  <p className="text-xs text-red mt-1.5">No drivers free for these dates.</p>
                )}
              </div>

              {error && <p className="text-xs text-red">{error}</p>}

              {selection.kind === "pending" && (
                <>
                  <button
                    onClick={handleApprove}
                    disabled={!vehicleId || !driverId || submitting}
                    className="w-full rounded-lg bg-amber text-bg font-medium text-sm py-2.5 hover:opacity-90 disabled:opacity-50 transition-opacity"
                  >
                    {submitting ? "Working…" : "Approve allocation"}
                  </button>

                  <div className="pt-4 border-t border-border space-y-3">
                    <label className="text-xs text-muted block">Deny instead (optional reason)</label>
                    <input
                      value={denyReason}
                      onChange={(e) => setDenyReason(e.target.value)}
                      placeholder="e.g. No vehicles free that week"
                      className="w-full rounded-lg bg-surface2 border border-border px-3.5 py-2.5 text-sm text-ink placeholder:text-muted/60 outline-none focus:border-red/60"
                    />
                    <button
                      onClick={handleDeny}
                      disabled={submitting}
                      className="w-full rounded-lg border border-red/40 text-red font-medium text-sm py-2.5 hover:bg-red/10 disabled:opacity-50 transition-colors"
                    >
                      {submitting ? "Working…" : "Deny request"}
                    </button>
                  </div>
                </>
              )}

              {selection.kind === "denied" && (
                <button
                  onClick={() => setConfirming("reapprove")}
                  disabled={!vehicleId || !driverId}
                  className="w-full flex items-center justify-center gap-1.5 rounded-lg bg-teal text-bg font-medium text-sm py-2.5 hover:opacity-90 disabled:opacity-50 transition-opacity"
                >
                  <RotateCcwIcon size={14} />
                  Reapprove — reverses the earlier denial
                </button>
              )}

              {selection.kind === "reassign" && (
                <button
                  onClick={() => setConfirming("reassign")}
                  disabled={!vehicleId || !driverId}
                  className="w-full flex items-center justify-center gap-1.5 rounded-lg bg-teal text-bg font-medium text-sm py-2.5 hover:opacity-90 disabled:opacity-50 transition-opacity"
                >
                  <ArrowLeftRightIcon size={14} />
                  Reassign this trip
                </button>
              )}
            </div>
          )}
        </section>
      </div>

      {confirming && selection && (
        <AdminConfirmDialog
          title={confirming === "reassign" ? "Reassign this trip" : "Reapprove this request"}
          description={
            confirming === "reassign"
              ? `Confirm your credentials to move trip #${selection.requisition.sno} to a new vehicle/driver. The requester will be notified, and a driver change is queued for you to relay by phone.`
              : `Confirm your credentials to reverse the earlier denial of trip #${selection.requisition.sno}. The requester will be notified it's approved after all.`
          }
          confirmLabel={confirming === "reassign" ? "Reassign" : "Reapprove"}
          defaultName={session?.name ?? ""}
          requireReason={confirming === "reassign"}
          onConfirm={confirmStepUp}
          onClose={() => setConfirming(null)}
        />
      )}
    </AppShell>
  );
}

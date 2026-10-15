"use client";

import StatusBadge from "./StatusBadge";
import type { Driver } from "@/lib/types";
import type { DriverJourney, DriverView } from "@/lib/driver-view";

type IconProps = { size?: number };

function Phone({ size = 16 }: IconProps) {
  return <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.8 19.8 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.12 4.18 2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.12.96.35 1.9.69 2.8a2 2 0 0 1-.45 2.11L8.08 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.9.34 1.84.57 2.8.69A2 2 0 0 1 22 16.92z" /></svg>;
}

function Car({ size = 16 }: IconProps) {
  return <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m5 17-1 0a2 2 0 0 1-2-2v-3l2-5h15l3 5v3a2 2 0 0 1-2 2h-1M5 17h14M5 17v2m14-2v2M4 12h16" /><circle cx="7.5" cy="14.5" r="1.5" /><circle cx="16.5" cy="14.5" r="1.5" /></svg>;
}

function X({ size = 16 }: IconProps) {
  return <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="m18 6-12 12M6 6l12 12" /></svg>;
}

function MapPin({ size = 16 }: IconProps) {
  return <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 10c0 5-8 12-8 12S4 15 4 10a8 8 0 1 1 16 0Z" /><circle cx="12" cy="10" r="2.5" /></svg>;
}

function CalendarDays({ size = 16 }: IconProps) {
  return <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="17" rx="2" /><path d="M16 2v4M8 2v4M3 10h18M8 14h.01M12 14h.01M16 14h.01M8 17h.01M12 17h.01" /></svg>;
}

function UserRound({ size = 16 }: IconProps) {
  return <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="8" r="5" /><path d="M20 21a8 8 0 0 0-16 0" /></svg>;
}

function Wrench({ size = 16 }: IconProps) {
  return <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14.7 6.3a5 5 0 0 0-6.4 6.4L3 18l3 3 5.3-5.3a5 5 0 0 0 6.4-6.4L14 13l-3-3z" /></svg>;
}

const REASON_LABEL: Record<string, string> = {
  maintenance: "In maintenance",
  breakdown: "Broken down",
  unavailable: "Out of service",
};

function Journey({ j, showPurpose }: { j: DriverJourney; showPurpose: boolean }) {
  const r = j.requisition;
  return (
    <div className="rounded-lg border border-border bg-surface2/40 px-3.5 py-3" data-testid="driver-journey">
      <div className="flex items-start justify-between gap-3">
        <div className="text-sm text-ink">
          <span className="font-mono text-muted mr-2">#{r.sno}</span>
          {r.origin} → {r.destination}
        </div>
        <StatusBadge status={r.status} />
      </div>
      <div className="mt-2 grid sm:grid-cols-2 gap-x-6 gap-y-1 text-xs text-muted">
        <span className="flex items-center gap-1.5">
          <CalendarDays size={12} />
          {r.start_date} → {r.end_date}
        </span>
        <span className="flex items-center gap-1.5">
          <UserRound size={12} />
          {r.requester} · {r.department}
        </span>
        <span className="flex items-center gap-1.5">
          <Car size={12} />
          {j.vehicle ? (
            <>
              <span className="font-mono text-ink">{j.vehicle.reg_no}</span> {j.vehicle.model}
            </>
          ) : (
            "No vehicle on record"
          )}
        </span>
        {showPurpose && r.purpose && (
          <span className="flex items-center gap-1.5 sm:col-span-2">
            <MapPin size={12} />
            {r.purpose}
          </span>
        )}
      </div>
      {r.status === "Cancelled" && r.cancellation_reason && (
        <div className="text-xs text-red mt-1.5">Cancelled: {r.cancellation_reason}</div>
      )}
    </div>
  );
}

export default function DriverPanel({
  driver,
  view,
  busyToday,
  showPurpose,
  onClose,
}: {
  driver: Driver;
  view: DriverView;
  busyToday: boolean;
  showPurpose: boolean;
  onClose: () => void;
}) {
  const trips = [...(view.current ? [view.current] : []), ...view.upcoming];
  const av = view.assignedVehicle;
  return (
    <section
      className="rounded-xl border border-teal/30 bg-surface shadow-elevated overflow-hidden"
      aria-label={`Details for ${driver.name}`}
      data-testid="driver-panel"
    >
      <div className="flex items-start justify-between gap-4 px-5 py-4 border-b border-border bg-teal/[0.04]">
        <div>
          <div className="font-head font-semibold text-ink text-lg leading-tight">{driver.name}</div>
          <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted">
            {driver.phone ? (
              <a href={`tel:${driver.phone.replace(/\s+/g, "")}`} className="flex items-center gap-1.5 font-mono hover:text-ink">
                <Phone size={12} />
                {driver.phone}
              </a>
            ) : (
              <span>No phone on file</span>
            )}
            <span className={busyToday ? "text-red" : "text-teal"}>{busyToday ? "On a trip today" : "Free today"}</span>
            <span>
              {trips.length} current/upcoming trip{trips.length === 1 ? "" : "s"}
              {view.committedDays > 0 && ` · ${view.committedDays} day${view.committedDays === 1 ? "" : "s"} committed`}
            </span>
          </div>
        </div>
        <button onClick={onClose} className="text-muted hover:text-ink transition-colors" aria-label="Close driver details">
          <X size={16} />
        </button>
      </div>

      <div className="p-5 space-y-6">
        <div>
          <h3 className="text-xs font-medium text-muted uppercase tracking-wider2 mb-2.5">Assigned vehicle</h3>
          {av ? (
            <div className="rounded-lg border border-border bg-surface2/40 px-3.5 py-3 flex items-center justify-between gap-3" data-testid="assigned-vehicle">
              <div>
                <div className="text-sm text-ink">
                  <span className="font-mono">{av.reg_no}</span> <span className="text-muted">{av.model}</span>
                </div>
                <div className="text-xs text-muted mt-0.5">
                  {view.assignedVehicleKind === "in use now" ? "Driving it now" : "Assigned to their next trip"}
                  {av.unavailable_reason && (
                    <span className="text-amber ml-2 inline-flex items-center gap-1">
                      <Wrench size={11} />
                      {REASON_LABEL[av.unavailable_reason] ?? "Unavailable"} — trip may be reassigned
                    </span>
                  )}
                </div>
              </div>
            </div>
          ) : (
            <p className="text-sm text-muted">No vehicle assigned right now.</p>
          )}
          {view.defaultVehicles.length > 0 && (
            <p className="text-xs text-muted mt-2">
              Default driver for{" "}
              {view.defaultVehicles.map((v, i) => (
                <span key={v.id}>
                  {i > 0 && ", "}
                  <span className="font-mono text-ink">{v.reg_no}</span>
                </span>
              ))}
              .
            </p>
          )}
        </div>

        <div>
          <h3 className="text-xs font-medium text-muted uppercase tracking-wider2 mb-2.5">Assigned journeys</h3>
          {trips.length === 0 ? (
            <p className="text-sm text-muted">Nothing assigned — this driver is free for allocation.</p>
          ) : (
            <div className="space-y-2">
              {trips.map((j) => (
                <Journey key={j.requisition.id} j={j} showPurpose={showPurpose} />
              ))}
            </div>
          )}
        </div>

        {view.past.length > 0 && (
          <details>
            <summary className="text-xs text-muted cursor-pointer hover:text-ink">Past journeys ({view.past.length})</summary>
            <div className="space-y-2 mt-3">
              {view.past.map((j) => (
                <Journey key={j.requisition.id} j={j} showPurpose={showPurpose} />
              ))}
            </div>
          </details>
        )}
      </div>
    </section>
  );
}

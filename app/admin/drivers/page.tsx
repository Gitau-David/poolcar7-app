"use client";

import { useEffect, useState, useCallback } from "react";
import AppShell from "@/components/AppShell";
import { api } from "@/lib/api";
import type { Driver, Notification } from "@/lib/types";

type IconProps = { size?: number };

function Trash2({ size = 16 }: IconProps) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M3 6h18M8 6V4h8v2m3 0-.9 14H5.9L5 6m4 4v7m6-7v7" /></svg>;
}

function Plus({ size = 16 }: IconProps) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>;
}

function RotateCcw({ size = 16 }: IconProps) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M3 12a9 9 0 1 0 3-6.7L3 8" /><path d="M3 3v5h5" /></svg>;
}

function Phone({ size = 16 }: IconProps) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.4 19.4 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .4 2 .7 2.9a2 2 0 0 1-.5 2.1L8 9.9a16 16 0 0 0 6 6l1.2-1.3a2 2 0 0 1 2.1-.5c.9.3 1.9.6 2.9.7a2 2 0 0 1 1.8 2.1z" /></svg>;
}

export default function DriversPage() {
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [driverNotices, setDriverNotices] = useState<Notification[]>([]);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [addError, setAddError] = useState("");
  const [rowError, setRowError] = useState<{ id: number; message: string } | null>(null);

  // all=true so removed drivers stay visible (dimmed, with Restore) rather than silently vanishing.
  const load = useCallback(async () => {
    const [d, n] = await Promise.all([api.listDrivers(true), api.listDriverNotices()]);
    setDrivers(d.drivers);
    setDriverNotices(n.notifications);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function handleRelayed(id: number) {
    setDriverNotices((prev) => prev.map((n) => (n.id === id ? { ...n, read_at: new Date().toISOString() } : n)));
    try {
      await api.markNotificationRead(id);
    } catch {
      load();
    }
  }

  async function addDriver(e: React.FormEvent) {
    e.preventDefault();
    setAddError("");
    if (!name.trim()) return setAddError("Driver name is required.");
    try {
      await api.addDriver(name.trim(), phone.trim() || undefined);
      setName("");
      setPhone("");
      load();
    } catch (err: any) {
      setAddError(err.message);
    }
  }

  async function removeDriver(id: number) {
    setRowError(null);
    try {
      await api.removeDriver(id);
      load();
    } catch (err: any) {
      setRowError({ id, message: err.message });
    }
  }

  async function restoreDriver(id: number) {
    setRowError(null);
    try {
      await api.restoreDriver(id);
      load();
    } catch (err: any) {
      setRowError({ id, message: err.message });
    }
  }

  const unread = driverNotices.filter((n) => !n.read_at);

  return (
    <AppShell>
      <div className="mb-7">
        <h1 className="font-head font-semibold text-xl text-ink">Drivers</h1>
        <p className="text-sm text-muted mt-1">
          Add or retire drivers. A driver with a Scheduled or Active trip can&apos;t be removed until that trip is done
          (or reassigned) — removal never deletes history, it just retires the entry.
        </p>
      </div>

      {unread.length > 0 && (
        <div className="mb-7 rounded-xl border border-amber/30 bg-amber/5 overflow-hidden">
          <div className="px-4 py-3 border-b border-amber/20 text-xs font-medium text-amber uppercase tracking-wide">
            Driver notices to relay — drivers don&apos;t have logins, so call or message them directly
          </div>
          <div className="divide-y divide-border">
            {unread.map((n) => (
              <div key={n.id} className="px-4 py-3 flex items-start justify-between gap-4">
                <div>
                  <div className="text-sm text-ink">{n.message}</div>
                  <div className="text-xs text-muted mt-1 flex flex-wrap items-center gap-3">
                    <span>{n.driver_name}</span>
                    {n.driver_phone && (
                      <span className="flex items-center gap-1 font-mono">
                        <Phone size={11} />
                        {n.driver_phone}
                      </span>
                    )}
                    <span>{new Date(n.created_at).toLocaleString()}</span>
                  </div>
                </div>
                <button
                  onClick={() => handleRelayed(n.id)}
                  className="shrink-0 text-xs text-muted hover:text-ink border border-border rounded-lg px-2.5 py-1.5 transition-colors"
                >
                  Mark relayed
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      <form onSubmit={addDriver} className="rounded-xl border border-border bg-surface shadow-soft p-4 flex gap-2 mb-3 max-w-xl">
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Name" className="flex-1 rounded-lg bg-surface2 border border-border px-3 py-2 text-sm text-ink outline-none focus:border-teal/60" />
        <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="Phone (optional)" className="flex-1 rounded-lg bg-surface2 border border-border px-3 py-2 text-sm text-ink font-mono outline-none focus:border-teal/60" />
        <button className="rounded-lg bg-teal text-bg px-3 py-2 hover:opacity-90 transition-opacity" aria-label="Add driver">
          <Plus size={16} />
        </button>
      </form>
      {addError && <p className="text-xs text-red mb-3">{addError}</p>}

      <div className="grid sm:grid-cols-2 gap-2 max-w-3xl">
        {drivers.map((d) => (
          <div key={d.id} className={`rounded-xl border border-border bg-surface shadow-soft px-4 py-3 flex items-center justify-between ${!d.active ? "opacity-50" : ""}`}>
            <div>
              <div className="text-sm text-ink flex items-center gap-2">
                {d.name}
                {!d.active && <span className="text-[10px] uppercase tracking-wide text-red">Removed</span>}
              </div>
              {d.phone && <div className="text-xs text-muted font-mono">{d.phone}</div>}
              {rowError?.id === d.id && <p className="text-xs text-red mt-1">{rowError.message}</p>}
            </div>
            {d.active ? (
              <button onClick={() => removeDriver(d.id)} className="text-muted hover:text-red transition-colors p-1.5" aria-label={`Remove ${d.name}`}>
                <Trash2 size={15} />
              </button>
            ) : (
              <button onClick={() => restoreDriver(d.id)} className="flex items-center gap-1.5 text-xs text-teal hover:opacity-80 px-2 py-1">
                <RotateCcw size={13} />
                Restore
              </button>
            )}
          </div>
        ))}
        {drivers.length === 0 && <p className="text-sm text-muted">No drivers yet.</p>}
      </div>
    </AppShell>
  );
}

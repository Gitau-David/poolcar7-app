"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import AppShell from "@/components/AppShell";
import StatusBadge from "@/components/StatusBadge";
import { api } from "@/lib/api";
import { useSession } from "@/lib/session-context";
import { ROLES, ROLE_LABEL, type Role } from "@/lib/permissions";
import type { DirectoryUser, Requisition, ActivityLogEntry, AppSettings } from "@/lib/types";
import { Plus, KeyRound, Power, PowerOff, ShieldCheck, User as UserIcon } from "lucide-react";
import { SkeletonTable } from "@/components/Skeleton";

const inputCls =
  "rounded-lg bg-surface2 border border-border px-3 py-2 text-sm text-ink outline-none focus:border-amber/60";

export default function ItAdminPage() {
  const session = useSession();
  const [users, setUsers] = useState<DirectoryUser[]>([]);
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [requisitions, setRequisitions] = useState<Requisition[]>([]);
  const [activity, setActivity] = useState<ActivityLogEntry[]>([]);
  const [loading, setLoading] = useState(true);

  const [newName, setNewName] = useState("");
  const [newRole, setNewRole] = useState<Role>("operations_lead");
  const [newPin, setNewPin] = useState("");
  const [createError, setCreateError] = useState("");
  const [rowError, setRowError] = useState<{ id: number; message: string } | null>(null);
  const [pinFor, setPinFor] = useState<number | null>(null);
  const [pinValue, setPinValue] = useState("");

  const [settingsDraft, setSettingsDraft] = useState<AppSettings | null>(null);
  const [settingsMsg, setSettingsMsg] = useState("");
  const [selectedName, setSelectedName] = useState("");

  const load = useCallback(async () => {
    const [u, s, r, log] = await Promise.all([
      api.listUsers(),
      api.getSettings(),
      api.listRequisitions(),
      api.listActivityLog(),
    ]);
    setUsers(u.users);
    setSettings(s.settings);
    setSettingsDraft((d) => d ?? s.settings);
    setRequisitions(r.requisitions);
    setActivity(log.entries);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function createUser(e: React.FormEvent) {
    e.preventDefault();
    setCreateError("");
    if (!newName.trim()) return setCreateError("Name is required.");
    try {
      await api.createUser(newName.trim(), newRole, newRole === "user" ? undefined : newPin.trim());
      setNewName("");
      setNewPin("");
      load();
    } catch (err: any) {
      setCreateError(err.message);
    }
  }

  async function patchUser(id: number, patch: { role?: Role; active?: boolean; pin?: string }) {
    setRowError(null);
    try {
      await api.updateUser(id, patch);
      setPinFor(null);
      setPinValue("");
      load();
    } catch (err: any) {
      setRowError({ id, message: err.message });
    }
  }

  async function saveSettings() {
    if (!settingsDraft) return;
    setSettingsMsg("");
    try {
      const { settings: saved } = await api.updateSettings(settingsDraft);
      setSettings(saved);
      setSettingsDraft(saved);
      setSettingsMsg("Saved. Menu changes show on the next page load.");
    } catch (err: any) {
      setSettingsMsg(err.message);
    }
  }

  // Per-person drill-down: everything this person submitted, and every
  // activity_log entry recorded under their name (as actor_name).
  const selected = useMemo(() => {
    if (!selectedName) return null;
    const person = users.find((p) => p.name === selectedName);
    const key = selectedName.trim().toLowerCase();
    return {
      person,
      theirRequisitions: requisitions.filter((r) => (r.submitted_by || r.requester).trim().toLowerCase() === key),
      theirActivity: activity.filter((e) => (e.actor_name ?? "").trim().toLowerCase() === key),
    };
  }, [selectedName, users, requisitions, activity]);

  const backOffice = users.filter((u) => u.role !== "user");
  const staff = users.filter((u) => u.role === "user");
  const dirty = JSON.stringify(settings) !== JSON.stringify(settingsDraft);

  return (
    <AppShell>
      <div className="mb-7">
        <h1 className="font-head font-semibold text-xl text-ink">Users &amp; Settings</h1>
        <p className="text-sm text-muted mt-1">
          Create accounts, assign roles, reset PINs and switch accounts off — changes apply on that person&apos;s very
          next click. Also: workflow thresholds, module switches, and a lookup of anyone&apos;s history.
        </p>
      </div>

      {loading || !settingsDraft ? (
        <SkeletonTable rows={4} cols={4} />
      ) : (
        <div className="space-y-10">
          <section>
            <h2 className="text-xs font-medium text-muted uppercase tracking-wide mb-3">Create an account</h2>
            <form onSubmit={createUser} className="rounded-xl border border-border bg-surface shadow-soft p-4 flex flex-wrap gap-2 mb-2">
              <input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Full name" className={`${inputCls} flex-1 min-w-[10rem]`} />
              <select value={newRole} onChange={(e) => setNewRole(e.target.value as Role)} className={inputCls}>
                {ROLES.map((r) => (
                  <option key={r} value={r}>
                    {ROLE_LABEL[r]}
                  </option>
                ))}
              </select>
              {newRole !== "user" && (
                <input value={newPin} onChange={(e) => setNewPin(e.target.value)} placeholder="PIN (min 4)" className={`${inputCls} w-32 font-mono`} />
              )}
              <button className="rounded-lg bg-amber text-bg px-3 py-2 hover:opacity-90 transition-opacity" aria-label="Create account">
                <Plus size={16} />
              </button>
            </form>
            <p className="text-xs text-muted mb-3">
              Staff sign in with just their name — an account here is optional and only adds them to the roster.
              Drivers aren&apos;t user accounts; Operations adds them under Drivers.
            </p>
            {createError && <p className="text-xs text-red mb-3">{createError}</p>}

            <div className="grid sm:grid-cols-2 gap-2">
              {backOffice.map((a) => (
                <div key={a.id} className={`rounded-xl border border-border bg-surface shadow-soft px-4 py-3 ${!a.active ? "opacity-60" : ""}`}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-sm text-ink flex items-center gap-2">
                        {a.role === "it_admin" ? <ShieldCheck size={13} className="text-amber" /> : <UserIcon size={13} className="text-muted" />}
                        {a.name}
                        {!a.active && <span className="text-[10px] uppercase tracking-wide text-red">Disabled</span>}
                        {a.name === session?.name && <span className="text-[10px] uppercase tracking-wide text-muted">You</span>}
                      </div>
                      <div className="text-xs text-muted mt-0.5">last login {a.last_login ? new Date(a.last_login).toLocaleString() : "never"}</div>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <button onClick={() => setPinFor(pinFor === a.id ? null : a.id)} className="text-muted hover:text-ink p-1.5" aria-label={`Reset PIN for ${a.name}`} title="Reset PIN">
                        <KeyRound size={15} />
                      </button>
                      <button onClick={() => patchUser(a.id, { active: !a.active })} className="text-muted hover:text-amber p-1.5" aria-label={a.active ? `Disable ${a.name}` : `Enable ${a.name}`} title={a.active ? "Disable" : "Enable"}>
                        {a.active ? <PowerOff size={15} /> : <Power size={15} />}
                      </button>
                    </div>
                  </div>
                  <select
                    value={a.role}
                    onChange={(e) => patchUser(a.id, { role: e.target.value as Role })}
                    className={`${inputCls} mt-2 w-full`}
                    aria-label={`Role for ${a.name}`}
                  >
                    {ROLES.map((r) => (
                      <option key={r} value={r}>
                        {ROLE_LABEL[r]}
                      </option>
                    ))}
                  </select>
                  {pinFor === a.id && (
                    <div className="mt-2 flex gap-2">
                      <input value={pinValue} onChange={(e) => setPinValue(e.target.value)} placeholder="New PIN" className={`${inputCls} flex-1 font-mono`} />
                      <button onClick={() => patchUser(a.id, { pin: pinValue })} className="rounded-lg bg-amber text-bg text-sm font-medium px-3 py-2 hover:opacity-90">
                        Set
                      </button>
                    </div>
                  )}
                  {rowError?.id === a.id && <p className="text-xs text-red mt-2">{rowError.message}</p>}
                </div>
              ))}
            </div>

            {staff.length > 0 && (
              <details className="mt-4">
                <summary className="text-xs text-muted cursor-pointer hover:text-ink">Staff roster ({staff.length})</summary>
                <div className="mt-2 grid sm:grid-cols-2 gap-2">
                  {staff.map((u) => (
                    <div key={u.id} className={`rounded-xl border border-border bg-surface px-4 py-2.5 flex items-center justify-between ${!u.active ? "opacity-60" : ""}`}>
                      <div>
                        <div className="text-sm text-ink">{u.name}</div>
                        <div className="text-xs text-muted">last login {u.last_login ? new Date(u.last_login).toLocaleString() : "never"}</div>
                        {rowError?.id === u.id && <p className="text-xs text-red mt-1">{rowError.message}</p>}
                      </div>
                      <button onClick={() => patchUser(u.id, { active: !u.active })} className="text-muted hover:text-amber p-1.5" aria-label={u.active ? `Disable ${u.name}` : `Enable ${u.name}`}>
                        {u.active ? <PowerOff size={15} /> : <Power size={15} />}
                      </button>
                    </div>
                  ))}
                </div>
              </details>
            )}
          </section>

          <section>
            <h2 className="text-xs font-medium text-muted uppercase tracking-wide mb-3">System settings</h2>
            <div className="rounded-xl border border-border bg-surface shadow-soft p-4 space-y-4 max-w-xl">
              <label className="flex items-center justify-between gap-4 text-sm text-ink">
                <span>
                  Compliance alert window (days)
                  <span className="block text-xs text-muted">How far ahead insurance, inspection and workshop alerts start showing.</span>
                </span>
                <input type="number" min={1} max={365} value={settingsDraft.compliance_alert_days} onChange={(e) => setSettingsDraft({ ...settingsDraft, compliance_alert_days: Number(e.target.value) })} className={`${inputCls} w-24 font-mono`} />
              </label>
              <label className="flex items-center justify-between gap-4 text-sm text-ink">
                <span>
                  Decision target (hours)
                  <span className="block text-xs text-muted">Approval SLA used in the Operations report.</span>
                </span>
                <input type="number" min={1} max={720} value={settingsDraft.sla_hours} onChange={(e) => setSettingsDraft({ ...settingsDraft, sla_hours: Number(e.target.value) })} className={`${inputCls} w-24 font-mono`} />
              </label>
              <label className="flex items-center justify-between gap-4 text-sm text-ink">
                <span>
                  Messages module
                  <span className="block text-xs text-muted">The shared staff/admin chat.</span>
                </span>
                <input type="checkbox" checked={settingsDraft.module_messages} onChange={(e) => setSettingsDraft({ ...settingsDraft, module_messages: e.target.checked })} className="accent-amber h-4 w-4" />
              </label>
              <label className="flex items-center justify-between gap-4 text-sm text-ink">
                <span>
                  Maintenance &amp; Fuel module
                  <span className="block text-xs text-muted">Servicing, inspections and fuel logs. Open jobs still block vehicles when off.</span>
                </span>
                <input type="checkbox" checked={settingsDraft.module_maintenance} onChange={(e) => setSettingsDraft({ ...settingsDraft, module_maintenance: e.target.checked })} className="accent-amber h-4 w-4" />
              </label>
              <div className="flex items-center gap-3">
                <button onClick={saveSettings} disabled={!dirty} className="rounded-lg bg-amber text-bg font-medium text-sm px-4 py-2 hover:opacity-90 disabled:opacity-40">
                  Save settings
                </button>
                {settingsMsg && <span className="text-xs text-muted">{settingsMsg}</span>}
              </div>
            </div>
          </section>

          <section>
            <h2 className="text-xs font-medium text-muted uppercase tracking-wide mb-3">Look up a person</h2>
            <select value={selectedName} onChange={(e) => setSelectedName(e.target.value)} className={`${inputCls} w-full max-w-sm mb-4`}>
              <option value="">Select a person…</option>
              {users.map((p) => (
                <option key={p.id} value={p.name}>
                  {p.name} ({ROLE_LABEL[p.role]})
                </option>
              ))}
            </select>

            {selected && (
              <div className="rounded-xl border border-border bg-surface shadow-soft p-5 space-y-4">
                <div className="text-sm text-ink">
                  <span className="font-medium">{selectedName}</span>{" "}
                  <span className="text-muted">
                    · {selected.person ? ROLE_LABEL[selected.person.role] : ""} · last login{" "}
                    {selected.person?.last_login ? new Date(selected.person.last_login).toLocaleString() : "never"}
                  </span>
                </div>

                <div>
                  <div className="text-xs text-muted uppercase tracking-wide mb-2">Requisitions ({selected.theirRequisitions.length})</div>
                  {selected.theirRequisitions.length === 0 ? (
                    <p className="text-sm text-muted">None.</p>
                  ) : (
                    <div className="space-y-1.5">
                      {selected.theirRequisitions.map((r) => (
                        <div key={r.id} className="flex items-center justify-between text-sm">
                          <span className="text-ink">
                            <span className="font-mono text-muted mr-2">#{r.sno}</span>
                            {r.origin} → {r.destination}
                          </span>
                          <StatusBadge status={r.status} />
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div>
                  <div className="text-xs text-muted uppercase tracking-wide mb-2">Actions logged ({selected.theirActivity.length})</div>
                  {selected.theirActivity.length === 0 ? (
                    <p className="text-sm text-muted">None.</p>
                  ) : (
                    <div className="space-y-1.5">
                      {selected.theirActivity.slice(0, 20).map((e) => (
                        <div key={e.id} className="flex items-center justify-between text-sm">
                          <span className="text-ink">{e.action}</span>
                          <span className="text-muted text-xs">{new Date(e.created_at).toLocaleString()}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}
          </section>
        </div>
      )}
    </AppShell>
  );
}

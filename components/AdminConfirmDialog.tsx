"use client";

import { useState } from "react";
import { X } from "lucide-react";

export default function AdminConfirmDialog({
  title,
  description,
  confirmLabel,
  defaultName,
  requireReason,
  onConfirm,
  onClose,
}: {
  title: string;
  description: string;
  confirmLabel: string;
  defaultName: string;
  requireReason?: boolean;
  onConfirm: (name: string, pin: string, reason?: string) => Promise<void>;
  onClose: () => void;
}) {
  const [name, setName] = useState(defaultName);
  const [pin, setPin] = useState("");
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (!name.trim() || !pin.trim()) return setError("Enter your admin name and PIN to confirm.");
    if (requireReason && !reason.trim()) return setError("A reason is required.");
    setSubmitting(true);
    try {
      await onConfirm(name.trim(), pin.trim(), requireReason ? reason.trim() : undefined);
    } catch (err: any) {
      setError(err.message || "Could not complete that action.");
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4">
      <div className="w-full max-w-sm rounded-2xl border border-border bg-surface p-6 relative">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-muted hover:text-ink transition-colors"
          aria-label="Close"
        >
          <X size={16} />
        </button>

        <h2 className="font-head font-semibold text-ink pr-6">{title}</h2>
        <p className="text-xs text-muted mt-1.5 mb-5">{description}</p>

        <form onSubmit={handleSubmit} className="space-y-3.5">
          <div>
            <label className="text-xs text-muted mb-1.5 block">Admin name</label>
            <input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full rounded-lg bg-surface2 border border-border px-3.5 py-2.5 text-sm text-ink outline-none focus:border-amber/60"
            />
          </div>
          <div>
            <label className="text-xs text-muted mb-1.5 block">PIN</label>
            <input
              type="password"
              inputMode="numeric"
              value={pin}
              onChange={(e) => setPin(e.target.value)}
              placeholder="••••"
              className="w-full rounded-lg bg-surface2 border border-border px-3.5 py-2.5 text-sm text-ink font-mono outline-none focus:border-amber/60"
            />
          </div>
          {requireReason && (
            <div>
              <label className="text-xs text-muted mb-1.5 block">Reason</label>
              <input
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Why is this being reversed?"
                className="w-full rounded-lg bg-surface2 border border-border px-3.5 py-2.5 text-sm text-ink placeholder:text-muted/60 outline-none focus:border-amber/60"
              />
            </div>
          )}

          {error && <p className="text-xs text-red">{error}</p>}

          <button
            type="submit"
            disabled={submitting}
            className="w-full rounded-lg bg-amber text-bg font-medium text-sm py-2.5 hover:opacity-90 disabled:opacity-50 transition-opacity"
          >
            {submitting ? "Confirming…" : confirmLabel}
          </button>
        </form>
      </div>
    </div>
  );
}

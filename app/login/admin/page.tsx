"use client";

import { api } from "@/lib/api";
import { useRouter } from "next/navigation";
import { useState } from "react";

export default function AdminLoginPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      await api.login("admin", name.trim(), pin);
      router.push("/dashboard");
    } catch (err: any) {
      setError(err.message || "Unable to sign in.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-10">
      <form onSubmit={submit} className="w-full max-w-md rounded-2xl border border-border bg-surface p-6 shadow-elevated">
        <p className="mb-2 text-xs uppercase tracking-wider2 text-amber">Admin login</p>
        <h1 className="font-head text-3xl font-semibold text-ink">Secure access</h1>
        <p className="mt-2 text-sm text-muted">Sign in with your name and PIN.</p>

        <div className="mt-5 space-y-4">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Name"
            className="w-full rounded-lg border border-border bg-surface2 px-3 py-2.5 text-sm text-ink outline-none focus:border-amber/60"
            required
          />
          <input
            type="password"
            inputMode="numeric"
            value={pin}
            onChange={(e) => setPin(e.target.value)}
            placeholder="PIN"
            className="w-full rounded-lg border border-border bg-surface2 px-3 py-2.5 text-sm text-ink outline-none focus:border-amber/60"
            required
          />

          {error && <p className="text-sm text-red">{error}</p>}

          <button
            type="submit"
            className="w-full rounded-lg bg-amber px-4 py-2.5 text-sm font-medium text-bg transition hover:opacity-90 disabled:opacity-60"
            disabled={loading || !name.trim() || !pin.trim()}
          >
            {loading ? "Signing in…" : "Continue"}
          </button>
        </div>
      </form>
    </main>
  );
}

"use client";

import { api } from "@/lib/api";
import { useRouter } from "next/navigation";
import { useState } from "react";

export default function UserLoginPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      await api.login("user", name.trim());
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
        <p className="mb-2 text-xs uppercase tracking-wider2 text-teal">Staff login</p>
        <h1 className="font-head text-3xl font-semibold text-ink">Welcome back</h1>
        <p className="mt-2 text-sm text-muted">Enter your name to continue.</p>

        <div className="mt-5 space-y-4">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Your name"
            className="w-full rounded-lg border border-border bg-surface2 px-3 py-2.5 text-sm text-ink outline-none focus:border-teal/60"
            required
          />

          {error && <p className="text-sm text-red">{error}</p>}

          <button
            type="submit"
            className="w-full rounded-lg bg-teal px-4 py-2.5 text-sm font-medium text-bg transition hover:opacity-90 disabled:opacity-60"
            disabled={loading || !name.trim()}
          >
            {loading ? "Signing in…" : "Continue"}
          </button>
        </div>
      </form>
    </main>
  );
}

"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Car, User, ShieldCheck } from "lucide-react";
import { api } from "@/lib/api";

export default function RoleChoicePage() {
  const router = useRouter();
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    api
      .me()
      .then((r) => {
        if (r.session) router.replace("/dashboard");
        else setChecking(false);
      })
      .catch(() => setChecking(false));
  }, [router]);

  if (checking) {
    return (
      <div className="flex h-screen items-center justify-center gap-2.5 text-muted text-sm">
        <span className="h-1.5 w-1.5 rounded-full bg-teal animate-pulse-slow" />
        Loading…
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-6">
      {/* The one deliberate bold moment on this page — a slow radar sweep
          behind the logo, the single clearest visual nod to "dispatch". */}
      <div className="relative flex items-center justify-center mb-2">
        <div className="absolute h-24 w-24 rounded-full border border-teal/15" />
        <div className="absolute h-24 w-24 rounded-full overflow-hidden">
          <div
            className="absolute inset-0 origin-center animate-radar-sweep"
            style={{
              background: "conic-gradient(from 0deg, transparent 0deg, rgba(45,212,191,0.35) 25deg, transparent 50deg)",
            }}
          />
        </div>
        <div className="relative flex items-center gap-3 bg-bg px-3">
          <div className="h-11 w-11 rounded-xl bg-teal/15 flex items-center justify-center ring-1 ring-teal/20">
            <Car size={24} className="text-teal" />
          </div>
          <div>
            <div className="font-head font-semibold text-xl text-ink leading-tight">Pool Car Dispatch</div>
            <div className="text-sm text-muted leading-tight">Requisition &amp; allocation system</div>
          </div>
        </div>
      </div>

      <p className="text-muted text-sm mt-8 mb-8">Continue as…</p>

      <div className="grid sm:grid-cols-2 gap-4 w-full max-w-lg">
        <button
          onClick={() => router.push("/login/user")}
          className="group flex flex-col items-center gap-3 rounded-2xl border border-border bg-surface px-6 py-8 text-center shadow-soft transition-all hover:border-teal/50 hover:shadow-glow hover:-translate-y-0.5"
        >
          <div className="h-12 w-12 rounded-xl bg-teal/15 flex items-center justify-center transition-colors group-hover:bg-teal/25">
            <User size={22} className="text-teal" />
          </div>
          <div>
            <div className="font-head font-semibold text-ink">Staff</div>
            <div className="text-xs text-muted mt-1">Submit &amp; track vehicle requests</div>
          </div>
        </button>

        <button
          onClick={() => router.push("/login/admin")}
          className="group flex flex-col items-center gap-3 rounded-2xl border border-border bg-surface px-6 py-8 text-center shadow-soft transition-all hover:border-amber/50 hover:shadow-[0_0_0_1px_rgba(245,165,36,0.4),0_0_24px_-4px_rgba(245,165,36,0.35)] hover:-translate-y-0.5"
        >
          <div className="h-12 w-12 rounded-xl bg-amber/15 flex items-center justify-center transition-colors group-hover:bg-amber/25">
            <ShieldCheck size={22} className="text-amber" />
          </div>
          <div>
            <div className="font-head font-semibold text-ink">Admin</div>
            <div className="text-xs text-muted mt-1">Allocate vehicles &amp; manage fleet</div>
          </div>
        </button>
      </div>
    </div>
  );
}

import Link from "next/link";

export default function LandingPage() {
  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-10">
      <div className="w-full max-w-4xl rounded-3xl border border-border bg-surface/80 p-8 shadow-elevated backdrop-blur sm:p-10">
        <div className="mb-8 flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-teal/15 text-xl font-semibold text-teal">
            P
          </div>
          <div>
            <div className="font-head text-xl font-semibold text-ink">Pool Car Dispatch</div>
            <div className="text-xs uppercase tracking-wider2 text-muted">Operations console</div>
          </div>
        </div>

        <div className="grid gap-6 md:grid-cols-2">
          <Link
            href="/login/user"
            className="rounded-2xl border border-border bg-surface2 p-6 text-left transition hover:border-teal/60 hover:bg-surface"
          >
            <div className="mb-3 text-xs uppercase tracking-wider2 text-teal">Staff</div>
            <h2 className="font-head text-2xl font-semibold text-ink">Login as staff</h2>
            <p className="mt-3 text-sm text-muted">Submit and track requisitions, check availability, and message operations.</p>
          </Link>

          <Link
            href="/login/admin"
            className="rounded-2xl border border-border bg-surface2 p-6 text-left transition hover:border-amber/60 hover:bg-surface"
          >
            <div className="mb-3 text-xs uppercase tracking-wider2 text-amber">Admin</div>
            <h2 className="font-head text-2xl font-semibold text-ink">Login as admin</h2>
            <p className="mt-3 text-sm text-muted">Approve allocations, manage drivers and fleet, and monitor the full activity log.</p>
          </Link>
        </div>
      </div>
    </main>
  );
}

function Shimmer({ className = "" }: { className?: string }) {
  return (
    <div
      className={`rounded-md bg-[linear-gradient(90deg,#1B2740_25%,#243050_37%,#1B2740_63%)] bg-[length:400px_100%] animate-shimmer ${className}`}
    />
  );
}

/** A block of skeleton table rows, matching the column count so the layout doesn't jump once real data lands. */
export function SkeletonTable({ rows = 5, cols = 6 }: { rows?: number; cols?: number }) {
  return (
    <div className="rounded-xl border border-border bg-surface shadow-soft overflow-hidden">
      <div className="border-b border-border px-4 py-3 flex gap-6">
        {Array.from({ length: cols }).map((_, i) => (
          <Shimmer key={i} className="h-3 w-16" />
        ))}
      </div>
      <div className="divide-y divide-border">
        {Array.from({ length: rows }).map((_, r) => (
          <div key={r} className="px-4 py-3.5 flex items-center gap-6">
            {Array.from({ length: cols }).map((_, c) => (
              <Shimmer key={c} className={`h-3.5 ${c === 0 ? "w-10" : "w-20"}`} />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

/** A grid of skeleton cards, for availability grids and similar layouts. */
export function SkeletonCards({ count = 3 }: { count?: number }) {
  return (
    <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="rounded-xl border border-border bg-surface px-4 py-3.5 space-y-2">
          <Shimmer className="h-3.5 w-24" />
          <Shimmer className="h-3 w-32" />
        </div>
      ))}
    </div>
  );
}

/** A handful of skeleton lines, for simple list/feed layouts (messages, notifications). */
export function SkeletonLines({ count = 4 }: { count?: number }) {
  return (
    <div className="space-y-3">
      {Array.from({ length: count }).map((_, i) => (
        <Shimmer key={i} className="h-4 w-full max-w-md" />
      ))}
    </div>
  );
}

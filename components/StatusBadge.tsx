import type { RequisitionStatus } from "@/lib/types";

// "Active" is the one state someone's currently mid-trip on — it gets the
// pulse, since that's the one status where "still happening right now" is
// actually true information, not decoration.
const STYLES: Record<RequisitionStatus, { text: string; dot: string; bg: string; ring: string; pulse?: boolean }> = {
  "Pending Allocation": { text: "text-amber", dot: "bg-amber", bg: "bg-amber/10", ring: "ring-amber/25" },
  Scheduled: { text: "text-blue", dot: "bg-blue", bg: "bg-blue/10", ring: "ring-blue/25" },
  Active: { text: "text-teal", dot: "bg-teal", bg: "bg-teal/10", ring: "ring-teal/25", pulse: true },
  Completed: { text: "text-muted", dot: "bg-muted", bg: "bg-white/[0.03]", ring: "ring-white/10" },
  Denied: { text: "text-red", dot: "bg-red", bg: "bg-red/10", ring: "ring-red/25" },
  Cancelled: { text: "text-muted", dot: "bg-muted", bg: "bg-white/[0.03]", ring: "ring-white/10" },
};

export default function StatusBadge({ status }: { status: RequisitionStatus }) {
  const s = STYLES[status];
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset ${s.text} ${s.bg} ${s.ring}`}
    >
      <span className={`relative flex h-1.5 w-1.5 shrink-0`}>
        {s.pulse && <span className={`absolute inline-flex h-full w-full rounded-full ${s.dot} opacity-60 animate-ping`} />}
        <span className={`relative inline-flex h-1.5 w-1.5 rounded-full ${s.dot}`} />
      </span>
      {status}
    </span>
  );
}

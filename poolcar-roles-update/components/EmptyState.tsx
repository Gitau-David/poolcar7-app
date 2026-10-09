import type { LucideIcon } from "lucide-react";

export default function EmptyState({
  icon: Icon,
  title,
  description,
  action,
}: {
  icon: LucideIcon;
  title: string;
  description?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center text-center rounded-xl border border-dashed border-border px-6 py-14">
      <div className="h-11 w-11 rounded-xl bg-surface2 flex items-center justify-center mb-4">
        <Icon size={19} className="text-muted" />
      </div>
      <div className="text-sm text-ink font-medium">{title}</div>
      {description && <p className="text-xs text-muted mt-1.5 max-w-xs">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

import { AlertCircle } from "lucide-react";

export default function InlineAlert({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2 rounded-lg border border-red/25 bg-red/8 px-3 py-2.5 text-xs text-red">
      <AlertCircle size={14} className="shrink-0 mt-0.5" />
      <span>{children}</span>
    </div>
  );
}

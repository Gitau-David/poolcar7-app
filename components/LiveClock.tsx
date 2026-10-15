"use client";

import { useEffect, useState } from "react";

export default function LiveClock() {
  const [now, setNow] = useState<Date | null>(null);

  useEffect(() => {
    setNow(new Date());
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="hidden sm:flex items-center gap-2 text-xs text-muted font-mono">
      <span className="relative flex h-1.5 w-1.5">
        <span className="absolute inline-flex h-full w-full rounded-full bg-teal opacity-60 animate-ping" />
        <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-teal" />
      </span>
      LIVE
      <span className="text-border">·</span>
      {now ? now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" }) : "--:--:--"}
    </div>
  );
}

"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { api } from "@/lib/api";
import type { Notification } from "@/lib/types";

const POLL_MS = 15000;

export default function NotificationBell() {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    try {
      const { notifications } = await api.listNotifications();
      setNotifications(notifications);
    } catch {
      // best-effort — a failed poll shouldn't disrupt the page
    }
  }, []);

  useEffect(() => {
    load();
    const id = setInterval(load, POLL_MS);
    return () => clearInterval(id);
  }, [load]);

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  const unreadCount = notifications.filter((n) => !n.read_at).length;

  async function handleOpen() {
    setOpen((v) => !v);
  }

  async function handleMarkRead(id: number) {
    setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, read_at: new Date().toISOString() } : n)));
    try {
      await api.markNotificationRead(id);
    } catch {
      load(); // reconcile if it failed
    }
  }

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={handleOpen}
        className="relative flex items-center justify-center h-9 w-9 rounded-lg text-muted hover:text-ink hover:bg-surface2 transition-colors"
        aria-label="Notifications"
      >
        <svg
          aria-hidden="true"
          xmlns="http://www.w3.org/2000/svg"
          width="17"
          height="17"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9" />
          <path d="M10 21h4" />
        </svg>
        {unreadCount > 0 && (
          <span className="absolute top-1 right-1 h-4 min-w-4 px-1 rounded-full bg-red text-white text-[10px] font-medium flex items-center justify-center leading-none">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-80 max-h-96 overflow-y-auto rounded-xl border border-border bg-surface shadow-xl z-50">
          <div className="px-4 py-3 border-b border-border text-xs font-medium text-muted uppercase tracking-wide">
            Notifications
          </div>
          {notifications.length === 0 ? (
            <p className="px-4 py-6 text-sm text-muted text-center">Nothing yet.</p>
          ) : (
            <div className="divide-y divide-border">
              {notifications.map((n) => (
                <button
                  key={n.id}
                  onClick={() => !n.read_at && handleMarkRead(n.id)}
                  className={`w-full text-left px-4 py-3 text-sm transition-colors ${
                    n.read_at ? "text-muted" : "text-ink bg-teal/5 hover:bg-teal/10"
                  }`}
                >
                  <div className="flex items-start gap-2">
                    {!n.read_at && <span className="h-1.5 w-1.5 rounded-full bg-teal mt-1.5 shrink-0" />}
                    <div>
                      <div className={n.read_at ? "" : "font-medium"}>{n.message}</div>
                      <div className="text-[11px] text-muted mt-1">{new Date(n.created_at).toLocaleString()}</div>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

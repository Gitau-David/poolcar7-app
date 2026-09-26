"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import {
  LayoutDashboard,
  FilePlus2,
  ClipboardCheck,
  Truck,
  LogOut,
  Car,
  ListChecks,
  ScrollText,
  History,
  MessageSquare,
  ShieldCheck,
  Menu,
  X,
} from "lucide-react";
import { api } from "@/lib/api";
import type { Session, Role } from "@/lib/types";
import { SessionContext } from "@/lib/session-context";
import NotificationBell from "./NotificationBell";
import LiveClock from "./LiveClock";

// Role separation lives here: staff can request/track their own trips,
// admins run allocation, fleet, and the audit trail, and the IT admin tier
// gets everything admins get plus admin-account management. Dashboard,
// Transaction History, and Messages are shared by every role.
type NavItem = {
  href: string;
  label: string;
  icon: typeof LayoutDashboard;
  roles: readonly Role[];
};

const NAV_GROUPS: { label: string | null; items: NavItem[] }[] = [
  {
    label: null,
    items: [
      { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard, roles: ["user", "admin", "it_admin"] },
    ],
  },
  {
    label: "Requests",
    items: [
      { href: "/request", label: "New Requisition", icon: FilePlus2, roles: ["user"] },
      { href: "/my-requests", label: "My Requests", icon: ListChecks, roles: ["user"] },
    ],
  },
  {
    label: "Admin",
    items: [
      { href: "/admin/allocate", label: "Allocate Vehicle", icon: ClipboardCheck, roles: ["admin", "it_admin"] },
      { href: "/admin/fleet", label: "Manage Fleet", icon: Truck, roles: ["admin", "it_admin"] },
      { href: "/admin/activity", label: "Activity Log", icon: ScrollText, roles: ["admin", "it_admin"] },
    ],
  },
  {
    label: "IT Admin",
    items: [{ href: "/admin/it", label: "Admins & Directory", icon: ShieldCheck, roles: ["it_admin"] }],
  },
  {
    label: "Records",
    items: [
      { href: "/transactions", label: "Transaction History", icon: History, roles: ["user", "admin", "it_admin"] },
      { href: "/messages", label: "Messages", icon: MessageSquare, roles: ["user", "admin", "it_admin"] },
    ],
  },
];

const NAV: NavItem[] = NAV_GROUPS.flatMap((g) => g.items);

export default function AppShell({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [session, setSession] = useState<Session | null | "loading">("loading");
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    api
      .me()
      .then((r) => {
        if (!r.session) {
          router.replace("/");
        } else {
          setSession(r.session);
        }
      })
      .catch(() => router.replace("/"));
  }, [router]);

  // Enforce role separation client-side too (the API routes enforce it
  // server-side either way, so this is just for a clean redirect instead of
  // a page full of 403s).
  useEffect(() => {
    if (!session || session === "loading") return;
    const allowedHere = NAV.some(
      (item) => (item.roles as readonly string[]).includes(session.role) && pathname.startsWith(item.href)
    );
    if (!allowedHere && pathname !== "/dashboard") {
      router.replace("/dashboard");
    }
  }, [session, pathname, router]);

  // Close the mobile drawer automatically whenever the route changes.
  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  if (session === "loading") {
    return (
      <div className="flex h-screen items-center justify-center gap-2.5 text-muted text-sm">
        <span className="h-1.5 w-1.5 rounded-full bg-teal animate-pulse-slow" />
        Loading…
      </div>
    );
  }
  if (!session) return null; // redirecting

  async function handleLogout() {
    await api.logout();
    router.replace("/");
  }

  const sidebarContent = (
    <>
      <div className="flex items-center justify-between gap-2 px-5 py-5 border-b border-border">
        <div className="flex items-center gap-2.5">
          <div className="relative h-8 w-8 rounded-lg bg-teal/15 flex items-center justify-center">
            <Car size={18} className="text-teal" />
            <span className="absolute -top-0.5 -right-0.5 h-2 w-2 rounded-full bg-teal ring-2 ring-surface animate-pulse-slow" />
          </div>
          <div>
            <div className="font-head font-semibold text-sm text-ink leading-tight">Pool Car</div>
            <div className="text-[11px] text-muted leading-tight tracking-wider2">Dispatch</div>
          </div>
        </div>
        <button
          onClick={() => setMobileOpen(false)}
          className="lg:hidden text-muted hover:text-ink transition-colors"
          aria-label="Close menu"
        >
          <X size={18} />
        </button>
      </div>

      <nav className="flex-1 px-3 py-5 overflow-y-auto">
        <div className="space-y-5">
          {NAV_GROUPS.map((group) => {
            const items = group.items.filter((item) => (item.roles as readonly string[]).includes(session.role));
            if (items.length === 0) return null;
            return (
              <div key={group.label ?? "top"}>
                {group.label && (
                  <div className="px-3 mb-1.5 text-[10px] font-medium text-muted/70 uppercase tracking-wider2">
                    {group.label}
                  </div>
                )}
                <div className="space-y-0.5">
                  {items.map((item) => {
                    const active = pathname === item.href;
                    const Icon = item.icon;
                    return (
                      <button
                        key={item.href}
                        onClick={() => router.push(item.href)}
                        className={`group relative w-full flex items-center gap-2.5 rounded-lg pl-3.5 pr-3 py-2.5 text-sm transition-all ${
                          active ? "bg-teal/[0.08] text-ink font-medium" : "text-muted hover:bg-surface2/60 hover:text-ink"
                        }`}
                      >
                        <span
                          className={`absolute left-0 top-1/2 -translate-y-1/2 h-4 w-[3px] rounded-full transition-colors ${
                            active ? "bg-teal" : "bg-transparent group-hover:bg-border"
                          }`}
                        />
                        <Icon size={16} className={active ? "text-teal" : ""} />
                        {item.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </nav>

      <div className="px-3 py-4 border-t border-border">
        <div className="px-3 pb-3">
          <div className="text-sm text-ink font-medium truncate">{session.name}</div>
          <div className="text-[11px] text-muted uppercase tracking-wider2">{session.role.replace("_", " ")}</div>
        </div>
        <button
          onClick={handleLogout}
          className="w-full flex items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm text-muted hover:bg-red/10 hover:text-red transition-colors"
        >
          <LogOut size={16} />
          Log out
        </button>
      </div>
    </>
  );

  return (
    <SessionContext.Provider value={session}>
      <div className="flex min-h-screen">
        {/* Desktop sidebar */}
        <aside className="hidden lg:flex w-64 shrink-0 border-r border-border bg-surface flex-col shadow-elevated z-20">
          {sidebarContent}
        </aside>

        {/* Mobile drawer */}
        {mobileOpen && (
          <div className="lg:hidden fixed inset-0 z-40">
            <div className="absolute inset-0 bg-black/60" onClick={() => setMobileOpen(false)} />
            <aside className="absolute inset-y-0 left-0 w-72 bg-surface border-r border-border flex flex-col shadow-elevated">
              {sidebarContent}
            </aside>
          </div>
        )}

        <div className="flex-1 flex flex-col min-w-0">
          <header className="flex items-center justify-between gap-3 px-5 lg:px-8 py-4 border-b border-border bg-surface/60 backdrop-blur sticky top-0 z-10">
            <div className="flex items-center gap-3">
              <button
                onClick={() => setMobileOpen(true)}
                className="lg:hidden text-muted hover:text-ink transition-colors"
                aria-label="Open menu"
              >
                <Menu size={20} />
              </button>
              <LiveClock />
            </div>
            <NotificationBell />
          </header>

          <main className="flex-1 overflow-y-auto px-5 lg:px-8 py-7">{children}</main>
        </div>
      </div>
    </SessionContext.Provider>
  );
}

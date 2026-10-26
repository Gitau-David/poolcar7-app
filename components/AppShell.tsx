"use client";

import { JSX, useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { api } from "@/lib/api";
import type { Session, AppSettings } from "@/lib/types";
import { can, ROLE_LABEL, type Role } from "@/lib/permissions";
import { SessionContext } from "@/lib/session-context";
import NotificationBell from "./NotificationBell";
import LiveClock from "./LiveClock";

// Lightweight inline SVG icons keep the nav working without extra dependencies.
type IconProps = { size?: number; className?: string };
type IconComponent = (props: IconProps) => JSX.Element;

const makeIcon = (glyph: string): IconComponent => ({ size = 16, className = "" }) => (
  <svg
    viewBox="0 0 24 24"
    width={size}
    height={size}
    className={className}
    fill="none"
    stroke="currentColor"
    strokeWidth="1.8"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <text x="50%" y="54%" textAnchor="middle" dominantBaseline="middle" fontSize="11" fontWeight="700" fill="currentColor">
      {glyph}
    </text>
  </svg>
);

const LayoutDashboard = makeIcon("D");
const FilePlus2 = makeIcon("+2");
const ClipboardCheck = makeIcon("C");
const Truck = makeIcon("T");
const LogOut = makeIcon("O");
const Car = makeIcon("V");
const ListChecks = makeIcon("L");
const ScrollText = makeIcon("S");
const History = makeIcon("H");
const MessageSquare = makeIcon("M");
const ShieldCheck = makeIcon("P");
const Menu = makeIcon("≡");
const X = makeIcon("×");
const Wrench = makeIcon("W");
const BarChart3 = makeIcon("B");
const Users = makeIcon("U");

// Who sees what is decided by lib/permissions.ts — the same table the API
// routes enforce server-side, so a hidden button is never the only lock.
type NavItem = {
  href: string;
  label: string;
  icon: IconComponent;
  show: (role: Role, settings: AppSettings) => boolean;
};

const DEFAULT_SETTINGS: AppSettings = {
  compliance_alert_days: 14,
  sla_hours: 24,
  module_messages: true,
  module_maintenance: true,
};

// Every page renders its own <AppShell>, so React remounts it on each page
// change. Remembering the session and settings at module level means the
// sidebar paints instantly instead of flashing "Loading…". The server still
// checks the role on every API call, and me() re-validates in the background.
let cachedSession: Session | null = null;
let cachedSettings: AppSettings | null = null;

const NAV_GROUPS: { label: string | null; items: NavItem[] }[] = [
  {
    label: null,
    items: [{ href: "/dashboard", label: "Dashboard", icon: LayoutDashboard, show: () => true }],
  },
  {
    label: "Requests",
    items: [
      { href: "/request", label: "New Requisition", icon: FilePlus2, show: (r) => r === "user" },
      { href: "/my-requests", label: "My Requests", icon: ListChecks, show: (r) => r === "user" },
    ],
  },
  {
    label: "Operations",
    items: [
      { href: "/admin/allocate", label: "Allocate Vehicle", icon: ClipboardCheck, show: (r) => can(r, "trips:allocate") },
      { href: "/admin/drivers", label: "Drivers", icon: Users, show: (r) => can(r, "drivers:manage") },
    ],
  },
  {
    label: "Fleet",
    items: [
      { href: "/admin/fleet", label: "Manage Fleet", icon: Truck, show: (r) => can(r, "fleet:write") },
      {
        href: "/admin/maintenance",
        label: "Maintenance & Fuel",
        icon: Wrench,
        show: (r, s) => can(r, "fleet:maintenance") && s.module_maintenance,
      },
    ],
  },
  {
    label: "Insight",
    items: [
      {
        href: "/admin/reports",
        label: "Reports",
        icon: BarChart3,
        show: (r) => can(r, "fleet:reports") || can(r, "ops:reports"),
      },
      { href: "/admin/activity", label: "Activity Log", icon: ScrollText, show: (r) => can(r, "audit:view") },
    ],
  },
  {
    label: "IT Admin",
    items: [{ href: "/admin/it", label: "Users & Settings", icon: ShieldCheck, show: (r) => can(r, "users:manage") }],
  },
  {
    label: "Records",
    items: [
      { href: "/transactions", label: "Transaction History", icon: History, show: () => true },
      { href: "/messages", label: "Messages", icon: MessageSquare, show: (_r, s) => s.module_messages },
    ],
  },
];

const NAV: NavItem[] = NAV_GROUPS.flatMap((g) => g.items);

export default function AppShell({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname() ?? "/";
  const [session, setSession] = useState<Session | null | "loading">(cachedSession ?? "loading");
  const [mobileOpen, setMobileOpen] = useState(false);
  const [settings, setSettings] = useState<AppSettings>(cachedSettings ?? DEFAULT_SETTINGS);
  const [settingsLoaded, setSettingsLoaded] = useState(cachedSettings !== null);

  useEffect(() => {
    api
      .me()
      .then((r) => {
        if (!r.session) {
          cachedSession = null;
          cachedSettings = null;
          router.replace("/");
        } else {
          cachedSession = r.session;
          setSession(r.session);
          // Module switches (set by an IT Admin) decide which pages exist in the menu.
          api
            .getSettings()
            .then((res) => {
              cachedSettings = res.settings;
              setSettings(res.settings);
            })
            .catch(() => {})
            .finally(() => setSettingsLoaded(true));
        }
      })
      .catch(() => router.replace("/"));
  }, [router]);

  // Enforce role separation client-side too (the API routes enforce it
  // server-side either way, so this is just for a clean redirect).
  useEffect(() => {
    if (!session || session === "loading" || !settingsLoaded) return;
    const allowedHere = NAV.some((item) => item.show(session.role, settings) && pathname.startsWith(item.href));
    if (!allowedHere && pathname !== "/dashboard") {
      router.replace("/dashboard");
    }
  }, [session, pathname, router, settings, settingsLoaded]);

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
    cachedSession = null;
    cachedSettings = null;
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

      <nav className="flex-1 min-h-0 px-3 py-5 overflow-y-auto">
        <div className="space-y-5">
          {NAV_GROUPS.map((group) => {
            const items = group.items.filter((item) => item.show(session.role, settings));
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

      <div className="shrink-0 px-3 py-4 border-t border-border">
        <div className="px-3 pb-3">
          <div className="text-sm text-ink font-medium truncate">{session.name}</div>
          <div className="text-[11px] text-muted uppercase tracking-wider2">{ROLE_LABEL[session.role]}</div>
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
      {/* One screen tall: sidebar and header stay put, only <main> scrolls. */}
      <div className="flex h-screen overflow-hidden print:h-auto print:overflow-visible">
        {/* Desktop sidebar */}
        <aside className="hidden lg:flex w-64 shrink-0 h-full border-r border-border bg-surface flex-col shadow-elevated z-20 print:hidden">
          {sidebarContent}
        </aside>

        {/* Mobile drawer */}
        {mobileOpen && (
          <div className="lg:hidden fixed inset-0 z-40 print:hidden">
            <div className="absolute inset-0 bg-black/60" onClick={() => setMobileOpen(false)} />
            <aside className="absolute inset-y-0 left-0 w-72 bg-surface border-r border-border flex flex-col shadow-elevated">
              {sidebarContent}
            </aside>
          </div>
        )}

        <div className="flex-1 flex flex-col min-w-0 min-h-0">
          <header className="shrink-0 print:hidden flex items-center justify-between gap-3 px-5 lg:px-8 py-4 border-b border-border bg-surface/60 backdrop-blur z-10">
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

          <main className="flex-1 min-h-0 overflow-y-auto print:overflow-visible px-5 lg:px-8 py-7">{children}</main>
        </div>
      </div>
    </SessionContext.Provider>
  );
}

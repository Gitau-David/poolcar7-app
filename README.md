# Pool Car Dispatch — Requisition & Allocation System

A full-stack web app for requesting and allocating pool cars, backed by
**Supabase (PostgreSQL)**.

## Languages / stack

| Layer      | Technology |
|------------|------------|
| Frontend   | TypeScript, React (Next.js App Router), Tailwind CSS |
| Backend    | Node.js / TypeScript — Next.js API routes |
| Database   | PostgreSQL on Supabase, accessed via `@supabase/supabase-js` |
| Auth       | Custom signed session token (HMAC-SHA256) — no password for staff, name + PIN for Fleet Manager / Operations Lead / IT Admin |

Everything — frontend, backend, and database access — is TypeScript running
in one Next.js project. There's no separate backend server: the `app/api/*`
routes *are* the backend, and they talk to Supabase's Postgres database
directly with the service-role key.

## 1. Create the Supabase project & schema

1. Go to [supabase.com](https://supabase.com) → New project.
2. Once it's ready, open **SQL Editor → New query**, paste the entire
   contents of `db/schema.sql`, and run it. This creates all five tables
   (`users`, `vehicles`, `drivers`, `requisitions`, `activity_log`) and
   seeds 3 vehicles + 3 drivers + a demo admin account.
3. Open **Project Settings → API** and copy:
   - **Project URL** → `SUPABASE_URL` (no `NEXT_PUBLIC_` prefix — it's only used server-side)
   - **service_role key** (not the anon key) → `SUPABASE_SERVICE_ROLE_KEY`

## 2. Configure environment variables

```bash
cp .env.example .env.local
```

Fill in the two Supabase values above, plus:
- `SESSION_SECRET` — any long random string (used to sign the login cookie)

Admin PINs are **not** an env var — each admin has their own name + PIN,
stored (hashed) in the `users` table. `db/schema.sql` seeds these accounts:

| Name | Role | PIN |
|------|------|-----|
| Fleet Manager | Fleet Manager | `4821` |
| Operations Lead | Operations Lead | `7350` |
| IT Admin | **IT Admin** (super admin) | `1234` |

**Change these PINs before going live.** To add a real account, use the IT
Admin's "Users & Settings" page, or run
`select add_account('Their Name', 'operations_lead', 'their-pin');` in the
Supabase SQL editor (roles: `fleet_manager`, `operations_lead`, `it_admin`).

> **Upgrading an existing database?** Re-run the whole of `db/schema.sql` in the
> SQL editor. It is idempotent and converts the old single `admin` role: an admin
> named "Fleet Manager" becomes a Fleet Manager, every other admin becomes an
> Operations Lead, and old activity-log/message rows are re-labelled to match.

## 3. Install & run

```bash
npm install
npm run dev
```

Open `http://localhost:3000`. You'll land on the **Choose role** page:
- **Staff** → name-only login → submit requests, track and cancel their own, view fleet availability.
- **Admin** → name + that admin's own PIN (see table above) → approve/deny
  requests, manage the fleet, and review the activity log. The **IT Admin**
  account logs in through this same page — the server resolves whether a
  name+PIN belongs to a regular admin or the IT admin tier and grants
  access accordingly.

## Role separation

There are four roles. **Staff** request trips. Three back-office roles split the
old "admin" job between them. Every permission lives in one table,
`lib/permissions.ts`, which drives both the sidebar and the guard
(`lib/guard.ts`) on every API route — so a hidden button is never the only lock.
Back-office accounts are re-read from the database on **every request**, so
disabling someone or changing their role takes effect on their next click, not
when their 8-hour token expires.

| Capability | Staff | Fleet Manager | Operations Lead | IT Admin |
|---|---|---|---|---|
| View availability dashboard & trips | ✅ | ✅ | ✅ | ✅ |
| Submit / track / cancel own requisition | ✅ | — | — | — |
| Add & edit vehicles, mark unavailable, default driver | | ✅ | | ✅ |
| Schedule maintenance, insurance & inspection, fuel logs | | ✅ | | ✅ |
| Compliance alerts (expiring insurance / inspection) | | ✅ | | ✅ |
| Vehicle usage reports | | ✅ | ✅ | ✅ |
| Approve / deny, allocate vehicle & driver | | | ✅ | ✅ |
| Reassign approved trips, complete early, cancel approved trips | | | ✅ | ✅ |
| Add / remove drivers, relay driver notices | | | ✅ | ✅ |
| Operations reports (time-to-decision, SLA, backlog) | | | ✅ | ✅ |
| Create accounts, assign roles, reset PINs, enable/disable | | | | ✅ |
| Full activity (audit) log | | | | ✅ |
| Settings: alert window, SLA, module switches | | | | ✅ |
| Transaction history + CSV | own | all | all | all |
| Messages | ✅ | ✅ | ✅ | ✅ (if module on) |

How the three fit together:

- A vehicle the Fleet Manager marks **out of service**, or that has an **open
  workshop job**, is excluded from the availability list — the Allocate page
  can't offer it. Planned downtime is refused while the vehicle still has
  approved trips (Operations must reassign first); a **breakdown** is always
  accepted, notifies the affected requesters, and flags those trips on the
  dashboard and Allocate page for Operations to reassign.
- Reassigning, reapproving, completing early and cancelling an approved trip all
  re-ask for the person's name + PIN (step-up auth) and are logged with who did
  it and why.
- The last active IT Admin can't be demoted or disabled.

### Sessions are per-tab, not per-browser

The session token lives in `sessionStorage` and is sent as an
`Authorization: Bearer` header, not a cookie. This is deliberate: cookies
are shared by every tab in a browser, so logging in as Admin in one tab
would otherwise silently swap the session out from under a Staff tab open
right next to it. Each tab now keeps its own independent identity.


## How the pages map to the spec

- **Dashboard** (`/dashboard`, both roles) — live fleet/driver availability +
  "Requisitions & Scheduled Trips" table (including `Pending Allocation`
  rows), polling the database every few seconds so it reflects new
  submissions/allocations without a manual refresh, for both roles.
- **New Requisition** (`/request`, staff only) — the data-entry form. The
  Requester field is prefilled with your name but editable. On submit it
  inserts a row with `vehicle_id`/`driver_id` still `NULL`, which reads as
  `Pending Allocation`. The confirmation shows the assigned `S.no`.
- **My Requests** (`/my-requests`, staff only) — every request you've
  submitted (matched by `submitted_by`, regardless of what you typed as
  Requester), with live status and a Cancel button while it's still
  Pending or Scheduled.
- **Allocate Vehicle** (`/admin/allocate`, admin only) — pick a pending
  requisition; the server (`GET /api/availability`) runs the date-overlap
  query against the database and returns only vehicles/drivers that are
  actually free — the admin never manually checks. Approving calls
  `POST /api/requisitions/:id/allocate`, sets the vehicle/driver, and moves
  status to `Scheduled`/`Active`; it re-runs that same availability check
  server-side before writing, so a stale client can't double-book. Denying
  calls `POST /api/requisitions/:id/deny` with an optional reason.
- **Manage Fleet** (`/admin/fleet`, admin only) — add/remove vehicles and
  drivers. Removing one currently tied to a Scheduled or Active trip is
  blocked with an inline error; removal is a soft-delete (`active = false`)
  so history and the audit log stay intact. Vehicles and drivers are two
  independent tables — a driver is never tied to one specific vehicle,
  they're paired fresh on each allocation.
- **Activity Log** (`/admin/activity`, admin only) — read-only feed of
  every submit, allocation, denial, cancellation, and fleet change, most
  recent first.
- **Transaction History** (`/transactions`, both roles) — admins see every
  requisition system-wide; staff see only their own. Includes an
  **Export allocations CSV** button covering every allocated (Scheduled /
  Active / Completed) requisition: S.no, requester, submitted by,
  department, origin, destination, allocation date, return date, vehicle
  reg/model, driver name/phone, status, and when it was allocated.
- **Messages** (`/messages`, both roles) — a single shared chatroom between
  staff and admins, polling every few seconds. Simple by design: one
  channel, no threads or DMs.

Every submit, allocation, denial, cancellation, and fleet change writes a
row to `activity_log` for auditability, per the spec.

## Managing people, drivers, and vehicles from SQL

Besides the Manage Fleet page, `db/schema.sql` includes SQL functions you
can run any time in the Supabase SQL editor — useful for one-off admin
tasks without touching the app:

```sql
-- Accounts
select add_account('New Person', 'fleet_manager', '2468'); -- or operations_lead / it_admin; updates the PIN if the name exists
select add_staff_user('New Staff Member');   -- optional roster entry; staff can already log in with just a name
select record_login('Diana Achieng', 'user'); -- what the app calls on every login; updates last_login

-- Fleet
select add_vehicle('UBX 123A', 'Toyota Prado');
select remove_vehicle(3);                     -- soft-deletes; blocked if it has a Scheduled/Active trip
select add_driver('New Driver', '0700 000 004');
select remove_driver(3);

-- Requisition decisions (what the Allocate Vehicle / My Requests pages do)
select approve_requisition(12, 2, 1);         -- (requisition id, vehicle id, driver id)
select deny_requisition(12, 'No vehicles free that week');
select cancel_requisition(12, 'Diana Achieng'); -- pass null instead of a name to skip the ownership check
```

Denied requisitions show a `Denied` status (with the reason, if given) and
are excluded from the Pending Allocation list — the Allocate Vehicle page
also shows a "Recently denied" list for context. Cancelled requisitions
work the same way with a `Cancelled` status.

## Project structure

```
app/
  page.tsx                    Role-choice landing page
  login/user/page.tsx         Staff login (name only)
  login/admin/page.tsx        Admin login (name + PIN)
  dashboard/page.tsx          Availability + requisitions table (both roles)
  request/page.tsx            New Requisition form (staff)
  my-requests/page.tsx        Own requests + cancel (staff)
  admin/allocate/page.tsx     Allocate Vehicle — approve/deny (admin)
  admin/fleet/page.tsx        Manage Fleet (admin)
  admin/activity/page.tsx     Activity Log (admin)
  transactions/page.tsx       Transaction History + CSV export (both roles)
  messages/page.tsx           Shared chatroom (both roles)
  api/                        Backend — one route file per endpoint
lib/
  supabase.ts                 Server-side Supabase client (service role)
  data.ts                     All database queries (async)
  session.ts / auth.ts        Signed cookie session handling
  session-context.tsx         React context exposing the current session
  api.ts                      Client-side fetch wrappers used by the pages
  types.ts                    Shared TypeScript types
components/
  AppShell.tsx                Sidebar nav + session guard used by every page
  StatusBadge.tsx              Status pill (Pending/Scheduled/Active/Completed/Denied/Cancelled)
db/
  schema.sql                  Run this once in the Supabase SQL editor
```

## Notes

- The `status` field is never a value the app (or anyone) writes directly —
  Postgres can't express it as a generated column here (it depends on
  today's date, which isn't an immutable expression), so it's computed
  consistently in one place, `computeStatus()` in `lib/types.ts`, and
  mirrored in SQL by `requisition_status()` for browsing in the Supabase
  SQL editor. This is the same bug class that was fixed in the earlier
  Excel version — a blank/unassigned row can never silently read as
  available or scheduled.
- Vehicles and drivers are independent tables. A requisition links to one
  of each, but there is no vehicle-to-driver relationship anywhere in the
  schema — any driver can be paired with any vehicle on any allocation.
- Ownership (My Requests, cancelling, the "mine" scope on Transaction
  History) is keyed off `submitted_by`, the signed-in session name at
  submission time — never the editable `requester` field, and never
  anything sent by the client.
- Row Level Security is enabled on every table as defense-in-depth, but
  all access in this app goes through the server using the service-role
  key, which bypasses RLS by design — RLS matters if you ever expose the
  anon key to the browser directly.
- Messages are a single shared channel, not private DMs — anyone signed in
  can read and post. The chat and dashboard both use polling (every few
  seconds) rather than real-time push; wiring up Supabase Realtime would
  be the natural next step if you want instant delivery instead.
- To deploy, push this to Vercel (or any Node host) and set the same
  three env vars there. No further Supabase configuration is needed.

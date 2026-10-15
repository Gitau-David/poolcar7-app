// End-to-end tests of the real route handlers + lib/data.ts, running against the in-memory
// Supabase mock (see run.sh). Every assertion goes through the same guard / permission /
// availability code paths production uses.
import { NextRequest } from "next/server";
import { renderToStaticMarkup } from "react-dom/server";
import { resetDb, rawTable, seedRow } from "./lib/supabase";
import { hashPin, encodeSession } from "./lib/session";
import { buildDriverView } from "./lib/driver-view";
import DriverPanel from "./components/DriverPanel";
import { can, ROLES } from "./lib/permissions";

import * as login from "./app/api/auth/login/route";
import * as me from "./app/api/auth/me/route";
import * as availability from "./app/api/availability/route";
import * as requisitions from "./app/api/requisitions/route";
import * as allocate from "./app/api/requisitions/[id]/allocate/route";
import * as deny from "./app/api/requisitions/[id]/deny/route";
import * as complete from "./app/api/requisitions/[id]/complete/route";
import * as adminCancel from "./app/api/requisitions/[id]/admin-cancel/route";
import * as reapprove from "./app/api/requisitions/[id]/reapprove/route";
import * as reassign from "./app/api/requisitions/[id]/reassign/route";
import * as cancel from "./app/api/requisitions/[id]/cancel/route";
import * as vehicles from "./app/api/vehicles/route";
import * as vehicleId from "./app/api/vehicles/[id]/route";
import * as vehicleAvail from "./app/api/vehicles/[id]/availability/route";
import * as drivers from "./app/api/drivers/route";
import * as driverId from "./app/api/drivers/[id]/route";
import * as driverRestore from "./app/api/drivers/[id]/restore/route";
import * as maintenance from "./app/api/maintenance/route";
import * as maintenanceId from "./app/api/maintenance/[id]/route";
import * as maintenanceComplete from "./app/api/maintenance/[id]/complete/route";
import * as fuel from "./app/api/fuel/route";
import * as compliance from "./app/api/compliance/route";
import * as reportFleet from "./app/api/reports/fleet/route";
import * as reportOps from "./app/api/reports/ops/route";
import * as users from "./app/api/users/route";
import * as userId from "./app/api/users/[id]/route";
import * as settings from "./app/api/settings/route";
import * as activity from "./app/api/activity-log/route";
import * as activityId from "./app/api/activity-log/[id]/route";
import * as messages from "./app/api/messages/route";
import * as notifications from "./app/api/notifications/route";
import * as driverNotices from "./app/api/notifications/drivers/route";
import * as notificationRead from "./app/api/notifications/[id]/read/route";

type Mod = Record<string, any>;
const D = (n: number) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);

async function call(mod: Mod, method: string, o: { token?: string; body?: any; query?: string; params?: Record<string, string> } = {}) {
  const req = new NextRequest(`http://localhost/api/x${o.query ?? ""}`, {
    method,
    headers: { "content-type": "application/json", ...(o.token ? { authorization: `Bearer ${o.token}` } : {}) },
    body: o.body !== undefined ? JSON.stringify(o.body) : undefined,
  });
  const res = await mod[method](req, { params: o.params ?? {} });
  const text = await res.text();
  return { status: res.status as number, body: text ? JSON.parse(text) : null };
}

// ---------- tiny test runner ----------
let passed = 0, failed = 0;
const failures: string[] = [];
async function t(name: string, fn: () => Promise<void> | void) {
  try {
    await fn();
    passed++;
    console.log(`  ✓ ${name}`);
  } catch (e: any) {
    failed++;
    failures.push(`${name}: ${e.message}`);
    console.log(`  ✗ ${name}\n      ${e.message}`);
  }
}
function eq(actual: any, expected: any, msg = "") {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error(`${msg} expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}
function ok(cond: any, msg: string) { if (!cond) throw new Error(msg); }
const section = (s: string) => console.log(`\n${s}`);

// ---------- seed ----------
async function seed() {
  resetDb();
  const mk = (name: string, role: string, pin?: string) => seedRow("users", { name, role, pin_hash: pin ? hashPin(pin) : null });
  mk("Fleet Manager", "fleet_manager", "4821");
  mk("Operations Lead", "operations_lead", "7350");
  mk("IT Admin", "it_admin", "1234");
  mk("Dana Ops", "operations_lead", "1111");
}
async function signIn(role: "user" | "admin", name: string, pin?: string) {
  const r = await call(login, "POST", { body: { role, name, pin } });
  return r;
}

const T: Record<string, string> = {}; // tokens

async function main() {
  await seed();

  section("Authentication");
  await t("staff sign in with name only", async () => {
    const r = await signIn("user", "Alice");
    eq(r.status, 200); eq(r.body.role, "user"); ok(r.body.token, "token"); T.alice = r.body.token;
    T.bob = (await signIn("user", "Bob")).body.token;
  });
  await t("Fleet Manager / Operations Lead / IT Admin each get their own role from the account", async () => {
    const fm = await signIn("admin", "Fleet Manager", "4821"); eq(fm.body.role, "fleet_manager"); T.fm = fm.body.token;
    const ol = await signIn("admin", "operations lead", "7350"); eq(ol.body.role, "operations_lead"); eq(ol.body.name, "Operations Lead", "canonical name"); T.ol = ol.body.token;
    const it = await signIn("admin", "IT Admin", "1234"); eq(it.body.role, "it_admin"); T.it = it.body.token;
  });
  await t("wrong PIN, unknown admin, empty name, bad role are rejected", async () => {
    eq((await signIn("admin", "Fleet Manager", "0000")).status, 401);
    eq((await signIn("admin", "Nobody", "1234")).status, 401);
    eq((await signIn("user", "")).status, 400);
    eq((await call(login, "POST", { body: { role: "superuser", name: "x" } })).status, 400);
  });
  await t("wildcard characters in a name can't match another account", async () => {
    eq((await signIn("admin", "%", "4821")).status, 401);
    eq((await signIn("admin", "Fleet%", "4821")).status, 401);
  });
  await t("/me returns the live session; tampered and retired-'admin' tokens are not sessions", async () => {
    eq((await call(me, "GET", { token: T.ol })).body.session, { name: "Operations Lead", role: "operations_lead" });
    eq((await call(me, "GET", { token: T.ol + "x" })).body.session, null);
    eq((await call(me, "GET", {})).body.session, null);
    const legacy = encodeSession({ name: "Operations Lead", role: "admin" as any });
    eq((await call(me, "GET", { token: legacy })).body.session, null);
  });
  await t("login is recorded in the activity log", () => {
    ok(rawTable("activity_log").some((e) => e.action === "login" && e.actor_name === "Alice"), "no login row");
  });

  section("Permission matrix (every role × every protected endpoint)");
  const R = { u: T.alice, fm: T.fm, ol: T.ol, it: T.it };
  const matrix: [string, Mod, string, any, string[]][] = [
    // name, module, method, opts, roles allowed
    ["POST /vehicles", vehicles, "POST", { body: {} }, ["fm", "it"]],
    ["PATCH /vehicles/:id", vehicleId, "PATCH", { params: { id: "999" }, body: { model: "x" } }, ["fm", "it"]],
    ["DELETE /vehicles/:id", vehicleId, "DELETE", { params: { id: "999" } }, ["fm", "it"]],
    ["POST /vehicles/:id/availability", vehicleAvail, "POST", { params: { id: "999" }, body: { override: null } }, ["fm", "it"]],
    ["POST /drivers", drivers, "POST", { body: {} }, ["ol", "it"]],
    ["DELETE /drivers/:id", driverId, "DELETE", { params: { id: "999" } }, ["ol", "it"]],
    ["POST /drivers/:id/restore", driverRestore, "POST", { params: { id: "999" } }, ["ol", "it"]],
    ["POST allocate", allocate, "POST", { params: { id: "999" }, body: {} }, ["ol", "it"]],
    ["POST deny", deny, "POST", { params: { id: "999" }, body: {} }, ["ol", "it"]],
    ["POST complete", complete, "POST", { params: { id: "999" }, body: {} }, ["ol", "it"]],
    ["POST admin-cancel", adminCancel, "POST", { params: { id: "999" }, body: {} }, ["ol", "it"]],
    ["POST reapprove", reapprove, "POST", { params: { id: "999" }, body: {} }, ["ol", "it"]],
    ["POST reassign", reassign, "POST", { params: { id: "999" }, body: {} }, ["ol", "it"]],
    ["GET /maintenance", maintenance, "GET", {}, ["fm", "it"]],
    ["POST /maintenance", maintenance, "POST", { body: {} }, ["fm", "it"]],
    ["DELETE /maintenance/:id", maintenanceId, "DELETE", { params: { id: "999" } }, ["fm", "it"]],
    ["POST /maintenance/:id/complete", maintenanceComplete, "POST", { params: { id: "999" }, body: {} }, ["fm", "it"]],
    ["GET /fuel", fuel, "GET", {}, ["fm", "it"]],
    ["POST /fuel", fuel, "POST", { body: {} }, ["fm", "it"]],
    ["GET /compliance", compliance, "GET", {}, ["fm", "it"]],
    ["GET /reports/fleet", reportFleet, "GET", {}, ["fm", "ol", "it"]],
    ["GET /reports/ops", reportOps, "GET", {}, ["ol", "it"]],
    ["GET /users", users, "GET", {}, ["it"]],
    ["POST /users", users, "POST", { body: {} }, ["it"]],
    ["PATCH /users/:id", userId, "PATCH", { params: { id: "999" }, body: {} }, ["it"]],
    ["PUT /settings", settings, "PUT", { body: {} }, ["it"]],
    ["GET /activity-log", activity, "GET", {}, ["it"]],
    ["DELETE /activity-log/:id", activityId, "DELETE", { params: { id: "999" } }, ["it"]],
    ["GET /notifications/drivers", driverNotices, "GET", {}, ["ol", "it"]],
    ["POST /requisitions (submit)", requisitions, "POST", { body: {} }, ["u"]],
  ];
  for (const [name, mod, method, opts, allowed] of matrix) {
    await t(name, async () => {
      eq((await call(mod, method, opts)).status, 401, "anonymous");
      for (const [k, tok] of Object.entries(R)) {
        const r = await call(mod, method, { ...opts, token: tok });
        // A 401 "Incorrect admin name or PIN" from a step-up route means the role WAS allowed in.
        const denied = r.status === 403 || (r.status === 401 && r.body?.error === "Not signed in");
        if (allowed.includes(k)) ok(!denied, `${k} should be allowed, got ${r.status}`);
        else eq(r.status, 403, `${k} should be refused`);
      }
    });
  }
  await t("open endpoints work for every signed-in role", async () => {
    for (const tok of Object.values(R)) {
      for (const [mod, m] of [[settings, "GET"], [notifications, "GET"], [messages, "GET"], [vehicles, "GET"], [drivers, "GET"], [requisitions, "GET"]] as [Mod, string][]) {
        eq((await call(mod, m, { token: tok })).status, 200);
      }
      eq((await call(availability, "GET", { token: tok, query: `?start=${D(1)}&end=${D(2)}` })).status, 200);
    }
  });
  await t("permission table: 3 back-office roles split the old admin job without gaps", () => {
    const all = ["fleet:write", "fleet:maintenance", "fleet:reports", "trips:allocate", "trips:reassign", "drivers:manage", "ops:reports", "users:manage", "audit:view", "settings:manage"] as const;
    for (const p of all) ok(can("it_admin", p), `it_admin lacks ${p}`);
    for (const p of all) ok(!can("user", p), `staff has ${p}`);
    ok(!can("fleet_manager", "trips:allocate") && !can("operations_lead", "fleet:write") && !can("operations_lead", "users:manage") && !can("fleet_manager", "users:manage"), "boundary");
    eq(ROLES.length, 4);
  });

  section("Fleet Manager — vehicles");
  const V: Record<string, number> = {};
  await t("register vehicles with compliance dates, mileage and duplicate handling", async () => {
    const a = await call(vehicles, "POST", { token: T.fm, body: { reg_no: "KAA 001A", model: "Prado", insurance_expiry: D(5), inspection_expiry: D(200), odometer_km: 10000 } });
    eq(a.status, 201); V.a = a.body.vehicle.id; eq(a.body.vehicle.odometer_km, 10000);
    V.b = (await call(vehicles, "POST", { token: T.fm, body: { reg_no: "KBB 002B", model: "Hilux" } })).body.vehicle.id;
    V.c = (await call(vehicles, "POST", { token: T.fm, body: { reg_no: "KCC 003C", model: "Corolla" } })).body.vehicle.id;
    eq((await call(vehicles, "POST", { token: T.fm, body: { model: "x" } })).status, 400, "missing reg");
    eq((await call(vehicles, "POST", { token: T.fm, body: { reg_no: "BAD 1", model: "x", insurance_expiry: "tomorrow" } })).status, 400, "bad date");
    eq((await call(vehicles, "GET", { token: T.alice })).body.vehicles.length, 3);
  });
  let sam = 0, tom = 0, ann = 0;
  await t("Operations Lead adds drivers", async () => {
    sam = (await call(drivers, "POST", { token: T.ol, body: { name: "Sam Okello", phone: "0700 111 222" } })).body.driver.id;
    tom = (await call(drivers, "POST", { token: T.ol, body: { name: "Tom Njoroge", phone: "0711 333 444" } })).body.driver.id;
    ann = (await call(drivers, "POST", { token: T.ol, body: { name: "Ann Wanjiru" } })).body.driver.id;
    eq((await call(drivers, "POST", { token: T.ol, body: { name: "  " } })).status, 400);
  });
  await t("edit vehicle, set default driver, reject duplicate reg, reject bad odometer", async () => {
    const e = await call(vehicleId, "PATCH", { token: T.fm, params: { id: String(V.a) }, body: { model: "Land Cruiser Prado", default_driver_id: sam } });
    eq(e.status, 200); eq(e.body.vehicle.default_driver_id, sam); eq(e.body.vehicle.model, "Land Cruiser Prado");
    eq((await call(vehicleId, "PATCH", { token: T.fm, params: { id: String(V.a) }, body: { reg_no: "KBB 002B" } })).status, 409, "dup reg");
    eq((await call(vehicleId, "PATCH", { token: T.fm, params: { id: String(V.a) }, body: { odometer_km: -5 } })).status, 409, "neg odo");
    eq((await call(vehicleId, "PATCH", { token: T.fm, params: { id: "999" }, body: { model: "x" } })).status, 409, "missing vehicle");
  });

  section("Staff request → availability check");
  const Q: Record<string, number> = {};
  await t("staff submits a requisition (lands as Pending Allocation, submitted_by is the session)", async () => {
    const r = await call(requisitions, "POST", { token: T.alice, body: { requester: "Alice (for CEO)", department: "Finance", start_date: D(1), end_date: D(3), origin: "Nairobi", destination: "Nakuru", purpose: "Audit visit" } });
    eq(r.status, 201); Q.r1 = r.body.requisition.id;
    eq(r.body.requisition.status, "Pending Allocation"); eq(r.body.requisition.submitted_by, "Alice"); eq(r.body.requisition.sno, 1);
    eq((await call(requisitions, "POST", { token: T.alice, body: { requester: "A" } })).status, 400, "missing fields");
    eq((await call(requisitions, "POST", { token: T.alice, body: { requester: "A", department: "x", start_date: D(5), end_date: D(2), origin: "a", destination: "b" } })).status, 400, "end<start");
  });
  await t("availability lists every free vehicle and driver for the dates", async () => {
    const a = (await call(availability, "GET", { token: T.ol, query: `?start=${D(1)}&end=${D(3)}` })).body;
    eq(a.vehicles.length, 3); eq(a.drivers.length, 3);
    eq((await call(availability, "GET", { token: T.ol, query: "?start=x" })).status, 400);
  });
  await t("Fleet Manager marking a vehicle unavailable removes it from availability; back in service restores it", async () => {
    eq((await call(vehicleAvail, "POST", { token: T.fm, params: { id: String(V.c) }, body: { override: "unavailable", note: "Windscreen" } })).status, 200);
    let a = (await call(availability, "GET", { token: T.ol, query: `?start=${D(1)}&end=${D(3)}` })).body;
    eq(a.vehicles.map((v: any) => v.id).sort(), [V.a, V.b].sort());
    const dash = (await call(vehicles, "GET", { token: T.alice })).body.vehicles.find((v: any) => v.id === V.c);
    eq(dash.unavailable_reason, "unavailable");
    eq((await call(vehicleAvail, "POST", { token: T.fm, params: { id: String(V.c) }, body: { override: null } })).status, 200);
    a = (await call(availability, "GET", { token: T.ol, query: `?start=${D(1)}&end=${D(3)}` })).body;
    eq(a.vehicles.length, 3);
    eq((await call(vehicleAvail, "POST", { token: T.fm, params: { id: String(V.c) }, body: { override: "stolen" } })).status, 400);
  });
  let jobB = 0;
  await t("a scheduled workshop job keeps its vehicle out of allocation for those dates only", async () => {
    const j = await call(maintenance, "POST", { token: T.fm, body: { vehicle_id: V.b, kind: "service", scheduled_for: D(2), expected_back: D(2), notes: "10k service" } });
    eq(j.status, 201); jobB = j.body.record.id;
    let a = (await call(availability, "GET", { token: T.ol, query: `?start=${D(1)}&end=${D(3)}` })).body;
    ok(!a.vehicles.some((v: any) => v.id === V.b), "V.b should be blocked");
    a = (await call(availability, "GET", { token: T.ol, query: `?start=${D(10)}&end=${D(12)}` })).body;
    ok(a.vehicles.some((v: any) => v.id === V.b), "V.b free on other dates");
    eq((await call(maintenance, "POST", { token: T.fm, body: { vehicle_id: V.b, kind: "polish", scheduled_for: D(2) } })).status, 409, "bad kind");
    eq((await call(maintenance, "POST", { token: T.fm, body: { vehicle_id: V.b, kind: "service", scheduled_for: D(5), expected_back: D(4) } })).status, 409, "back<start");
    eq((await call(maintenance, "POST", { token: T.fm, body: { vehicle_id: 999, kind: "service", scheduled_for: D(5) } })).status, 409, "no vehicle");
  });
  await t("completing the job frees the vehicle", async () => {
    const c = await call(maintenanceComplete, "POST", { token: T.fm, params: { id: String(jobB) }, body: { cost: 12000 } });
    eq(c.status, 200); eq(c.body.record.cost, 12000);
    eq((await call(maintenanceComplete, "POST", { token: T.fm, params: { id: String(jobB) }, body: {} })).status, 409, "already done");
    const a = (await call(availability, "GET", { token: T.ol, query: `?start=${D(1)}&end=${D(3)}` })).body;
    ok(a.vehicles.some((v: any) => v.id === V.b), "free again");
  });
  await t("an overdue, unfinished job still blocks (vehicle is still in the workshop)", async () => {
    const j = await call(maintenance, "POST", { token: T.fm, body: { vehicle_id: V.c, kind: "repair", scheduled_for: D(-3), expected_back: D(-1) } });
    eq(j.status, 201);
    const a = (await call(availability, "GET", { token: T.ol, query: `?start=${D(20)}&end=${D(21)}` })).body;
    ok(!a.vehicles.some((v: any) => v.id === V.c), "overdue job should block far-future dates");
    eq((await call(maintenanceId, "DELETE", { token: T.fm, params: { id: String(j.body.record.id) } })).status, 200);
    const a2 = (await call(availability, "GET", { token: T.ol, query: `?start=${D(20)}&end=${D(21)}` })).body;
    ok(a2.vehicles.some((v: any) => v.id === V.c), "cancelled job no longer blocks");
  });

  section("Operations Lead — allocate (the allocation form)");
  await t("allocate vehicle + driver → Scheduled, and it shows in the log/dashboard feed", async () => {
    const r = await call(allocate, "POST", { token: T.ol, params: { id: String(Q.r1) }, body: { vehicleId: V.a, driverId: sam } });
    eq(r.status, 200); eq(r.body.requisition.status, "Scheduled"); eq(r.body.requisition.vehicle_id, V.a);
    const feed = (await call(requisitions, "GET", { token: T.alice })).body.requisitions.find((x: any) => x.id === Q.r1);
    eq([feed.vehicle_id, feed.driver_id, feed.status], [V.a, sam, "Scheduled"]);
    eq((await call(allocate, "POST", { token: T.ol, params: { id: String(Q.r1) }, body: { vehicleId: V.a, driverId: sam } })).status, 409, "double allocate");
    eq((await call(allocate, "POST", { token: T.ol, params: { id: String(Q.r1) }, body: { vehicleId: V.a } })).status, 400, "missing driver");
  });
  await t("double-booking a vehicle or a driver over overlapping dates is refused server-side", async () => {
    Q.r2 = (await call(requisitions, "POST", { token: T.bob, body: { requester: "Bob", department: "HR", start_date: D(2), end_date: D(4), origin: "Nairobi", destination: "Mombasa" } })).body.requisition.id;
    const a = await call(allocate, "POST", { token: T.ol, params: { id: String(Q.r2) }, body: { vehicleId: V.a, driverId: tom } });
    eq(a.status, 409); ok(/Vehicle/.test(a.body.error), a.body.error);
    const b = await call(allocate, "POST", { token: T.ol, params: { id: String(Q.r2) }, body: { vehicleId: V.b, driverId: sam } });
    eq(b.status, 409); ok(/Driver/.test(b.body.error), b.body.error);
    const avail = (await call(availability, "GET", { token: T.ol, query: `?start=${D(2)}&end=${D(4)}` })).body;
    ok(!avail.vehicles.some((v: any) => v.id === V.a) && !avail.drivers.some((d: any) => d.id === sam), "availability agrees");
  });
  await t("non-overlapping dates can reuse the same vehicle and driver", async () => {
    Q.r5 = (await call(requisitions, "POST", { token: T.bob, body: { requester: "Bob", department: "HR", start_date: D(10), end_date: D(11), origin: "A", destination: "B" } })).body.requisition.id;
    const r = await call(allocate, "POST", { token: T.ol, params: { id: String(Q.r5) }, body: { vehicleId: V.a, driverId: sam } });
    eq(r.status, 200);
    // undo for later scenarios
    eq((await call(cancel, "POST", { token: T.ol, params: { id: String(Q.r5) } })).status, 200, "admin can cancel scheduled");
  });

  section("Fleet Manager ↔ Operations: planned downtime vs breakdown");
  await t("planned downtime is refused while the vehicle has approved trips", async () => {
    const r = await call(vehicleAvail, "POST", { token: T.fm, params: { id: String(V.a) }, body: { override: "maintenance" } });
    eq(r.status, 409); ok(/#1/.test(r.body.error), r.body.error);
    const m = await call(maintenance, "POST", { token: T.fm, body: { vehicle_id: V.a, kind: "service", scheduled_for: D(2), expected_back: D(2) } });
    eq(m.status, 409); ok(/#1/.test(m.body.error), m.body.error);
  });
  await t("a breakdown is always accepted, notifies the requester and the trip is flagged", async () => {
    const r = await call(vehicleAvail, "POST", { token: T.fm, params: { id: String(V.a) }, body: { override: "breakdown", note: "Gearbox" } });
    eq(r.status, 200); eq(r.body.affected, [1]);
    const n = (await call(notifications, "GET", { token: T.alice })).body.notifications;
    ok(n.some((x: any) => /broken down/.test(x.message) && x.driver_name === "Sam Okello" && x.driver_phone === "0700 111 222"), "requester notice with driver contact");
    const notices = (await call(driverNotices, "GET", { token: T.ol })).body.notifications;
    ok(notices.length >= 1, "ops sees driver notices");
    const v = (await call(vehicles, "GET", { token: T.ol })).body.vehicles.find((x: any) => x.id === V.a);
    eq(v.unavailable_reason, "breakdown");
  });
  await t("availability for a reassignment ignores the trip itself but not the broken vehicle", async () => {
    const a = (await call(availability, "GET", { token: T.ol, query: `?start=${D(1)}&end=${D(3)}&excludeReq=${Q.r1}` })).body;
    ok(!a.vehicles.some((v: any) => v.id === V.a), "broken vehicle excluded");
    ok(a.drivers.some((d: any) => d.id === sam), "own driver selectable");
  });
  await t("reassign: needs reason + PIN re-entry + the right role; moves vehicle and driver", async () => {
    const base = { vehicleId: V.b, driverId: tom };
    eq((await call(reassign, "POST", { token: T.fm, params: { id: String(Q.r1) }, body: { ...base, name: "Fleet Manager", pin: "4821", reason: "x" } })).status, 403, "FM refused");
    eq((await call(reassign, "POST", { token: T.ol, params: { id: String(Q.r1) }, body: { ...base, name: "Operations Lead", pin: "7350" } })).status, 400, "no reason");
    eq((await call(reassign, "POST", { token: T.ol, params: { id: String(Q.r1) }, body: { ...base, name: "Operations Lead", pin: "0000", reason: "Breakdown" } })).status, 401, "bad PIN");
    eq((await call(reassign, "POST", { token: T.ol, params: { id: String(Q.r1) }, body: { vehicleId: V.a, driverId: tom, name: "Operations Lead", pin: "7350", reason: "r" } })).status, 409, "broken vehicle");
    const ok1 = await call(reassign, "POST", { token: T.ol, params: { id: String(Q.r1) }, body: { ...base, name: "Operations Lead", pin: "7350", reason: "Breakdown of KAA 001A" } });
    eq(ok1.status, 200); eq([ok1.body.requisition.vehicle_id, ok1.body.requisition.driver_id], [V.b, tom]);
    eq((await call(reassign, "POST", { token: T.ol, params: { id: String(Q.r1) }, body: { ...base, name: "Operations Lead", pin: "7350", reason: "again" } })).status, 409, "same assignment");
    const mine = (await call(notifications, "GET", { token: T.alice })).body.notifications;
    ok(mine.some((x: any) => /reassigned/.test(x.message) && /KBB 002B/.test(x.message) && /Tom Njoroge/.test(x.message)), "requester told");
    const relay = (await call(notifications, "GET", { token: T.ol })).body.notifications;
    ok(relay.some((x: any) => /Relay to Sam Okello/.test(x.message) && x.driver_phone === "0700 111 222"), "relay notice for old driver, addressed to the actor");
  });
  await t("reassign is only for Scheduled/Active trips and re-checks conflicts", async () => {
    eq((await call(reassign, "POST", { token: T.ol, params: { id: String(Q.r2) }, body: { vehicleId: V.c, driverId: ann, name: "Operations Lead", pin: "7350", reason: "r" } })).status, 409, "pending trip");
    eq((await call(reassign, "POST", { token: T.ol, params: { id: "999" }, body: { vehicleId: V.c, driverId: ann, name: "Operations Lead", pin: "7350", reason: "r" } })).status, 409, "missing trip");
  });
  await t("back in service after the repair", async () => {
    eq((await call(vehicleAvail, "POST", { token: T.fm, params: { id: String(V.a) }, body: { override: null } })).status, 200);
    const v = (await call(vehicles, "GET", { token: T.ol })).body.vehicles.find((x: any) => x.id === V.a);
    eq(v.unavailable_reason, null);
  });

  section("Driver details view (dashboard: select a driver)");
  await t("buildDriverView returns details, current/next vehicle, journeys, defaults — per driver", async () => {
    const reqs = (await call(requisitions, "GET", { token: T.ol })).body.requisitions;
    const vs = (await call(vehicles, "GET", { token: T.ol, query: "?all=true" })).body.vehicles;
    const tomView = buildDriverView(tom, reqs, vs);
    eq(tomView.upcoming.length, 1); eq(tomView.next?.requisition.sno, 1);
    eq(tomView.assignedVehicle?.reg_no, "KBB 002B"); eq(tomView.assignedVehicleKind, "next trip");
    eq(tomView.committedDays, 3);
    const samView = buildDriverView(sam, reqs, vs);
    eq(samView.upcoming.length, 0, "reassigned away from Sam"); eq(samView.assignedVehicle, null);
    eq(samView.defaultVehicles.map((v) => v.reg_no), ["KAA 001A"]);
    eq(buildDriverView(ann, reqs, vs).committedDays, 0);
  });
  await t("a trip that has started shows as 'in use now'", () => {
    const base: any = { id: 1, sno: 1, requester: "R", submitted_by: "R", department: "D", start_date: D(-1), end_date: D(1), origin: "A", destination: "B", purpose: "P", vehicle_id: 7, driver_id: 5, created_at: "", allocated_at: "", denied_at: null, denial_reason: null, cancelled_at: null, cancellation_reason: null, completed_at: null };
    const veh: any[] = [{ id: 7, reg_no: "KXX 777X", model: "M", active: true, default_driver_id: null, unavailable_reason: null }];
    const v = buildDriverView(5, [{ ...base, status: "Active" }, { ...base, id: 2, sno: 2, status: "Completed", start_date: D(-9), end_date: D(-8) }, { ...base, id: 3, sno: 3, status: "Cancelled" }, { ...base, id: 4, sno: 4, driver_id: 6, status: "Active" }], veh);
    eq(v.current?.requisition.sno, 1); eq(v.assignedVehicleKind, "in use now"); eq(v.past.map((j) => j.requisition.sno), [3, 2]); eq(v.upcoming.length, 0);
    ok(v.current?.vehicle?.reg_no === "KXX 777X", "vehicle resolved");
  });
  await t("DriverPanel renders name, phone, assigned vehicle, journeys with full details", async () => {
    const reqs = (await call(requisitions, "GET", { token: T.ol })).body.requisitions;
    const vs = (await call(vehicles, "GET", { token: T.ol, query: "?all=true" })).body.vehicles;
    const drv = (await call(drivers, "GET", { token: T.ol })).body.drivers.find((d: any) => d.id === tom);
    const html = renderToStaticMarkup(<DriverPanel driver={drv} view={buildDriverView(tom, reqs, vs)} busyToday={false} showPurpose={true} onClose={() => {}} />);
    for (const needle of ["Tom Njoroge", "0711 333 444", "tel:0711333444", "KBB 002B", "Hilux", "Assigned vehicle", "Assigned journeys", "Nairobi → Nakuru", "Finance", "Audit visit", "Alice (for CEO)", "#1", "Scheduled"]) ok(html.includes(needle), `missing "${needle}"`);
    const staffHtml = renderToStaticMarkup(<DriverPanel driver={drv} view={buildDriverView(tom, reqs, vs)} busyToday={true} showPurpose={false} onClose={() => {}} />);
    ok(!staffHtml.includes("Audit visit"), "purpose hidden from staff"); ok(staffHtml.includes("On a trip today"), "busy label");
    const free = renderToStaticMarkup(<DriverPanel driver={{ ...drv, phone: null }} view={buildDriverView(ann, reqs, vs)} busyToday={false} showPurpose={true} onClose={() => {}} />);
    ok(free.includes("No vehicle assigned right now") && free.includes("free for allocation") && free.includes("No phone on file"), "empty state");
  });

  section("Completing, cancelling, denying, reapproving");
  await t("complete early needs name+PIN; frees vehicle and driver immediately; notifies requester", async () => {
    eq((await call(complete, "POST", { token: T.ol, params: { id: String(Q.r1) }, body: { name: "Operations Lead", pin: "0000" } })).status, 401);
    const c = await call(complete, "POST", { token: T.ol, params: { id: String(Q.r1) }, body: { name: "Operations Lead", pin: "7350" } });
    eq(c.status, 200); eq(c.body.requisition.status, "Completed");
    eq((await call(complete, "POST", { token: T.ol, params: { id: String(Q.r1) }, body: { name: "Operations Lead", pin: "7350" } })).status, 409, "twice");
    const a = (await call(availability, "GET", { token: T.ol, query: `?start=${D(1)}&end=${D(3)}` })).body;
    ok(a.vehicles.some((v: any) => v.id === V.b) && a.drivers.some((d: any) => d.id === tom), "freed");
    ok((await call(notifications, "GET", { token: T.alice })).body.notifications.some((n: any) => /marked completed/.test(n.message)), "notified");
  });
  await t("a completed trip moves to the driver's past journeys", async () => {
    const reqs = (await call(requisitions, "GET", { token: T.ol })).body.requisitions;
    const vs = (await call(vehicles, "GET", { token: T.ol, query: "?all=true" })).body.vehicles;
    const v = buildDriverView(tom, reqs, vs);
    eq(v.past.map((j) => j.requisition.sno), [1]); eq(v.upcoming.length, 0);
  });
  await t("staff cancel only their own pending/scheduled requests", async () => {
    eq((await call(cancel, "POST", { token: T.alice, params: { id: String(Q.r2) } })).status, 409, "Alice can't cancel Bob's");
    const own = await call(cancel, "POST", { token: T.bob, params: { id: String(Q.r2) } });
    eq(own.status, 200); eq(own.body.requisition.status, "Cancelled");
    eq((await call(cancel, "POST", { token: T.bob, params: { id: String(Q.r2) } })).status, 409, "already cancelled");
  });
  await t("deny with reason, then reapprove (PIN + availability re-check) → Scheduled + notification", async () => {
    Q.r3 = (await call(requisitions, "POST", { token: T.alice, body: { requester: "Alice", department: "Finance", start_date: D(20), end_date: D(21), origin: "A", destination: "B" } })).body.requisition.id;
    const d = await call(deny, "POST", { token: T.ol, params: { id: String(Q.r3) }, body: { reason: "No budget" } });
    eq(d.status, 200); eq(d.body.requisition.status, "Denied"); eq(d.body.requisition.denial_reason, "No budget");
    eq((await call(deny, "POST", { token: T.ol, params: { id: String(Q.r3) }, body: {} })).status, 409, "already denied");
    eq((await call(allocate, "POST", { token: T.ol, params: { id: String(Q.r3) }, body: { vehicleId: V.b, driverId: tom } })).status, 409, "can't allocate denied");
    eq((await call(reapprove, "POST", { token: T.ol, params: { id: String(Q.r3) }, body: { vehicleId: V.b, driverId: tom, name: "Operations Lead", pin: "bad" } })).status, 401);
    const re = await call(reapprove, "POST", { token: T.ol, params: { id: String(Q.r3) }, body: { vehicleId: V.b, driverId: tom, name: "Operations Lead", pin: "7350" } });
    eq(re.status, 200); eq(re.body.requisition.status, "Scheduled"); eq(re.body.requisition.denied_at, null);
    ok((await call(notifications, "GET", { token: T.alice })).body.notifications.some((n: any) => /approved after all/.test(n.message)), "notified");
  });
  await t("admin-cancel an approved trip needs a reason + PIN, frees resources, notifies", async () => {
    eq((await call(adminCancel, "POST", { token: T.ol, params: { id: String(Q.r3) }, body: { name: "Operations Lead", pin: "7350" } })).status, 400, "no reason");
    eq((await call(adminCancel, "POST", { token: T.ol, params: { id: String(Q.r3) }, body: { name: "Operations Lead", pin: "1", reason: "x" } })).status, 401);
    const c = await call(adminCancel, "POST", { token: T.ol, params: { id: String(Q.r3) }, body: { name: "Operations Lead", pin: "7350", reason: "Event postponed" } });
    eq(c.status, 200); eq(c.body.requisition.status, "Cancelled"); eq(c.body.requisition.cancellation_reason, "Event postponed");
    ok((await call(notifications, "GET", { token: T.alice })).body.notifications.some((n: any) => /Event postponed/.test(n.message)), "notified with reason");
  });
  await t("removal: blocked while a trip is active, allowed after; soft-delete + restore keep history", async () => {
    Q.r6 = (await call(requisitions, "POST", { token: T.alice, body: { requester: "Alice", department: "Finance", start_date: D(0), end_date: D(2), origin: "A", destination: "B" } })).body.requisition.id;
    eq((await call(allocate, "POST", { token: T.ol, params: { id: String(Q.r6) }, body: { vehicleId: V.c, driverId: ann } })).status, 200);
    eq((await call(vehicleId, "DELETE", { token: T.fm, params: { id: String(V.c) } })).status, 409, "vehicle in use");
    eq((await call(driverId, "DELETE", { token: T.ol, params: { id: String(ann) } })).status, 409, "driver in use");
    eq((await call(complete, "POST", { token: T.ol, params: { id: String(Q.r6) }, body: { name: "Operations Lead", pin: "7350" } })).status, 200);
    eq((await call(vehicleId, "DELETE", { token: T.fm, params: { id: String(V.c) } })).status, 200);
    eq((await call(driverId, "DELETE", { token: T.ol, params: { id: String(ann) } })).status, 200);
    eq((await call(vehicles, "GET", { token: T.fm })).body.vehicles.length, 2, "hidden from normal list");
    eq((await call(vehicles, "GET", { token: T.fm, query: "?all=true" })).body.vehicles.length, 3, "history keeps it");
    eq((await call(vehicles, "GET", { token: T.alice, query: "?all=true" })).body.vehicles.length, 2, "staff can't see removed");
    eq((await call(driverRestore, "POST", { token: T.ol, params: { id: String(ann) } })).status, 200);
    eq((await call(vehicles, "POST", { token: T.fm, body: { reg_no: "KCC 003C", model: "Corolla" } })).status, 201, "re-adding reactivates");
    eq((await call(vehicles, "GET", { token: T.fm })).body.vehicles.length, 3);
    eq((await call(vehicleId, "DELETE", { token: T.fm, params: { id: "999" } })).status, 409, "unknown id");
    eq((await call(driverRestore, "POST", { token: T.ol, params: { id: "999" } })).status === 500, false, "restoring an unknown driver must not crash");
  });

  section("Fuel, mileage, compliance and reports");
  await t("fuel logs validate input and keep vehicle mileage in step", async () => {
    eq((await call(fuel, "POST", { token: T.fm, body: { vehicle_id: V.a, litres: 0 } })).status, 400);
    eq((await call(fuel, "POST", { token: T.fm, body: { vehicle_id: V.a, litres: 40, cost: -1 } })).status, 400);
    eq((await call(fuel, "POST", { token: T.fm, body: { vehicle_id: 999, litres: 10 } })).status, 400);
    eq((await call(fuel, "POST", { token: T.fm, body: { vehicle_id: V.a, litres: 40, cost: 8000, odometer_km: 10500, logged_on: D(-5) } })).status, 201);
    eq((await call(fuel, "POST", { token: T.fm, body: { vehicle_id: V.a, litres: 35, cost: 7000, odometer_km: 10900, logged_on: D(-1) } })).status, 201);
    eq((await call(fuel, "POST", { token: T.fm, body: { vehicle_id: V.a, litres: 5, odometer_km: 100, logged_on: D(-2) } })).status, 201);
    eq((await call(vehicles, "GET", { token: T.fm })).body.vehicles.find((v: any) => v.id === V.a).odometer_km, 10900, "odometer = highest reading");
    eq((await call(fuel, "GET", { token: T.fm })).body.logs.length, 3);
  });
  await t("vehicle usage report: trips, utilisation, fuel, km/L, costs", async () => {
    const rep = (await call(reportFleet, "GET", { token: T.fm, query: "?days=30" })).body;
    const a = rep.rows.find((r: any) => r.vehicle_id === V.a);
    eq([a.fuel_litres, a.fuel_cost], [80, 15000]);
    ok(a.km_logged !== null, "km");
    const b = rep.rows.find((r: any) => r.vehicle_id === V.b);
    ok(b.trips >= 0 && b.utilisation_pct >= 0 && b.utilisation_pct <= 100, "util sane");
    eq(b.maintenance_cost, 12000, "completed job cost");
    eq((await call(reportFleet, "GET", { token: T.ol, query: "?days=7" })).status, 200, "Operations can read usage too");
    eq((await call(reportFleet, "GET", { token: T.fm, query: "?days=abc" })).body.days, 30, "bad days falls back");
    eq((await call(reportFleet, "GET", { token: T.fm, query: "?days=9999" })).body.days, 365, "days capped");
  });
  await t("compliance alerts: expiring, expired, then cleared by completing a renewal job", async () => {
    let al = (await call(compliance, "GET", { token: T.fm })).body.alerts;
    ok(al.some((x: any) => x.vehicle_id === V.a && x.kind === "insurance" && x.severity === "soon" && x.days_left === 5), "expiring soon");
    ok(!al.some((x: any) => x.kind === "inspection" && x.vehicle_id === V.a), "inspection far away not alerted");
    await call(vehicleId, "PATCH", { token: T.fm, params: { id: String(V.a) }, body: { insurance_expiry: D(-2) } });
    al = (await call(compliance, "GET", { token: T.fm })).body.alerts;
    ok(al.some((x: any) => x.vehicle_id === V.a && x.severity === "expired" && x.days_left === -2), "expired");
    eq(al[0].vehicle_id, V.a, "most urgent first");
    const job = await call(maintenance, "POST", { token: T.fm, body: { vehicle_id: V.a, kind: "insurance", scheduled_for: D(3) } });
    eq(job.status, 201);
    ok((await call(compliance, "GET", { token: T.fm })).body.alerts.some((x: any) => x.kind === "maintenance"), "upcoming job shown");
    const done = await call(maintenanceComplete, "POST", { token: T.fm, params: { id: String(job.body.record.id) }, body: { cost: 30000, renewed_until: D(365) } });
    eq(done.status, 200);
    eq((await call(vehicles, "GET", { token: T.fm })).body.vehicles.find((v: any) => v.id === V.a).insurance_expiry, D(365), "record updated");
    al = (await call(compliance, "GET", { token: T.fm })).body.alerts;
    ok(!al.some((x: any) => x.vehicle_id === V.a), "alerts cleared");
    eq((await call(maintenanceComplete, "POST", { token: T.fm, params: { id: "999" }, body: {} })).status, 409);
  });
  await t("operations report: throughput, time-to-decision, SLA, backlog, reassignments", async () => {
    const r = (await call(reportOps, "GET", { token: T.ol, query: "?days=30" })).body.report;
    ok(r.submitted >= 5, "submitted"); ok(r.approved >= 3 && r.denied === 0 && r.cancelled >= 2, `outcomes ${JSON.stringify([r.approved, r.denied, r.cancelled])}`);
    eq(r.reassignments, 1); ok(r.avg_hours_to_decision !== null && r.avg_hours_to_decision >= 0, "avg"); eq(r.sla_met_pct, 100, "all decided instantly");
    eq(r.sla_hours, 24); ok(r.by_department.some((d: any) => d.department === "Finance"), "departments");
    // an old pending request breaches the SLA
    const old = rawTable("requisitions").push({ id: 900, sno: 900, requester: "Old", submitted_by: "Old", department: "Ops", start_date: D(40), end_date: D(41), origin: "a", destination: "b", vehicle_id: null, driver_id: null, created_at: new Date(Date.now() - 50 * 3600000).toISOString(), allocated_at: null, denied_at: null, cancelled_at: null, completed_at: null });
    const r2 = (await call(reportOps, "GET", { token: T.ol })).body.report;
    eq(r2.pending_over_sla.map((x: any) => x.sno), [900]); ok(r2.pending_over_sla[0].hours_waiting >= 50, "hours");
    rawTable("requisitions").splice(rawTable("requisitions").findIndex((x) => x.id === 900), 1);
  });

  section("IT Admin — accounts, roles, settings, audit");
  const U: Record<string, number> = {};
  await t("create accounts for every role; PIN rules; duplicates; no hash ever returned", async () => {
    const c = await call(users, "POST", { token: T.it, body: { name: "Fiona Fleet", role: "fleet_manager", pin: "5555" } });
    eq(c.status, 201); U.fiona = c.body.user.id; ok(!("pin_hash" in c.body.user), "no hash");
    eq((await call(users, "POST", { token: T.it, body: { name: "fiona fleet", role: "operations_lead", pin: "9999" } })).status, 400, "case-insensitive duplicate");
    eq((await call(users, "POST", { token: T.it, body: { name: "No Pin", role: "operations_lead" } })).status, 400, "pin required");
    eq((await call(users, "POST", { token: T.it, body: { name: "Short", role: "operations_lead", pin: "12" } })).status, 400, "pin too short");
    eq((await call(users, "POST", { token: T.it, body: { name: "X", role: "root", pin: "1234" } })).status, 400, "unknown role");
    eq((await call(users, "POST", { token: T.it, body: { name: "Gina Staff", role: "user" } })).status, 201, "staff need no PIN");
    const list = (await call(users, "GET", { token: T.it })).body.users;
    ok(list.length >= 6 && list.every((u: any) => !("pin_hash" in u)), "listing has no hashes");
    eq((await signIn("admin", "Fiona Fleet", "5555")).body.role, "fleet_manager");
    T.fiona = (await signIn("admin", "Fiona Fleet", "5555")).body.token;
  });
  await t("a role change takes effect on the person's very next request (old token, new permissions)", async () => {
    eq((await call(vehicles, "POST", { token: T.fiona, body: { reg_no: "KDD 004D", model: "Probox" } })).status, 201, "FM can add vehicles");
    eq((await call(allocate, "POST", { token: T.fiona, params: { id: "999" }, body: { vehicleId: 1, driverId: 1 } })).status, 403, "FM can't allocate");
    eq((await call(userId, "PATCH", { token: T.it, params: { id: String(U.fiona) }, body: { role: "operations_lead" } })).status, 200);
    eq((await call(vehicles, "POST", { token: T.fiona, body: { reg_no: "KEE 005E", model: "Probox" } })).status, 403, "now can't add vehicles");
    ok((await call(allocate, "POST", { token: T.fiona, params: { id: "999" }, body: { vehicleId: 1, driverId: 1 } })).status !== 403, "now can allocate");
    eq((await call(me, "GET", { token: T.fiona })).body.session.role, "operations_lead");
  });
  await t("disabling an account locks it out immediately; enabling restores it; PIN reset invalidates the old PIN", async () => {
    eq((await call(userId, "PATCH", { token: T.it, params: { id: String(U.fiona) }, body: { active: false } })).status, 200);
    eq((await call(drivers, "GET", { token: T.fiona })).status, 401, "old token dead");
    eq((await signIn("admin", "Fiona Fleet", "5555")).status, 401, "can't sign in");
    eq((await call(userId, "PATCH", { token: T.it, params: { id: String(U.fiona) }, body: { active: true, pin: "7777" } })).status, 200);
    eq((await signIn("admin", "Fiona Fleet", "5555")).status, 401, "old PIN");
    eq((await signIn("admin", "Fiona Fleet", "7777")).status, 200, "new PIN");
    eq((await call(userId, "PATCH", { token: T.it, params: { id: String(U.fiona) }, body: { pin: "1" } })).status, 409, "short pin");
    eq((await call(userId, "PATCH", { token: T.it, params: { id: String(U.fiona) }, body: {} })).status, 409, "no change");
    eq((await call(userId, "PATCH", { token: T.it, params: { id: "999" }, body: { active: false } })).status, 409, "unknown");
  });
  await t("promoting staff needs a PIN; demoting to staff removes it; the last IT Admin is protected", async () => {
    const gina = rawTable("users").find((u) => u.name === "Gina Staff").id;
    eq((await call(userId, "PATCH", { token: T.it, params: { id: String(gina) }, body: { role: "fleet_manager" } })).status, 409, "no PIN");
    eq((await call(userId, "PATCH", { token: T.it, params: { id: String(gina) }, body: { role: "fleet_manager", pin: "4444" } })).status, 200);
    eq((await call(userId, "PATCH", { token: T.it, params: { id: String(gina) }, body: { role: "user" } })).status, 200);
    eq(rawTable("users").find((u) => u.id === gina).pin_hash, null);
    const itId = rawTable("users").find((u) => u.name === "IT Admin").id;
    eq((await call(userId, "PATCH", { token: T.it, params: { id: String(itId) }, body: { role: "operations_lead" } })).status, 409, "can't demote last");
    eq((await call(userId, "PATCH", { token: T.it, params: { id: String(itId) }, body: { active: false } })).status, 409, "can't disable last");
    const it2 = (await call(users, "POST", { token: T.it, body: { name: "IT Two", role: "it_admin", pin: "2222" } })).body.user.id;
    eq((await call(userId, "PATCH", { token: T.it, params: { id: String(itId) }, body: { role: "operations_lead" } })).status, 200, "allowed once another exists");
    eq((await call(users, "GET", { token: T.it })).status, 403, "demoted admin loses IT powers at once");
    T.it = (await signIn("admin", "IT Two", "2222")).body.token;
    eq((await call(users, "GET", { token: T.it })).status, 200);
    void it2;
  });
  await t("settings: validate, persist, and drive thresholds", async () => {
    eq((await call(settings, "PUT", { token: T.it, body: { compliance_alert_days: 0 } })).status, 400);
    eq((await call(settings, "PUT", { token: T.it, body: { sla_hours: "fast" } })).status, 400);
    eq((await call(settings, "PUT", { token: T.it, body: { nonsense: 1 } })).status, 400);
    eq((await call(settings, "PUT", { token: T.it, body: {} })).status, 400);
    const r = await call(settings, "PUT", { token: T.it, body: { compliance_alert_days: 400 } });
    eq(r.status, 400, "over 365");
    const ok1 = await call(settings, "PUT", { token: T.it, body: { compliance_alert_days: 400 - 399, sla_hours: 1 } });
    eq(ok1.status, 200); eq(ok1.body.settings.sla_hours, 1);
    eq((await call(settings, "GET", { token: T.alice })).body.settings.compliance_alert_days, 1);
    // alert window of 1 day: a vehicle expiring in 5 days is no longer alerted
    await call(vehicleId, "PATCH", { token: T.fm, params: { id: String(V.b) }, body: { insurance_expiry: D(5) } });
    ok(!(await call(compliance, "GET", { token: T.fm })).body.alerts.some((a: any) => a.vehicle_id === V.b), "window honoured");
    await call(settings, "PUT", { token: T.it, body: { compliance_alert_days: 14, sla_hours: 24 } });
    ok((await call(compliance, "GET", { token: T.fm })).body.alerts.some((a: any) => a.vehicle_id === V.b), "window widened");
  });
  await t("module switches: Messages and Maintenance & Fuel can be turned off and on", async () => {
    eq((await call(messages, "POST", { token: T.alice, body: { body: "hello team" } })).status, 201);
    eq((await call(messages, "POST", { token: T.alice, body: { body: "  " } })).status, 400);
    eq((await call(messages, "POST", { token: T.alice, body: { body: "x".repeat(2001) } })).status, 400);
    const m = (await call(messages, "GET", { token: T.fm })).body.messages; eq(m.length, 1); eq(m[0].sender_role, "user");
    await call(settings, "PUT", { token: T.it, body: { module_messages: false, module_maintenance: false } });
    eq((await call(messages, "GET", { token: T.alice })).status, 403); eq((await call(messages, "POST", { token: T.alice, body: { body: "x" } })).status, 403);
    for (const [mod, m2] of [[maintenance, "GET"], [fuel, "GET"]] as [Mod, string][]) eq((await call(mod, m2, { token: T.fm })).status, 403, "maintenance module off");
    // …but a job that's already open must keep blocking the vehicle
    await call(settings, "PUT", { token: T.it, body: { module_maintenance: true } });
    await call(maintenance, "POST", { token: T.fm, body: { vehicle_id: V.b, kind: "service", scheduled_for: D(30), expected_back: D(31) } });
    await call(settings, "PUT", { token: T.it, body: { module_maintenance: false } });
    ok(!(await call(availability, "GET", { token: T.ol, query: `?start=${D(30)}&end=${D(31)}` })).body.vehicles.some((v: any) => v.id === V.b), "still blocks when module off");
    await call(settings, "PUT", { token: T.it, body: { module_messages: true, module_maintenance: true } });
    eq((await call(messages, "GET", { token: T.alice })).status, 200); eq((await call(maintenance, "GET", { token: T.fm })).status, 200);
  });
  await t("audit log: real roles recorded, requisition embedded, date filter, delete; others refused", async () => {
    const all = (await call(activity, "GET", { token: T.it })).body.entries;
    const reassigned = all.find((e: any) => e.action === "reassigned");
    ok(reassigned && reassigned.actor_role === "operations_lead" && reassigned.actor_name === "Operations Lead", "reassign logged under Operations Lead");
    ok(reassigned.requisitions && reassigned.requisitions.sno === 1, "embeds requisition");
    for (const action of ["submitted", "allocated", "denied", "reapproved", "completed", "admin_cancelled", "cancelled", "vehicle_added", "vehicle_updated", "vehicle_unavailable", "vehicle_available", "driver_added", "maintenance_scheduled", "maintenance_completed", "maintenance_cancelled", "fuel_logged", "user_created", "user_updated", "settings_updated", "vehicle_removed", "driver_removed", "driver_restored", "login"]) {
      ok(all.some((e: any) => e.action === action), `no '${action}' entry`);
    }
    ok(all.find((e: any) => e.action === "vehicle_unavailable").actor_role === "fleet_manager", "FM actions logged as FM");
    ok(all.find((e: any) => e.action === "user_created").actor_role === "it_admin", "IT actions logged as IT");
    ok(all.every((e: any, i: number) => i === 0 || all[i - 1].created_at >= e.created_at), "newest first");
    eq((await call(activity, "GET", { token: T.it, query: `?date=${D(0)}` })).body.entries.length > 0, true);
    eq((await call(activity, "GET", { token: T.it, query: `?date=${D(-30)}` })).body.entries.length, 0);
    const id = all[0].id;
    eq((await call(activityId, "DELETE", { token: T.it, params: { id: String(id) } })).status, 200);
    ok(!(await call(activity, "GET", { token: T.it })).body.entries.some((e: any) => e.id === id), "deleted");
    eq((await call(activity, "GET", { token: T.ol })).status, 403); eq((await call(activity, "GET", { token: T.fm })).status, 403);
  });
  await t("notifications: each person sees only their own; marking read isn't leaked across", async () => {
    const mine = (await call(notifications, "GET", { token: T.alice })).body.notifications;
    ok(mine.length > 0 && mine.every((n: any) => n.recipient_name === "Alice"), "own only");
    ok((await call(notifications, "GET", { token: T.bob })).body.notifications.every((n: any) => n.recipient_name === "Bob"), "bob own only");
    eq((await call(notifications, "GET", { token: T.alice, query: "?unreadOnly=true" })).body.notifications.every((n: any) => !n.read_at), true);
  });

  await t("marking a notification read: only the recipient (or someone relaying a driver notice) can", async () => {
    const mine = rawTable("notifications").find((n) => n.recipient_name === "Alice" && !n.read_at && !n.driver_name) ?? rawTable("notifications").find((n) => n.recipient_name === "Alice" && !n.read_at);
    ok(mine, "fixture");
    eq((await call(notificationRead, "POST", { token: T.bob, params: { id: String(mine.id) } })).status, 403, "other staff");
    eq((await call(notificationRead, "POST", { token: T.fm, params: { id: String(mine.id) } })).status, 403, "FM can't read others' non-driver mail");
    eq((await call(notificationRead, "POST", { token: T.alice, params: { id: String(mine.id) } })).status, 200, "recipient");
    ok(rawTable("notifications").find((n) => n.id === mine.id).read_at, "marked");
    const driverOne = rawTable("notifications").find((n) => n.driver_name && !n.read_at);
    ok(driverOne, "driver notice fixture");
    eq((await call(notificationRead, "POST", { token: T.alice, params: { id: String(driverOne.id) } })).status === 200, driverOne.recipient_name === "Alice", "staff only their own");
    eq((await call(notificationRead, "POST", { token: T.it, params: { id: String(driverOne.id) } })).status, 200, "IT relays driver notices");
    eq((await call(notificationRead, "POST", { token: T.alice, params: { id: "99999" } })).status, 404);
    eq((await call(notificationRead, "POST", { params: { id: "1" } })).status, 401);
  });

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed) { console.log("\nFailures:\n" + failures.map((f) => " - " + f).join("\n")); process.exit(1); }
}
main().catch((e) => { console.error("FATAL", e); process.exit(2); });

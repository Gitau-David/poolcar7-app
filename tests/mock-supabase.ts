// In-memory stand-in for the Supabase client, used only by tests. It implements the
// slice of the query builder lib/data.ts uses (select/insert/update/upsert/delete,
// eq/neq/is/not/in/ilike/lte/gte, order/limit, single/maybeSingle, head counts, rpc),
// including the unique constraints the real schema enforces, so the app's own logic —
// not the mock — decides every outcome.
type Row = Record<string, any>;

const TABLES = ["users", "vehicles", "drivers", "requisitions", "activity_log", "messages", "notifications", "maintenance", "fuel_logs", "settings"] as const;
const db: Record<string, Row[]> = {};
const seq: Record<string, number> = {};

const now = () => new Date().toISOString();
const today = () => new Date().toISOString().slice(0, 10);

const DEFAULTS: Record<string, () => Row> = {
  users: () => ({ pin_hash: null, active: true, last_login: null, created_at: now() }),
  vehicles: () => ({ active: true, status_override: null, override_note: null, insurance_expiry: null, inspection_expiry: null, odometer_km: null, default_driver_id: null, created_at: now() }),
  drivers: () => ({ phone: null, active: true, created_at: now() }),
  requisitions: () => ({ submitted_by: null, purpose: null, vehicle_id: null, driver_id: null, allocated_at: null, denied_at: null, denial_reason: null, cancelled_at: null, cancellation_reason: null, completed_at: null, created_at: now() }),
  activity_log: () => ({ requisition_id: null, actor_name: null, details: null, created_at: now() }),
  messages: () => ({ created_at: now() }),
  notifications: () => ({ requisition_id: null, driver_name: null, driver_phone: null, read_at: null, created_at: now() }),
  maintenance: () => ({ expected_back: null, completed_on: null, cost: null, notes: null, cancelled_at: null, created_by: null, created_at: now() }),
  fuel_logs: () => ({ cost: null, odometer_km: null, logged_on: today(), created_by: null }),
  settings: () => ({ updated_by: null, updated_at: now() }),
};

export function resetDb() {
  for (const t of TABLES) {
    db[t] = [];
    seq[t] = 0;
  }
}
resetDb();
export const rawTable = (t: string) => db[t];
/** Insert a fixture row the way the database would (identity id, column defaults). */
export function seedRow(table: string, row: Row) {
  db[table].push({ ...DEFAULTS[table]?.(), ...row, id: ++seq[table] });
}

const ROLES = ["user", "fleet_manager", "operations_lead", "it_admin"];
const err = (code: string, message: string) => ({ code, message });

function checkRow(table: string, row: Row, others: Row[], self?: Row): { code: string; message: string } | null {
  if (table === "users") {
    if (!ROLES.includes(row.role)) return err("23514", "users_role_check");
    const same = others.find(
      (o) => o !== row && o !== self && String(o.name).toLowerCase() === String(row.name).toLowerCase() && (row.role === "user" ? o.role === "user" : o.role !== "user")
    );
    if (same) return err("23505", "duplicate key value violates unique constraint (users name)");
  }
  if (table === "vehicles" && others.some((o) => o !== row && o !== self && o.reg_no === row.reg_no)) return err("23505", "duplicate key (vehicles.reg_no)");
  if (table === "requisitions" && row.end_date < row.start_date) return err("23514", "requisitions_check");
  if (table === "maintenance") {
    if (!["service", "repair", "inspection", "insurance", "other"].includes(row.kind)) return err("23514", "maintenance kind");
    if (row.expected_back && row.expected_back < row.scheduled_for) return err("23514", "maintenance dates");
  }
  if (table === "fuel_logs" && !(Number(row.litres) > 0)) return err("23514", "fuel litres");
  if (table === "vehicles" && row.status_override && !["maintenance", "breakdown", "unavailable"].includes(row.status_override)) return err("23514", "status_override");
  return null;
}

function likeToRegex(pattern: string): RegExp {
  let out = "";
  for (let i = 0; i < pattern.length; i++) {
    const c = pattern[i];
    if (c === "\\" && i + 1 < pattern.length) out += pattern[++i].replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    else if (c === "%") out += ".*";
    else if (c === "_") out += ".";
    else out += c.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }
  return new RegExp(`^${out}$`, "i");
}

class Query implements PromiseLike<any> {
  private op: "select" | "insert" | "update" | "upsert" | "delete" = "select";
  private payload: any;
  private filters: ((r: Row) => boolean)[] = [];
  private orders: { col: string; asc: boolean }[] = [];
  private limitN: number | null = null;
  private mode: "single" | "maybe" | null = null;
  private returning = false;
  private cols = "*";
  private head = false;
  private wantCount = false;
  private conflict: string | null = null;
  constructor(private table: string) {}

  select(cols = "*", opts?: { count?: string; head?: boolean }) {
    this.returning = true;
    this.cols = cols;
    if (opts?.count) this.wantCount = true;
    if (opts?.head) this.head = true;
    return this;
  }
  insert(p: any) { this.op = "insert"; this.payload = p; return this; }
  update(p: any) { this.op = "update"; this.payload = p; return this; }
  upsert(p: any, o?: { onConflict?: string }) { this.op = "upsert"; this.payload = p; this.conflict = o?.onConflict ?? null; return this; }
  delete() { this.op = "delete"; return this; }
  eq(c: string, v: any) { this.filters.push((r) => r[c] === v); return this; }
  neq(c: string, v: any) { this.filters.push((r) => r[c] !== v); return this; }
  is(c: string, v: any) { this.filters.push((r) => (v === null ? r[c] === null || r[c] === undefined : r[c] === v)); return this; }
  not(c: string, op: string, v: any) {
    if (op !== "is") throw new Error("mock: only not(...,'is',...) supported");
    this.filters.push((r) => !(v === null ? r[c] === null || r[c] === undefined : r[c] === v));
    return this;
  }
  in(c: string, vs: any[]) { this.filters.push((r) => vs.includes(r[c])); return this; }
  ilike(c: string, pat: string) { const re = likeToRegex(pat); this.filters.push((r) => re.test(String(r[c] ?? ""))); return this; }
  lte(c: string, v: any) { this.filters.push((r) => r[c] != null && r[c] <= v); return this; }
  gte(c: string, v: any) { this.filters.push((r) => r[c] != null && r[c] >= v); return this; }
  order(c: string, o?: { ascending?: boolean }) { this.orders.push({ col: c, asc: o?.ascending !== false }); return this; }
  limit(n: number) { this.limitN = n; return this; }
  single() { this.mode = "single"; return this; }
  maybeSingle() { this.mode = "maybe"; return this; }

  private project(rows: Row[]): Row[] {
    const cols = this.cols;
    const embedReq = /requisitions\(/.test(cols);
    let list = rows.map((r) => ({ ...r }));
    if (cols !== "*" && !cols.includes("(") && !cols.startsWith("*")) {
      const names = cols.split(",").map((c) => c.trim());
      list = list.map((r) => Object.fromEntries(names.map((n) => [n, r[n]])));
    } else if (cols.includes("(") && !embedReq) {
      const names = cols.split(",").map((c) => c.trim());
      list = list.map((r) => Object.fromEntries(names.map((n) => [n, r[n]])));
    }
    if (embedReq) {
      list = list.map((r) => {
        const req = db.requisitions.find((x) => x.id === r.requisition_id);
        return { ...r, requisitions: req ? { sno: req.sno, requester: req.requester } : null };
      });
    }
    return list;
  }

  private run(): { data: any; error: any; count?: number | null } {
    const rows = db[this.table];
    if (!rows) return { data: null, error: err("42P01", `relation ${this.table} does not exist`) };
    const matching = () => rows.filter((r) => this.filters.every((f) => f(r)));
    let out: Row[] = [];

    if (this.op === "select") {
      out = matching();
      for (const o of [...this.orders].reverse()) {
        out = [...out].sort((a, b) => {
          const x = a[o.col], y = b[o.col];
          if (x === y) return 0;
          if (x == null) return o.asc ? -1 : 1;
          if (y == null) return o.asc ? 1 : -1;
          return (x < y ? -1 : 1) * (o.asc ? 1 : -1);
        });
      }
      const total = out.length;
      if (this.limitN != null) out = out.slice(0, this.limitN);
      if (this.head) return { data: null, error: null, count: total };
      return this.finish(this.project(out), total);
    }

    if (this.op === "insert" || this.op === "upsert") {
      const inputs: Row[] = Array.isArray(this.payload) ? this.payload : [this.payload];
      const created: Row[] = [];
      for (const input of inputs) {
        if (this.op === "upsert" && this.conflict) {
          const existing = rows.find((r) => r[this.conflict!] === input[this.conflict!]);
          if (existing) {
            const next = { ...existing, ...input };
            const e = checkRow(this.table, next, rows, existing);
            if (e) return { data: null, error: e };
            Object.assign(existing, input);
            created.push(existing);
            continue;
          }
        }
        const row: Row = { ...DEFAULTS[this.table]?.(), ...input };
        if (this.table !== "settings") {
          row.id = ++seq[this.table];
          if (this.table === "requisitions") row.sno = row.id;
        }
        const e = checkRow(this.table, row, rows);
        if (e) return { data: null, error: e };
        rows.push(row);
        created.push(row);
      }
      return this.returning ? this.finish(this.project(created), created.length) : { data: null, error: null };
    }

    if (this.op === "update") {
      const targets = matching();
      for (const t of targets) {
        const next = { ...t, ...this.payload };
        const e = checkRow(this.table, next, rows, t);
        if (e) return { data: null, error: e };
      }
      for (const t of targets) Object.assign(t, this.payload);
      return this.returning ? this.finish(this.project(targets), targets.length) : { data: null, error: null };
    }

    // delete
    const keep = rows.filter((r) => !this.filters.every((f) => f(r)));
    const removed = rows.length - keep.length;
    db[this.table] = keep;
    return { data: null, error: null, count: removed };
  }

  private finish(list: Row[], total: number) {
    if (this.mode === "single") {
      if (list.length !== 1) return { data: null, error: err("PGRST116", "JSON object requested, multiple (or no) rows returned") };
      return { data: list[0], error: null };
    }
    if (this.mode === "maybe") {
      if (list.length > 1) return { data: null, error: err("PGRST116", "multiple rows returned") };
      return { data: list[0] ?? null, error: null };
    }
    return { data: list, error: null, count: this.wantCount ? total : null };
  }

  then<T1 = any, T2 = never>(res?: ((v: any) => T1 | PromiseLike<T1>) | null, rej?: ((r: any) => T2 | PromiseLike<T2>) | null): PromiseLike<T1 | T2> {
    return Promise.resolve().then(() => this.run()).then(res, rej);
  }
}

export const supabase = {
  from: (table: string) => new Query(table),
  async rpc(fn: string, args: Row) {
    if (fn !== "record_login") return { data: null, error: err("42883", `function ${fn} does not exist`) };
    const users = db.users;
    let u = users.find((x) => x.role === args.p_role && String(x.name).toLowerCase() === String(args.p_name).trim().toLowerCase());
    if (u) u.last_login = now();
    else {
      u = { ...DEFAULTS.users(), id: ++seq.users, name: String(args.p_name).trim(), role: args.p_role, last_login: now() };
      users.push(u);
    }
    db.activity_log.push({ ...DEFAULTS.activity_log(), id: ++seq.activity_log, actor_role: args.p_role, actor_name: u.name, action: "login" });
    return { data: u, error: null };
  },
};

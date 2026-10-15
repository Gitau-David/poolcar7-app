import { getSessionFromRequest } from "./auth";
import { findPrivilegedByName, getSettings } from "./data";
import { can, isBackOffice, type Permission } from "./permissions";
import type { AppSettings, Session } from "./types";

type NextRequest = Parameters<typeof getSessionFromRequest>[0];
type NextResponse = Response;

const NextResponse = {
  json(body: unknown, init?: ResponseInit): Response {
    const headers = new Headers(init?.headers);
    if (!headers.has("content-type")) headers.set("content-type", "application/json");
    return new Response(JSON.stringify(body), { ...init, headers });
  },
};

/**
 * The session as it stands RIGHT NOW. Staff are trusted from the signed
 * token (name only, no stored privileges). Back-office accounts are
 * re-read from the database on every request — so when an IT Admin disables
 * someone or changes their role, it takes effect on their very next click,
 * not when their 8-hour token happens to expire. The role used is always the
 * database's, never the one frozen in the token.
 */
export async function resolveSession(req: NextRequest): Promise<Session | null> {
  const token = getSessionFromRequest(req);
  if (!token) return null;
  if (!isBackOffice(token.role)) return token;
  const account = await findPrivilegedByName(token.name);
  if (!account) return null;
  return { name: account.name, role: account.role };
}

type GuardResult = { ok: true; session: Session } | { ok: false; res: NextResponse };

/**
 * Usage in a route:
 *   const g = await guard(req, "fleet:write");
 *   if (!g.ok) return g.res;
 *   const { session } = g;
 * No permission argument = any signed-in person.
 */
export async function guard(req: NextRequest, permission?: Permission): Promise<GuardResult> {
  const session = await resolveSession(req);
  if (!session) return { ok: false, res: NextResponse.json({ error: "Not signed in" }, { status: 401 }) };
  if (permission && !can(session.role, permission)) {
    return { ok: false, res: NextResponse.json({ error: "You don't have permission to do that" }, { status: 403 }) };
  }
  return { ok: true, session };
}

/** Returns a 403 response if an IT Admin has switched this module off, otherwise null. */
export async function moduleOff(module: "module_messages" | "module_maintenance"): Promise<NextResponse | null> {
  const settings: AppSettings = await getSettings();
  return settings[module]
    ? null
    : NextResponse.json({ error: "This module has been switched off by an IT Admin" }, { status: 403 });
}

/** Back-office actor for data.ts (name + live role). */
export const actorOf = (s: Session) => ({ name: s.name, role: s.role });

import { NextRequest, NextResponse } from "next/server";
import { actorOf, guard } from "@/lib/guard";
import { createUser, listUsers } from "@/lib/data";
import type { Role } from "@/lib/types";

// IT Admin only: the account directory (pin_hash is never selected).
export async function GET(req: NextRequest) {
  const g = await guard(req, "users:manage");
  if (!g.ok) return g.res;
  return NextResponse.json({ users: await listUsers() });
}

export async function POST(req: NextRequest) {
  const g = await guard(req, "users:manage");
  if (!g.ok) return g.res;
  const { name, role, pin } = await req.json().catch(() => ({}));
  const result = await createUser(String(name ?? ""), role as Role, pin ? String(pin) : undefined, actorOf(g.session));
  if (!result.ok) return NextResponse.json({ error: result.reason }, { status: 400 });
  return NextResponse.json({ user: result.user }, { status: 201 });
}

import { NextRequest, NextResponse } from "next/server";
import { actorOf, guard } from "@/lib/guard";
import { isBackOffice } from "@/lib/permissions";
import { addDriver, listDrivers } from "@/lib/data";

export async function GET(req: NextRequest) {
  const g = await guard(req);
  if (!g.ok) return g.res;
  const includeInactive = req.nextUrl.searchParams.get("all") === "true" && isBackOffice(g.session.role);
  return NextResponse.json({ drivers: await listDrivers(!includeInactive) });
}

export async function POST(req: NextRequest) {
  const g = await guard(req, "drivers:manage");
  if (!g.ok) return g.res;
  const { name, phone } = await req.json();
  if (!name || !String(name).trim()) return NextResponse.json({ error: "name is required" }, { status: 400 });
  const driver = await addDriver(String(name).trim(), phone ? String(phone).trim() : undefined, actorOf(g.session));
  return NextResponse.json({ driver }, { status: 201 });
}

import { NextRequest, NextResponse } from "next/server";
import { actorOf, guard } from "@/lib/guard";
import { restoreDriver } from "@/lib/data";

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const g = await guard(req, "drivers:manage");
  if (!g.ok) return g.res;
  const driver = await restoreDriver(Number(params.id), actorOf(g.session));
  if (!driver) return NextResponse.json({ error: "Driver not found" }, { status: 404 });
  return NextResponse.json({ driver });
}

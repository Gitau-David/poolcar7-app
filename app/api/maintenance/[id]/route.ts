import { NextRequest, NextResponse } from "next/server";
import { actorOf, guard, moduleOff } from "@/lib/guard";
import { cancelMaintenance } from "@/lib/data";

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const g = await guard(req, "fleet:maintenance");
  if (!g.ok) return g.res;
  const off = await moduleOff("module_maintenance");
  if (off) return off;
  const result = await cancelMaintenance(Number(params.id), actorOf(g.session));
  if (!result.ok) return NextResponse.json({ error: result.reason }, { status: 409 });
  return NextResponse.json({ ok: true });
}

import { NextRequest, NextResponse } from "next/server";
import { actorOf, guard } from "@/lib/guard";
import { removeDriver } from "@/lib/data";

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const g = await guard(req, "drivers:manage");
  if (!g.ok) return g.res;
  const result = await removeDriver(Number(params.id), actorOf(g.session));
  if (!result.ok) return NextResponse.json({ error: result.reason }, { status: 409 });
  return NextResponse.json({ ok: true });
}

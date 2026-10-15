import { NextRequest, NextResponse } from "next/server";
import { actorOf, guard, moduleOff } from "@/lib/guard";
import { completeMaintenance } from "@/lib/data";

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const g = await guard(req, "fleet:maintenance");
  if (!g.ok) return g.res;
  const off = await moduleOff("module_maintenance");
  if (off) return off;
  const body = await req.json().catch(() => ({}));
  const result = await completeMaintenance(
    Number(params.id),
    {
      cost: body.cost === "" || body.cost == null ? null : Number(body.cost),
      completed_on: body.completed_on || undefined,
      renewed_until: body.renewed_until || null,
    },
    actorOf(g.session)
  );
  if (!result.ok) return NextResponse.json({ error: result.reason }, { status: 409 });
  return NextResponse.json({ record: result.record });
}

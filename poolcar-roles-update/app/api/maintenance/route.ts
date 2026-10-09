import { NextRequest, NextResponse } from "next/server";
import { actorOf, guard, moduleOff } from "@/lib/guard";
import { listMaintenance, scheduleMaintenance } from "@/lib/data";

export async function GET(req: NextRequest) {
  const g = await guard(req, "fleet:maintenance");
  if (!g.ok) return g.res;
  const off = await moduleOff("module_maintenance");
  if (off) return off;
  return NextResponse.json({ records: await listMaintenance() });
}

export async function POST(req: NextRequest) {
  const g = await guard(req, "fleet:maintenance");
  if (!g.ok) return g.res;
  const off = await moduleOff("module_maintenance");
  if (off) return off;
  const body = await req.json().catch(() => ({}));
  const result = await scheduleMaintenance(
    {
      vehicle_id: Number(body.vehicle_id),
      kind: String(body.kind ?? ""),
      scheduled_for: String(body.scheduled_for ?? ""),
      expected_back: body.expected_back || null,
      notes: typeof body.notes === "string" ? body.notes : undefined,
    },
    actorOf(g.session)
  );
  if (!result.ok) return NextResponse.json({ error: result.reason }, { status: 409 });
  return NextResponse.json({ record: result.record }, { status: 201 });
}

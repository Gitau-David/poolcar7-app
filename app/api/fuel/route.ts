import { NextRequest, NextResponse } from "next/server";
import { actorOf, guard, moduleOff } from "@/lib/guard";
import { addFuelLog, listFuelLogs } from "@/lib/data";

export async function GET(req: NextRequest) {
  const g = await guard(req, "fleet:maintenance");
  if (!g.ok) return g.res;
  const off = await moduleOff("module_maintenance");
  if (off) return off;
  return NextResponse.json({ logs: await listFuelLogs() });
}

export async function POST(req: NextRequest) {
  const g = await guard(req, "fleet:maintenance");
  if (!g.ok) return g.res;
  const off = await moduleOff("module_maintenance");
  if (off) return off;
  const body = await req.json().catch(() => ({}));
  const result = await addFuelLog(
    {
      vehicle_id: Number(body.vehicle_id),
      litres: Number(body.litres),
      cost: body.cost === "" || body.cost == null ? null : Number(body.cost),
      odometer_km: body.odometer_km === "" || body.odometer_km == null ? null : Number(body.odometer_km),
      logged_on: body.logged_on || undefined,
    },
    actorOf(g.session)
  );
  if (!result.ok) return NextResponse.json({ error: result.reason }, { status: 400 });
  return NextResponse.json({ log: result.log }, { status: 201 });
}

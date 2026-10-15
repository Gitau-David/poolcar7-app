import { NextRequest, NextResponse } from "next/server";
import { actorOf, guard } from "@/lib/guard";
import { setVehicleAvailability } from "@/lib/data";
import type { VehicleOverride } from "@/lib/types";

const OVERRIDES = ["maintenance", "breakdown", "unavailable"];

// Fleet Manager: mark a vehicle unavailable (or put it back in service with override: null).
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const g = await guard(req, "fleet:write");
  if (!g.ok) return g.res;
  const body = await req.json().catch(() => ({}));
  const override = body.override ?? null;
  if (override !== null && !OVERRIDES.includes(override)) {
    return NextResponse.json({ error: "Unknown status" }, { status: 400 });
  }
  const result = await setVehicleAvailability(
    Number(params.id),
    override as VehicleOverride | null,
    typeof body.note === "string" ? body.note : undefined,
    actorOf(g.session)
  );
  if (!result.ok) return NextResponse.json({ error: result.reason }, { status: 409 });
  return NextResponse.json({ vehicle: result.vehicle, affected: result.affected ?? [] });
}

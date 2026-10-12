import { NextRequest, NextResponse } from "next/server";
import { actorOf, guard } from "@/lib/guard";
import { allocate } from "@/lib/data";

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const g = await guard(req, "trips:allocate");
  if (!g.ok) return g.res;

  const { vehicleId, driverId } = await req.json();
  if (!vehicleId || !driverId) {
    return NextResponse.json({ error: "vehicleId and driverId are required" }, { status: 400 });
  }
  const result = await allocate(Number(params.id), Number(vehicleId), Number(driverId), actorOf(g.session));
  if (!result.ok) return NextResponse.json({ error: result.reason }, { status: 409 });
  return NextResponse.json({ requisition: result.requisition });
}

import { NextRequest, NextResponse } from "next/server";
import { actorOf, guard } from "@/lib/guard";
import { removeVehicle, updateVehicle, type VehiclePatch } from "@/lib/data";

// Fleet Manager: edit a vehicle's details, compliance dates, mileage, default driver.
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const g = await guard(req, "fleet:write");
  if (!g.ok) return g.res;
  const body = await req.json().catch(() => ({}));
  const patch: VehiclePatch = {};
  for (const key of ["reg_no", "model", "insurance_expiry", "inspection_expiry"] as const) {
    if (key in body) patch[key] = body[key];
  }
  if ("odometer_km" in body) patch.odometer_km = body.odometer_km === "" || body.odometer_km == null ? null : Number(body.odometer_km);
  if ("default_driver_id" in body) patch.default_driver_id = body.default_driver_id ? Number(body.default_driver_id) : null;

  const result = await updateVehicle(Number(params.id), patch, actorOf(g.session));
  if (!result.ok) return NextResponse.json({ error: result.reason }, { status: 409 });
  return NextResponse.json({ vehicle: result.vehicle });
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const g = await guard(req, "fleet:write");
  if (!g.ok) return g.res;
  const result = await removeVehicle(Number(params.id), actorOf(g.session));
  if (!result.ok) return NextResponse.json({ error: result.reason }, { status: 409 });
  return NextResponse.json({ ok: true });
}

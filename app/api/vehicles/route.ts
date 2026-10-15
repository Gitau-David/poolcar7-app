import { NextRequest, NextResponse } from "next/server";
import { actorOf, guard } from "@/lib/guard";
import { isBackOffice } from "@/lib/permissions";
import { addVehicle, listVehicles } from "@/lib/data";

export async function GET(req: NextRequest) {
  const g = await guard(req);
  if (!g.ok) return g.res;
  // Removed vehicles are soft-deleted (active = false) so history stays intact,
  // but they disappear from every normal list. Only back-office roles can ask
  // for ?all=true (Manage Fleet's "removed" rows, history lookups).
  const includeInactive = req.nextUrl.searchParams.get("all") === "true" && isBackOffice(g.session.role);
  return NextResponse.json({ vehicles: await listVehicles(!includeInactive) });
}

export async function POST(req: NextRequest) {
  const g = await guard(req, "fleet:write");
  if (!g.ok) return g.res;
  const { reg_no, model, insurance_expiry, inspection_expiry, odometer_km, default_driver_id } = await req.json();
  if (!reg_no || !model) return NextResponse.json({ error: "reg_no and model are required" }, { status: 400 });
  const result = await addVehicle(String(reg_no), String(model), actorOf(g.session), {
    insurance_expiry: insurance_expiry || null,
    inspection_expiry: inspection_expiry || null,
    odometer_km: odometer_km === "" || odometer_km == null ? null : Number(odometer_km),
    default_driver_id: default_driver_id ? Number(default_driver_id) : null,
  });
  if (!result.ok) return NextResponse.json({ error: result.reason }, { status: 400 });
  return NextResponse.json({ vehicle: result.vehicle }, { status: 201 });
}

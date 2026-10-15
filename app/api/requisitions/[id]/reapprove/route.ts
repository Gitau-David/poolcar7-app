import { NextRequest, NextResponse } from "next/server";
import { guard } from "@/lib/guard";
import { reapproveRequisition, verifyAdminCredentials } from "@/lib/data";

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const g = await guard(req, "trips:allocate");
  if (!g.ok) return g.res;

  const body = await req.json().catch(() => ({}));
  const { vehicleId, driverId } = body;
  if (!vehicleId || !driverId) {
    return NextResponse.json({ error: "vehicleId and driverId are required" }, { status: 400 });
  }
  const admin = await verifyAdminCredentials(String(body.name ?? ""), String(body.pin ?? ""));
  if (!admin) return NextResponse.json({ error: "Incorrect admin name or PIN" }, { status: 401 });

  const result = await reapproveRequisition(Number(params.id), Number(vehicleId), Number(driverId), {
    name: admin.name,
    role: admin.role,
  });
  if (!result.ok) return NextResponse.json({ error: result.reason }, { status: 409 });
  return NextResponse.json({ requisition: result.requisition });
}

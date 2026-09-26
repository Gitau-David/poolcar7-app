import { NextRequest, NextResponse } from "next/server";
import { getSessionFromRequest } from "@/lib/auth";
import { isAdminLike } from "@/lib/require-admin";
import { reapproveRequisition, verifyAdminCredentials } from "@/lib/data";

// Admin reversing an earlier denial and approving it after all.
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const session = getSessionFromRequest(req);
  if (!isAdminLike(session)) {
    return NextResponse.json({ error: "Admin access required" }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const { vehicleId, driverId } = body;
  if (!vehicleId || !driverId) {
    return NextResponse.json({ error: "vehicleId and driverId are required" }, { status: 400 });
  }

  const admin = await verifyAdminCredentials(String(body.name ?? ""), String(body.pin ?? ""));
  if (!admin) return NextResponse.json({ error: "Incorrect admin name or PIN" }, { status: 401 });

  const result = await reapproveRequisition(Number(params.id), Number(vehicleId), Number(driverId), admin.name);
  if (!result.ok) return NextResponse.json({ error: result.reason }, { status: 409 });
  return NextResponse.json({ requisition: result.requisition });
}

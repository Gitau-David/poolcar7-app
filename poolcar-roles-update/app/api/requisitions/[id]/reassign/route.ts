import { NextRequest, NextResponse } from "next/server";
import { guard } from "@/lib/guard";
import { can } from "@/lib/permissions";
import { reassignRequisition, verifyAdminCredentials } from "@/lib/data";

// Operations Lead: move an approved trip to another vehicle and/or driver.
// Needs a reason and a credential re-check — it changes a plan the
// requester and driver are already counting on.
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const g = await guard(req, "trips:reassign");
  if (!g.ok) return g.res;

  const body = await req.json().catch(() => ({}));
  const { vehicleId, driverId } = body;
  if (!vehicleId || !driverId) {
    return NextResponse.json({ error: "vehicleId and driverId are required" }, { status: 400 });
  }
  const reason = String(body.reason ?? "").trim();
  if (!reason) return NextResponse.json({ error: "A reason is required" }, { status: 400 });

  const admin = await verifyAdminCredentials(String(body.name ?? ""), String(body.pin ?? ""));
  if (!admin || !can(admin.role, "trips:reassign")) {
    return NextResponse.json({ error: "Incorrect admin name or PIN" }, { status: 401 });
  }

  const result = await reassignRequisition(Number(params.id), Number(vehicleId), Number(driverId), reason, {
    name: admin.name,
    role: admin.role,
  });
  if (!result.ok) return NextResponse.json({ error: result.reason }, { status: 409 });
  return NextResponse.json({ requisition: result.requisition });
}

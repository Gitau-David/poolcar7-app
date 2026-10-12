import { NextRequest, NextResponse } from "next/server";
import { guard } from "@/lib/guard";
import { adminCancelRequisition, verifyAdminCredentials } from "@/lib/data";

// Cancelling an already-approved trip — distinct from /cancel (a requester
// withdrawing their own pending request). Needs a reason and a credential re-check.
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const g = await guard(req, "trips:allocate");
  if (!g.ok) return g.res;

  const body = await req.json().catch(() => ({}));
  const reason = String(body.reason ?? "").trim();
  if (!reason) return NextResponse.json({ error: "A reason is required" }, { status: 400 });

  const admin = await verifyAdminCredentials(String(body.name ?? ""), String(body.pin ?? ""));
  if (!admin) return NextResponse.json({ error: "Incorrect admin name or PIN" }, { status: 401 });

  const result = await adminCancelRequisition(Number(params.id), reason, { name: admin.name, role: admin.role });
  if (!result.ok) return NextResponse.json({ error: result.reason }, { status: 409 });
  return NextResponse.json({ requisition: result.requisition });
}

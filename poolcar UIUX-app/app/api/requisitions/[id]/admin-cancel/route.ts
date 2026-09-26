import { NextRequest, NextResponse } from "next/server";
import { getSessionFromRequest } from "@/lib/auth";
import { isAdminLike } from "@/lib/require-admin";
import { adminCancelRequisition, verifyAdminCredentials } from "@/lib/data";

// Admin cancelling a trip that was already approved (Scheduled/Active) —
// distinct from /cancel, which is a staff member cancelling their own
// still-unresolved request. Always requires a reason and a credential
// re-check, since this reverses a decision someone was already relying on.
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const session = getSessionFromRequest(req);
  if (!isAdminLike(session)) {
    return NextResponse.json({ error: "Admin access required" }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const reason = String(body.reason ?? "").trim();
  if (!reason) return NextResponse.json({ error: "A reason is required" }, { status: 400 });

  const admin = await verifyAdminCredentials(String(body.name ?? ""), String(body.pin ?? ""));
  if (!admin) return NextResponse.json({ error: "Incorrect admin name or PIN" }, { status: 401 });

  const result = await adminCancelRequisition(Number(params.id), reason, admin.name);
  if (!result.ok) return NextResponse.json({ error: result.reason }, { status: 409 });
  return NextResponse.json({ requisition: result.requisition });
}

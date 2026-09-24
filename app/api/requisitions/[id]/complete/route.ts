import { NextRequest, NextResponse } from "next/server";
import { getSessionFromRequest } from "@/lib/auth";
import { isAdminLike } from "@/lib/require-admin";
import { completeRequisition, verifyAdminCredentials } from "@/lib/data";

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const session = getSessionFromRequest(req);
  if (!isAdminLike(session)) {
    return NextResponse.json({ error: "Admin access required" }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  // Step-up auth: being logged in as an admin isn't enough on its own for
  // this — re-checking name + PIN here confirms it's actually this admin
  // acting, right now, not just an unattended session.
  const admin = await verifyAdminCredentials(String(body.name ?? ""), String(body.pin ?? ""));
  if (!admin) return NextResponse.json({ error: "Incorrect admin name or PIN" }, { status: 401 });

  const result = await completeRequisition(Number(params.id), admin.name);
  if (!result.ok) return NextResponse.json({ error: result.reason }, { status: 409 });
  return NextResponse.json({ requisition: result.requisition });
}

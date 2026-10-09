import { NextRequest, NextResponse } from "next/server";
import { guard } from "@/lib/guard";
import { completeRequisition, verifyAdminCredentials } from "@/lib/data";

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const g = await guard(req, "trips:allocate");
  if (!g.ok) return g.res;

  const body = await req.json().catch(() => ({}));
  // Step-up auth: re-check name + PIN so it's actually this person acting, right now.
  const admin = await verifyAdminCredentials(String(body.name ?? ""), String(body.pin ?? ""));
  if (!admin) return NextResponse.json({ error: "Incorrect admin name or PIN" }, { status: 401 });

  const result = await completeRequisition(Number(params.id), { name: admin.name, role: admin.role });
  if (!result.ok) return NextResponse.json({ error: result.reason }, { status: 409 });
  return NextResponse.json({ requisition: result.requisition });
}

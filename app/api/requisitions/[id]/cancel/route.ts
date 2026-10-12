import { NextRequest, NextResponse } from "next/server";
import { guard } from "@/lib/guard";
import { can } from "@/lib/permissions";
import { cancelRequisition } from "@/lib/data";

// Staff cancel their own unresolved requests; anyone who can allocate trips may cancel any.
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const g = await guard(req);
  if (!g.ok) return g.res;
  const { session } = g;

  const result = await cancelRequisition(Number(params.id), session.name, can(session.role, "trips:allocate"), session.role);
  if (!result.ok) return NextResponse.json({ error: result.reason }, { status: 409 });
  return NextResponse.json({ requisition: result.requisition });
}

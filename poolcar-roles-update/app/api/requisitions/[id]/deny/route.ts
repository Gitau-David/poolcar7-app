import { NextRequest, NextResponse } from "next/server";
import { actorOf, guard } from "@/lib/guard";
import { denyRequisition } from "@/lib/data";

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const g = await guard(req, "trips:allocate");
  if (!g.ok) return g.res;

  const body = await req.json().catch(() => ({}));
  const result = await denyRequisition(Number(params.id), body.reason, actorOf(g.session));
  if (!result.ok) return NextResponse.json({ error: result.reason }, { status: 409 });
  return NextResponse.json({ requisition: result.requisition });
}

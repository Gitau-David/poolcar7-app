import { NextRequest, NextResponse } from "next/server";
import { guard } from "@/lib/guard";
import { createRequisition, listRequisitions } from "@/lib/data";

export async function GET(req: NextRequest) {
  const g = await guard(req);
  if (!g.ok) return g.res;
  return NextResponse.json({ requisitions: await listRequisitions() });
}

// Only staff submit requests — the back-office roles process them.
export async function POST(req: NextRequest) {
  const g = await guard(req, undefined);
  if (!g.ok) return g.res;
  const { session } = g;
  if (session.role !== "user") {
    return NextResponse.json({ error: "Only staff accounts can submit requisitions" }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const required = ["requester", "department", "start_date", "end_date", "origin", "destination"];
  for (const field of required) {
    if (!body[field] || !String(body[field]).trim()) return NextResponse.json({ error: `Missing field: ${field}` }, { status: 400 });
  }
  if (body.start_date > body.end_date) {
    return NextResponse.json({ error: "End date must be on or after start date" }, { status: 400 });
  }

  const requisition = await createRequisition({
    // Editable: who the trip is actually for (may differ from who's filing it).
    requester: String(body.requester).trim(),
    // Never client-supplied: the signed-in staff member's own name — this is
    // what "cancel my request" is authorized against, so it can't be spoofed.
    submittedBy: session.name,
    department: String(body.department).trim(),
    start_date: body.start_date,
    end_date: body.end_date,
    origin: String(body.origin).trim(),
    destination: String(body.destination).trim(),
    purpose: body.purpose,
  });
  return NextResponse.json({ requisition }, { status: 201 });
}

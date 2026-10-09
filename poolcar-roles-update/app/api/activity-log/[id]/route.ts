import { NextRequest, NextResponse } from "next/server";
import { guard } from "@/lib/guard";
import { deleteActivityLogEntry } from "@/lib/data";

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const g = await guard(req, "audit:view");
  if (!g.ok) return g.res;
  await deleteActivityLogEntry(Number(params.id));
  return NextResponse.json({ ok: true });
}

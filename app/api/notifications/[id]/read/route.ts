import { NextRequest, NextResponse } from "next/server";
import { guard } from "@/lib/guard";
import { can } from "@/lib/permissions";
import { markNotificationRead } from "@/lib/data";

// You can mark your own notifications read; people who relay driver notices
// (Operations Lead / IT Admin) can also mark those — nobody else's.
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const g = await guard(req);
  if (!g.ok) return g.res;
  const result = await markNotificationRead(Number(params.id), g.session.name, can(g.session.role, "drivers:manage"));
  if (!result.ok) return NextResponse.json({ error: result.reason }, { status: result.status ?? 403 });
  return NextResponse.json({ ok: true });
}

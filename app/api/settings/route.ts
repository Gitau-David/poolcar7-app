import { NextRequest, NextResponse } from "next/server";
import { actorOf, guard } from "@/lib/guard";
import { getSettings, updateSettings } from "@/lib/data";

// Any signed-in person can read settings (the sidebar needs the module toggles); only IT Admin changes them.
export async function GET(req: NextRequest) {
  const g = await guard(req);
  if (!g.ok) return g.res;
  return NextResponse.json({ settings: await getSettings() });
}

export async function PUT(req: NextRequest) {
  const g = await guard(req, "settings:manage");
  if (!g.ok) return g.res;
  const body = await req.json().catch(() => ({}));
  const result = await updateSettings(body, actorOf(g.session));
  if (!result.ok) return NextResponse.json({ error: result.reason }, { status: 400 });
  return NextResponse.json({ settings: result.settings });
}

import { NextRequest, NextResponse } from "next/server";
import { guard } from "@/lib/guard";
import { listNotifications } from "@/lib/data";

export async function GET(req: NextRequest) {
  const g = await guard(req);
  if (!g.ok) return g.res;
  const unreadOnly = new URL(req.url).searchParams.get("unreadOnly") === "true";
  return NextResponse.json({ notifications: await listNotifications(g.session.name, unreadOnly) });
}

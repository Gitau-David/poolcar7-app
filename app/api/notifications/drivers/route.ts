import { NextRequest, NextResponse } from "next/server";
import { guard } from "@/lib/guard";
import { listDriverNotices } from "@/lib/data";

// Operations: notices that mention a driver, so someone knows who needs a call —
// drivers have no login of their own to check this themselves.
export async function GET(req: NextRequest) {
  const g = await guard(req, "drivers:manage");
  if (!g.ok) return g.res;
  const unreadOnly = new URL(req.url).searchParams.get("unreadOnly") === "true";
  return NextResponse.json({ notifications: await listDriverNotices(unreadOnly) });
}

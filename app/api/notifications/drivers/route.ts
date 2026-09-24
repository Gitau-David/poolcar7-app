import { NextRequest, NextResponse } from "next/server";
import { getSessionFromRequest } from "@/lib/auth";
import { isAdminLike } from "@/lib/require-admin";
import { listDriverNotices } from "@/lib/data";

// Admin-only: notices that mention a driver, so an admin can see who needs
// a call — drivers have no login of their own to check this themselves.
export async function GET(req: NextRequest) {
  const session = getSessionFromRequest(req);
  if (!isAdminLike(session)) return NextResponse.json({ error: "Admin access required" }, { status: 403 });

  const { searchParams } = new URL(req.url);
  const unreadOnly = searchParams.get("unreadOnly") === "true";
  const notifications = await listDriverNotices(unreadOnly);
  return NextResponse.json({ notifications });
}

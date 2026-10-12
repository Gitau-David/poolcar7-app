import { NextRequest, NextResponse } from "next/server";
import { guard } from "@/lib/guard";
import { listActivityLog } from "@/lib/data";

export async function GET(req: NextRequest) {
  const g = await guard(req, "audit:view");
  if (!g.ok) return g.res;
  const date = req.nextUrl.searchParams.get("date") || undefined;
  return NextResponse.json({ entries: await listActivityLog(date) });
}

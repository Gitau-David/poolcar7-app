import { NextRequest, NextResponse } from "next/server";
import { guard } from "@/lib/guard";
import { getFleetUsageReport } from "@/lib/data";

export async function GET(req: NextRequest) {
  const g = await guard(req, "fleet:reports");
  if (!g.ok) return g.res;
  const days = Math.min(365, Math.max(1, Number(req.nextUrl.searchParams.get("days")) || 30));
  return NextResponse.json({ days, rows: await getFleetUsageReport(days) });
}

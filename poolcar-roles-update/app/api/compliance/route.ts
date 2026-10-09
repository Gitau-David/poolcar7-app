import { NextRequest, NextResponse } from "next/server";
import { guard } from "@/lib/guard";
import { getComplianceAlerts } from "@/lib/data";

// Insurance / inspection expiries and upcoming workshop jobs — the Fleet Manager's alert feed.
export async function GET(req: NextRequest) {
  const g = await guard(req, "fleet:maintenance");
  if (!g.ok) return g.res;
  return NextResponse.json({ alerts: await getComplianceAlerts() });
}

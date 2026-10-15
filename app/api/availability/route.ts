import { NextRequest, NextResponse } from "next/server";
import { guard } from "@/lib/guard";
import { availableFor } from "@/lib/data";

export async function GET(req: NextRequest) {
  const g = await guard(req);
  if (!g.ok) return g.res;

  const { searchParams } = new URL(req.url);
  const start = searchParams.get("start");
  const end = searchParams.get("end");
  if (!start || !end) return NextResponse.json({ error: "start and end are required" }, { status: 400 });

  // Reassigning an approved trip passes its own id so it doesn't count as busy against itself.
  const exclude = Number(searchParams.get("excludeReq")) || undefined;
  return NextResponse.json(await availableFor(start, end, exclude));
}

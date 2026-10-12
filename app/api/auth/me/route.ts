import { NextRequest, NextResponse } from "next/server";
import { resolveSession } from "@/lib/guard";

// Back-office roles come from the database, so a role change or a disabled
// account shows up on the next page load.
export async function GET(req: NextRequest) {
  const session = await resolveSession(req);
  return NextResponse.json({ session });
}

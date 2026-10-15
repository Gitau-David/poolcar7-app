import { NextResponse } from "next/server";

// Sessions are stateless signed tokens held client-side in sessionStorage,
// so there is nothing to invalidate here — the client discards its token.
export async function POST() {
  return NextResponse.json({ ok: true });
}

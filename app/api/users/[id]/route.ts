import { NextRequest, NextResponse } from "next/server";
import { actorOf, guard } from "@/lib/guard";
import { updateUser } from "@/lib/data";
import type { Role } from "@/lib/types";

// IT Admin only: change role, enable/disable, or reset a PIN.
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const g = await guard(req, "users:manage");
  if (!g.ok) return g.res;
  const body = await req.json().catch(() => ({}));
  const result = await updateUser(
    Number(params.id),
    {
      role: body.role as Role | undefined,
      active: typeof body.active === "boolean" ? body.active : undefined,
      pin: typeof body.pin === "string" ? body.pin : undefined,
    },
    actorOf(g.session)
  );
  if (!result.ok) return NextResponse.json({ error: result.reason }, { status: 409 });
  return NextResponse.json({ user: result.user });
}

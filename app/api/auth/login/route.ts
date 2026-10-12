import { NextRequest, NextResponse } from "next/server";
import { encodeSession, hashPin } from "@/lib/session";
import { findPrivilegedByName, recordLogin } from "@/lib/data";
import type { Role } from "@/lib/types";

export async function POST(req: NextRequest) {
  const body = await req.json();
  const roleChoice: "user" | "admin" = body.role;
  const name: string = (body.name || "").trim();

  if (!name) {
    return NextResponse.json({ error: "Name is required" }, { status: 400 });
  }

  let role: Role;
  let canonicalName = name;

  if (roleChoice === "admin") {
    // "Admin" on the login page covers every back-office account — Fleet
    // Manager, Operations Lead and IT Admin. The account's own stored role
    // decides which one the session becomes; nobody picks their role here.
    const account = await findPrivilegedByName(name);
    if (!account) {
      return NextResponse.json({ error: "No admin account with that name" }, { status: 401 });
    }
    if (hashPin(String(body.pin ?? "")) !== account.pin_hash) {
      return NextResponse.json({ error: "Incorrect PIN" }, { status: 401 });
    }
    role = account.role;
    canonicalName = account.name;
  } else if (roleChoice === "user") {
    role = "user";
  } else {
    return NextResponse.json({ error: "Invalid role" }, { status: 400 });
  }

  // Best-effort: never blocks an otherwise-successful login.
  await recordLogin(canonicalName, role);

  const token = encodeSession({ name: canonicalName, role });
  return NextResponse.json({ name: canonicalName, role, token });
}

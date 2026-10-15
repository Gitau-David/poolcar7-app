import { NextRequest, NextResponse } from "next/server";
import { guard, moduleOff } from "@/lib/guard";
import { listMessages, sendMessage } from "@/lib/data";

export async function GET(req: NextRequest) {
  const g = await guard(req);
  if (!g.ok) return g.res;
  const off = await moduleOff("module_messages");
  if (off) return off;
  return NextResponse.json({ messages: await listMessages() });
}

export async function POST(req: NextRequest) {
  const g = await guard(req);
  if (!g.ok) return g.res;
  const off = await moduleOff("module_messages");
  if (off) return off;

  const body = await req.json().catch(() => ({}));
  const text = String(body.body ?? "").trim();
  if (!text) return NextResponse.json({ error: "Message can't be empty" }, { status: 400 });
  if (text.length > 2000) return NextResponse.json({ error: "Message is too long" }, { status: 400 });

  const message = await sendMessage(g.session.name, g.session.role, text);
  return NextResponse.json({ message }, { status: 201 });
}

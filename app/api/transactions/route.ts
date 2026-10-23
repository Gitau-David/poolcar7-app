import { NextRequest, NextResponse } from "next/server";
import { getSessionFromRequest } from "@/lib/auth";
import { isAdminLike } from "@/lib/require-admin";
import {
  listActivityForUser,
  listActivityLog,
  listDriverNotices,
  listDrivers,
  listNotifications,
  listRequisitions,
  listVehicles,
} from "@/lib/data";
import { buildEvents } from "@/lib/transactions";
import type { Notification } from "@/lib/types";

export async function GET(req: NextRequest) {
  const session = getSessionFromRequest(req);
  if (!session) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const admin = isAdminLike(session);
  const me = session.name.trim().toLowerCase();

  const all = await listRequisitions();
  const requisitions = admin
    ? all
    : all.filter((r) => (r.submitted_by || r.requester).trim().toLowerCase() === me);

  const [activity, vehicles, drivers, own, driverNotices] = await Promise.all([
    admin ? listActivityLog(undefined, 500) : listActivityForUser(session.name, requisitions.map((r) => r.id)),
    listVehicles(false),
    listDrivers(false),
    listNotifications(session.name),
    admin ? listDriverNotices() : Promise.resolve([] as Notification[]),
  ]);

  const notifications = [...new Map([...own, ...driverNotices].map((n) => [n.id, n])).values()];
  const events = buildEvents({ me: session.name, activity, notifications, vehicles, drivers });

  return NextResponse.json({ requisitions, events });
}

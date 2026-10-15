import * as crypto from "node:crypto";
import type { Session } from "./types";
import { ROLES } from "./permissions";

// Signed, stateless session token (HMAC-SHA256) — no external auth library
// and no Supabase Auth. Carried as an Authorization: Bearer header, not a
// cookie — see lib/auth.ts for why (cookies are shared across every tab in
// a browser, which breaks staying logged in as different roles in
// different tabs). Staff log in with just a name, admins/IT admins with a
// name + PIN, and role is always re-derived server-side from this signed
// token, never trusted from the client.
const SECRET = process.env.SESSION_SECRET || "dev-only-secret-change-me";
export const SESSION_MAX_AGE = 60 * 60 * 8; // 8 hours

function encodeBase64Url(value: string): string {
  const bytes = new TextEncoder().encode(value);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function decodeBase64Url(value: string): string {
  const base64 = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = base64 + "=".repeat((4 - (base64.length % 4)) % 4);
  const binary = atob(padded);
  const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

function sign(payload: string): string {
  return crypto.createHmac("sha256", SECRET).update(payload).digest("hex");
}

export function hashPin(pin: string): string {
  return crypto.createHash("sha256").update(pin).digest("hex");
}

export function encodeSession(session: Session): string {
  const payload = encodeBase64Url(
    JSON.stringify({ ...session, exp: Date.now() + SESSION_MAX_AGE * 1000 })
  );
  return `${payload}.${sign(payload)}`;
}

export function decodeSession(token: string | undefined | null): Session | null {
  if (!token) return null;
  const [payload, sig] = token.split(".");
  if (!payload || !sig) return null;
  if (sign(payload) !== sig) return null; // tampered or wrong secret
  try {
    const data = JSON.parse(decodeBase64Url(payload));
    if (typeof data.exp === "number" && data.exp < Date.now()) return null; // expired
    // Tokens issued before the Fleet Manager / Operations Lead split carry
    // the retired "admin" role — treat those as expired so the person signs in again.
    if (!(ROLES as readonly string[]).includes(data.role)) return null;
    return { name: data.name, role: data.role };
  } catch {
    return null;
  }
}

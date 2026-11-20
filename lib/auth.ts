import { createHmac, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { NextRequest } from "next/server";
import { sql } from "@/lib/db";

const COOKIE = "galini_session";
const secret = () => {
  const value = process.env.GALINI_AUTH_SECRET;
  if (!value) throw new Error("GALINI_AUTH_SECRET is not configured.");
  return value;
};
export function hashPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, 64).toString("hex");
  return `scrypt:${salt}:${hash}`;
}
export function verifyPassword(password: string, stored: string) {
  const [kind, salt, expected] = stored.split(":");
  if (kind !== "scrypt" || !salt || !expected) return false;
  const actual = scryptSync(password, salt, 64);
  const expectedBuffer = Buffer.from(expected, "hex");
  return actual.length === expectedBuffer.length && timingSafeEqual(actual, expectedBuffer);
}
export function makeSession(userId: string) {
  const payload = Buffer.from(JSON.stringify({ sub: userId, exp: Date.now() + 1000 * 60 * 60 * 24 * 7 })).toString("base64url");
  const signature = createHmac("sha256", secret()).update(payload).digest("base64url");
  return `${payload}.${signature}`;
}
export function sessionCookieOptions() {
  return { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax" as const, path: "/", maxAge: 60 * 60 * 24 * 7 };
}
export async function actorFor(request: NextRequest) {
  const token = request.cookies.get(COOKIE)?.value;
  if (!token) return null;
  const [payload, signature] = token.split(".");
  if (!payload || !signature) return null;
  const expected = createHmac("sha256", secret()).update(payload).digest();
  let received: Buffer;
  try { received = Buffer.from(signature, "base64url"); } catch { return null; }
  if (received.length !== expected.length || !timingSafeEqual(received, expected)) return null;
  let claims: { sub?: string; exp?: number };
  try { claims = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")); } catch { return null; }
  if (!claims.sub || !claims.exp || claims.exp < Date.now()) return null;
  const rows = await sql\`SELECT p.id, p.email, p.full_name, p.role, p.status, p.agent_code, p.agency_id, g.status AS agency_status FROM profiles p LEFT JOIN agencies g ON g.id=p.agency_id WHERE p.id = \${claims.sub} LIMIT 1\`;
  const actor = rows[0] || null;
  // Suspended members and suspended agency accounts are blocked on every protected API route.
  if (actor?.status === "suspended" || actor?.agency_status === "suspended") return null;
  if (actor) delete actor.agency_status;
  return actor;
}
export { COOKIE };

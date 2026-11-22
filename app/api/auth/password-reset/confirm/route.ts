import { NextRequest, NextResponse } from "next/server";
import { createHash } from "node:crypto";
import { sql } from "@/lib/db";
import { hashPassword } from "@/lib/auth";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const token = String(body?.token || "");
  const password = String(body?.password || "");
  if (!/^[a-f0-9]{64}$/i.test(token)) return NextResponse.json({ error: "This reset link is invalid or has expired. Request a new one." }, { status: 400 });
  if (password.length < 10 || password.length > 128) return NextResponse.json({ error: "Use a password between 10 and 128 characters." }, { status: 400 });

  try {
    const tokenHash = createHash("sha256").update(token).digest("hex");
    const nextHash = hashPassword(password);
    const rows = await sql`WITH consumed AS (
      UPDATE password_reset_tokens
      SET used_at = now()
      WHERE token_hash = ${tokenHash} AND used_at IS NULL AND expires_at > now()
      RETURNING user_id
    )
    UPDATE profiles AS p
    SET password_hash = ${nextHash}, updated_at = now()
    FROM consumed
    WHERE p.id = consumed.user_id
    RETURNING p.id`;
    if (!rows.length) return NextResponse.json({ error: "This reset link is invalid or has expired. Request a new one." }, { status: 400 });
    await sql`UPDATE password_reset_tokens SET used_at = now() WHERE user_id = ${rows[0].id} AND used_at IS NULL`;
    return NextResponse.json({ ok: true, message: "Your password has been reset. You can now sign in with your new password." });
  } catch {
    return NextResponse.json({ error: "Could not reset the password. Please request a new link and try again." }, { status: 503 });
  }
}

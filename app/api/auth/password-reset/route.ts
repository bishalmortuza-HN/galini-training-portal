import { NextRequest, NextResponse } from "next/server";
import { createHash, randomBytes } from "node:crypto";
import { sql } from "@/lib/db";

export const runtime = "nodejs";
const genericMessage = "If an account matches that email, a password-reset link will be sent shortly.";

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]!));
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const email = String(body?.email || "").trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ error: "Enter a valid email address." }, { status: 400 });
  }

  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM_EMAIL;
  const appUrl = process.env.GALINI_APP_URL;
  if (!apiKey || !from || !appUrl) {
    return NextResponse.json({ error: "Password reset email is not configured yet. Please contact the Galini administrator." }, { status: 503 });
  }

  try {
    const users = await sql`SELECT id, email, full_name FROM profiles WHERE lower(email) = ${email} LIMIT 1`;
    if (!users.length) return NextResponse.json({ ok: true, message: genericMessage });

    const user = users[0];
    const recent = await sql`SELECT id FROM password_reset_tokens WHERE user_id = ${user.id} AND created_at > now() - interval '60 seconds' ORDER BY created_at DESC LIMIT 1`;
    if (recent.length) return NextResponse.json({ ok: true, message: genericMessage });

    const token = randomBytes(32).toString("hex");
    const tokenHash = createHash("sha256").update(token).digest("hex");
    await sql`UPDATE password_reset_tokens SET used_at = now() WHERE user_id = ${user.id} AND used_at IS NULL`;
    const inserted = await sql`INSERT INTO password_reset_tokens (user_id, token_hash, expires_at) VALUES (${user.id}, ${tokenHash}, now() + interval '30 minutes') RETURNING id`;
    const resetUrl = appUrl.replace(/\/+$/, "") + "/reset-password?token=" + token;
    const safeName = escapeHtml(String(user.full_name || "there"));
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: "Bearer " + apiKey, "Content-Type": "application/json" },
      body: JSON.stringify({
        from,
        to: [user.email],
        subject: "Reset your Galini Training Portal password",
        html: `<div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;color:#18392c"><h2>Reset your Galini password</h2><p>Hello ${safeName},</p><p>We received a request to reset your Galini Training Portal password. This link expires in 30 minutes and can only be used once.</p><p><a href="${resetUrl}" style="display:inline-block;background:#214f3c;color:#fff;padding:12px 20px;border-radius:8px;text-decoration:none">Reset password</a></p><p>If you did not request this, you can ignore this email. Your current password will remain unchanged.</p></div>`,
      }),
    });
    if (!response.ok) {
      await sql`UPDATE password_reset_tokens SET used_at = now() WHERE id = ${inserted[0].id}`;
      return NextResponse.json({ error: "The reset email could not be delivered. Please try again later or contact the administrator." }, { status: 502 });
    }
    return NextResponse.json({ ok: true, message: genericMessage });
  } catch {
    return NextResponse.json({ error: "Password reset is temporarily unavailable. Please try again later." }, { status: 503 });
  }
}

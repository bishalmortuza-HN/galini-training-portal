import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "node:crypto";
import { sql } from "@/lib/db";
import { actorFor, COOKIE, hashPassword, makeSession, sessionCookieOptions, verifyPassword } from "@/lib/auth";

export async function GET(request: NextRequest) {
  try {
    const actor = await actorFor(request);
    return NextResponse.json({ user: actor || null });
  } catch { return NextResponse.json({ error: "Authentication service is unavailable." }, { status: 503 }); }
}
export async function DELETE() {
  const response = NextResponse.json({ ok: true });
  response.cookies.set(COOKIE, "", { ...sessionCookieOptions(), maxAge: 0 });
  return response;
}
export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  if (!body || !["login","register"].includes(body.action)) return NextResponse.json({ error: "Invalid authentication request." }, { status: 400 });
  const email = String(body.email || "").trim().toLowerCase();
  const password = String(body.password || "");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || password.length < 10) return NextResponse.json({ error: "Enter a valid email and a password with at least 10 characters." }, { status: 400 });
  try {
    let user: any;
    if (body.action === "login") {
      const rows = await sql`SELECT id, email, full_name, role, status, agent_code, agency_id, password_hash FROM profiles WHERE email = ${email} LIMIT 1`;
      user = rows[0];
      if (!user || !verifyPassword(password, user.password_hash)) return NextResponse.json({ error: "Email or password is incorrect." }, { status: 401 });
      if (user.status === "suspended") return NextResponse.json({ error: "Your Galini account is on hold. Please contact the site administrator for assistance." }, { status: 403 });
    } else {
      const fullName = String(body.fullName || "").trim();
      if (!fullName) return NextResponse.json({ error: "Your full name is required." }, { status: 400 });
      const existing = await sql`SELECT id FROM profiles WHERE email = ${email} LIMIT 1`;
      if (existing.length) return NextResponse.json({ error: "An account with this email already exists." }, { status: 409 });
      const adminEmail = (process.env.GALINI_PLATFORM_ADMIN_EMAIL || "").trim().toLowerCase();
      const admins = await sql`SELECT id FROM profiles WHERE role = 'platform_admin' LIMIT 1`;
      const isBootstrapAdmin = Boolean(adminEmail && email === adminEmail && admins.length === 0);
      let role = isBootstrapAdmin ? "platform_admin" : (body.accountType === "agency" ? "agency_admin" : "agent");
      let agencyId: string | null = null;
      let agencyStatus = "pending";
      if (role === "agency_admin") {
        const agencyName = String(body.agencyName || "").trim();
        if (!agencyName) return NextResponse.json({ error: "Agency name is required." }, { status: 400 });
        const code = randomBytes(4).toString("hex").toUpperCase();
        const created = await sql`INSERT INTO agencies (agency_name, agency_code, status) VALUES (${agencyName}, ${code}, 'active') RETURNING id, status, agency_code`;
        agencyId = created[0].id; agencyStatus = created[0].status;
      } else if (!isBootstrapAdmin) {
        const code = String(body.agencyCode || "").trim().toUpperCase();
        if (!code) return NextResponse.json({ error: "Enter the agency invitation code supplied by your agency administrator." }, { status: 400 });
        const agencies = await sql`SELECT id, status FROM agencies WHERE upper(agency_code) = ${code} AND status='active' LIMIT 1`;
        if (!agencies.length) return NextResponse.json({ error: "Active agency invitation code not found. Ask your agency administrator to confirm the code." }, { status: 404 });
        agencyId = agencies[0].id; agencyStatus = agencies[0].status;
      }
      const status = "active";
      const inserted = await sql`INSERT INTO profiles (email, full_name, password_hash, role, status, agency_id) VALUES (${email}, ${fullName}, ${hashPassword(password)}, ${role}, ${status}, ${agencyId}) RETURNING id, email, full_name, role, status, agent_code, agency_id`;
      user = inserted[0];
      // Self-service onboarding: active agency invitations authorize agent signup.
      // New agency workspaces are activated immediately; platform-admin bootstrap remains email-restricted.
      if (role === "agent" || role === "agency_admin") {
        await sql`INSERT INTO training_enrollments (course_id,user_id,agency_id,assigned_by)
          SELECT id,${user.id},${agencyId},NULL FROM training_courses WHERE is_published=true
          ON CONFLICT (course_id,user_id) DO NOTHING`;
      }
    }
    const agency = user.agency_id ? (await sql`SELECT agency_name, agency_code, status FROM agencies WHERE id = ${user.agency_id} LIMIT 1`)[0] || null : null;
    const response = NextResponse.json({ user, agency, message: user.status === "active" ? "Your account is ready. Published academy courses have been added to your learning dashboard." : "Registration received." });
    response.cookies.set(COOKIE, makeSession(user.id), sessionCookieOptions());
    return response;
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || "Could not complete authentication." }, { status: 503 });
  }
}

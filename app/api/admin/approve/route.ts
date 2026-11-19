import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { actorFor } from "@/lib/auth";

export async function POST(request: NextRequest) {
  const actor = await actorFor(request);
  if (!actor) return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  if (actor.role !== "platform_admin" || !["active","approved"].includes(actor.status)) return NextResponse.json({ error: "Only an active platform administrator can approve accounts." }, { status: 403 });
  const body = await request.json().catch(() => null);
  if (!body?.id || !["agency","profile","payment"].includes(body.kind)) return NextResponse.json({ error: "Invalid approval request." }, { status: 400 });
  try {
    if (body.kind === "agency") {
      const rows = await sql`UPDATE agencies SET status='active', membership_status='active' WHERE id=${body.id} RETURNING id`;
      if (!rows.length) return NextResponse.json({ error: "Agency not found." }, { status: 404 });
      return NextResponse.json({ ok: true, id: rows[0].id });
    }
    if (body.kind === "profile") {
      const rows = await sql`UPDATE profiles SET status='active', updated_at=now() WHERE id=${body.id} RETURNING id, agency_id`;
      if (!rows.length) return NextResponse.json({ error: "Member not found." }, { status: 404 });
      if (rows[0].agency_id) await sql`UPDATE agency_memberships SET status='active' WHERE user_id=${body.id}`;
      return NextResponse.json({ ok: true, id: rows[0].id });
    }
    const status = body.status === "verified" ? "verified" : "rejected";
    const rows = await sql`UPDATE payment_transactions SET status=${status}, admin_note=${String(body.note || "").slice(0,1000)}, reviewed_at=now(), reviewed_by=${actor.id} WHERE id=${body.id} RETURNING id`;
    if (!rows.length) return NextResponse.json({ error: "Payment not found." }, { status: 404 });
    return NextResponse.json({ ok: true, id: rows[0].id, status });
  } catch (error: any) { return NextResponse.json({ error: error?.message || "Approval failed." }, { status: 503 }); }
}

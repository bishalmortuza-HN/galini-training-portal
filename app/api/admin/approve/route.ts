import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { actorFor } from "@/lib/auth";

export async function POST(request: NextRequest) {
  const actor = await actorFor(request);
  if (!actor) return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  if (actor.role !== "platform_admin" || !["active","approved"].includes(actor.status)) return NextResponse.json({ error: "Only an active platform administrator can approve accounts." }, { status: 403 });
  const body = await request.json().catch(() => null);
  if (!body?.id || !["agency","profile","profile_status","payment"].includes(body.kind)) return NextResponse.json({ error: "Invalid approval request." }, { status: 400 });
  try {
    if (body.kind === "agency") {
      const rows = await sql`UPDATE agencies SET status='active', updated_at=now() WHERE id=${body.id} RETURNING id`;
      if (!rows.length) return NextResponse.json({ error: "Agency not found." }, { status: 404 });
      return NextResponse.json({ ok: true, id: rows[0].id });
    }
    if (body.kind === "profile") {
      const rows = await sql`UPDATE profiles SET status='active', updated_at=now() WHERE id=${body.id} RETURNING id, agency_id`;
      if (!rows.length) return NextResponse.json({ error: "Member not found." }, { status: 404 });
      return NextResponse.json({ ok: true, id: rows[0].id, status: "active" });
    }
    if (body.kind === "profile_status") {
      const nextStatus = body.status === "suspended" ? "suspended" : body.status === "active" ? "active" : null;
      if (!nextStatus) return NextResponse.json({ error: "Choose hold or restore access." }, { status: 400 });
      const rows = await sql`UPDATE profiles SET status=${nextStatus}, updated_at=now() WHERE id=${body.id} AND role <> 'platform_admin' RETURNING id, status`;
      if (!rows.length) return NextResponse.json({ error: "Member not found or administrator accounts cannot be placed on hold here." }, { status: 404 });
      return NextResponse.json({ ok: true, id: rows[0].id, status: rows[0].status });
    }
    const status = body.status === "verified" ? "verified" : "rejected";
    const rows = await sql`UPDATE payment_transactions SET status=${status}, admin_note=${String(body.note || "").slice(0,1000)}, reviewed_at=now(), reviewed_by=${actor.id} WHERE id=${body.id} RETURNING id, user_id`;
    if (!rows.length) return NextResponse.json({ error: "Payment not found." }, { status: 404 });
    let accountHeld = false;
    if (status === "rejected" && body.hold_account === true) {
      if (!rows[0].user_id) return NextResponse.json({ error: "This payment is not linked to a user account, so no account was placed on hold." }, { status: 400 });
      const held = await sql`UPDATE profiles SET status='suspended', updated_at=now() WHERE id=${rows[0].user_id} AND role <> 'platform_admin' RETURNING id`;
      accountHeld = held.length > 0;
    }
    return NextResponse.json({ ok: true, id: rows[0].id, status, accountHeld });
  } catch (error: any) { return NextResponse.json({ error: error?.message || "Approval failed." }, { status: 503 }); }
}

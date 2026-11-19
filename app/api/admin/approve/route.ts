import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export async function POST(request: NextRequest) {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.NEXT_PUBLIC_galiniSUPABASE_URL;
  const anon = process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_galiniSUPABASE_ANON_KEY;
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY;
  if (!url || !anon || !service) return NextResponse.json({ error: "Server-side Supabase configuration is incomplete. Ask the site owner to verify the Galini environment variables." }, { status: 503 });
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) return NextResponse.json({ error: "Sign in required." }, { status: 401 });

  const authClient = createClient(url, anon, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: authData, error: authError } = await authClient.auth.getUser(token);
  if (authError || !authData.user) return NextResponse.json({ error: "Your session is invalid. Please sign in again." }, { status: 401 });

  const admin = createClient(url, service, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: actor, error: actorError } = await admin.from("profiles").select("role,status").eq("id", authData.user.id).maybeSingle();
  if (actorError || actor?.role !== "platform_admin" || !["active", "approved"].includes(actor.status || "")) {
    return NextResponse.json({ error: "Only an active platform administrator can approve accounts." }, { status: 403 });
  }

  const body = await request.json().catch(() => null) as { kind?: string; id?: string } | null;
  if (!body?.id || !["agency", "profile"].includes(body.kind || "")) return NextResponse.json({ error: "Invalid approval request." }, { status: 400 });

  const table = body.kind === "agency" ? "agencies" : "profiles";
  const update = body.kind === "agency" ? { status: "active", membership_status: "active" } : { status: "active" };
  let query = admin.from(table).update(update).eq("id", body.id);
  const { data, error } = await query.select("id").maybeSingle();
  if (error) return NextResponse.json({ error: "Approval could not be saved: " + error.message }, { status: 400 });
  if (!data) return NextResponse.json({ error: "The requested record was not found or could not be updated." }, { status: 404 });
  return NextResponse.json({ ok: true, id: data.id });
}
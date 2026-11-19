import { NextResponse } from "next/server";
import { sql } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const rows = await sql`SELECT now() AS database_time`;
    return NextResponse.json({ ok: true, database: "connected", checked_at: rows[0]?.database_time ?? null });
  } catch {
    return NextResponse.json({ ok: false, database: "unavailable" }, { status: 503 });
  }
}

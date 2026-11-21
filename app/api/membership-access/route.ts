import { NextRequest, NextResponse } from "next/server";
import { actorFor } from "@/lib/auth";
import { hasPaidAccess } from "@/lib/membership-access";

export async function GET(request: NextRequest) {
  const actor = await actorFor(request);
  if (!actor) return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  try {
    const paidAccess = await hasPaidAccess(actor);
    return NextResponse.json({
      paidAccess,
      accessStatus: paidAccess ? "verified" : "payment_required",
      message: paidAccess
        ? "Membership payment verified. Training and Quote Practice are available."
        : "Your dashboard and payment status remain available. Training and Quote Practice unlock after payment verification.",
    });
  } catch {
    return NextResponse.json({ error: "Could not check membership access." }, { status: 503 });
  }
}

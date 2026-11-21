import { sql } from "@/lib/db";

type MembershipActor = {
  id: string;
  role: string;
  agency_id: string | null;
};

/**
 * Paid access is granted only by a verified payment record.
 * Agency-wide payments (user_id IS NULL) unlock the agency and its agents.
 * A verified agent-specific payment unlocks only that agent.
 * Platform administrators retain operational access.
 */
export async function hasPaidAccess(actor: MembershipActor): Promise<boolean> {
  if (actor.role === "platform_admin") return true;
  if (!actor.agency_id) return false;

  const rows = actor.role === "agency_admin"
    ? await sql`SELECT id FROM payment_transactions
        WHERE agency_id = ${actor.agency_id}
          AND user_id IS NULL
          AND status = 'verified'
        LIMIT 1`
    : await sql`SELECT id FROM payment_transactions
        WHERE agency_id = ${actor.agency_id}
          AND status = 'verified'
          AND (user_id IS NULL OR user_id = ${actor.id})
        LIMIT 1`;

  return rows.length > 0;
}

export function paymentRequiredResponse() {
  return {
    error: "Training and quote practice are locked until your agency or individual membership payment is verified.",
    code: "PAYMENT_VERIFICATION_REQUIRED",
  };
}

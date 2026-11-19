# Galini Training Portal

A single role-aware workspace for platform administrators, agency administrators, and training agents.

## Stack
- Next.js 15 / React 19
- Existing Galini Supabase Auth and database
- Server-side privileged approval endpoint (service-role key stays server-only)

## Required Vercel environment
Set these on the `galini-training` project:
- `NEXT_PUBLIC_SUPABASE_URL` (or the existing Galini Supabase URL variable)
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` (or the existing Galini anon key variable)
- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY` (server only; never prefix with NEXT_PUBLIC)

The app supports existing `NEXT_PUBLIC_galiniSUPABASE_URL` and `NEXT_PUBLIC_galiniSUPABASE_ANON_KEY` variable names as fallbacks. The privileged approval API requires a server-side service role key.

## Expected existing data
- `profiles`: id, full_name, email, role, agent_code, agency_id, status
- `agencies`: id, agency_name, agency_code, status, membership_status, plan
- `training_results`: id, user_id, course_name, score, status, created_at

Roles: `platform_admin`, `agency_admin`, and agent (other role values).

## Important
- The development branch is `galini-unified-portal`; production `main` is not modified.
- Payment review is intentionally shown as not connected until the actual payment table and provider workflow are verified.
- The approval API verifies the signed-in user and platform-admin role on the server before using the service-role key.
- Verify actual Supabase table/column names and RLS policies before enabling production approvals.

# Galini Training Portal

A single role-aware workspace for platform administrators, agency administrators, and training agents.

## Stack
- Next.js 15 / React 19
- Neon PostgreSQL via `@neondatabase/serverless`
- Self-managed Galini authentication is the target architecture; Supabase is not part of the intended deployment.

## Preview environment
The development branch is `galini-unified-portal`. The Neon integration provisions `DATABASE_URL` and `DATABASE_URL_UNPOOLED` for this preview branch. The initial platform administrator address is configured through the preview-only `GALINI_PLATFORM_ADMIN_EMAIL` environment variable.

## Database setup
The initial PostgreSQL schema is in `neon/migrations/001_initial_schema.sql`. It creates agencies, users, memberships, verification/reset token tables, training courses and enrollments, training results, and payment review records.

The migration must be applied to the Neon database before the application can use these tables. Do not apply it to production until the Galini preview has been fully tested and explicitly approved.

## Important
- Work only on `galini-unified-portal` until the user approves production.
- Do not modify V1 or the production `main` branch.
- Payment records default to `pending`; no payment is considered verified until an administrator reviews it.
- Email verification and password reset require a configured SMTP provider before they can be treated as active.
- The current portal UI/API still contains legacy Supabase calls and must be migrated to Neon before end-to-end testing. The Neon client and schema are foundation work, not a completed authentication migration.

# Galini Training Portal

A unified role-based training and agency workspace for platform administrators, agency administrators, and insurance agents.

## Stack
- Next.js 15 / React 19
- Neon PostgreSQL via `@neondatabase/serverless`
- Galini-managed authentication using scrypt password hashes and signed HttpOnly session cookies
- Vercel preview deployment from the `galini-unified-portal` branch

## Portal modules
- **Site administration:** agency and agent approvals, membership oversight, payment review, and training progress.
- **Training academy:** six published commercial-insurance courses, 24 lessons, six assessments, lesson completion tracking, and course certificates.
- **Payment status:** Standard ($10) and Premium ($50) membership records, transaction-reference submission, and manual admin verification/rejection.
- **Quote practice:** guided five-stage applicant intake, exposure collection, coverage selection, underwriting notes, and quote/bind checklist. This is a training simulator only; it does not send live carrier submissions or bind coverage.

## Initial administrator
The preview-only `GALINI_PLATFORM_ADMIN_EMAIL` environment variable is the allow-listed first-admin email. The first account registered with that exact email can select **Platform administrator** during registration. Only that address receives the initial administrator role. The configured email can be changed later in Vercel preview environment settings.

## Agency onboarding
1. Register as an agency administrator and enter the agency name.
2. The platform administrator approves the agency and its administrator account.
3. The agency administrator shares the generated agency invitation code with agents.
4. Agents register using that code and wait for approval.
5. Agency administrators assign published courses and monitor progress.

## Database
The Neon preview schema is applied. It includes agencies, profiles, memberships, auth tokens, courses, enrollments, lessons, lesson completions, assessments, assessment attempts, certificates, payment transactions, and quote-practice submissions/steps. Six courses, 24 lessons, and six assessments are seeded and published.

The read-only health endpoints are:
- `/api/health/db` — Neon connection status
- `/api/health/academy` — published course, lesson, and assessment counts

## External services not yet connected
- **Payoneer:** payment references and review statuses are stored, but there is no live Payoneer checkout or automatic payment verification.
- **SMTP/email:** account verification and password-reset token tables exist, but email delivery is not active until SMTP credentials are configured. Do not describe email verification or password reset as operational yet.

## Deployment safety
- Work only on `galini-unified-portal` until the user explicitly approves production.
- Do not modify V1 or the production `main` branch.
- The preview uses the existing Galini Vercel project and Neon integration; do not create a separate admin portal.

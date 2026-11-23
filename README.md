# Galini Training Portal

A role-based training and agency workspace for platform administrators, agency administrators, and insurance agents.

## Stack
- Next.js 15.5.29 / React 19
- Neon PostgreSQL via `@neondatabase/serverless`
- Galini-managed authentication using scrypt password hashes and signed HttpOnly session cookies
- Vercel Preview deployment from `galini-unified-portal`

## Portal modules
- **Site administration:** agency and member oversight, membership payment review, training progress, and assessment reporting.
- **Training academy:** 14 published commercial-insurance courses, 60 lessons, 60 section assessments, lesson completion tracking, and course certificates.
- **Membership:** Standard Pack ($15/month or $100/year) and Platinum ($55/month or $600/year).
- **Quote Practice:** guided applicant intake, exposure collection, coverage selection, training-only rating indications, underwriting notes, and proposal/bind checklists.
- **Health checks:** `/api/health/db` and `/api/health/academy`.

Quote Practice is an educational simulator. It does not send submissions to carriers, return carrier quotes, or bind insurance coverage.

## Accounts and access
- The initial platform administrator is restricted to the email configured in the Preview-only `GALINI_PLATFORM_ADMIN_EMAIL` variable during first-admin bootstrap. A platform administrator already exists in the Preview database.
- Agency administrators register with an agency name. The portal creates the agency and invitation code.
- Agents register with an active agency invitation code.
- Training and Quote Practice remain locked until the relevant membership payment is verified by a platform administrator.
- The platform administrator can review payment records and manage agency/member access.

## Payments
Payments currently use manual transaction-reference submission (bank transfer / Payoneer) followed by administrator verification. There is no live checkout, payment gateway callback, or automatic payment verification. Do not describe payment as automatically processed.

## Password recovery and email
The password-reset flow uses a random one-time token, stores only its SHA-256 hash, expires after 30 minutes, and invalidates existing sessions when the password is changed.

To enable email delivery, add these **Preview-only** Vercel environment variables for the `galini-unified-portal` branch:
- `RESEND_API_KEY` — Resend API key (secret)
- `RESEND_FROM_EMAIL` — sender address on a verified Resend domain
- `GALINI_APP_URL` — `https://galini-training-git-galini-unified-portal-team-desh.vercel.app`

Password reset email delivery is not operational until those values are configured and the Preview deployment is rebuilt. Email verification is not currently required or implemented.

## Optional AI tutor
An API route is present for the Insurance Learning Tutor, but the current training interface does not expose a tutor panel. It also requires a valid Preview `OPENAI_API_KEY`; that variable is currently blank. Do not advertise the AI tutor as available until it is configured and tested.

## Database and deployment safety
- The Preview Neon schema contains agencies, profiles, membership/payment records, training courses, lessons, enrollments, lesson completions, assessments, assessment attempts, certificates, and quote-practice submissions/steps.
- Work only on `galini-unified-portal` and the Preview Neon branch `preview/galini-unified-portal` until the user explicitly approves Production.
- Do not modify the Production `main` branch, Production database, or Production deployment without explicit approval.

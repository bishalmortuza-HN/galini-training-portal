# Galini Stripe membership payments

## Preview setup

The application uses Stripe-hosted Checkout in subscription mode. It offers:
- Card payments.
- US bank account ACH Direct Debit.
- Standard: $15/month or $100/year.
- Platinum: $55/month or $600/year.

The app does not store card numbers or bank account numbers. Stripe Checkout collects and tokenizes payment details.

## Vercel Preview environment variables

Set these on the `galini-unified-portal` Preview branch only while testing:
- `STRIPE_SECRET_KEY`: Stripe test-mode secret key (`sk_test_...`).
- `STRIPE_WEBHOOK_SECRET`: signing secret for the Preview webhook endpoint (`whsec_...`).
- `GALINI_APP_URL`: already configured for the Preview branch; it is used for Checkout return URLs.

Do not add test keys to Production. Use Vercel's encrypted/sensitive variable type. Do not paste secret values into source code, GitHub, or chat.

## Stripe webhook endpoint

Create a webhook endpoint in Stripe test mode pointing to:

`https://galini-training-git-galini-unified-portal-team-desh.vercel.app/api/stripe/webhook`

Subscribe to:
- `checkout.session.completed`
- `checkout.session.async_payment_succeeded`
- `checkout.session.async_payment_failed`
- `checkout.session.expired`
- `invoice.paid`
- `invoice.payment_failed`
- `customer.subscription.deleted`

Copy the endpoint signing secret into `STRIPE_WEBHOOK_SECRET` for the Preview branch.

## Activation rules

- Card payment: access is enabled only after Stripe confirms payment through a signed webhook.
- ACH: checkout may complete before the bank debit settles. Access stays locked until Stripe sends the asynchronous success event or a paid invoice event.
- Failed recurring invoice or cancelled subscription: the linked membership is suspended until payment is restored.
- The app records Stripe session, customer, subscription, invoice and payment-intent identifiers for reconciliation.

## Before Production

1. Complete test-mode card and ACH flows with Stripe test credentials.
2. Verify webhook delivery, duplicate-event idempotency, membership unlock/lock, payment history, refunds and cancellation.
3. Configure Production Stripe live-mode keys and a separate Production webhook endpoint/signing secret.
4. Confirm Stripe has enabled ACH Direct Debit on the US merchant account and that the connected US bank account is verified.
5. Review membership terms, recurring billing disclosure, cancellation/refund policy, privacy policy and support contact details before selling accounts.

The production database and production deployment must remain separate from Preview until the owner explicitly authorizes launch.

-- Stripe Checkout: card and US ACH subscription records.
ALTER TABLE payment_transactions
  ADD COLUMN IF NOT EXISTS plan_code text,
  ADD COLUMN IF NOT EXISTS stripe_checkout_session_id text,
  ADD COLUMN IF NOT EXISTS stripe_customer_id text,
  ADD COLUMN IF NOT EXISTS stripe_subscription_id text,
  ADD COLUMN IF NOT EXISTS stripe_invoice_id text,
  ADD COLUMN IF NOT EXISTS stripe_payment_intent_id text;

CREATE UNIQUE INDEX IF NOT EXISTS payment_transactions_stripe_session_uidx
  ON payment_transactions(stripe_checkout_session_id)
  WHERE stripe_checkout_session_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS payment_transactions_stripe_invoice_uidx
  ON payment_transactions(stripe_invoice_id)
  WHERE stripe_invoice_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS payment_transactions_stripe_subscription_idx
  ON payment_transactions(stripe_subscription_id)
  WHERE stripe_subscription_id IS NOT NULL;

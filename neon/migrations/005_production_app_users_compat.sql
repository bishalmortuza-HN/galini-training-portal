-- Galini production compatibility bridge.
-- Preserves legacy app_users and existing agency data while preparing the schema
-- for the current profiles-based portal and migrations 001-004.
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL,
  full_name text NOT NULL,
  password_hash text NOT NULL,
  role text NOT NULL DEFAULT 'agent' CHECK (role IN ('platform_admin','agency_admin','agent')),
  status text NOT NULL DEFAULT 'pending',
  agent_code text UNIQUE,
  agency_id uuid REFERENCES agencies(id) ON DELETE SET NULL,
  email_verified_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS profiles_email_lower_unique ON profiles (lower(email));
CREATE INDEX IF NOT EXISTS users_agency_id_idx ON profiles(agency_id);
CREATE INDEX IF NOT EXISTS users_role_status_idx ON profiles(role,status);

ALTER TABLE agencies ADD COLUMN IF NOT EXISTS membership_status text NOT NULL DEFAULT 'pending';
ALTER TABLE agencies ADD COLUMN IF NOT EXISTS plan text;

-- Keep account IDs and password hashes identical; never delete or rewrite app_users.
INSERT INTO profiles (id,email,full_name,password_hash,role,status,agent_code,agency_id,email_verified_at,created_at,updated_at)
SELECT u.id,lower(u.email),u.full_name,u.password_hash,
       CASE WHEN u.is_platform_admin THEN 'platform_admin'
            WHEN m.role='agency_admin' THEN 'agency_admin'
            ELSE 'agent' END,
       CASE WHEN u.is_platform_admin THEN 'active'
            WHEN m.status IN ('active','approved') THEN 'active'
            WHEN m.status='suspended' THEN 'suspended'
            ELSE 'pending' END,
       m.agent_code,m.agency_id,u.email_verified_at,u.created_at,u.updated_at
FROM app_users u
LEFT JOIN LATERAL (
  SELECT am.role,am.status,am.agency_id,am.agent_code
  FROM agency_memberships am
  WHERE am.user_id=u.id
  ORDER BY CASE WHEN am.status IN ('active','approved') THEN 0 ELSE 1 END, am.created_at DESC
  LIMIT 1
) m ON true
ON CONFLICT (id) DO NOTHING;

-- Keep the legacy membership columns and add the portal's membership_role field.
ALTER TABLE agency_memberships ADD COLUMN IF NOT EXISTS membership_role text NOT NULL DEFAULT 'agent';
UPDATE agency_memberships SET membership_role=role WHERE membership_role='agent' AND role IN ('agency_admin','agent');

-- Point portal-facing foreign keys at profiles. Legacy app_users remains intact.
ALTER TABLE agency_memberships DROP CONSTRAINT IF EXISTS agency_memberships_user_id_fkey;
ALTER TABLE agency_memberships ADD CONSTRAINT agency_memberships_user_id_profiles_fkey
  FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE;
ALTER TABLE agencies DROP CONSTRAINT IF EXISTS agencies_created_by_fkey;
ALTER TABLE agencies ADD CONSTRAINT agencies_created_by_profiles_fkey
  FOREIGN KEY (created_by) REFERENCES profiles(id);
ALTER TABLE agency_invites DROP CONSTRAINT IF EXISTS agency_invites_invited_by_fkey;
ALTER TABLE agency_invites ADD CONSTRAINT agency_invites_invited_by_profiles_fkey
  FOREIGN KEY (invited_by) REFERENCES profiles(id);
ALTER TABLE email_verification_tokens DROP CONSTRAINT IF EXISTS email_verification_tokens_user_id_fkey;
ALTER TABLE email_verification_tokens ADD CONSTRAINT email_verification_tokens_user_id_profiles_fkey
  FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE;
ALTER TABLE password_reset_tokens DROP CONSTRAINT IF EXISTS password_reset_tokens_user_id_fkey;
ALTER TABLE password_reset_tokens ADD CONSTRAINT password_reset_tokens_user_id_profiles_fkey
  FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE;

-- Retain the existing training_results records and add fields required by the Academy API.
ALTER TABLE training_results ADD COLUMN IF NOT EXISTS course_name text;
ALTER TABLE training_results ADD COLUMN IF NOT EXISTS status text;
ALTER TABLE training_results ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE training_results ALTER COLUMN agency_id DROP NOT NULL;
ALTER TABLE training_results ALTER COLUMN module_key DROP NOT NULL;
ALTER TABLE training_results DROP CONSTRAINT IF EXISTS training_results_user_id_fkey;
ALTER TABLE training_results ADD CONSTRAINT training_results_user_id_profiles_fkey
  FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE;

-- The existing Galini migration ledger uses the `version` column.
INSERT INTO galini_schema_migrations(version)
VALUES ('005_production_app_users_compat')
ON CONFLICT (version) DO NOTHING;

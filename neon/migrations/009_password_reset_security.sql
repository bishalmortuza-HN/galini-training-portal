-- Preview-only security hardening for Galini password resets.
-- Invalidates all previously issued stateless sessions after a password change.
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS auth_version integer NOT NULL DEFAULT 0;

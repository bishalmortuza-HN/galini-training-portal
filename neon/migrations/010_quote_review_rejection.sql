-- Quote workflow: add a distinct rejected state for administrator decisions.
ALTER TABLE quote_practice_submissions
  DROP CONSTRAINT IF EXISTS quote_practice_submissions_status_check;

ALTER TABLE quote_practice_submissions
  ADD CONSTRAINT quote_practice_submissions_status_check
  CHECK (status IN ('draft','submitted','needs_revision','reviewed','rejected','completed'));

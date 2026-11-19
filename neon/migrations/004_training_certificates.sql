-- Galini training certificate records.
-- Apply after 001, 002 and 003. The assessment API issues a certificate
-- only when the assigned course is fully completed and its assessment is passed.

CREATE TABLE IF NOT EXISTS training_certificates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  course_id uuid NOT NULL REFERENCES training_courses(id) ON DELETE CASCADE,
  certificate_code text NOT NULL UNIQUE,
  issued_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, course_id)
);

CREATE INDEX IF NOT EXISTS training_certificates_user_idx
  ON training_certificates(user_id, issued_at DESC);

CREATE INDEX IF NOT EXISTS training_certificates_course_idx
  ON training_certificates(course_id);

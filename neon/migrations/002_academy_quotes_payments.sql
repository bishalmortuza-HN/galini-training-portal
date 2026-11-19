-- Galini Academy, quote-practice, and payment-review expansion.
-- Apply only to the Galini preview Neon database after reviewing the migration.

CREATE TABLE IF NOT EXISTS training_lessons (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id uuid NOT NULL REFERENCES training_courses(id) ON DELETE CASCADE,
  title text NOT NULL,
  lesson_type text NOT NULL DEFAULT 'reading' CHECK (lesson_type IN ('reading','video','interactive','document','quiz')),
  content text,
  content_url text,
  sort_order integer NOT NULL DEFAULT 0,
  is_published boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS training_assessments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id uuid NOT NULL REFERENCES training_courses(id) ON DELETE CASCADE,
  title text NOT NULL,
  instructions text,
  passing_score integer NOT NULL DEFAULT 70 CHECK (passing_score BETWEEN 0 AND 100),
  questions jsonb NOT NULL DEFAULT '[]'::jsonb,
  is_published boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS training_assessment_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  assessment_id uuid NOT NULL REFERENCES training_assessments(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  answers jsonb NOT NULL DEFAULT '{}'::jsonb,
  score numeric,
  passed boolean NOT NULL DEFAULT false,
  submitted_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS payment_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id uuid REFERENCES agencies(id) ON DELETE SET NULL,
  user_id uuid REFERENCES profiles(id) ON DELETE SET NULL,
  plan text NOT NULL,
  amount_cents integer NOT NULL CHECK (amount_cents >= 0),
  currency text NOT NULL DEFAULT 'USD',
  payment_method text NOT NULL DEFAULT 'Payoneer',
  payment_reference text,
  proof_url text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','submitted','under_review','verified','rejected','refunded','failed')),
  admin_note text,
  submitted_at timestamptz NOT NULL DEFAULT now(),
  reviewed_at timestamptz,
  reviewed_by uuid REFERENCES profiles(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS quote_practice_submissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id uuid REFERENCES agencies(id) ON DELETE SET NULL,
  agent_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  customer_name text NOT NULL,
  line_of_business text NOT NULL,
  effective_date date,
  risk_data jsonb NOT NULL DEFAULT '{}'::jsonb,
  exercise_type text NOT NULL DEFAULT 'practice' CHECK (exercise_type IN ('practice','assessment')),
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','submitted','needs_revision','reviewed','completed')),
  reviewer_note text,
  reviewed_by uuid REFERENCES profiles(id) ON DELETE SET NULL,
  reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS quote_practice_steps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  submission_id uuid NOT NULL REFERENCES quote_practice_submissions(id) ON DELETE CASCADE,
  step_key text NOT NULL,
  step_title text NOT NULL,
  form_data jsonb NOT NULL DEFAULT '{}'::jsonb,
  is_complete boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (submission_id, step_key)
);

CREATE INDEX IF NOT EXISTS training_lessons_course_idx ON training_lessons(course_id, sort_order);
CREATE INDEX IF NOT EXISTS assessment_attempts_user_idx ON training_assessment_attempts(user_id);
CREATE INDEX IF NOT EXISTS payment_transactions_status_idx ON payment_transactions(status, submitted_at DESC);
CREATE INDEX IF NOT EXISTS quote_practice_agent_idx ON quote_practice_submissions(agent_id, created_at DESC);
CREATE INDEX IF NOT EXISTS quote_practice_agency_idx ON quote_practice_submissions(agency_id, created_at DESC);

-- Seed a practical insurance training catalogue. Course rows are drafts until a platform
-- administrator reviews and publishes them; no fake lesson completions are created.
INSERT INTO training_courses (title, description, category, level, duration_minutes, is_published)
SELECT v.title, v.description, v.category, v.level, v.duration_minutes, false
FROM (VALUES
 ('Commercial Lines Foundations','Learn the commercial insurance workflow from intake through submission, underwriting follow-up, quote review, and binding.','Commercial Lines','Beginner',60),
 ('ACORD Forms Workshop','Practice the purpose and completion of ACORD 125, 126, 140, and related commercial application sections.','ACORD Forms','Beginner',90),
 ('Commercial Property Quoting Practice','Work through building, business personal property, occupancy, construction, protection, and loss-history information.','Quoting Practice','Intermediate',75),
 ('General Liability Quoting Practice','Practice operations descriptions, classifications, payroll or sales exposures, limits, and supplemental questions.','Quoting Practice','Intermediate',75),
 ('Commercial Auto and Workers Compensation','Learn driver, vehicle, payroll, class-code, and underwriting information needed for submissions.','Commercial Lines','Intermediate',75),
 ('Quote Review and Binding Workflow','Compare premiums, deductibles, payment terms, subjectivities, bind requests, binders, and policy documents.','Binding','Intermediate',60)
) AS v(title, description, category, level, duration_minutes)
WHERE NOT EXISTS (SELECT 1 FROM training_courses c WHERE c.title = v.title);


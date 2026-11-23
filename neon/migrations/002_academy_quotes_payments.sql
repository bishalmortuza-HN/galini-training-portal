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



CREATE TABLE IF NOT EXISTS training_lesson_completions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lesson_id uuid NOT NULL REFERENCES training_lessons(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  completed_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (lesson_id, user_id)
);
CREATE INDEX IF NOT EXISTS lesson_completions_user_idx ON training_lesson_completions(user_id);

-- Publish the starter academy only after adding substantive lesson material.
INSERT INTO training_lessons (course_id,title,lesson_type,content,sort_order,is_published)
SELECT c.id,v.title,'reading',v.content,v.sort_order,true
FROM (VALUES
('Commercial Lines Foundations','The commercial insurance lifecycle','A commercial account moves through discovery, exposure collection, market selection, submission, underwriting, quote comparison, client presentation, binding, and policy delivery. Confirm the named insured, legal entity, operations, locations, requested lines, effective date, and loss history before approaching a market. Keep a written record of open items and never represent a quote as bound coverage. ',1),
('Commercial Lines Foundations','Exposure and underwriting data','Collect consistent exposure data: annual sales, payroll by class, square footage, building construction and protection, vehicles and drivers, subcontractor costs, and prior losses. Ask follow-up questions when figures conflict. Document the source and date of each value, and mark estimates clearly rather than filling gaps with assumptions.',2),
('Commercial Lines Foundations','Submission quality control','Before submission, compare the application against supplements, loss runs, prior policies, schedules, and client statements. Check legal names, addresses, FEIN where required, effective dates, limits, deductibles, and signatures. Explain material discrepancies to the underwriter instead of silently changing information.',3),
('Commercial Lines Foundations','Quote review and client communication','Compare coverage forms, limits, deductibles, exclusions, endorsements, subjectivities, taxes, fees, and payment plans—not premium alone. Present differences in plain language and obtain the insured’s written selection. A quote is not a binder; confirm carrier authorization and all binding requirements first.',4),

('ACORD Forms Workshop','ACORD 125 applicant information','Use ACORD 125 to capture applicant identity, business structure, mailing and premises details, contact information, business description, prior carrier information, and general underwriting questions. Match the applicant name and address to supporting records. Do not guess at FEIN, years in business, or ownership details.',1),
('ACORD Forms Workshop','ACORD 126 general liability','Use ACORD 126 to organize general liability exposures, premises and operations, products/completed operations, limits, classifications, payroll or sales basis, and supplemental questions. The classification and exposure basis must match the actual work performed. Explain unusual operations and subcontracting arrangements in an attachment.',2),
('ACORD Forms Workshop','ACORD 140 property section','Use ACORD 140 to schedule buildings and business personal property. Confirm building address, occupancy, construction, year built, square footage, protection, roof and updates where requested, values, coinsurance or valuation basis, and protective safeguards. Separate building values from contents and tenant improvements.',3),
('ACORD Forms Workshop','Application review and signatures','Review all applicable forms together. Ensure schedules reconcile with the narrative and that every required question is answered. Obtain authorized signatures and dates. Keep a copy of the final submitted application and supplements in the account file.',4),

('Commercial Property Quoting Practice','Building and occupancy details','Collect each location separately. Confirm owner or tenant status, occupancy, operations conducted by others, construction type, year built, square footage, number of stories, roof age, electrical/plumbing/HVAC updates, and distance to fire protection where required. Ask for photos or inspection details when available.',1),
('Commercial Property Quoting Practice','Values and coverage selection','Distinguish building, business personal property, stock, tenant improvements, and business income. Establish replacement cost or actual cash value basis with the insured and document the valuation source. Select limits and deductibles based on the exposure; do not assume a building limit equals the contents limit.',2),
('Commercial Property Quoting Practice','Protection and loss controls','Document sprinkler, alarm, central station monitoring, extinguishers, cooking suppression, housekeeping, roof maintenance, and other safeguards accurately. Describe prior losses, cause, amount, date, and corrective action. Underwriters need both the loss facts and evidence that corrective measures were completed.',3),
('Commercial Property Quoting Practice','Property submission exercise','Prepare a practice submission with one building and contents schedule. Identify missing information, flag value concerns, list required photos or statements, and draft a concise underwriter note. Do not submit fictitious information to a real carrier.',4),

('General Liability Quoting Practice','Describe operations precisely','Write a clear operations narrative that identifies what the business does, where work occurs, who performs it, and what products or services are sold. Avoid vague labels such as “contractor” or “consultant.” Include subcontractor use, work at height, installation, public events, and other material activities.',1),
('General Liability Quoting Practice','Classifications and exposure bases','Match class codes to actual operations and carrier rules. Confirm whether rating is based on payroll, gross sales, area, admissions, or another measure. Separate distinct operations when required and explain unusual exposures. Never choose a code solely because it produces a lower premium.',2),
('General Liability Quoting Practice','Limits, exclusions and supplements','Review each occurrence and aggregate limit, products/completed operations, personal and advertising injury, damage to rented premises, medical payments, and relevant endorsements. Complete carrier supplements consistently and disclose liquor, professional, cyber, abuse, event, or other special exposures when applicable.',3),
('General Liability Quoting Practice','GL quote preparation exercise','Build a practice GL submission using a realistic operations description, revenue or payroll basis, requested limits, loss history, and supplemental answers. Identify any exposure that may need a separate policy or specialist market. Document assumptions and unresolved questions.',4),

('Commercial Auto and Workers Compensation','Commercial auto fleet information','Collect vehicle year, make, model, VIN, garaging address, radius, use, stated value, ownership or lease status, and coverage requested. Collect driver names, dates of birth, license details, experience, and MVR authorization as required. Reconcile vehicle schedules against registrations and client records.',1),
('Commercial Auto and Workers Compensation','Workers compensation exposure','Collect payroll by state and job classification, owner/officer inclusion or exclusion elections, employee duties, subcontractor costs, and experience modification information where applicable. Separate clerical and field duties when appropriate. Classifications must reflect actual work, not job titles alone.',2),
('Commercial Auto and Workers Compensation','Driver and payroll quality checks','Check for garaging mismatches, radius inconsistencies, undisclosed drivers, vehicle use changes, payroll estimates that do not reconcile, and uninsured subcontractors. Ask the insured to clarify rather than inventing a value. Preserve supporting documents in the file.',3),
('Commercial Auto and Workers Compensation','Multi-line submission exercise','Prepare a practice account with a vehicle schedule and payroll worksheet. Identify missing driver information, garaging details, state exposures, class-code questions, and required supplements. Summarize the outstanding items before the submission is considered complete.',4),

('Quote Review and Binding Workflow','Compare quotes apples to apples','Normalize effective dates, named insureds, locations, limits, deductibles, valuation, forms, endorsements, exclusions, taxes, fees, and payment terms. Highlight differences that materially affect coverage. Calculate premium changes accurately and label annual versus installment amounts.',1),
('Quote Review and Binding Workflow','Underwriting subjectivities','Create a checklist of every condition required before binding: signed applications, photos, inspections, loss runs, protective safeguard confirmations, down payment, and other carrier requirements. Assign an owner and due date to each item. Do not state that a condition is satisfied until evidence is received.',2),
('Quote Review and Binding Workflow','Bind request and confirmation','A bind request should identify the insured, policy line, carrier, quote or submission reference, effective date and time, selected limits and deductibles, payment method, and completed subjectivities. Binding occurs only when an authorized carrier or wholesaler confirms it. Record the confirmation and binder details.',3),
('Quote Review and Binding Workflow','Policy delivery and quality assurance','After binding, verify the binder and invoice, policy term, named insured, locations, limits, forms, and premium against the accepted quote. Request corrections promptly. Deliver documents securely and explain any remaining policy issuance items or audit requirements.',4)
) AS v(course_title,title,content,sort_order)
JOIN training_courses c ON c.title=v.course_title
WHERE NOT EXISTS (SELECT 1 FROM training_lessons l WHERE l.course_id=c.id AND l.title=v.title);

UPDATE training_courses SET is_published=true
WHERE title IN ('Commercial Lines Foundations','ACORD Forms Workshop','Commercial Property Quoting Practice','General Liability Quoting Practice','Commercial Auto and Workers Compensation','Quote Review and Binding Workflow');


-- Completion and certificate records for the Academy assessment workflow.
CREATE TABLE IF NOT EXISTS training_lesson_completions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lesson_id uuid NOT NULL REFERENCES training_lessons(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  completed_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (lesson_id, user_id)
);
CREATE TABLE IF NOT EXISTS training_certificates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  course_id uuid NOT NULL REFERENCES training_courses(id) ON DELETE CASCADE,
  certificate_code text NOT NULL UNIQUE,
  issued_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, course_id)
);
CREATE INDEX IF NOT EXISTS lesson_completions_user_idx ON training_lesson_completions(user_id);

INSERT INTO training_assessments (course_id,title,instructions,passing_score,questions,is_published)
SELECT c.id,v.title,v.instructions,80,v.questions::jsonb,true
FROM (VALUES
('Commercial Lines Foundations','Commercial Lines Foundations Assessment','Pass with 80%. Review account intake, exposure verification, quote comparison and binding.','[{"prompt":"What comes before market selection?","choices":["Verify applicant exposures","Promise a premium","Bind coverage"],"correct":0},{"prompt":"A quote is the same as a binder.","choices":["True","False"],"correct":1},{"prompt":"When is coverage bound?","choices":["When requested","When an authorized carrier confirms","When a quote is emailed"],"correct":1}]'),
('ACORD Forms Workshop','ACORD Forms Workshop Assessment','Pass with 80%. Review ACORD 125, 126 and 140.','[{"prompt":"ACORD 125 captures:","choices":["Applicant and general business details","Only vehicles","Only payroll"],"correct":0},{"prompt":"ACORD 126 is commonly used for:","choices":["Property","General liability","Certificates"],"correct":1},{"prompt":"ACORD 140 captures:","choices":["Commercial property details","Driver MVRs","Workers compensation claims"],"correct":0}]'),
('Commercial Property Quoting Practice','Commercial Property Assessment','Pass with 80%. Review property values, protection and loss details.','[{"prompt":"Building and contents values should be:","choices":["Separated and supported","Combined without detail","Guessed"],"correct":0},{"prompt":"A protection feature includes:","choices":["Central station alarm","Agent commission","Owner age"],"correct":0},{"prompt":"Loss details should include:","choices":["Date, cause, amount and corrective action","Only premium","No details"],"correct":0}]'),
('General Liability Quoting Practice','General Liability Assessment','Pass with 80%. Review operations descriptions and classification.','[{"prompt":"Operations descriptions should explain:","choices":["Work performed, where and by whom","Only company slogan","Only premium"],"correct":0},{"prompt":"Class codes should match:","choices":["Lowest rate","Actual operations and carrier rules","Client preference"],"correct":1},{"prompt":"Subcontractor use should be:","choices":["Disclosed when material","Hidden","Assumed zero"],"correct":0}]'),
('Commercial Auto and Workers Compensation','Commercial Auto and Workers Compensation Assessment','Pass with 80%. Review vehicle, driver and payroll exposures.','[{"prompt":"A vehicle schedule should include:","choices":["VIN, garaging and use","Only color","Only premium"],"correct":0},{"prompt":"Workers compensation payroll is organized by:","choices":["State and class","Employee favorite color","Carrier"],"correct":0},{"prompt":"If garaging details conflict, you should:","choices":["Clarify with insured","Guess","Ignore it"],"correct":0}]'),
('Quote Review and Binding Workflow','Quote Review and Binding Assessment','Pass with 80%. Review subjectivities, bind requests and policy delivery.','[{"prompt":"A subjectivity is:","choices":["An underwriting condition","A slogan","An invoice"],"correct":0},{"prompt":"Binding is confirmed by:","choices":["Authorized carrier or wholesaler","Any client employee","The website"],"correct":0},{"prompt":"After binding, compare the binder against:","choices":["Accepted quote and requested coverage","A competitor ad","Only commission"],"correct":0}]')
) AS v(course_title,title,instructions,questions)
JOIN training_courses c ON c.title=v.course_title
WHERE NOT EXISTS (SELECT 1 FROM training_assessments a WHERE a.course_id=c.id);

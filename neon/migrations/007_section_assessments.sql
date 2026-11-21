-- Give every published learning section its own independently scored assessment.
ALTER TABLE training_assessments
  ADD COLUMN IF NOT EXISTS lesson_id uuid REFERENCES training_lessons(id) ON DELETE CASCADE;

DO $$
DECLARE
  assessment_row record;
  lesson_row record;
  section_count integer;
  section_index integer;
  section_questions jsonb;
BEGIN
  FOR assessment_row IN
    SELECT * FROM training_assessments
    WHERE lesson_id IS NULL
    ORDER BY course_id, created_at
  LOOP
    SELECT count(*) INTO section_count
    FROM training_lessons
    WHERE course_id = assessment_row.course_id AND is_published = true;

    IF section_count = 0 THEN
      CONTINUE;
    END IF;

    section_index := 0;
    FOR lesson_row IN
      SELECT id, title
      FROM training_lessons
      WHERE course_id = assessment_row.course_id AND is_published = true
      ORDER BY sort_order, created_at
    LOOP
      SELECT COALESCE(jsonb_agg(q.value ORDER BY q.ordinality), '[]'::jsonb)
      INTO section_questions
      FROM jsonb_array_elements(assessment_row.questions) WITH ORDINALITY AS q(value, ordinality)
      WHERE mod(q.ordinality - 1, section_count) = section_index;

      IF section_index = 0 THEN
        UPDATE training_assessments
        SET lesson_id = lesson_row.id,
            title = lesson_row.title || ' — Section Assessment',
            instructions = 'Complete this assessment for the ' || lesson_row.title || ' section. Each section is scored separately.',
            questions = section_questions
        WHERE id = assessment_row.id;
      ELSE
        INSERT INTO training_assessments
          (course_id, lesson_id, title, instructions, passing_score, questions, is_published)
        VALUES
          (assessment_row.course_id, lesson_row.id,
           lesson_row.title || ' — Section Assessment',
           'Complete this assessment for the ' || lesson_row.title || ' section. Each section is scored separately.',
           assessment_row.passing_score, section_questions, assessment_row.is_published);
      END IF;

      section_index := section_index + 1;
    END LOOP;
  END LOOP;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS training_assessments_lesson_unique
  ON training_assessments(lesson_id)
  WHERE lesson_id IS NOT NULL;

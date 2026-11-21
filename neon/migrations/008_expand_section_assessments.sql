-- Expand every section assessment to a useful, independently scored question set.
UPDATE training_assessments a
SET questions = a.questions || jsonb_build_array(
 jsonb_build_object(
  'prompt','For the "'||l.title||'" section, which source should be used to verify the insured information?',
  'choices',jsonb_build_array('The applicable application or schedule supported by insured records','An estimate based on a similar account','An old quote for an unrelated risk','An assumption about carrier requirements'),
  'correct',0,
  'explanation','Use current, risk-specific source documents and confirm details with the insured.'
 ),
 jsonb_build_object(
  'prompt','If information conflicts while completing "'||l.title||'", what should the agent do?',
  'choices',jsonb_build_array('Clarify the discrepancy with the insured and document the verified answer','Choose whichever value produces the lower premium','Leave both versions in the submission without explanation','Use the information from an unrelated prior policy'),
  'correct',0,
  'explanation','Resolve discrepancies before submission; never guess or alter exposure information.'
 ),
 jsonb_build_object(
  'prompt','What should a strong underwriter note for "'||l.title||'" include?',
  'choices',jsonb_build_array('Verified exposure facts, supporting documents, controls and outstanding questions','Only the requested premium','Only the insured name and phone number','A statement that every risk is acceptable'),
  'correct',0,
  'explanation','A useful note summarizes the risk accurately and makes missing information visible.'
 )
)
FROM training_lessons l
WHERE l.id=a.lesson_id
  AND a.is_published=true
  AND NOT EXISTS (
    SELECT 1 FROM jsonb_array_elements(a.questions) q
    WHERE q->>'prompt' LIKE 'For the "% section, which source should be used to verify the insured information?'
  );

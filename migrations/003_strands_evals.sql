-- Migrate eval_rubrics to the Strands evaluator model.
-- Adds columns describing which Strands Evaluator to instantiate and any
-- rubric text / model override. Clears the old seed rubrics and seeds the
-- Strands defaults that work out of the box via Ollama + gemma.

ALTER TABLE eval_rubrics ADD COLUMN IF NOT EXISTS evaluator_type TEXT;
ALTER TABLE eval_rubrics ADD COLUMN IF NOT EXISTS rubric_text TEXT;
ALTER TABLE eval_rubrics ADD COLUMN IF NOT EXISTS model_id TEXT;
ALTER TABLE eval_rubrics ADD COLUMN IF NOT EXISTS is_default BOOLEAN DEFAULT FALSE;

-- Wipe old rubric rows so the seeds below are authoritative. Evals already
-- run against those rubrics cascade away via the FK.
DELETE FROM eval_rubrics WHERE id IN ('tool-error-rate','agent-success','llm-judge-helpfulness');

INSERT INTO eval_rubrics (id, name, description, kind, target_kind, evaluator_type, rubric_text, model_id, is_default, config) VALUES
    ('helpfulness',
     'Helpfulness',
     'Grades how helpful the assistant''s response was on the user''s task.',
     'llm_judge', 'trace', 'HelpfulnessEvaluator', NULL, NULL, TRUE, '{}'),
    ('coherence',
     'Coherence',
     'Grades whether the assistant''s reasoning stayed coherent across turns.',
     'llm_judge', 'trace', 'CoherenceEvaluator', NULL, NULL, TRUE, '{}'),
    ('conciseness',
     'Conciseness',
     'Grades whether the assistant avoided unnecessary verbosity.',
     'llm_judge', 'trace', 'ConcisenessEvaluator', NULL, NULL, TRUE, '{}'),
    ('response-relevance',
     'Response relevance',
     'Grades whether the assistant actually addressed the user''s request.',
     'llm_judge', 'trace', 'ResponseRelevanceEvaluator', NULL, NULL, TRUE, '{}'),
    ('harmfulness',
     'Harmfulness',
     'Flags unsafe or harmful content in the assistant''s output.',
     'llm_judge', 'trace', 'HarmfulnessEvaluator', NULL, NULL, TRUE, '{}'),
    ('tool-selection',
     'Tool selection accuracy',
     'Did the agent pick appropriate tools for the task?',
     'llm_judge', 'trace', 'ToolSelectionAccuracyEvaluator', NULL, NULL, TRUE, '{}'),
    ('tool-parameters',
     'Tool parameter accuracy',
     'Were the tool call parameters correct and well-formed?',
     'llm_judge', 'trace', 'ToolParameterAccuracyEvaluator', NULL, NULL, TRUE, '{}'),
    ('trajectory',
     'Trajectory',
     'End-to-end assessment of the sequence of steps the agent took.',
     'llm_judge', 'trace', 'TrajectoryEvaluator',
     'Pass if the tool sequence is a reasonable path to satisfy the user''s request. Score 0-1 based on efficiency and appropriateness of tool choices.',
     NULL, TRUE, '{}'),
    ('tool-error-rate',
     'Tool error rate',
     'Deterministic: fraction of tool spans that did not error. Passes at >=95%.',
     'function', 'trace', NULL, NULL, NULL, TRUE, '{}')
ON CONFLICT (id) DO UPDATE SET
    name = EXCLUDED.name,
    description = EXCLUDED.description,
    kind = EXCLUDED.kind,
    target_kind = EXCLUDED.target_kind,
    evaluator_type = EXCLUDED.evaluator_type,
    rubric_text = EXCLUDED.rubric_text,
    model_id = EXCLUDED.model_id,
    is_default = EXCLUDED.is_default;

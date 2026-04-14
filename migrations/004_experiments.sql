-- Experiments: named bundles of cases + evaluators you can run against
-- an agent and persist results. Wraps Strands `Experiment` / `Case` /
-- `ActorSimulator` so spool can drive multi-turn scenario testing.

CREATE TABLE IF NOT EXISTS experiments (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT,
    cases JSONB NOT NULL DEFAULT '[]'::jsonb,
    evaluators JSONB NOT NULL DEFAULT '[]'::jsonb,
    config JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS experiment_runs (
    id TEXT PRIMARY KEY,
    experiment_id TEXT NOT NULL REFERENCES experiments(id) ON DELETE CASCADE,
    started_at TIMESTAMPTZ DEFAULT now(),
    finished_at TIMESTAMPTZ,
    status TEXT DEFAULT 'running',  -- running | complete | error
    reports JSONB NOT NULL DEFAULT '[]'::jsonb,
    overall_scores JSONB NOT NULL DEFAULT '{}'::jsonb,
    error TEXT,
    created_trace_ids JSONB NOT NULL DEFAULT '[]'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_experiment_runs_experiment ON experiment_runs(experiment_id);
CREATE INDEX IF NOT EXISTS idx_experiment_runs_started ON experiment_runs(started_at DESC);

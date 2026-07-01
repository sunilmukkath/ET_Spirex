-- ET Scout native survey programming (Survey Studio)
-- Tables are also created via SQLAlchemy metadata on startup.

CREATE TABLE IF NOT EXISTS et_surveys (
    workspace_id INTEGER PRIMARY KEY,
    title VARCHAR(500) NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    status VARCHAR(20) NOT NULL DEFAULT 'draft',
    language VARCHAR(20) NOT NULL DEFAULT 'en',
    public_slug VARCHAR(80) NOT NULL UNIQUE,
    definition JSONB NOT NULL DEFAULT '{}'::jsonb,
    version INTEGER NOT NULL DEFAULT 1,
    created_by VARCHAR(120) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS et_survey_responses (
    response_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id INTEGER NOT NULL REFERENCES et_surveys(workspace_id) ON DELETE CASCADE,
    answers JSONB NOT NULL DEFAULT '{}'::jsonb,
    complete BOOLEAN NOT NULL DEFAULT FALSE,
    started_at TIMESTAMPTZ,
    submitted_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_et_survey_responses_workspace
    ON et_survey_responses (workspace_id, complete);

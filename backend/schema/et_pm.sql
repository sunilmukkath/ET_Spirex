-- Elastic Tree Project Management System — spine schema
-- Apply manually or via SQLAlchemy create_all on startup when DATABASE_URL is set.

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- team_members (seeded on first init)
CREATE TABLE IF NOT EXISTS team_members (
    member_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL UNIQUE,
    role TEXT NOT NULL DEFAULT 'researcher',
    active_project_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS clients (
    client_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    client_name TEXT NOT NULL,
    sector TEXT,
    contact_person TEXT,
    contact_email TEXT,
    repeat_client BOOLEAN NOT NULL DEFAULT FALSE,
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS projects (
    project_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_name TEXT NOT NULL,
    client_id UUID REFERENCES clients(client_id) ON DELETE SET NULL,
    project_type TEXT NOT NULL CHECK (project_type IN ('quant', 'qual', 'mixed')),
    engagement_type TEXT NOT NULL CHECK (engagement_type IN ('tracking', 'ad-hoc')),
    stage TEXT NOT NULL DEFAULT 'Proposal',
    owner_id UUID REFERENCES team_members(member_id) ON DELETE SET NULL,
    limesurvey_survey_id INTEGER UNIQUE,
    start_date DATE,
    target_close_date DATE,
    actual_close_date DATE,
    budget_estimate NUMERIC(14, 2),
    budget_actual NUMERIC(14, 2),
    status_notes TEXT,
    requirements JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS vendors (
    vendor_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    vendor_name TEXT NOT NULL,
    vendor_type TEXT NOT NULL CHECK (vendor_type IN ('field_agency', 'recruiter', 'transcription', 'translator')),
    contact_info TEXT,
    rate_card JSONB,
    linked_project_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS proposals (
    proposal_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES projects(project_id) ON DELETE CASCADE,
    version INTEGER NOT NULL DEFAULT 1,
    methodology_summary TEXT,
    sample_size INTEGER,
    budget_breakdown JSONB,
    status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'sent', 'approved', 'revised')),
    sent_date DATE,
    approved_date DATE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS budget_line_items (
    line_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES projects(project_id) ON DELETE CASCADE,
    category TEXT NOT NULL,
    estimated_cost NUMERIC(14, 2),
    actual_cost NUMERIC(14, 2),
    invoice_id UUID,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS invoices (
    invoice_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES projects(project_id) ON DELETE CASCADE,
    client_id UUID REFERENCES clients(client_id) ON DELETE SET NULL,
    amount NUMERIC(14, 2) NOT NULL,
    invoice_date DATE,
    due_date DATE,
    paid_status TEXT NOT NULL DEFAULT 'pending',
    payment_date DATE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE budget_line_items
    ADD CONSTRAINT budget_line_items_invoice_fk
    FOREIGN KEY (invoice_id) REFERENCES invoices(invoice_id) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS survey_instruments (
    instrument_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES projects(project_id) ON DELETE CASCADE,
    version INTEGER NOT NULL DEFAULT 1,
    limesurvey_survey_id INTEGER,
    questionnaire_file_path TEXT,
    pilot_status TEXT,
    approved_by UUID REFERENCES team_members(member_id) ON DELETE SET NULL,
    approved_date DATE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS discussion_guides (
    guide_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES projects(project_id) ON DELETE CASCADE,
    version INTEGER NOT NULL DEFAULT 1,
    guide_file_path TEXT,
    target_respondent_profile TEXT,
    approved_status TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS recruitment (
    recruitment_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES projects(project_id) ON DELETE CASCADE,
    target_quota JSONB NOT NULL DEFAULT '{}'::jsonb,
    recruited_count INTEGER NOT NULL DEFAULT 0,
    screener_pass_rate NUMERIC(5, 2),
    recruiter_vendor_id UUID REFERENCES vendors(vendor_id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS fieldwork_progress (
    entry_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES projects(project_id) ON DELETE CASCADE,
    entry_date DATE NOT NULL,
    completes_today INTEGER NOT NULL DEFAULT 0,
    cumulative_completes INTEGER NOT NULL DEFAULT 0,
    target_completes INTEGER,
    quota_cell JSONB,
    rejects_today INTEGER NOT NULL DEFAULT 0,
    reject_reason TEXT,
    flagged_for_qc BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_fieldwork_progress_project_date
    ON fieldwork_progress (project_id, entry_date DESC);

CREATE TABLE IF NOT EXISTS qc_checks (
    check_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES projects(project_id) ON DELETE CASCADE,
    check_type TEXT NOT NULL,
    respondent_id TEXT,
    result TEXT NOT NULL CHECK (result IN ('pass', 'fail', 'flag')),
    reviewed_by UUID REFERENCES team_members(member_id) ON DELETE SET NULL,
    review_date DATE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS transcripts (
    transcript_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES projects(project_id) ON DELETE CASCADE,
    respondent_id TEXT,
    session_type TEXT CHECK (session_type IN ('FGD', 'IDI')),
    city TEXT,
    upload_date DATE,
    file_path TEXT,
    transcription_status TEXT CHECK (transcription_status IN ('raw', 'cleaned')),
    language TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS themes (
    theme_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES projects(project_id) ON DELETE CASCADE,
    theme_label TEXT NOT NULL,
    theme_description TEXT,
    transcript_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
    auto_classified BOOLEAN NOT NULL DEFAULT FALSE,
    confidence_score NUMERIC(5, 4),
    reviewed_by_human BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS analysis_outputs (
    output_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES projects(project_id) ON DELETE CASCADE,
    output_type TEXT NOT NULL,
    file_path TEXT,
    dashboard_url TEXT,
    generated_date DATE,
    generated_by TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS reports (
    report_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES projects(project_id) ON DELETE CASCADE,
    report_type TEXT NOT NULL,
    version INTEGER NOT NULL DEFAULT 1,
    file_path TEXT,
    template_used TEXT,
    sent_to_client_date DATE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS marketing_activities (
    activity_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    client_id UUID REFERENCES clients(client_id) ON DELETE SET NULL,
    project_id UUID REFERENCES projects(project_id) ON DELETE SET NULL,
    activity_type TEXT NOT NULL CHECK (activity_type IN ('outreach', 'campaign', 'event', 'nurture', 'proposal_followup')),
    title TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'planned' CHECK (status IN ('planned', 'active', 'completed', 'cancelled')),
    owner_name TEXT,
    due_date DATE,
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ====================================================================
-- PostgreSQL Schema for Job Tracker MVP
-- System of record as defined in requirements/data.md
-- ====================================================================

CREATE TABLE IF NOT EXISTS job_postings (
    -- Durable Internal UUID
    id UUID PRIMARY KEY,

    -- Provenance & Deduplication
    source VARCHAR(64) NOT NULL,
    source_job_id VARCHAR(255),
    source_url TEXT,
    canonical_url TEXT,
    application_url TEXT,
    content_hash VARCHAR(64) NOT NULL,

    -- Core Relational Fields (Indexed & Directly Queryable)
    title VARCHAR(512) NOT NULL,
    company VARCHAR(255) NOT NULL,
    location VARCHAR(255),
    workplace_type VARCHAR(32) NOT NULL DEFAULT 'unknown',
    employment_type VARCHAR(32) NOT NULL DEFAULT 'unknown',
    seniority VARCHAR(32) NOT NULL DEFAULT 'unknown',

    -- Compensation
    salary_min_annual INTEGER,
    salary_max_annual INTEGER,
    currency VARCHAR(16) DEFAULT 'USD',
    interval VARCHAR(32),
    raw_salary_text TEXT,

    -- Content
    description_text TEXT NOT NULL,

    -- Timestamps
    date_posted TIMESTAMPTZ,
    date_discovered TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_checked_at TIMESTAMPTZ,

    -- Three Independent Lifecycles
    job_status VARCHAR(64) NOT NULL DEFAULT 'discovered',
    availability VARCHAR(32) NOT NULL DEFAULT 'unknown',
    availability_evidence TEXT,

    -- Automated Fit Classification (TypeSafe AI JEV)
    jev_fit BOOLEAN,
    jev_confidence NUMERIC(4, 3),

    -- Versioned Flexible JSON Documents
    crawler_data JSONB,
    ai_analysis JSONB,
    user_overrides JSONB,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for Fast Deduplication
CREATE INDEX IF NOT EXISTS idx_job_postings_source_id ON job_postings(source, source_job_id);
CREATE INDEX IF NOT EXISTS idx_job_postings_canonical_url ON job_postings(canonical_url);
CREATE INDEX IF NOT EXISTS idx_job_postings_content_hash ON job_postings(content_hash);

-- Indexes for Workflow Filtering & Queries
CREATE INDEX IF NOT EXISTS idx_job_postings_job_status ON job_postings(job_status);
CREATE INDEX IF NOT EXISTS idx_job_postings_availability ON job_postings(availability);
CREATE INDEX IF NOT EXISTS idx_job_postings_company ON job_postings(company);
CREATE INDEX IF NOT EXISTS idx_job_postings_created_at ON job_postings(created_at DESC);

-- Indexes for Nullable & High-Frequency Filter Fields
CREATE INDEX IF NOT EXISTS idx_job_postings_salary_min ON job_postings(salary_min_annual);
CREATE INDEX IF NOT EXISTS idx_job_postings_workplace ON job_postings(workplace_type);
CREATE INDEX IF NOT EXISTS idx_job_postings_location ON job_postings(location);
CREATE INDEX IF NOT EXISTS idx_job_postings_jev_confidence ON job_postings(jev_confidence DESC);

-- ====================================================================
-- Job Status Audit History (data.md section 97)
-- ====================================================================
CREATE TABLE IF NOT EXISTS job_status_history (
    id UUID PRIMARY KEY,
    job_posting_id UUID NOT NULL REFERENCES job_postings(id) ON DELETE CASCADE,
    previous_status VARCHAR(64),
    new_status VARCHAR(64) NOT NULL,
    changed_by VARCHAR(64) NOT NULL, -- 'crawler', 'deterministic_filter', 'ai', 'user', 'system'
    reason TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_status_history_job_id ON job_status_history(job_posting_id);

-- ====================================================================
-- Application Tracking Entity (data.md section 111)
-- ====================================================================
CREATE TABLE IF NOT EXISTS applications (
    id UUID PRIMARY KEY,
    job_posting_id UUID NOT NULL UNIQUE REFERENCES job_postings(id) ON DELETE CASCADE,
    status VARCHAR(64) NOT NULL DEFAULT 'preparing',
    application_url TEXT,
    applied_at TIMESTAMPTZ,
    next_action_date TIMESTAMPTZ,
    user_notes TEXT,
    stage_history JSONB DEFAULT '[]'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_applications_status ON applications(status);

-- ====================================================================
-- Explicit Feedback Entity (feedback-learning.md)
-- ====================================================================
CREATE TABLE IF NOT EXISTS recommendation_feedback (
    id UUID PRIMARY KEY,
    job_posting_id UUID NOT NULL REFERENCES job_postings(id) ON DELETE CASCADE,
    vote VARCHAR(8) NOT NULL, -- 'up', 'down'
    reason_code VARCHAR(64),
    explanation TEXT,
    recommendation_snapshot JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    retracted_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_feedback_job_id ON recommendation_feedback(job_posting_id);

-- ====================================================================
-- Crawl / Discovery Run Logs (crawler.md section 30)
-- ====================================================================
CREATE TABLE IF NOT EXISTS discovery_runs (
    id UUID PRIMARY KEY,
    source VARCHAR(64) NOT NULL,
    trigger_type VARCHAR(32) NOT NULL, -- 'manual', 'scheduled'
    status VARCHAR(32) NOT NULL, -- 'running', 'completed', 'failed'
    total_found INTEGER DEFAULT 0,
    new_imported INTEGER DEFAULT 0,
    duplicates_seen INTEGER DEFAULT 0,
    error_message TEXT,
    started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at TIMESTAMPTZ
);

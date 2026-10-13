CREATE TABLE IF NOT EXISTS application_drafts (
    id UUID PRIMARY KEY,
    job_posting_id UUID NOT NULL REFERENCES job_postings(id) ON DELETE CASCADE,
    conversation_id VARCHAR(64),
    draft_type VARCHAR(32) NOT NULL CHECK (draft_type IN ('cover_letter', 'application_answer')),
    question TEXT,
    sensitive BOOLEAN NOT NULL DEFAULT FALSE,
    status VARCHAR(16) NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'approved')),
    current_version INTEGER NOT NULL DEFAULT 1 CHECK (current_version > 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CHECK (
        (draft_type = 'cover_letter' AND question IS NULL)
        OR (draft_type = 'application_answer' AND question IS NOT NULL)
    )
);

CREATE TABLE IF NOT EXISTS application_draft_versions (
    draft_id UUID NOT NULL REFERENCES application_drafts(id) ON DELETE CASCADE,
    version INTEGER NOT NULL CHECK (version > 0),
    content TEXT NOT NULL,
    subject_line TEXT,
    source_facts JSONB NOT NULL DEFAULT '[]'::jsonb,
    assumptions JSONB NOT NULL DEFAULT '[]'::jsonb,
    author VARCHAR(16) NOT NULL CHECK (author IN ('assistant', 'user')),
    model_id VARCHAR(160),
    prompt_version VARCHAR(160),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    approved_at TIMESTAMPTZ,
    approved_by VARCHAR(160),
    PRIMARY KEY (draft_id, version)
);

CREATE INDEX IF NOT EXISTS idx_application_drafts_updated
    ON application_drafts(updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_application_drafts_job_type_status
    ON application_drafts(job_posting_id, draft_type, status);
CREATE INDEX IF NOT EXISTS idx_application_draft_versions_facts
    ON application_draft_versions USING GIN(source_facts);

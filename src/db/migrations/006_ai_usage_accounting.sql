CREATE TABLE IF NOT EXISTS ai_usage (
    id UUID PRIMARY KEY,
    role VARCHAR(16) NOT NULL CHECK (role IN ('owner', 'guest')),
    provider VARCHAR(64) NOT NULL,
    model VARCHAR(255) NOT NULL,
    prompt_version VARCHAR(128) NOT NULL,
    started_at TIMESTAMPTZ NOT NULL,
    completed_at TIMESTAMPTZ,
    estimated_input_tokens INTEGER NOT NULL CHECK (estimated_input_tokens >= 0),
    input_tokens INTEGER,
    output_tokens INTEGER,
    total_tokens INTEGER,
    latency_ms INTEGER,
    status VARCHAR(16) NOT NULL CHECK (status IN ('pending', 'succeeded', 'failed')),
    error_code VARCHAR(128)
);

CREATE INDEX IF NOT EXISTS idx_ai_usage_role_started_at ON ai_usage(role, started_at DESC);

ALTER TABLE discovery_runs
    ADD COLUMN IF NOT EXISTS batch_id UUID,
    ADD COLUMN IF NOT EXISTS filtered_out INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS screened_with_jev INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS recommended INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS error_count INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS attempt_count INTEGER NOT NULL DEFAULT 0;

UPDATE discovery_runs
SET batch_id = id
WHERE batch_id IS NULL;

ALTER TABLE discovery_runs
    ALTER COLUMN batch_id SET NOT NULL;

ALTER TABLE job_postings
    ADD COLUMN IF NOT EXISTS availability_check_failures INTEGER NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_discovery_runs_batch_started
    ON discovery_runs(batch_id, started_at DESC);

CREATE INDEX IF NOT EXISTS idx_discovery_runs_status_started
    ON discovery_runs(status, started_at);

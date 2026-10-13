ALTER TABLE recommendation_feedback
    ADD COLUMN IF NOT EXISTS replaced_by_id UUID
        REFERENCES recommendation_feedback(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS retraction_reason VARCHAR(32);

UPDATE recommendation_feedback
SET recommendation_snapshot =
    jsonb_build_object(
        'version', 'recommendation-snapshot-legacy',
        'captured_at', to_char(created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
        'jev_fit', NULL,
        'jev_confidence', NULL,
        'overall_fit_score', NULL,
        'recommendation', NULL,
        'ai_confidence', NULL,
        'provider', NULL,
        'model_id', NULL,
        'prompt_version', NULL
    ) || COALESCE(recommendation_snapshot, '{}'::jsonb);

ALTER TABLE recommendation_feedback
    ALTER COLUMN recommendation_snapshot SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_feedback_one_active_vote_per_job
    ON recommendation_feedback(job_posting_id)
    WHERE retracted_at IS NULL;

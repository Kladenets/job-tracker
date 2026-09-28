-- Migration 002: Add JEV fit classification fields and nullable indexes
ALTER TABLE job_postings ADD COLUMN IF NOT EXISTS jev_fit BOOLEAN;
ALTER TABLE job_postings ADD COLUMN IF NOT EXISTS jev_confidence NUMERIC(4, 3);

-- Drop legacy score columns if they exist
ALTER TABLE job_postings DROP COLUMN IF EXISTS deterministic_score;
ALTER TABLE job_postings DROP COLUMN IF EXISTS ai_score;

-- Indexes for Nullable & High-Frequency Filter Fields
CREATE INDEX IF NOT EXISTS idx_job_postings_salary_min ON job_postings(salary_min_annual);
CREATE INDEX IF NOT EXISTS idx_job_postings_workplace ON job_postings(workplace_type);
CREATE INDEX IF NOT EXISTS idx_job_postings_location ON job_postings(location);
CREATE INDEX IF NOT EXISTS idx_job_postings_jev_confidence ON job_postings(jev_confidence DESC);

-- ====================================================================
-- Migration 004: Persistent System & User Profiles Table
-- Stores candidate profile, structured resume, and search profile JSON
-- ====================================================================

CREATE TABLE IF NOT EXISTS user_profiles (
    key VARCHAR(64) PRIMARY KEY, -- 'candidate_profile', 'candidate_resume', 'search_profile'
    data JSONB NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

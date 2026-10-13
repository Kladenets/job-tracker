# API & Data Endpoints Specification (Supporting Frontend Views)

## 1. Scope
Defines the required backend API contracts supporting the five core frontend views (Inbox, Job Detail, Applications, Dashboard, Setup) and local/remote test interoperability.

## 2. Endpoints by Domain

### Operational Health
- `GET /api/health` is a public readiness endpoint for Docker/orchestrator probes. It returns service status, uptime, and timestamp only; it must not reveal provider tiers/failover, active profiles, or persistence details.
- `GET /api/system/health` is owner-only and returns persistence connectivity and AI-provider telemetry for the private Setup diagnostics panel. Guests receive 403.

### 2.0 Session Role
- `GET /api/session`: Returns the current request role (`owner` or `guest`) for role-aware client navigation. It must not return the authenticated owner's email or other identity details.

### 2.1 Applications Management (`/api/applications`)
Supports Page 3 (Application Tracking / Kanban):
- `GET /api/applications`: List all applications with optional status filter (`?status=...`). Includes joined job posting metadata (title, company, location, salary).
- `GET /api/applications/:id`: Retrieve single application with full stage history timeline.
- `POST /api/applications`: Create a new application for an existing job posting (`job_posting_id`, optional `status`, `applied_at`, `next_action_date`, `user_notes`). Status must be an `ApplicationStatusSchema` value; omitted status defaults to `preparing`. Invalid status returns 400 without creating an application.
- `PATCH /api/applications/:id`: Update application status, next action date, or notes. A supplied status must be an `ApplicationStatusSchema` value; invalid status returns 400 without changing the application or appending to `stage_history`.
- `DELETE /api/applications/:id`: Delete an application.

### 2.2 Metrics & Reporting (`/api/dashboard/metrics`)
Supports Page 4 (Metrics & Funnel Dashboard):
- `GET /api/dashboard/metrics?startDate=...&endDate=...`:
  Returns structured discovery and conversion metrics:
  - Discovery funnel: `discoveredCount`, `filteredOutCount`, `recommendedCount`, `savedCount`, `dismissedCount`.
  - Application conversion: `appliedCount` counts submitted applications and excludes `preparing`; `recruiterScreenCount`, `interviewCount`, `offerCount`, and `rejectedCount` use the same date range.
  - Rates use `appliedCount` (submitted applications) as the denominator: `recruiterScreenRate`, `interviewRate`, `offerRate`, `rejectionRate`.
  - Sample size flags: `isSmallSample` boolean (`true` if `appliedCount < 10`).
  - Source effectiveness breakdown returns `discovered`, `recommended`, `applied`, `callbackCount`, and `callbackRate` for each source. `applied` excludes `preparing`; callbacks are applications at `recruiter_screen` or a later positive stage. File and PostgreSQL repositories return the same shape.

### 2.3 Candidate Profile & Structured Resume (`/api/candidate-profile`)
Supports Page 5 (Setup & Profiles):
- `GET /api/candidate-profile`: Retrieve user profile JSON (`fullName`, `email`, `targetTitle`, `skills`, `yearsExperience`, `resumeSource`, `resumeData`, `additionalExperience`, `notes`).
- `PUT /api/candidate-profile`: Validate and persist the updated candidate profile to the selected repository (`user_profiles` JSONB in PostgreSQL; ignored local file store for development/tests).
- `POST /api/candidate-profile/sync-resume`: Fetch a remote JSON Resume document (e.g. GitHub Gist or personal website) over HTTPS on standard port 443, validate its JSON Resume structure, and auto-populate candidate profile fields (`skills`, `yearsExperience`). Reject URL credentials, non-public/private-network destinations, and DNS results containing any non-public address; connect to a validated address. Follow at most five redirects manually, revalidating and pinning each destination. Unsafe URLs return 400 and must not mutate persisted profile/resume data. Non-JSON remote sources are rejected in the MVP.
- `POST /api/candidate-profile/upload-resume`: Upload a local `.json` JSON Resume document. Reject non-`.json` filenames, malformed JSON, or documents without the required JSON Resume `basics` object; rejected input must not change persisted profile/resume data.

Both resume ingestion endpoints persist the normalized resume and derived profile through the selected repository. PostgreSQL `user_profiles` is canonical in PostgreSQL mode; the file-backed repository provides database-independent local/API testing.

Parsing PDF, Markdown, or plain-text resumes with an extraction model is a future feature. It must be an explicit owner action that produces a preview for review and confirmation before updating canonical profile records; the conversational agent must not write resume/profile records.

### 2.4 Search Criteria & Configuration (`/api/search-profile`)
Supports Page 5 (Setup & Profiles):
- `GET /api/search-profile`: Retrieve the active search profile, composing candidate-derived skills and target title from the repository-backed candidate profile.
- `PUT /api/search-profile`: Validate and persist active search criteria (target titles, salary minimums, excluded keywords, allowed workplace types, target location, commute radius, and buffer) to the selected repository. Radius and buffer must be between 0 and 500 miles. (Owner only).
- `GET /api/profile` remains a legacy compatibility alias for retrieving the active search profile; new clients use `/api/search-profile`.

### 2.5 Discovery Runs (`/api/discovery/run`)
- Owner-only `POST` accepts selected source names, durably queues one source-level item per adapter, and returns a per-source status, attempt count, counts, and error detail. The runner uses bounded concurrency, timeouts, and retries.
- Complete runs return HTTP 200; partial runs return HTTP 207 with successful and failed source details; runs where all selected sources fail return HTTP 502 and `success: false`.
- `discoveredCount` counts fetched postings. `recommendedCount` counts only processed postings with positive JEV fit (`jevFit === true`), not every posting evaluated by JEV.
- `GET /api/discovery/runs?limit=20&status=failed` returns the authenticated owner's recent persisted source-level run records, including scheduled and manual trigger type, counts, retry attempts, timestamps, and recovery/error detail.
- A configurable scheduled runner uses the same execution path and records scheduled source-level run items. Startup resumes queued work and re-queues abandoned in-progress work if it remains within its bounded attempt budget.
- Owner-only `POST /api/jobs/:id/check-availability` returns and persists source-derived `open`, `closed`, or `unknown` status, evidence, check time, and consecutive inconclusive-check count. Only explicit source evidence marks a posting closed; unknown/transient results never do.

### 2.6 Explicit Recommendation Feedback (`/api/jobs/:id/feedback`)
- Owner-only `GET` returns chronological explicit vote history and the active vote; guests receive 403.
- Owner-only `POST` accepts an explicit `up`/`down` vote, optional reason code and explanation (up to 2,000 characters), and a validated snapshot of the recommendation/model shown by the inbox. It appends a timestamped event; if a vote is active, that event is retracted as `replaced` and linked to the new event in the same repository transaction.
- Owner-only `DELETE` retracts the active vote with a timestamp and `user_retracted` reason without deleting history. It returns 404 when no active vote exists.
- Owner `GET /api/jobs` responses include a `feedback` map of active votes keyed by job ID for the requested postings. Guest job responses omit this private feedback.
- Save, dismiss, apply, and no interaction never create or replace an explicit vote.

### 2.7 Application Drafts (`/api/application-drafts`)
- Owner-only `GET` lists drafts with all versions, source facts, assumptions, model/prompt metadata, sensitivity state, and approval history. Optional filters include `jobId`, `draftType`, `status`, and bounded `limit`.
- Owner-only `POST` creates a user-authored cover-letter or application-answer draft. Answer drafts require the original question; restricted sensitive questions are automatically marked user-only.
- Owner-only `PATCH /api/application-drafts/:id` appends a user-authored content version and returns the draft to unapproved state without changing older versions.
- Owner-only `POST /api/application-drafts/:id/approve` explicitly approves the current version and records who approved it and when. Approval is never inferred from saving, editing, silence, or application workflow status.
- Owner-only `GET /api/application-drafts/:id` returns the complete draft history. The cover-letter and application-answer agent tools persist generated drafts through the selected repository.
- Approved prior answers may be retrieved for adaptation only when they are not marked sensitive. Guests cannot read or create drafts, retrieve candidate facts, or access owner conversations.

Remote resume sync and local resume upload persist the normalized structured resume and derived candidate profile to the same selected repository, regardless of source type. Local JSON seed files are not committed and are not production persistence targets.

## 3. Role-Based Access Control & Sanitization Rules

| Endpoint / Action | Owner Role (`owner`) | Guest Role (`guest`) |
| :--- | :---: | :---: |
| `GET /api/jobs` | Full access with user triage tags | Sanitized list (redacts user status, shows only market postings) |
| `GET /api/jobs/:id` | Full details, overrides, personal notes | Sanitized details (redacts overrides and personal status) |
| `GET/POST/PATCH /api/application-drafts` | Read, create, or edit private drafts | **403 Forbidden** |
| `GET /api/application-drafts/:id` and `POST /:id/approve` | Read history or explicitly approve current version | **403 Forbidden** |
| `PATCH /api/jobs/:id/status` | Permitted for `JobWorkflowStatusSchema` values; invalid status returns 400 without mutation. Audit actor is server-assigned (`user` for interactive owners, `system` for bearer-token automation); body-supplied `changedBy` is ignored. | **403 Forbidden** |
| `GET/POST/DELETE /api/jobs/:id/feedback` | Read history, record explicit votes, or retract the active vote | **403 Forbidden** |
| `GET /api/applications` | Full candidate application pipeline | **403 Forbidden** (Restricted page in UI) |
| `POST/PATCH/DELETE /api/applications` | Permitted | **403 Forbidden** |
| `GET /api/dashboard/metrics` | Full discovery + private conversion rates | **403 Forbidden** (Restricted page in UI) |
| `GET /api/candidate-profile` | Full candidate resume & notes | **403 Forbidden** |
| `PUT /api/candidate-profile` | Permitted | **403 Forbidden** |
| `POST /api/sources/*/scrape` | Permitted | **403 Forbidden** |

For guest `GET /api/jobs`, public market filters (company, availability, missing salary/location) may be applied. Owner workflow status filters and JEV confidence sorting must be ignored so response membership, count, and order do not reveal private review state or fit scores.

## 4. Multi-Tier AI Assistant Endpoints (`/api/agent/*`)

- **Owner Conversations:**
  - `POST /api/agent/conversations` creates an owner conversation.
  - `GET /api/agent/conversations` lists owner conversations; `GET /api/agent/conversations/:id` retrieves one.
  - `POST /api/agent/conversations/:id/messages` sends a persistent owner turn; `DELETE /api/agent/conversations/:id` deletes it.
  - These routes require `role = 'owner'`, persist via the selected repository, and use owner-only Gemini key resolution/failover. An `owner_free` HTTP 429 activates the process-wide Pro cooldown and retries the current turn once with `owner_pro` when configured.
  - Agent tools load candidate and resume context from repository-backed profile records.
- **Guest Demo Chat (`POST /api/agent/guest-chat`):**
  - Open to `role = 'guest'` as the sole public API POST exception.
  - Accepts `{ message, jobId?, history? }`; `history` contains at most 12 user/assistant turns, with each message at most 4000 characters.
  - Uses the isolated guest key (`PROD_GUEST_GEMINI_API_KEY_FREE`, with `GUEST_GEMINI_API_KEY` as a compatibility alias) and a generic candidate persona.
  - Does not persist server-side and cannot access owner conversations, candidate profile, or resume. Guest thread state is client-memory-only and clears on page reload.
  - No application-level guest rate/budget cap is required for the MVP; provider quota is the limit.
- **AI Health & Provider Status:**
  - `GET /api/health` is a public, minimal readiness response for Docker/orchestrator probes. It must not expose active profile names, persistence details, provider configuration, key tiers, or failover state.
  - Owner-authenticated `GET /api/system/health` returns the selected persistence engine and exact Gemini key tier (`development`, `guest`, `owner_free`, `owner_pro`, or `none`) plus failover status, without billable probes. Guest requests receive `403`.
  - `GET /api/db/status` returns the active persistence engine and actual PostgreSQL connectivity result; file-backed mode is not reported as PostgreSQL health.
  - AI conversation turn responses include the resolved role/tier telemetry after any owner retry. Guest responses expose only guest-tier status; guest 429s never activate owner failover or use owner keys/history.

## PostgreSQL integration verification

Run `npm run test:postgres` to verify the API's persistence dependency against a disposable PostgreSQL 16 container. The opt-in command covers versioned migrations, production startup failure when PostgreSQL is unavailable, parity for shared repository operations, rollback of a failed status-history transaction, and persisted data read by a fresh Node process. It creates a unique container bound only to loopback on an ephemeral port and removes it afterward; it never uses `DATABASE_URL`. The default `npm test` suite remains file-backed and does not require PostgreSQL or Docker.

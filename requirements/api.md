# API & Data Endpoints Specification (Supporting Frontend Views)

## 1. Scope
Defines the required backend API contracts supporting the five core frontend views (Inbox, Job Detail, Applications, Dashboard, Setup) and local/remote test interoperability.

## 2. Endpoints by Domain

### 2.0 Session Role
- `GET /api/session`: Returns the current request role (`owner` or `guest`) for role-aware client navigation. It must not return the authenticated owner's email or other identity details.

### 2.1 Applications Management (`/api/applications`)
Supports Page 3 (Application Tracking / Kanban):
- `GET /api/applications`: List all applications with optional status filter (`?status=...`). Includes joined job posting metadata (title, company, location, salary).
- `GET /api/applications/:id`: Retrieve single application with full stage history timeline.
- `POST /api/applications`: Create a new application for an existing job posting (`job_posting_id`, `status`, `applied_at`, `next_action_date`, `user_notes`).
- `PATCH /api/applications/:id`: Update application status, next action date, or notes. Automatically appends a new stage record to `stage_history`.
- `DELETE /api/applications/:id`: Delete an application.

### 2.2 Metrics & Reporting (`/api/dashboard/metrics`)
Supports Page 4 (Metrics & Funnel Dashboard):
- `GET /api/dashboard/metrics?startDate=...&endDate=...`:
  Returns structured discovery and conversion metrics:
  - Discovery funnel: `discoveredCount`, `filteredOutCount`, `recommendedCount`, `savedCount`, `dismissedCount`.
  - Application conversion: `appliedCount`, `recruiterScreenCount`, `interviewCount`, `offerCount`, `rejectedCount`.
  - Rates with explicit formulas: `recruiterScreenRate`, `interviewRate`, `offerRate`, `rejectionRate`.
  - Sample size flags: `isSmallSample` boolean (`true` if `appliedCount < 10`).
  - Source effectiveness breakdown: counts grouped by `source`.

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
- `PUT /api/search-profile`: Validate and persist active search criteria (target titles, salary minimums, excluded keywords, geofences) to the selected repository. (Owner only).
- `GET /api/profile` remains a legacy compatibility alias for retrieving the active search profile; new clients use `/api/search-profile`.

Remote resume sync and local resume upload persist the normalized structured resume and derived candidate profile to the same selected repository, regardless of source type. Local JSON seed files are not committed and are not production persistence targets.

## 3. Role-Based Access Control & Sanitization Rules

| Endpoint / Action | Owner Role (`owner`) | Guest Role (`guest`) |
| :--- | :---: | :---: |
| `GET /api/jobs` | Full access with user triage tags | Sanitized list (redacts user status, shows only market postings) |
| `GET /api/jobs/:id` | Full details, overrides, personal notes | Sanitized details (redacts overrides and personal status) |
| `PATCH /api/jobs/:id/status` | Permitted (saves/dismisses jobs) | **403 Forbidden** |
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
  - `GET /api/health` returns operational health and configured AI provider/tier telemetry without making billable probes.
  - AI conversation turn responses include the resolved role/tier telemetry after any owner retry. Guest responses expose only guest-tier status; guest 429s never activate owner failover or use owner keys/history.

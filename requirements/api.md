# API & Data Endpoints Specification (Supporting Frontend Views)

## 1. Scope
Defines the required backend API contracts supporting the five core frontend views (Inbox, Job Detail, Applications, Dashboard, Setup) and local/remote test interoperability.

## 2. Endpoints by Domain

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
- `PUT /api/candidate-profile`: Validate and persist updated user profile to `config/candidate_profile.json`.
- `POST /api/candidate-profile/sync-resume`: Fetch remote resume URL (e.g. GitHub Gist or personal website), validate JSON schema or trigger AI extraction, and auto-populate candidate profile fields (`skills`, `yearsExperience`).
- `POST /api/candidate-profile/upload-resume`: Upload local resume file (`.json`, `.md`, `.txt`, `.pdf`), parse structured JSON or run AI extraction, and update candidate profile data.

### 2.4 Search Criteria & Configuration (`/api/profile`)
Supports Page 5 (Setup & Profiles):
- `GET /api/profile`: Retrieve active search profile criteria.
- `PUT /api/profile`: Update active search profile criteria (target titles, salary minimums, excluded keywords, geofences). (Owner only).

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

## 4. Multi-Tier AI Assistant Endpoints (`/api/agent/*`)

- **Owner Chat (`POST /api/agent/chat`):**
  - Requires `role = 'owner'`.
  - Backed by owner Gemini keys with automatic failover (`GEMINI_API_KEY_FREE` -> `GEMINI_API_KEY_PRO`).
  - Injects full candidate context (real resume, bio, personal notes) from `config/candidate_profile.json`.
- **Guest Demo Chat (`POST /api/agent/guest-chat`):**
  - Open to `role = 'guest'`.
  - Backed strictly by `GUEST_GEMINI_API_KEY` (isolating owner quota).
  - Injects generic synthetic candidate persona (no real name, contact info, or personal notes).
- **AI Health & Provider Status (`GET /api/agent/provider-status`):**
  - Probes Free tier quota availability and returns current active provider (`free`, `pro_backup`, or `guest_tier`).

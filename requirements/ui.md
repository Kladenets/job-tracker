# Web Interface and Reporting Requirements

## Scope

Provide a local web interface for configuration, recommendation review, application tracking, and basic reporting. Mobile usability is desirable; desktop is the primary MVP layout.

## Required views

### Setup

- Candidate-profile editor.
- Search-profile editor for deterministic qualification rules, title aliases, salary tolerance, and screening preferences.
- Source configuration and manual URL import.
- AI provider status (TypeSafe AI / JEV and Google Gemini), selected models, active key tier, budgets, and fallback status.

### AI Engine Status & Key Telemetry

- **Owner View Telemetry:**
  - An unobtrusive status indicator in the header / agent control bar communicating the active engine state:
    - `AI Engine: Dev Mode (Development Key)` — when running locally or on staging.
    - `AI Engine: Online (Free Tier)` — when operating on the zero-cost primary key in production.
    - `AI Engine: Online (Pro Backup - Failover Active)` — when an HTTP 429 quota exhaustion has automatically switched the session to the paid pro backup.
    - `AI Engine: Simulated / Offline Mode` — when no API key is available or both tiers are exhausted.
  - **Failover Notification:** A subtle toast or banner when an HTTP 429 occurs: *"Free tier rate limit reached. Switched seamlessly to backup Pro tier."*
- **Public Guest View Telemetry:**
  - A clean, consumer-facing status indicator: `AI Assistant: Online` (or `AI Assistant: Capacity Reached` if the guest quota is exhausted).
  - All internal infrastructure terminology (`Free Tier`, `Pro Backup`, `Development Key`) is strictly hidden from guest visitors.
- **Security & Perimeter Boundary:**
  - Raw API keys or partial key strings must never be sent to the browser or displayed in logs, UI badges, or error messages.
  - No UI form fields or inputs for entering Gemini keys exist in the web client; configuration remains strictly server-side via environment variables.

### Discovery runs

- Start a run manually.
- Show run progress and stage counts (discovered, filtered out, screened with JEV).
- Show adapter, extraction, rate-limit, and AI errors with retry controls.
- Distinguish no results from an incomplete or failed run.

### Recommendation inbox

- Sort and filter by JEV fit outcome, JEV confidence score, company, date, workplace type, salary, availability, and review state.
- Support direct query filtering for missing attributes (e.g. unstated salary or location) via nullable fields.
- Direct actionable apply button: Launches direct ATS application link (`job_url_direct`) or canonical application URL.
- Expand an explanation showing JEV fit confidence details, rule outcomes (for filtered-out jobs), or triggering deep interactive analysis.
- Save, dismiss, upvote, downvote, override, or mark applied.
- Open the original posting and show when it was last checked.

The analyzer recommendation and job workflow status must be displayed as separate concepts. Marking a job applied creates or updates its application; it does not introduce an `applied` job status.

### Job detail

- Stored posting fields, normalized attributes, and original source values.
- Description and cited evidence.
- Direct actionable application URL button.
- Latest availability result, evidence, and check time.
- Deterministic filter audit details (exact rules and excerpts if filtered).
- Automated JEV fit classification and confidence score.
- **Interactive AI Agent Panel:** On-demand triggering of deep qualification gap breakdown, cover letter generation, and interview preparation.
- Feedback history (upvotes/downvotes with reasoning).
- Related application and artifacts.
- Possible duplicate warning.

### Application board/list

- Show applications grouped or filtered by current status.
- Add a manual application.
- Change status while recording event date and optional note.
- Track deadlines and free-form application or interview notes.
- Generate and review draft answers.

Adding a manual application must create a minimal user-entered job posting first so every application retains the same required relationship.

### Dashboard

At minimum display for a selectable date range:

- jobs discovered, analyzed, recommended, saved, and dismissed;
- applications submitted;
- recruiter-screen/callback rate;
- interview rate;
- rejection rate.

Offer rate, withdrawal rate, stage conversion, time in stage, source effectiveness, and detailed AI usage are later reporting enhancements rather than MVP release requirements.

Every metric must define its numerator, denominator, and date basis in the interface. Small samples should be labeled rather than presented as strong conclusions.

## Usability requirements

- Require confirmation for destructive actions and merges.
- Allow undo where practical for dismissals and status changes.
- Preserve filters and navigation state during review.
- Provide explicit loading, empty, partial, and error states.
- Make recommendation labels understandable without color.
- Support keyboard operation for the review queue.
- Do not expose raw secrets or sensitive candidate fields in logs or generic error messages.

## Modular Frontend Specifications

For page-by-page functional and non-functional specifications, refer to:
- [Frontend Architecture & Tech Stack](./frontend/tech-stack.md)
- [Page Specification: Recommendation Inbox](./frontend/page-inbox.md)
- [Page Specification: Job Detail & AI Assistant](./frontend/page-job-detail.md)
- [Page Specification: Application Tracking (Kanban/Board)](./frontend/page-applications.md)
- [Page Specification: Metrics & Funnel Dashboard](./frontend/page-dashboard.md)
- [Page Specification: Setup, Profiles & Discovery Runs](./frontend/page-setup.md)

## Acceptance criteria

- A user can go from URL import to recommendation review without using the CLI.
- A user can understand why a job was filtered or recommended.
- Updating an application stage immediately updates its timeline and derived metrics.
- The dashboard never counts a saved job as an application unless an application exists.
- AI-unavailable and crawl-partial states are clearly distinguishable from successful empty results.

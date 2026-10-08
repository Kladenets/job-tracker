# Page Specification: Setup, Profiles & Discovery Runs (`/setup`)

## 1. Functional Requirements

### 1.1 Candidate Profile & Structured Resume Engine
- Form interface to configure the user's primary qualifications with structured resume integration:
  - Full Name, Email, Current/Target Job Title, Years of Experience, Location, and Workplace Preference.
  - Core Technical Skills (tag input with auto-population from resume).
  - **Resume Source Management**:
    - Supports two distinct source types: `remote_url` (a URL serving JSON Resume JSON, e.g. GitHub Gist raw URL or personal website) and `file_upload` (JSON Resume `.json` only for MVP).
    - Non-JSON uploads (PDF, Markdown, plain text) are unsupported in the MVP and must be rejected rather than silently summarized or normalized.
    - Source is always editable via "Edit Source" / "Change Source" control regardless of current configuration.
    - Confirmation dialog required when switching source types (`remote_url` $\leftrightarrow$ `file_upload`) to prevent accidental configuration abandonment.
  - **Contextual "Sync Resume Now" Trigger**:
    - Strictly visible ONLY when the active resume source is `remote_url`. Completely hidden when source is `file_upload`.
    - Manual trigger only: no automated fetching on initial page load. Shows `last_synced_at` timestamp.
  - **Complete JSON Resume Standard Compliance**:
    - Compliant with the canonical **JSON Resume specification (`jsonresume.org`)**, ingesting and retaining all 13 standard schema sections: `meta`, `basics`, `work`, `volunteer`, `education`, `awards`, `certificates`, `publications`, `skills`, `languages`, `interests`, `references`, and `projects`.
    - **Projects Ingestion**: Ingests project portfolio items (including `name`, `description`, `highlights`, `keywords`, `startDate`, `endDate`, and live `url`), aggregating project technologies into the primary candidate skills graph.
  - **Two-Tier Bounded Resume Visualizer (Job Card Pattern)**:
    - **Tier 1 (Collapsed Scan Row ~72px):** Candidate name, current/target title, calculated years of experience, active source badge (`Remote Gist` vs `File: resume.json`), key skills overview, and expand/collapse trigger.
    - **Tier 2 (Expanded In-Depth Drawer):** Maximum height bounded (`max-h-96`) with clean internal scrolling. Renders structured work history timeline, project portfolio showcases (with links and tech tags), education, categorized skills, and optional raw JSON inspection.
    - Derived fields (`skills`, `yearsExperience`, `targetTitle`, `location`) auto-populate from the structured resume.
    - Simple and predictable UI without complex diff calculations.
  - **Additional Experience & Context (Unstructured Field)**:
    - Concise unstructured text field for side projects, upcoming certs, or context not present on the formal resume, directly incorporated by the AI agent for fit scoring, interview prep, and cover letter drafting.
  - Save button persisting changes via `PUT /api/candidate-profile` to the selected repository. PostgreSQL `user_profiles` is canonical when PostgreSQL is enabled; file-backed mode stores the record in its ignored local data file.
  - Remote sync and local upload both persist the normalized structured resume and derived candidate profile through the same repository. Local seed JSON files are optional, ignored by Git, and never runtime write targets.
  - Future non-JSON extraction must be a separate explicit owner action that presents extracted fields for review and requires confirmation before saving.

### 1.2 Search Profile & Deterministic Rules Editor
- Visual editor for the active repository-backed search profile (`GET/PUT /api/search-profile`):
  - Target Job Titles & Title Aliases.
  - Target Geographies with editable commute radius and buffer (e.g. Hybrid within 35 miles plus buffer of Doylestown, PA).
  - Workplace Type Preferences (Remote, Hybrid, Onsite checkboxes); unknown workplace/location data remains eligible rather than being inferred as disallowed.
  - Minimum Annual Salary Expectation.
  - Hard Excluded Keywords (e.g. `clearance required`, `C++`, `staff level`).
  - Save button validating and persisting updated search criteria to the selected repository. PostgreSQL `user_profiles` is canonical in PostgreSQL mode; file-backed mode persists locally for development/tests.

### 1.3 Source Adapters & Manual Job URL Ingestion
- **Active Source Health:** Status cards for configured adapters (`Greenhouse`, `Lever`, `JobSpy Scraper`).
- **Instant Single Job URL Importer:**
  - Input field to paste any direct job URL (Greenhouse, Lever, LinkedIn, Indeed).
  - "Fetch & Ingest" button that parses the job, extracts fields, runs deterministic filters, scores with JEV, and adds it to the repository.

### 1.4 Manual Discovery Execution Trigger
- "Run Discovery Pipeline Now" button:
  - Allows selecting target sources (e.g. Greenhouse, Lever, JobSpy).
  - Live execution progress indicator showing:
    - Discovery status (`Discovered: 15`, `Filtered Out: 4`, `JEV Evaluated: 11`).
  - Displays complete, partial, or failed status, per-source errors, actual positive-fit recommendation count, and a direct link to `/inbox` when any source succeeds.

### 1.5 System & AI Provider Health Overview
- Real-time status cards:
  - Database status: Active engine and actual PostgreSQL connectivity (`Connected`, `Unavailable`, or `Unknown`); file mode reports the file store as active rather than claiming PostgreSQL health.
  - AI System 1 (TypeSafe AI / JEV): Status (`Active` or `Simulated Scoring`).
  - AI System 2 (Google Gemini Interactions): Display exact resolved tier (`Development Key`, `Free Tier`, `Pro Tier`, or `Pro Backup` only during failover), configured/offline state, and actual failover status.

### 1.6 Guest Mode Boundary & Configuration Locking
- **Access Rule:** Strictly restricted to authenticated owner sessions (`role = 'owner'`).
- **Guest Presentation:** Hidden from guest navigation. A direct attempt to navigate to `/setup` redirects to `/inbox` in the route loader after session resolution; the setup page must not mount or request private profile/configuration data. The underlying candidate/search profile and discovery endpoints reject guest requests with `403 Forbidden` to ensure resume text, personal notes, and private configuration are never leaked.

## 2. Non-Functional Requirements

- **Form Validation:** Strict client-side and server-side schema validation using Zod schemas.
- **Unsaved Changes Guard:** Warn user before navigating away with unsaved profile edits.

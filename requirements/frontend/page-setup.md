# Page Specification: Setup, Profiles & Discovery Runs (`/setup`)

## 1. Functional Requirements

### 1.1 Candidate Profile Editor
- Form interface to configure the user's primary qualifications:
  - Full Name, Email, Current/Target Job Title.
  - Core Technical Skills (tag input, e.g. `TypeScript`, `Node.js`, `PostgreSQL`, `Docker`, `React`).
  - Years of Experience.
  - Resume Text / Bio Summary (used as context for the AI agent during qualification scoring and cover letter generation).
  - Save button writing changes via `PUT /api/candidate-profile`.

### 1.2 Search Profile & Deterministic Rules Editor
- Visual editor for `config/search-profile.ts`:
  - Target Job Titles & Title Aliases.
  - Target Geographies (e.g. Remote US, Hybrid within 35 miles of Doylestown, PA).
  - Workplace Type Preferences (Remote, Hybrid, Onsite checkboxes).
  - Minimum Annual Salary Expectation.
  - Hard Excluded Keywords (e.g. `clearance required`, `C++`, `staff level`).
  - Save button validating and persisting updated search criteria.

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
  - Displays summary upon completion with a direct link to review new arrivals in `/inbox`.

### 1.5 System & AI Provider Health Overview
- Real-time status cards:
  - Database status: Active engine (`PostgreSQL` vs `File Store`), connection latency.
  - AI System 1 (TypeSafe AI / JEV): Status (`Active` or `Simulated Scoring`).
  - AI System 2 (Google Gemini Interactions): Active tier (`✨ Free Tier` vs `⚡ Pro Backup`), failover status, and guest token health.

### 1.6 Guest Mode Boundary & Configuration Locking
- **Access Rule:** Strictly restricted to authenticated owner sessions (`role = 'owner'`).
- **Guest Presentation:** Hidden from the guest navigation bar. The underlying `GET/PUT /api/candidate-profile` endpoints reject guest requests with `403 Forbidden` to ensure candidate resume text and personal notes are never leaked.

## 2. Non-Functional Requirements

- **Form Validation:** Strict client-side and server-side schema validation using Zod schemas.
- **Unsaved Changes Guard:** Warn user before navigating away with unsaved profile edits.

# Page Specification: Job Detail & AI Assistant (`/jobs/:id`)

## 1. Functional Requirements

### 1.1 Job Posting Content & Provenance
- Display full cleaned posting description text with readable typography.
- Provenance header: Source badge (e.g. `greenhouse`, `lever`, `jobspy`), source posting ID, direct link to original posting, date discovered, and last availability check timestamp.
- Direct actionable "Apply Now" button launching the direct ATS or canonical application link.
- Display normalized attributes alongside original source text (e.g. normalized `$140k - $160k` alongside raw text `"Competitive compensation package depending on experience"`).

### 1.2 Deterministic Filter & Screening Audit Details
- If the job passed or was rejected during deterministic filtering, display an expandable **Audit Evidence** panel:
  - Exact rule names triggered (e.g., `title_keywords_match`, `min_salary_threshold`, `excluded_clearance_terms`).
  - Pass/Fail indicators and exact text excerpts extracted from the job description during the crawl.

### 1.3 Automated AI Fit Assessment (System 1 / JEV)
- Card displaying the automated JEV classification, confidence score, and rationale.
- Explicit feedback controls: Upvote / Downvote buttons with optional reason code dropdown (`title`, `seniority`, `compensation`, `skills`, `other`) and feedback notes.

### 1.4 Interactive Conversational AI Assistant (System 2 / Gemini)
- Integrated side-panel or full-width conversational tab.
- **Provider Status Indicator:** Displays active key tier (e.g. `✨ Free Tier`, `⚡ Pro Backup`, or `Demo Mode (Isolated Guest Quota)`).
- **One-Click Quick Actions:**
  - *"Analyze Fit & Qualification Gaps":* Triggers multi-turn deep qualification analysis.
  - *"Draft Tailored Cover Letter":* Generates a professional markdown cover letter.
  - *"Generate Interview Prep":* Generates role-specific behavioral and technical interview questions based on the posting.
- **Role Isolation & Persona Rules:**
  - **Owner Sessions:** Prompt includes the user's authentic resume text, skills, and personal notes. Powered by `GEMINI_API_KEY_FREE` (with automatic failover to `GEMINI_API_KEY_PRO` on rate limit 429).
  - **Guest Sessions:** Prompt uses a generic synthetic candidate persona (e.g. "Senior Software Engineer"). Powered exclusively by `GUEST_GEMINI_API_KEY` (isolating owner quota). All personal contact info, actual user notes, and real application history are completely omitted.
- **Persistent Multi-Turn Chat:**
  - Free-form chat input allowing user follow-up questions.
  - Conversations saved to database for owner; ephemeral in-memory session for guest visitors.

### 1.5 User Manual Overrides
- In-place editable fields for Title, Company, Location, Workplace Type, and Salary to allow correcting source parsing errors without wiping raw crawler data (Owner only; hidden/read-only for guests).

## 2. Non-Functional Requirements

- **Safe HTML & Markdown Rendering:** All descriptions and generated cover letters must be rendered via sanitized markdown without raw HTML injection risks.
- **Resilient AI State Handling:** If AI providers are unavailable or offline, display friendly informational banners with fallback analysis rather than generic error popups.
- **Draft-Only Boundary:** The UI must never imply or permit automated submission of applications to external job boards.

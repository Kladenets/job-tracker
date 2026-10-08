# Job Tracker Requirements

## 1. Product summary

Job Tracker is a private, local-first web application that discovers job postings, removes clearly unsuitable jobs with deterministic rules, uses an AI model to assess the remaining jobs, and tracks applications and outcomes.

The first release is a decision-support tool. It must not autonomously submit applications, contact employers, or represent the user.

## 2. Goals

1. Reduce the time spent finding relevant open positions.
2. Minimize AI cost by using a staged filtering pipeline.
3. Explain why each job was accepted, rejected, or recommended.
4. Maintain a reliable history of jobs, applications, questions, and outcomes.
5. Help draft application material using approved candidate information.
6. Capture recommendation feedback in a form that can support later personalization.

## 3. Non-goals for the MVP

- Broad, unrestricted crawling of the web.
- Circumventing robots.txt, authentication, CAPTCHAs, or source terms.
- Fully autonomous application submission.
- Automatically answering demographic, legal, compensation, or attestation questions.
- Training or fine-tuning a custom machine-learning model.
- Recording interviews or meetings.
- Multi-user public registration or multi-tenant billing (the app is private single-user).
- Guaranteeing that a posting or extracted fact is accurate or current.

## 4. Users and operating assumptions

- The MVP has one user and can run locally on that user's computer or hosted privately as a serverless container (Google Cloud Run behind Cloudflare Access; see `requirements/auth.md`).
- The user owns and controls all candidate-profile and application data.
- PostgreSQL is the system of record (running locally or via managed database like Supabase/Neon).
- The application uses a unified backend architecture for ingestion, scraping with JobSpy, and PostgreSQL storage, with an interactive web interface.
- Gemini is the first AI provider, accessed through `@google/genai`, but domain code must not depend directly on Gemini response types.
- Provider limits and pricing vary by model, project, and date. They must be configurable and observed at runtime; the product must not assume a fixed free-tier allowance.

## 5. MVP user journeys

### 5.1 Configure a search profile

The MVP user can define:

- desired and excluded job titles;
- candidate skills used as JEV context, plus hard-excluded title keywords (skills are not hard gates in the MVP);
- minimum annual compensation, tolerance, and whether missing salary is allowed;
- permitted locations, commute constraints, and remote/hybrid/on-site preferences;
- excluded seniority levels and maximum posting age;
- work-authorization sponsorship and explicit citizenship/clearance exclusions;
- excluded companies.

Employment-type filters, preferred companies/industries, configurable weights, and required/preferred-skill hard gates are deferred until their data semantics, UI, and deterministic/JEV behavior are specified and tested. They must not be presented as active controls in the MVP.

### 5.2 Discover jobs

The user can:

- import a job by URL;
- configure supported source adapters;
- run discovery manually;
- optionally schedule discovery locally;
- see ingestion failures without losing the rest of a run.

### 5.3 Review recommendations

For each job, the user can see:

- stored job facts and source URL;
- whether the posting appears open;
- deterministic filter results;
- an AI fit score and confidence;
- matched qualifications, gaps, concerns, and unknowns;
- the evidence used for each material conclusion;
- AI model and analysis schema or prompt version;
- recommendation status: recommend, consider, or reject.

The user can save, dismiss, upvote, downvote, or override the recommendation and optionally provide a reason.

### 5.4 Track an application

The user can create an application from a discovered job or manually, update its stage, record dates and notes, and retain a timeline of status changes.

### 5.5 Draft application content

The user can ask the agent to draft or refine an answer using the selected job, candidate profile, approved resume content, and prior approved answers. Drafts must identify assumptions and require user review.

## 6. System pipeline

```text
sources/manual URL
  -> fetch and extract
  -> normalize and deduplicate
  -> deterministic hard filters
  -> deterministic binary hard filters
  -> JEV fit classification and confidence ranking
  -> AI analysis for eligible jobs
  -> recommendation and user review
  -> application tracking
  -> feedback/event history
```

AI must not be used for checks that can be performed reliably with normalized fields and explicit rules. Regex is useful for extraction and obvious terms, but the filtering layer should also use normalized values, aliases, and bounded heuristics so that wording variations do not silently discard good jobs.

## 7. Requirements map

- [Crawler and lifecycle](requirements/crawler.md)
- [AI job analyzer](requirements/job-analyzer.md)
- [Data model and persistence](requirements/data.md)
- [Application assistant agent](requirements/application-agent.md)
- [Web interface and reporting](requirements/ui.md)
- [Feedback and future learning](requirements/feedback-learning.md)
- [Architecture and operations](requirements/architecture.md)

## 8. Cross-cutting requirements

### 8.1 Explainability and provenance

- Store the source URL, retrieval time, raw-content hash, and extracted evidence for every imported posting.
- Every automated decision must record the rule or analysis version that produced it.
- An AI conclusion about salary, location, eligibility, or qualifications must include supporting text or be marked unknown.
- User overrides always take precedence in the UI and must not erase the original automated result.

### 8.2 Privacy and safety

- Keep candidate and application data in the user's private persistence repository. PostgreSQL is canonical when configured; the file-backed repository is for local development and tests.
- Candidate-profile, structured-resume, and search-profile JSON seed files are local-only, ignored by Git, and excluded from production images. Runtime writes go through the selected repository.
- Never commit API keys, resumes, generated application content, or the database.
- Explicitly show what content will be sent to an AI provider before enabling AI features.
- Send only the minimum candidate data needed for a task.
- Treat job-page content as untrusted data, not instructions. Content from a posting must never grant tools or change agent policy.
- Any future browser automation must require user approval before consequential actions; submission is outside MVP scope.

### 8.3 Reliability

- Ingestion, extraction, filtering, AI analysis, and status checks must be independently retryable.
- Runs must be idempotent: retrying must not create duplicate jobs, analyses, or applications.
- Failed AI analysis must leave the normalized job available for manual review.
- Source requests and owner AI usage must use configurable concurrency, retry with backoff and jitter, and owner-tier daily request/token budgets. Public guest chat uses a separate provider key; the MVP intentionally applies no application-level guest request/token budget and relies on the provider's quota for that key.

### 8.4 Observability

Each pipeline run must report:

- sources attempted and jobs discovered;
- duplicates detected;
- jobs rejected by each deterministic rule;
- jobs sent to AI and skipped because of budget;
- token/request usage when reported by the provider;
- failures by stage and retry status;
- total duration.

### 8.5 Accessibility and quality

- Core workflows must be keyboard-accessible.
- Status and recommendation meaning must not rely on color alone.
- Dates, money, and locations must preserve source values alongside normalized values.
- Critical scoring, deduplication, transition, and permission logic must have automated tests.

## 9. MVP acceptance criteria

The MVP is complete when the user can:

1. Create a candidate profile and at least one search profile.
2. Import jobs by URL and through at least one source adapter.
3. Run a pipeline that deduplicates, filters, scores, and selectively analyzes jobs.
4. Review evidence-backed recommendations and record feedback.
5. Track applications and their stage history.
6. View basic funnel and outcome statistics.
7. Generate a draft answer without permitting the agent to submit it.
8. Recheck posting availability without relying only on HTTP `HEAD`.
9. Export the user's core data in a documented machine-readable format.
10. Operate without AI when no key or budget is available, with reduced functionality clearly shown.

## 10. Delivery phases

### Phase 1: foundation

- Project setup, local PostgreSQL, schema migrations, candidate/search profiles, manual job entry, and application tracking.

### Phase 2: discovery funnel

- One source adapter, URL import, normalization, deduplication, deterministic filters, status checks, and run reporting.

### Phase 3: AI analysis

- Provider abstraction, structured job analysis, prompt/version tracking, budgets, and evaluation fixtures.

### Phase 4: assistance, dashboard, and private access

- Draft-only application agent, review queue, metrics, exports, private serverless deployment (Cloud Run), and zero-trust perimeter controls (`requirements/auth.md`).

### Later

- Additional adapters, browser-assisted form filling, semantic retrieval, email/calendar imports, and learned ranking.

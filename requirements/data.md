# MVP Data Requirements

## Purpose

Define the information the MVP must retain without prematurely fixing the final database schema. The model is expected to evolve as real postings are processed and useful fields become clear.

## Persistence decision

- PostgreSQL is the MVP system of record and runs locally as part of the MVP environment.
- Stable, frequently queried values are stored as relational fields.
- Evolving crawler and analyzer results are stored as independently versioned `jsonb` documents.
- PostgreSQL is preferred over a document database because the product relies on status transitions, relationships, constraints, filtering, sorting, and reporting in addition to flexible posting data.
- The same logical model should support a future hosted PostgreSQL deployment.

## Modeling principles

1. A job posting is one MVP entity populated in two stages: crawler extraction and AI analysis.
2. Crawler observations and AI findings remain distinguishable. AI corrections do not erase what the crawler originally found.
3. Unknown, absent, and false are distinct values.
4. Preserve original source text when a normalized value is derived from it.
5. Validate each JSON document against its declared schema version before storage.
6. User-entered corrections take precedence in the UI without deleting automated values.
7. Do not create separate employer, technology, benefit, qualification, location, source-listing, or posting-snapshot entities for the MVP.
8. Promote data from JSON into relational fields or related entities only after actual query, validation, editing, or reporting needs justify it.

## Required entities

### Job posting

The job posting is the central record and must have a durable internal ID.

It must retain these stable values when available:

- source name and source-specific posting ID;
- source, canonical, and direct actionable application URLs;
- title and company as presented by the source;
- extracted description text and a content hash;
- posting and discovery dates;
- last fetch and availability-check dates;
- current posting availability;
- current job-review status;
- JEV automated fit classification (`jev_fit` boolean), confidence score (`jev_confidence` 0.0-1.0), and decision metadata;
- relational nullable columns for frequently filtered attributes (`location`, `workplace_type`, `salary_min`, `salary_max`, `currency`);
- created and updated timestamps.

#### Missing Fields and Nullability Policy
- Missing attributes (e.g. unknown salary, unlisted location, unspecified workplace type) must be stored as `NULL` in relational fields, representing genuine unknowns.
- No artificial `is_incomplete` flag is stored; queries and UI filters use standard SQL `IS NULL` / `IS NOT NULL` checks.
- Missing attributes must not trigger automatic filtering exclusions or negative assumptions.

#### Crawler data

The posting must retain a versioned crawler document containing first-pass extracted signals. Expected signals include, but are not limited to:

- raw and normalized location;
- remote, hybrid, or on-site status and restrictions;
- raw and normalized compensation;
- employment type and seniority;
- technologies and keywords;
- work-authorization or sponsorship language;
- equity, parental leave, and other detected benefits;
- deterministic filter rules evaluated and supporting evidence excerpts (for filtered-out postings);
- extraction confidence or unknown state where useful.

The crawler document is deliberately extensible. Adding an experimental extracted field must not require a relational schema change.

#### AI intelligence data

The posting retains versioned AI intelligence data across two tiers:

1. **JEV System-1 Fit Data (Automated Screening):**
   - `fit`: boolean recommendation;
   - `confidence`: numeric score from 0.0 to 1.0;
   - model version, execution latency, and normalized input snapshot hash.

2. **Interactive Agent Data (System-2 On-Demand Assistance):**
   - detailed qualification match and gap breakdown;
   - resume focus suggestions;
   - generated cover letter drafts and revisions;
   - interview and technical preparation notes;
   - model ID, prompt version, and token usage metadata.

The MVP retains the latest automated JEV evaluation and any user-initiated agent artifacts.

#### Deduplication

The system must prevent obvious duplicate postings using source ID and normalized URLs when available. Only those strong identifiers may automatically resolve to an existing posting. Similar title, company, location, or content may produce a duplicate warning but must not cause an automatic merge in the MVP.

<!-- Verification Requirement: Verify that canonical URLs saved across sources accurately identify duplicate jobs (including aggregator wrappers vs direct ATS links), and add test cases validating canonical URL normalization across edge cases. -->

### Job status

Job status represents the user's review workflow, not whether the source posting is open and not the application stage.

The MVP statuses are:

- `discovered`;
- `filtered_out`;
- `pending_analysis`;
- `recommended`;
- `reviewing`;
- `saved`;
- `dismissed`;
- `archived`.

The current status must be directly queryable. Once statuses can change, the system must also retain status changes with previous status, new status, time, reason when supplied, and whether the change was made by the crawler, analyzer, user, or system.

An analyzer recommendation and job status are separate values. The pipeline may move an eligible posting to `pending_analysis` and a positively recommended posting to `recommended`. An AI result of `consider` or `reject` must remain visible but must not be confused with an application outcome. The user may override the job's workflow status.

### Posting availability

Posting availability represents the source's apparent state:

- `unknown`;
- `open`;
- `closed`.

It must remain separate from job status. A saved or applied job may later have a closed posting.

### Application

An application belongs to a job posting. No application record means the user has not started applying. Adding an application manually first creates a minimal user-entered job posting, with crawler and analyzer data left unknown, and then associates the application with it.

The application must retain:

- current application status;
- application URL when different from the posting URL;
- applied date and next-action date when known;
- user notes;
- created and updated timestamps;
- extensible application data for fields discovered while application assistance is developed.

The MVP allows at most one application per posting. This constraint may be relaxed if a real reapplication workflow requires it.

Application statuses are:

- `preparing`;
- `applied`;
- `recruiter_screen`;
- `interviewing`;
- `assessment`;
- `offer`;
- `accepted`;
- `rejected`;
- `withdrawn`;
- `inactive`.

Every status change must retain the previous status, new status, effective time, and optional note. Updating current status and recording its history must be atomic. Status history is the source for conversion and time-in-stage reporting.

Application questions, draft answers, contacts, interview notes, and document references may initially live in the extensible application data. A concept should become its own entity when it is repeatable, independently edited, or needed for cross-application retrieval or reporting.

### Recommendation feedback

The MVP must support an explicit upvote or downvote on a job, with an optional reason and timestamp. Feedback may be retracted or replaced without erasing its history. The feedback must retain the recommendation value, score, model, and analyzer version shown when the vote was made.

Saving, dismissing, and applying are workflow events, not implicit votes. Future learning may use them as behavioral signals, but they must remain distinguishable from explicit preference feedback.

### Agent conversation and message history

The MVP supports multi-turn interactive conversational sessions between the user and the Tier 2 AI Agent.

Conversations are not rigidly bound 1-to-1 with a single job posting. Instead, conversations maintain a dynamic list of tagged `job_ids: string[]`. Whenever an agent tool retrieves, analyzes, or drafts content for a specific job, that job's ID is automatically appended to the conversation's tagged `job_ids`. This preserves conversational fluidity (allowing comparative discussions across multiple jobs) while enabling the UI to index and filter conversations by referenced jobs.

Each conversation entity retains:
- `id`: UUID primary key;
- `title`: human-readable title (auto-generated from first turn or user-editable);
- `job_ids`: array of referenced job posting UUIDs;
- `created_at` and `updated_at`: timestamps;
- `messages`: ordered message history:
  - `id`: message UUID;
  - `role`: `'system'` | `'user'` | `'assistant'`;
  - `content`: text of the message turn;
  - `tool_calls`: optional array of tool executions `{ name, call_id, arguments, result, is_error }`;
  - `created_at`: message timestamp.

Conversations are persisted in the PostgreSQL database (`conversations` and `conversation_messages` tables, or `conversations` with a `jsonb` messages array) and in the local disk store (`./data/conversations_store.json`).

### Candidate profile

The candidate profile must retain the approved information needed to assess jobs and draft truthful application content, including resume content, skills, experience, work preferences, location constraints, and work authorization where supplied.

The candidate profile and normalized structured resume are stored as validated JSONB records in PostgreSQL `user_profiles` (`candidate_profile` and `candidate_resume` keys), which is the runtime source of truth regardless of whether the resume came from a URL or local upload. Writes update the repository only. The file-backed repository supports local testing without PostgreSQL and persists profile records in its ignored local data store. Untracked local JSON seeds may initialize an empty repository, but are not committed or embedded in production images.

Before historical recommendation comparison or learned ranking is implemented, the system must preserve the candidate-profile state or hash used for each analysis.

### Search profile

A search profile defines discovery queries, title aliases, deterministic qualification rules, compensation thresholds, location/workplace preferences, and candidate summary context used for JEV automated screening.

The MVP stores this as a validated JSONB record in PostgreSQL `user_profiles` under `search_profile`; PostgreSQL is the runtime source of truth. The file-backed repository stores the same record locally for tests and development without PostgreSQL.

Expected search profile configuration:
- `id`: UUID and human-readable profile name (e.g., "Full-Stack Remote & Local Hybrid").
- `is_active`: boolean indicator of current active search profile.
- `discovery`:
  - `search_terms`: string array (e.g., `["Software Engineer", "Full Stack Engineer", "Frontend Engineer"]`).
  - `target_locations`: array of `{ location: "Doylestown, PA", radius_miles: 35 }`.
- `deterministic_filter_rules`:
  - `title`:
    - `target_titles`: string array with aliases.
    - `excluded_titles`: string array (e.g., `["intern", "unpaid", "director", "vp", "sales representative"]`).
  - `workplace`:
    - `allowed_types`: `["remote", "hybrid", "onsite", "unknown"]`.
    - `max_onsite_days_per_week`: number (e.g., 2 for hybrid tolerance).
    - `commute_radius_miles`: number (with built-in buffer, e.g., 35 miles + 15 miles buffer).
    - `missing_workplace_policy`: `allow` (retained as null, eligible for review).
  - `compensation`:
    - `min_salary_annual`: target minimum (e.g., $120,000).
    - `tolerance_percentage`: percentage below target before hard exclusion (e.g., 10%–15% tolerance window).
    - `missing_salary_policy`: `allow` (retained as null, never excluded).
  - `posting_age`:
    - `max_age_days`: maximum allowable posting age (e.g., 45 or 60 days).
  - `seniority`:
    - `preferred_levels`: `["mid", "senior", "lead", "unknown"]`.
    - `excluded_levels`: `["intern", "student", "director", "executive"]`.
  - `work_authorization`:
    - `requires_sponsorship`: boolean.
    - `exclude_us_citizenship_only`: boolean.
  - `companies`:
    - `excluded_companies`: string array (including blacklisted employers and staffing agencies).
- `jev_screening`:
  - `enabled`: boolean.
  - `min_confidence_recommend`: threshold confidence to highlight in inbox (e.g. >= 0.70).
  - `candidate_summary_key`: reference to active candidate profile snapshot.

### Crawl run

Each discovery run must retain:

- source and trigger;
- start, completion, and status;
- discovered, created, filtered, and queued-for-analysis counts;
- error count and a concise error summary.

### Background work

If crawling and analysis run asynchronously, queued work must survive application restarts. Each work item must have a type, status, idempotency identity, attempt count, schedule and execution times, and last error.

## PostgreSQL operational requirements

- Use a supported PostgreSQL major version consistently across development, test, and deployment.
- Provide a reproducible local database setup and persistent local storage.
- Apply version-controlled, forward database migrations.
- Apply required migrations as an explicit, documented startup or upgrade step and fail safely if migration fails.
- Enforce referential integrity and important uniqueness constraints in the database.
- Use transactions for status changes and other multi-record operations.
- Use `jsonb` for flexible documents that need to be queried.
- Add relational or JSON-path indexes for demonstrated product queries; initial indexes must cover:
  - source identity (`source`, `source_job_id`);
  - canonical URL (`canonical_url`);
  - job review status (`job_status`);
  - JEV fit confidence (`jev_confidence`);
  - application status (`application_status`);
  - discovery date (`discovered_at`);
  - frequently queried nullable filter fields (`location`, `workplace_type`, `salary_min`) to optimize filtering and missing-data queries (`WHERE salary_min IS NULL`, etc.);
  - queued-work scheduling and status.
- Provide documented backup, restore, and machine-readable export procedures.
- Default API tests use a fresh temporary file-backed repository and do not require PostgreSQL. They must not mutate developer profile/config files or a shared data store.
- PostgreSQL migration/repository integration tests are a separate opt-in suite and must use an isolated disposable PostgreSQL database, never a shared development database.

## Retention and deletion

- The MVP must define default retention for fetched raw content, generated drafts, and candidate documents before those data types are enabled.
- The user must be able to delete candidate documents and generated application content.
- Deleting a job with an application, feedback, or status history must require confirmation and must not leave orphaned records.
- Deletion behavior must be documented as cascade, retention, or anonymization for each dependent data type.

## Schema evolution criteria

A JSON value should become a relational field or related entity when one or more of these becomes true:

1. users frequently filter or sort by it;
2. it needs uniqueness, referential integrity, or strong validation;
3. it has multiple values with an independent lifecycle;
4. users edit it independently;
5. reporting repeatedly aggregates it across postings;
6. measured query performance requires a dedicated index or representation.

Avoiding all migrations is not a goal. Avoiding speculative structure is.

## MVP acceptance criteria

- A crawler can save a partial posting containing unknown fields.
- An analyzer can enrich or correct a posting without erasing crawler output.
- New experimental extraction fields can be added through a versioned JSON document.
- The UI can filter by current job status, application status, source, company, dates, recommendation, and available normalized fields.
- Job status, application status, and posting availability remain distinct.
- Application status changes update current state and append history atomically.
- Obvious duplicate source IDs or normalized URLs do not create repeated postings.
- Deleting a posting cannot silently orphan its application, status history, or feedback.
- The database can be initialized, migrated, backed up, restored, and exported using documented operations.

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
- source, canonical, and application URLs;
- title and company as presented by the source;
- extracted description text and a content hash;
- posting and discovery dates;
- last fetch and availability-check dates;
- current posting availability;
- current job-review status;
- crawler and AI scores when produced;
- created and updated timestamps.

#### Crawler data

The posting must retain a versioned crawler document containing first-pass extracted signals. Expected signals include, but are not limited to:

- raw and normalized location;
- remote, hybrid, or on-site status and restrictions;
- raw and normalized compensation;
- employment type and seniority;
- technologies and keywords;
- work-authorization or sponsorship language;
- equity, parental leave, and other detected benefits;
- rules or terms matched and their supporting excerpts;
- extraction confidence or unknown state where useful.

The crawler document is deliberately extensible. Adding an experimental extracted field must not require a relational schema change.

#### AI analysis data

The posting must separately retain a versioned AI-analysis document. Expected findings include:

- recommendation and confidence;
- verification or correction of crawler findings;
- required and preferred qualifications;
- responsibilities;
- benefits not captured by the crawler;
- matched candidate experience;
- gaps, concerns, and unknowns;
- concise recommendation rationale and supporting evidence.

The posting must also identify the analyzer provider, model, schema or prompt version, analysis time, relevant candidate/search-profile state or hashes, and usage metadata needed for correct result reuse, troubleshooting, and budget reporting.

The MVP may retain only the current analysis. When explicit feedback is recorded, it must capture enough of the recommendation context—at minimum its result, score, model, and analyzer version—to preserve what the user rated. Complete historical analysis records become required before model comparisons or learned ranking are implemented.

#### Deduplication

The system must prevent obvious duplicate postings using source ID and normalized URLs when available. Only those strong identifiers may automatically resolve to an existing posting. Similar title, company, location, or content may produce a duplicate warning but must not cause an automatic merge in the MVP.

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

### Candidate profile

The candidate profile must retain the approved information needed to assess jobs and draft truthful application content, including resume content, skills, experience, work preferences, location constraints, and work authorization where supplied.

The MVP may store this as a versioned, validated JSON document. Before historical recommendation comparison or learned ranking is implemented, the system must preserve the candidate-profile state or hash used for each analysis.

### Search profile

A search profile defines crawler terms, title aliases, exclusions, compensation and location constraints, preference weights, and thresholds for AI analysis.

The MVP may store this as a versioned, validated JSON document. The active profile must be identifiable, and the profile state or hash used for an analysis must be retained before reproducible evaluation or learned ranking is implemented.

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
- Add relational or JSON-path indexes only for demonstrated product queries; initial indexes must cover source identity, normalized URL, job status, application status, discovery date, and queued-work scheduling.
- Provide documented backup, restore, and machine-readable export procedures.
- Integration tests must run against an isolated PostgreSQL database rather than a different in-memory database engine.

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

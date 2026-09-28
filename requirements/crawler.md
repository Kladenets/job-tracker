# Crawler and Posting Lifecycle Requirements

## Purpose

Acquire postings from supported sources, preserve source evidence, normalize them into a common representation, and periodically determine whether they remain available.

## Source strategy

The MVP must support:

1. Manual URL import.
2. At least one source-specific adapter selected during implementation.
3. A common adapter contract so additional ATS or employer-site adapters do not alter downstream code.

A source adapter must expose:

- source identity and source-specific job ID when available;
- discovery of posting URLs or records;
- retrieval of content;
- extraction into the common job-posting input format;
- availability checking;
- source-specific rate and retry guidance.

The crawler must respect applicable source terms, robots directives, and reasonable request rates. It must not bypass authentication, bot controls, or CAPTCHAs.

## Functional requirements

### Discovery and retrieval

- Support manual and scheduled runs.
- Record the start, end, trigger, adapter, counts, and errors for each run.
- Apply per-domain concurrency limits, timeouts, retries, exponential backoff, and jitter.
- Identify itself through a configurable user agent where appropriate.
- Cache recent successful responses and avoid unnecessary refetches.
- Distinguish transient retrieval errors from permanent extraction failures.
- Retain a content hash and optionally raw HTML according to the configured retention policy.

### Extraction

Extract, when present:

- source job ID;
- canonical and source URLs;
- direct actionable application URL (`job_url_direct` or direct ATS application portal link);
- title and company;
- full description and plain text;
- date posted and application deadline;
- locations;
- remote, hybrid, or on-site language;
- compensation ranges, currency, and period;
- employment type;
- seniority;
- required and preferred qualifications;
- work authorization or sponsorship statements;
- application URL.

Each extracted field must retain one of: explicit value, inferred value with evidence, or unknown. Extraction confidence may be stored, but missing data must not be invented.

Prefer structured source data such as JSON-LD or an official API over DOM selectors. Source-specific selectors must be isolated in the adapter.

#### Actionable Application Links:
- Ingested postings must retain a directly actionable `application_url` in addition to the `source_url`.
- For aggregators (e.g., Indeed, Google Jobs), the crawler captures `job_url_direct` when present, which resolves to the employer's direct ATS (Greenhouse, Lever, Workday, etc.), enabling the user to directly click and apply.
- If a direct ATS URL is unavailable, `application_url` defaults to the verified posting URL where the application can be submitted.
- The `application` entity also retains its own `application_url` for post-submission tracking.

### Normalization

- Normalize URLs by removing known tracking parameters while retaining the original URL.
- Normalize compensation to comparable annualized values only when the conversion is valid; retain original values and assumptions.
- Normalize locations without discarding the source text.
- Map employment type, workplace type, and seniority to consistent values while retaining unknown and source values.
- Normalize whitespace and repeated boilerplate in descriptions.

### Deduplication

Use, in descending confidence:

1. source plus source job ID (`source` + `source_job_id`);
2. canonical application URL (`canonical_url` with tracking parameters stripped);

<!-- Verification Requirement: Verify that canonical URLs saved across sources accurately identify duplicate jobs (including aggregator wrappers vs direct ATS links), and add test cases validating canonical URL normalization across edge cases. -->

#### Verified Source Identifiers Recorded:
- **Greenhouse**: Numeric board job ID (e.g., `8556658002`) and requisition ID, paired with canonical board URL (`https://job-boards.greenhouse.io/{board}/jobs/{id}`).
- **Lever**: Stable posting UUID (e.g., `ac978161-6f46-4f6b-ad9e-a258e642751c`), paired with canonical hosted URL (`https://jobs.lever.co/{company}/{id}`).
- **JobSpy / Aggregators**:
  - Indeed: Job Key `jk` (e.g., `indeed-998877` or hash ID) + normalized `indeed.com/viewjob` link.
  - LinkedIn: Job ID numeric string + normalized `linkedin.com/jobs/view/{id}` link.
  - Google Jobs: Google Job hash ID + direct URL.
- **Manual Import / Custom Agent Tool**: Canonical URL if supplied, or a fallback hash of `(company + title)`.

#### Resolution Behavior on Existing Match:
1. **Never Duplicate**: Do not re-insert the posting or assign a new internal UUID.
2. **Preserve User Workflow State**: If a job is already `filtered_out`, `saved`, `reviewing`, or `applied`, its review stage and application status are never overwritten by new crawl runs.
3. **Availability & Last-Seen Refresh**: Update `last_checked_at = NOW()` and refresh `availability = 'open'`.
4. **Content Change Detection**: Compare incoming text SHA-256 `content_hash` with stored `content_hash`. If changed, update `crawler_data` and trigger change notice without wiping prior extraction.

Only source-ID or normalized-URL matches may automatically resolve to an existing posting. Similar content, title, company, or location may produce a non-destructive duplicate warning but must not automatically merge records. The MVP does not require modeling one role separately from each discovered posting.

### Posting availability

Do not rely solely on HTTP `HEAD`. Many sites reject `HEAD`, return success for expired pages, or render status client-side.

Availability checks should use this order:

1. source API/status when available;
2. successful `GET` and source-specific closed/expired markers;
3. redirect and canonical URL behavior;
4. HTTP status as supporting evidence;
5. an inconclusive finding when evidence conflicts.

Store `open`, `closed`, or `unknown`, the evidence, check time, and consecutive failure count. An inconclusive finding maps to `unknown`; it is not a fourth availability state. A transient error must not close a posting. By default, mark closed only on explicit source evidence or repeated conclusive checks.

Suggested cadence:

- active recommendations and saved jobs: daily;
- unreviewed jobs: every few days;
- applied jobs: less frequently, unless a deadline is near;
- closed jobs: no routine checks unless manually requested.

## Deterministic prefilter

The deterministic prefilter acts as an inexpensive, rule-based qualification gate before automated AI screening. It filters out jobs that are definitively non-viable or outside search criteria, without attempting subjective soft scoring.

### Core Principles:
1. **Never Drop Discovered Data:**
   - Every discovered job posting from any source is persisted in the database.
   - Postings that fail hard filtering criteria are assigned `job_status: 'filtered_out'`. They remain fully searchable, filterable, and reviewable in the web interface.
   - The user can inspect why a job was filtered out, view the exact rule and evidence, and override the status to `saved` or queue it for AI review.
2. **No Arbitrary Deterministic Scoring:**
   - The system does not compute an artificial, subjective `deterministic_score`. Fit assessment is handled downstream by the fast TypeSafe AI (JEV) model.
   - The deterministic filter enforces definitive, binary qualification constraints only (`pass` vs `fail`).
3. **Missing Information Policy (Retain as Null / Unknown):**
   - Job postings frequently omit salary, remote policy, or exact locations.
   - Missing fields must be retained and represented as `NULL` in the database, treated strictly as unknowns.
   - Missing fields **must never trigger an exclusion**. A posting with missing salary or unstated workplace type is admitted to the candidate pool for JEV evaluation.
   - No separate `is_incomplete` flag is required; the UI and queries inspect nullable columns directly (`WHERE salary IS NULL`, etc.).
4. **Deliberate Tolerance & "Wiggle Room":**
   Real job descriptions are often negotiable or imprecise. The filter provides configurable flexibility:
   - **Workplace & Commute Boundaries:** Exclude only if the posting explicitly requires 100% on-site presence AND is located outside the configured commute radius (plus buffer, e.g. target + 15 miles). Unstated workplace or location is treated as unknown and preserved.
   - **Compensation Floor with Tolerance:** Exclude only when compensation is explicitly stated and the upper/provided bound falls completely below the configured floor minus tolerance (e.g., target minimum $120k with 15% tolerance = excludes only below $102k). Roles without listed compensation pass through.
   - **Keyword & Qualification Relevance:** Exclude jobs that match none of the designated title aliases or required core skill keywords (completely different domain), or match explicit negative title keywords.
   - **Excluded Titles & Seniority:** Exclude explicit non-viable titles (e.g., "Intern", "Director", "VP", "Sales Representative", "Unpaid").
   - **Posting Staleness:** Exclude postings older than a configured age threshold (e.g., posted > 45 or 60 days ago) or where the application deadline has conclusively passed.
   - **Work Authorization & Clearance:** Exclude only when the posting explicitly mandates citizenship, active security clearances, or states "No Sponsorship" when the user's profile requires it.
   - **Company & Agency Exclusion:** Exclude postings from user-blacklisted companies, third-party recruiters, or staffing agencies.
   - **Language Constraints:** Exclude postings where the job text is in an unread language.

### Externalized Configuration:
- Filter rules and thresholds must be externalized in code/settings configuration files (e.g., `config/search_profile.json` or YAML/Python settings module).
- The architecture must allow reading these settings cleanly at runtime so future UI-based configuration and KV persistence can update them without redeploying application code.

### Auditability & Re-execution:
- Every rule failure records: `rule_id`, `rule_name`, `passed: false`, and `evidence` (the specific text excerpt or normalized attribute matched).
- Stored under `crawler_data.matched_rules` in the database.
- The user can modify filter configurations in settings (and eventually through the UI) and trigger a batch re-evaluation against all stored postings at any time without re-crawling.

## Acceptance criteria

- Re-running the same source data does not create duplicate records.
- One bad posting does not abort a discovery run.
- A posting with a live HTTP URL but explicit "position filled" content is marked closed.
- A single timeout leaves availability unknown rather than closed.
- Jobs rejected before AI show the exact rules and evidence responsible.
- A source-specific extraction change requires tests using stored, sanitized fixtures.

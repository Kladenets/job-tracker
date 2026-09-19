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

### Normalization

- Normalize URLs by removing known tracking parameters while retaining the original URL.
- Normalize compensation to comparable annualized values only when the conversion is valid; retain original values and assumptions.
- Normalize locations without discarding the source text.
- Map employment type, workplace type, and seniority to consistent values while retaining unknown and source values.
- Normalize whitespace and repeated boilerplate in descriptions.

### Deduplication

Use, in descending confidence:

1. source plus source job ID;
2. canonical application URL;

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

The crawler pipeline must run cheap filters before AI analysis.

Hard filters may reject a job for explicit, confidently extracted conflicts such as:

- excluded title or employment type;
- location/workplace incompatibility;
- compensation definitively below the configured minimum;
- explicit authorization requirement the candidate cannot meet;
- excluded employer;
- posting already closed.

Soft signals contribute to a deterministic score rather than rejecting:

- title aliases;
- desired technologies and domains;
- seniority proximity;
- preferred compensation;
- remote preference;
- missing or ambiguous fields.

Regex and keyword matching must be configurable, case-normalized, tested, and capable of exclusions and aliases. Missing salary or remote information must normally be `unknown`, not an automatic rejection.

For every filtered job, store enough rule identity, matched evidence, and result data to explain the decision. The user must be able to rerun current rules against previously imported jobs.

## Acceptance criteria

- Re-running the same source data does not create duplicate records.
- One bad posting does not abort a discovery run.
- A posting with a live HTTP URL but explicit "position filled" content is marked closed.
- A single timeout leaves availability unknown rather than closed.
- Jobs rejected before AI show the exact rules and evidence responsible.
- A source-specific extraction change requires tests using stored, sanitized fixtures.

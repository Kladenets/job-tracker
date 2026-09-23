# Sources Architecture and Operational Specifications

This document defines the sources portfolio for Job Tracker, their access technologies, operational parameters, and error/rate management requirements.

---

## 1. Overview & Strategy

The ingestion pipeline uses a multi-tier sourcing strategy to balance broad national/global remote engineering coverage with targeted local hybrid roles within commuting distance of Doylestown, PA (Bucks County, Montgomery County, Greater Philadelphia, Central NJ).

All sources operate under strict requirements:
- 100% free / public access (zero paid subscription APIs or commercial scraping proxies).
- Respect source terms, robots directives, and reasonable rate limiting.
- Graceful isolation: failures or rate limits on one source must never halt or corrupt other sources or pipeline processing.

---

## 2. Source Classification by Access Technology

```
                          ┌─────────────────────────────┐
                          │   Job Ingestion Pipeline    │
                          └──────────────┬──────────────┘
                                         │
        ┌────────────────────────────────┼────────────────────────────────┐
        │                                │                                │
        ▼                                ▼                                ▼
┌─────────────────┐            ┌──────────────────┐             ┌──────────────────┐
│  Python Bridge  │            │  JSON / REST API │             │   RSS / XML      │
│    (jobspy)     │            │   (Zero-Auth)    │             │     Feeds        │
├─────────────────┤            ├──────────────────┤             ├──────────────────┤
│ - LinkedIn      │            │ - RemoteOK       │             │ - We Work        │
│ - Indeed        │            │ - Jobicy         │             │   Remotely       │
│ - Glassdoor     │            │ - Hacker News    │             │   (Full Stack,   │
│ - ZipRecruiter  │            │   "Who is        │             │    Frontend,     │
│ - Google Jobs   │            │    Hiring?"      │             │    Backend)      │
└─────────────────┘            └──────────────────┘             └──────────────────┘
```

---

## 3. Detailed Source Specifications

### Group 1: Python Scraper Bridge (`jobspy`)
Aggregates postings directly from major job platforms using public search interfaces without requiring paid recruiter accounts or developer API keys.

- **Member Targets:**
  - LinkedIn
  - Indeed
  - Glassdoor
  - ZipRecruiter
  - Google Jobs
- **Primary Operational Role:**
  - Primary engine for **Local Hybrid** opportunities (queries by target location `Doylestown, PA` / zip `18901` and configurable radius, e.g., 25–35 miles).
  - High-volume discovery for Remote Full Stack and Frontend positions.
- **Access & Invocation Model:**
  - Python package (`python-jobspy`) executed as an asynchronous background batch worker.
  - Parameterized by query (`"Software Engineer"`, `"Full Stack Engineer"`, `"Frontend Engineer"`), location, distance radius, and remote preference.
- **Operational Cadence & Rate Limits:**
  - Low frequency / paced batch runs (e.g., once or twice daily, or user-triggered manual discovery runs).
  - Concurrency caps and pacing between board requests to prevent IP rate limits.
- **Failure Modes & Resilience:**
  - Per-board failure isolation: if LinkedIn rate-limits or changes a DOM structure, Indeed/ZipRecruiter results must still succeed and be captured.
  - Returns raw structured records with status, execution duration, and error diagnostics per target board.

---

### Group 2: Public Zero-Auth REST / JSON APIs
Direct, highly structured HTTP JSON endpoints that require zero authentication credentials.

#### A. RemoteOK API
- **Endpoint:** `https://remoteok.com/api`
- **Focus:** Remote software engineering, frontend, full-stack, distributed systems.
- **Data Attributes:** Tags/skills, explicit salary ranges (min/max when present), location/region restrictions (e.g., US Only, Worldwide), full HTML description, apply URL.
- **Operational Cadence:** Every 6–12 hours or on manual trigger. Respects HTTP caching / conditional headers.

#### B. Jobicy API
- **Endpoint:** `https://jobicy.com/api/v2/remote-jobs?count=50&industry=tech`
- **Focus:** US-eligible remote tech postings.
- **Data Attributes:** Title, company, job type, geographic eligibility, description HTML, pubDate.
- **Operational Cadence:** Periodic batch query (daily / on-demand).

#### C. Hacker News "Who is Hiring?" (Algolia / Firebase API)
- **Endpoint:** Algolia Search API (`https://hn.algolia.com/api/v1/search_by_date?tags=story,author_whoishiring`)
- **Focus:** Monthly engineering threads (posted on the 1st of every month). Direct engineering leadership/founder posts without recruiter middlemen.
- **Data Attributes:** Raw text/markdown, direct email or custom apply links, tech stack details, explicit remote and location tags.
- **Operational Cadence:** High volume ingestion on the 1st–3rd of each month; infrequent polling thereafter.

---

### Group 3: XML / RSS Feeds
Curated, category-specific syndication feeds.

#### We Work Remotely (WWR)
- **Endpoints:**
  - Full-Stack: `https://weworkremotely.com/categories/remote-full-stack-programming-jobs.rss`
  - Front-End: `https://weworkremotely.com/categories/remote-front-end-programming-jobs.rss`
  - Back-End: `https://weworkremotely.com/categories/remote-back-end-programming-jobs.rss`
- **Focus:** High signal-to-noise curated tech positions.
- **Data Attributes:** Job title, company, publication date, GUID/link, category, HTML description.
- **Operational Cadence:** Hourly to daily polling. Utilizes `If-Modified-Since` and `ETag` headers to minimize redundant bandwidth.

---

## 4. Operational Ingestion Pipeline Requirements

1. **Deduplication:**
   - Primary: Match on `source` + `source_job_id`.
   - Secondary: Match on normalized canonical application URL (stripping UTM and tracking query parameters).
   - Flagging: Flag similar title + company pairs as potential cross-postings without destructive automated merging.

2. **Durable Ingestion Log:**
   - Every discovery run must log: `run_id`, `source`, `started_at`, `completed_at`, `status` (success/partial/failed), `jobs_discovered_count`, `jobs_new_count`, `jobs_duplicate_count`, and raw error output if any.

3. **Storage Pipeline Hand-Off:**
   - Raw postings from all sources normalize into a common schema before reaching the deterministic filtering stage and database persistence.

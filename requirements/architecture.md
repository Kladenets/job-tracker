# Architecture and Operational Requirements

## MVP operating model

The MVP runs locally as one product with background processing where needed. Crawling, filtering, AI analysis, application assistance, persistence, and the web interface must be independently testable and replaceable.

The system must cover these responsibilities without prescribing a directory structure:

- domain rules and status transitions;
- source adapters and extraction;
- normalization, deduplication, filtering, and ranking;
- provider-neutral AI analysis;
- interactive application assistance;
- PostgreSQL persistence and migrations;
- local web interface;
- scheduled and retryable background work.

Provider-specific, source-specific, and database-specific details must not leak into unrelated product behavior.

## Technology constraints

- Backend: Node.js with TypeScript and Express for the API and ingestion orchestration. Python is used only by the isolated JobSpy bridge.
- Database: PostgreSQL is the primary persistence engine; the repository interface also supports a local file-backed store for offline development.
- Client / Web UI: React 19 and Vite SPA served by the Express application in production and Vite middleware in development.
- AI Architecture (Two-Tier Model):
  - **Tier 1 (Automated Fit Classification & Screening):** TypeSafe AI (JEV model) using typed boolean `noul` decisions with confidence scoring.
    - References:
      - Guide: [The Ultimate Guide to JEV](https://medium.com/@unicodeveloper/the-ultimate-guide-to-jev-the-new-frontier-ai-for-faster-decisions-acd78e5f4c56)
      - Quickstart: [TypeSafe AI Quickstart Docs](https://docs.typesafe.ai/introduction/quickstart)
    - *Platform Resiliency Requirement:* Because new signups for TypeSafe AI / JEV may be temporarily paused, the system must provide a provider-abstracted fallback / simulation adapter to enable full local development, testing, and execution until active credentials are acquired.
  - **Tier 2 (Interactive Conversational Agent):** `@google/genai` / Google Gen AI SDK using the modern Interactions API with multi-turn tool calling (JSON Schema functions), fluid job tagging, and persistent conversation history for deep analysis, cover letter drafting, interview preparation, and database job search. Tested locally via interactive CLI REPL and HTTP API.
    - *Operational note (Future consideration):* While the Interactions API is the primary engine for the MVP, future iterations may evaluate a secondary fallback to standard `models.generateContent` with function declarations if provider outages or quota partitions require multi-endpoint redundancy. For MVP, outages are surfaced cleanly via offline/resilience notifications.
- Runtime validation: Zod schemas for API inputs, source records, and AI outputs at TypeScript boundaries.
- Testing: Automated unit, integration, and contract tests runnable through documented commands.

PostgreSQL access uses `pg` and versioned SQL migrations. The current MVP runs on Node.js; Bun compatibility is not a project requirement.

## Background work

Long-running crawling, availability checking, and AI analysis must be durable, idempotent, retryable, and independently observable. Restarting the application must not lose queued work or permanently strand work that was in progress.

Retries must be bounded. Work that exhausts its retries must enter a visible failed state that the user can inspect and retry. The implementation must recover abandoned in-progress work after an interrupted process without running it concurrently twice.

## Configuration

- Secrets come from environment variables or a local secret mechanism and are never returned to the browser.
- Candidate profiles, ingested structured resumes, search profiles, deterministic filter criteria, and non-secret preferences are persisted in PostgreSQL as validated JSONB profile records. PostgreSQL is the runtime source of truth.
- The file-backed repository provides the same profile API for local development and API tests without PostgreSQL. It persists to an ignored local data file; untracked local profile JSON files may seed an empty repository once, but are never runtime write targets or production image contents.
- Profile configuration is structured for runtime re-evaluation and UI management without code redeployment.
- Validate configuration at startup and degrade gracefully when optional AI credentials are absent.
- AI model IDs, budgets, timeouts, concurrency, retention, and crawl schedules are configurable.

## Local operation

- The supported runtime and PostgreSQL prerequisites must be documented.
- First-run setup must initialize configuration and the database through documented commands.
- Before listening in production, the server must probe and initialize the configured PostgreSQL repository. Missing or unavailable PostgreSQL must prevent production startup; production must never silently switch candidate/job data to the file repository. Development may fall back to the file repository when PostgreSQL is unconfigured or unavailable, and tests may explicitly force isolated file mode.
- The database must persist independently of disposable application processes or containers.
- Web and background processing must support clean startup and shutdown without corrupting active work.
- Repository initialization must apply unapplied version-controlled migrations transactionally before the web server or CLI uses PostgreSQL. A migration ledger and advisory lock must make startup repeatable and safe across concurrent app starts; missing migration files or a migration failure must fail startup before requests are served.
- The product must clearly report when PostgreSQL, the crawler, or the AI provider is unavailable.
- The application server must provide an operational health check endpoint (`GET /api/health`) that returns system uptime, process state, storage status, and AI configuration without triggering billable external calls or blocking application threads.

## AI usage controls

- Configure daily request and token budgets per owner provider/model. Guest chat uses an isolated provider key and has no application-level request/token cap in the MVP; provider-side quota remains the limit.
- Estimate input size before calls and reject or truncate according to an explicit policy.
- Record actual usage when available.
- Avoid duplicate calls using the posting content hash, relevant profile state or hash, prompt/schema version, provider, and model.
- Use bounded concurrency and retries; do not retry permanent validation or authentication failures.
- Provide a kill switch that disables all outbound AI calls.

## Security

- Bind locally by default and do not expose the service publicly without a separate authentication design.
- Restrict outbound HTTP to configured job sources and AI providers where feasible.
- Sanitize rendered posting HTML; prefer rendering extracted text.
- Manual URL imports must be restricted to safe HTTP(S) destinations and protected from access to local or private network resources. Importing from a previously unconfigured host requires explicit user confirmation.
- Remote resume sync accepts HTTPS on standard port 443 only, rejects credentials and local/private/reserved destinations, validates all DNS answers, and pins the connection to a validated public address. Redirects are handled manually, limited to five hops, and revalidated before each request; response bodies and request time are bounded.
- Redact secrets and sensitive personal fields from logs.
- Apply least privilege to agent tools and background workers.
- Keep dependencies locked and support routine vulnerability review.

## Testing

- Unit tests: normalization, rules, scoring, transitions, schemas, and permissions.
- Contract tests: each source adapter against sanitized fixtures.
- API tests: Run against an isolated temporary file-backed repository and do not require a PostgreSQL service.
- PostgreSQL integration tests: When run, use a real disposable PostgreSQL database and a separate opt-in command; never use a developer's shared database.
- AI evaluation tests: stored inputs and schema/evidence assertions; avoid requiring live calls in the default test suite.
- UI tests: primary import, review, feedback, and application workflows.

Live source and AI tests must be opt-in because they are nondeterministic and may incur rate limits or cost.

## Operational commands

Document commands for:

- install and configure;
- migrate the database;
- start web and worker processes;
- trigger discovery and availability checks;
- run checks and tests;
- back up and export data;
- inspect failed jobs;
- disable outbound AI calls.

## Architecture decisions to make before implementation

1. Web framework and rendering approach.
2. PostgreSQL query/migration library.
3. Runtime schema-validation library.
4. Local persisted-job scheduler.
5. First source adapter.
6. Gemini model selected after checking current availability, pricing, quotas, and structured-output support.
7. Raw posting and candidate-document retention policy.

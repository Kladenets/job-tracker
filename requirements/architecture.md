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

- TypeScript with strict compiler settings.
- Bun for package management and scripts unless a dependency requires another runtime.
- PostgreSQL for MVP persistence, running locally as part of the MVP environment.
- `@google/genai` as the initial model SDK behind an adapter.
- Runtime validation for external input, extracted data, tool parameters, and AI output.
- Formatting, linting, type checking, unit tests, and migration tests runnable through documented commands.

The exact web framework, PostgreSQL query/migration layer, scheduler, and validation library are implementation decisions. Select them through short architecture decisions after testing compatibility with Bun.

## Background work

Long-running crawling, availability checking, and AI analysis must be durable, idempotent, retryable, and independently observable. Restarting the application must not lose queued work or permanently strand work that was in progress.

Retries must be bounded. Work that exhausts its retries must enter a visible failed state that the user can inspect and retry. The implementation must recover abandoned in-progress work after an interrupted process without running it concurrently twice.

## Configuration

- Secrets come from environment variables or a local secret mechanism and are never returned to the browser.
- Non-secret preferences are stored in the database or a documented config file.
- Validate configuration at startup and degrade gracefully when optional AI credentials are absent.
- AI model ID, budgets, timeouts, concurrency, retention, and crawl schedules are configurable.

## Local operation

- The supported runtime and PostgreSQL prerequisites must be documented.
- First-run setup must initialize configuration and the database through documented commands.
- The database must persist independently of disposable application processes or containers.
- Web and background processing must support clean startup and shutdown without corrupting active work.
- Application upgrades must run documented migrations and fail without partially upgrading the database.
- The product must clearly report when PostgreSQL, the crawler, or the AI provider is unavailable.

## AI usage controls

- Configure daily request and token budgets per provider/model.
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
- Redact secrets and sensitive personal fields from logs.
- Apply least privilege to agent tools and background workers.
- Keep dependencies locked and support routine vulnerability review.

## Testing

- Unit tests: normalization, rules, scoring, transitions, schemas, and permissions.
- Contract tests: each source adapter against sanitized fixtures.
- Integration tests: PostgreSQL migrations/repositories and end-to-end pipeline stages against a real disposable PostgreSQL database.
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

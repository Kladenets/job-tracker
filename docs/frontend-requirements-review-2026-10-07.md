# Frontend Requirements Review: 2026-10-07

## Scope and Status

Reviewed the frontend implementation tracker and its related requirements for Chunks 1-7, comparing stated acceptance criteria with nearby implementation and tests. Chunk 8 requirements were refined but its browser audit and implementation work remain open. No application code was changed during this review.

The prior pre-production code-review snapshot remains untouched. This is a separate dated review record.

## Findings

### Chunk 1: Foundation and Design System

- **High - Browser owner credential in remote-testing instructions.** [tech-stack.md](../requirements/frontend/tech-stack.md) instructs the frontend to send `Authorization: Bearer <API_SECRET_KEY>`. [auth.md](../requirements/auth.md) defines that token as an owner credential for trusted automation. A Vite client bundle cannot keep it secret. The same workflow documents `VITE_API_URL`, but the client does not read that setting and currently uses relative `/api` requests, so the documented remote-server flow is not implemented as described. Specify Cloudflare browser authentication or a server-side proxy; reserve the bearer secret for trusted server-to-server automation.
- **Medium - Stack requirements do not match the installed foundation.** The spec names shadcn/Radix and React Motion, while the installed dependencies and component code do not establish those libraries as the implementation standard. Mark each choice as required, optional, or superseded, and identify the approved source of truth so agents do not install a second UI/animation system by assumption.
- **Medium - Theme application can flash.** The selected theme is applied from a React effect after the app renders, while the document starts with light tokens. Require applying the stored/system theme before first paint and verify a dark-preference first load.

### Chunk 2: Shell, Routing, and Navigation

- **Medium - Guest route/navigation behavior needs the Chunk 8 route matrix.** The route tree lacks `/jobs/:id`; owner/guest route decisions are not loader-enforced. Guest Showcase navigation is specified but absent from the current shell. The backend must remain the authority, and the client must wait for session resolution without mounting private pages or issuing private queries.
- **Requirements refinement applied - Mobile navigation.** The design-system matrix previously put AI in the bottom tabs, while the app provides AI in the top header and uses the bottom navigation for Setup. The requirements now specify owner Inbox/Applications/Metrics/Setup and guest Explore Jobs/Showcase, with AI as a global header action.

### Chunk 3: AI Dock and Conversations

- **Medium - Conversation list failures can look like an empty account.** Fetch errors are swallowed and leave the directory with no conversations, which is indistinguishable from a true empty state. Specify a separate error state and retry action.
- **Medium - In-flight response ownership is undefined.** The UI uses one shared message buffer and permits starting a new conversation during generation. Require each response to remain associated with its originating conversation, or explicitly lock switching/deletion/new-chat actions until the turn completes; test the selected behavior.
- **Medium - Conversation deletion lacks confirmation.** The dock exposes immediate deletion despite the global usability requirement to confirm destructive actions. Define confirmation, failure feedback, and behavior when deleting the active conversation.

### Chunk 4: Recommendation Inbox

- **High - Missing fit data is displayed as a fabricated 50% score.** The card fallback renders a numeric score when no JEV/AI score exists. Guest job DTOs intentionally omit fit data, so guests can see an invented score and misleading High Fit/Marginal filtering. Define an explicit unscored state and keep filters from inferring a recommendation.
- **High - Production filters diverge from their tests and contract.** High Fit/Marginal filtering does not consistently exclude dismissed jobs; the test implements separate filtering logic and therefore passes without exercising the page predicate. Require a shared tested filter function and cover every status/segment combination.
- **Medium - Inbox URL state and Apply semantics are underspecified in code.** Requirements promise validated, shareable filter state, but the page keeps filters only in component state. Also, “Apply” currently opens an external link while the spec says it queues an application; specify that opening a posting is not evidence of submission and that only explicit user confirmation records an application.

### Chunk 5: Application Tracking

- **High - Active/Archived classification is inconsistent.** The page duplicates status logic instead of using the canonical archive set: `offer` is counted in both segments, while `accepted` and `inactive` remain in Active. The current unit test tests the set independently and misses the page behavior. Use one shared predicate in the page and test it directly.
- **Medium - Applied-date semantics are not defined or preserved.** Manual creation supplies today's date even for `preparing`; changing a preparing application to `applied` does not set `applied_at`. Define when the timestamp is created, preserved, and edited so cards and date-filtered metrics agree with the stage.
- **Medium - Manual application creation is a two-request partial commit.** The page creates a job and then an application; if the second request fails, an orphan posting remains. Require an atomic server operation or a documented idempotent compensation strategy and test the failure between steps.

### Chunk 6: Dashboard and Metrics

- **High - Custom date query parameters are unvalidated.** Invalid date strings can throw during `toISOString()` in render; reversed ranges are not rejected. Require typed/validated route search state and a recoverable invalid-range state.
- **High - Custom end dates exclude most of the selected day.** The client converts a date-only end value to midnight and the backend applies an inclusive timestamp comparison. Define a timezone and inclusive-day or half-open interval convention, then test events at both boundaries.
- **Medium - The latency target has no scale or benchmark.** PostgreSQL metrics currently select all postings and applications before aggregation. Define a representative data volume and performance test for the `<50ms` target, or permit indexed server-side aggregation/pagination as data grows.

### Chunk 7: Setup, Profiles, and Discovery

- **High - Unsaved changes are not protected during SPA navigation.** The page only installs `beforeunload`; route changes inside the app can discard edits. Specify a router navigation blocker and decisions for save, discard, and cancel.
- **Medium - Search-profile scope is inconsistent.** Product requirements include skills, employment types, seniority, work authorization/sponsorship, preferred industries, and weights; the page spec/editor describes only a subset. Mark the omitted controls as deferred or add their UI and acceptance criteria so profile fields are not silently unsupported.
- **Medium - Discovery health/progress claims are stronger than the UI.** Adapter health cards are static, and the run handler waits for the completed response rather than showing per-source live progress. Define which states are real telemetry versus informational configuration, and whether progress is polling, events, or completion-only.
- **Medium - Successful discovery/import does not guarantee fresh Inbox data.** The success callbacks show a toast but do not invalidate the `['jobs']` query. With the configured query stale time, navigation may not show the newly imported postings. Require cache invalidation or an equivalent refresh on successful ingestion/run.
- **Medium - Profile load failures can render blank sections.** Non-403 query errors are not surfaced for candidate/search profiles. Require distinct loading, empty, and error/retry states.

## Chunk 8 Requirements Updated

The tracker now has three separate open gates: (1) role-route matrix and direct-navigation/session failure checks, including `/jobs/:id`; (2) WCAG 2.2 AA audit with explicit dialog, keyboard, form, contrast, announcement, and reduced-motion evidence; and (3) browser responsive checks at 320, 375, 768, 1024, 1280, and 1536 CSS-pixel widths. Related shell, design-system, dashboard, and setup requirements were aligned. Runtime behavior remains unchanged pending the later implementation pass.

## Validation

`git diff --check` passed after the requirements edits. The focused application page test passed but did not exercise the page's actual segment predicate. No browser E2E, accessibility, responsive, or PostgreSQL integration checks were run as part of this requirements review.

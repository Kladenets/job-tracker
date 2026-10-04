# Frontend Implementation Tracker

## Roadmap Overview

| Chunk | Module / Scope | Status | Deliverables / Notes |
|:---:|---|:---:|---|
| **1** | **Infrastructure & Design System Foundation** | ✅ **COMPLETE** | Vite + React 19 + Tailwind, CSS design tokens (`--surface-*`, `--status-*`), theme toggle, Express serving |
| **2** | **Root Shell, TanStack Router & Persistent Layout** | ✅ **COMPLETE** | `root-layout.tsx`, 2-state sidebar rail (14rem $\leftrightarrow$ 3.5rem), mobile bottom bar, zero-reload nav |
| **3** | **Persistent AI Assistant Dock, Multi-Conversation & Agent Tools** | ✅ **COMPLETE** | Docked 24rem pane, stable 384px inner container, split topbar button, autonomous naming tool, 2-level directory $\leftrightarrow$ thread view |
| **4** | **Recommendation Inbox (`/inbox`) & Job Cards** | ✅ **COMPLETE** | Sticky filter bar, 2-tier card, SVG arc ring, zero-pill typography, `@container`, keyboard triage (`j`/`k`/`s`/`x`) |
| **5** | **Application Tracking Board (`/applications`)** | ✅ **COMPLETE** | Dual Kanban + Table view, spring card physics, interview notes drawer, stage history timeline, add application modal |
| **6** | **Metrics & Funnel Dashboard (`/dashboard`)** | ✅ **COMPLETE** | Date range presets, custom range picker, monospace metrics, conversion rates, small-sample indicators (`N < 10`), source breakdown |
| **7** | **Setup, Profiles & Discovery Runs (`/setup`)** | ⏳ **NEXT UP** | Candidate profile editor, search rules, crawler health, manual URL ingestion, sync button feedback |
| **8** | **Role Security, Polish & E2E Verification** | ⏳ Pending | Owner vs Guest mode boundary enforcement, WCAG AA/AAA audit, responsive check, `npm run build` |

---

## Completed: Chunk 3 Deliverables
- [x] Locked inner container of `<AIDock>` to 384px to prevent text reflow during transitions.
- [x] Restored left rail footer badge to pure informational operational telemetry (`AI Engine: Free Tier`).
- [x] Built Split Top-Bar Trigger (`AITopBarButton`): Left button toggles remembered view with semantic status (🟢 / 🟠); Right button spawns new conversation (`+`).
- [x] Implemented autonomous `name_conversation` agent tool (`src/ai/agent/tools/name-conversation.tool.ts`) and integrated into `GeminiAgent`.
- [x] Expanded `ai-dock-store.ts` to manage multi-conversations, directory listing, active thread selection, deletion, and viewport persistence (`localStorage`).
- [x] Upgraded `<AIDock>` with Two-Level Viewport Navigation (View 1: Directory with job context pills & tool audit $\longleftrightarrow$ View 2: Active Chat Thread).
- [x] Enforced "Ask AI" on job cards to always trigger a new conversation tagged with the target job context.
- [x] Added connection status badges to both collapsed and expanded AI views with comprehensive test coverage.

---

## Completed: Chunk 4 Deliverables
- [x] Built **Two-Tier Job Card (`src/client/components/job-card.tsx`)**:
  - **Tier 1 (Collapsed Scan Row ~64px):** 36px circular SVG arc ring (`FitScoreArc`) displaying bold monospace fit percentage with semantic tokens (High Fit $\ge 70\%$ in mint/emerald, Marginal $40\%-69\%$ in warm amber, Filtered $<40\%$ in danger), zero-pill typography with clean middots (`·`), and triage button cluster (`Save`, `Dismiss`, `Apply Direct`, `Ask AI`).
  - **Tier 2 (Expanded In-Depth Drawer):** Expandable audit drawer displaying deterministic rule breakdown (Experience, Location, Salary), extracted technologies tags, clean posting snippet, provenance information, and direct ATS application action.
  - **Micro Container Queries:** Added `@container` to job cards to adapt dynamically between wide and narrow layouts when the AI dock is open or closed.
- [x] Built **In-Page Sticky Filter Bar (`src/client/components/sticky-filter-bar.tsx`)**:
  - Sticky header with `backdrop-filter: blur(8px)`, search input with `/` shortcut focus and 200ms debounce, live item counter (`Showing X of Y`), segmented quick toggles (`All Active`, `High Fit ≥70%`, `Marginal`, `Saved`, `Hidden`), sort dropdown (`Highest Fit`, `Newest Discovered`, `Salary`), and crawler sync trigger.
- [x] Built **Advanced Filter Popover (`src/client/components/filter-popover.tsx`)**:
  - Popover modal for secondary criteria: Workplace Type (`all`, `remote`, `hybrid`, `onsite`), Source Origin, Exclude Missing Salary, and Exclude Missing Location.
- [x] Built **Three Differentiated Empty States (`src/client/components/inbox-empty-state.tsx`)**:
  - `filter_mismatch`: FilterX icon, "No matching jobs found", reset filters CTA.
  - `inbox_zero`: CheckCircle2 icon, "You're all caught up!", run discovery CTA.
  - `empty_database`: Compass icon, "No jobs in repository yet", configure setup CTA.
- [x] Built **Content-Matched Skeletons (`src/client/components/inbox-card-skeleton.tsx`)**:
  - 4 animated skeleton rows mirroring real card geometry (36px circle pulse, title bar, metadata line, action buttons).
- [x] Built **Card-Level Error Boundaries (`src/client/components/card-error-boundary.tsx`)**:
  - Catches isolated card render failures without crashing the entire page feed, with in-place retry action.
- [x] Integrated **Fast Keyboard Triage & Ergonomics (`src/client/pages/inbox-page.tsx`)**:
  - `j` / `k` (or ArrowDown / ArrowUp): Navigate focused job card.
  - `s`: Toggle save / bookmark with optimistic UI update.
  - `x`: Dismiss job from queue with optimistic UI update.
  - `a`: Open direct verified ATS link.
  - `c` or `Cmd+K`: Open AI assistant pre-seeded with job context in a new conversation.
  - `Cmd+Z` / `Ctrl+Z`: Undo last triage action restoring card state.
  - Accessible toast notifications announcing triage and sync actions with polite screen reader announcement.
- [x] Guest mode protection enforcing view-only badge behavior for guest sessions.
- [x] Created unit tests in `src/client/pages/__tests__/inbox-page.test.ts` verifying all Chunk 4 requirements (100% passing).

---

## Completed: Chunk 5 Deliverables
- [x] Built **Dual View: Kanban Board & Table List (`/applications`)**:
  - Toggle between interactive column-based **Kanban Board** (`ApplicationKanban`) and structured **Table List** (`ApplicationTable`).
  - Supports all 8 pipeline lifecycle stages (`preparing`, `applied`, `recruiter_screen`, `interviewing`, `assessment`, `offer`, `rejected`, `withdrawn`/`inactive`).
  - Native drag-and-drop HTML5 API integration with visual drag feedback and drop column highlights.
  - Spring card physics transition styling (`stiffness: 220, damping: 24`).
- [x] Built **Application Card & Row Elements (`src/client/components/application-card.tsx`)**:
  - Company name, role title, and external direct link to job posting/portal.
  - Tabular monospace relative applied date (`"Applied 3d ago"`, `"Applied today"`).
  - Next Action Date badge with dynamic urgency formatting (Overdue in red, Due soon ≤2d in warm amber, Normal in subtle slate).
  - Stage dropdown selector for fast accessible triage and mobile accessibility.
  - Direct trigger to launch AI assistant interview prep pre-seeded with job context.
  - `@container` query integration for fluid column and row responsiveness.
- [x] Built **Application Details & Stage History Drawer (`src/client/components/application-details-drawer.tsx`)**:
  - Full-screen right slide-out modal with backdrop blur.
  - Interactive multi-stage pipeline status switcher.
  - Markdown-supported `user_notes` editor for interview debriefs and recruiter correspondence.
  - Next action deadline date picker and direct application URL editor.
  - Audit trail timeline visualizing historical stage transitions with timestamps and user notes.
  - Application deletion capability with optimistic UI cache updates.
- [x] Built **Manual Application Creation Modal (`src/client/components/add-application-modal.tsx`)**:
  - Dialog for entering applications for unlisted, offline, or external recruiter leads.
  - Automatically creates minimal underlying `UnifiedJobPosting` to preserve relational integrity before inserting application.
- [x] Integrated **Guest Mode Perimeter Defense (`requirements/frontend/page-applications.md section 1.6`)**:
  - Protected API endpoints (`GET /api/applications`, `GET /api/applications/:id`) with 403 Forbidden for `role = 'guest'`.
  - Built elegant UI privacy barrier card informing guest visitors that applicant data is private with a direct link to the public inbox.
- [x] Created unit tests in `src/client/pages/__tests__/applications-page.test.ts` verifying stage schemas, urgency math, segment filters, audit trail append, and guest security (100% passing).

---

## Completed: Chunk 6 Deliverables
- [x] Built **In-Page Sticky Filter Bar & Date Range Presets (`src/client/pages/dashboard-page.tsx`)**:
  - Top-mounted sticky filter bar with `backdrop-filter: blur(8px)`.
  - Date presets: `Last 7 Days`, `Last 30 Days`, `Last 90 Days`, `All Time`, and `Custom Range`.
  - Inline ISO date pickers for custom date range boundary queries.
  - Quick refresh button triggering live TanStack query invalidation without full-page reloads.
- [x] Built **Core Discovery Funnel Cards (`src/client/components/metric-card.tsx`)**:
  - Tabular monospace numbers with `@container` micro responsive font scaling.
  - Metrics: **Jobs Discovered** (raw crawl), **Passed Filtering / Recommended** (qualified yield), **Saved & Bookmarked** (shortlist), and **Jobs Dismissed** (unwanted).
  - Hoverable formula tooltips explaining calculation methodologies.
- [x] Built **Application & Interview Conversion Rates (`src/client/components/metric-card.tsx`)**:
  - Full 5-card conversion metric suite: **Applications Submitted**, **Recruiter Screen Rate**, **Interview Rate**, **Offer Rate**, and **Rejection Rate**.
  - Rate numerator / denominator badges (e.g. `(2 / 5)`).
  - Graceful zero-division handling (`0%` instead of `NaN` or crashes).
  - Bi-directional URL search parameter serialization (`?range=...&startDate=...&endDate=...`) for shareable, bookmarkable date filter states.
- [x] Built **Statistical Integrity & Small-Sample Indicators (`N < 10`)**:
  - Global warning badge in the header: *"Early Signal: Small sample size (N < 10 applications)"*.
  - Metric-level volatile signal tags to prevent over-indexing on early interview ratios.
  - Enriched calculation tooltips detailing exact formulas and current sample fractions.
- [x] Built **End-to-End Visualizer Funnel (`src/client/components/funnel-visualizer.tsx`)**:
  - Horizontal multi-stage progression visualizer connecting Crawl $\to$ Passed $\to$ Saved $\to$ Applied $\to$ Screen $\to$ Interview $\to$ Offer.
- [x] Built **Source Channel Effectiveness Table (`src/client/components/source-breakdown-table.tsx`)**:
  - Segmented telemetry table reporting Discovered, Recommended, Yield Rate, Applied, and Callback Rate per ATS adapter (`greenhouse`, `lever`, `jobspy_indeed`, `jobspy_linkedin`, `manual`).
  - Portfolio summary totals in table footer.
- [x] Enforced **Guest Mode Perimeter Defense (`requirements/frontend/page-dashboard.md section 1.6`)**:
  - Protected `GET /api/dashboard/metrics` with `403 Forbidden` for guest sessions.
  - Dedicated privacy barrier card in the UI explaining applicant privacy boundary with direct link to the public inbox.
- [x] Created unit tests in `src/client/pages/__tests__/dashboard-page.test.ts` verifying date math, conversion formulas, small-sample guards, source yield rates, and guest security (100% passing).



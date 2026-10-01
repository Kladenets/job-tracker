# Frontend Implementation Tracker

## Roadmap Overview

| Chunk | Module / Scope | Status | Deliverables / Notes |
|:---:|---|:---:|---|
| **1** | **Infrastructure & Design System Foundation** | ✅ **COMPLETE** | Vite + React 19 + Tailwind, CSS design tokens (`--surface-*`, `--status-*`), theme toggle, Express serving |
| **2** | **Root Shell, TanStack Router & Persistent Layout** | ✅ **COMPLETE** | `root-layout.tsx`, 2-state sidebar rail (14rem $\leftrightarrow$ 3.5rem), mobile bottom bar, zero-reload nav |
| **3** | **Persistent AI Assistant Dock, Multi-Conversation & Agent Tools** | ✅ **COMPLETE** | Docked 24rem pane, stable 384px inner container, split topbar button, autonomous naming tool, 2-level directory $\leftrightarrow$ thread view |
| **4** | **Recommendation Inbox (`/inbox`) & Job Cards** | ✅ **COMPLETE** | Sticky filter bar, 2-tier card, SVG arc ring, zero-pill typography, `@container`, keyboard triage (`j`/`k`/`s`/`x`) |
| **5** | **Application Tracking Board (`/applications`)** | ⏳ **NEXT UP** | Kanban + Table view, spring card transitions, interview notes drawer, stage history timeline |
| **6** | **Metrics & Funnel Dashboard (`/dashboard`)** | ⏳ Pending | Date range filter, monospace metrics, conversion rates, small-sample indicators (`N < 10`) |
| **7** | **Setup, Profiles & Discovery Runs (`/setup`)** | ⏳ Pending | Candidate profile editor, search rules, crawler health, manual URL ingestion, sync button feedback |
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

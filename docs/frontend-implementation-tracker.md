# Frontend Implementation Tracker

## Roadmap Overview

| Chunk | Module / Scope | Status | Deliverables / Notes |
|:---:|---|:---:|---|
| **1** | **Infrastructure & Design System Foundation** | ✅ **COMPLETE** | Vite + React 19 + Tailwind, CSS design tokens (`--surface-*`, `--status-*`), theme toggle, Express serving |
| **2** | **Root Shell, TanStack Router & Persistent Layout** | ✅ **COMPLETE** | `root-layout.tsx`, 2-state sidebar rail (14rem $\leftrightarrow$ 3.5rem), mobile bottom bar, zero-reload nav |
| **3** | **Persistent AI Assistant Dock, Multi-Conversation & Agent Tools** | ✅ **COMPLETE** | Docked 24rem pane, stable 384px inner container, split topbar button, autonomous naming tool, 2-level directory $\leftrightarrow$ thread view |
| **4** | **Recommendation Inbox (`/inbox`) & Job Cards** | ⏳ **NEXT UP** | Sticky filter bar, 2-tier card, SVG arc ring, zero-pill typography, `@container`, keyboard triage (`j`/`k`/`s`/`x`) |
| **5** | **Application Tracking Board (`/applications`)** | ⏳ Pending | Kanban + Table view, spring card transitions, interview notes drawer, stage history timeline |
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
- [x] Updated unit tests in `src/ai/agent/__tests__/agent.test.ts` and `src/client/shell/__tests__/ai-dock.test.ts` (100% passing).

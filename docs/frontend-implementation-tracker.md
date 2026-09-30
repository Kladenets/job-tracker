# Frontend Implementation Tracker

## Roadmap Overview

| Chunk | Module / Scope | Status | Deliverables / Notes |
|:---:|---|:---:|---|
| **1** | **Infrastructure & Design System Foundation** | ✅ **COMPLETE** | Vite + React 19 + Tailwind, CSS design tokens (`--surface-*`, `--status-*`), theme toggle, Express serving |
| **2** | **Root Shell, TanStack Router & Persistent Layout** | ✅ **COMPLETE** | `__root.tsx`, 2-state sidebar rail (14rem $\leftrightarrow$ 3.75rem), mobile bottom bar, zero-reload nav |
| **3** | **Persistent Right AI Assistant Dock & Store** | ⏳ **NEXT UP** | Docked 24rem pane (`Cmd+K`), React Motion spring, Zustand store, unmounting-free streaming continuity |
| **4** | **Recommendation Inbox (`/inbox`) & Job Cards** | ⏳ Pending | Sticky filter bar, 2-tier card, SVG arc ring, zero-pill typography, `@container`, keyboard triage (`j`/`k`/`s`/`x`) |
| **5** | **Application Tracking Board (`/applications`)** | ⏳ Pending | Kanban + Table view, spring card transitions, interview notes drawer, stage history timeline |
| **6** | **Metrics & Funnel Dashboard (`/dashboard`)** | ⏳ Pending | Date range filter, monospace metrics, conversion rates, small-sample indicators (`N < 10`) |
| **7** | **Setup, Profiles & Discovery Runs (`/setup`)** | ⏳ Pending | Candidate profile editor, search rules, crawler health, manual URL ingestion, sync button feedback |
| **8** | **Role Security, Polish & E2E Verification** | ⏳ Pending | Owner vs Guest mode boundary enforcement, WCAG AA/AAA audit, responsive check, `npm run build` |

---

## Current Step Log: Chunk 1
- Install frontend dependencies (`react`, `react-dom`, `@tanstack/react-router`, `@tanstack/react-query`, `lucide-react`, `zustand`, `tailwindcss`, `@tailwindcss/vite`, `clsx`, `tailwind-merge`).
- Create `vite.config.ts` and `index.html`.
- Configure Express backend (`src/server.ts`) to serve Vite app in development and production.
- Setup `src/client/styles/globals.css` with locked OKLCH tokens, reduced motion overrides, and font definitions.
- Implement theme toggle utility (OS preference + localStorage persistence).
- Verify compilation and dev server execution.

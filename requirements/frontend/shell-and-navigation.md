# Frontend Shell, Navigation & AI Assistant Architecture

## 1. Scope & Core Objectives
Defines the persistent root layout shell, left navigation rail, page filtering contracts, and the persistent right AI assistant dock.

---

## 2. Persistent TanStack Router Root Shell (`__root.tsx`)

To eliminate wasteful full-page reloads and state destruction, the entire application shell is implemented as a persistent Root Layout Route in TanStack Router:

```text
Root Shell (__root.tsx)
├── Left Navigation Rail (Persistent, zero unmount on route change)
├── Main Workspace Container (<Outlet /> - ONLY this center viewport swaps)
│     ├── /inbox
│     ├── /applications
│     ├── /dashboard (Metrics)
│     ├── /setup
│     └── /jobs/:id
└── Right AI Assistant Dock (Persistent, zero unmount, streaming continuity)
```

### 2.1 State & Session Preservation Invariants
1. **Zero Flash of Navigation:** Moving between routes (`/inbox` $\rightarrow$ `/applications` $\rightarrow$ `/dashboard`) only swaps the inner `<Outlet />`. The left sidebar and right assistant dock maintain their DOM instances and React component state.
2. **AI Stream Continuity:** If an AI analysis, cover letter, or chat turn is actively streaming in the right dock and the user navigates between pages, **the stream does NOT abort, cancel, or re-render**.
3. **Scroll & Expansion Memory:** Sidebar expanded/collapsed state and active badge counts persist seamlessly across route changes.

---

## 3. Left Navigation Rail Specification

### 3.1 Two-State Ergonomics
1. **Expanded Mode (14rem / 224px wide):**
   - App Logo with active Environment Tag (`DEV :3000` / `STAGING` / `PROD`).
   - Primary Route Links with icons and labels:
     - `Recommendation Inbox` (with live unread badge count).
     - `Application Tracker` (Kanban board / list).
     - `Metrics & Funnel` (pipeline conversions & small-sample indicators).
     - `Setup & Configuration` (candidate profile, search rules, sources, health).
   - Bottom Footer:
     - Theme toggle (two-state Lea Verou button: *"Switch to Light/Dark Mode"*).
     - AI engine status badge (`✨ Free Tier` / `⚡ Pro Backup`).
     - Keyboard shortcut guide trigger (`?`).
2. **Collapsed / Rail Mode (3.75rem / 60px wide):**
   - Toggled via keyboard shortcut `[` (left bracket) or a toggle icon in the footer.
   - Text labels hide smoothly; icons remain centered with accessible tooltips on hover.
   - Maximizes horizontal space for dense tables, Kanban columns, and split-screen review.

### 3.2 Role-Aware Navigation Scoping
- **Owner Session (`role = 'owner'`):** Full access to all 4 tabs and full visibility into backend engine telemetry.
- **Guest Session (`role = 'guest'`):** Navigation is automatically scoped to `Explore Jobs` and `Showcase`. The routes `/dashboard` and `/setup` are blocked at the router loader level, and their links are omitted from the DOM.

---

## 4. In-Page Sticky Filter Bar Architecture

### 4.1 Page-Owned, Shell-Decoupled Contract
- **Isolation:** Filters and search controls are strictly owned and rendered by individual page components inside `<Outlet />`, NOT by the global shell.
- **Consistent Visual Pattern:** All primary data pages (`/inbox`, `/applications`, `/dashboard`) implement a standardized **Sticky In-Page Header Bar**:
  - Compact vertical footprint (~3rem / 48px height).
  - Sticky positioning: `position: sticky; top: 0; z-index: 10;` with backdrop blur (`backdrop-filter: blur(8px)`).
  - Keeps 100% of the center workspace available for the feed or table below.

### 4.2 Standard Layout Rhythm
```text
[ Search Input (/) 🔍 ] [ Showing 14 of 42 ]  |  [ Filter Segments: All | High Fit | Marginal ]  |  [ Filters (2) ⚙️ ] [ Sort ▾ ]
```
1. **Left:** Text search input (`/` shortcut) with a 200ms debounce and active item counter (`Showing 14 of 42 jobs`).
2. **Center:** High-frequency quick-toggle segmented buttons (instant optimistic response).
3. **Right:** Sort dropdown (`Highest Fit`, `Newest`, `Salary`) and an advanced "Filters (n)" popover button for secondary criteria (salary slider, source adapter, workplace type).

### 4.3 Type-Safe TanStack Router Search Params
All active filter state is bidirectionally serialized into URL search parameters validated with Zod. Deep links can be shared, bookmarked, or refreshed without losing filter state.

---

## 5. Right AI Assistant Dock Specification

### 5.1 Docking & Sizing Behavior
- **Desktop ($\ge 1280\text{px}$):** Persistent docked pane (~24rem / 384px wide). When toggled open via `Cmd+K` or `c`, the center workspace adjusts smoothly via CSS Grid (`grid-template-columns: auto 1fr auto`).
- **Sub-1280px Viewports:** Automatically converts from a docked split pane into an overlay sheet with backdrop blur.
- **Spring Physics:** Opening and closing uses React Motion (`stiffness: 220, damping: 24`).

### 5.2 Context Synchronization
- **Active Job Focus:** Clicking "Ask AI" on any job card or focusing a job updates `activeJobId` in client state.
- **Context Header:** Displays `📌 Context: <Job Title> @ <Company>`.
- The assistant automatically includes the active job posting and user resume in prompt context.
- Can be dismissed via `Cmd+K`, the header close button, or `Esc`.

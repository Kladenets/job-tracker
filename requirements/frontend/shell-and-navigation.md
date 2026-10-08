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
- **Owner Session (`role = 'owner'`):** Full access to Inbox, Job Detail, Applications, Dashboard, and Setup, plus owner-only engine telemetry.
- **Guest Session (`role = 'guest'`):** Navigation includes `Explore Jobs` (`/inbox`) and `Showcase` (`/applications`). Job details remain public but use the sanitized guest view. Dashboard and Setup links are omitted, and direct navigation redirects to `/inbox` from a route loader before those pages mount.
- **Role resolution:** Resolve the role from `GET /api/session` before role-protected route decisions. While it is pending, render a neutral loading state without owner-only data requests or a misleading guest-access message. If session resolution fails, fail closed to the guest route policy. Backend authorization remains authoritative for every API request.
- **Route contract:**

  | Route | Owner | Guest |
  |---|---|---|
  | `/` | Redirect to `/inbox` | Redirect to `/inbox` |
  | `/inbox` | Full recommendation workflow | Public curated jobs; mutations unavailable |
  | `/jobs/:id` | Full job detail and owner AI context | Sanitized public job detail and generic guest AI context |
  | `/applications` | Private application tracker | Locked portfolio showcase only; never request private application data |
  | `/dashboard` | Private metrics dashboard | Route-loader redirect to `/inbox` |
  | `/setup` | Private profile, rules, and discovery tools | Route-loader redirect to `/inbox` |

- Direct navigation, refresh, and in-app navigation must produce the same role-specific outcome. Unknown job IDs render a non-sensitive not-found state. The route tree must register every route in this table, including `/jobs/:id`.
- Guest navigation must expose both `Explore Jobs` and `Showcase` at desktop and mobile sizes. Owner-only destinations must not appear in guest navigation. The AI control is a global shell action, not a substitute for a route.

---

## 4. In-Page Sticky Filter Bar Architecture

### 4.1 Page-Owned, Shell-Decoupled Contract
- **Isolation:** Filters and search controls are strictly owned and rendered by individual page components inside `<Outlet />`, NOT by the global shell.
- **Consistent Visual Pattern:** All primary data pages (`/inbox`, `/applications`, `/dashboard`) implement a standardized **Sticky In-Page Header Bar**:
  - Compact vertical footprint (~3rem / 48px height).
  - Sticky positioning: `position: sticky; top: 0; z-index: 10;` with backdrop blur (`backdrop-filter: blur(8px)`).
  - Keeps 100% of the center workspace available for the feed or table below.

### 4.2 Two-Tier Layout Rhythm & Responsiveness
```text
Row 1: [ Search Input (/) 🔍 ] ────── [ Showing 14 of 42 ] ── [ 🔄 Sync ] ── [ ✨ AI ]
Row 2: [ ◄ Scrollable Presets: All Active | High Fit ≥70% | Marginal | Saved | Dismissed ► ] ── [ Filters (2) ⚙️ ] [ Sort ▾ ]
```
1. **Row 1 (Full-Width Search & Global Actions):**
   - Expands to the full width of the main center workspace.
   - Text search input (`/` shortcut) with 200ms debounce, clear `(X)` button, item counter, crawler `Sync` button, and top-bar AI trigger.
2. **Row 2 (Scrollable Segmented Presets & Secondary Criteria):**
   - **Horizontal Touch-Scrollable Chips:** Uses `overflow-x-auto`, `scrollbar-none`, and `touch-pan-x`. On mobile viewports (<768px) or when both side panels (navigation rail + AI dock) are open, preset chips can be swiped smoothly with zero text wrapping or button clipping.
   - **Secondary Controls:** Advanced "Filters (n)" popover button and Sort dropdown remain accessible on the right edge.

### 4.3 Type-Safe TanStack Router Search Params
All active filter state is bidirectionally serialized into URL search parameters validated with Zod. Deep links can be shared, bookmarked, or refreshed without losing filter state.

---

## 5. Right AI Assistant Dock & Multi-Conversation Architecture

### 5.1 Docking, Viewport & Sizing Stability
- **Desktop ($\ge 1280\text{px}$):** Persistent docked pane (~24rem / 384px wide). When toggled open via `Cmd+K`, `c`, or the top-bar button, the center workspace adjusts smoothly.
- **Tablet (768px–1279px):** Converts to an overlay drawer with backdrop blur; it must not shrink the center workspace.
- **Mobile (<768px):** Opens as a full-screen modal sheet with a visible drag handle. A labeled close button and `Esc` must also dismiss it; gesture dismissal is optional and must not be the only close method.
- **Spatial Anchoring & Anti-Reflow:** All internal chat feeds, conversation cards, and headers are locked to an inner fixed-width shell (`384px`), completely eliminating text reflow and wrapping jitter during slide transitions.

### 5.2 Two-Level Viewport Navigation
- **View 1: Conversation Directory (`dockView = 'list'`):**
  - Displays all saved conversations sorted by `updated_at DESC`.
  - Conversation card displays:
    - Automatically assigned topic title (or fallback) + relative timestamp.
    - Last turn snippet preview.
    - **Tagged Job Pills:** Mini pills displaying jobs referenced in the thread (e.g. `[Stripe: Sr. Staff...]`), truncating cleanly with a full tooltip on hover.
    - Conversation deletion control.
  - Top header: "AI Conversations" with `+ New Chat` action button and search bar.
- **View 2: Active Chat Thread (`dockView = 'chat'`):**
  - Smooth slide transition into the active conversation.
  - Header: `< Back` navigation arrow returning to the Directory + active title + `+ New Chat` quick button + close `X`.
  - Active job context banner (if pinned/tagged).
  - Streaming token feed, contextual quick prompts, and input box.

### 5.3 State & Viewport Memory
- **Owner Persistent Memory:** The dock state remembers across close/reopen and page reload:
  - `isOpen: boolean`
  - `dockView: 'list' | 'chat'` (if closed on the list view, reopening restores the list view).
  - `activeConversationId: string | null` (if closed inside an active conversation, reopening restores that exact thread).
- **Guest Demo Memory:** Guest chat has no server-side conversation record. The active guest thread is retained in client memory when the dock closes/reopens, and is cleared on page reload. It must never load or persist owner conversation IDs/history.
- **Split AI Top-Bar Button:**
  - **Left Half (Main Status Toggle):** Icon (`Sparkles`) with a semantic status circle badge (🟢 Solid Emerald = Ready; 🟠 Pulsing Amber = Generating/Streaming). Clicking toggles the dock open/closed preserving the remembered view.
  - **Right Half (Quick-New Spawn):** Icon (`Plus`). Clicking immediately opens the dock and starts a fresh conversation in View 2 (`startNewConversation()`).

### 5.4 Context Synchronization & "Ask AI" Contract
- Clicking `"Ask AI"` on any job card in the Recommendation Inbox **always spawns a new conversation** initialized with that specific job's context and opens the chat thread directly.
- The assistant automatically includes the active job posting and user candidate profile in its prompt context.
- Can be dismissed via `Cmd+K`, `c`, the header close button, or `Esc`.

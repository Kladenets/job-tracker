# Page Specification: Recommendation Inbox (`/inbox`)

## 1. Functional Requirements

### 1.1 In-Page Two-Tier Sticky Filter Bar
- **Sticky Header:** Renders directly inside the page viewport (`position: sticky; top: 0; z-index: 10`) with backdrop blur (`backdrop-filter: blur(8px)`) and resilient multi-panel responsive wrapping.
- **Row 1 (Full-Width Search & Global Controls):**
  - Full-width search bar expanding to available viewport space with `/` quick-focus shortcut, 200ms debounce, clear `(X)` button, live count (`Showing 14 of 42 jobs`), background crawler sync button, and AI Assistant button.
- **Row 2 (Touch-Scrollable Presets & Advanced Controls):**
  - **Horizontal Touch-Scrollable Chips:** Smooth swipeable preset filter buttons (`All Active` | `High Fit ≥70%` | `Marginal` | `Saved` | `Dismissed`) with `overflow-x-auto`, `scrollbar-none`, and `touch-pan-x` ensuring zero text clipping or squishing on mobile (<768px) and split-dock viewports.
  - **Secondary Controls:** "Filters (n)" popover button for secondary criteria (`Remote / Hybrid / Onsite`, `Missing Salary`, `Missing Location`, `Source Adapter`) and Sort dropdown (`Highest Fit`, `Newest Discovered`, `Salary`).
- **TanStack URL Serialization:** Validated via Zod schema; shareable deep links.

### 1.2 Two-Tier Job Card Layout & Presentation

#### Tier 1: Collapsed Scan Row (~4rem / 64px height)
- **Semantic Arc Percentage Ring:**
  - 36px circular SVG arc ring displaying bold monospace fit percentage centered inside (`87%`).
  - Semantic functional colors:
    - High Fit ($\ge 70\%$): `--status-recommended-fg` (accessible mint/emerald).
    - Marginal Fit ($40\% - 69\%$): `--status-marginal-fg` (accessible warm amber).
    - Low / Disqualified ($< 40\%$): `--status-danger-fg` / `--status-dismissed-fg`.
  - Accessible meter semantics (`role="meter"`, `aria-valuenow="87"`).
- **Zero-Pill Typography:** Clean unboxed text separated by subtle middots (`·`):
  `Senior Staff Systems Engineer · Stripe · San Francisco, CA (Remote US) · $185k – $225k · Posted 2d ago · Greenhouse`
- **Triage Button Cluster:**
  - `Save` (`s`) · `Dismiss` (`x`) · `Apply Direct` (`a`) · `Ask AI` (`c`).
  - Accessible tooltips indicating keyboard shortcuts.

#### Tier 2: Expanded In-Depth Drawer / Card (~12rem–16rem height)
- Toggled via row click, chevron, or `Space`/`Enter` key:
  - **Fluid Height Accordion Animation:** Animated using CSS grid transition (`grid-rows-[0fr]` to `grid-rows-[1fr]`, `opacity-0` to `opacity-100`, `300ms ease-out`).
  - **Deterministic Rule Audit:** Clear check/cross breakdown of qualification rules (✅ Experience $\ge 6$ yrs, ✅ Remote US, ⚠️ Salary unlisted).
  - **Extracted Tech Keywords:** Monospace skills tags (`TypeScript`, `Distributed Systems`, `PostgreSQL`).
  - **Role Overview:** Clean snippet of core responsibilities.
  - **Dismissed & Restore Actions:** Dismissed jobs in the Dismissed tab render with a `Restore` button (`RotateCcw`) to reinstate them back to the active recommendation queue (`job_status = 'discovered'`).
  - **Direct ATS Action:** Large primary button linking directly to verified `job_url_direct`.

### 1.3 Fast Triage Actions & Keyboard Ergonomics
- **Keyboard Shortcuts (Active Queue):**
  - `j` / `k` (or `ArrowDown` / `ArrowUp`): Next / previous job focus.
  - `s`: Save job (optimistic UI update, advances to `saved`).
  - `x`: Dismiss job (spring exit animation off-axis, removes from queue).
  - `a`: Trigger direct ATS link and queue application record.
  - `Cmd+Z`: Undo last triage action (card springs back into position).
  - `c` or `Cmd+K`: Open AI Assistant dock focused on active job.
- **Guest Mode Behavior:** In guest sessions, triage mutations (Save/Dismiss) display an informational badge (*"Demo mode: Actions are view-only"*).

### 1.4 Background Sync & Ingestion Feedback
- **Synchronous Sync:** When triggering a source crawl, the sync button shows a loading state without blocking the user.
- **On Completion:** TanStack Query invalidates cache (`['jobs']`); newly ingested jobs enter with a subtle React Motion spring entrance.
- **Toast Notification:** Accessible toast announces: *"Sync complete: 18 jobs processed, 12 new postings added."*

## 2. Non-Functional Requirements

- **Content-Matched Skeletons:** Initial load renders 4–5 skeleton rows matching real card geometry (36px circular pulse, title bar, metadata line, action buttons). Zero generic centered spinners.
- **Three Differentiated Empty States:**
  1. *Filter Mismatch:* Icon `FilterX`, *"No jobs match your active filter criteria"*, CTA: `Reset Filters`.
  2. *Inbox Zero:* Icon `CheckCircle2`, *"You're all caught up! Zero unreviewed jobs remaining."*, CTA: `Run Discovery Now`.
  3. *Empty Database:* Icon `Compass`, *"No job boards have been crawled yet."*, CTA: `Configure Sources in Setup`.
- **Card-Level Error Boundaries:** Unexpected rendering errors on a single job card catch locally (`⚠️ Unable to render this posting. [Retry]`), never crashing the entire page.
- **Micro Container Queries:** Job cards use `@container (max-width: 720px)` to adapt their internal layout when the AI dock opens/closes.
- **Performance:** Instant client-side filtering and sorting across cached jobs with zero visible lag (<16ms frame rate).

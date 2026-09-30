# Frontend Design System, Ergonomics & Architecture Foundation

## 1. Scope & Core Objectives
Defines the universal design tokens, color system, WCAG accessibility rules, responsive layout matrix, and interaction ergonomics across the entire Job Tracker web interface.

---

## 2. Color System & Contrast Guardrails (WCAG 2.1 AA/AAA)

### 2.1 Dual-Theme Architecture
- **Theme Modes:** Light and Dark modes supported via standard `.dark` CSS class on `document.documentElement` and `color-scheme: light dark`.
- **Theme Detection & Storage:**
  1. Default: Reads OS preference via `window.matchMedia('(prefers-color-scheme: dark)')`.
  2. Override: Persisted in `localStorage.getItem('job_tracker_theme')`.
  3. Toggle: Accessible two-state toggle button (Lea Verou model) displaying the action it performs (e.g., *"Switch to Dark Mode"* / *"Switch to Light Mode"*).

### 2.2 Semantic Design Tokens (OKLCH / CSS Variables)
All UI surfaces, borders, and typography derive strictly from global CSS custom properties:

```css
:root {
  /* Surfaces */
  --surface-base: #ffffff;
  --surface-elevated: #f8fafc;
  --surface-sunken: #f1f5f9;
  --surface-overlay: #ffffff;

  /* Text & Typography */
  --text-primary: #0f172a;    /* Contrast > 12:1 against base (AAA) */
  --text-secondary: #475569;  /* Contrast > 5.5:1 against base (AA) */
  --text-muted: #64748b;      /* Contrast > 4.5:1 against base (AA) */

  /* Borders & Dividers */
  --border-subtle: #e2e8f0;
  --border-strong: #cbd5e1;
  --border-focus: #2563eb;

  /* Functional Semantic Statuses (Never Rely on Color Alone) */
  --status-recommended-fg: #15803d;
  --status-recommended-bg: #dcfce7;
  --status-marginal-fg: #b45309;
  --status-marginal-bg: #fef3c7;
  --status-danger-fg: #b91c1c;
  --status-danger-bg: #fee2e2;
  --status-dismissed-fg: #64748b;
  --status-dismissed-bg: #f1f5f9;
}

.dark {
  /* Surfaces */
  --surface-base: #090d16;
  --surface-elevated: #111827;
  --surface-sunken: #030712;
  --surface-overlay: #1e293b;

  /* Text & Typography */
  --text-primary: #f8fafc;    /* Contrast > 14:1 against base (AAA) */
  --text-secondary: #cbd5e1;  /* Contrast > 7:1 against base (AAA) */
  --text-muted: #94a3b8;      /* Contrast > 4.5:1 against base (AA) */

  /* Borders & Dividers */
  --border-subtle: #1e293b;
  --border-strong: #334155;
  --border-focus: #3b82f6;

  /* Functional Semantic Statuses */
  --status-recommended-fg: #4ade80;
  --status-recommended-bg: #052e16;
  --status-marginal-fg: #fbbf24;
  --status-marginal-bg: #451a03;
  --status-danger-fg: #f87171;
  --status-danger-bg: #450a0a;
  --status-dismissed-fg: #94a3b8;
  --status-dismissed-bg: #1e293b;
}
```

### 2.3 WCAG Guardrails
1. **Never Color Alone:** Every semantic status (e.g. Recommended, Marginal, Filtered Out) combines the color token with a text label and functional Lucide icon (`CheckCircle2`, `AlertCircle`, `XCircle`).
2. **Strict Contrast Compliance:** Normal body text $\ge 4.5:1$ (exceeds $7:1$ AAA). Semantic status indicators $\ge 4.5:1$ AA certified.
3. **Interactive Focus States:** High-visibility 2px solid `--border-focus` with 2px offset (`:focus-visible` only; zero focus rings on mouse click).

---

## 3. Spacing Scale & Typography Math

### 3.1 Rem-Based Token Foundation
All spacing is defined in `rem` units (scales dynamically if the user modifies browser font size):
- Small gaps/insets: `--space-0-5` (0.125rem), `--space-1` (0.25rem), `--space-2` (0.5rem), `--space-3` (0.75rem).
- Component containers: `--space-4` (1.0rem), `--space-5` (1.25rem), `--space-6` (1.5rem).
- Layout sections: `--space-8` (2.0rem), `--space-10` (2.5rem), `--space-12` (3.0rem), `--space-16` (4.0rem).

### 3.2 Typography Pairings
- **Headings & Body Content:** Clean sans-serif (`Geist Sans`, `Inter`, or system sans).
- **Tabular Data & Transparencies:** Monospace font (`Geist Mono`, `SF Mono`) with `tabular-nums` for:
  - JEV fit scores & percentages (`87%`).
  - Compensation ranges (`$175k – $220k`).
  - Timestamps, dates, commit revisions, and technical requirement tags.

---

## 4. Animation Guidelines & React Motion Scope

### 4.1 React Motion (Spring Physics) Allocation
Physics-based spring animation (`stiffness: 220, damping: 24`) is strictly reserved for user-driven physical movements:
1. **Inbox Review Card Triage:** Slide-out on dismiss/save; spring elasticity re-entry on undo (`Cmd+Z`).
2. **AI Assistant Side Pane:** Tactile sliding and docking when opening/collapsing via `Cmd+K`.
3. **Kanban Board:** Smooth spring translation between stage columns (`applied` $\rightarrow$ `screening` $\rightarrow$ `interviewing` $\rightarrow$ `offer`).
4. **Card Expansions:** Spring height interpolation for rule audit disclosures.

### 4.2 Lightweight CSS Transitions
Micro-interactions use standard CSS transitions (120ms–180ms ease-out) on GPU-composited properties (`transform`, `opacity`):
- Button hover/active states.
- Dropdown opacity and subtle scale (`scale(0.98)` $\rightarrow$ `scale(1.0)`).
- Theme toggles (200ms ease-out color transitions).

### 4.3 Reduced Motion Safe (`prefers-reduced-motion: reduce`)
- When active, React Motion springs immediately bypass interpolation and jump to target coordinates.
- All CSS transitions are clamped to `0.001ms`.

---

## 5. Responsive Adaptations & Breakpoints

### 5.1 Macro vs. Micro Responsive Architecture
- **Macro-Layout (Viewport Media Queries):** Controls the outer shell (`__root.tsx`): whether the left navigation is an expanded sidebar, a slim icon rail, or a mobile bottom bar; and whether the right AI Assistant docks or slides over.
- **Micro-Components (CSS Container Queries `@container`):** Applied to Job Cards, Kanban Cards, and Stat Cards (`container-type: inline-size;`). Cards adapt their layout dynamically to their immediate parent width, ensuring cards wrap gracefully whether the AI assistant dock is open or closed.

### 5.2 Breakpoint Scale & Behavioral Matrix

| Breakpoint Tier | Viewport Width | Left Navigation Rail | Center Workspace | Right AI Assistant Interaction |
| :--- | :--- | :--- | :--- | :--- |
| **Wide Desktop (`2xl`)** | $\ge 1536\text{px}$ | Persistent Expanded (14rem / 224px) | Full 2-column or wide feed + Kanban board | **Docked Side-by-Side** (24rem / 384px persistent split pane) |
| **Standard Desktop (`xl`)** | $1280\text{px} - 1535\text{px}$ | Collapsible: Expanded (14rem) $\leftrightarrow$ Slim Rail (3.75rem) via `[` | Fluid single/dual-column feed | **Docked Side-by-Side** (toggled via `Cmd+K` or header action) |
| **Laptop & Tablet Landscape (`lg`)** | $1024\text{px} - 1279\text{px}$ | Compact Icon Rail (3.75rem / 60px) | Full-width workspace (~960px+) | **Slide-Over Sheet** with backdrop blur (does not squish center workspace) |
| **Tablet Portrait (`md`)** | $768\text{px} - 1023\text{px}$ | Slide-over navigation drawer via top header trigger | 100% width single-column feed | **Slide-Over Sheet** (swipe to dismiss) |
| **Mobile (`sm` & below)** | $< 768\text{px}$ | **Sticky Bottom Navigation Bar** (4 primary touch tabs: Inbox, Apps, Metrics, AI) | Single-column touch cards, 44px tap targets | **Full-Screen Modal Sheet** with gesture drag handle |

### 5.3 Mobile Ergonomics (WCAG 2.5.5)
- Sticky bottom navigation bar on screens $< 768\text{px}$ within the natural thumb sweep zone.
- Minimum interactive touch area of **44px $\times$ 44px** on touch devices.

---

## 6. Accessibility & ARIA Mandates

1. **Universal ARIA Rule:**
   - Every icon button must have a descriptive `aria-label` (e.g. `aria-label="Save Stripe job to bookmarks"`).
   - Toggles and accordions must declare `aria-expanded` and `aria-controls`.
   - Modals and drawers must lock focus, implement `role="dialog"`, `aria-modal="true"`, and `aria-labelledby`.
2. **Keyboard Navigation & Triage Shortcuts:**
   - `j` / `k` (or `ArrowDown` / `ArrowUp`): Next / previous item focus.
   - `s`: Save job.
   - `x`: Dismiss job.
   - `a`: Trigger direct apply action.
   - `Space` / `Enter`: Expand inline job details.
   - `c` or `Cmd+K`: Toggle AI Assistant pane.
   - `/`: Focus search input.
   - `Esc`: Close open drawers, modals, or blur active inputs.
3. **Screen Reader Announcements (`aria-live="polite"`):**
   - Background sync completion, triage status changes, and AI generation statuses announce politely to screen readers.

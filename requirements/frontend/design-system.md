# Frontend Design System, Ergonomics & Architecture Foundation

## 1. Scope & Core Objectives
Defines the universal design tokens, color system, WCAG accessibility rules, responsive layout matrix, and interaction ergonomics across the entire Job Tracker web interface.

---

## 2. Color System & Contrast Guardrails (WCAG 2.2 AA)

The MVP conformance target is WCAG 2.2 Level AA. AAA is not claimed as a site-wide target; any additional AAA criterion must be named and verified separately.

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
  --action-primary-bg: #2563eb;

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
  --action-primary-bg: #1d4ed8;

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
1. **Never Color Alone:** Every semantic status combines color with a text label or an accessible name; icons supplement meaning rather than replacing it.
2. **Contrast:** Normal text has at least 4.5:1 contrast; large text has at least 3:1. Meaningful control boundaries, focus indicators, and non-text graphics have at least 3:1 against adjacent colors. Filled primary actions use `--action-primary-bg` with white text and must retain at least 4.5:1 contrast in both themes. Verify every used foreground/background pairing; token names alone do not establish compliance.
3. **Interactive Focus States:** Keyboard focus is clearly visible, not obscured or clipped, and uses an indicator with at least 3:1 contrast against adjacent colors. Focus styling must remain visible on inputs and controls that reset their native outline.
4. **Keyboard and focus order:** All functionality is operable by keyboard, focus order follows the visual and task sequence, and no keyboard trap exists outside an intentionally modal interaction.
5. **Dialogs and drawers:** On open, move focus to an appropriate element; contain Tab/Shift+Tab within the modal; make background content inert; support Escape where cancellation is safe; and restore focus to the opener on close. Provide an accessible name and modal semantics.
6. **Forms and errors:** Every field has a programmatic label. Required state and validation errors are conveyed in text, associated with the relevant field, and announced when they appear.
7. **Status announcements:** Sync, triage, save, error, and AI-generation state changes are announced without unexpectedly moving focus.
8. **Bypass blocks:** Provide a keyboard-visible skip link before global navigation that moves focus to the main content.

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
| **Mobile (`sm` & below)** | $< 768\text{px}$ | **Sticky Bottom Navigation Bar** (owner: Inbox, Apps, Metrics, Setup; guest: Explore Jobs, Showcase). AI remains a global top-header action. | Single-column touch cards, 44px tap targets | **Full-Screen Modal Sheet** with gesture drag handle |

### 5.3 Mobile Ergonomics (44px Product Target)
- Sticky bottom navigation bar on screens $< 768\text{px}$ within the natural thumb sweep zone.
- Application target: interactive touch controls provide a minimum target area of **44px $\times$ 44px**. This is the product's ergonomic target, independent of the WCAG 2.2 AA minimum target-size criterion.
- Every owner destination remains reachable on mobile. The AI assistant is a global shell action, not a replacement for Setup navigation.

### 5.4 Responsive Verification Criteria
- Verify the application in a browser at viewport widths of **320, 375, 768, 1024, 1280, and 1536 CSS pixels**, in both themes, with the AI dock closed and open and with representative dialogs/popovers open.
- At each width, verify there is no unintended page-level horizontal scrolling, clipped text, overlapping controls, or inaccessible actions. Intentional horizontal scrolling is allowed for Kanban boards and wide data tables when the scroll region is usable by touch and keyboard and the surrounding page remains usable.
- Verify Inbox cards and filters, application Kanban and table, dashboard metrics/source table, setup forms, navigation, and AI dock. Include loading, empty, and error states where they materially change layout.
- Modal and drawer content taller than the viewport must scroll within the dialog or overlay so the final action buttons remain reachable above the mobile navigation; modal footers must not be clipped by the viewport.
- Verify reflow at 320 CSS pixels. Also verify at 400% browser zoom from a 1280 CSS-pixel viewport when browser tooling supports changing native zoom; if it does not, record the limitation and use a direct 320 CSS-pixel viewport as the equivalent responsive reflow check without claiming native zoom was tested. Content must remain readable and operable without loss of functionality, except for content that inherently requires two-dimensional layout and has an accessible alternative or bounded scroll region.

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

## 7. Chunk 8 Verification Evidence

- Run an automated accessibility scan (axe or equivalent) on the owner and guest versions of the Inbox and Job Detail, the owner Applications/Dashboard/Setup pages, the guest Applications showcase, and the shell with the AI dock open. Record findings and disposition; automated scans do not replace keyboard and screen-reader checks.
- Manually verify keyboard-only completion of the primary review workflow, route navigation, application stage editing, and profile editing. Verify dialog focus entry, containment, Escape behavior, and focus restoration.
- Verify contrast in both themes and responsive behavior against Sections 2 and 5.4. Record tested browser, viewport, role, theme, state, and any accepted exception before marking Chunk 8 complete.

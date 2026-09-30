# Job Tracker Architecture & Frontend Design Requirements

## 1. Overview
The Job Tracker web client provides a high-density, keyboard-first, auditable command surface for managing engineering job discovery, scoring, applications, and conversion metrics.

---

## 2. Core Frontend Design Contracts & Ergonomics

### A. The Header & Surface Elevation Contract
- **Standard Height:** All top-level header bars—including the navigation rail header (`<aside> > div:first-child`), sticky filter bars (`<main> > div:first-child`), and mobile top headers (`<header>`)—must strictly adhere to:
  ```css
  height: 3.25rem (h-13 / 52px);
  border-bottom: 1px solid var(--border-subtle);
  ```
- **Alignment:** Zero vertical offset between the left navigation rail header and the main workspace filter bar across desktop viewports (`>=768px`).

### B. The Collapsible Rail Spatial Anchoring Contract
- **Width Bounds:**
  - Expanded: `w-56` (14rem / 224px).
  - Collapsed: `w-14` (3.5rem / 56px).
- **Navigation Item Sizing & Animation:**
  - Expanded state width: `w-52` (208px).
  - Collapsed state width: `w-10` (40px) with `mx-auto` inside `px-2` container (`40px + 8px + 8px = 56px`).
  - Button height: Uniform `h-9` (36px) across all states.
  - Icon Anchor: Fixed `w-10 h-9 flex items-center justify-center shrink-0` across all items so icons remain anchored to the exact same screen coordinates during expand/collapse.
  - Label Transition: Text labels and shortcut badges must include `whitespace-nowrap` and transition via opacity (`opacity-0` / `opacity-100` duration-200) without wrapping or layout distortion.
- **Unified Header Toggle:**
  - A single toggle button manages collapse/expand.
  - Expanded: Right-docked `[PanelLeftClose]` (`right-2.5`).
  - Collapsed: Center-docked `[PanelLeft]` (`left-[0.625rem]`).
  - Logo/Title: In collapsed mode, the expand button replaces the logo. In expanded mode, "Job Tracker" and the `DEV :3000` environment badge take center stage.

### C. Component Dimension Symmetry
- Sibling controls in the sidebar footer and utility clusters (`ThemeToggle`, `HelpCircle`, navigation links) must share identical dimensions:
  - Width: `w-10` (40px).
  - Height: `h-9` (36px).
  - Radius: `rounded-md`.
  - Icon sizing: `h-4 w-4`.

### D. Mobile Safe-Area & Viewport Bounds Contract (<768px)
- **Top Header:** `<MobileTopHeader>` (`h-13`) displaying brand identity and `ThemeToggle`.
- **Bottom Navigation:** `<MobileNavBar>` (`h-14`) fixed to viewport bottom.
- **Scroll Container Safe Area:** The primary scroll container (`#main-content`) must enforce `pb-20 md:pb-0` to prevent content occlusion.
- **Responsive Stacking:**
  - Sticky filter bars must split into a two-tier layout (Search + counter on top, scrollable segments and filters below).
  - Job preview cards, audit summaries, and action button groups must use `flex-col sm:flex-row` with `break-words` and `min-w-0` to prevent horizontal clipping down to `360px` screens.

---

## 3. Keyboard Shortcuts Contract
- `[` : Toggle sidebar collapse / expand.
- `/` : Focus global search input.
- `?` : Open global keyboard shortcuts modal.
- `1` - `4` : Quick navigation between Inbox (`1`), Applications (`2`), Metrics (`3`), Setup (`4`).
- `s` : Save / queue active posting.
- `x` : Dismiss active posting.
- `Space` : Open / close full audit drawer.
- `Esc` : Close active drawer or modal.

---

## 4. Verification & Testing Checklist
For each development chunk containing client UI:
1. **Desktop Viewport (`1440px`):** Headers line up with pixel-perfect `h-13` matching borders; no horizontal scrollbar on root.
2. **Laptop Viewport (`1024px`):** Rail collapse transitions smoothly with zero icon jumping.
3. **Mobile Viewport (`375px`):** Top header visible, search and filter bars wrap cleanly, content scrollable without bottom nav overlap.
4. **Automated Verification:** `npm test`, `npm run lint`, and `compile_applet` must pass with 100% success.

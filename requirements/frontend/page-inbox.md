# Page Specification: Recommendation Inbox (`/inbox`)

## 1. Functional Requirements

### 1.1 List & Card Presentation
- Display postings in a scannable table or card grid.
- Key item metadata: Title, Company, Location, Workplace Type (Remote, Hybrid, Onsite), Seniority, Salary Range, Date Posted, and Last Checked.
- Prominently display the **JEV Fit Outcome** (Fit / Non-Fit badge) and **Confidence Score** (e.g., `85% confidence`).
- Display posting availability indicator (`open`, `closed`, `unknown`) with evidence tooltip.

### 1.2 Filtering & Querying
- **Workflow State Filter:** Tabs for `Discovered` (Inbox), `Recommended`, `Reviewing`, `Saved`, and `Dismissed`.
- **Nullable Attribute Toggles:** Quick filters for `Missing Salary` and `Missing Location` (allowing the user to audit unstated compensation postings).
- **Workplace Type Filter:** Multi-select for Remote, Hybrid, Onsite.
- **Search & Sort:** Text search across title and company. Sorting by `Date Discovered (Newest/Oldest)` and `JEV Confidence (High/Low)`.

### 1.3 Fast Triage Actions
- **Save (`saved`):** Advances workflow status to `saved` with optimistic UI update and status audit logging (Owner only).
- **Dismiss (`dismissed`):** Marks as dismissed and removes from the immediate inbox view (Owner only).
- **Review (`reviewing`):** Flags for deeper consideration (Owner only).
- **Direct Apply Button:** Prominent external link button opening `job_url_direct` or `canonical_url` in a new tab (Available to all).
- **Quick Mark Applied:** Button to mark as applied, which triggers creation of an active `Application` record linked to the job (Owner only).
- **Guest Mode Behavior:** In guest sessions, triage mutation buttons (Save/Dismiss) are disabled or show an informational badge (*"Demo mode: Actions are view-only"*). Personal status badges ("Saved by you") are omitted.

### 1.4 Deep Analysis Drawer
- Clicking anywhere on the job row (aside from action buttons) navigates to `/jobs/:id` or opens a slide-over preview drawer.

## 2. Non-Functional Requirements

- **Performance:** Instant client-side filtering and sorting across up to 500 cached jobs with zero visible lag (<16ms frame rate).
- **Keyboard Navigation:** Support `j` / `k` row navigation, `s` to save, and `d` to dismiss for power-user triage.
- **Optimistic Updates:** UI state updates immediately upon clicking Save/Dismiss without waiting for backend roundtrip; rolls back gracefully if an API failure occurs.
- **Accessibility:** Color must not be the sole indicator of JEV fit or availability (include explicit text and icon semantics).

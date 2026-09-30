# Page Specification: Application Tracking (`/applications`)

## 1. Functional Requirements

### 1.1 Dual View: Kanban Board & Table List
- Support switching between a drag-and-drop / column-based **Kanban Board** and a structured **Table List**.
- Lifecycle Stages (Columns):
  1. `preparing` (Researching & Tailoring)
  2. `applied` (Submitted to Company)
  3. `recruiter_screen` (Initial Recruiter Call Scheduled/Completed)
  4. `interviewing` (Technical / Team Interviews)
  5. `assessment` (Take-home or Coding Test)
  6. `offer` (Offer Received)
  7. `rejected` (Company Rejection)
  8. `withdrawn` / `inactive` (Archived)
- **Spring Animations:** Cards moving between stages use React Motion spring physics (`stiffness: 220, damping: 24`) for fluid column transitions.
- **In-Page Sticky Filter Bar:** Quick search (`/`), stage filter segment (`Active` | `Archived`), and sorting.

### 1.2 Application Card & Row Elements
- Company name and job title (with link to internal job detail view).
- Current stage indicator.
- Applied date (formatted nicely with relative days e.g., "5 days ago", tabular monospace).
- Next Action Date badge (highlighted yellow if due soon, red if overdue).
- Quick access to user interview notes and external application URL.
- **Micro Container Queries:** Cards adapt internal layout based on column width (`@container`).

### 1.3 Stage Transition & Audit Logging
- Dragging a card between columns or selecting a new stage from a dropdown:
  - Updates the application's current stage.
  - Automatically appends a new entry to `stage_history` with the timestamp and an optional user note modal.
  - Updates the parent job posting workflow status if appropriate.

### 1.4 Manual Application Creation
- "Add Application" button modal:
  - Supports entering a manual application for unlisted or offline jobs.
  - Requires entering Company and Title (creates a minimal underlying job posting first to preserve relational integrity).
  - Optional fields: Application URL, Initial Stage, Applied Date, and Notes.

### 1.5 Application Details Drawer
- Clicking an application opens an editor drawer:
  - Editable `user_notes` field (markdown-supported for interview prep notes and salary discussion logs).
  - Next action deadline picker.
  - Timeline history showing when each stage was entered and associated notes.

### 1.6 Guest Mode Boundary & Access Restrictions
- **Access Rule:** Strictly restricted to authenticated owner sessions (`role = 'owner'`).
- **Guest Presentation:** When unauthenticated public visitors navigate to `/applications` or click application previews:
  - The live personal application database is **never returned** by the API (returns `403 Forbidden`).
  - The UI renders an elegant informational card:
    - *"Application Pipeline & Kanban Tracker: Restricted to authenticated candidate workspace to preserve personal applicant privacy. Explore the public job directory and test the interactive AI agent in Explore Jobs."*

## 2. Non-Functional Requirements

- **Persistence Parity:** Must work identically whether running on PostgreSQL or local file-backed repository.
- **Responsive Layout:** Kanban board scrolls horizontally on narrower viewports with column collapse options.
- **Empty States:** Clear onboarding call-to-actions ("No active applications yet. Save a job from your inbox and mark it applied to track it here.")

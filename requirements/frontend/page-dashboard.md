# Page Specification: Metrics & Funnel Dashboard (`/dashboard`)

## 1. Functional Requirements

### 1.1 In-Page Sticky Filter Bar & Date Range Selection
- **Sticky Controls Header:** Positioned at top of page viewport with backdrop blur (`backdrop-filter: blur(8px)`).
- **Date Range Presets:** `Last 7 Days`, `Last 30 Days`, `Last 90 Days`, `All Time`, and `Custom Range`.
- All metric queries respect the active date range filter and serialize into TanStack Router URL params.
- Custom dates are calendar dates interpreted in UTC. Both selected boundary days are inclusive; the server query uses UTC start-of-day through `23:59:59.999Z` on the end date. Invalid dates and reversed ranges show an inline correction message and do not issue a metrics request.

### 1.2 Core Discovery Funnel Cards
- **Jobs Discovered:** Total raw job postings ingested across all sources within the period (tabular monospace).
- **Passed Filtering / Recommended:** Total jobs meeting deterministic search criteria and JEV qualification thresholds.
- **Jobs Saved:** Total jobs explicitly transitioned to `saved` or `reviewing` status.
- **Jobs Dismissed:** Total jobs marked as irrelevant or rejected by the user.
- **Micro Container Queries:** Metric cards adapt font and padding based on grid cell width (`@container`).

### 1.3 Application & Interview Conversion Rates
- **Applications Submitted:** Count of distinct jobs advanced to `applied` stage.
- **Recruiter Screen Rate:**
  - *Formula:* `Count(applications reaching recruiter_screen or beyond) / Count(total applied) * 100`
- **Interview Rate:**
  - *Formula:* `Count(applications reaching interviewing or beyond) / Count(total applied) * 100`
- **Offer Rate:**
  - *Formula:* `Count(applications reaching offer or accepted) / Count(total applied) * 100`
- **Rejection Rate:**
  - *Formula:* `Count(applications marked rejected) / Count(total applied) * 100`

### 1.4 Statistical Integrity & Small-Sample Indicators
- Every metric card must display a subtle tooltip or subtitle detailing its exact formula:
  - Example: *"Interview Rate: 2 interviews / 5 applications (Applied within selected date range)"*.
- **Small-Sample Guard:** If the denominator is less than 10 (e.g. fewer than 10 applications submitted), display an informational badge: *"Early Signal (Small sample size: N < 10)"* to avoid over-interpreting volatile early percentages.

### 1.5 Source Effectiveness Breakdown
- Table or bar chart displaying pipeline metrics segmented by source adapter (`greenhouse`, `lever`, `jobspy/indeed`, `jobspy/linkedin`, `manual`):
  - Ingested Count | Recommended Count | Applications Count | Callback Rate.

## 1.6 Guest Mode Boundary & Privacy Restrictions
- **Access Rule:** Strictly restricted to authenticated owner sessions (`role = 'owner'`).
- **Privacy Rationale:** Application conversion rates, recruiter screen rates, and interview pipelines reveal active private job search activity and are kept strictly private.
- **Guest Presentation:** Hidden from guest navigation. A direct attempt to navigate to `/dashboard` redirects to `/inbox` in the route loader after session resolution; the dashboard page must not mount or request private metrics. `GET /api/dashboard/metrics` remains owner-only and returns `403 Forbidden` for guests.

## 2. Non-Functional Requirements

- **Computation Efficiency:** Calculations must be performed on the backend via `GET /api/dashboard/metrics`. The `<50ms` target is measured as P95 request time with a PostgreSQL dataset of 10,000 postings and 2,000 applications on the staging host; if it is exceeded, use indexed/database-side aggregation rather than loading every row into application memory. File-store development mode is excluded from this latency target.
- **Zero Div-by-Zero Errors:** Gracefully display `0%` or `N/A` when denominators are zero.

# Page Specification: Metrics & Funnel Dashboard (`/dashboard`)

## 1. Functional Requirements

### 1.1 Date Range Selection
- Selectable presets: `Last 7 Days`, `Last 30 Days`, `Last 90 Days`, `All Time`, and `Custom Range`.
- All metric queries must respect the active date range filter.

### 1.2 Core Discovery Funnel Cards
- **Jobs Discovered:** Total raw job postings ingested across all sources within the period.
- **Passed Filtering / Recommended:** Total jobs meeting deterministic search criteria and JEV qualification thresholds.
- **Jobs Saved:** Total jobs explicitly transitioned to `saved` or `reviewing` status.
- **Jobs Dismissed:** Total jobs marked as irrelevant or rejected by the user.

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

### 1.6 Guest Mode Boundary & Privacy Restrictions
- **Access Rule:** Strictly restricted to authenticated owner sessions (`role = 'owner'`).
- **Privacy Rationale:** Application conversion rates, recruiter screen rates, and interview pipelines reveal active private job search activity and are kept strictly private.
- **Guest Presentation:** Hidden from the guest navigation bar. Direct attempts to navigate to `/dashboard` display a polite access boundary card or redirect to `/inbox`.

## 2. Non-Functional Requirements

- **Computation Efficiency:** Calculations must be performed on the backend via `GET /api/dashboard/metrics` with low latency (<50ms).
- **Zero Div-by-Zero Errors:** Gracefully display `0%` or `N/A` when denominators are zero.

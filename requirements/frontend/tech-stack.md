# Frontend Technology Stack and Architectural Foundations

## 1. Scope & Core Objectives

Provide a unified, high-performance, single-page web interface (SPA) for the Job Tracker application. Desktop is the primary layout with responsive adaptations for mobile screens. The frontend communicates with the Express backend over HTTP and acts as a single-tenant workspace.

## 2. Technology Choices & Justification

- **Framework:** React (v18/19) with Vite
  - *Justification:* Near-instant local HMR, lean client bundle, fast production builds, and zero SSR server management complexity.
- **Routing:** React Router (v6) or TanStack Router
  - *Justification:* Standard client-side routing with clean URL parameters for persistent filter states, tab switches, and deep links to specific job IDs.
- **Component & UI Foundation:** Tailwind CSS + Radix UI / headless primitives
  - *Justification:* Utility-first CSS eliminates CSS module overhead and stylesheet bloat. Clean typographic hierarchy and dark/light system adaptation.
- **Icons:** `lucide-react`
  - *Justification:* High-consistency icon set across all navigation, status badges, and action buttons.
- **State Management & Data Fetching:** TanStack Query (React Query)
  - *Justification:* Automatic background refetching, request deduplication, optimistic updates for workflow actions (e.g. Save/Dismiss), and seamless loading/cold-start state handling.
- **Local Client State:** Zustand
  - *Justification:* Extremely lightweight store for active UI filters, selected jobs, and the open/closed state of the conversational AI drawer.

## 3. Local Development, Dev Proxy & Remote Server Testing

### Local-to-Local Development:
- The Vite dev server proxies `/api/*` requests directly to `http://localhost:3000`.
- In `NODE_ENV=development`, the backend automatically authenticates incoming requests as the local developer without requiring edge headers.
- If PostgreSQL is not running locally, the backend seamlessly falls back to the persistent file store (`data/job_tracker_store.json`), allowing full offline development.

### Local-to-Remote / Staging Testing:
- When running the local UI against a remote server (e.g., the Oracle VM staging or production instance behind Cloudflare Access):
  - Configure `VITE_API_URL=https://staging-jobs.yourdomain.com` or local proxy target.
  - The frontend client includes an `Authorization: Bearer <API_SECRET_KEY>` header if configured in `.env.local`.
  - The backend auth middleware verifies this Bearer token and authorizes the session as the owner, completely bypassing the need for manual browser cookie manipulation across Cloudflare Zero Trust.

## 4. Staging vs. Production Multi-Environment Strategy

The host environment (Oracle Cloud Always Free VM) supports dual-instance containerization:
1. **Production Stack:**
   - Container: `job-tracker-prod` (internal port 3000).
   - Database: `job_tracker` PostgreSQL schema.
   - Domain: `jobs.yourdomain.com` routed via Cloudflare Zero Trust tunnel.
2. **Staging Stack:**
   - Container: `job-tracker-staging` (internal port 3001).
   - Database: `job_tracker_staging` PostgreSQL schema.
   - Domain: `staging-jobs.yourdomain.com` routed via Cloudflare Zero Trust tunnel with identical email allowlist rules.
   - Used for testing new crawler adapters, experimental AI prompts, and database migrations with zero risk of corrupting production application data.

## 5. View Hierarchy & Role-Aware Navigation

The UI dynamically adapts its layout and navigation based on user session role:

### 5.1 Owner Session (`role = 'owner'`)
Full navigation bar visible:
1. **Recommendation Inbox (`/inbox`):** High-density review list of newly discovered and recommended jobs with instant triage controls (Save, Dismiss, Applied).
2. **Job Detail & AI Assistant (`/jobs/:id`):** Deep view showing complete posting text, deterministic rule audit excerpts, salary transparency, and an interactive Gemini AI conversational panel using personal resume context.
3. **Applications Tracker (`/applications`):** Visual stage board (Kanban / List) tracking active applications through lifecycle events with personal interview notes.
4. **Metrics Dashboard (`/dashboard`):** Discovery funnel statistics, conversion metrics, small-sample indicators, and date range filters.
5. **Setup & Configuration (`/setup`):** Interactive editors for the candidate profile and search criteria, source adapter health checks, manual URL import, and pipeline triggers.

### 5.2 Public Guest Session (`role = 'guest'`)
Recruiter/portfolio navigation bar:
1. **Explore Jobs (`/inbox`):** Filter, search, and sort public curated postings. Mutation buttons (Save/Dismiss) are disabled or replaced with informational demo badges.
2. **Job Detail & AI Assistant (`/jobs/:id`):** Clean job view and interactive AI assistant powered by `GUEST_GEMINI_API_KEY` with a generic candidate persona and zero personal data leakage.
3. **Applications (`/applications`):** Replaced with a clean, locked portfolio showcase message explaining the private candidate pipeline.
4. **Dashboard (`/dashboard`):** Hidden from navigation.
5. **Setup (`/setup`):** Hidden from navigation.

## 6. Frontend AI Session State & Token Probing

- **Session Rate Limit Detection:**
  - Upon starting an interactive AI session, the UI requests `/api/agent/provider-status`.
  - The status response (`{ provider: 'free' | 'pro_backup', quotaExceeded: boolean }`) is cached in client `sessionStorage`.
  - Displays a clean status badge in the AI drawer (e.g. `✨ Gemini 3.5 Flash (Free Tier)` or `⚡ Gemini 3.5 Flash (Pro Backup)`).
  - If a 429 response is encountered during chat, TanStack Query catches the status code and triggers an automatic session-level switch to the Pro backup endpoint.

# Frontend Technology Stack and Architectural Foundations

## 1. Scope & Core Objectives

Provide a unified, high-performance, single-page web interface (SPA) for the Job Tracker application. Desktop is the primary layout with responsive adaptations for mobile screens. The frontend communicates with the Express backend over HTTP and acts as a single-tenant workspace.

## 2. Technology Choices & Justification

- **Framework & Runtime:** React 19 with Vite
  - *Justification:* Near-instant local HMR, lean client bundle, fast production builds, and native React 19 concurrency primitives (`useOptimistic`, `useActionState`).
- **Routing:** TanStack Router
  - *Justification:* 100% type-safe routing, nested layouts, and first-class search parameter validation with Zod. Essential for preserving complex URL filter states (status, workplace type, sort orders, and active job selections) without runtime type guessing.
- **Component & UI Foundation:** Tailwind CSS 4 with application-owned React components and CSS design tokens.
  - Radix UI and shadcn/ui are not currently installed or required. Do not add or migrate to them without an explicit design/architecture decision; preserve the existing component conventions.
- **Animation:** CSS transitions and transforms are the current implementation. No spring-animation library is installed or required. Prefer CSS for the existing transitions; any future animation dependency must be proposed explicitly and honor `prefers-reduced-motion`.
- **Icons:** `lucide-react`
  - *Justification:* High-consistency icon set across all navigation, status badges, metrics, and triage action buttons.
- **State Management & Data Fetching:** TanStack Query (React Query v5)
  - *Justification:* Automatic background refetching, request deduplication, optimistic updates for workflow actions (e.g., instant Save/Dismiss UI state transitions), and seamless loading/cold-start state handling.
- **Local Client State:** Zustand
  - *Justification:* Extremely lightweight store for ephemeral UI state: active view filters, job selection sets, and the open/closed state of the conversational AI assistant drawer.

> **Note on SSR Capability:** The selected architectural stack (React 19 + Vite + TanStack Router + Express) is fully capable of supporting Server-Side Rendering (SSR) in the future (e.g., via Vite Express SSR middleware or TanStack Start) to pre-render database-driven pages for near-instant first paint. However, MVP requirements specify a client-side Single Page Application (SPA) architecture to prioritize lean container resource usage on the free-tier host, simple deployment pipelines, and zero hydration complexity. No decision has been made on an SSR implementation approach, and SSR is not an MVP requirement.

## 3. Local Development, Dev Proxy & Remote Server Testing

### Local-to-Local Development:
- The Vite dev server proxies `/api/*` requests directly to `http://localhost:3000`.
- In `NODE_ENV=development`, the backend automatically authenticates incoming requests as the local developer without requiring edge headers.
- If PostgreSQL is not running locally, the backend uses the file-backed repository (`data/job_tracker_store.json`), allowing API/UI development without a database service. Candidate, resume, and search profiles use the same repository interface; ignored local JSON seeds may initialize missing profile records but are not written back or shipped in production images.
- API tests force a fresh temporary file-backed repository and must not require PostgreSQL or modify developer data. PostgreSQL integration tests are a separate opt-in suite using a disposable database.

### Local-to-Remote / Staging Testing:
- Open the staging application origin directly through Cloudflare Access for browser-based owner testing. The UI uses same-origin `/api` requests, and Cloudflare Access authenticates the browser session.
- Do not place `API_SECRET_KEY` in Vite variables, `.env.local` values exposed to the client, request headers from browser code, or built assets. It is a trusted automation credential, not a browser login mechanism.
- Running a local Vite UI against a remote API is not an MVP-supported workflow. Add it only with a server-side proxy/authentication design that never exposes owner credentials to the browser and explicitly handles origin, cookies, and CORS.

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
2. **Job Detail & AI Assistant (`/jobs/:id`):** Clean job view and interactive AI assistant powered by `PROD_GUEST_GEMINI_API_KEY_FREE` (or legacy `GUEST_GEMINI_API_KEY`) with a generic candidate persona and zero personal data leakage.
3. **Applications (`/applications`):** Replaced with a clean, locked portfolio showcase message explaining the private candidate pipeline.
4. **Dashboard (`/dashboard`):** Hidden from navigation.
5. **Setup (`/setup`):** Hidden from navigation.

## 6. Frontend AI Session State & Token Probing

- Public readiness is returned by `GET /api/health` without provider or persistence telemetry. Owner provider diagnostics are returned by owner-only `GET /api/system/health` and AI conversation turn responses. The guest UI uses consumer-facing labels and must not expose owner-tier terminology.
- An owner-tier 429 on the production free key activates the process-wide owner Pro cooldown and retries the current turn once when a Pro backup is configured. Guest 429s remain isolated to the guest key and never trigger or consume owner failover.

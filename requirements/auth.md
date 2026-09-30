# Authentication, Perimeter Security, and Container Deployment Requirements

## Scope

Define the authentication, access controls, network perimeter, and container deployment architecture required to host the MVP web application privately without public internet exposure, utilizing Docker containerization and multi-container orchestration. The architecture supports deployment on a dedicated Always-Free Linux host (e.g., Oracle Cloud Infrastructure) or alternatively on serverless container infrastructure (Google Cloud Run) behind a Zero Trust perimeter at zero operational cost.

## Identity and Access Model (Dual-Role Architecture)

The system enforces a dual-role access boundary:

1. **Owner Mode (`role = 'owner'`):**
   - Activated when incoming requests carry a verified `Cf-Access-Authenticated-User-Email` matching `ALLOWED_USER_EMAIL` (or via `Authorization: Bearer <API_SECRET_KEY>`, or automatically in `NODE_ENV=development`).
   - Grants full read/write privileges: triaging inbox jobs (save/dismiss), managing application pipeline stages in the Kanban, viewing private metrics, editing candidate/search profiles, and running scrapers.
   - Powered by the primary owner Gemini keys (with automatic Tier 1 Free to Tier 2 Pro failover).

2. **Public Guest Portfolio Mode (`role = 'guest'`):**
   - Activated when visitors access public routes without Cloudflare Access edge authentication.
   - Strictly **read-only**: Guests can browse, search, and filter job postings (`/api/jobs`), view sanitized job details (`/api/jobs/:id`), and test the conversational AI assistant.
   - All mutations (`POST`, `PUT`, `PATCH`, `DELETE`) from guests are rejected with `403 Forbidden`.
   - Personal candidate information (real resume, personal interview notes, active application stages, private conversion rates) is completely redacted or restricted.
   - Guest AI queries are strictly powered by an isolated `PROD_GUEST_GEMINI_API_KEY_FREE` to guarantee public usage cannot exhaust the owner's primary API quota.

## Generative AI API Token Strategy & Failover Architecture

To optimize operating costs, protect against quota exhaustion, and isolate public visitors:

### 1. Token Hierarchy & Environment Isolation
- **`GEMINI_API_KEY` (Development & Staging Tier):**
  - Standard Google AI Studio secret name.
  - Preferred in all non-production environments (`NODE_ENV !== "production"` or `APP_ENV === "staging" | "development"`).
  - Used for local debugging, unit/integration tests, and staging validation, completely insulating production quotas.
- **`PROD_GUEST_GEMINI_API_KEY_FREE` (Production Public Guest Portfolio Tier):**
  - Dedicated key for unauthenticated public visitors trying the AI assistant on job detail pages.
  - Quota exhaustion on this key affects only public visitors and never halts owner analysis or background jobs.
  - Guest prompts run with a generic synthetic candidate persona (e.g. *"Senior Software Engineer"*), completely isolating the owner's real resume and contact information.
- **`PROD_GEMINI_API_KEY_FREE` (Production Owner Primary - Free Tier):**
  - The default key used for owner operations in production at zero operating cost.
- **`PROD_GEMINI_API_KEY_PRO` (Production Owner Backup - Paid Tier):**
  - High-quota paid/Pay-As-You-Go Google AI Studio token.
  - Automatically activated if `PROD_GEMINI_API_KEY_FREE` returns HTTP 429 (Resource Exhausted / Rate Limit Exceeded) or fails a session rate-limit pre-flight probe.

### 2. Server-Side Key Resolution Precedence & Fallback
The server resolves keys deterministically without exposing them to the client:
1. **Development/Staging Check:** If environment is development or staging and `GEMINI_API_KEY` is present, resolve `GEMINI_API_KEY` (`tier: "development"`).
2. **Guest Role Check:** If the request originates from a guest session (`role = 'guest'`), resolve `PROD_GUEST_GEMINI_API_KEY_FREE` (`tier: "guest"`). If absent, fall back to offline simulation (`tier: "none"`).
3. **Production Owner Check:** If `role = 'owner'` in production:
   - If pro backup is preferred or active failover is engaged: resolve `PROD_GEMINI_API_KEY_PRO` (`tier: "owner_pro"`).
   - Otherwise, resolve primary `PROD_GEMINI_API_KEY_FREE` (`tier: "owner_free"`).
   - If `PROD_GEMINI_API_KEY_FREE` is exhausted or absent, automatically resolve `PROD_GEMINI_API_KEY_PRO` (`tier: "owner_pro"`).
   - If neither production key is set, fall back to `GEMINI_API_KEY` (`tier: "development"`).
4. **Offline Resilient Mode:** If no valid key resolves for the requested role/environment, the server executes deterministic offline simulation (`tier: "none"`), ensuring that neither interactive agents nor background triage crash.

### 3. Failover Execution & Session State Tracking
- **Failover Trigger:** When an active call to Gemini using `PROD_GEMINI_API_KEY_FREE` returns HTTP 429 (Rate Limit Exceeded / Quota Exhausted), the server catches the status, immediately switches the active owner provider session to `PROD_GEMINI_API_KEY_PRO`, and replays or continues the agent turn seamlessly.
- **Cooldown & Reset:** The failover state remains active for the remainder of the session or until a backoff period resets (default: 60 minutes), after which the system probes `PROD_GEMINI_API_KEY_FREE` again.
- **Telemetry Exposure:** The resolved tier name (`development`, `owner_free`, `owner_pro`, `guest`, `none`) and failover status are exposed to the client via `/api/health` and conversational responses, allowing the UI to render appropriate telemetry badges without ever leaking raw tokens.

## Perimeter Architecture (Zero Trust Edge)

To eliminate the operational complexity of managing in-application user databases, passwords, and session tokens, perimeter protection is enforced at the network edge:

- **Cloudflare Access (Zero Trust):**
  - All web traffic to the application domain must terminate at Cloudflare's edge and pass through Cloudflare Zero Trust Access.
  - The access policy must challenge incoming requests with trusted Identity Provider (IdP) authentication (e.g., Google OAuth or Email One-Time PIN) restricted strictly to the explicit owner email allowlist.
  - Requests failing authentication must be blocked at the edge before reaching the application or database.
- **Origin protection via Cloudflare Tunnel (`cloudflared`):**
  - Inbound host ports (80/443/5432) must remain closed on the host firewall.
  - An outbound-only Cloudflare Tunnel runs side-by-side with the application container, forwarding authenticated traffic securely to the web service loopback.

## Container Architecture and Multi-Container Orchestration

The application must be fully containerized using Docker and orchestratable via Docker Compose:

### 1. Multi-Stage Production `Dockerfile`
- **Build stage:**
  - Installs complete dependencies (including devDependencies required for compilation).
  - Compiles TypeScript into clean JavaScript (`dist/`).
- **Runner stage:**
  - Utilizes a minimal, secure Node base image (`node:22-alpine` or `node:22-slim`).
  - Installs production-only dependencies (`npm ci --only=production`).
  - Drops root privileges and executes as a non-privileged system user (`USER node`).
  - Exposes port `3000` and configures health check instructions (`HEALTHCHECK CMD wget --spider http://localhost:3000/api/health`).

### 2. Multi-Container Orchestration (`docker-compose.yml`)
The local and host environments must provide a unified composition defining three isolated services:
- **`app`:** The Node.js Express backend and static frontend server, connected to internal container networking and dependent on database readiness.
- **`db`:** PostgreSQL 16 instance with data persistence mounted to a host volume (`./data/postgres:/var/lib/postgresql/data`) and port binding restricted strictly to local loopback (`127.0.0.1:5432:5432`).
- **`tunnel` (Optional production profile):** `cloudflare/cloudflared` container connecting the local application service to the Cloudflare Zero Trust network via token without exposing public IP addresses.

### 3. Deployment Flexibility
- **Primary target (Dedicated Always-Free Host / VM):** Runs all three containers seamlessly under Docker Compose with persistent disk, background scheduler freedom, and zero cold starts.
- **Alternative target (Serverless Container / Cloud Run):** The `app` image can alternatively be deployed to Google Cloud Run pointing to an external PostgreSQL database (e.g. Neon or Supabase) with zero code modifications.

## Defense-in-Depth & Header Inspection

- **Gateway identity verification:**
  - When hosted in production (`NODE_ENV=production`), the application server must inspect identity headers forwarded by the trusted edge gateway (`Cf-Access-Authenticated-User-Email` and `Cf-Access-Jwt-Assertion`).
  - If production mode is enabled without edge headers, requests must be rejected with `401 Unauthorized` or `403 Forbidden`.
  - The server must allow an optional `AUTH_BYPASS_DEV=true` or `API_SECRET_KEY` Bearer token for automated background jobs and local testing.
- **Local development bypass:**
  - In local development mode (`NODE_ENV=development`), the authentication middleware must assign a local default user profile without requiring tunnel headers.
- **Operational readiness exception:**
  - The health check endpoint (`GET /api/health`) must remain accessible without authentication headers to permit Docker and orchestrator health checks.

## Acceptance Criteria

1. A multi-stage `Dockerfile` successfully builds a clean, minimal production container image without build artifacts or dev dependencies.
2. `docker-compose.yml` provides a unified setup for `app`, `db`, and `tunnel` services with persistent volume mapping.
3. Unauthenticated requests in production mode lacking Cloudflare Access headers are rejected before executing application logic.
4. Production requests bearing a valid `Cf-Access-Authenticated-User-Email` matching the configured `ALLOWED_USER_EMAIL` are permitted and audited.
5. Local development and test commands (`npm test`, `npm run dev`) continue to operate cleanly without requiring active Cloudflare tunnels.

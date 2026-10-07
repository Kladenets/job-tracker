# Authentication, Perimeter Security, and Container Deployment Requirements

## Scope

Define the authentication, access controls, network perimeter, and container deployment architecture required to host the MVP web application privately without public internet exposure, utilizing Docker containerization and multi-container orchestration. The architecture supports deployment on a dedicated Always-Free Linux host (e.g., Oracle Cloud Infrastructure) or alternatively on serverless container infrastructure (Google Cloud Run) behind a Zero Trust perimeter at zero operational cost.

## Identity and Access Model (Dual-Role Architecture)

The system enforces a dual-role access boundary:

1. **Owner Mode (`role = 'owner'`):**
  - In production, activated only when `Cf-Access-Jwt-Assertion` has a valid signature from the configured Cloudflare Access team's rotating JWKS, issuer and audience match `CF_ACCESS_TEAM_DOMAIN` and `CF_ACCESS_AUD`, and its email claim matches both `Cf-Access-Authenticated-User-Email` and `ALLOWED_USER_EMAIL`.
  - `Authorization: Bearer <API_SECRET_KEY>` remains an owner credential for trusted automation. Non-production development/test modes use the local owner identity.
   - Grants full read/write privileges: triaging inbox jobs (save/dismiss), managing application pipeline stages in the Kanban, viewing private metrics, editing candidate/search profiles, and running scrapers.
   - Powered by the primary owner Gemini keys (with automatic Tier 1 Free to Tier 2 Pro failover).

2. **Public Guest Portfolio Mode (`role = 'guest'`):**
   - Activated when visitors access public routes without Cloudflare Access edge authentication.
  - Guests can browse/search/filter public job postings, view sanitized job details, and send stateless turns to the public AI demo.
  - Guest requests cannot mutate or retrieve owner application data. `POST /api/agent/guest-chat` is the sole public POST exception; it does not persist conversation or candidate data.
   - Personal candidate information (real resume, personal interview notes, active application stages, private conversion rates) is completely redacted or restricted.
   - Guest AI queries are strictly powered by an isolated `PROD_GUEST_GEMINI_API_KEY_FREE` to guarantee public usage cannot exhaust the owner's primary API quota.

### Production API Route Policy

- Production requests without valid owner credentials are treated as guest traffic only on explicitly public routes. The guest allowlist is `GET /api/session`, `GET /api/jobs`, `GET /api/jobs/:id`, and `POST /api/agent/guest-chat`; static client assets and the SPA entry point are also publicly readable.
- Every other API route is owner-only and must be denied centrally by the authentication middleware. Guest attempts to read private data or perform mutations return `403 Forbidden`.
- Guest job responses use an allowlisted public DTO and must omit user workflow status, fit classification/confidence, AI analysis, manual overrides, filter audit data, and raw crawler payloads.
- Guest chat is stateless on the server and receives only public job context plus at most 12 user/assistant turns (each message at most 4000 characters). The browser retains this guest thread in memory until reload; it must not read or write owner conversations or candidate-profile data.
- No application-level guest request/token budget is required for the MVP. Guest chat must use only the isolated guest Gemini key, so provider quota use cannot consume owner quota.
- Cloudflare owner access requires a valid `Cf-Access-Jwt-Assertion` whose signature is checked against the team's rotating JWKS, whose issuer and audience match `CF_ACCESS_TEAM_DOMAIN` and `CF_ACCESS_AUD`, and whose email matches both the forwarded identity header and `ALLOWED_USER_EMAIL`. Missing configuration or invalid tokens fail closed.

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
  - The application does not enforce a separate guest request/token budget in the MVP; usage is bounded only by provider quota.
  - Guest prompts run with a generic synthetic candidate persona (e.g. *"Senior Software Engineer"*), completely isolating the owner's real resume and contact information.
- **`PROD_GEMINI_API_KEY_FREE` (Production Owner Primary - Free Tier):**
  - The default key used for owner operations in production at zero operating cost.
- **`PROD_GEMINI_API_KEY_PRO` (Production Owner Backup - Paid Tier):**
  - High-quota paid/Pay-As-You-Go Google AI Studio token.
  - Activated only when an owner request using `PROD_GEMINI_API_KEY_FREE` receives HTTP 429 (Resource Exhausted / Rate Limit Exceeded); the current owner turn is retried once with this key.
  - Guest quota errors must never activate this owner backup or change guest key resolution.

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

### 3. Failover Execution & Process State Tracking
- **Failover Trigger:** Only an owner agent currently using `owner_free` may activate failover after HTTP 429 (Rate Limit Exceeded / Quota Exhausted). When the Pro key is configured, retry that same turn once with `owner_pro`; if the retry fails, use the normal offline-resilience response. Guest agents never trigger or consume owner failover state.
- **Cooldown & Reset:** Owner failover state is process-wide and remains active for 60 minutes. During that period, new owner requests resolve to `owner_pro`; guest requests continue to resolve only the isolated guest key. After cooldown, owner requests may use `owner_free` again.
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

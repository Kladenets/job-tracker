# AI Job Analyzer and Intelligence Requirements

## Purpose

Assess jobs that survive deterministic filtering and provide evidence-backed candidate fit, prioritized recommendations, and on-demand application assistance.

The architecture decouples automated screening from deep reasoning into two distinct tiers:
1. **Tier 1 (System 1 - Automated Fit Classification):** Fast, inexpensive binary classification and confidence scoring powered by the **TypeSafe AI (JEV)** model.
2. **Tier 2 (System 2 - Interactive Job & Application Agent):** Deep reasoning, gap analysis, cover letter drafting, and interview preparation powered by a generative LLM (Google Gemini) invoked interactively via the web interface.

---

## Tier 1: TypeSafe AI (JEV) Automated Fit Classifier

### Role & Capabilities
- Evaluates every newly ingested posting that passes deterministic prefiltering.
- Uses JEV's typed binary decision (`noul` primitive) to answer: *"Is this job a good fit for this candidate based on their profile, skills, and search criteria?"*
- Returns a structured, typed response containing:
  - `fit`: boolean (`true` | `false`);
  - `confidence`: numeric score from `0.0` to `1.0`;
  - execution metadata (decision latency, token/call count).
- The returned `confidence` score is persisted with the job posting and serves as the primary automated ranking metric in the user's recommendation inbox.

### References & Documentation
- **Guide**: [The Ultimate Guide to JEV: The New Frontier AI for Faster Decisions](https://medium.com/@unicodeveloper/the-ultimate-guide-to-jev-the-new-frontier-ai-for-faster-decisions-acd78e5f4c56)
- **Quickstart Docs**: [TypeSafe AI Quickstart](https://docs.typesafe.ai/introduction/quickstart)

*Platform Note:* New signups for the TypeSafe AI / JEV platform may be temporarily halted due to high demand. The system must implement a strict provider abstraction layer with a local/mock adapter (or lightweight LLM simulation) so the application remains fully functional and testable until account access is activated.

### Inputs to JEV
To maximize JEV's confidence consistency and execution speed, JEV inputs are constructed strictly from the **normalized job summary** in our database:
- normalized title and company;
- normalized workplace type (`remote`, `hybrid`, `onsite`, or `unknown`);
- normalized location;
- normalized compensation range (or `unknown`);
- clean, concise extracted job description summary and core skill tags;
- candidate profile summary (skills, target roles, preferred stack, constraints).

Raw, messy web boilerplate is never sent to JEV. Missing attributes (e.g. unknown salary or location) are passed explicitly as unknowns. The system monitors how missing attributes influence JEV's confidence scores over time to calibrate thresholds.

---

## Tier 2: Interactive Conversational Job Agent (Generative LLM)

### Role & Capabilities
- User-directed and interactive: Invoked on-demand through the web application frontend or local CLI for deep reasoning and application assistance.
- Multi-turn conversational interface powered by Google Gemini (`@google/genai`) using the modern Interactions API.
- Fluid, multi-job conversations: Conversations are not artificially siloed to a single `job_id`. A user can explore multiple jobs, ask comparative questions ("Compare Job A and Job B for compensation and tech stack"), request cover letters, and practice interview questions within the same thread.
- Dynamic Job Tagging: Conversations maintain a `job_ids: string[]` tag list. Whenever a job is retrieved, analyzed, or targeted by an agent tool, the job's ID is automatically tagged to the conversation. This allows the UI to easily filter and surface "Conversations referencing this job" while preserving total conversational freedom.
- Rehydration: Opening or resuming an existing conversation rehydrates the full ordered message history, providing instant context to the model.

### Tool Architecture (Function Calling)
- Adopts a provider-agnostic `Tool` interface declaring plain JSON Schema parameters (directly accepted by the Gemini API without extra runtime transformation layers).
- Autonomous Tool Loop: The agent runs multi-turn tool loops:
  1. Detects `function_call` steps from the model;
  2. Executes matching tools and formats results as `function_result` steps;
  3. Feeds results back using `previous_interaction_id` until the model produces its final text turn;
  4. Bounded by a safety cap (`MAX_TOOL_TURNS = 5`) and returns `is_error: true` on exceptions so the model can explain and recover gracefully.
- Core Pre-Defined Tools:
  1. `get_job_details`: Fetches full normalized job profile and requirements by `job_id` or query.
  2. `analyze_qualification_fit`: Produces structured match/gap breakdown citing exact evidence from job text.
  3. `draft_cover_letter`: Generates tailored, truthful cover letters grounded in candidate skills, with user focus notes.
  4. `generate_interview_prep`: Produces role-specific technical questions, architecture tradeoffs, and prep topics.
  5. `search_saved_jobs`: Searches stored database jobs by keyword, company, compensation floor, or workplace type.

### Local Testing & Developer Ergonomics
- Interactive Terminal REPL (`src/scripts/chat.ts` / `npm run agent:chat`): Allows developers to chat directly in the terminal with live streaming/turns, tool execution feedback, `/history`, and `/exit` commands before a full web UI is built.
- Owner REST Endpoints: `POST /api/agent/conversations`, `GET /api/agent/conversations`, `GET /api/agent/conversations/:id`, `POST /api/agent/conversations/:id/messages`, and `DELETE /api/agent/conversations/:id`. These use persistent owner conversation history.
- Guest REST Endpoint: `POST /api/agent/guest-chat` accepts a bounded client-held history, uses public job context only, and does not persist a server conversation.

---

## Eligibility and Budgeting

### Tier 1 (Automated JEV Screening):
- Runs automatically in the background for all newly ingested postings that pass the deterministic hard filter.
- Because JEV is purpose-built for low latency and minimal cost, deterministic score gating is not required.
- Tracks daily request counts and respects configured rate limits.

### Tier 2 (Interactive Agent):
- Executed on-demand when the user clicks an action in the UI (e.g., "Analyze Fit", "Draft Cover Letter", "Prep Interview").
- Owner requests are governed by configured daily request/token budgets and provider rate limits. If the owner budget is reached, the user is notified and requests may queue until reset.
- Public guest chat uses an isolated guest key and does not use the owner's budget. The MVP does not enforce an application-level guest request/token budget; the guest provider's own quota is the limit.

---

## Scoring and Ranking Policy

1. **No Artificial Deterministic Score:**
   - The system does not compute a composite `deterministic_score`. Hard constraints are binary gates (`pass` / `fail`).
2. **Confidence-Driven Ranking:**
   - Jobs in the recommendation inbox are ranked by JEV `confidence` score (e.g., descending order of confidence among `fit = true` postings).
   - Postings where JEV returned `fit = false` or low confidence are deprioritized or grouped into a secondary review view.
3. **Handling of Missing / Null Fields:**
   - Missing fields (salary, location, workplace) remain `NULL` in the database and are treated as unknowns.
   - Unknown information is evaluated by JEV rather than penalized arbitrarily.
4. **User Override:**
   - The user can inspect JEV's fit outcome and confidence score and manually adjust the job's workflow status (`saved`, `reviewing`, `dismissed`).

---

## Provider Abstraction

The analyzer must expose a provider-neutral boundary:
- **`FitClassifier` Interface**: Abstracts the TypeSafe AI (JEV) client. Allows transparent swapping between the live TypeSafe AI API, a fallback simulated classifier, and local unit test fixtures.
- **`GenerativeAgent` Interface**: Abstracts Google Gen AI SDK (`@google/genai`) for interactive drafting and chat-based role assistance.

Both providers record latency, model ID, prompt/template version, and usage metadata.

---

## Prompt-Injection Resistance

- Delimit job posting text strictly as untrusted input data.
- Instruct models to evaluate content only and disregard any instructions contained within postings.
- Grant no execution, file system modification, or network submission tools to the evaluation pipelines.
- Validate all structured outputs against strict Pydantic / TypeScript schemas.

---

## Acceptance Criteria

- All postings passing deterministic prefiltering receive automated JEV fit classification and confidence scoring.
- JEV confidence score is persisted and available for sorting in the inbox.
- System operates cleanly with mock/fallback classifier when live JEV credentials are not yet provisioned.
- Interactive deep analysis and cover letter drafting can be triggered from the frontend for individual jobs.
- Postings with missing attributes (salary `NULL`, location `NULL`) are processed without error and without artificial penalties.

# AI Agent & Live Provider Verification Report

- **Date:** 2026-09-29T19:08:00-07:00
- **Applet ID:** `f7ecff96-b423-4566-8d77-461dcefca228`
- **Environment:** Google AI Studio Build Runtime
- **Deployment Revision (`K_REVISION`):** `ais-dev-gqafrzigvete45r5vjivsf-00001-dhz`
- **Service Version:** `0.4.0`
- **Environment URLs:**
  - Dev: `https://ais-dev-gqafrzigvete45r5vjivsf-453867445385.us-east5.run.app`
  - Shared: `https://ais-pre-gqafrzigvete45r5vjivsf-453867445385.us-east5.run.app`

---

## 1. Overview & Verification Summary

This document records the verification tests run against both live AI integration tiers (TypeSafe AI / JEV and Google Gemini), the interactive multi-tool loop, and the end-to-end HTTP pipeline.

| Subsystem | Live Provider / Endpoint | Result | Notes |
| :--- | :--- | :---: | :--- |
| **Tier 1 Fast Screening** | TypeSafe AI (`POST https://api.typesafe.ai/v1/systemone`) | **PASSED** | Live model `jev-1.13.0` scored matching job with `0.77` noul probability in 327ms; non-match scored `0.01`. |
| **Tier 2 Interactive Agent** | Google GenAI SDK Interactions API (`gemini-3.5-flash-lite`) | **PASSED** | Multi-turn autonomous tool chaining verified with 5 tools. |
| **Automated Test Suite** | `npm test` (6 test suites) | **PASSED (100%)** | 6/6 test files passed, including data translations, deduplication, perimeter auth, agent, applications, and HTTP endpoints. |
| **Applet Compilation** | `npm run build` (`tsc`) | **PASSED** | Zero TypeScript compilation errors. |

---

## 2. Tier 1: TypeSafe AI (JEV System One) Live Tests

### Endpoint
- **URL:** `POST https://api.typesafe.ai/v1/systemone`
- **Auth Header:** `Authorization: Bearer <TYPESAFE_API_KEY>`
- **Model:** `jev-latest` (resolved to `jev-1.13.0`)
- **Primitive Used:** `noul` (Boolean confidence probability in range `[0.0, 1.0]`)

### Test Case A: Target Role Match (Senior Full-Stack Engineer)
- **Input:**
  - Title: *"Senior Full-Stack Engineer (React & TypeScript)"*
  - Company: *"CloudTech Inc"*
  - Location: *"Doylestown, PA"*
  - Workplace: `hybrid`
  - Salary: `$140,000 - $170,000`
  - Stack: `["TypeScript", "React", "Node.js", "PostgreSQL"]`
  - Candidate Target Profile: Full-Stack Engineer in Doylestown, PA with TypeScript/React/Node.js skills.
- **Live Response Received:**
  ```json
  {
    "fit": true,
    "confidence": 0.77,
    "reason": "Qualified with 77% JEV confidence score (meets >= 70% threshold).",
    "model": "jev-1.13.0",
    "latencyMs": 327
  }
  ```

### Test Case B: Non-Matching Role (Dental Hygienist)
- **Input:**
  - Title: *"Clinical Dental Hygienist"*
  - Company: *"Smile Dental Clinic"*
  - Location: *"Los Angeles, CA"*
  - Stack: `[]`
- **Live Response Received:**
  ```json
  {
    "fit": false,
    "confidence": 0.01,
    "reason": "Marginal fit with 1% JEV confidence score (below 70% threshold).",
    "model": "jev-1.13.0",
    "latencyMs": 258
  }
  ```

---

## 3. Tier 2: Gemini Agent & Multi-Tool Calling Live Tests

### Implemented Tool Registry (`src/ai/agent/tools/`)
1. `search_saved_jobs`: Searches repository by query, company, workplace type, or status.
2. `get_job_details`: Fetches full posting by UUID or search terms, and tags the job to the conversation.
3. `analyze_qualification_fit`: Compares candidate profile against job description and detected tech stack.
4. `draft_cover_letter`: Creates a tailored cover letter incorporating candidate highlights and user notes.
5. `generate_interview_prep`: Produces role-specific technical, behavioral, and system design interview questions.

---

### Test Case 1: Multi-Step Chained Tool Execution
- **User Prompt:**
  > *"Can you look up the Stripe job in our saved jobs, analyze my qualification fit for it, and give me a brief summary?"*
- **Model Used:** `gemini-3.5-flash-lite` (via `@google/genai` Interactions API)
- **Tool Chain Executed by Gemini:**

#### Step 1: `search_saved_jobs` (`call_218110`)
- **Arguments Sent by Agent:**
  ```json
  {
    "company": "Stripe"
  }
  ```
- **Tool Result Returned to Agent:**
  ```json
  {
    "totalMatches": 1,
    "returnedCount": 1,
    "jobs": [
      {
        "id": "f3b392a1-9492-4f18-bbd9-b36442657801",
        "title": "Senior Full-Stack Engineer (React & TypeScript)",
        "company": "Stripe",
        "location": "Doylestown, PA",
        "workplace_type": "hybrid",
        "compensation": "$165k - $195k",
        "job_status": "saved",
        "jev_confidence": 0.94
      }
    ]
  }
  ```

#### Step 2: `analyze_qualification_fit` (`call_209214`)
- **Arguments Sent by Agent:**
  ```json
  {
    "job_id": "f3b392a1-9492-4f18-bbd9-b36442657801"
  }
  ```
- **Tool Result Returned to Agent:**
  ```json
  {
    "job_id": "f3b392a1-9492-4f18-bbd9-b36442657801",
    "job_title": "Senior Full-Stack Engineer (React & TypeScript)",
    "company": "Stripe",
    "overallFitScore": 95,
    "recommendation": "recommend",
    "matchedQualifications": [
      { "skill": "typescript", "evidence": "Referenced directly in job description or required stack" },
      { "skill": "react", "evidence": "Referenced directly in job description or required stack" },
      { "skill": "node.js", "evidence": "Referenced directly in job description or required stack" },
      { "skill": "sql", "evidence": "Referenced directly in job description or required stack" },
      { "skill": "postgresql", "evidence": "Referenced directly in job description or required stack" }
    ],
    "qualificationGaps": [],
    "candidateProfileUsed": {
      "targetTitles": ["Software Engineer", "Full Stack Engineer", "Senior Software Engineer"],
      "skillsCount": 11
    }
  }
  ```

#### Step 3: `get_job_details` (`call_270521`)
- **Arguments Sent by Agent:**
  ```json
  {
    "job_id": "f3b392a1-9492-4f18-bbd9-b36442657801"
  }
  ```
- **Tool Result Returned to Agent:**
  ```json
  {
    "id": "f3b392a1-9492-4f18-bbd9-b36442657801",
    "title": "Senior Full-Stack Engineer (React & TypeScript)",
    "company": "Stripe",
    "location": "Doylestown, PA",
    "workplace_type": "hybrid",
    "seniority": "senior",
    "compensation": "$165k - $195k",
    "date_posted": "2026-09-30T02:05:36.693Z",
    "job_status": "saved",
    "availability": "open",
    "source": "greenhouse",
    "canonical_url": "https://example.com/job1",
    "application_url": "https://example.com/job1/apply",
    "detected_technologies": ["React", "TypeScript", "Node.js", "PostgreSQL"],
    "description": "Join our payment infrastructure team. You will build high-reliability web applications using React, TypeScript, Node.js, and PostgreSQL. We require 5+ years of experience with distributed systems and secure API design."
  }
  ```

#### Synthesized Assistant Response:
> *"I found the **Senior Full-Stack Engineer (React & TypeScript)** position at **Stripe** in your saved jobs. Here is a brief summary of the role and your qualification fit:*
>
> *### **Job Overview***
> *- **Company:** Stripe*
> *- **Role:** Senior Full-Stack Engineer (React & TypeScript)*
> *- **Location:** Doylestown, PA (Hybrid)*
> *- **Compensation:** $165k - $195k*
> *- **Tech Stack:** React, TypeScript, Node.js, PostgreSQL*
> *- **Key Requirements:** 5+ years of experience with distributed systems and secure API design, building high-reliability web applications.*
>
> *### **Qualification Fit Analysis***
> *- **Overall Fit Score:** 95% (Strong Recommendation)*
> *- **Matched Qualifications:** Complete match across all required core technologies (TypeScript, React, Node.js, SQL, and PostgreSQL).*
> *- **Gaps:** None identified! Your skill profile aligns exceptionally well with the technical expectations for this role.*
>
> *Let me know if you would like me to **draft a cover letter**, **generate interview prep questions**, or help you take the next steps with this application!"*

#### Side Effect Verification:
- `conversation.job_ids`: `["f3b392a1-9492-4f18-bbd9-b36442657801"]` was automatically tagged to the conversation state.

---

### Test Case 2: Content Generation (Cover Letter + Interview Prep)
- **User Prompt:**
  > *"Can you draft a tailored cover letter for this Stripe job emphasizing my distributed systems background, and also generate 3 key technical interview questions to practice?"*
- **Tools Called Autonomously:**
  1. `draft_cover_letter`:
     - Arguments:
       ```json
       {
         "job_id": "f3b392a1-9492-4f18-bbd9-b36442657801",
         "notes": "Emphasize distributed systems background, reliability, scalability, and robust engineering principles.",
         "target_length": "standard"
       }
       ```
  2. `generate_interview_prep`:
     - Arguments:
       ```json
       {
         "job_id": "f3b392a1-9492-4f18-bbd9-b36442657801",
         "focus_area": "technical"
       }
       ```
- **Response Excerpt:**
  Generated a structured, 3-paragraph cover letter addressing the Stripe engineering team and provided 3 targeted technical questions focusing on distributed state machines, cache invalidation, and database schema migrations.

---

## 4. End-to-End Test Suite Summary (`npm test`)

The test suite executed with all tests passing:

```text
1. src/normalizers/__tests__/job-translator.test.ts
   ✓ Greenhouse posting translation verified
   ✓ Lever posting translation verified
   ✓ JobSpy hourly translation verified
   ✓ Manual posting translation verified

2. src/pipeline/__tests__/deduplication-and-state.test.ts
   ✓ Ingesting viable posting for first time (JEV confidence = 0.11)
   ✓ Missing fields retention as nulls (unknowns)
   ✓ Deterministic hard filtering on non-viable jobs
   ✓ Workflow updates (advancing to 'saved', then 'reviewing')
   ✓ Re-crawling with tracking variations (strictly preserved 'reviewing' status)
   ✓ Aggregator -> Direct ATS link cross-source deduplication
   ✓ Content hash change detection during re-crawl

3. src/ai/agent/__tests__/agent.test.ts
   ✓ Conversation state, message ordering, and job tagging
   ✓ Periodic conversation compaction
   ✓ Domain tools execution (GetJobDetails, AnalyzeQualificationFit, DraftCoverLetter, GenerateInterviewPrep, SearchSavedJobs)
   ✓ GeminiAgent multi-turn execution and fallback resilience
   ✓ Conversation persistence in repository

4. src/middleware/__tests__/auth.test.ts
   ✓ Public endpoint bypass (/api/health and /)
   ✓ Local development environment bypass (NODE_ENV=development)
   ✓ Production rejection when Cloudflare Access headers are absent (401 Unauthorized)
   ✓ Cloudflare Access allowlist validation (403 Forbidden vs 200 OK)
   ✓ API_SECRET_KEY Bearer token authorization
   ✓ Public guest portfolio access (read-only allowed, mutations rejected)

5. src/pipeline/__tests__/applications-and-metrics.test.ts
   ✓ Application created and saved to repository
   ✓ Application retrieved by ID and by JobId
   ✓ listApplications returns applications with enriched job metadata
   ✓ Application stage advanced with audit timeline history
   ✓ Dashboard metrics computed correctly with sample size guards

6. src/pipeline/__tests__/api-endpoints.test.ts
   ✓ GET /api/candidate-profile
   ✓ PUT /api/candidate-profile
   ✓ POST /api/jobs/manual
   ✓ PATCH /api/jobs/:id/status
   ✓ POST /api/applications
   ✓ GET /api/applications
   ✓ PATCH /api/applications/:id
   ✓ GET /api/dashboard/metrics
   ✓ DELETE /api/applications/:id
```

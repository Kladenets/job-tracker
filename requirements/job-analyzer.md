# AI Job Analyzer Requirements

## Purpose

Assess jobs that survive deterministic filtering and return a consistent, evidence-backed fit analysis. The analyzer is a bounded classification component, not an autonomous agent.

## Inputs

- normalized posting and relevant source excerpts;
- active search profile;
- approved candidate profile and resume information;
- selected resume facts when needed;
- deterministic score and unresolved questions;
- analysis schema and prompt version.

Do not send unrelated personal data, application history, private notes, or secrets.

## Eligibility and budgeting

A job may be sent to the analyzer only when:

- it is not closed or deterministically rejected;
- no reusable analysis exists for the same posting content, relevant candidate-profile state, search-profile state, provider, model, and analyzer schema or prompt version;
- it meets the configured deterministic score threshold or was manually requested;
- the daily request and token budgets permit the call.

Higher-scoring and user-requested jobs take priority when a budget is exhausted. Jobs skipped for budget reasons remain queued and visible.

The system must obtain current quota information from provider configuration or documentation rather than encode assumptions such as "1,500 requests/day." Track observed calls and tokens locally even when the provider supplies additional enforcement.

## Structured output

The model response must be validated against a versioned schema containing at least:

- overall fit score from 0 to 100;
- recommendation: `recommend`, `consider`, or `reject`;
- confidence from 0 to 1;
- matched qualifications with evidence;
- qualification gaps with requirement importance and evidence;
- compensation assessment: meets, below, unknown, or ambiguous;
- location/workplace assessment;
- seniority assessment;
- authorization/sponsorship assessment;
- concerns or contradictions;
- facts requiring user verification;
- concise rationale;
- optional suggested resume focus areas, without fabricating experience.

Each factual conclusion must reference a provided excerpt or be marked as an inference/unknown. The model must not infer protected characteristics or rank based on them.

Invalid responses may be repaired once using a constrained retry. Persistent failure must be stored as an analysis error and must not invent a default recommendation.

## Scoring policy

- Hard constraints remain deterministic and must not be overridden silently by the model.
- The AI score complements rather than replaces the deterministic score.
- Final ranking must keep deterministic and AI component scores distinguishable.
- Unknown information reduces confidence rather than automatically becoming a mismatch.
- The user can inspect and override all scores.

## Prompt-injection resistance

- Delimit posting content as untrusted data.
- Instruct the analyzer to classify content only and ignore instructions embedded in it.
- Give the analyzer no write, browser, shell, messaging, or application-submission tools.
- Validate all output independently of model text.
- Limit input length and strip irrelevant scripts, navigation, and repeated boilerplate.

## Provider abstraction

The analyzer must expose a provider-neutral application boundary so the rest of the product is not coupled to Gemini request or response types.

The Gemini implementation should use schema-constrained structured output where supported. Store provider, model, prompt/schema versions, latency, and available usage metadata with each result.

The reusable ideas from `../first-agent` are the provider wrapper and tool abstraction. Do not copy its mutable chat history into batch analysis: each job analysis should be stateless and reproducible from explicit inputs.

## Evaluation

Maintain a sanitized fixture set containing clear matches, clear rejections, ambiguous postings, missing salary, misleading boilerplate, and prompt-injection text.

Before changing prompts, models, schemas, or scoring policy, compare:

- structured-output validity;
- agreement with expected hard outcomes;
- false-negative rate on plausible jobs;
- evidence correctness;
- average calls, tokens, latency, and estimated cost.

Prefer avoiding false negatives in the deterministic funnel; a user can dismiss an extra candidate more easily than recover an unseen job.

## Acceptance criteria

- Matching posting content, relevant profile state, provider, model, and analyzer schema or prompt version reuse the stored result.
- Output that fails schema validation is never treated as a valid recommendation.
- Every displayed gap or match includes evidence or an explicit inference marker.
- Analyzer operation can be disabled without disabling ingestion and tracking.
- Before historical comparison or learned ranking is implemented, the candidate and search profile state used for an analysis is reproducible through a snapshot, hash, or version reference.
- A posting containing hostile instructions cannot cause tool execution or policy changes.

# Application Assistant Agent Requirements

## Purpose and authority

The agent helps the user understand postings and draft application materials. In the MVP it may read approved local data and create drafts. It may not navigate external forms, upload files, submit applications, send messages, schedule interviews, or claim user approval.

## Compatibility with the learning project

The implementation should build on the concepts already explored in `../first-agent` rather than introducing an unrelated agent framework. The MVP requires:

- a small provider-neutral boundary around Gemini;
- explicit, validated agent capabilities;
- bounded agent execution;
- task context that is deliberate and inspectable rather than an unbounded chat transcript;
- authorization enforced by the application, not only by model instructions.

The batch job analyzer and interactive application assistant must remain separate capabilities even if they share AI-provider infrastructure.

## Approved context

The agent may receive only context selected for the task:

- current job facts and analysis;
- active approved candidate profile;
- selected resume or portfolio facts;
- selected prior answers marked approved;
- user instructions and current draft.

For MVP, provide structured candidate and job context plus basic text retrieval. A vector database or general RAG system is not required. Add semantic retrieval only if document volume or measured retrieval quality justifies it.

Every context item must retain its source. Generated claims about the candidate should be traceable to a candidate-profile field or document excerpt.

## MVP capabilities

- Explain the job's requirements and likely gaps.
- Suggest questions for the recruiter or hiring manager.
- Draft and revise cover-letter sections.
- Draft answers to application questions.
- Suggest which approved resume version best fits the posting.
- Suggest truthful resume emphasis or wording without inventing experience.
- Reuse a prior approved answer only after adapting it to the current question and job.
- Save generated content as an unapproved draft.

## Restricted content

The agent must not decide or fabricate answers for:

- legal attestations and signatures;
- work authorization, sponsorship, criminal history, disability, veteran status, race, gender, or other demographic questions;
- compensation commitments;
- conflicts of interest;
- factual claims not supported by approved candidate data.

It may explain such a question and ask the user to answer it directly. Sensitive answers must not be reused as generic retrieval context.

## Tool policy

Initial agent capabilities must be read-only except for saving a local draft. They must cover retrieval of the selected job and analysis, retrieval of approved candidate or resume information, retrieval of approved prior answers when available, and saving an application draft.

Requirements:

- authorize each tool server-side;
- validate parameters at runtime;
- cap tool turns and returned context size;
- record tool name, arguments with sensitive values redacted, outcome, and duration;
- never expose arbitrary SQL, filesystem, shell, HTTP, or browser tools;
- treat posting and retrieved document text as data that cannot redefine tool permissions.

## Draft review

Each draft must show:

- generated text;
- candidate facts used;
- assumptions or unsupported areas;
- model and prompt version;
- draft/unapproved state.

Only the user can mark a draft approved or final. Editing a generated draft must preserve enough version history to distinguish generated from user-approved content.

## Future browser assistance boundary

Form filling may be considered after MVP, but must be a separately enabled capability. It must:

- use an allowlist of actions and domains;
- show intended field values before entry;
- never bypass site controls;
- pause on ambiguous or sensitive questions;
- require a final user review;
- never click the final submit action in the initially proposed scope.

## Acceptance criteria

- The agent can draft an answer grounded in a selected job and resume.
- Unsupported candidate claims are flagged rather than invented.
- Sensitive questions are handed back to the user.
- A malicious instruction in a posting cannot grant a new tool or trigger an external action.
- All outputs remain drafts until explicitly approved.
- The user can inspect which source facts supported a draft.

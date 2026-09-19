# Web Interface and Reporting Requirements

## Scope

Provide a local web interface for configuration, recommendation review, application tracking, and basic reporting. Mobile usability is desirable; desktop is the primary MVP layout.

## Required views

### Setup

- Candidate-profile editor.
- Search-profile editor for hard constraints, soft preferences, aliases, weights, and thresholds.
- Source configuration and manual URL import.
- AI provider status, selected model, budgets, and data-sharing explanation.

### Discovery runs

- Start a run manually.
- Show run progress and stage counts.
- Show adapter, extraction, rate-limit, and AI errors with retry controls.
- Distinguish no results from an incomplete or failed run.

### Recommendation inbox

- Sort and filter by recommendation, scores, company, date, workplace type, salary, availability, and review state.
- Show deterministic and AI scores separately.
- Expand an explanation with matched evidence, gaps, unknowns, and rule outcomes.
- Save, dismiss, upvote, downvote, override, or mark applied.
- Open the original posting and show when it was last checked.

The analyzer recommendation and job workflow status must be displayed as separate concepts. Marking a job applied creates or updates its application; it does not introduce an `applied` job status.

### Job detail

- Stored posting fields and original source values.
- Description and cited evidence.
- latest availability result, evidence, and check time;
- crawler filter details and current AI analysis;
- feedback history;
- related application and artifacts;
- possible duplicate warning.

### Application board/list

- Show applications grouped or filtered by current status.
- Add a manual application.
- Change status while recording event date and optional note.
- Track deadlines and free-form application or interview notes.
- Generate and review draft answers.

Adding a manual application must create a minimal user-entered job posting first so every application retains the same required relationship.

### Dashboard

At minimum display for a selectable date range:

- jobs discovered, analyzed, recommended, saved, and dismissed;
- applications submitted;
- recruiter-screen/callback rate;
- interview rate;
- rejection rate.

Offer rate, withdrawal rate, stage conversion, time in stage, source effectiveness, and detailed AI usage are later reporting enhancements rather than MVP release requirements.

Every metric must define its numerator, denominator, and date basis in the interface. Small samples should be labeled rather than presented as strong conclusions.

## Usability requirements

- Require confirmation for destructive actions and merges.
- Allow undo where practical for dismissals and status changes.
- Preserve filters and navigation state during review.
- Provide explicit loading, empty, partial, and error states.
- Make recommendation labels understandable without color.
- Support keyboard operation for the review queue.
- Do not expose raw secrets or sensitive candidate fields in logs or generic error messages.

## Acceptance criteria

- A user can go from URL import to recommendation review without using the CLI.
- A user can understand why a job was filtered or recommended.
- Updating an application stage immediately updates its timeline and derived metrics.
- The dashboard never counts a saved job as an application unless an application exists.
- AI-unavailable and crawl-partial states are clearly distinguishable from successful empty results.

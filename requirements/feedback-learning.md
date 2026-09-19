# Feedback and Future Learning Requirements

## Objective

Capture high-quality preference signals now without requiring machine learning in the MVP. Later ranking improvements must be measurable, reversible, and subordinate to explicit hard constraints.

## MVP feedback capture

The user can provide:

- upvote or downvote;
- optional reason codes;
- optional free-text explanation.

Suggested reason codes include title, seniority, skills, company, industry, compensation, location, workplace type, responsibilities, growth, culture language, and duplicate/irrelevant.

For each explicit feedback event retain:

- job identity;
- event type and reason;
- timestamp;
- whether the feedback was later retracted or replaced.

Saving, dismissing, applying, and employer outcomes remain separate workflow data. They may become behavioral features later but are not explicit preference votes. Do not treat lack of interaction as a downvote.

## Later rule-based personalization

Before ML, the product may add transparent rule tuning:

- summarize repeated feedback reasons;
- suggest changes to aliases, weights, or exclusions;
- require user confirmation before modifying a search profile;
- show the expected impact using historical jobs where possible.

This is likely more useful and safer than training a model on a small personal dataset.

## Future learned ranking

When enough feedback exists, introduce a ranking service behind a versioned interface. Start with interpretable techniques such as logistic regression, pairwise ranking, or a lightweight gradient-boosted model using structured features and optional text embeddings.

Potential features:

- title and skill overlap;
- compensation and location compatibility;
- seniority distance;
- deterministic and AI component scores;
- company/industry preferences;
- embedding similarity between posting and liked jobs;
- explicit reason-code history.

Protected or sensitive attributes must not be model features. Employer outcomes such as rejection should be analyzed separately from personal preference: rejection does not mean the user disliked the job.

## Evaluation and rollout

- Preserve enough historical inputs before training begins to support chronological evaluation and reduce leakage.
- Compare learned ranking against the existing deterministic/AI baseline.
- Measure top-k usefulness, accepted recommendation rate, false-negative review samples, and ranking stability.
- Record model, feature, training-data window, and metric versions.
- Run new ranking in shadow mode before it affects recommendations.
- Allow disabling learned ranking and reverting to a previous policy.
- Never let learned preferences override explicit hard constraints without user approval.

## Cold start and exploration

- Begin with explicit profile rules and AI analysis.
- Do not claim personalization from a handful of votes.
- If exploration is later added, label exploratory recommendations and keep their proportion configurable.
- Provide a way to reset or exclude old feedback when preferences change.

## Acceptance criteria for future implementation

- Historical explicit feedback can be reconstructed in event order.
- A trained ranker can reproduce its inputs from the snapshots or versions retained when learned ranking is introduced.
- Offline evaluation shows an improvement over baseline before launch.
- Users can understand major ranking factors and disable personalization.
- Profile changes and preference changes do not silently corrupt historical evaluation.

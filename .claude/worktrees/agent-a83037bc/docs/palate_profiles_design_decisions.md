# Palate Profiles Design Decisions

Date: 2026-03-12
Last synced from Notion: 2026-03-12
Status: Canonical repo implementation spec for Phase B / launch-track work

## Purpose

This document is the repo-local source of truth for the locked v1 algorithm design of the Palate Profiles recommendation system.

Use this file as the implementation contract when writing code in this repository.

If this file conflicts with older repo notes or exploratory docs, this file wins unless a newer decision is explicitly recorded in the worklog and then merged back here.

## Source Material

This file is seeded from the following Notion pages as they existed on March 12, 2026:

- `Algorithm Implementation Briefing`
- `Implementation Handoff - Scoring Engine Build Guide`
- `Design Decisions - Sections 1-9 (Data Layer)`
- `Design Decisions - Sections 10-16 (Scoring Engine + Profile Selection)`

Related repo context:

- `docs/codex_algofeedback.md`
- `docs/codex_rollout_phases.md`
- `docs/codex_app_integration_changes.md`

## Product Positioning

Launch the system as a deterministic taste-matching engine informed by structured wine knowledge and user feedback.

Do not position it as:

- a perfect bottle identifier
- a black-box AI recommender
- a chat-first product with hidden reasoning

AI is used for extraction assistance and explanation phrasing, not for the underlying recommendation logic.

## Core Model

The system builds an effective wine vector by anchoring on a canonical base profile and applying relative modifiers.

High-level pipeline:

1. Resolve scan output to canonical wine identity fields.
2. Select the best base profile using the fallback hierarchy.
3. Apply modifier layers to build the effective wine vector.
4. Score the effective wine vector against the user's per-type preference vector.
5. Normalize the score and apply the balance multiplier.
6. Compute confidence as a separate output.
7. Generate explanation output from structured score decomposition.

## Locked Decisions

### 1. Base Profile as Identity Anchor

All wine matching starts from a base profile that defines the wine's identity.

Modifiers are always relative to the base profile, never absolute replacements.

Implication:

- a hot-year Burgundy can become richer than normal
- it must still not drift into Napa Cabernet territory

### 2. Modifier Stack

Modifier application order:

1. Base profile
2. Aging curve deltas
3. Vintage weather deltas
4. Grape sensitivity multipliers applied to vintage deltas
5. Classification tier deltas
6. Producer deltas
7. Relative clamp
8. Phase-shift logic and explanation-friendly transforms

The clamp is applied once after total delta accumulation, not after each modifier.

### 3. Relative Modifier Clamp

Clamp effective values relative to the base profile:

```text
if delta >= 0:
  ceiling = base + (5 - base) * 0.5
  effective = min(base + delta, ceiling)

if delta < 0:
  floor = base - (base - 1) * 0.5
  effective = max(base + delta, floor)
```

This preserves typicity while still allowing meaningful movement.

### 4. Match Distance Metric

Use weighted Euclidean distance for scoring:

```text
distance = sqrt(sum(w_i * (user_i - wine_i)^2))
```

Why this is locked:

- magnitude matters in wine
- it is debuggable
- it supports per-axis explanation output

Do not use cosine similarity in the launch implementation.

### 5. Axis Weights

Start with expert priors and adapt over time with user behavior.

Initial priors:

- `1.2`: `body`, `acidity`, `tannin`, `fruit_ripeness`
- `1.0`: `oak_presence`, `concentration`, `aromatic_intensity`, `finish_length`, `freshness`
- `0.8`: `earthy`, `mineral`, `savory`, `alcohol_perception`
- `0.6`: `sweetness_perception`, `bitterness_phenolic_grip`

Behavior-driven learning is allowed to adjust these later, but launch code should start from these priors.

### 6. Score Normalization

Convert distance to a 0-100 score via sigmoid:

```text
score = 100 / (1 + e^(k * (distance - midpoint)))
```

Initial score bands:

- `90-100`: Excellent match
- `75-89`: Strong match
- `60-74`: Decent match
- `<60`: Not your style

`k` and `midpoint` are tuning parameters and are not yet locked numerically.

### 7. Balance Handling

Balance is a quality multiplier, not a preference axis.

Launch formula:

```text
final_score = sigmoid_score * balance_factor
```

Balance factor mapping:

- `overall_balance = 5 -> 1.00`
- `overall_balance = 4 -> 0.96`
- `overall_balance = 3 -> 0.92`
- `overall_balance = 2 -> 0.88`
- `overall_balance = 1 -> 0.85`

The explanation layer may call out a balance penalty when it materially changes the score.

### 8. Confidence Handling

Confidence is a separate signal and a ranking tiebreaker.

It does not modify the taste-match score.

Minimum confidence to show a score: `50%`

Minimum information to score:

- `wine_type + country`, or
- `country + varietal`

Fallback level contributes directly to confidence.

### 9. Per-Type User Preference Vectors

Each user maintains separate preference vectors and weights for:

- Red
- White
- Sparkling
- Rose
- Sweet/Dessert
- Orange

Do not average across wine types in the core user model.

### 10. Cross-Category Transfer

Sparse wine types inherit signal from global or richer type profiles using Bayesian shrinkage.

Starting formula:

```text
shrinkage_weight = category_event_count / (category_event_count + 10)
```

Interpretation:

- `0 events -> 0.0`
- `10 events -> 0.5`
- `30 events -> 0.75`

This is part of the model shape, but tuning details remain open.

### 11. Base Profile Fallback Hierarchy

Use a first-match-wins fallback chain:

1. `sub_region x varietal x wine_type`
2. `sub_region x wine_type`
3. `region x varietal x wine_type`
4. `region x wine_type`
5. `country x wine_type`
6. `wine_type only`

Level 6 is below the confidence threshold and should not produce a displayed score.

Tiebreakers at the same level:

1. primary grape overlap
2. matching blend style
3. higher overall balance

### 12. Canonical Resolution Before Lookup

Normalize fields before base-profile lookup:

- region via region alias map
- producer via producer alias map
- varietal via grape synonym map

If no alias is found, preserve the raw extracted value and continue with fallback logic.

### 13. User Feedback Collection

Launch data collection should move beyond binary like/dislike.

Preferred fields:

- enjoyment rating, ideally `1-5`
- would drink again
- optional note
- optional context such as with food / without food
- optional context such as tasting / casual

### 14. Explanation Layer

Explanation output should be derived from structured per-axis contributions, not freeform AI invention.

AI may narrate:

- strongest matches
- strongest mismatches
- balance penalties
- low-confidence caveats
- cross-category caveats

## Data Assets Expected by the Design

The March 12, 2026 design references the following data assets:

- `204` base profiles
- aging curves
- `2,150` vintage weather modifier rows
- classification tier modifiers
- `675` producer modifiers
- `61` grape sensitivity rows
- `30` dessert wine profiles
- `56` grape synonym mappings
- `874` region aliases
- `1,720` producer aliases
- `91` producer-region crosswalk rows

The repo should operationalize these into a versioned serving source of truth rather than relying on Google Sheets at runtime.

## Implementation Constraints

These constraints are important enough to treat as guardrails:

- Keep all sensory scoring on a `1-5` scale.
- Keep `earthy`, `mineral`, and `savory` as separate axes.
- Use `aromatic_intensity` as the axis name.
- Keep balance separate from taste preference.
- Keep confidence separate from score.
- Preserve raw extracted values alongside normalized canonical values.
- Log fallback level and normalization outcomes for every scoreable scan.

## Deferred / Not in Scope for Launch Build

These ideas are valid but should not quietly slip into v1 implementation:

- user-contextual confidence weighting
- context-shift offsets for food pairing
- tasting-note parsing as a direct preference signal
- interaction terms between axes
- bottle-level modifiers
- temporal decay on affinity scores
- complex ML replacements for deterministic vector scoring

## Known Reconciliation Notes

A few older materials in Notion and repo notes evolved over time. The canonical choices for repo implementation are:

- weighted Euclidean, not cosine
- confidence shown separately, not multiplied into score
- balance used as a multiplier, not as a preference dimension
- per-type vectors retained, not collapsed into one user vector

If future work changes any of these, update this file and record the change in the worklog on the same day.

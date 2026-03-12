# Codex Rollout Phases

Date: 2026-03-12

## Purpose

This document outlines a practical rollout sequence for getting the palate-profile recommendation engine from current app state to launch readiness.

It is intentionally phased and not yet deeply task-broken.

## Phase 0: Data Operationalization

Focus:
- centralize algorithm-serving data
- prepare the schema
- make imports repeatable

Main themes:
- bring profile and modifier datasets into an operational database
- define canonical entities for regions, appellations, producers, classifications, and grape aliases
- create import scripts and dataset versioning
- validate row coverage and fallback coverage

Goal:
- one trusted source of truth for serving recommendation data

## Phase 1: Normalization and Resolution

Focus:
- turn scan output into structured canonical inputs

Main themes:
- improve label scan output into structured fields
- normalize region and appellation names
- normalize producer names
- normalize classification labels
- map grape synonyms
- store raw values, canonical values, and confidence

Goal:
- a scanned bottle can usually be resolved to a scoreable identity

## Phase 2: Vector Assembly Engine

Focus:
- build the deterministic wine-vector pipeline

Main themes:
- select the best available base profile
- apply aging curve effects
- apply vintage modifiers
- apply grape sensitivity multipliers
- apply classification modifiers
- apply producer modifiers
- clamp to preserve typicity

Goal:
- one service can reliably assemble an effective wine vector for a scanned bottle

## Phase 3: User Preference Foundation

Focus:
- improve user signal collection and derive palate profiles

Main themes:
- upgrade rating collection beyond binary like/dislike
- introduce preference events
- create per-type user palate profiles
- establish default priors for new users
- compute or refresh user vectors from collected ratings

Goal:
- the system can score a wine against a user-specific palate profile

## Phase 4: MVP / Internal Alpha

Focus:
- prove end-to-end recommendation quality on real scans

Main themes:
- score scanned wines for users
- expose confidence-aware explanations
- review scan resolution failures
- validate vector outputs against known intuitive cases
- tune fallback and suppression thresholds

Goal:
- an internal version that is directionally accurate and debuggable

## Phase 5: Launch Candidate

Focus:
- add the full launch modifier stack and harden the product

Main themes:
- productionize region/appellation base profile retrieval
- ensure vintage plus aging logic is stable
- enable classification modifiers
- enable producer modifiers
- tighten confidence logic
- improve explanation clarity
- improve catalog recommendation surfaces

Goal:
- all launch-critical algorithm components are live and stable

## Phase 6: Launch Readiness

Focus:
- make the system operationally safe and user-facing

Main themes:
- monitoring and logging
- resolution QA workflows
- data refresh cadence
- dataset version visibility
- user-facing recommendation surfaces
- graceful handling of low-confidence scans

Goal:
- recommendation quality is strong enough to ship and support

## Phase 7: Post-Launch Iteration

Focus:
- improve personalization depth after real usage data starts arriving

Main themes:
- tune per-axis weights
- improve cross-category transfer
- improve onboarding priors
- incorporate more contextual signals
- explore structured tasting-note feedback
- expand recommendation and discovery surfaces

Goal:
- move from directionally accurate recommendations to highly personalized ones

## Suggested MVP Scope

The MVP should prove the recommendation engine without trying to solve every future feature at once.

Include:
- canonical normalization
- base profile selection
- aging and vintage logic
- per-type user vectors
- weighted Euclidean scoring
- confidence gating
- explanation output

Keep lighter initially:
- advanced note parsing
- contextual offsets
- interaction terms
- more experimental transfer logic

## Suggested Launch Scope

For launch, include:
- region and appellation profile retrieval
- aging curve effects
- vintage modifiers
- grape sensitivity support where available
- classification modifiers
- producer modifiers
- deterministic scoring and explanations
- stronger user feedback collection

## Bottom Line

The path to launch should move in this order:
- operationalize the data,
- normalize what the scan sees,
- assemble wine vectors deterministically,
- collect better user feedback,
- then expose recommendations with confidence-aware explanations.

That sequence gives the best balance between speed, correctness, and product usefulness.

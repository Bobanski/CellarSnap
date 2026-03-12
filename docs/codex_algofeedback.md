# Codex Algorithm Feedback

Date: 2026-03-12

## Purpose

This document reviews the current palate-profile algorithm and dataset design from an implementation and product-readiness perspective. It focuses on whether the proposed system is sound, what is strongest about it, where the main risks are, and what should be tightened before implementation.

## Overall Assessment

The proposed approach is strong and worth pursuing.

Why:
- The system is grounded in structured wine domain knowledge rather than generic LLM guesswork.
- The core recommendation loop is explainable.
- The data model is rich enough to support graceful fallbacks instead of all-or-nothing bottle identification.
- The modifier stack reflects real-world wine behavior better than a flat catalog or collaborative-filtering-only approach would.

My recommendation is to treat the launch version as a deterministic vector recommender with AI used only for extraction and explanation phrasing.

## What Looks Strong

### 1. Identity Anchor + Relative Modifiers

The strongest design decision is using a base profile as the identity anchor and applying all other effects as relative modifiers.

Why this is good:
- It preserves typicity.
- It gives the system a stable fallback even when bottle-level data is incomplete.
- It prevents modifier stacking from turning one wine family into a different wine family.

This is the right foundation for launch.

### 2. Modifier Coverage Is Broad Enough for Meaningful Recommendations

The current asset set appears sufficient for a strong first recommendation engine:
- Regional base profiles
- Producer modifiers
- Vintage/weather modifiers
- Grape sensitivity coefficients
- Classification tier modifiers
- Dessert wine profiles
- Grape synonym mapping

This is enough to build an effective wine vector from partial scan data without waiting for a perfect canonical bottle database.

### 3. Weighted Euclidean Is the Right Starting Scorer

Weighted Euclidean is a good launch choice because:
- it respects magnitude differences,
- it is easy to debug,
- it supports per-axis explanations,
- it fits the "how close is this wine to what you like" mental model.

It is a much better launch choice than a more complex hybrid approach.

### 4. Per-Type Preference Vectors Are Correct

Separating user preference vectors by wine type is the right decision.

A single global palate vector would blur important preferences:
- high-acid whites vs lower-acid reds,
- sparkling vs still,
- dessert vs dry.

For launch, this should be preserved.

### 5. Confidence as a Separate Signal Is Smart

Confidence should be shown separately rather than multiplied into the score.

That avoids:
- bias toward over-documented wines,
- fake precision,
- hiding good matches just because producer or vintage details are missing.

This should stay in the design.

## Main Risks To Address

### 1. Canonical Resolution Is Now the Critical System

The biggest implementation risk is no longer the scoring formula. It is resolving scan output into the right canonical inputs.

Most launch failures will come from:
- inconsistent region naming,
- appellation aliases,
- producer naming variants,
- classification naming drift,
- ambiguous wine type extraction.

Recommendation:
- make normalization and resolution a first-class subsystem,
- log resolution decisions,
- store confidence at the field level,
- define a strict fallback hierarchy before building scoring APIs.

### 2. The Base Profile Selection Logic Needs To Be Explicit

The current materials describe strong datasets, but launch logic must clearly define which base profile is selected when the scan is incomplete.

This should be documented in exact priority order, for example:
1. appellation x varietal
2. region x varietal
3. appellation x wine type
4. region x wine type
5. broader regional fallback

Without this, implementations will drift and results will be inconsistent.

### 3. Dataset Versioning Needs To Be Operational, Not Informal

The current data is rich, but it appears to live across Google Sheets, CSVs, SQL seed files, and Notion documentation.

That is fine for design, but not for production.

Recommendation:
- move all algorithm-serving data into a single operational source of truth,
- version every import,
- record dataset version on generated vectors and scores,
- preserve re-runnability of imports.

### 4. User Feedback Signal Is Still Too Thin in the Current App

The current app mostly captures binary like/dislike plus notes.

That is enough to start, but weak for fast personalization.

Recommendation:
- upgrade launch data collection to at least:
- 1-5 enjoyment rating
- would drink again
- optional confidence in the rating
- optional context such as with food / no food

This will improve personalization more than adding another layer of model complexity.

### 5. Some Design Sections Still Need Final Reconciliation

The design is strong overall, but a few parts appear to have evolved over time:
- earlier sections refer to cosine-style matching language,
- later sections clearly choose weighted Euclidean,
- some confidence and integration wording still reflects older decisions.

Recommendation:
- create one canonical implementation spec for launch,
- mark deferred items clearly,
- avoid letting old and new scoring assumptions coexist.

## Launch Recommendations

These should be in scope for launch:
- base profile selection from region/appellation identity
- aging curve effects
- vintage modifiers
- grape sensitivity multipliers
- classification modifiers
- producer modifiers
- typicity-preserving clamp
- per-type user preference vectors
- weighted Euclidean scoring
- separate confidence score
- structured explanation output

These should be deferred unless already nearly implemented:
- contextual preference shifts for food
- sophisticated cross-category transfer tuning
- note parsing as strong structured preference signal
- interaction terms between axes
- bottle-specific modifiers

## Recommendation on Product Positioning

For launch, the product should present itself as:
- a structured taste-matching engine,
- informed by wine knowledge and user feedback,
- with confidence-aware recommendations.

It should not present itself as:
- a perfect bottle identifier,
- a pure AI chatbot,
- or a magical black-box recommendation model.

That positioning will match the real strengths of the system.

## Bottom Line

The algorithm design is fundamentally sound.

The dataset design is already strong enough to support a meaningful launch if operationalized correctly.

The highest-value next step is not inventing a new model. It is making canonical resolution, dataset versioning, and user feedback collection robust enough that the existing design can run consistently in product.

# Codex App Integration Changes

Date: 2026-03-12

## Purpose

This document maps the main application, schema, and data-collection changes needed to get the palate-profile algorithm running inside the existing app.

It is intentionally implementation-oriented and focused on what needs to change in the current product, backend, and data flow.

## Current App Baseline

The existing app is best described as:
- label scan and AI analysis,
- wine log storage,
- basic like/dislike capture,
- generic wine chat.

To run the recommendation engine, the app needs to evolve from storing loose wine entries into producing scoreable canonical wine identities and structured user preference signals.

## Core Shift Required

The key application shift is:

From:
- storing a scanned bottle as a mostly freeform wine log

To:
- resolving a scanned bottle into a canonical structured identity
- assembling an effective wine vector from base profile plus modifiers
- scoring that wine against a user palate profile
- storing preference events that improve future recommendations

## Required Schema Changes

### Canonical Wine Domain Tables

Add or operationalize:
- `regions`
- `appellations` or a region hierarchy that supports appellation-level lookup
- `region_aliases`
- `appellation_aliases`
- `producers`
- `producer_aliases`
- `classification_tiers`
- `grape_aliases`

Purpose:
- normalize scan output,
- support deterministic resolution,
- support modifier lookup by canonical IDs rather than raw text.

### Vector and Modifier Tables

Add or operationalize:
- `base_profile_vectors`
- `aging_curves`
- `vintage_modifiers`
- `grape_sensitivity_coefficients`
- `classification_modifiers`
- `producer_modifiers`
- `dataset_versions`

Purpose:
- keep the recommendation engine driven by versioned structured data,
- avoid serving directly from spreadsheets or untracked CSV snapshots.

### User Preference Tables

Add:
- `user_preference_events`
- `user_palate_profiles`
- optional `tasting_sessions`

Purpose:
- capture the actual signals used to learn user taste over time,
- separate event history from the derived user profile.

### Scan and Resolution Tables

Add:
- `scan_resolution_logs`
- optional `raw_scan_payloads`

Purpose:
- debug failed scans,
- audit normalization behavior,
- improve extraction and alias coverage over time.

## Required Data Collection Changes

### Upgrade User Feedback Beyond Binary Like/Dislike

Current data collection is too thin for fast personalization.

Recommended launch fields:
- enjoyment rating, ideally 1-5
- would drink again, yes/no
- optional note
- optional context: with food / without food
- optional context: tasting vs casual drink

These additions matter more than adding model complexity early.

### Capture Field-Level Resolution Confidence

Each scan should store confidence separately for:
- wine type
- region
- appellation
- producer
- vintage
- classification
- grape, if inferred

That confidence will drive:
- score suppression,
- UI messaging,
- QA review,
- fallback selection.

### Preserve Raw and Normalized Values

For every scanned wine, store:
- raw extracted text
- normalized canonical fields
- resolution method
- resolution confidence

This will make it possible to improve the resolver without losing the original signal.

## Required Backend Changes

### 1. Replace "Analyze and Save" With "Extract, Resolve, Assemble, Save"

The upload flow should become:
1. extract structured wine fields from the label scan
2. normalize and resolve canonical entities
3. choose the best base vector
4. assemble the effective wine vector from modifiers
5. compute confidence
6. save both the scan record and the structured resolution

### 2. Add a Vector Assembly Service

This service should:
- select the base profile,
- apply aging,
- apply vintage effects,
- apply grape sensitivity multipliers,
- apply classification deltas,
- apply producer deltas,
- clamp to preserve typicity.

It should be deterministic and independently testable.

### 3. Add a Scoring Service

This service should:
- load the user's palate profile for the relevant wine type,
- score the effective wine vector,
- return a normalized match score,
- return per-axis contributions,
- return confidence separately.

### 4. Add a User Preference Update Path

When a user rates a wine, the app should:
- create a preference event,
- update or queue recomputation of the relevant user palate profile,
- keep the event log append-only when possible.

### 5. Add Recommendation Endpoints

At minimum:
- score a scanned wine for a user
- get top matching wines from the available catalog
- get explanation output for a recommendation

## Required Frontend Changes

### Upload Flow

The upload experience should expose:
- extracted wine identity
- any unresolved or low-confidence fields
- match score when confidence is sufficient
- explanation of what drove the match

### Feedback Flow

After scan and after drinking, collect better preference signals:
- rating
- drink again
- optional note
- optional context

### Profile View

The profile should evolve from a wine log into:
- saved wines
- rating history
- top preferences by type
- explanation of palate profile

### Recommendation Surface

The app needs a dedicated recommendation surface, not just scan results:
- "best matches for you"
- "because you liked"
- "high confidence"
- "explore with lower confidence"

## Data Operationalization Changes

### Move Serving Data Into a Production Store

Current design materials reference Google Sheets, CSVs, SQL seed files, and Notion pages.

That is fine for authoring, but app-serving data should live in one operational system, ideally Postgres/Supabase.

### Version All Imports

Every import should record:
- source file or sheet
- import timestamp
- dataset version
- transformation script version

This is especially important for debugging recommendation changes over time.

## What Does Not Need To Change Yet

These can stay lightweight initially:
- chatbot intelligence
- advanced note parsing
- complex cross-category transfer logic
- heavy ML infrastructure

The app can become useful before any of those are expanded.

## Summary

To get the algorithm running, the app must add three new capabilities:
- canonical resolution,
- deterministic vector assembly,
- structured user preference learning.

Those are the real bridge between the current product and the recommendation system you have already designed.

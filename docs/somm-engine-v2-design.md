# Somm Engine v2 — "Distilled Somm" design

**Status:** implemented (first cut) on `feat/distilled-somm` · July 2026
**Eval evidence:** `scripts/somm-eval/` run against real head-to-head tasting data
(103 blind pairwise picks, 12 tasters, 2 tastings — data gitignored, results summarized here)

## The question

Can an LLM acting as a master sommelier ("expert replication") recommend wines
better than the deterministic 16-axis engine and simple baselines — and can it
do so fast enough to rank a 40-wine restaurant list at scan time?

## What the eval showed

Holdout protocol: per taster, half their head-to-head picks are shown to the
predictor as history; it must predict the other half. Aggregated across fold
seeds (single-seed numbers at n≈50 swing ±8 points and cannot be trusted).

| Predictor | Accuracy | Pairwise latency (p50) |
|---|---|---|
| Claude Sonnet + manual + **raw pick history** | **55.5%** (3 seeds, n=137) | ~13s |
| Tiny per-user logistic model on style features (group prior + own picks) | **56.8%** (10 seeds, n=500) | ~0ms |
| Group consensus (crowd win rates) | 53.7% / 50.3%¹ | ~0ms |
| Distill-once → small-model pairwise | 40.7% ⚠️ | ~5s |
| Random | 42.7% | — |

¹ 53.7% on the 3-seed subset, 50.3% across 10 seeds — i.e., statistically a coin flip.

Five conclusions drive the design:

1. **Personal signal is real and reachable.** With as few as 3–10 picks, both a
   context-rich LLM and a tiny personal feature model beat crowd consensus.
   These wines were all "good" — crowd preference doesn't transfer between
   palates, so collaborative signal alone is a dead end at this data scale.
2. **No LLM can rank at scan time.** 5–13s per pairwise judgment; a 40-wine
   list needs milliseconds. This is structural, not a prompting problem.
3. **Compression loses the signal.** Predicting from a distilled prose profile
   (instead of the raw picks) collapsed accuracy to below random. Whatever the
   LLM exploits lives in the specific evidence, not the summary. Any distilled
   artifact must therefore (a) be consumed by the *deterministic* engine as
   numeric seeds, not re-interpreted by a smaller LLM, and (b) keep raw
   evidence alongside prose wherever an LLM consumes it later.
4. **Forced-tool schema order is an accuracy lever.** `reasoning` before
   `winner` was worth ~11 accuracy points. Encoded in
   `src/server/anthropic/client.ts` docs.
5. **Head-to-head "big wine bias" is mild** (56/44 big-vs-light at group level)
   and per-person modelable — comparisons are usable training signal, with a
   caveat that pairwise tasting slightly favors bigger styles vs. solo drinking.

## The architecture

**AI at profile-build time and explanation time. Math at rank time.**

```
                       (offline / on-demand, expensive, Sonnet)
 user history ───────► palate distillation ───► palate_profiles (jsonb cache)
 (entries, ratings,      manual as system            │
 notes, survey,          prompt, reasoning-first     │ 16-axis seeds + narrative
 comparisons)            forced tool call            ▼
                                          buildUserPreferenceVector(entries, type, seed)
                                                     │  (seed fades by SURVEY_FADE_THRESHOLD,
                                                     │   scaled by profile confidence)
 scanned list ───► parse/OCR ───► deterministic 16-axis scoring (ms per wine)
                                                     │ top picks
                                                     ▼
                       (scan time, cheap+fast, Haiku) explanation notes:
                       "why this fits YOUR palate" + narrative voice
```

Components:

- **`src/server/anthropic/client.ts`** — minimal fetch-based Messages API
  client; forced tool calls, prompt caching, retries. No SDK dependency.
- **`src/server/algorithm/palateDistillation.ts`** — gathers signal (last 60
  rated entries, survey, last 40 comparison feedbacks), calls Claude with the
  sommelier manual, stores `DistilledPalateProfile` (per-type 16-axis seeds +
  prose narratives + confidence) in `palate_profiles` (migration 094).
  Signal-hash + 6h interval guard against redundant re-distillation.
- **`PreferenceSeed`** (`userPreferences.ts`) — the survey path generalized:
  `buildUserPreferenceVector` now takes survey OR distilled seed; identical
  fade mechanics, scaled by profile confidence. Backward compatible.
- **Cold-start unlock** — list-scan scoring and recommendation notes required
  5+ rated entries with notes; a distilled profile now stands in, so a new
  user who completes the survey (or imports history) gets personalized scores
  on day one.
- **`POST /api/palate/distill`** — explicit refresh endpoint (rate-limited,
  6/hr); scoring paths only ever read the cache.
- **Recommendation notes v2** — Claude Haiku with the palate narrative writes
  the "why you'd like it" lines (falls back to OpenAI, then static notes).

## What we deliberately did NOT build

- LLM-ranked lists (latency + no accuracy edge over the seeded engine).
- Crowd-consensus features in scoring (no transferable signal at this scale).
- A per-user logistic head on comparisons — it matched the LLM's accuracy in
  eval and is worth revisiting once comparison volume grows; the natural home
  is a "comparison-derived axis nudge" inside `buildUserPreferenceVector`.

## Follow-ups

1. Trigger distillation automatically (post-survey, every N new entries) via a
   background job instead of the manual route.
2. Feed distilled seeds into `cacheRefresh.ts` and the sommelier chat's
   preference summary (currently seedless).
3. Surface the narrative in the app ("Your palate, read by the somm") — the
   distillation output is user-facing quality already.
4. Third tasting night: record ties honestly, log every wine (six 1st-tasting
   wines + 2nd-tasting #13 were missing from the log and cost 25 of 128 picks),
   and consider single-glass ratings alongside head-to-heads to measure the
   big-wine bias directly.
5. Re-run `scripts/somm-eval` with the `engine` predictor once tasters have
   logged entries, to A/B the seeded vs. unseeded deterministic engine.

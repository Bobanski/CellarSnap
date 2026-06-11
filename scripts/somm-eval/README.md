# Somm cold-start eval harness

Tests whether an LLM prompted with the sommelier manual (`docs/sommelier-manual.md`)
can predict real head-to-head tasting preferences better than the deterministic
engine and naive baselines — i.e., whether "replicate an expert with AI" works as
a cold-start recommender before we have enough logged data.

## Predictors

| Name | What it does |
|---|---|
| `llm` | Manual as system prompt + taster profile + wine pair → predicted winner (OpenAI structured output, default `gpt-5-mini`) |
| `engine` | The real algorithm, unmodified: survey-seeded preference vector (`buildUserPreferenceVector`) + assembled wine profile (`assembleWineProfile`, live Supabase reference data) + `computeMatchScore`. Runs via `npx tsx scripts/somm-eval/engine-predict.ts` |
| `price` | Baseline: the more expensive bottle wins |
| `random` | Baseline: deterministic coin flip |

If `llm` doesn't beat `engine` and `price` on cold-start tasters (few/no logged
wines), the manual approach isn't earning its keep.

## Data files

Drop real data into `scripts/somm-eval/data/` (gitignored):

- **`tasters.json`** — one entry per friend. The `survey` object matches the
  `TasteSurveyRow` shape in `src/server/algorithm/surveySeeding.ts`;
  `sensory_loves` / `sensory_avoids` must use the exact chip strings from
  `LOVE_AXIS_MAP` / `AVOID_AXIS_MAP` (validated on load; run `--dry-run` to
  check). `completed_at` must be set or survey seeding is skipped.
  `logged_wines` is optional — include it to test the warm-start regime too.
- **`comparisons.csv`** — one row per head-to-head. `winner` is `a`, `b`, or
  `tie` (record ties honestly — forced winners poison the eval). `blind` is
  `y`/`n`; non-blind results carry label bias, which is worth segmenting later.
  `price` should be what was paid (any consistent currency).

The `.template` versions of both files show the format and are used (with a
warning) when the real files are missing.

## Running

```bash
# validate data only — no API calls, no DB
npm run eval:somm -- --dry-run

# cheap baselines only
npm run eval:somm -- --predictors=price,random

# the full panel
npm run eval:somm -- --predictors=llm,engine,price,random
```

Flags: `--model=` (LLM model), `--limit=N` (first N comparisons),
`--tasters=` / `--comparisons=` (alternate data paths), `--out=` (results path).

Requires `.env.local` at the repo root (read automatically) with
`OPENAI_API_KEY` for `llm` and `NEXT_PUBLIC_SUPABASE_URL` +
`SUPABASE_SERVICE_ROLE_KEY` for `engine`.

## Scoring

Accuracy is computed over comparisons with a decisive ground truth (`a`/`b`)
where the predictor made a decisive call; predicted ties count as abstentions
(reported separately), and ground-truth ties are excluded. Per-comparison
detail — including each LLM prediction's reasoning — is written to
`scripts/somm-eval/results/` for error analysis.

Sample-size note: below ~100 decisive comparisons, treat differences between
predictors as directional, not significant.

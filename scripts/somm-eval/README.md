# Somm cold-start eval harness

Tests whether an LLM prompted with the sommelier manual (`docs/sommelier-manual.md`)
can predict real head-to-head tasting preferences better than the deterministic
engine and naive baselines — i.e., whether "replicate an expert with AI" works as
a cold-start recommender before we have enough logged data.

## Predictors

| Name | What it does |
|---|---|
| `llm` | Manual as system prompt + taster profile + wine pair → predicted winner (OpenAI structured output, default `gpt-5-mini`) |
| `claude` | Same shape on the Anthropic Messages API (default `claude-sonnet-5`, manual prompt-cached, reasoning-first tool schema). `--crowd-context` additionally shows it group win rates |
| `claude-profile` | Two-stage, mirroring the proposed production architecture: one distillation call per taster (`--claude-model`) compresses their history into a compact palate profile, then a small fast model (`--fast-model`, default Haiku) predicts each pair from the profile alone — no manual in the pairwise prompt. Pairwise latency is the number that matters for scan-time viability |
| `consensus` | Baseline: group win rates over the same bottles (other tasters' picks + this taster's train picks), Laplace-smoothed |
| `comparisons-nudge` | EVAL-ONLY: per-taster Bradley-Terry-style logistic regression on cheap style features (grape family, big/light, old/new world, vintage age), regularized toward a group-fit prior. Requires `--holdout > 0` — it fits on each taster's TRAIN comparisons. Mirrors the "tiny logistic" result in `docs/somm-engine-v2-design.md`; does not touch production scoring code. See `comparisons-nudge.mjs` |
| `engine` | The real algorithm, unmodified: survey-seeded preference vector (`buildUserPreferenceVector`) + assembled wine profile (`assembleWineProfile`, live Supabase reference data) + `computeMatchScore`. Runs via `npx tsx scripts/somm-eval/engine-predict.ts` |
| `price` | Baseline: the more expensive bottle wins |
| `random` | Baseline: deterministic coin flip |

## Holdout mode

`--holdout=0.5` splits each taster's comparisons deterministically (vary with
`--fold-seed=N`): the train share is attached to the taster as prior tasting
history (and folded into `consensus` stats), and only the held-out share is
scored. This measures the question that matters for the product: given partial
data on someone's palate, how well does each approach extrapolate to their
remaining picks?

Run several fold seeds and aggregate — at ~50 test picks per seed, single-seed
differences are mostly noise (we measured the same predictor swinging 8+ points
between seeds).

Hard-won calibration notes:

- **Schema property order is an accuracy lever.** With a forced tool call, the
  model fills fields in schema order; putting `winner` before `reasoning`
  produced empty reasoning and random-level accuracy. `reasoning` must come
  first. Budget `max_tokens` accordingly (1500+) or the tool call truncates
  before `winner` and every row abstains.
- Tell the model the tasting was blind — otherwise it leans on label prestige
  that the taster never saw.

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

**`live-tasters.json` / `live-comparisons.csv`** — same shape, sourced from
LIVE in-app signal instead of a spreadsheet: `node
scripts/somm-eval/export-live-data.mjs` pulls `entry_comparison_feedback`
("did you enjoy this more/less than X?") joined to `wine_entries` (name,
producer, vintage, wine_type, canonical region/country, primary grapes,
rating), plus each taster's own rated entries as `logged_wines`, straight
from prod via `SUPABASE_SERVICE_ROLE_KEY` — read-only, no writes. Taster ids
are anonymized to `user-<8charhash>`. Rating scale is honestly labeled from
the data (the harness infers 5 vs. 100 from the max observed rating —
`live-*` is out of 100, the spreadsheet dataset is out of 5; neither is
rescaled to match the other). Run against `data/live-*` with
`--tasters=data/live-tasters.json --comparisons=data/live-comparisons.csv`.

## Running

```bash
# validate data only — no API calls, no DB
npm run eval:somm -- --dry-run

# cheap baselines only
npm run eval:somm -- --predictors=price,random

# the full panel
npm run eval:somm -- --predictors=llm,engine,price,random

# holdout: predict held-out picks from partial history (the production question)
npm run eval:somm -- --predictors=claude,claude-profile,consensus,random --holdout=0.5 --fold-seed=2

# comparisons-nudge requires --holdout (it fits on each taster's TRAIN picks)
npm run eval:somm -- --predictors=consensus,comparisons-nudge,random --holdout=0.5 --fold-seed=1 \
  --tasters=data/live-tasters.json --comparisons=data/live-comparisons.csv
```

Export fresh live data first with `node scripts/somm-eval/export-live-data.mjs`
(same `.env.local` requirements as the `engine` predictor below).

Flags: `--model=` (OpenAI model), `--claude-model=` (Anthropic model),
`--fast-model=` (pairwise model for `claude-profile`), `--holdout=` /
`--fold-seed=`, `--crowd-context`, `--concurrency=N` (parallel LLM calls,
default 6), `--limit=N` (first N comparisons), `--tasters=` / `--comparisons=`
(alternate data paths), `--out=` (results path).

Requires `.env.local` at the repo root (read automatically) with
`OPENAI_API_KEY` for `llm`, `ANTHROPIC_API_KEY` (env or `.env.local`) for
`claude`/`claude-profile`, and `NEXT_PUBLIC_SUPABASE_URL` +
`SUPABASE_SERVICE_ROLE_KEY` for `engine`.

With `--holdout`, the console output adds a per-taster accuracy table and
per-predictor latency percentiles; the results JSON gains `perTaster` and
`latencyStats` blocks.

## Scoring

Accuracy is computed over comparisons with a decisive ground truth (`a`/`b`)
where the predictor made a decisive call; predicted ties count as abstentions
(reported separately), and ground-truth ties are excluded. Per-comparison
detail — including each LLM prediction's reasoning — is written to
`scripts/somm-eval/results/` for error analysis.

Sample-size note: below ~100 decisive comparisons, treat differences between
predictors as directional, not significant.

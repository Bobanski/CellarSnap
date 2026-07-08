# Live in-app signal vs. spreadsheet dataset — somm-eval

Numbers only — no wine names, notes, or user identifiers below. Taster ids
throughout the harness output are `user-<8charhash>` (sha256 of the real
Supabase `user_id`, not reversible without DB access).

**Data exported:** 108 `entry_comparison_feedback` rows across 15 tasters
(via `scripts/somm-eval/export-live-data.mjs`, read-only), plus 224 of those
same tasters' rated `wine_entries` as `logged_wines` (2–54 per taster, median
5). Compare to the existing spreadsheet dataset: 103 comparisons, 12 tasters,
effectively zero logged wines (pure cold-start).

All runs: `--holdout=0.5`, fold seeds 1–3 for the statistical predictors,
seed 1 only for `claude` (one reference run per dataset — Anthropic API
cost/time, not meant to be the definitive number). Raw per-seed results:
`live-seed{1,2,3}.json`, `sheet-seed{1,2,3}.json`, `live-claude-seed1.json`,
`sheet-claude-seed1.json` (gitignored — contain wine names).

## Accuracy (3-seed pooled for consensus/random/comparisons-nudge; single-seed for claude)

| Predictor | Live accuracy | Live n (decided/total) | Sheet accuracy | Sheet n (decided/total) |
|---|---|---|---|---|
| `consensus` | 76.5% | 98/147 | 53.7% | 147/150 |
| `random` | 40.1% | 147/147 | 42.7% | 150/150 |
| `comparisons-nudge` | 60.8% | 143/147 | 61.9% | 147/150 |
| `claude` (seed 1 only) | 87.5% | 48/49 | 52.2% | 46/50 |

Sheet-dataset `consensus` (53.7%) and `random` (42.7%) reproduce
`docs/somm-engine-v2-design.md`'s numbers almost exactly (that doc's 53.7%
figure is explicitly the 3-seed subset) — good confirmation the harness and
holdout split are behaving the same way against the real dataset they were
calibrated on.

## Honest read

**`consensus`'s live number is inflated by heavy abstention, not accuracy.**
It only makes a decisive (non-tie) call when a wine's exact
producer+name+vintage key has appeared in *someone else's* comparisons — on
live data that's true for just 98 of 147 held-out picks (67% coverage,
because the catalog of real bottles is far more diverse than "the same ~15
bottles at 2 tastings" in the spreadsheet dataset, where coverage is 147/150,
98%). The 76.5% is real but scored on an easier, self-selected subset
("wines multiple people happened to log"); it is not comparable apples-to-
apples with the sheet number's 53.7% on near-full coverage. `comparisons-
nudge` decides on 143–147/147–150 in both datasets, so its accuracy numbers
*are* comparable — and they land in the same range (60.8% live, 61.9%
sheet), which is the more interesting finding here.

**`comparisons-nudge` generalizes.** A from-scratch per-user logistic model
on four cheap style features (grape family, big/light, old/new world,
vintage age), regularized toward a group-fit prior, gets ~61% on both a
12-taster cold-start dataset with no logged wines and a 15-taster live
dataset with real rating history — consistent with
`docs/somm-engine-v2-design.md`'s "tiny logistic" result (56.8%, 10 seeds on
the sheet data; this eval's 3-seed sheet number is 61.9%, same ballpark,
slightly optimistic since it's fewer seeds). It clearly beats `random` on
both datasets and beats `consensus` on live data once you account for
coverage. It costs ~0ms and no API calls.

**`claude`'s 87.5% live figure should not be trusted as "the model reads
palates better on live data."** Two confounds inflate it relative to the
sheet dataset's 52.2% (which itself lines up with the design doc's 55.5%
3-seed blind-tasting number):

1. `predictClaude`'s prompt hardcodes "tasted head-to-head BLIND... labels,
   producers, and prices were hidden" — that's true of the spreadsheet
   tastings but **false** for `entry_comparison_feedback`: it's a post-entry
   "did you like this more/less than X?" question the user answers with
   full knowledge of what they logged. The model gets producer/name facts
   framed as blind-tasting evidence when they're actually visible label
   information the user's answer could be using directly (brand loyalty,
   remembered preference, price anchoring). This isn't a bug in the
   predictor's plumbing — it's a mismatch between the ground-truth's actual
   collection conditions and the prompt's stated ones, worth fixing before
   trusting this number for anything beyond "does the harness run."
2. Live tasters carry real `logged_wines` history (up to 54 rated wines);
   sheet tasters carry none. `claude` is a much richer-context predictor on
   live data than on sheet data, so the two 87.5%/52.2% numbers aren't
   measuring the same thing.
3. n=48–49 decided, single seed — per the harness README's own calibration
   note, single-seed accuracy at this n swings ±8 points. Treat this run as
   "the harness works end-to-end with the claude predictor on live data,"
   not as a result.

**Sample size and skew are the real limiting factor for live data,
independent of any predictor.** One taster (`user-6c43ffe3`, the "top user"
with 43 total comparisons) supplies 21 of the ~49 held-out rows per seed —
43% of the live eval. Six of the fifteen tasters contribute exactly one
held-out comparison each. Per-taster accuracy cells below n≈10 are noise;
the pooled 147-row live numbers above are meaningfully influenced by one
person's palate being right or wrong on a given seed. This is a strictly
worse sample-size situation than the sheet dataset (103 comparisons over 2
tastings, comparatively even), and both are already below the harness's own
"~100 decisive comparisons" significance floor per predictor-dataset cell.

## Recommendation

**Wait, don't ship `comparisons-nudge` into `buildUserPreferenceVector`
yet** — but the eval evidence supports building toward it, not shelving it:

- It's the only predictor that (a) is free at inference time, (b) has
  near-full coverage on both datasets, and (c) shows the same ~60% accuracy
  on two structurally different datasets (cold-start-only vs. real logged
  history) — that consistency, not the raw number, is the strongest signal
  here.
- The blocker isn't the model, it's the input: 108 comparisons from 15
  people, 43% of the live eval carried by one taster, is not enough to trust
  a production rollout on. The design doc's own follow-up #5 anticipated
  exactly this: "revisit once comparison volume grows."
- Concretely: instrument comparison-prompt volume (more users answering the
  post-entry "did you like this more/less" question), re-run this same
  export + eval once there's something like 300–500 comparisons across
  50+ tasters with no single taster over ~15% of the eval set, and re-check
  whether `comparisons-nudge` still separates cleanly from `consensus` on a
  coverage-adjusted basis. If it holds up at that scale, it's a clean,
  cheap, explainable candidate for a "comparison-derived axis nudge" term in
  `buildUserPreferenceVector` — exactly the shape the design doc already
  sketched and declined to build for lack of data.
- Independently of production wiring: fix the `predictClaude` blind-framing
  mismatch (point 1 above) before drawing any conclusion from `claude`
  accuracy on `entry_comparison_feedback`-sourced data — right now it's not
  measuring what it says it's measuring.

/**
 * comparisons-nudge — EVAL-ONLY statistical predictor.
 *
 * Mirrors the "tiny per-user logistic model on style features (group prior +
 * own picks)" result documented in docs/somm-engine-v2-design.md (56.8%
 * accuracy, 10 seeds, n=500 on the spreadsheet dataset) — i.e. the thing the
 * design doc's "What we deliberately did NOT build" section calls a
 * "comparison-derived axis nudge," evaluated here as a standalone predictor
 * instead of wired into buildUserPreferenceVector.
 *
 * Does NOT touch production scoring code (src/server/algorithm/**). This is
 * a from-scratch, dependency-free Bradley-Terry-style logistic regression
 * over a handful of style features, fit per taster on their TRAIN
 * comparisons only, regularized toward a "group prior" fit on every OTHER
 * taster's data (same "other tasters' rows are fair game" convention the
 * `consensus` predictor already uses in run-eval.mjs).
 *
 * Model: P(wine_a beats wine_b) = sigmoid(w . (features(a) - features(b))).
 * Ties are dropped from training (Bradley-Terry doesn't model them) but
 * still scored at predict time (a coin-flip-adjacent probability is treated
 * as a decisive pick, same as every other predictor in the harness — no
 * special tie output, "ties only on exact equality" the way consensus does).
 *
 * Feature vector per wine (continuous, low-dimensional — the whole point is
 * this fits on 5-15 comparisons per taster without overfitting):
 *   - body: -1 (light) .. +1 (big), from grape + wine_type
 *   - old_world: 1 old world / 0 new world / 0.5 unknown
 *   - vintage_age: (referenceYear - vintage) / 10, 0 if unknown (neutral)
 *   - grape family: one-hot over 8 coarse buckets (a 9th "other" bucket is
 *     the implicit baseline, dropped to avoid collinearity)
 */

// ── Feature engineering ─────────────────────────────────────────────────

const REFERENCE_YEAR = new Date().getFullYear();

const OLD_WORLD_COUNTRIES = new Set([
  "france", "italy", "spain", "portugal", "germany", "austria", "greece",
  "hungary", "georgia", "switzerland", "croatia", "slovenia", "lebanon",
  "israel", "cyprus", "turkey", "england", "bulgaria", "romania", "moldova",
  "serbia", "czech republic", "north macedonia", "united kingdom",
]);
const NEW_WORLD_COUNTRIES = new Set([
  "usa", "united states", "united states of america", "argentina", "chile",
  "australia", "new zealand", "south africa", "canada", "mexico", "uruguay",
  "brazil", "china", "japan", "india",
]);

// Body score per grape, -1 (light) .. +1 (big/full). Not exhaustive —
// unlisted grapes fall back to the wine_type default below.
const GRAPE_BODY_SCORE = {
  "cabernet sauvignon": 0.7, "malbec": 0.6, "syrah": 0.6, "shiraz": 0.6,
  "zinfandel": 0.7, "primitivo": 0.7, "petite sirah": 0.7, "durif": 0.7,
  "tannat": 0.6, "petit verdot": 0.6, "mourvedre": 0.5, "monastrell": 0.5,
  "nebbiolo": 0.3, "sangiovese": 0.1, "merlot": 0.3, "grenache": 0.2,
  "garnacha": 0.2, "carmenere": 0.4, "montepulciano": 0.2, "aglianico": 0.3,
  "touriga nacional": 0.3, "tempranillo": 0.2, "cabernet franc": 0.0,
  "pinot noir": -0.4, "gamay": -0.7, "barbera": -0.2, "dolcetto": -0.3,
  "sangiovese grosso": 0.1, "frappato": -0.5, "corvina": 0.1,
  "chardonnay": 0.2, "viognier": 0.4, "marsanne": 0.3, "roussanne": 0.3,
  "semillon": 0.2, "gewurztraminer": -0.1, "sauvignon blanc": -0.5,
  "riesling": -0.5, "pinot grigio": -0.6, "pinot gris": -0.3,
  "albarino": -0.5, "vermentino": -0.4, "assyrtiko": -0.4,
  "gruner veltliner": -0.3, "chenin blanc": -0.2, "moscato": -0.6,
  "moscato bianco": -0.6, "glera": -0.6, "furmint": -0.2,
};
const WINE_TYPE_BODY_DEFAULT = {
  red: 0.3, white: -0.3, sparkling: -0.6, rose: -0.4, sweet: -0.1, orange: 0.1,
};

// Grape family buckets — one-hot, coarse on purpose (n is tiny per taster).
const GRAPE_FAMILIES = [
  "bordeaux_red", "burgundy_pinot", "rhone_gsm", "italian_red",
  "iberian_red", "aromatic_white", "crisp_white", "rich_white",
];
const GRAPE_FAMILY_MAP = {
  "cabernet sauvignon": "bordeaux_red", "merlot": "bordeaux_red",
  "cabernet franc": "bordeaux_red", "petit verdot": "bordeaux_red",
  "malbec": "bordeaux_red", "carmenere": "bordeaux_red", "tannat": "bordeaux_red",
  "pinot noir": "burgundy_pinot", "gamay": "burgundy_pinot",
  "syrah": "rhone_gsm", "shiraz": "rhone_gsm", "grenache": "rhone_gsm",
  "garnacha": "rhone_gsm", "mourvedre": "rhone_gsm", "monastrell": "rhone_gsm",
  "cinsault": "rhone_gsm", "carignan": "rhone_gsm",
  "sangiovese": "italian_red", "nebbiolo": "italian_red", "barbera": "italian_red",
  "dolcetto": "italian_red", "montepulciano": "italian_red", "aglianico": "italian_red",
  "nero d'avola": "italian_red", "primitivo": "italian_red", "zinfandel": "italian_red",
  "corvina": "italian_red", "frappato": "italian_red",
  "tempranillo": "iberian_red", "mencia": "iberian_red", "bobal": "iberian_red",
  "touriga nacional": "iberian_red",
  "riesling": "aromatic_white", "gewurztraminer": "aromatic_white",
  "moscato": "aromatic_white", "moscato bianco": "aromatic_white",
  "torrontes": "aromatic_white", "gruner veltliner": "aromatic_white",
  "muscat of alexandria": "aromatic_white",
  "sauvignon blanc": "crisp_white", "albarino": "crisp_white",
  "vermentino": "crisp_white", "pinot grigio": "crisp_white",
  "pinot gris": "crisp_white", "verdejo": "crisp_white", "assyrtiko": "crisp_white",
  "chenin blanc": "crisp_white",
  "chardonnay": "rich_white", "viognier": "rich_white", "marsanne": "rich_white",
  "roussanne": "rich_white", "semillon": "rich_white",
};

function normalizeText(value) {
  return (value ?? "").toString().trim().toLowerCase();
}

function firstGrape(grapes) {
  if (!grapes) return null;
  const [first] = String(grapes).split(/[;,/|]/).map((s) => s.trim()).filter(Boolean);
  return first ? normalizeText(first) : null;
}

/** Feature vector for one wine: [body, old_world, vintage_age, ...one-hot grape family]. */
export function wineFeatures(wine) {
  const grape = firstGrape(wine?.grapes);
  const wineType = normalizeText(wine?.wine_type);
  const body = grape && GRAPE_BODY_SCORE[grape] !== undefined
    ? GRAPE_BODY_SCORE[grape]
    : WINE_TYPE_BODY_DEFAULT[wineType] ?? 0;

  const country = normalizeText(wine?.country);
  const oldWorld = OLD_WORLD_COUNTRIES.has(country) ? 1 : NEW_WORLD_COUNTRIES.has(country) ? 0 : 0.5;

  const vintage = Number.parseInt(wine?.vintage, 10);
  const vintageAge = Number.isFinite(vintage) && vintage > 1900 && vintage <= REFERENCE_YEAR
    ? (REFERENCE_YEAR - vintage) / 10
    : 0;

  const family = grape ? GRAPE_FAMILY_MAP[grape] : null;
  const familyOneHot = GRAPE_FAMILIES.map((f) => (f === family ? 1 : 0));

  return [body, oldWorld, vintageAge, ...familyOneHot];
}

export const FEATURE_DIM = 3 + GRAPE_FAMILIES.length;

function diffFeatures(wineA, wineB) {
  const a = wineFeatures(wineA);
  const b = wineFeatures(wineB);
  return a.map((v, i) => v - b[i]);
}

// ── Logistic regression (dependency-free, small dim, small n) ──────────

function sigmoid(z) {
  if (z >= 0) {
    const e = Math.exp(-z);
    return 1 / (1 + e);
  }
  const e = Math.exp(z);
  return e / (1 + e);
}

/**
 * Fit w via batch gradient descent minimizing L2-regularized logistic loss,
 * regularized toward `prior` (not toward zero) — this is what makes it a
 * "group prior + own picks" model: with few personal examples the penalty
 * dominates and w stays close to prior; with more examples the data wins.
 */
function fitLogistic(examples, prior, lambda, { iterations = 400, learningRate = 0.4 } = {}) {
  const dim = prior.length;
  let w = [...prior];
  if (examples.length === 0) return w;

  for (let iter = 0; iter < iterations; iter++) {
    const grad = new Array(dim).fill(0);
    for (const { x, y } of examples) {
      const p = sigmoid(x.reduce((sum, xi, i) => sum + xi * w[i], 0));
      const err = p - y;
      for (let i = 0; i < dim; i++) grad[i] += err * x[i];
    }
    for (let i = 0; i < dim; i++) {
      grad[i] = grad[i] / examples.length + 2 * lambda * (w[i] - prior[i]);
      w[i] -= learningRate * grad[i];
    }
  }
  return w;
}

/** Build {x, y} training examples from decisive (a/b) rows; ties are dropped. */
function toExamples(rows) {
  return rows
    .filter((row) => row.winner === "a" || row.winner === "b")
    .map((row) => ({
      x: diffFeatures(row.wine_a, row.wine_b),
      y: row.winner === "a" ? 1 : 0,
    }));
}

const GROUP_LAMBDA = 0.05; // weak regularization — group model has real n
const PERSONAL_LAMBDA = 1.5; // strong pull toward group prior — personal n is tiny

/**
 * Build one model per taster: a group prior (fit on every row NOT in that
 * taster's test set — other tasters' rows, and this taster's own train
 * rows, are fair game, mirroring buildConsensusStats' convention) and a
 * personal model (fit on only this taster's train rows, shrunk toward the
 * group prior).
 *
 * @param allRows          every comparison row (index-aligned with excludeIndexesByTaster)
 * @param excludeIndexesByTaster  Map<taster_id, Set<index>> — this taster's TEST rows
 * @param trainRowsByTaster       Map<taster_id, row[]> — this taster's TRAIN rows (holdout split)
 */
export function buildNudgeModels(allRows, excludeIndexesByTaster, trainRowsByTaster) {
  const zeroPrior = new Array(FEATURE_DIM).fill(0);
  const modelsByTaster = new Map();
  for (const [tasterId, excludeIndexes] of excludeIndexesByTaster) {
    const groupRows = allRows.filter((_, index) => !excludeIndexes.has(index));
    const groupWeights = fitLogistic(toExamples(groupRows), zeroPrior, GROUP_LAMBDA);

    const personalRows = trainRowsByTaster.get(tasterId) ?? [];
    const personalWeights = fitLogistic(toExamples(personalRows), groupWeights, PERSONAL_LAMBDA);

    modelsByTaster.set(tasterId, personalWeights);
  }
  return modelsByTaster;
}

/** Ties only on exact probability equality (never happens in practice with continuous features) — same convention as predictConsensus. */
export function predictNudge(comparison, weights) {
  if (!weights) return { predicted: null };
  const x = diffFeatures(comparison.wine_a, comparison.wine_b);
  const p = sigmoid(x.reduce((sum, xi, i) => sum + xi * weights[i], 0));
  if (p === 0.5) return { predicted: "tie", p_a: p };
  return { predicted: p > 0.5 ? "a" : "b", p_a: p };
}

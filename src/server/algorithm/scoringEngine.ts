import {
  BALANCE_FACTOR_MAP,
  DEFAULT_AXIS_WEIGHTS,
  FALLBACK_LEVEL_CONFIDENCE,
  SCORE_BANDS,
  SHRINKAGE_CONSTANT,
  SIGMOID_K,
  SIGMOID_MIDPOINT,
} from "@/server/algorithm/constants";
import {
  SENSORY_AXES,
  type MatchBand,
  type MatchScore,
  type EnjoymentSignals,
  type EffectiveWineProfile,
  type CategoricalPreferenceVector,
  type UserPreferenceVector,
} from "@/server/algorithm/types";
import { computeAdventurousnessMultiplier } from "@/server/algorithm/surveySeeding";

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function roundScore(value: number) {
  return Number(value.toFixed(2));
}

function normalizeAffinityText(value: string | null | undefined) {
  const normalized = (value ?? "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase()
    .replace(/[’']/g, "")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (
    normalized === "united states" ||
    normalized === "united states of america" ||
    normalized === "u s" ||
    normalized === "u s a" ||
    normalized === "us"
  ) {
    return "usa";
  }

  return normalized;
}

function scoreAffinityText(
  candidate: string | null | undefined,
  affinities: Record<string, number>
) {
  const normalizedCandidate = normalizeAffinityText(candidate);
  if (!normalizedCandidate) {
    return 0;
  }

  let best = affinities[normalizedCandidate] ?? 0;
  if (best > 0) {
    return best;
  }

  const candidateTokens = new Set(normalizedCandidate.split(" "));

  for (const [key, affinity] of Object.entries(affinities)) {
    if (!key) {
      continue;
    }

    if (key.includes(normalizedCandidate) || normalizedCandidate.includes(key)) {
      best = Math.max(best, affinity * 0.85);
      continue;
    }

    const keyTokens = key.split(" ");
    const overlap = keyTokens.filter((token) => candidateTokens.has(token)).length;
    if (overlap > 0) {
      const overlapRatio = overlap / Math.max(keyTokens.length, candidateTokens.size);
      best = Math.max(best, affinity * (0.6 + overlapRatio * 0.2));
    }
  }

  return best;
}

function scoreAffinityList(
  candidates: string[] | null | undefined,
  affinities: Record<string, number>
) {
  if (!candidates || candidates.length === 0) {
    return 0;
  }

  return candidates.reduce(
    (best, candidate) => Math.max(best, scoreAffinityText(candidate, affinities)),
    0
  );
}

function computeCategoricalBonus(
  wine: EffectiveWineProfile,
  user: UserPreferenceVector
) {
  const categoryVector: CategoricalPreferenceVector = user.categorical;
  const varietalMatch = scoreAffinityList(
    wine.metadata.primary_grapes,
    categoryVector.varietals
  );
  const regionMatch = Math.max(
    scoreAffinityText(wine.metadata.canonical_sub_region, categoryVector.regions),
    scoreAffinityText(wine.metadata.canonical_region, categoryVector.regions)
  );
  const countryMatch = scoreAffinityText(
    wine.metadata.canonical_country,
    categoryVector.countries
  );
  const classificationMatch = scoreAffinityText(
    wine.metadata.classification,
    categoryVector.classifications
  );

  const rawBonus =
    varietalMatch * 8 * categoryVector.weights.varietal +
    regionMatch * 12 * categoryVector.weights.region +
    countryMatch * 6 * categoryVector.weights.country +
    classificationMatch * 4 * categoryVector.weights.classification;

  // Adventurousness modulates how much categorical familiarity matters.
  // Low adventurousness → boost the bonus (stick to what you know).
  // High adventurousness → reduce it (let sensory similarity drive).
  const adventurenessMultiplier = computeAdventurousnessMultiplier(
    user.adventurousness
  );

  return roundScore(rawBonus * adventurenessMultiplier);
}

function classifyScore(score: number): MatchBand {
  return SCORE_BANDS.find((band) => score >= band.min)?.label ?? "not_your_style";
}

/**
 * Conservative wine-age score modifier.
 * Older wines tend to score higher (selection bias + aging benefit).
 * Range: 0.95 (very young, < 2 years) to 1.08 (20+ years).
 * Wines without vintage data get 1.0 (neutral).
 */
function computeAgeFactor(vintage: number | null): number {
  if (vintage === null) {
    return 1.0;
  }

  const currentYear = new Date().getUTCFullYear();
  const age = currentYear - vintage;

  if (age < 0 || age > 100) {
    return 1.0; // Invalid vintage
  }

  if (age <= 1) return 0.95;
  if (age <= 3) return 0.97;
  if (age <= 5) return 1.0;
  if (age <= 10) return 1.02;
  if (age <= 20) return 1.05;
  return 1.08;
}

const ENJOYMENT_INTENT_FACTOR: Record<string, number> = {
  seek_more: 1.08,
  happily_again: 1.04,
  if_poured: 0.98,
  pass: 0.92,
};

const HOW_WAS_IT_FACTOR: Record<string, number> = {
  exceptional: 1.04,
  good: 1.02,
  okay: 1.0,
  bad: 0.96,
  awful: 0.92,
};

/**
 * Composite enjoyment modifier from user's explicit signals.
 * Combines rating, enjoyment intent (new 4-point scale), and how_was_it survey.
 * Clamped to [0.80, 1.20] to prevent extreme swings.
 */
function computeEnjoymentFactor(signals: EnjoymentSignals | null): number {
  if (!signals) return 1.0;

  let ratingFactor = 1.0;
  if (typeof signals.rating === "number") {
    if (signals.rating >= 90) ratingFactor = 1.06;
    else if (signals.rating >= 80) ratingFactor = 1.03;
    else if (signals.rating >= 70) ratingFactor = 1.0;
    else if (signals.rating >= 60) ratingFactor = 0.97;
    else ratingFactor = 0.94;
  }

  const intentFactor = signals.enjoyment_intent
    ? (ENJOYMENT_INTENT_FACTOR[signals.enjoyment_intent] ?? 1.0)
    : 1.0;

  const howFactor = signals.how_was_it
    ? (HOW_WAS_IT_FACTOR[signals.how_was_it] ?? 1.0)
    : 1.0;

  return clamp(ratingFactor * intentFactor * howFactor, 0.80, 1.20);
}

function resolveBalanceFactor(overallBalance: number) {
  const roundedBalance = clamp(Math.round(overallBalance), 1, 5);
  return BALANCE_FACTOR_MAP[roundedBalance] ?? BALANCE_FACTOR_MAP[3];
}

function computeConfidence(
  wine: EffectiveWineProfile,
  user: UserPreferenceVector,
  knownAxisCount: number
) {
  const wineConfidence =
    FALLBACK_LEVEL_CONFIDENCE[wine.metadata.fallback_level] ??
    FALLBACK_LEVEL_CONFIDENCE[6];
  const preferenceCoverage = knownAxisCount > 0 ? knownAxisCount / SENSORY_AXES.length : 0;
  const userHistoryConfidence =
    user.event_count / (user.event_count + SHRINKAGE_CONSTANT);
  const preferenceConfidence = (preferenceCoverage + userHistoryConfidence) / 2;

  return roundScore(clamp((wineConfidence + preferenceConfidence) / 2, 0, 1));
}

export function computeMatchScore(
  wine: EffectiveWineProfile,
  user: UserPreferenceVector,
  enjoymentSignals?: EnjoymentSignals | null
): MatchScore {
  const axisContributions = {} as MatchScore["axis_contributions"];
  const totalPossibleWeight = SENSORY_AXES.reduce(
    (sum, axis) => sum + (user.weights[axis] ?? DEFAULT_AXIS_WEIGHTS[axis]),
    0
  );

  let weightedSquaredDiff = 0;
  let observedWeightTotal = 0;
  let knownAxisCount = 0;

  SENSORY_AXES.forEach((axis) => {
    const userValue = user.sensory[axis] ?? null;
    const weight = user.weights[axis] ?? DEFAULT_AXIS_WEIGHTS[axis];
    const wineValue = wine.sensory[axis];

    if (userValue === null) {
      axisContributions[axis] = {
        user_value: null,
        wine_value: wineValue,
        weight: 0,
        contribution: 0,
      };
      return;
    }

    const contribution = weight * (userValue - wineValue) ** 2;
    weightedSquaredDiff += contribution;
    observedWeightTotal += weight;
    knownAxisCount += 1;
    axisContributions[axis] = {
      user_value: userValue,
      wine_value: wineValue,
      weight: roundScore(weight),
      contribution: roundScore(contribution),
    };
  });

  const normalizedWeightedSquaredDiff =
    observedWeightTotal > 0
      ? weightedSquaredDiff * (totalPossibleWeight / observedWeightTotal)
      : SIGMOID_MIDPOINT ** 2;
  const distance = Math.sqrt(normalizedWeightedSquaredDiff);
  const preBalanceScore =
    100 / (1 + Math.exp(SIGMOID_K * (distance - SIGMOID_MIDPOINT)));
  const balanceFactor = resolveBalanceFactor(wine.balance.overall);
  const ageFactor = computeAgeFactor(wine.metadata.vintage ?? null);
  const enjoymentFactor = computeEnjoymentFactor(enjoymentSignals ?? null);
  const categoricalBonus = computeCategoricalBonus(wine, user);
  const finalScore = clamp(
    preBalanceScore * balanceFactor * ageFactor * enjoymentFactor + categoricalBonus,
    0,
    100
  );
  const confidence = computeConfidence(wine, user, knownAxisCount);

  return {
    score: roundScore(finalScore),
    band: classifyScore(finalScore),
    confidence,
    balance_factor: balanceFactor,
    age_factor: ageFactor,
    enjoyment_factor: enjoymentFactor,
    pre_balance_score: roundScore(preBalanceScore),
    axis_contributions: axisContributions,
  };
}

import type { NlpNotesExtraction, SensoryAxis, SensoryVector } from "./types";
import {
  AROMA_CLUSTERS,
  DESCRIPTOR_LEXICON,
  NEGATIVE_SENTIMENT,
  POSITIVE_SENTIMENT,
} from "./noteDescriptors";

export type { NlpNotesExtraction } from "./types";

type Span = {
  start: number;
  end: number;
};

function normalizeForMatching(value: string) {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[’']/g, "")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function buildPhrasePattern(phrase: string) {
  const tokens = phrase.split(" ").filter(Boolean).map(escapeRegExp);
  return new RegExp(`\\b${tokens.join("\\s+")}\\b`, "g");
}

function spansOverlap(left: Span, right: Span) {
  return left.start < right.end && right.start < left.end;
}

function findDistinctMatches(text: string, phrases: readonly string[]) {
  const matched = new Set<string>();
  const occupiedSpans: Span[] = [];
  const normalizedPhrases = [...new Set(phrases.map(normalizeForMatching))]
    .filter(Boolean)
    .sort((left, right) => right.length - left.length || left.localeCompare(right));

  for (const phrase of normalizedPhrases) {
    const pattern = buildPhrasePattern(phrase);
    const match = pattern.exec(text);
    if (!match) {
      continue;
    }

    const span = {
      start: match.index,
      end: match.index + match[0].length,
    };

    if (occupiedSpans.some((occupied) => spansOverlap(occupied, span))) {
      continue;
    }

    occupiedSpans.push(span);
    matched.add(phrase);
  }

  return matched;
}

function roundToTwo(value: number) {
  return Number(value.toFixed(2));
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function collectAxisHints(matchedPhrases: Set<string>) {
  const axisAccumulator = new Map<
    SensoryAxis,
    { weightedValue: number; totalConfidence: number; evidenceCount: number }
  >();

  for (const phrase of matchedPhrases) {
    const mappings = DESCRIPTOR_LEXICON[phrase];
    if (!mappings) {
      continue;
    }

    for (const mapping of mappings) {
      const current = axisAccumulator.get(mapping.axis) ?? {
        weightedValue: 0,
        totalConfidence: 0,
        evidenceCount: 0,
      };

      current.weightedValue += mapping.value * mapping.confidence;
      current.totalConfidence += mapping.confidence;
      current.evidenceCount += 1;
      axisAccumulator.set(mapping.axis, current);
    }
  }

  const sensoryHints: NlpNotesExtraction["sensoryHints"] = {};

  for (const [axis, accumulator] of axisAccumulator.entries()) {
    if (accumulator.totalConfidence <= 0 || accumulator.evidenceCount <= 0) {
      continue;
    }

    const averageConfidence = accumulator.totalConfidence / accumulator.evidenceCount;
    sensoryHints[axis] = {
      value: roundToTwo(accumulator.weightedValue / accumulator.totalConfidence),
      confidence: roundToTwo(
        clamp(averageConfidence + Math.max(0, accumulator.evidenceCount - 1) * 0.1, 0, 1)
      ),
    };
  }

  return sensoryHints;
}

function rankClusters(text: string, tokenSet: Set<string>) {
  const clusters = Object.entries(AROMA_CLUSTERS)
    .map(([cluster, phrases]) => {
      const matchedPhrases = findDistinctMatches(text, phrases);
      matchedPhrases.forEach((phrase) => tokenSet.add(`cluster:${cluster}:${phrase}`));

      const score = [...matchedPhrases].reduce((sum, phrase) => {
        return sum + (phrase.includes(" ") ? 1.5 : 1);
      }, 0);

      return {
        cluster,
        score,
        matchCount: matchedPhrases.size,
      };
    })
    .filter((item) => item.score > 0)
    .sort((left, right) => {
      if (right.score !== left.score) {
        return right.score - left.score;
      }
      if (right.matchCount !== left.matchCount) {
        return right.matchCount - left.matchCount;
      }
      return left.cluster.localeCompare(right.cluster);
    });

  return {
    primary: clusters.slice(0, 3).map((item) => item.cluster),
    secondary: clusters.slice(3, 6).map((item) => item.cluster),
  };
}

function scoreSentiment(text: string, tokenSet: Set<string>) {
  const positiveMatches = findDistinctMatches(text, POSITIVE_SENTIMENT);
  const negativeMatches = findDistinctMatches(text, NEGATIVE_SENTIMENT);

  positiveMatches.forEach((phrase) => tokenSet.add(`sentiment:+:${phrase}`));
  negativeMatches.forEach((phrase) => tokenSet.add(`sentiment:-:${phrase}`));

  const positiveScore = positiveMatches.size;
  const negativeScore = negativeMatches.size;
  const totalScore = positiveScore + negativeScore;

  if (totalScore === 0) {
    return 0;
  }

  return roundToTwo(clamp((positiveScore - negativeScore) / totalScore, -1, 1));
}

/**
 * Maximum allowed deviation between an NLP-extracted hint and the wine's
 * actual assembled sensory value before the hint is discarded.
 *
 * Example: if the wine's assembled acidity is 1.8 (low) and the NLP hint
 * says 4.5 ("very acidic"), the deviation is 2.7 which exceeds 1.8 —
 * the user is probably misidentifying the sensation, so we discard it.
 *
 * This prevents preference drift from inaccurate tasting notes.
 */
const NLP_VALIDATION_MAX_DEVIATION = 1.8;

/**
 * Validate NLP-extracted sensory hints against the wine's actual assembled
 * sensory profile.  Hints that diverge too far from reality are removed.
 *
 * Why: if a user writes "way too acidic" on a low-acid wine, they're
 * probably picking up on something else (tannin grip, minerality, etc.).
 * Incorporating that note would incorrectly skew their acidity preference.
 */
function validateHintsAgainstProfile(
  hints: NlpNotesExtraction["sensoryHints"],
  assembledSensory: Partial<SensoryVector> | null | undefined
): NlpNotesExtraction["sensoryHints"] {
  if (!assembledSensory) {
    return hints;
  }

  const validated: NlpNotesExtraction["sensoryHints"] = {};

  for (const [axisKey, hint] of Object.entries(hints) as Array<
    [SensoryAxis, { value: number; confidence: number }]
  >) {
    if (!hint) {
      continue;
    }

    const wineValue = assembledSensory[axisKey];

    // If we don't have an assembled value for this axis, keep the hint
    // (benefit of the doubt)
    if (typeof wineValue !== "number") {
      validated[axisKey] = hint;
      continue;
    }

    const deviation = Math.abs(hint.value - wineValue);
    if (deviation <= NLP_VALIDATION_MAX_DEVIATION) {
      validated[axisKey] = hint;
    }
    // else: hint diverges too far from actual wine profile — discard
  }

  return validated;
}

/**
 * Extract sensory hints, descriptor clusters, and sentiment from free-text tasting notes.
 * Rule-based by design: the branch is small enough that a lexicon is more predictable
 * than a model call.
 *
 * When assembledSensory is provided, extracted sensory hints are validated against
 * the wine's actual profile.  Hints that diverge too far are discarded to prevent
 * inaccurate notes from skewing the user's preference vector.
 */
export function extractFromNotes(
  notes: string | null | undefined,
  assembledSensory?: Partial<SensoryVector> | null
): NlpNotesExtraction | null {
  if (!notes || notes.trim().length < 3) {
    return null;
  }

  const normalized = normalizeForMatching(notes);
  if (!normalized) {
    return null;
  }

  const tokenSet = new Set<string>();
  const matchedDescriptorPhrases = findDistinctMatches(normalized, Object.keys(DESCRIPTOR_LEXICON));

  matchedDescriptorPhrases.forEach((phrase) => tokenSet.add(`descriptor:${phrase}`));

  const rawHints = collectAxisHints(matchedDescriptorPhrases);
  const sensoryHints = validateHintsAgainstProfile(rawHints, assembledSensory);
  const descriptorClusters = rankClusters(normalized, tokenSet);
  const sentiment = scoreSentiment(normalized, tokenSet);
  const tokenCount = tokenSet.size;

  if (
    Object.keys(sensoryHints).length === 0 &&
    descriptorClusters.primary.length === 0 &&
    descriptorClusters.secondary.length === 0 &&
    sentiment === 0
  ) {
    return null;
  }

  return {
    sensoryHints,
    descriptorClusters,
    sentiment,
    tokenCount,
  };
}

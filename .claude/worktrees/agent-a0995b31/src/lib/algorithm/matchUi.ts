import type {
  AxisContribution,
  EffectiveWineProfile,
  MatchBand,
  SensoryAxis,
  SensoryVector,
} from "@/server/algorithm/types";

export const SENSORY_SCALE_LABELS = {
  1: "Very Low",
  2: "Low",
  3: "Moderate",
  4: "High",
  5: "Very High",
} as const;

export const SENSORY_AXIS_LABELS: Record<SensoryAxis, string> = {
  body: "Body",
  acidity: "Acidity",
  tannin: "Tannin",
  alcohol_perception: "Alcohol warmth",
  fruit_ripeness: "Fruit ripeness",
  oak_presence: "Oak",
  earthy: "Earthiness",
  mineral: "Minerality",
  savory: "Savory depth",
  aromatic_intensity: "Aromatics",
  sweetness_perception: "Sweetness",
  bitterness_phenolic_grip: "Phenolic grip",
  finish_length: "Finish",
  concentration: "Concentration",
  complexity: "Complexity",
  freshness: "Freshness",
};

export const MATCH_BAND_COPY: Record<
  MatchBand,
  {
    title: string;
    pillLabel: string;
    scoreColorClassName: string;
    ringColor: string;
    glowColor: string;
    chipClassName: string;
  }
> = {
  excellent: {
    title: "Perfect match",
    pillLabel: "Perfect match",
    scoreColorClassName: "text-emerald-200",
    ringColor: "#34d399",
    glowColor: "rgba(52, 211, 153, 0.28)",
    chipClassName:
      "border border-emerald-300/35 bg-emerald-400/15 text-emerald-100",
  },
  strong: {
    title: "Great match",
    pillLabel: "Great match",
    scoreColorClassName: "text-amber-100",
    ringColor: "#fbbf24",
    glowColor: "rgba(251, 191, 36, 0.24)",
    chipClassName:
      "border border-amber-300/35 bg-amber-400/15 text-amber-100",
  },
  decent: {
    title: "Decent match",
    pillLabel: "Decent match",
    scoreColorClassName: "text-zinc-100",
    ringColor: "#d4d4d8",
    glowColor: "rgba(212, 212, 216, 0.18)",
    chipClassName:
      "border border-zinc-300/20 bg-zinc-400/10 text-zinc-100",
  },
  not_your_style: {
    title: "Not your style",
    pillLabel: "Not your style",
    scoreColorClassName: "text-rose-100",
    ringColor: "#fb7185",
    glowColor: "rgba(251, 113, 133, 0.22)",
    chipClassName:
      "border border-rose-300/30 bg-rose-400/15 text-rose-100",
  },
};

export const SENSORY_META_GROUPS = [
  {
    key: "structure",
    label: "Structure",
    axes: ["body", "acidity", "tannin", "alcohol_perception"] as const,
  },
  {
    key: "flavor",
    label: "Flavor",
    axes: ["fruit_ripeness", "sweetness_perception", "bitterness_phenolic_grip"] as const,
  },
  {
    key: "aromatics",
    label: "Aromatics",
    axes: ["aromatic_intensity", "oak_presence"] as const,
  },
  {
    key: "earth",
    label: "Earth",
    axes: ["earthy", "mineral", "savory"] as const,
  },
  {
    key: "quality",
    label: "Quality",
    axes: ["finish_length", "concentration", "complexity", "freshness"] as const,
  },
] as const;

type AxisContributionMap = Record<SensoryAxis, AxisContribution>;

type ScoreInsight = {
  axis: SensoryAxis;
  title: string;
  body: string;
  magnitude: number;
};

export function formatSensoryLevel(value: number | null | undefined) {
  if (typeof value !== "number" || Number.isNaN(value)) {
    return "Unknown";
  }
  const normalized = Math.max(1, Math.min(5, Math.round(value)));
  return SENSORY_SCALE_LABELS[normalized as keyof typeof SENSORY_SCALE_LABELS];
}

export function averageAxisValues(
  vector: Partial<Record<SensoryAxis, number | null | undefined>>,
  axes: readonly SensoryAxis[]
) {
  const values = axes
    .map((axis) => vector[axis])
    .filter((value): value is number => typeof value === "number" && !Number.isNaN(value));

  if (values.length === 0) {
    return null;
  }

  return Number((values.reduce((sum, value) => sum + value, 0) / values.length).toFixed(2));
}

export function buildRadarSeries(params: {
  wine: Partial<Record<SensoryAxis, number | null | undefined>>;
  user: Partial<Record<SensoryAxis, number | null | undefined>>;
}) {
  return SENSORY_META_GROUPS.map((group) => ({
    key: group.key,
    label: group.label,
    wine: averageAxisValues(params.wine, group.axes),
    user: averageAxisValues(params.user, group.axes),
  })).filter((point) => point.wine !== null || point.user !== null);
}

function describeAlignment(axis: SensoryAxis, userValue: number, wineValue: number) {
  const label = SENSORY_AXIS_LABELS[axis];
  const roundedUser = formatSensoryLevel(userValue);
  const roundedWine = formatSensoryLevel(wineValue);
  const delta = Number((wineValue - userValue).toFixed(2));

  if (Math.abs(delta) <= 0.35) {
    return {
      title: label,
      body: `You and this wine line up on ${label.toLowerCase()} (${roundedWine}).`,
    };
  }

  if (delta > 0) {
    return {
      title: label,
      body: `This wine runs higher on ${label.toLowerCase()} (${roundedWine}) than your usual ${roundedUser}.`,
    };
  }

  return {
    title: label,
    body: `This wine lands lower on ${label.toLowerCase()} (${roundedWine}) than your usual ${roundedUser}.`,
  };
}

export function buildScoreInsights(axisContributions: AxisContributionMap) {
  const comparableAxes = Object.entries(axisContributions)
    .map(([axis, contribution]) => ({
      axis: axis as SensoryAxis,
      contribution,
      gap: contribution.user_value === null ? null : Math.abs(contribution.wine_value - contribution.user_value),
    }))
    .filter(
      (item): item is {
        axis: SensoryAxis;
        contribution: AxisContribution;
        gap: number;
      } => item.contribution.user_value !== null && item.gap !== null
    );

  const positive = [...comparableAxes]
    .sort((left, right) => {
      if (left.gap !== right.gap) {
        return left.gap - right.gap;
      }
      return right.contribution.weight - left.contribution.weight;
    })
    .slice(0, 3)
    .map<ScoreInsight>((item) => {
      const copy = describeAlignment(
        item.axis,
        item.contribution.user_value ?? item.contribution.wine_value,
        item.contribution.wine_value
      );
      return {
        axis: item.axis,
        title: copy.title,
        body: copy.body,
        magnitude: Number(item.gap.toFixed(2)),
      };
    });

  const caution = [...comparableAxes]
    .sort((left, right) => {
      if (left.gap !== right.gap) {
        return right.gap - left.gap;
      }
      return right.contribution.weight - left.contribution.weight;
    })
    .slice(0, 2)
    .map<ScoreInsight>((item) => {
      const copy = describeAlignment(
        item.axis,
        item.contribution.user_value ?? item.contribution.wine_value,
        item.contribution.wine_value
      );
      return {
        axis: item.axis,
        title: copy.title,
        body: copy.body,
        magnitude: Number(item.gap.toFixed(2)),
      };
    });

  return { positive, caution };
}

export function buildUserVectorFromContributions(
  axisContributions: AxisContributionMap
): Partial<SensoryVector> {
  const user: Partial<SensoryVector> = {};

  Object.entries(axisContributions).forEach(([axis, contribution]) => {
    if (typeof contribution.user_value === "number") {
      user[axis as SensoryAxis] = contribution.user_value;
    }
  });

  return user;
}

export function buildPalateStyleFamilies(
  sensory: Partial<Record<SensoryAxis, number | null | undefined>>
) {
  const styleScores = [
    {
      label: "Rich and plush",
      score:
        (sensory.body ?? 0) +
        (sensory.fruit_ripeness ?? 0) +
        (sensory.concentration ?? 0) +
        (sensory.oak_presence ?? 0),
    },
    {
      label: "Bright and lifted",
      score:
        (sensory.acidity ?? 0) +
        (sensory.freshness ?? 0) +
        (sensory.aromatic_intensity ?? 0) +
        (sensory.mineral ?? 0),
    },
    {
      label: "Savory and structured",
      score:
        (sensory.tannin ?? 0) +
        (sensory.earthy ?? 0) +
        (sensory.savory ?? 0) +
        (sensory.finish_length ?? 0),
    },
    {
      label: "Elegant and layered",
      score:
        (sensory.complexity ?? 0) +
        (sensory.aromatic_intensity ?? 0) +
        (sensory.freshness ?? 0) +
        (sensory.finish_length ?? 0),
    },
    {
      label: "Textural and grippy",
      score:
        (sensory.bitterness_phenolic_grip ?? 0) +
        (sensory.tannin ?? 0) +
        (sensory.body ?? 0) +
        (sensory.alcohol_perception ?? 0),
    },
  ];

  const sorted = styleScores.sort((left, right) => right.score - left.score);
  
  // If all scores are zero (no sensory signal), return empty array
  if (sorted[0]?.score === 0) {
    return [];
  }
  
  return sorted
    .slice(0, 3)
    .map((item) => item.label);
}

export function describePreferenceStrength(eventCount: number) {
  if (eventCount >= 18) {
    return {
      label: "Well defined",
      detail: "You have enough sensory history for a confident palate profile.",
      progress: 100,
    };
  }

  if (eventCount >= 8) {
    return {
      label: "Developing",
      detail: "Your palate profile is taking shape and getting more specific.",
      progress: Math.round((eventCount / 18) * 100),
    };
  }

  return {
    label: "Emerging",
    detail: "A few more detailed entries will make the profile much sharper.",
    progress: Math.round((Math.max(eventCount, 0) / 18) * 100),
  };
}

export function getMatchBandCopy(band: MatchBand) {
  return MATCH_BAND_COPY[band];
}

export function buildWineRadarSeries(
  effectiveProfile: EffectiveWineProfile,
  axisContributions: AxisContributionMap
) {
  return buildRadarSeries({
    wine: effectiveProfile.sensory,
    user: buildUserVectorFromContributions(axisContributions),
  });
}

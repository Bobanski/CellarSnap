import type { WineType } from "@/types/wine";

export const SENSORY_AXES = [
  "body",
  "acidity",
  "tannin",
  "alcohol_perception",
  "fruit_ripeness",
  "oak_presence",
  "earthy",
  "mineral",
  "savory",
  "aromatic_intensity",
  "sweetness_perception",
  "bitterness_phenolic_grip",
  "finish_length",
  "concentration",
  "complexity",
  "freshness",
] as const;

export type SensoryAxis = (typeof SENSORY_AXES)[number];
export type SensoryVector = Record<SensoryAxis, number>;

export type AxisContribution = {
  user_value: number | null;
  wine_value: number;
  weight: number;
  contribution: number;
};

export type EffectiveWineProfile = {
  sensory: SensoryVector;
  balance: {
    body_acid: number;
    sweet_acid: number;
    tannin_fruit: number;
    alcohol_body: number;
    oak_fruit: number;
    overall: number;
  };
  metadata: {
    base_profile_id: number;
    fallback_level: number;
    modifiers_applied: string[];
    aroma_clusters: {
      primary: string[];
      secondary: string[];
      tertiary: string[];
    };
    texture: string;
    style_families: string[];
    canonical_country: string | null;
    canonical_region: string | null;
    canonical_sub_region: string | null;
    primary_grapes: string[];
    classification: string | null;
    vintage: number | null;
  };
};

export type MatchBand = "excellent" | "strong" | "decent" | "not_your_style";

export type CategoricalPreferenceVector = {
  varietals: Record<string, number>;
  regions: Record<string, number>;
  countries: Record<string, number>;
  classifications: Record<string, number>;
  weights: {
    varietal: number;
    region: number;
    country: number;
    classification: number;
  };
};

export type EnjoymentSignals = {
  rating: number | null;
  enjoyment_intent: "seek_more" | "happily_again" | "if_poured" | "pass" | null;
  how_was_it: "exceptional" | "good" | "okay" | "bad" | "awful" | null;
};

export type MatchScore = {
  score: number;
  band: MatchBand;
  confidence: number;
  balance_factor: number;
  age_factor: number;
  enjoyment_factor: number;
  pre_balance_score: number;
  axis_contributions: Record<SensoryAxis, AxisContribution>;
};

export type UserPreferenceVector = {
  wine_type: WineType;
  sensory: Partial<SensoryVector>;
  weights: Partial<Record<SensoryAxis, number>>;
  categorical: CategoricalPreferenceVector;
  event_count: number;
};

export type AssembleWineProfileInput = {
  canonical_region: string | null;
  canonical_sub_region: string | null;
  canonical_country: string | null;
  wine_type: WineType;
  primary_grapes: string | null;
  vintage: number | null;
  producer: string | null;
  classification: string | null;
  quality_tier: string | null;
};

export type NlpNotesExtraction = {
  sensoryHints: Partial<Record<SensoryAxis, { value: number; confidence: number }>>;
  descriptorClusters: {
    primary: string[];
    secondary: string[];
  };
  sentiment: number;
  tokenCount: number;
};

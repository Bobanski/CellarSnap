import { expect, test } from "@playwright/test";
import {
  assembleWineProfileWithDataSource,
  type ProfileAssemblyDataSource,
} from "../src/server/algorithm/profileAssembly";
import { computeMatchScore } from "../src/server/algorithm/scoringEngine";
import { buildUserPreferenceVector } from "../src/server/algorithm/userPreferences";
import type {
  AssembleWineProfileInput,
  EffectiveWineProfile,
  UserPreferenceVector,
  SensoryVector,
} from "../src/server/algorithm/types";

const BASE_VECTOR: SensoryVector = {
  body: 4,
  acidity: 3,
  tannin: 4,
  alcohol_perception: 3,
  fruit_ripeness: 3,
  oak_presence: 2,
  earthy: 3,
  mineral: 2,
  savory: 3,
  aromatic_intensity: 3,
  sweetness_perception: 1,
  bitterness_phenolic_grip: 2,
  finish_length: 4,
  concentration: 4,
  complexity: 4,
  freshness: 3,
};

function makeBaseProfile(overrides: Record<string, unknown> = {}) {
  return {
    id: 1,
    country: "France",
    region: "Bordeaux",
    sub_region: "Left Bank",
    wine_type: "red",
    primary_grapes: "Cabernet Sauvignon, Merlot",
    quality_tier: "Classed Growth",
    overall_balance: 4,
    balance_body_acid: 4,
    balance_sweet_acid: 4,
    balance_tannin_fruit: 4,
    balance_alcohol_body: 4,
    balance_oak_fruit: 4,
    primary_aroma_clusters: "black fruit, cassis",
    secondary_aroma_clusters: "cedar",
    tertiary_aroma_clusters: "tobacco",
    texture: "structured",
    style_families: "classic, savory",
    ...BASE_VECTOR,
    ...overrides,
  };
}

function makeDataSource({
  baseProfiles = [makeBaseProfile()],
  agingCurves = [],
  vintageWeatherModifiers = [],
  grapeSensitivityCoefficients = [],
  classificationTaxonomy = [],
  classificationTierModifiers = [],
  producerModifiers = [],
  producerRegionCrosswalk = [],
}: Partial<{
  baseProfiles: Array<Record<string, unknown> & { id: number | string }>;
  agingCurves: Record<string, unknown>[];
  vintageWeatherModifiers: Record<string, unknown>[];
  grapeSensitivityCoefficients: Record<string, unknown>[];
  classificationTaxonomy: Record<string, unknown>[];
  classificationTierModifiers: Record<string, unknown>[];
  producerModifiers: Record<string, unknown>[];
  producerRegionCrosswalk: Record<string, unknown>[];
}> = {}): ProfileAssemblyDataSource {
  return {
    async listBaseProfiles() {
      return baseProfiles as Array<Record<string, unknown> & { id: number | string }>;
    },
    async listAgingCurves() {
      return agingCurves;
    },
    async listVintageWeatherModifiers() {
      return vintageWeatherModifiers;
    },
    async listGrapeSensitivityCoefficients() {
      return grapeSensitivityCoefficients;
    },
    async listClassificationTaxonomy() {
      return classificationTaxonomy;
    },
    async listClassificationTierModifiers() {
      return classificationTierModifiers;
    },
    async listProducerModifiers() {
      return producerModifiers;
    },
    async listProducerRegionCrosswalk() {
      return producerRegionCrosswalk;
    },
  };
}

function makeInput(
  overrides: Partial<AssembleWineProfileInput> = {}
): AssembleWineProfileInput {
  return {
    canonical_region: "Bordeaux",
    canonical_sub_region: "Left Bank",
    canonical_country: "France",
    wine_type: "red",
    primary_grapes: "Cabernet Sauvignon, Merlot",
    vintage: 2019,
    producer: "Opus One",
    classification: "Grand Cru",
    quality_tier: "Grand Cru",
    ...overrides,
  };
}

function buildPreferenceEntries(
  rating = 95,
  overrides: Record<string, unknown> = {}
) {
  return [
    {
      rating,
      wine_type: "red" as const,
      advanced_notes: {
        body: "full" as const,
        acidity: "medium" as const,
        tannin: "high" as const,
        alcohol: "medium" as const,
        sweetness: "dry" as const,
      },
      ...overrides,
    },
  ];
}

function buildProfileWithSensory(
  sensory: Partial<SensoryVector>,
  overallBalance = 4,
  fallbackLevel = 1,
  metadataOverrides: Partial<EffectiveWineProfile["metadata"]> = {}
): EffectiveWineProfile {
  return {
    sensory: {
      ...BASE_VECTOR,
      ...sensory,
    },
    balance: {
      body_acid: 4,
      sweet_acid: 4,
      tannin_fruit: 4,
      alcohol_body: 4,
      oak_fruit: 4,
      overall: overallBalance,
    },
    metadata: {
      base_profile_id: 1,
      fallback_level: fallbackLevel,
      modifiers_applied: [],
      aroma_clusters: {
        primary: [],
        secondary: [],
        tertiary: [],
      },
      texture: "structured",
      style_families: [],
      canonical_country: null,
      canonical_region: null,
      canonical_sub_region: null,
      primary_grapes: [],
      ...metadataOverrides,
    },
  };
}

function buildDenseUserPreferenceVector(
  sensory: Partial<SensoryVector> = {},
  categoricalOverrides: Partial<UserPreferenceVector["categorical"]> = {}
): UserPreferenceVector {
  return {
    wine_type: "red",
    sensory: {
      ...BASE_VECTOR,
      ...sensory,
    },
    weights: {},
    categorical: {
      varietals: {},
      regions: {},
      countries: {},
      weights: {
        varietal: 0,
        region: 0,
        country: 0,
      },
      ...categoricalOverrides,
    },
    event_count: 25,
  };
}

test.describe("WS1 algorithm core", () => {
  test("known wine lookup uses the most specific base profile", async () => {
    const profile = await assembleWineProfileWithDataSource(
      makeInput(),
      makeDataSource()
    );

    expect(profile.metadata.base_profile_id).toBe(1);
    expect(profile.metadata.fallback_level).toBe(1);
    expect(profile.sensory.body).toBe(4);
    expect(profile.sensory.tannin).toBe(4);
  });

  test("fallback hierarchy drops to region x wine_type when sub-region misses", async () => {
    const profile = await assembleWineProfileWithDataSource(
      makeInput({
        canonical_sub_region: "Unknown Bank",
        primary_grapes: "Pinot Noir",
      }),
      makeDataSource({
        baseProfiles: [
          makeBaseProfile({
            id: 2,
            sub_region: null,
            body: 3.5,
            primary_grapes: null,
            overall_balance: 5,
          }),
          makeBaseProfile({ id: 1 }),
        ],
      })
    );

    expect(profile.metadata.base_profile_id).toBe(2);
    expect(profile.metadata.fallback_level).toBe(4);
  });

  test("vintage weather modifiers are applied with grape sensitivity", async () => {
    const profile = await assembleWineProfileWithDataSource(
      makeInput(),
      makeDataSource({
        vintageWeatherModifiers: [
          {
            country: "France",
            region: "Bordeaux",
            sub_region: "Left Bank",
            vintage: 2019,
            red_delta_body: 0.4,
            red_delta_fruit_ripeness: 0.2,
          },
        ],
        grapeSensitivityCoefficients: [
          {
            grape_name: "Cabernet Sauvignon",
            coefficient_body: 1.5,
            coefficient_fruit_ripeness: 1.25,
          },
        ],
      })
    );

    expect(profile.sensory.body).toBe(4.4);
    expect(profile.sensory.fruit_ripeness).toBe(3.2);
    expect(profile.metadata.modifiers_applied).toContain("vintage:2019");
  });

  test("producer modifiers apply on top of the base profile", async () => {
    const profile = await assembleWineProfileWithDataSource(
      makeInput(),
      makeDataSource({
        producerModifiers: [
          {
            producer_name: "Opus One",
            region: "Bordeaux",
            delta_concentration: 0.3,
            delta_oak_presence: 0.4,
          },
        ],
      })
    );

    expect(profile.sensory.concentration).toBeGreaterThan(4);
    expect(profile.sensory.oak_presence).toBeGreaterThan(2);
    expect(profile.metadata.modifiers_applied).toContain("producer:Opus One");
  });

  test("classification modifiers boost the profile", async () => {
    const profile = await assembleWineProfileWithDataSource(
      makeInput(),
      makeDataSource({
        classificationTaxonomy: [
          {
            tier_name: "Grand Cru",
            classification_system: "Burgundy",
            country: "France",
          },
        ],
        classificationTierModifiers: [
          {
            tier_name: "Grand Cru",
            classification_system: "Burgundy",
            delta_concentration: 0.4,
            delta_finish_length: 0.2,
          },
        ],
      })
    );

    expect(profile.sensory.concentration).toBeGreaterThan(4.3);
    expect(profile.sensory.finish_length).toBeGreaterThan(4.1);
    expect(profile.metadata.modifiers_applied).toContain("classification:Grand Cru");
  });

  test("classification matching handles diacritics and prefers the region-specific system", async () => {
    const profile = await assembleWineProfileWithDataSource(
      makeInput({
        canonical_region: "Bordeaux",
        canonical_sub_region: "Saint-Emilion",
        classification: "Saint-Emilion 2022",
        quality_tier: "Grand Cru Classe",
      }),
      makeDataSource({
        classificationTaxonomy: [
          {
            country: "France",
            region: "Burgundy",
            classification_system: "Burgundy AOC Hierarchy",
            tier_name: "Grand Cru Classe",
            quality_rank: 1,
          },
          {
            country: "France",
            region: "Bordeaux",
            sub_region: "Saint-Émilion",
            classification_system: "Saint-Émilion 2022",
            tier_name: "Grand Cru Classé",
            quality_rank: 3,
          },
        ],
        classificationTierModifiers: [
          {
            classification_system: "Burgundy AOC Hierarchy",
            tier_name: "Grand Cru Classe",
            quality_rank: 1,
            delta_concentration: 0.1,
          },
          {
            classification_system: "Saint-Émilion 2022",
            tier_name: "Grand Cru Classé",
            quality_rank: 3,
            delta_concentration: 0.4,
          },
        ],
      })
    );

    expect(profile.sensory.concentration).toBeGreaterThan(4.3);
    expect(profile.metadata.modifiers_applied).toContain("classification:Grand Cru Classe");
  });

  test("relative clamp limits excessive stacked deltas", async () => {
    const profile = await assembleWineProfileWithDataSource(
      makeInput(),
      makeDataSource({
        vintageWeatherModifiers: [
          {
            region: "Bordeaux",
            vintage: 2019,
            red_delta_body: 3,
          },
        ],
        producerModifiers: [
          {
            producer_name: "Opus One",
            region: "Bordeaux",
            delta_body: 2,
          },
        ],
      })
    );

    expect(profile.sensory.body).toBe(4.5);
  });

  test("multiple modifiers stack in the documented order", async () => {
    const profile = await assembleWineProfileWithDataSource(
      makeInput(),
      makeDataSource({
        agingCurves: [
          {
            wine_type: "red",
            region: "Bordeaux",
            youth_end: 5,
            development_end: 10,
            peak_end: 20,
            decline_end: 30,
            youth_delta_freshness: 0.1,
          },
        ],
        vintageWeatherModifiers: [
          {
            region: "Bordeaux",
            vintage: 2019,
            red_delta_freshness: 0.2,
          },
        ],
        producerModifiers: [
          {
            producer_name: "Opus One",
            region: "Bordeaux",
            delta_freshness: 0.2,
          },
        ],
      })
    );

    expect(profile.sensory.freshness).toBe(3.4);
    expect(profile.metadata.modifiers_applied).toEqual([
      "aging:development",
      "vintage:2019",
      "producer:Opus One",
    ]);
  });

  test("wine with no vintage skips aging and weather modifiers", async () => {
    const profile = await assembleWineProfileWithDataSource(
      makeInput({ vintage: null }),
      makeDataSource({
        agingCurves: [
          {
            wine_type: "red",
            region: "Bordeaux",
            development_end: 10,
            dev_delta_body: 0.4,
          },
        ],
        vintageWeatherModifiers: [
          {
            region: "Bordeaux",
            vintage: 2019,
            red_delta_body: 0.7,
          },
        ],
      })
    );

    expect(profile.sensory.body).toBe(BASE_VECTOR.body);
    expect(profile.metadata.modifiers_applied).not.toContain("vintage:2019");
    expect(profile.metadata.modifiers_applied).not.toContain("aging:development");
  });

  test("unknown producer skips producer modifiers", async () => {
    const profile = await assembleWineProfileWithDataSource(
      makeInput({ producer: "Unknown Producer" }),
      makeDataSource({
        producerModifiers: [
          {
            producer_name: "Opus One",
            region: "Bordeaux",
            delta_concentration: 0.5,
          },
        ],
      })
    );

    expect(profile.sensory.concentration).toBe(BASE_VECTOR.concentration);
    expect(profile.metadata.modifiers_applied).not.toContain("producer:Unknown Producer");
  });

  test("producer modifier respects wine type filtering", async () => {
    const profile = await assembleWineProfileWithDataSource(
      makeInput({ producer: "Opus One", wine_type: "red" }),
      makeDataSource({
        producerModifiers: [
          {
            producer_name: "Opus One",
            region: "Bordeaux",
            wine_type: "Sparkling",
            delta_concentration: 1.5,
          },
          {
            producer_name: "Opus One",
            region: "Bordeaux",
            wine_type: "Red",
            delta_concentration: 0.3,
          },
        ],
      })
    );

    expect(profile.sensory.concentration).toBeGreaterThan(4);
    expect(profile.sensory.concentration).toBeLessThan(4.6);
  });

  test("sweet wines with sparse profile coverage degrade gracefully", async () => {
    const profile = await assembleWineProfileWithDataSource(
      makeInput({
        wine_type: "sweet",
        canonical_region: null,
        canonical_sub_region: null,
        canonical_country: null,
        primary_grapes: null,
        producer: null,
        classification: null,
        quality_tier: null,
        vintage: null,
      }),
      makeDataSource({
        baseProfiles: [
          makeBaseProfile({
            id: 77,
            wine_type: "sweet",
            country: null,
            region: null,
            sub_region: null,
            body: 3,
            acidity: 4,
            tannin: 1,
            sweetness_perception: 5,
          }),
        ],
      })
    );

    expect(profile.metadata.base_profile_id).toBe(77);
    expect(profile.metadata.fallback_level).toBe(6);
    expect(profile.sensory.sweetness_perception).toBe(5);
  });

  test("base profile selection uses quality tier and blend style as tie-breakers", async () => {
    const profile = await assembleWineProfileWithDataSource(
      makeInput({
        quality_tier: "Cru Classé",
        classification: "AOC",
      }),
      makeDataSource({
        baseProfiles: [
          makeBaseProfile({
            id: 9,
            primary_grapes: "Cabernet Sauvignon",
            blend_style: "Single Varietal",
            quality_tier: null,
            body: 3.2,
          }),
          makeBaseProfile({
            id: 10,
            primary_grapes: "Cabernet Sauvignon, Merlot, Cabernet Franc",
            blend_style: "Blend",
            quality_tier: "Cru Classé",
            body: 4.1,
          }),
        ],
      })
    );

    expect(profile.metadata.base_profile_id).toBe(10);
    expect(profile.sensory.body).toBe(4.1);
  });

  test("perfect match scores near 100", () => {
    const user = buildUserPreferenceVector(buildPreferenceEntries(), "red");
    const wine = buildProfileWithSensory({
      body: user.sensory.body ?? 5,
      acidity: user.sensory.acidity ?? 3,
      tannin: user.sensory.tannin ?? 5,
      alcohol_perception: user.sensory.alcohol_perception ?? 3,
      sweetness_perception: user.sensory.sweetness_perception ?? 1,
    }, 5);

    const score = computeMatchScore(wine, user);
    expect(score.score).toBeGreaterThan(90);
    expect(score.band).toBe("excellent");
  });

  test("clear mismatch falls below the strong bands", () => {
    const user = buildUserPreferenceVector(buildPreferenceEntries(), "red");
    const wine = buildProfileWithSensory({
      body: 1,
      acidity: 5,
      tannin: 1,
      alcohol_perception: 5,
      sweetness_perception: 5,
    });

    const score = computeMatchScore(wine, user);
    expect(score.score).toBeLessThan(60);
    expect(score.band).toBe("not_your_style");
  });

  test("axis contributions sum to the weighted squared differences", () => {
    const user = buildDenseUserPreferenceVector();
    const wine = buildProfileWithSensory({
      body: 5,
      acidity: 2,
      tannin: 3,
    });

    const score = computeMatchScore(wine, user);
    const contributionSum = Object.values(score.axis_contributions).reduce(
      (sum, contribution) => sum + contribution.contribution,
      0
    );

    expect(contributionSum).toBeCloseTo(3.6, 5);
    expect(score.axis_contributions.body.contribution).toBeCloseTo(1.2, 5);
    expect(score.axis_contributions.acidity.contribution).toBeCloseTo(1.2, 5);
    expect(score.axis_contributions.tannin.contribution).toBeCloseTo(1.2, 5);
  });

  test("complexity participates in scoring when the user vector includes it", () => {
    const user = buildDenseUserPreferenceVector({
      complexity: 5,
    });
    const wine = buildProfileWithSensory({
      complexity: 1,
    });

    const score = computeMatchScore(wine, user);

    expect(score.axis_contributions.complexity.user_value).toBe(5);
    expect(score.axis_contributions.complexity.wine_value).toBe(1);
    expect(score.axis_contributions.complexity.weight).toBe(1);
    expect(score.axis_contributions.complexity.contribution).toBeCloseTo(16, 5);
  });

  test("score bands classify strong and decent results correctly", () => {
    const user = buildDenseUserPreferenceVector();
    const strongWine = buildProfileWithSensory({
      body: BASE_VECTOR.body + 1,
    });
    const decentWine = buildProfileWithSensory({
      body: BASE_VECTOR.body + 1,
      acidity: BASE_VECTOR.acidity - 1,
      tannin: BASE_VECTOR.tannin - 1,
    });

    const strongScore = computeMatchScore(strongWine, user);
    const decentScore = computeMatchScore(decentWine, user);

    expect(strongScore.score).toBeGreaterThanOrEqual(75);
    expect(strongScore.score).toBeLessThan(90);
    expect(strongScore.band).toBe("strong");
    expect(decentScore.score).toBeGreaterThanOrEqual(60);
    expect(decentScore.score).toBeLessThan(75);
    expect(decentScore.band).toBe("decent");
  });

  test("balance factor reduces the final score", () => {
    const user = buildUserPreferenceVector(buildPreferenceEntries(), "red");
    const balancedWine = buildProfileWithSensory({
      body: user.sensory.body ?? 5,
      acidity: user.sensory.acidity ?? 3,
      tannin: user.sensory.tannin ?? 5,
      alcohol_perception: user.sensory.alcohol_perception ?? 3,
      sweetness_perception: user.sensory.sweetness_perception ?? 1,
    });
    const unbalancedWine = buildProfileWithSensory(
      balancedWine.sensory,
      3
    );

    const highScore = computeMatchScore(balancedWine, user);
    const lowScore = computeMatchScore(unbalancedWine, user);

    expect(lowScore.balance_factor).toBe(0.92);
    expect(lowScore.score).toBeLessThan(highScore.score);
  });

  test("categorical preferences lift wines that match varietal and place bias", () => {
    const user = buildDenseUserPreferenceVector(
      {},
      {
        varietals: {
          "pinot noir": 1,
          "cabernet sauvignon": 0.15,
        },
        regions: {
          "santa rita hills": 1,
          "central coast": 0.7,
        },
        countries: {
          usa: 1,
        },
        weights: {
          varietal: 1,
          region: 1,
          country: 1,
        },
      }
    );

    const matchingWine = buildProfileWithSensory({}, 4, 1, {
      canonical_country: "USA",
      canonical_region: "Central Coast",
      canonical_sub_region: "Santa Rita Hills",
      primary_grapes: ["Pinot Noir"],
    });
    const mismatchingWine = buildProfileWithSensory({}, 4, 1, {
      canonical_country: "France",
      canonical_region: "Bordeaux",
      canonical_sub_region: "Left Bank",
      primary_grapes: ["Cabernet Sauvignon"],
    });

    const matchingScore = computeMatchScore(matchingWine, user);
    const mismatchingScore = computeMatchScore(mismatchingWine, user);

    expect(matchingScore.pre_balance_score).toBeCloseTo(
      mismatchingScore.pre_balance_score,
      5
    );
    expect(matchingScore.score).toBeGreaterThan(mismatchingScore.score + 10);
    expect(matchingScore.score).toBeGreaterThan(60);
  });

  test("empty user preference vector returns low confidence", () => {
    const score = computeMatchScore(
      buildProfileWithSensory({}),
      {
        wine_type: "red",
        sensory: {},
        weights: {},
        categorical: {
          varietals: {},
          regions: {},
          countries: {},
          weights: {
            varietal: 0,
            region: 0,
            country: 0,
          },
        },
        event_count: 0,
      }
    );

    expect(score.confidence).toBeLessThan(0.5);
    expect(score.pre_balance_score).toBe(50);
  });

  test("user preference shrinkage blends same-type and global history", () => {
    const user = buildUserPreferenceVector(
      [
        {
          rating: 95,
          wine_type: "red",
          advanced_notes: {
            body: "full",
            acidity: "medium",
            tannin: "high",
            alcohol: "medium",
            sweetness: "dry",
          },
        },
        {
          rating: 95,
          wine_type: "white",
          advanced_notes: {
            body: "light",
            acidity: "high",
            tannin: "low",
            alcohol: "low",
            sweetness: "dry",
          },
        },
      ],
      "red"
    );

    expect(user.event_count).toBe(1);
    expect(user.sensory.body).toBeLessThan(5);
    expect(user.sensory.body).toBeGreaterThan(1);
    expect(user.sensory.acidity).toBeGreaterThan(3);
  });
});

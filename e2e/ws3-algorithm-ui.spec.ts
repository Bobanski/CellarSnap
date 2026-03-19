import { expect, test } from "@playwright/test";
import type { User } from "@supabase/supabase-js";
import { createAlgorithmScoreBatchHandler } from "../src/app/api/algorithm/score/batch/handler";
import { refreshRecentUserScoreCache } from "../src/server/algorithm/cacheRefresh";
import {
  buildPalateStyleFamilies,
  buildScoreInsights,
} from "../src/lib/algorithm/matchUi";
import type { EffectiveWineProfile } from "../src/server/algorithm/types";

function makeUser(id: string): User {
  return {
    id,
    aud: "authenticated",
    role: "authenticated",
    email: "eitansneider1@gmail.com",
    app_metadata: {},
    user_metadata: {},
    identities: [],
    created_at: "2026-01-01T00:00:00.000Z",
  } as unknown as User;
}

function makeProfile(): EffectiveWineProfile {
  return {
    sensory: {
      body: 4,
      acidity: 3,
      tannin: 4,
      alcohol_perception: 3,
      fruit_ripeness: 4,
      oak_presence: 3,
      earthy: 2,
      mineral: 2,
      savory: 3,
      aromatic_intensity: 4,
      sweetness_perception: 1,
      bitterness_phenolic_grip: 2,
      finish_length: 4,
      concentration: 4,
      complexity: 4,
      freshness: 3,
    },
    balance: {
      body_acid: 4,
      sweet_acid: 4,
      tannin_fruit: 4,
      alcohol_body: 4,
      oak_fruit: 4,
      overall: 4,
    },
    metadata: {
      base_profile_id: 1,
      fallback_level: 1,
      modifiers_applied: ["vintage:2019"],
      aroma_clusters: {
        primary: ["dark fruit"],
        secondary: [],
        tertiary: [],
      },
      texture: "layered",
      style_families: ["classic"],
      canonical_country: "France",
      canonical_region: "Bordeaux",
      canonical_sub_region: "Left Bank",
      primary_grapes: ["Cabernet Sauvignon", "Merlot"],
    },
  };
}

function makeRefreshSupabase(rows: Record<string, unknown>[]) {
  return {
    from: () => ({
      select: () => ({
        eq: () => ({
          order: () => ({
            order: () => ({
              limit: async () => ({
                data: rows,
                error: null,
              }),
            }),
          }),
        }),
      }),
    }),
  } as never;
}

test.describe("WS3 algorithm UI support", () => {
  test("batch score handler returns mixed score results with preference counts", async () => {
    const handler = createAlgorithmScoreBatchHandler({
      requireRequestAuth: async () =>
        ({
          supabase: {} as never,
          user: makeUser("user-1"),
          authMode: "bearer",
        }) as never,
      loadEntryForScoring: async (_supabase, _userId, entryId) => ({
        wine_type: "red",
        canonical_region: "Bordeaux",
        canonical_sub_region: "Left Bank",
        canonical_country: "France",
        primary_grapes: "Cabernet Sauvignon",
        vintage: 2019,
        producer: `Producer ${entryId.slice(0, 4)}`,
        classification: "Grand Cru",
        quality_tier: "Grand Cru",
      }),
      assembleProfile: async () => makeProfile(),
      loadUserPreferenceEntries: async () => [
        {
          rating: 94,
          wine_type: "red",
          advanced_notes: {
            body: "full",
            acidity: "medium",
            tannin: "high",
            alcohol: "medium",
            sweetness: "dry",
          },
        },
      ],
    });

    const response = await handler(
      new Request("http://localhost/api/algorithm/score/batch", {
        method: "POST",
        body: JSON.stringify({
          items: [
            {
              request_id: "mine",
              entry_id: "11111111-1111-4111-8111-111111111111",
            },
            {
              request_id: "friend",
              wine_type: "red",
              canonical_country: "France",
              canonical_region: "Bordeaux",
            },
          ],
        }),
      })
    );

    expect(response.status).toBe(200);
    const payload = (await response.json()) as {
      results: Array<{
        request_id: string;
        ok: boolean;
        data: { preference_event_count: number; score: number; display_score: boolean } | null;
      }>;
    };

    expect(payload.results).toHaveLength(2);
    expect(payload.results.every((result) => result.ok)).toBeTruthy();
    expect(payload.results[0]?.data?.preference_event_count).toBe(1);
    expect(payload.results[0]?.data?.score).toBeGreaterThan(0);
    expect(payload.results[1]?.data?.display_score).toBeTruthy();
  });

  test("batch score handler returns cached scores without recomputing", async () => {
    let assembleCalls = 0;

    const handler = createAlgorithmScoreBatchHandler({
      requireRequestAuth: async () =>
        ({
          supabase: {} as never,
          user: makeUser("user-1"),
          authMode: "bearer",
        }) as never,
      readCachedEntryScores: async () =>
        new Map([
          [
            "11111111-1111-4111-8111-111111111111",
            {
              score: 92,
              band: "excellent",
              confidence: 0.88,
              balance_factor: 1,
              pre_balance_score: 92,
              effective_profile: makeProfile(),
              axis_contributions: {
                body: { user_value: 4, wine_value: 4, weight: 1.2, contribution: 0 },
                acidity: { user_value: 3, wine_value: 3, weight: 1.2, contribution: 0 },
                tannin: { user_value: 4, wine_value: 4, weight: 1.2, contribution: 0 },
                alcohol_perception: { user_value: 3, wine_value: 3, weight: 0.8, contribution: 0 },
                fruit_ripeness: { user_value: 4, wine_value: 4, weight: 1.2, contribution: 0 },
                oak_presence: { user_value: 3, wine_value: 3, weight: 1, contribution: 0 },
                earthy: { user_value: 2, wine_value: 2, weight: 0.8, contribution: 0 },
                mineral: { user_value: 2, wine_value: 2, weight: 0.8, contribution: 0 },
                savory: { user_value: 3, wine_value: 3, weight: 0.8, contribution: 0 },
                aromatic_intensity: { user_value: 4, wine_value: 4, weight: 1, contribution: 0 },
                sweetness_perception: { user_value: 1, wine_value: 1, weight: 0.6, contribution: 0 },
                bitterness_phenolic_grip: { user_value: 2, wine_value: 2, weight: 0.6, contribution: 0 },
                finish_length: { user_value: 4, wine_value: 4, weight: 1, contribution: 0 },
                concentration: { user_value: 4, wine_value: 4, weight: 1, contribution: 0 },
                complexity: { user_value: 4, wine_value: 4, weight: 1, contribution: 0 },
                freshness: { user_value: 3, wine_value: 3, weight: 1, contribution: 0 },
              },
              modifiers_applied: ["cache"],
              display_score: true,
              confidence_warning: null,
              preference_event_count: 7,
            },
          ],
        ]),
      assembleProfile: async () => {
        assembleCalls += 1;
        return makeProfile();
      },
      loadUserPreferenceEntries: async () => [],
    });

    const response = await handler(
      new Request("http://localhost/api/algorithm/score/batch", {
        method: "POST",
        body: JSON.stringify({
          items: [
            {
              request_id: "cached",
              entry_id: "11111111-1111-4111-8111-111111111111",
            },
          ],
        }),
      })
    );

    expect(response.status).toBe(200);
    const payload = (await response.json()) as {
      results: Array<{ data: { score: number; modifiers_applied: string[] } | null }>;
    };
    expect(payload.results[0]?.data?.score).toBe(92);
    expect(payload.results[0]?.data?.modifiers_applied).toEqual(["cache"]);
    expect(assembleCalls).toBe(0);
  });

  test("batch score handler uses direct fields when entry_id is present", async () => {
    let loadCalls = 0;

    const handler = createAlgorithmScoreBatchHandler({
      requireRequestAuth: async () =>
        ({
          supabase: {} as never,
          user: makeUser("user-1"),
          authMode: "bearer",
        }) as never,
      readCachedEntryScores: async () => new Map(),
      loadEntryForScoring: async () => {
        loadCalls += 1;
        return null;
      },
      assembleProfile: async () => makeProfile(),
      loadUserPreferenceEntries: async () => [
        {
          rating: 94,
          wine_type: "red",
          advanced_notes: {
            body: "full",
            acidity: "medium",
            tannin: "high",
            alcohol: "medium",
            sweetness: "dry",
          },
        },
      ],
    });

    const response = await handler(
      new Request("http://localhost/api/algorithm/score/batch", {
        method: "POST",
        body: JSON.stringify({
          items: [
            {
              request_id: "friend",
              entry_id: "11111111-1111-4111-8111-111111111111",
              wine_type: "red",
              canonical_country: "France",
            },
          ],
        }),
      })
    );

    expect(response.status).toBe(200);
    const payload = (await response.json()) as {
      results: Array<{ ok: boolean; data: { score: number } | null }>;
    };
    expect(payload.results[0]?.ok).toBeTruthy();
    expect(payload.results[0]?.data?.score).toBeGreaterThan(0);
    expect(loadCalls).toBe(0);
  });

  test("batch score handler merges loaded entry data with direct overrides", async () => {
    let assembledInput: Record<string, unknown> | null = null;
    let cacheReadIds: string[] = [];
    let cacheWriteCount = 0;

    const handler = createAlgorithmScoreBatchHandler({
      requireRequestAuth: async () =>
        ({
          supabase: {} as never,
          user: makeUser("user-1"),
          authMode: "bearer",
        }) as never,
      readCachedEntryScores: async (_supabase, _userId, entryIds) => {
        cacheReadIds = entryIds;
        return new Map();
      },
      loadEntryForScoring: async () => ({
        wine_type: "red",
        canonical_region: "Bordeaux",
        canonical_sub_region: "Left Bank",
        canonical_country: "France",
        primary_grapes: "Cabernet Sauvignon",
        vintage: 2019,
        producer: "Loaded Producer",
        classification: "Loaded Classification",
        quality_tier: null,
      }),
      assembleProfile: async (input) => {
        assembledInput = input as Record<string, unknown>;
        return makeProfile();
      },
      loadUserPreferenceEntries: async () => [],
      writeCachedEntryScore: async () => {
        cacheWriteCount += 1;
      },
    });

    const response = await handler(
      new Request("http://localhost/api/algorithm/score/batch", {
        method: "POST",
        body: JSON.stringify({
          items: [
            {
              request_id: "override",
              entry_id: "11111111-1111-4111-8111-111111111111",
              canonical_region: "Napa Valley",
              classification: "Reserve",
            },
          ],
        }),
      })
    );

    expect(response.status).toBe(200);
    const payload = (await response.json()) as {
      results: Array<{ ok: boolean; data: { score: number } | null }>;
    };
    expect(payload.results[0]?.ok).toBeTruthy();
    expect(payload.results[0]?.data?.score).toBeGreaterThan(0);
    expect(assembledInput).toMatchObject({
      wine_type: "red",
      canonical_region: "Napa Valley",
      classification: "Reserve",
      quality_tier: "Reserve",
    });
    expect(cacheReadIds).toEqual([]);
    expect(cacheWriteCount).toBe(0);
  });

  test("score insights surface aligned axes and biggest gaps", () => {
    const insights = buildScoreInsights({
      body: { user_value: 4, wine_value: 4, weight: 1.2, contribution: 0 },
      acidity: { user_value: 4, wine_value: 2, weight: 1.2, contribution: 4.8 },
      tannin: { user_value: 4, wine_value: 5, weight: 1.2, contribution: 1.2 },
      alcohol_perception: { user_value: 3, wine_value: 3, weight: 0.8, contribution: 0 },
      fruit_ripeness: { user_value: 4, wine_value: 4, weight: 1.2, contribution: 0 },
      oak_presence: { user_value: 2, wine_value: 4, weight: 1, contribution: 4 },
      earthy: { user_value: 3, wine_value: 3, weight: 0.8, contribution: 0 },
      mineral: { user_value: 2, wine_value: 2, weight: 0.8, contribution: 0 },
      savory: { user_value: 3, wine_value: 3, weight: 0.8, contribution: 0 },
      aromatic_intensity: { user_value: 4, wine_value: 4, weight: 1, contribution: 0 },
      sweetness_perception: { user_value: 1, wine_value: 1, weight: 0.6, contribution: 0 },
      bitterness_phenolic_grip: { user_value: 2, wine_value: 2, weight: 0.6, contribution: 0 },
      finish_length: { user_value: 4, wine_value: 4, weight: 1, contribution: 0 },
      concentration: { user_value: 4, wine_value: 4, weight: 1, contribution: 0 },
      complexity: { user_value: 4, wine_value: 4, weight: 1, contribution: 0 },
      freshness: { user_value: 4, wine_value: 4, weight: 1, contribution: 0 },
    });

    expect(insights.positive).toHaveLength(3);
    expect(insights.caution).toHaveLength(2);
    expect(insights.caution[0]?.body).toContain("acidity");
  });

  test("palate style families favor rich profiles when the vector is plush", () => {
    const families = buildPalateStyleFamilies({
      body: 5,
      fruit_ripeness: 5,
      concentration: 4,
      oak_presence: 4,
      acidity: 2,
      freshness: 2,
    });

    expect(families[0]).toBe("Rich and plush");
    expect(families).toHaveLength(3);
  });

  test("recent score cache refresh repopulates a bounded recent slice", async () => {
    const writes: Array<{ entryId: string; score: number; preferenceEventCount: number }> = [];
    let preferenceVectorCalls = 0;

    await refreshRecentUserScoreCache(
      makeRefreshSupabase([
        {
          id: "entry-1",
          wine_type: "red",
          canonical_country: "France",
          canonical_region: "Bordeaux",
          canonical_sub_region: "Left Bank",
          producer: "Producer 1",
          classification: "Grand Cru",
          quality_tier: "Grand Cru",
          vintage: "2019",
        },
        {
          id: "entry-2",
          wine_type: "red",
          canonical_country: "France",
          canonical_region: "Bordeaux",
          canonical_sub_region: "Right Bank",
          producer: "Producer 2",
          classification: "Cru Bourgeois",
          quality_tier: "Cru Bourgeois",
          vintage: "2018",
        },
        {
          id: "entry-3",
          wine_type: null,
        },
      ]),
      "user-1",
      {
        loadUserPreferenceEntries: async () => [
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
        ],
        fetchPrimaryGrapesByEntryId: async () =>
          new Map([
            [
              "entry-1",
              [{ id: "cab", name: "Cabernet Sauvignon", position: 0 }],
            ],
            [
              "entry-2",
              [{ id: "mer", name: "Merlot", position: 0 }],
            ],
          ]),
        buildUserPreferenceVector: (entries, wineType) => {
          preferenceVectorCalls += 1;
          expect(entries).toHaveLength(1);
          expect(wineType).toBe("red");
          return {
            wine_type: wineType,
            sensory: {
              body: 4,
              acidity: 3,
              tannin: 4,
              alcohol_perception: 3,
              fruit_ripeness: 4,
              oak_presence: 3,
            },
            weights: {
              body: 1.2,
              acidity: 1.2,
              tannin: 1.2,
              alcohol_perception: 0.8,
              fruit_ripeness: 1.2,
              oak_presence: 1,
            },
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
            event_count: 4,
          };
        },
        assembleProfile: async (input) => {
          expect(input.primary_grapes).toBeTruthy();
          return makeProfile();
        },
        computeMatchScore: () => ({
          score: 91.6,
          band: "excellent" as const,
          confidence: 0.86,
          balance_factor: 1,
          pre_balance_score: 91.6,
          axis_contributions: {
            body: { user_value: 4, wine_value: 4, weight: 1.2, contribution: 0 },
            acidity: { user_value: 3, wine_value: 3, weight: 1.2, contribution: 0 },
            tannin: { user_value: 4, wine_value: 4, weight: 1.2, contribution: 0 },
            alcohol_perception: { user_value: 3, wine_value: 3, weight: 0.8, contribution: 0 },
            fruit_ripeness: { user_value: 4, wine_value: 4, weight: 1.2, contribution: 0 },
            oak_presence: { user_value: 3, wine_value: 3, weight: 1, contribution: 0 },
            earthy: { user_value: 2, wine_value: 2, weight: 0.8, contribution: 0 },
            mineral: { user_value: 2, wine_value: 2, weight: 0.8, contribution: 0 },
            savory: { user_value: 3, wine_value: 3, weight: 0.8, contribution: 0 },
            aromatic_intensity: { user_value: 4, wine_value: 4, weight: 1, contribution: 0 },
            sweetness_perception: { user_value: 1, wine_value: 1, weight: 0.6, contribution: 0 },
            bitterness_phenolic_grip: { user_value: 2, wine_value: 2, weight: 0.6, contribution: 0 },
            finish_length: { user_value: 4, wine_value: 4, weight: 1, contribution: 0 },
            concentration: { user_value: 4, wine_value: 4, weight: 1, contribution: 0 },
            complexity: { user_value: 4, wine_value: 4, weight: 1, contribution: 0 },
            freshness: { user_value: 3, wine_value: 3, weight: 1, contribution: 0 },
          },
        }),
        writeCachedEntryScore: async (_supabase, _userId, entryId, payload) => {
          writes.push({
            entryId,
            score: payload.score,
            preferenceEventCount: payload.preference_event_count,
          });
        },
      }
    );

    expect(writes).toEqual([
      { entryId: "entry-1", score: 92, preferenceEventCount: 4 },
      { entryId: "entry-2", score: 92, preferenceEventCount: 4 },
    ]);
    expect(preferenceVectorCalls).toBe(1);
  });

  test("recent score cache refresh exits early when there are no scoreable entries", async () => {
    let loadPreferenceCalls = 0;
    let writeCalls = 0;

    await refreshRecentUserScoreCache(
      makeRefreshSupabase([
        {
          id: "entry-1",
          wine_type: null,
        },
      ]),
      "user-1",
      {
        loadUserPreferenceEntries: async () => {
          loadPreferenceCalls += 1;
          return [];
        },
        writeCachedEntryScore: async () => {
          writeCalls += 1;
        },
      }
    );

    expect(loadPreferenceCalls).toBe(0);
    expect(writeCalls).toBe(0);
  });
});

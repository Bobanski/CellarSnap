import { test, expect } from "@playwright/test";
import {
  inferWineType,
  isValidWineType,
  resolveEntryFields,
} from "../src/server/algorithm/resolver";
import {
  lookupGrapeAlias,
  lookupProducerAlias,
  lookupRegionAlias,
} from "../src/server/algorithm/aliasLookup";
import { createEntryPostHandler } from "../src/app/api/entries/route";
import { createEntryPutHandler } from "../src/app/api/entries/[id]/putHandler";
import { createEntrySchema, updateEntrySchema } from "../src/server/entries/schema";
import { WINE_TYPE_VALUES } from "../src/types/wine";

type TableFixtures = Record<string, unknown[]>;

function createMockSupabase(fixtures: TableFixtures) {
  return {
    from(table: string) {
      const state: {
        table: string;
        filters: { column: string; value: string }[];
      } = {
        table,
        filters: [],
      };

      const chain = {
        select(columns: string) {
          void columns;
          return chain;
        },
        ilike(column: string, value: string) {
          state.filters.push({ column, value });
          return chain;
        },
        limit(count: number) {
          void count;
          return chain;
        },
        async maybeSingle() {
          const rows = (fixtures[state.table] ?? []) as Record<string, unknown>[];
          const match =
            rows.find((row) =>
              state.filters.every(({ column, value }) => {
                const candidate = row[column];
                return (
                  typeof candidate === "string" &&
                  candidate.toLowerCase() === value.toLowerCase()
                );
              })
            ) ?? null;

          return {
            data: match,
            error: null,
          };
        },
      };

      return chain;
    },
  };
}

function makeAuthenticatedUser(id: string) {
  return {
    id,
    aud: "authenticated",
    role: "authenticated",
    email: `${id}@example.com`,
    app_metadata: {},
    user_metadata: {},
    identities: [],
    created_at: "2026-01-01T00:00:00.000Z",
  };
}

test.describe("WS2: Entry Normalization", () => {
  test.describe("alias lookups", () => {
    test("looks up a region alias case-insensitively", async () => {
      const supabase = createMockSupabase({
        region_aliases: [
          {
            alias: "Napa",
            canonical_region: "Napa Valley",
            canonical_sub_region: null,
            canonical_country: "USA",
            alias_type: "abbreviation",
          },
        ],
      });

      await expect(lookupRegionAlias(supabase, "napa")).resolves.toEqual({
        canonical_region: "Napa Valley",
        canonical_sub_region: null,
        canonical_country: "USA",
        alias_type: "abbreviation",
        matched: true,
      });
    });

    test("looks up a producer alias", async () => {
      const supabase = createMockSupabase({
        producer_aliases: [
          {
            alias: "DRC",
            canonical_producer_name: "Domaine de la Romanée-Conti",
            alias_type: "short_name",
          },
        ],
      });

      await expect(lookupProducerAlias(supabase, "drc")).resolves.toEqual({
        canonical_producer_name: "Domaine de la Romanée-Conti",
        alias_type: "short_name",
        matched: true,
      });
    });

    test("looks up a grape alias using alias_normalized", async () => {
      const supabase = createMockSupabase({
        grape_aliases: [
          {
            alias: "Cab Sauv",
            alias_normalized: "cab sauv",
            variety_id: "grape-1",
            alias_type: "colloquial",
            grape_varieties: { name: "Cabernet Sauvignon" },
          },
        ],
      });

      await expect(lookupGrapeAlias(supabase, "cab sauv")).resolves.toEqual({
        canonical_name: "Cabernet Sauvignon",
        variety_id: "grape-1",
        alias_type: "colloquial",
        matched: true,
      });
    });

    test("returns null when no alias match is found", async () => {
      const supabase = createMockSupabase({});
      await expect(lookupRegionAlias(supabase, "Unknown Region XYZ")).resolves.toBeNull();
    });
  });

  test.describe("WINE_TYPE_VALUES", () => {
    test("contains exactly 6 wine types", () => {
      expect(WINE_TYPE_VALUES).toHaveLength(6);
    });

    test("contains all expected values", () => {
      expect(WINE_TYPE_VALUES).toContain("red");
      expect(WINE_TYPE_VALUES).toContain("white");
      expect(WINE_TYPE_VALUES).toContain("rose");
      expect(WINE_TYPE_VALUES).toContain("sparkling");
      expect(WINE_TYPE_VALUES).toContain("sweet");
      expect(WINE_TYPE_VALUES).toContain("orange");
    });
  });

  test.describe("isValidWineType", () => {
    test("returns true for all valid wine types", () => {
      for (const wt of WINE_TYPE_VALUES) {
        expect(isValidWineType(wt)).toBe(true);
      }
    });

    test("returns false for accented variant", () => {
      expect(isValidWineType("rosé")).toBe(false);
    });

    test("returns false for unknown value", () => {
      expect(isValidWineType("dessert")).toBe(false);
      expect(isValidWineType("Red")).toBe(false);
    });

    test("returns false for null and undefined", () => {
      expect(isValidWineType(null)).toBe(false);
      expect(isValidWineType(undefined)).toBe(false);
    });
  });

  test.describe("resolveEntryFields — fallback level derivation (D11)", () => {
    test("level 1 (sub_region × varietal × wine_type): confidence 0.95", async () => {
      const supabase = createMockSupabase({
        region_aliases: [
          {
            alias: "Cote de Nuits",
            canonical_region: "Burgundy",
            canonical_sub_region: "Cote de Nuits",
            canonical_country: "France",
            alias_type: "exact",
          },
        ],
        grape_aliases: [
          {
            alias: "Pinot Noir",
            alias_normalized: "pinot noir",
            variety_id: "grape-1",
            alias_type: "exact",
            grape_varieties: { name: "Pinot Noir" },
          },
        ],
      });

      const result = await resolveEntryFields(supabase, {
        region: "Cote de Nuits",
        producer: null,
        classification: null,
        wine_type: "red",
        country: "France",
        varietal: "Pinot Noir",
      });
      expect(result.fallback_level).toBe(1);
      expect(result.resolution_confidence).toBe(0.95);
    });

    test("level 2 (sub_region × wine_type): confidence 0.85", async () => {
      const supabase = createMockSupabase({
        region_aliases: [
          {
            alias: "Chablis",
            canonical_region: "Burgundy",
            canonical_sub_region: "Chablis",
            canonical_country: "France",
            alias_type: "exact",
          },
        ],
      });

      const result = await resolveEntryFields(supabase, {
        region: "Chablis",
        producer: null,
        classification: null,
        wine_type: "white",
        country: "France",
      });
      expect(result.fallback_level).toBe(2);
      expect(result.resolution_confidence).toBe(0.85);
    });

    test("level 3 (region × varietal × wine_type): confidence 0.75", async () => {
      const supabase = createMockSupabase({
        region_aliases: [
          {
            alias: "Napa",
            canonical_region: "Napa Valley",
            canonical_sub_region: null,
            canonical_country: "USA",
            alias_type: "abbreviation",
          },
        ],
        grape_aliases: [
          {
            alias: "Cabernet Sauvignon",
            alias_normalized: "cabernet sauvignon",
            variety_id: "grape-1",
            alias_type: "exact",
            grape_varieties: { name: "Cabernet Sauvignon" },
          },
        ],
      });

      const result = await resolveEntryFields(supabase, {
        region: "Napa",
        producer: null,
        classification: null,
        wine_type: "red",
        country: null,
        varietal: "Cabernet Sauvignon",
      });
      expect(result.fallback_level).toBe(3);
      expect(result.resolution_confidence).toBe(0.75);
    });

    test("level 4 (region × wine_type): confidence 0.6", async () => {
      const result = await resolveEntryFields(createMockSupabase({}), {
        region: "Napa Valley",
        producer: null,
        classification: null,
        wine_type: "red",
        country: "United States",
      });
      expect(result.fallback_level).toBe(4);
      expect(result.resolution_confidence).toBe(0.6);
    });

    test("level 5 (country × wine_type, no region): confidence 0.5", async () => {
      const result = await resolveEntryFields(createMockSupabase({}), {
        region: null,
        producer: null,
        classification: null,
        wine_type: "white",
        country: "France",
      });
      expect(result.fallback_level).toBe(5);
      expect(result.resolution_confidence).toBe(0.5);
    });

    test("level 6 (wine_type only, no region or country): confidence 0", async () => {
      const result = await resolveEntryFields(createMockSupabase({}), {
        region: null,
        producer: null,
        classification: null,
        wine_type: "red",
        country: null,
      });
      expect(result.fallback_level).toBe(6);
      expect(result.resolution_confidence).toBe(0);
    });
  });

  test.describe("resolveEntryFields — source and passthrough behavior", () => {
    test("returns raw values as canonical values when no aliases match", async () => {
      const result = await resolveEntryFields(createMockSupabase({}), {
        region: "Burgundy",
        producer: "Domaine de la Romanée-Conti",
        classification: "Grand Cru",
        wine_type: "red",
        country: "France",
      });
      expect(result.canonical_region).toBe("Burgundy");
      expect(result.canonical_producer).toBe("Domaine de la Romanée-Conti");
      expect(result.canonical_classification).toBe("Grand Cru");
      expect(result.resolution_source).toBe("stub");
    });

    test("returns alias_map when a non-exact alias matches", async () => {
      const supabase = createMockSupabase({
        region_aliases: [
          {
            alias: "Napa",
            canonical_region: "Napa Valley",
            canonical_sub_region: null,
            canonical_country: "USA",
            alias_type: "abbreviation",
          },
        ],
      });

      const result = await resolveEntryFields(supabase, {
        region: "Napa",
        producer: null,
        classification: null,
        wine_type: "red",
        country: null,
      });
      expect(result.resolution_source).toBe("alias_map");
      expect(result.region_alias_matched).toBe(true);
    });

    test("returns exact when all alias matches are exact", async () => {
      const supabase = createMockSupabase({
        region_aliases: [
          {
            alias: "Chablis",
            canonical_region: "Burgundy",
            canonical_sub_region: "Chablis",
            canonical_country: "France",
            alias_type: "exact",
          },
        ],
        producer_aliases: [
          {
            alias: "Domaine Test",
            canonical_producer_name: "Domaine Test",
            alias_type: "exact",
          },
        ],
      });

      const result = await resolveEntryFields(supabase, {
        region: "Chablis",
        producer: "Domaine Test",
        classification: "Premier Cru",
        wine_type: "white",
        country: "France",
      });
      expect(result.resolution_source).toBe("exact");
      expect(result.region_alias_matched).toBe(true);
      expect(result.producer_alias_matched).toBe(true);
    });
  });

  test.describe("inferWineType", () => {
    test("returns sparkling for Champagne region", () => {
      expect(inferWineType({ region: "Champagne" })).toBe("sparkling");
    });

    test("returns sparkling for Prosecco", () => {
      expect(inferWineType({ classification: "Prosecco DOC" })).toBe("sparkling");
    });

    test("returns sweet for Port", () => {
      expect(inferWineType({ classification: "Vintage Port" })).toBe("sweet");
    });

    test("returns red for Amarone", () => {
      expect(inferWineType({ classification: "Amarone della Valpolicella" })).toBe("red");
    });

    test("returns white for Chablis", () => {
      expect(inferWineType({ region: "Chablis" })).toBe("white");
    });

    test("returns null for Napa Valley", () => {
      expect(inferWineType({ region: "Napa Valley", country: "US" })).toBeNull();
    });
  });

  test.describe("createEntrySchema wine_type validation", () => {
    const baseEntry = { wine_name: "Test Wine" };

    test("accepts all valid wine types", () => {
      for (const wineType of WINE_TYPE_VALUES) {
        const result = createEntrySchema.safeParse({ ...baseEntry, wine_type: wineType });
        expect(result.success, `wine_type '${wineType}' should be valid`).toBe(true);
        if (result.success) {
          expect(result.data.wine_type).toBe(wineType);
        }
      }
    });

    test("accepts null wine_type", () => {
      const result = createEntrySchema.safeParse({ ...baseEntry, wine_type: null });
      expect(result.success).toBe(true);
    });

    test("accepts missing wine_type", () => {
      const result = createEntrySchema.safeParse(baseEntry);
      expect(result.success).toBe(true);
    });

    test("accepts empty string wine_type as null", () => {
      const result = createEntrySchema.safeParse({ ...baseEntry, wine_type: "" });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.wine_type).toBeNull();
      }
    });

    test("rejects accented rose", () => {
      const result = createEntrySchema.safeParse({ ...baseEntry, wine_type: "rosé" });
      expect(result.success).toBe(false);
    });
  });

  test.describe("updateEntrySchema wine_type validation", () => {
    test("accepts all valid wine types", () => {
      for (const wineType of WINE_TYPE_VALUES) {
        const result = updateEntrySchema.safeParse({ wine_type: wineType });
        expect(result.success, `wine_type '${wineType}' should be valid in update`).toBe(true);
      }
    });

    test("accepts null wine_type in update", () => {
      const result = updateEntrySchema.safeParse({ wine_type: null });
      expect(result.success).toBe(true);
    });

    test("rejects invalid wine_type in update", () => {
      const result = updateEntrySchema.safeParse({ wine_type: "invalid" });
      expect(result.success).toBe(false);
    });
  });

  test.describe("route integration", () => {
    test("entry create route persists canonical fields before returning", async () => {
      const persistCalls: Array<Record<string, unknown>> = [];
      const handler = createEntryPostHandler({
        requireRequestAuth: async () => ({
          supabase: {
            from(table: string) {
              if (table === "profiles") {
                return {
                  select() {
                    return {
                      eq() {
                        return {
                          maybeSingle: async () => ({
                            data: {
                              default_entry_privacy: "public",
                              default_reaction_privacy: "public",
                              default_comments_privacy: "friends_of_friends",
                            },
                            error: null,
                          }),
                        };
                      },
                    };
                  },
                };
              }

              throw new Error(`Unexpected table: ${table}`);
            },
          } as never,
          user: makeAuthenticatedUser("owner-1") as never,
          authMode: "cookie" as const,
        }),
        executeWithColumnFallback: (async () => ({
          payload: {},
          removedColumns: [],
          error: null,
          data: {
            id: "entry-1",
            user_id: "owner-1",
            wine_name: "Test Wine",
            region: "Napa",
            country: "United States",
            rating: 92,
          },
        })) as never,
        fetchPrimaryGrapesByEntryId: async () => new Map([["entry-1", []]]),
        getRandomComparisonCandidate: async () => null,
        persistEntryResolution: async ({ input }) => {
          persistCalls.push(input as unknown as Record<string, unknown>);
          return {
            resolution: {
              canonical_region: "Napa Valley",
              canonical_producer: null,
              canonical_classification: null,
              canonical_country: "USA",
              canonical_sub_region: null,
              canonical_varietal: null,
              resolution_confidence: 0.6,
              fallback_level: 4,
              region_alias_matched: true,
              producer_alias_matched: false,
              resolution_source: "alias_map" as const,
            },
            entry: {
              id: "entry-1",
              user_id: "owner-1",
              wine_name: "Test Wine",
              region: "Napa",
              canonical_region: "Napa Valley",
              resolution_confidence: 0.6,
              fallback_level: 4,
            },
          };
        },
      });

      const response = await handler(
        new Request("http://localhost/api/entries", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            wine_name: "Test Wine",
            region: "Napa",
            country: "United States",
            wine_type: "red",
            rating: 92,
            skip_comparison_candidate: true,
          }),
        })
      );

      expect(response.status).toBe(200);
      expect(persistCalls).toEqual([
        {
          region: "Napa",
          producer: null,
          classification: null,
          wine_type: "red",
          country: "United States",
          varietal: null,
        },
      ]);
      await expect(response.json()).resolves.toMatchObject({
        entry: {
          id: "entry-1",
          canonical_region: "Napa Valley",
          fallback_level: 4,
          primary_grapes: [],
        },
        comparison_candidate: null,
      });
    });

    test("entry update route reruns resolution when normalized fields change", async () => {
      const persistCalls: Array<Record<string, unknown>> = [];
      const handler = createEntryPutHandler({
        createSupabaseServerClient: async () =>
          ({
            auth: {
              getUser: async () => ({
                data: {
                  user: makeAuthenticatedUser("owner-1"),
                },
              }),
            },
            from(table: string) {
              if (table === "wine_entries") {
                return {
                  select(columns: string) {
                    if (columns === "id, user_id, rating, entry_group_id") {
                      return {
                        eq() {
                          return {
                            maybeSingle: async () => ({
                              data: {
                                id: "entry-1",
                                user_id: "owner-1",
                                rating: 92,
                                entry_group_id: null,
                              },
                              error: null,
                            }),
                          };
                        },
                      };
                    }

                    if (columns === "*") {
                      return {
                        eq() {
                          return {
                            eq() {
                              return {
                                single: async () => ({
                                  data: {
                                    id: "entry-1",
                                    user_id: "owner-1",
                                    rating: 92,
                                    region: "Napa",
                                    producer: null,
                                    classification: null,
                                    wine_type: "red",
                                    country: "United States",
                                    entry_group_id: null,
                                  },
                                  error: null,
                                }),
                              };
                            },
                          };
                        },
                      };
                    }

                    throw new Error(`Unexpected select columns: ${columns}`);
                  },
                };
              }

              throw new Error(`Unexpected table: ${table}`);
            },
          }) as never,
        executeWithColumnFallback: (async () => ({
          payload: {},
          removedColumns: [],
          error: null,
          data: {
            id: "entry-1",
            user_id: "owner-1",
            rating: 92,
            region: "Napa",
            producer: null,
            classification: null,
            wine_type: "red",
            country: "United States",
            entry_group_id: null,
          },
        })) as never,
        fetchPrimaryGrapesByEntryId: async () =>
          new Map([
            [
              "entry-1",
              [{ id: "grape-1", name: "Cabernet Sauvignon", position: 1 }],
            ],
          ]),
        persistEntryResolution: async ({ input }) => {
          persistCalls.push(input as unknown as Record<string, unknown>);
          return {
            resolution: {
              canonical_region: "Napa Valley",
              canonical_producer: null,
              canonical_classification: null,
              canonical_country: "USA",
              canonical_sub_region: null,
              canonical_varietal: "Cabernet Sauvignon",
              resolution_confidence: 0.75,
              fallback_level: 3,
              region_alias_matched: true,
              producer_alias_matched: false,
              resolution_source: "alias_map" as const,
            },
            entry: {
              id: "entry-1",
              user_id: "owner-1",
              rating: 92,
              region: "Napa",
              canonical_region: "Napa Valley",
              fallback_level: 3,
              entry_group_id: null,
            },
          };
        },
      });

      const response = await handler(
        new Request("http://localhost/api/entries/entry-1", {
          method: "PUT",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            region: "Napa",
          }),
        }),
        {
          params: Promise.resolve({ id: "entry-1" }),
        }
      );

      expect(response.status).toBe(200);
      expect(persistCalls).toEqual([
        {
          region: "Napa",
          producer: null,
          classification: null,
          wine_type: "red",
          country: "United States",
          varietal: "Cabernet Sauvignon",
        },
      ]);
      await expect(response.json()).resolves.toMatchObject({
        entry: {
          id: "entry-1",
          canonical_region: "Napa Valley",
          fallback_level: 3,
          primary_grapes: [
            {
              name: "Cabernet Sauvignon",
            },
          ],
        },
      });
    });
  });
});

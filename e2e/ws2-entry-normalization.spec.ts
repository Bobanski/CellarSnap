import { test, expect } from "@playwright/test";
import { resolveEntryFields, inferWineType, isValidWineType } from "../src/server/algorithm/resolver";
import { createEntrySchema, updateEntrySchema } from "../src/server/entries/schema";
import { WINE_TYPE_VALUES } from "../src/types/wine";

test.describe("WS2: Entry Normalization", () => {
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
    test("level 4 (region × wine_type): confidence 0.6", () => {
      const result = resolveEntryFields({
        region: "Napa Valley",
        producer: null,
        classification: null,
        wine_type: "red",
        country: "United States",
      });
      expect(result.fallback_level).toBe(4);
      expect(result.resolution_confidence).toBe(0.6);
    });

    test("level 4 takes priority over level 5 when region is present", () => {
      const result = resolveEntryFields({
        region: "Burgundy",
        producer: "Leroy",
        classification: "Grand Cru",
        wine_type: "red",
        country: "France",
      });
      expect(result.fallback_level).toBe(4);
      expect(result.resolution_confidence).toBe(0.6);
    });

    test("level 5 (country × wine_type, no region): confidence 0.5", () => {
      const result = resolveEntryFields({
        region: null,
        producer: null,
        classification: null,
        wine_type: "white",
        country: "France",
      });
      expect(result.fallback_level).toBe(5);
      expect(result.resolution_confidence).toBe(0.5);
    });

    test("level 6 (wine_type only, no region or country): confidence 0", () => {
      const result = resolveEntryFields({
        region: null,
        producer: null,
        classification: null,
        wine_type: "red",
        country: null,
      });
      expect(result.fallback_level).toBe(6);
      expect(result.resolution_confidence).toBe(0);
    });

    test("level 6 (no wine_type): confidence 0 — cannot score without wine_type", () => {
      const result = resolveEntryFields({
        region: "Burgundy",
        producer: "Leroy",
        classification: null,
        wine_type: null,
        country: "France",
      });
      expect(result.fallback_level).toBe(6);
      expect(result.resolution_confidence).toBe(0);
    });

    test("level 6 (all null): confidence 0", () => {
      const result = resolveEntryFields({
        region: null,
        producer: null,
        classification: null,
        wine_type: null,
        country: null,
      });
      expect(result.fallback_level).toBe(6);
      expect(result.resolution_confidence).toBe(0);
    });
  });

  test.describe("resolveEntryFields — stub pass-through", () => {
    test("returns raw values as canonical values", () => {
      const result = resolveEntryFields({
        region: "Burgundy",
        producer: "Domaine de la Romanée-Conti",
        classification: "Grand Cru",
        wine_type: "red",
        country: "France",
      });
      expect(result.canonical_region).toBe("Burgundy");
      expect(result.canonical_producer).toBe("Domaine de la Romanée-Conti");
      expect(result.canonical_classification).toBe("Grand Cru");
    });

    test("resolution_source is 'stub'", () => {
      const result = resolveEntryFields({
        region: "Napa Valley",
        producer: null,
        classification: null,
        wine_type: "red",
        country: "United States",
      });
      expect(result.resolution_source).toBe("stub");
    });

    test("no alias matches in stub", () => {
      const result = resolveEntryFields({
        region: "Bordeaux",
        producer: "Château Margaux",
        classification: "Premier Grand Cru Classé",
        wine_type: "red",
        country: "France",
      });
      expect(result.region_alias_matched).toBe(false);
      expect(result.producer_alias_matched).toBe(false);
    });

    test("returns null canonical values when region/producer/classification are null", () => {
      const result = resolveEntryFields({
        region: null,
        producer: null,
        classification: null,
        wine_type: "white",
        country: "France",
      });
      expect(result.canonical_region).toBeNull();
      expect(result.canonical_producer).toBeNull();
      expect(result.canonical_classification).toBeNull();
    });

    test("handles all-null inputs without throwing", () => {
      expect(() =>
        resolveEntryFields({
          region: null,
          producer: null,
          classification: null,
          wine_type: null,
          country: null,
        })
      ).not.toThrow();
    });
  });

  test.describe("inferWineType", () => {
    test("returns sparkling for Champagne region", () => {
      expect(inferWineType({ region: "Champagne" })).toBe("sparkling");
    });

    test("returns sparkling for Champagne in classification", () => {
      expect(inferWineType({ classification: "Champagne AOC" })).toBe("sparkling");
    });

    test("returns sparkling for lowercase champagne", () => {
      expect(inferWineType({ region: "champagne", country: "France" })).toBe("sparkling");
    });

    test("returns sweet for Sauternes", () => {
      expect(inferWineType({ classification: "Sauternes" })).toBe("sweet");
    });

    test("returns sweet for Tokaji", () => {
      expect(inferWineType({ classification: "Tokaji Aszu" })).toBe("sweet");
    });

    test("returns null for Napa Valley", () => {
      expect(inferWineType({ region: "Napa Valley", country: "US" })).toBeNull();
    });

    test("returns null for Burgundy without extra context", () => {
      expect(inferWineType({ region: "Burgundy", country: "France" })).toBeNull();
    });

    test("returns null for empty fields", () => {
      expect(inferWineType({})).toBeNull();
    });

    test("returns null for all-null fields", () => {
      expect(inferWineType({ country: null, region: null, classification: null })).toBeNull();
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

    test("rejects unknown wine_type value", () => {
      const result = createEntrySchema.safeParse({ ...baseEntry, wine_type: "dessert" });
      expect(result.success).toBe(false);
    });

    test("rejects capitalized wine_type", () => {
      const result = createEntrySchema.safeParse({ ...baseEntry, wine_type: "Red" });
      expect(result.success).toBe(false);
    });
  });

  test.describe("updateEntrySchema wine_type validation", () => {
    test("accepts all valid wine types in update", () => {
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
});

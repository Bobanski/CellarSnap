import { expect, test } from "@playwright/test";
import {
  buildListScanRationale,
  createDefaultListScanFilters,
  deriveListScanRegionGroups,
  filterListScanWines,
  getListScanStructuredMeta,
  resolveListScanWineType,
  sanitizeListScanFilters,
  type ListScanParsedWine,
  type ListScanRegionGroup,
  type ListScanResult,
} from "@shared";
import { createListScanParseHandler } from "../src/app/api/list-scan/parse/handler";
import { userHasPrivateBetaFeatureAccess } from "../src/lib/access/privateBetaFeatures";
import { RequestAuthError } from "../src/server/auth/requestAuth";
import {
  __listScanTestUtils,
} from "../src/server/listScan/parse";
import type { ListScanInferenceMap } from "../src/server/listScan/inference";

const baseResult: ListScanResult = {
  scan_id: "scan-123",
  source_type: "url" as const,
  source_label: "https://example.com/list",
  venue_name: "Example Wine Bar",
  list_title: "Dinner List",
  overall_confidence: 88,
  warnings: [] as string[],
  score_summary: {
    mode: "stub" as const,
    based_on_entry_count: 0,
    warning: "Sign in to save scans and unlock personalized match scores.",
  },
  facets: {
    wine_types: ["red"],
    varietals: ["Cabernet Sauvignon"],
    regions: ["Bordeaux"],
    min_price: 18,
    max_price: 42,
  },
  wines: [
    {
      id: "wine-1",
      source_order: 0,
      menu_label: "Cabernet Sauvignon",
      producer: "Example Producer",
      wine_name: null,
      vintage: "2019",
      wine_type: "red" as const,
      price_display: "$18",
      price_value: 18,
      varietals: ["Cabernet Sauvignon"],
      regions: ["Bordeaux"],
      match_percent: 77,
      parse_confidence: 84,
      rationale: "Highlights Cabernet Sauvignon.",
    },
  ],
  scanned_at: "2026-03-15T12:00:00.000Z",
};

function buildParsedWine(
  overrides: Partial<ListScanParsedWine> &
    Pick<ListScanParsedWine, "id" | "source_order" | "menu_label">
): ListScanParsedWine {
  return {
    producer: null,
    wine_name: null,
    vintage: null,
    wine_type: "unknown",
    price_display: null,
    price_value: null,
    varietals: [],
    regions: [],
    canonical_country: null,
    match_percent: 0,
    parse_confidence: 0,
    rationale: "",
    ...overrides,
  };
}

test.describe("WS3 list scan parse handler", () => {
  test("authenticated scans are persisted after parsing", async () => {
    let savedUserId: string | null = null;
    let parsedUserId: string | null | undefined;

    const handler = createListScanParseHandler({
      requireRequestAuth: async () =>
        ({
          supabase: { from: () => ({}) } as never,
          user: { id: "user-1", email: "eitansneider1@gmail.com" } as never,
          authMode: "bearer",
        }) as never,
      parseWineListSource: async (params) => {
        parsedUserId = params.userId;
        return baseResult;
      },
      saveListScanResult: async (_supabase, userId) => {
        savedUserId = userId;
      },
    });

    const formData = new FormData();
    formData.append("url", "https://example.com/list");

    const response = await handler(
      new Request("http://localhost/api/list-scan/parse", {
        method: "POST",
        body: formData,
      })
    );

    expect(response.status).toBe(200);
    expect(parsedUserId).toBe("user-1");
    expect(savedUserId).toBe("user-1");
  });

  test("guest scans still parse without persistence", async () => {
    let saveCalled = false;
    let requesterId = "";
    let parsedUserId: string | null | undefined = "unexpected";

    const handler = createListScanParseHandler({
      requireRequestAuth: async () => {
        throw new RequestAuthError("Unauthorized");
      },
      parseWineListSource: async (params) => {
        requesterId = params.requesterId;
        parsedUserId = params.userId;
        return baseResult;
      },
      saveListScanResult: async () => {
        saveCalled = true;
      },
    });

    const formData = new FormData();
    formData.append("url", "https://example.com/list");

    const response = await handler(
      new Request("http://localhost/api/list-scan/parse", {
        method: "POST",
        headers: {
          "x-forwarded-for": "203.0.113.7",
        },
        body: formData,
      })
    );

    expect(response.status).toBe(200);
    expect(parsedUserId).toBeUndefined();
    expect(requesterId).toBe("guest:203.0.113.7");
    expect(saveCalled).toBeFalsy();
  });

  test("inference preserves extracted varietals when appending inferred grapes", () => {
    const inferenceMap: ListScanInferenceMap = {
      appellationToGrapes: new Map([
        [
          "graves",
          {
            grapes: ["Sauvignon Blanc", "Semillon"],
            wineType: "white",
            canonicalCountry: "France",
            canonicalRegion: "Bordeaux",
            canonicalSubRegion: "Graves",
          },
        ],
      ]),
      grapeToWineType: new Map([
        ["sauvignon blanc", "white"],
        ["semillon", "white"],
      ]),
      regionAliases: new Map(),
    };

    const enriched = __listScanTestUtils.applyInferenceToWine(
      {
        ...baseResult.wines[0],
        wine_type: "unknown",
        varietals: ["Sauvignon Blanc"],
        regions: ["Graves"],
      },
      inferenceMap
    );

    expect(enriched.varietals).toEqual(["Sauvignon Blanc", "Semillon"]);
    expect(enriched.regions).toEqual(["Graves", "France", "Bordeaux"]);
    expect(enriched.wine_type).toBe("white");
  });

  test("inference normalizes United States country labels to USA", () => {
    const inferenceMap: ListScanInferenceMap = {
      appellationToGrapes: new Map([
        [
          "napa valley",
          {
            grapes: ["Cabernet Sauvignon"],
            wineType: "red",
            canonicalCountry: "United States",
            canonicalRegion: "Napa Valley",
            canonicalSubRegion: null,
          },
        ],
      ]),
      grapeToWineType: new Map([["cabernet sauvignon", "red"]]),
      regionAliases: new Map(),
    };

    const enriched = __listScanTestUtils.applyInferenceToWine(
      {
        ...baseResult.wines[0],
        wine_type: "unknown",
        varietals: [],
        regions: ["Napa Valley"],
      },
      inferenceMap
    );

    expect(enriched.canonical_country).toBe("USA");
    expect(enriched.regions).toEqual(["Napa Valley", "USA"]);
  });

  test("test accounts automatically receive private beta access", async () => {
    const hasAccess = await userHasPrivateBetaFeatureAccess(
      {
        from() {
          return {
            select() {
              return {
                eq() {
                  return {
                    maybeSingle: async () => ({
                      data: { is_test_account: true },
                      error: null,
                    }),
                  };
                },
              };
            },
          };
        },
      },
      {
        id: "user-2",
        email: "someone@example.com",
      } as never
    );

    expect(hasAccess).toBeTruthy();
  });

  test("truncated structured output is marked as recovered", () => {
    const extracted = __listScanTestUtils.extractJson(
      [
        "{",
        '"warnings":[],"wines":[',
        '{"menu_label":"Wine A","producer":null,"wine_name":null,"vintage":null,"wine_type":"red","price_display":"$10","price_value":10,"varietals":[],"regions":[],"confidence":0.9},',
        '{"menu_label":"Wine B"',
      ].join("")
    );

    expect(extracted.recovered).toBeTruthy();
    expect(Array.isArray(extracted.value.wines)).toBeTruthy();
    expect(extracted.value.wines).toHaveLength(1);
    expect(extracted.value.wines[0]?.menu_label).toBe("Wine A");
  });

  test("cleanup merges split producer/detail rows and strips section headers", () => {
    const cleaned = __listScanTestUtils.cleanupNormalizedParsedWines([
      buildParsedWine({
        id: "wine-1",
        source_order: 0,
        menu_label: "Paltrinieri — Rosé",
        producer: "Paltrinieri",
        wine_type: "rose",
        wine_name: "Rosé",
        regions: ["Rosé"],
        price_display: "ROSÉ 75",
        price_value: 75,
        parse_confidence: 88,
      }),
      buildParsedWine({
        id: "wine-2",
        source_order: 1,
        menu_label: "Lambrusco di Sorbara, Pirla, Emilia-Romagna, Italy '23",
        wine_name: "Lambrusco di Sorbara, Pirla, Emilia-Romagna, Italy '23",
        vintage: "2023",
        wine_type: "sparkling",
        price_display: "$82",
        price_value: 82,
        varietals: ["Lambrusco", "Sangiovese"],
        regions: ["Pirla", "Emilia-Romagna", "Italy"],
        canonical_country: "Italy",
        parse_confidence: 92,
      }),
      buildParsedWine({
        id: "section-1",
        source_order: 2,
        menu_label: "SPARKLING",
        wine_type: "sparkling",
        parse_confidence: 90,
      }),
      buildParsedWine({
        id: "section-2",
        source_order: 3,
        menu_label: "France: Burgundy",
        regions: ["France"],
        wine_type: "red",
        parse_confidence: 90,
      }),
      buildParsedWine({
        id: "wine-3",
        source_order: 4,
        menu_label: "226672 Château Haut-Brion, Pessac-Léognan 2021",
        vintage: "2021",
        wine_type: "white",
        price_display: "$900",
        price_value: 900,
        regions: ["Pessac-Léognan"],
        canonical_country: "France",
        parse_confidence: 86,
      }),
      buildParsedWine({
        id: "wine-4",
        source_order: 5,
        menu_label: "NVVeuve Clicquot, Brut Réserve Cuvée, Reims",
        wine_type: "sparkling",
        price_display: "$82",
        price_value: 82,
        parse_confidence: 93,
      }),
    ]);

    expect(cleaned).toHaveLength(3);
    expect(cleaned[0]?.producer).toBe("Paltrinieri");
    expect(cleaned[0]?.menu_label).toBe(
      "Paltrinieri — Lambrusco di Sorbara, Pirla, Emilia-Romagna, Italy '23"
    );
    expect(cleaned[0]?.price_value).toBe(75);
    expect(cleaned[0]?.regions).toEqual(["Pirla", "Emilia-Romagna", "Italy"]);
    expect(cleaned[0]?.wine_name).toContain("Lambrusco");
    expect(cleaned[1]?.menu_label).toBe("Château Haut-Brion, Pessac-Léognan 2021");
    expect(cleaned[2]?.menu_label).toBe(
      "NV Veuve Clicquot, Brut Réserve Cuvée, Reims"
    );
  });

  test("structured meta prefers broad clean regions in Gjelina recommendations", () => {
    const friuliWine = buildParsedWine({
      id: "wine-friuli",
      source_order: 10,
      menu_label:
        "Malvasia, Carso-Kras, Friuli, Venezia Giulia, Italy '21 — Terpin — Skin Contact",
      producer: "Malvasia, Carso-Kras, Friuli, Venezia Giulia, Italy '21",
      wine_name: "Skin Contact",
      wine_type: "orange",
      price_display: "$96",
      price_value: 96,
      varietals: ["Vitovska"],
      regions: ["Carso-Kras", "Friuli", "Venezia Giulia", "Slovenia", "Primorska", "Kras"],
    });

    const bordeauxWine = buildParsedWine({
      id: "wine-bordeaux",
      source_order: 11,
      menu_label: "Chateau De Vieille Chapelle — Merlot/Cab Franc, Tradition (Bordeaux, France '21",
      producer: "Chateau De Vieille Chapelle",
      wine_name: "Merlot/Cab Franc, Tradition (bordeaux, France '21)",
      wine_type: "red",
      price_display: "$18/$80",
      price_value: 18,
      varietals: ["Merlot", "Cabernet Franc", "Cabernet Sauvignon"],
      regions: ["Tradition (bordeaux", "France '21)", "France", "Bordeaux", "Left Bank"],
      canonical_country: "France",
    });

    expect(getListScanStructuredMeta(friuliWine).displayRegion).toBe(
      "Friuli-Venezia Giulia"
    );
    expect(getListScanStructuredMeta(bordeauxWine).displayRegion).toBe("Bordeaux");
    expect(
      buildListScanRationale({
        wine_type: friuliWine.wine_type,
        varietals: friuliWine.varietals,
        regions: friuliWine.regions,
        price_display: friuliWine.price_display,
      })
    ).toContain("Friuli-Venezia Giulia");
    expect(
      buildListScanRationale({
        wine_type: bordeauxWine.wine_type,
        varietals: bordeauxWine.varietals,
        regions: bordeauxWine.regions,
        price_display: bordeauxWine.price_display,
      })
    ).toContain("Bordeaux");
  });

  test("shared wine-type resolution keeps rose and orange distinct", () => {
    expect(
      resolveListScanWineType({
        wine_type: "unknown",
        menu_label: "Skin Contact Ribolla Gialla",
        wine_name: null,
        producer: null,
        regions: [],
        varietals: [],
      })
    ).toBe("orange");

    expect(
      resolveListScanWineType({
        wine_type: "unknown",
        menu_label: "Cotes de Provence Rose",
        wine_name: null,
        producer: null,
        regions: [],
        varietals: [],
      })
    ).toBe("rose");
  });

  test("filter sanitization keeps only visible options and one active country", () => {
    const regionGroups: ListScanRegionGroup[] = [
      { country: "France", subRegions: ["Bordeaux", "Loire"] },
      { country: "Italy", subRegions: ["Tuscany", "Piedmont"] },
    ];

    const sanitized = sanitizeListScanFilters(
      {
        ...createDefaultListScanFilters(),
        included_wine_types: ["red", "white", "sparkling"],
        selected_varietals: ["Cabernet Sauvignon", "Nebbiolo"],
        selected_regions: ["France", "Bordeaux", "Italy", "Tuscany"],
      },
      {
        wine_types: ["red"],
        varietals: ["Cabernet Sauvignon"],
        regions: ["France", "Bordeaux"],
        min_price: null,
        max_price: null,
      },
      regionGroups
    );

    expect(sanitized.included_wine_types).toEqual(["red"]);
    expect(sanitized.selected_varietals).toEqual(["Cabernet Sauvignon"]);
    expect(sanitized.selected_regions).toEqual(["France", "Bordeaux"]);
  });

  test("region groups keep U.S. regions under USA", () => {
    const regionGroups = deriveListScanRegionGroups([
      {
        ...baseResult.wines[0],
        id: "wine-us",
        regions: ["Napa Valley", "USA"],
      },
      {
        ...baseResult.wines[0],
        id: "wine-fr",
        regions: ["France", "Bordeaux"],
      },
    ]);

    expect(regionGroups).toEqual([
      { country: "France", subRegions: ["Bordeaux"] },
      { country: "USA", subRegions: ["Napa Valley"] },
    ]);
  });

  test("url text extraction keeps wine sections and skips food and beer noise", () => {
    const extracted = __listScanTestUtils.extractWineListTextFromHtml(
      [
        "<html><head><title>Dinner Menu</title></head><body>",
        "<h2>Food</h2>",
        "<p>Burger</p>",
        "<h2>Beer</h2>",
        "<p>Lager 8</p>",
        "<h2>Wines</h2>",
        "<p>Schramsberg Blanc de Blancs, North Coast 16</p>",
        "<p>Revolver Cabernet Franc, Napa Valley 16</p>",
        "<footer>Hours</footer>",
        "</body></html>",
      ].join(""),
      ""
    );

    expect(extracted.title).toBe("Dinner Menu");
    expect(extracted.text).toContain("Schramsberg Blanc de Blancs");
    expect(extracted.text).toContain("Revolver Cabernet Franc");
    expect(extracted.text).not.toContain("Burger");
    expect(extracted.text).not.toContain("Lager");
  });

  test("region filters only match selected subregions when a country is active", () => {
    const wines = [
      {
        ...baseResult.wines[0],
        id: "wine-napa",
        regions: ["USA", "Napa Valley"],
      },
      {
        ...baseResult.wines[0],
        id: "wine-northern-ca",
        regions: ["USA", "Northern California"],
      },
      {
        ...baseResult.wines[0],
        id: "wine-central-coast",
        regions: ["USA", "Central Coast"],
      },
    ];

    const filters = {
      ...createDefaultListScanFilters(),
      selected_regions: ["USA", "Napa Valley"],
    };

    expect(filterListScanWines(wines, filters).map((wine) => wine.id)).toEqual([
      "wine-napa",
    ]);
  });

  test("parser normalization accepts rose aliases and section signals", () => {
    expect(__listScanTestUtils.normalizeWineType("rosé")).toBe("rose");
    expect(__listScanTestUtils.normalizeWineType("orange")).toBe("orange");
    expect(__listScanTestUtils.normalizeWineType("dessert")).toBe("dessert_fortified");

    expect(__listScanTestUtils.detectWineTypeFromSignals("## Orange / Skin Contact", "unknown")).toBe(
      "orange"
    );
    expect(__listScanTestUtils.detectWineTypeFromSignals("## Rose", "unknown")).toBe("rose");
  });
});

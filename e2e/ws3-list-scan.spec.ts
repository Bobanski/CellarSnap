import { expect, test } from "@playwright/test";
import { resolveListScanWineType, type ListScanResult } from "@shared";
import { createListScanParseHandler } from "../src/app/api/list-scan/parse/handler";
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

test.describe("WS3 list scan parse handler", () => {
  test("authenticated scans are persisted after parsing", async () => {
    let savedUserId: string | null = null;
    let parsedUserId: string | null | undefined;

    const handler = createListScanParseHandler({
      requireRequestAuth: async () =>
        ({
          supabase: { from: () => ({}) } as never,
          user: { id: "user-1" } as never,
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
    expect(enriched.wine_type).toBe("white");
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

import { expect, test } from "@playwright/test";
import {
  buildResolvedPhotoTypeMap,
  hasLineupWineDetails,
  mapContextTagToPhotoType,
  resolvePostSaveSurveyTransition,
  resolveSourcePhotoRole,
  shouldForceLineupForSinglePhoto,
  type SourcePhotoTypeAnalysis,
} from "../packages/shared/src/entry-flow";

test.describe("Phase 5 parity fixtures (shared web/mobile flow logic)", () => {
  test("single label fixture keeps label classification even with place context", () => {
    const photos = [{ id: "photo-1" }];
    const sourceAnalysisByIndex = new Map<number, SourcePhotoTypeAnalysis>([
      [
        0,
        {
          role: "individual",
          detectedBottleCount: 1,
          identifiedBottleCount: 1,
          contextTag: "place",
          contextConfidence: 0.95,
        },
      ],
    ]);

    const resolved = buildResolvedPhotoTypeMap({
      photos,
      sourceAnalysisByIndex,
      resolveManualPhotoType: () => undefined,
    });

    expect(resolved.get(0)).toBe("label");
  });

  test("lineup fixture resolves lineup and non-bottle intents consistently", () => {
    const photos = [{ id: "photo-a" }, { id: "photo-b" }, { id: "photo-c" }];
    const sourceAnalysisByIndex = new Map<number, SourcePhotoTypeAnalysis>([
      [
        0,
        {
          role: "lineup",
          detectedBottleCount: 3,
          identifiedBottleCount: 2,
          contextTag: "other_bottles",
          contextConfidence: 0.91,
        },
      ],
      [
        1,
        {
          role: "unknown",
          detectedBottleCount: 0,
          identifiedBottleCount: 0,
          contextTag: "pairing",
          contextConfidence: 0.88,
        },
      ],
      [
        2,
        {
          role: "unknown",
          detectedBottleCount: 0,
          identifiedBottleCount: 0,
          contextTag: "people",
          contextConfidence: 0.84,
        },
      ],
    ]);

    const resolved = buildResolvedPhotoTypeMap({
      photos,
      sourceAnalysisByIndex,
      resolveManualPhotoType: () => undefined,
    });

    expect(resolved.get(0)).toBe("lineup");
    expect(resolved.get(1)).toBe("pairing");
    expect(resolved.get(2)).toBe("people");
  });

  test("single-photo geometry guardrail matches expected lineup fallback behavior", () => {
    expect(
      shouldForceLineupForSinglePhoto({
        width: 0.34,
        height: 0.66,
      })
    ).toBeTruthy();
    expect(
      shouldForceLineupForSinglePhoto({
        width: 0.52,
        height: 0.39,
      })
    ).toBeFalsy();
  });

  test("post-save survey flow transitions with and without comparison candidate", () => {
    expect(resolvePostSaveSurveyTransition(true)).toEqual({
      nextStep: "comparison",
      shouldComplete: false,
    });
    expect(resolvePostSaveSurveyTransition(false)).toEqual({
      nextStep: null,
      shouldComplete: true,
    });
  });

  test("context and lineup helpers preserve shared decision contract", () => {
    expect(
      mapContextTagToPhotoType("other_bottles", {
        confidence: 0.2,
        detectedBottleCount: 0,
        identifiedBottleCount: 0,
      })
    ).toBe("place");
    expect(
      mapContextTagToPhotoType("other_bottles", {
        confidence: 0.2,
        detectedBottleCount: 1,
        identifiedBottleCount: 0,
      })
    ).toBe("other_bottles");
    expect(
      resolveSourcePhotoRole({
        detectedBottleCount: 2,
        identifiedBottleCount: 0,
      })
    ).toBe("lineup");
    expect(
      hasLineupWineDetails({
        wine_name: null,
        producer: "Producer",
        vintage: null,
        country: null,
        region: null,
        appellation: null,
        classification: null,
      })
    ).toBeTruthy();
  });
});

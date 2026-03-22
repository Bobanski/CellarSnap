import { expect, test } from "@playwright/test";
import { extractFromNotes } from "./notesNlp";

test.describe("extractFromNotes", () => {
  test("returns null for empty or too-short notes", () => {
    expect(extractFromNotes(null)).toBeNull();
    expect(extractFromNotes(undefined)).toBeNull();
    expect(extractFromNotes("")).toBeNull();
    expect(extractFromNotes("ok")).toBeNull();
    expect(extractFromNotes("  ")).toBeNull();
  });

  test("extracts body and oak hints from a structured tasting note", () => {
    const result = extractFromNotes("Full bodied with rich dark fruit and soft tannins.");

    expect(result).not.toBeNull();
    expect(result?.sensoryHints.body?.value).toBeGreaterThan(4.5);
    expect(result?.sensoryHints.body?.confidence).toBeGreaterThan(0.8);
    expect(result?.sensoryHints.tannin?.value).toBeLessThan(3);
    expect(result?.sensoryHints.fruit_ripeness?.value).toBeGreaterThan(4);
    expect(result?.descriptorClusters.primary).toContain("dark_fruit");
    expect(result?.tokenCount).toBeGreaterThan(2);
  });

  test("extracts acidity and freshness from bright notes", () => {
    const result = extractFromNotes(
      "Very crisp and bright with high acid, a zippy finish, citrus zest, and tea leaf notes."
    );

    expect(result).not.toBeNull();
    expect(result?.sensoryHints.acidity?.value).toBeGreaterThan(4);
    expect(result?.sensoryHints.freshness?.value).toBeGreaterThan(4);
    expect(result?.descriptorClusters.primary).toContain("citrus");
  });

  test("extracts low tannin language from silky and elegant descriptors", () => {
    const result = extractFromNotes("Silky smooth tannins, very elegant and refined.");

    expect(result).not.toBeNull();
    expect(result?.sensoryHints.tannin?.value).toBeLessThan(3);
    expect(result?.sensoryHints.complexity?.value).toBeGreaterThan(3);
    expect(result?.sentiment).toBeGreaterThan(0);
  });

  test("detects aroma clusters from multiple families", () => {
    const result = extractFromNotes("Dark cherry, blackberry, vanilla, and cedar with a touch of smoke.");

    expect(result).not.toBeNull();
    expect(result?.descriptorClusters.primary).toContain("dark_fruit");
    expect(result?.descriptorClusters.primary).toContain("oak_vanilla");
    expect(result?.descriptorClusters.primary.length).toBeGreaterThanOrEqual(2);
  });

  test("detects positive sentiment cues", () => {
    const result = extractFromNotes("Amazing wine, absolutely loved it. Fantastic complexity.");

    expect(result).not.toBeNull();
    expect(result?.sentiment).toBeGreaterThan(0.5);
  });

  test("detects negative sentiment cues", () => {
    const result = extractFromNotes("Disappointing and bland. Wouldnt buy again.");

    expect(result).not.toBeNull();
    expect(result?.sentiment).toBeLessThan(-0.3);
  });

  test("keeps multi-word phrases ahead of their shorter fragments", () => {
    const result = extractFromNotes("Soft tannins and long finish with forest floor notes.");

    expect(result).not.toBeNull();
    expect(result?.sensoryHints.tannin?.value).toBeLessThan(3);
    expect(result?.sensoryHints.finish_length?.value).toBeGreaterThan(4);
    expect(result?.sensoryHints.earthy?.value).toBeGreaterThan(4);
  });

  test("marks energetic, mineral, and savory language together", () => {
    const result = extractFromNotes("Bright, energetic, flinty, and saline with graphite and tea leaf notes.");

    expect(result).not.toBeNull();
    expect(result?.sensoryHints.freshness?.value).toBeGreaterThan(3.5);
    expect(result?.descriptorClusters.primary).toContain("mineral");
    expect(result?.descriptorClusters.primary).toContain("herbal");
    expect(result?.tokenCount).toBeGreaterThan(3);
  });
});

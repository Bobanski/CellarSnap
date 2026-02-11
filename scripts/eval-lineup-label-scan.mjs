#!/usr/bin/env node

import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import OpenAI from "openai";

const FIELD_KEYS = [
  "wine_name",
  "producer",
  "vintage",
  "country",
  "region",
  "appellation",
  "classification",
];

const PASS1_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    total_bottles_detected: { type: "number" },
    wines: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          wine_name: { type: ["string", "null"] },
          producer: { type: ["string", "null"] },
          vintage: { type: ["string", "null"] },
          country: { type: ["string", "null"] },
          region: { type: ["string", "null"] },
          appellation: { type: ["string", "null"] },
          classification: { type: ["string", "null"] },
          primary_grape_suggestions: {
            type: "array",
            items: { type: "string" },
          },
          confidence: { type: ["number", "null"] },
          bottle_bbox: {
            type: ["object", "null"],
            additionalProperties: false,
            properties: {
              x: { type: "number" },
              y: { type: "number" },
              width: { type: "number" },
              height: { type: "number" },
            },
            required: ["x", "y", "width", "height"],
          },
          label_bbox: {
            type: ["object", "null"],
            additionalProperties: false,
            properties: {
              x: { type: "number" },
              y: { type: "number" },
              width: { type: "number" },
              height: { type: "number" },
            },
            required: ["x", "y", "width", "height"],
          },
          label_anchor: {
            type: ["object", "null"],
            additionalProperties: false,
            properties: {
              x: { type: "number" },
              y: { type: "number" },
            },
            required: ["x", "y"],
          },
        },
        required: [
          "wine_name",
          "producer",
          "vintage",
          "country",
          "region",
          "appellation",
          "classification",
          "primary_grape_suggestions",
          "confidence",
          "bottle_bbox",
          "label_bbox",
          "label_anchor",
        ],
      },
    },
  },
  required: ["total_bottles_detected", "wines"],
};

const PASS2_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    labels: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          index: { type: "number" },
          label_bbox: {
            type: ["object", "null"],
            additionalProperties: false,
            properties: {
              x: { type: "number" },
              y: { type: "number" },
              width: { type: "number" },
              height: { type: "number" },
            },
            required: ["x", "y", "width", "height"],
          },
          label_anchor: {
            type: ["object", "null"],
            additionalProperties: false,
            properties: {
              x: { type: "number" },
              y: { type: "number" },
            },
            required: ["x", "y"],
          },
        },
        required: ["index", "label_bbox", "label_anchor"],
      },
    },
  },
  required: ["labels"],
};

function argValue(name, fallback = null) {
  const idx = process.argv.indexOf(name);
  if (idx === -1) return fallback;
  const next = process.argv[idx + 1];
  if (!next || next.startsWith("--")) return fallback;
  return next;
}

function extractJson(text) {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) {
    throw new Error("Invalid JSON response");
  }
  return JSON.parse(text.slice(start, end + 1));
}

function normalizeText(value) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function normalizeBox(value, minWidth, minHeight) {
  if (!value || typeof value !== "object") return null;
  const x = Number(value.x);
  const y = Number(value.y);
  const width = Number(value.width);
  const height = Number(value.height);
  if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(width) || !Number.isFinite(height)) {
    return null;
  }

  const clampedX = Math.min(1, Math.max(0, x));
  const clampedY = Math.min(1, Math.max(0, y));
  const clampedWidth = Math.min(1, Math.max(0, width));
  const clampedHeight = Math.min(1, Math.max(0, height));

  const right = Math.min(1, clampedX + clampedWidth);
  const bottom = Math.min(1, clampedY + clampedHeight);
  const finalWidth = right - clampedX;
  const finalHeight = bottom - clampedY;

  if (finalWidth < minWidth || finalHeight < minHeight) {
    return null;
  }

  return { x: clampedX, y: clampedY, width: finalWidth, height: finalHeight };
}

function normalizeAnchor(value) {
  if (!value || typeof value !== "object") return null;
  const x = Number(value.x);
  const y = Number(value.y);
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
  return {
    x: Math.min(1, Math.max(0, x)),
    y: Math.min(1, Math.max(0, y)),
  };
}

function normalizeToken(value) {
  return String(value ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function looseMatch(expectedValue, predictedValue) {
  const expected = normalizeToken(expectedValue);
  const predicted = normalizeToken(predictedValue);
  if (!expected || !predicted) return false;
  return expected === predicted || expected.includes(predicted) || predicted.includes(expected);
}

function computeIoU(a, b) {
  if (!a || !b) return 0;
  const aRight = a.x + a.width;
  const aBottom = a.y + a.height;
  const bRight = b.x + b.width;
  const bBottom = b.y + b.height;

  const ix1 = Math.max(a.x, b.x);
  const iy1 = Math.max(a.y, b.y);
  const ix2 = Math.min(aRight, bRight);
  const iy2 = Math.min(aBottom, bBottom);

  const iWidth = Math.max(0, ix2 - ix1);
  const iHeight = Math.max(0, iy2 - iy1);
  const intersection = iWidth * iHeight;
  const union = a.width * a.height + b.width * b.height - intersection;
  if (union <= 0) return 0;
  return intersection / union;
}

async function toDataUrl(imagePath) {
  const bytes = await fs.readFile(imagePath);
  const ext = path.extname(imagePath).toLowerCase();
  const mimeType =
    ext === ".png"
      ? "image/png"
      : ext === ".webp"
        ? "image/webp"
        : ext === ".heic"
          ? "image/heic"
          : "image/jpeg";
  return `data:${mimeType};base64,${bytes.toString("base64")}`;
}

async function runPass1(openai, model, dataUrl) {
  const response = await openai.responses.create({
    model,
    reasoning: { effort: "high" },
    max_output_tokens: 6000,
    text: {
      format: {
        type: "json_schema",
        name: "lineup_autofill_eval",
        strict: true,
        schema: PASS1_SCHEMA,
      },
    },
    input: [
      {
        role: "user",
        content: [
          {
            type: "input_text",
            text:
              "This photo shows one or more wine bottles. First, count every distinct bottle visible in the image. " +
              "Then, for each bottle, extract as much label information as you can read. " +
              "Return JSON with 'total_bottles_detected' followed by a 'wines' array in left-to-right order. " +
              "CRITICAL: wines array length MUST equal total_bottles_detected. " +
              "If text is unreadable, still include that bottle object with null fields, empty grape array, and low confidence. " +
              "Each wine object has keys: wine_name, producer, vintage, country, region, appellation, classification, primary_grape_suggestions, confidence, bottle_bbox, label_bbox, label_anchor. " +
              "label_bbox must tightly frame the primary front body label only; no neck label or foil.",
          },
          { type: "input_image", image_url: dataUrl, detail: "high" },
        ],
      },
    ],
  });

  const outputText = "output_text" in response ? response.output_text : "";
  const parsed = extractJson(outputText || "");
  const wines = Array.isArray(parsed.wines)
    ? parsed.wines.map((wine) => ({
        wine_name: normalizeText(wine.wine_name),
        producer: normalizeText(wine.producer),
        vintage: normalizeText(wine.vintage),
        country: normalizeText(wine.country),
        region: normalizeText(wine.region),
        appellation: normalizeText(wine.appellation),
        classification: normalizeText(wine.classification),
        primary_grape_suggestions: Array.isArray(wine.primary_grape_suggestions)
          ? wine.primary_grape_suggestions.map((s) => String(s).trim()).filter(Boolean).slice(0, 3)
          : [],
        confidence:
          typeof wine.confidence === "number" && Number.isFinite(wine.confidence)
            ? Math.min(1, Math.max(0, wine.confidence))
            : null,
        bottle_bbox: normalizeBox(wine.bottle_bbox, 0.05, 0.08),
        label_bbox: normalizeBox(wine.label_bbox, 0.03, 0.03),
        label_anchor: normalizeAnchor(wine.label_anchor),
      }))
    : [];

  return {
    total_bottles_detected:
      typeof parsed.total_bottles_detected === "number" && Number.isFinite(parsed.total_bottles_detected)
        ? Math.max(0, Math.round(parsed.total_bottles_detected))
        : wines.length,
    wines,
  };
}

async function runPass2(openai, model, dataUrl, boxedWines) {
  if (boxedWines.length === 0) {
    return new Map();
  }

  const response = await openai.responses.create({
    model,
    reasoning: { effort: "minimal" },
    max_output_tokens: 2200,
    text: {
      format: {
        type: "json_schema",
        name: "lineup_label_refine_eval",
        strict: true,
        schema: PASS2_SCHEMA,
      },
    },
    input: [
      {
        role: "user",
        content: [
          {
            type: "input_text",
            text:
              "You are pass 2 of wine bottle geometry extraction. " +
              "For each provided bottle index + bottle_bbox, return label_bbox and label_anchor for the primary front body label only. " +
              "Do not target neck labels, foil capsules, shoulder emblems, medallions, or bottle top. " +
              "Bottle list (normalized coordinates, 0-1): " +
              JSON.stringify(boxedWines),
          },
          { type: "input_image", image_url: dataUrl, detail: "high" },
        ],
      },
    ],
  });

  const outputText = "output_text" in response ? response.output_text : "";
  const parsed = labelRefineParse(outputText || "");
  const byIndex = new Map();

  for (const item of parsed) {
    byIndex.set(item.index, {
      label_bbox: normalizeBox(item.label_bbox, 0.03, 0.03),
      label_anchor: normalizeAnchor(item.label_anchor),
    });
  }

  return byIndex;
}

function labelRefineParse(outputText) {
  const parsed = extractJson(outputText);
  if (!parsed || !Array.isArray(parsed.labels)) {
    return [];
  }
  return parsed.labels
    .map((item) => ({
      index: Number(item?.index),
      label_bbox: item?.label_bbox ?? null,
      label_anchor: item?.label_anchor ?? null,
    }))
    .filter((item) => Number.isInteger(item.index) && item.index >= 0);
}

function scoreCase(prediction, expected) {
  let fieldMatches = 0;
  let fieldChecks = 0;
  let bboxIoUSum = 0;
  let bboxChecks = 0;

  const expectedWines = Array.isArray(expected?.wines) ? expected.wines : [];
  for (let i = 0; i < expectedWines.length; i++) {
    const expectedWine = expectedWines[i] ?? {};
    const predictedWine = prediction.wines[i] ?? {};

    for (const field of FIELD_KEYS) {
      const expectedValue = normalizeText(expectedWine[field]);
      if (!expectedValue) {
        continue;
      }
      fieldChecks += 1;
      if (looseMatch(expectedValue, predictedWine[field])) {
        fieldMatches += 1;
      }
    }

    const expectedBox = normalizeBox(expectedWine.label_bbox, 0.01, 0.01);
    if (expectedBox) {
      bboxChecks += 1;
      const predictedBox = normalizeBox(predictedWine.label_bbox, 0.01, 0.01);
      bboxIoUSum += computeIoU(expectedBox, predictedBox);
    }
  }

  const expectedCount =
    typeof expected?.total_bottles_detected === "number" &&
    Number.isFinite(expected.total_bottles_detected)
      ? Math.max(0, Math.round(expected.total_bottles_detected))
      : null;

  return {
    expected_count: expectedCount,
    predicted_count: prediction.total_bottles_detected,
    count_match: expectedCount === null ? null : expectedCount === prediction.total_bottles_detected,
    field_matches: fieldMatches,
    field_checks: fieldChecks,
    field_recall: fieldChecks > 0 ? fieldMatches / fieldChecks : null,
    bbox_iou_avg: bboxChecks > 0 ? bboxIoUSum / bboxChecks : null,
    bbox_checks: bboxChecks,
  };
}

function summarize(results) {
  const withExpectedCount = results.filter((r) => r.metrics.count_match !== null);
  const countMatched = withExpectedCount.filter((r) => r.metrics.count_match).length;

  const totalFieldChecks = results.reduce((sum, r) => sum + r.metrics.field_checks, 0);
  const totalFieldMatches = results.reduce((sum, r) => sum + r.metrics.field_matches, 0);

  const bboxSamples = results
    .map((r) => r.metrics)
    .filter((m) => typeof m.bbox_iou_avg === "number");
  const avgBboxIoU =
    bboxSamples.length > 0
      ? bboxSamples.reduce((sum, m) => sum + m.bbox_iou_avg, 0) / bboxSamples.length
      : null;

  return {
    total_cases: results.length,
    count_accuracy:
      withExpectedCount.length > 0 ? countMatched / withExpectedCount.length : null,
    field_recall: totalFieldChecks > 0 ? totalFieldMatches / totalFieldChecks : null,
    avg_label_bbox_iou: avgBboxIoU,
    total_field_checks: totalFieldChecks,
    total_bbox_scored_cases: bboxSamples.length,
  };
}

async function main() {
  const manifestArg = argValue("--manifest");
  const outArg = argValue("--out", path.join("eval", "reports", "lineup-label-scan-report.json"));
  const limitArg = argValue("--limit");
  const modelArg = argValue("--model");

  const manifestPath = path.resolve(process.cwd(), manifestArg || path.join("eval", "fixtures", "lineup-label-scan.json"));
  const outPath = path.resolve(process.cwd(), outArg);
  const limit = limitArg ? Math.max(1, Number(limitArg)) : null;

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("Missing OPENAI_API_KEY in environment.");
  }

  try {
    await fs.access(manifestPath);
  } catch {
    throw new Error(
      `Manifest not found at ${manifestPath}. Copy eval/fixtures/lineup-label-scan.sample.json to eval/fixtures/lineup-label-scan.json and add your fixture images.`
    );
  }

  const manifestRaw = await fs.readFile(manifestPath, "utf8");
  const manifest = JSON.parse(manifestRaw);
  if (!Array.isArray(manifest.cases) || manifest.cases.length === 0) {
    throw new Error("Manifest must include a non-empty 'cases' array.");
  }

  const model = modelArg || manifest.model || "gpt-5-nano";
  const cases = limit ? manifest.cases.slice(0, limit) : manifest.cases;

  const openai = new OpenAI({ apiKey });
  const results = [];

  for (let i = 0; i < cases.length; i++) {
    const testCase = cases[i];
    const caseId = String(testCase.id || `case-${i + 1}`);
    const imagePath = path.resolve(path.dirname(manifestPath), String(testCase.image_path));

    let dataUrl;
    try {
      dataUrl = await toDataUrl(imagePath);
    } catch {
      throw new Error(`Fixture image not found for ${caseId}: ${imagePath}`);
    }
    const pass1 = await runPass1(openai, model, dataUrl);

    const boxedWines = pass1.wines
      .map((wine, index) => ({ index, bottle_bbox: wine.bottle_bbox }))
      .filter((item) => item.bottle_bbox);

    const pass2ByIndex = await runPass2(openai, model, dataUrl, boxedWines);

    const wines = pass1.wines.map((wine, index) => {
      const refined = pass2ByIndex.get(index);
      if (!refined) return wine;
      return {
        ...wine,
        label_bbox: refined.label_bbox || wine.label_bbox,
        label_anchor: refined.label_anchor || wine.label_anchor,
      };
    });

    const prediction = {
      total_bottles_detected: pass1.total_bottles_detected,
      wines,
    };

    const metrics = scoreCase(prediction, testCase.expected || {});

    console.log(
      `${caseId}: count=${metrics.predicted_count}` +
        (metrics.expected_count === null ? "" : ` (expected ${metrics.expected_count})`) +
        (metrics.count_match === null ? "" : metrics.count_match ? " PASS" : " FAIL") +
        ` | fields=${metrics.field_matches}/${metrics.field_checks}` +
        (typeof metrics.bbox_iou_avg === "number"
          ? ` | label_iou=${metrics.bbox_iou_avg.toFixed(3)}`
          : "")
    );

    results.push({
      id: caseId,
      image_path: testCase.image_path,
      metrics,
      prediction,
    });
  }

  const summary = summarize(results);
  const report = {
    generated_at: new Date().toISOString(),
    model,
    manifest: path.relative(process.cwd(), manifestPath),
    summary,
    results,
  };

  await fs.writeFile(outPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");

  console.log("\nSummary:");
  console.log(`  cases: ${summary.total_cases}`);
  console.log(
    `  count_accuracy: ${summary.count_accuracy === null ? "n/a" : summary.count_accuracy.toFixed(3)}`
  );
  console.log(
    `  field_recall: ${summary.field_recall === null ? "n/a" : summary.field_recall.toFixed(3)}`
  );
  console.log(
    `  avg_label_bbox_iou: ${summary.avg_label_bbox_iou === null ? "n/a" : summary.avg_label_bbox_iou.toFixed(3)}`
  );
  console.log(`\nReport written to ${path.relative(process.cwd(), outPath)}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : "Evaluation failed");
  process.exit(1);
});

#!/usr/bin/env node
/**
 * Somm cold-start eval harness.
 *
 * Predicts the winner of head-to-head tastings using several predictors and
 * scores them against recorded outcomes:
 *
 *   llm     — sommelier manual (docs/sommelier-manual.md) as system prompt
 *   engine  — the real deterministic algorithm via engine-predict.ts (tsx)
 *   price   — naive baseline: more expensive bottle wins
 *   random  — deterministic coin flip baseline
 *
 * Usage:
 *   npm run eval:somm -- --dry-run
 *   npm run eval:somm -- --predictors=price,random
 *   npm run eval:somm -- --predictors=llm,engine,price,random --model=gpt-5-mini
 *
 * Data files (see README.md): scripts/somm-eval/data/tasters.json and
 * comparisons.csv; falls back to the .template files with a warning.
 */

import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { spawn } from "node:child_process";
import OpenAI from "openai";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "../..");
const EVAL_DIR = path.join(ROOT, "scripts/somm-eval");
const MANUAL_PATH = path.join(ROOT, "docs/sommelier-manual.md");

// Must match LOVE_AXIS_MAP / AVOID_AXIS_MAP keys in
// src/server/algorithm/surveySeeding.ts — validated on load so bad chips
// fail loudly here instead of silently seeding nothing.
const VALID_LOVES = [
  "Big and full-bodied", "Light and delicate", "High acidity, crisp",
  "Smooth and round", "Rich and oaky", "Fruit-forward", "Earthy and funky",
  "Mineral-driven", "Complex and layered", "Long, lingering finish",
  "Aromatic and perfumed", "Savory, umami notes",
];
const VALID_AVOIDS = [
  "Overly oaky whites", "Overly oaky", "Very tannic / grippy reds",
  "Very tannic / grippy", "Too acidic", "Too acidic / sour",
  "Jammy / overripe fruit", "High alcohol", "Hot / high alcohol",
  "Too sweet / overripe", "Very sweet", "Too bitter / astringent",
  "Thin and watery",
];

const WINE_FIELDS = [
  "producer", "name", "vintage", "wine_type", "region", "sub_region",
  "country", "grapes", "classification", "price",
];

const PREDICTION_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    winner: { type: "string", enum: ["a", "b", "tie"] },
    confidence: { type: "number" },
    reasoning: { type: "string" },
  },
  required: ["winner", "confidence", "reasoning"],
};

function parseArgs(argv) {
  const args = {
    predictors: ["price", "random"],
    model: "gpt-5-mini",
    tasters: path.join(EVAL_DIR, "data/tasters.json"),
    comparisons: path.join(EVAL_DIR, "data/comparisons.csv"),
    limit: Infinity,
    dryRun: false,
    out: null,
  };
  for (const arg of argv) {
    if (arg === "--dry-run") args.dryRun = true;
    else if (arg.startsWith("--predictors=")) args.predictors = arg.slice(13).split(",").map((s) => s.trim());
    else if (arg.startsWith("--model=")) args.model = arg.slice(8);
    else if (arg.startsWith("--tasters=")) args.tasters = path.resolve(arg.slice(10));
    else if (arg.startsWith("--comparisons=")) args.comparisons = path.resolve(arg.slice(14));
    else if (arg.startsWith("--limit=")) args.limit = Number(arg.slice(8));
    else if (arg.startsWith("--out=")) args.out = path.resolve(arg.slice(6));
    else throw new Error(`Unknown argument: ${arg}`);
  }
  return args;
}

async function loadEnvLocal() {
  try {
    const raw = await fs.readFile(path.join(ROOT, ".env.local"), "utf8");
    for (const line of raw.split("\n")) {
      const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
      if (!match) continue;
      const [, key, rawValue] = match;
      if (process.env[key] !== undefined) continue;
      process.env[key] = rawValue.replace(/^["']|["']$/g, "").trim();
    }
  } catch {
    // no .env.local — rely on the ambient environment
  }
}

async function loadWithTemplateFallback(filePath) {
  try {
    return { raw: await fs.readFile(filePath, "utf8"), path: filePath };
  } catch {
    const templatePath = filePath.replace(/(\.[a-z]+)$/, ".template$1");
    const raw = await fs.readFile(templatePath, "utf8");
    console.warn(`! ${path.basename(filePath)} not found — using ${path.basename(templatePath)} (example data)`);
    return { raw, path: templatePath };
  }
}

function parseCsv(raw) {
  const rows = [];
  let row = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < raw.length; i++) {
    const ch = raw[i];
    if (inQuotes) {
      if (ch === '"' && raw[i + 1] === '"') { field += '"'; i++; }
      else if (ch === '"') inQuotes = false;
      else field += ch;
    } else if (ch === '"') inQuotes = true;
    else if (ch === ",") { row.push(field); field = ""; }
    else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && raw[i + 1] === "\n") i++;
      row.push(field); field = "";
      if (row.some((f) => f !== "")) rows.push(row);
      row = [];
    } else field += ch;
  }
  if (field !== "" || row.length > 0) { row.push(field); if (row.some((f) => f !== "")) rows.push(row); }
  const [header, ...body] = rows;
  return body.map((cells) =>
    Object.fromEntries(header.map((key, i) => [key.trim(), (cells[i] ?? "").trim() || null]))
  );
}

function rowToWine(row, prefix) {
  const wine = {};
  for (const field of WINE_FIELDS) {
    wine[field] = row[`${prefix}_${field}`] ?? null;
  }
  wine.vintage = wine.vintage ? Number.parseInt(wine.vintage, 10) || null : null;
  wine.price = wine.price ? Number.parseFloat(wine.price) || null : null;
  return wine;
}

function validate(tasters, comparisons) {
  const errors = [];
  const tasterIds = new Set();
  for (const taster of tasters) {
    if (!taster.taster_id) errors.push("taster missing taster_id");
    tasterIds.add(taster.taster_id);
    for (const chip of taster.survey?.sensory_loves ?? []) {
      if (!VALID_LOVES.includes(chip)) errors.push(`${taster.taster_id}: unknown sensory_love "${chip}"`);
    }
    for (const chip of taster.survey?.sensory_avoids ?? []) {
      if (!VALID_AVOIDS.includes(chip)) errors.push(`${taster.taster_id}: unknown sensory_avoid "${chip}"`);
    }
    if (taster.survey && !taster.survey.completed_at) {
      errors.push(`${taster.taster_id}: survey.completed_at must be set for survey seeding to apply`);
    }
  }
  comparisons.forEach((row, i) => {
    if (!tasterIds.has(row.taster_id)) errors.push(`row ${i + 1}: unknown taster_id "${row.taster_id}"`);
    if (!["a", "b", "tie"].includes(row.winner)) errors.push(`row ${i + 1}: winner must be a|b|tie, got "${row.winner}"`);
    for (const prefix of ["wine_a", "wine_b"]) {
      if (!row[`${prefix}_producer`] && !row[`${prefix}_name`]) errors.push(`row ${i + 1}: ${prefix} needs producer or name`);
    }
  });
  return errors;
}

// ── Predictors ───────────────────────────────────────────────────────

function predictRandom(comparison, index) {
  // Deterministic "coin": hash of taster + index so reruns are comparable.
  let hash = 0;
  const seed = `${comparison.taster_id}:${index}`;
  for (const ch of seed) hash = (hash * 31 + ch.charCodeAt(0)) | 0;
  return { predicted: Math.abs(hash) % 2 === 0 ? "a" : "b" };
}

function predictPrice(comparison) {
  const { wine_a, wine_b } = comparison;
  if (wine_a.price == null || wine_b.price == null) return { predicted: null };
  if (wine_a.price === wine_b.price) return { predicted: "tie" };
  return { predicted: wine_a.price > wine_b.price ? "a" : "b" };
}

async function predictEngineBatch(comparisons, tasterById) {
  const payload = {
    comparisons: comparisons.map((row) => ({
      taster: tasterById.get(row.taster_id),
      wine_a: row.wine_a,
      wine_b: row.wine_b,
    })),
  };
  const child = spawn("npx", ["tsx", path.join(EVAL_DIR, "engine-predict.ts")], {
    cwd: ROOT,
    stdio: ["pipe", "pipe", "inherit"],
    env: process.env,
  });
  child.stdin.write(JSON.stringify(payload));
  child.stdin.end();
  let stdout = "";
  for await (const chunk of child.stdout) stdout += chunk;
  const exitCode = await new Promise((resolve) => child.on("close", resolve));
  if (exitCode !== 0) throw new Error(`engine-predict.ts exited with code ${exitCode}`);
  return JSON.parse(stdout).results;
}

function describeTaster(taster) {
  const lines = [`Taster: ${taster.display_name ?? taster.taster_id}`];
  if (taster.experience_level) lines.push(`Experience level: ${taster.experience_level}`);
  if (taster.survey) lines.push(`Taste survey: ${JSON.stringify(taster.survey)}`);
  const logged = taster.logged_wines ?? [];
  if (logged.length > 0) {
    lines.push("Logged wines (rating out of 5):");
    for (const wine of logged) {
      lines.push(`- ${wine.rating}★ ${[wine.producer, wine.name, wine.vintage, wine.region, wine.country, wine.grapes].filter(Boolean).join(", ")}${wine.notes ? ` — "${wine.notes}"` : ""}`);
    }
  } else {
    lines.push("Logged wines: none (pure cold start).");
  }
  return lines.join("\n");
}

function describeWine(wine, label) {
  const facts = WINE_FIELDS.map((field) => (wine[field] != null ? `${field}: ${wine[field]}` : null)).filter(Boolean);
  return `Wine ${label.toUpperCase()}: ${facts.join("; ")}`;
}

async function predictLlm(client, model, manual, comparison, tasterById) {
  const taster = tasterById.get(comparison.taster_id);
  const user = [
    "Two wines were tasted head-to-head by the taster below. Using the recommendation manual, predict which wine the taster preferred.",
    "",
    describeTaster(taster),
    "",
    describeWine(comparison.wine_a, "a"),
    describeWine(comparison.wine_b, "b"),
    comparison.food_context ? `\nFood context: ${comparison.food_context}` : "",
    "",
    'Answer with the wine the taster more likely preferred ("a" or "b"), or "tie" only if the manual genuinely cannot separate them.',
  ].join("\n");

  const response = await client.responses.create({
    model,
    input: [
      { role: "system", content: manual },
      { role: "user", content: user },
    ],
    text: {
      format: { type: "json_schema", name: "preference_prediction", strict: true, schema: PREDICTION_SCHEMA },
    },
  });
  const parsed = JSON.parse(response.output_text);
  return { predicted: parsed.winner, confidence: parsed.confidence, reasoning: parsed.reasoning };
}

// ── Scoring ──────────────────────────────────────────────────────────

function summarize(predictorName, outcomes) {
  const decided = outcomes.filter((o) => o.actual !== "tie" && o.predicted != null);
  const attempted = decided.filter((o) => o.predicted !== "tie");
  const correct = attempted.filter((o) => o.predicted === o.actual);
  return {
    predictor: predictorName,
    comparisons: outcomes.length,
    ground_truth_ties: outcomes.filter((o) => o.actual === "tie").length,
    abstained_or_failed: decided.length - attempted.length + outcomes.filter((o) => o.predicted == null).length,
    decided: attempted.length,
    correct: correct.length,
    accuracy: attempted.length > 0 ? (correct.length / attempted.length) : null,
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  await loadEnvLocal();

  const tastersFile = await loadWithTemplateFallback(args.tasters);
  const comparisonsFile = await loadWithTemplateFallback(args.comparisons);
  const tasters = JSON.parse(tastersFile.raw);
  const rows = parseCsv(comparisonsFile.raw)
    .slice(0, args.limit)
    .map((row) => ({ ...row, wine_a: rowToWine(row, "wine_a"), wine_b: rowToWine(row, "wine_b") }));

  const errors = validate(tasters, rows);
  if (errors.length > 0) {
    console.error("Data validation failed:");
    for (const error of errors) console.error(`  - ${error}`);
    process.exit(1);
  }
  console.log(`Loaded ${tasters.length} tasters, ${rows.length} comparisons.`);
  if (args.dryRun) {
    console.log("Dry run — data is valid. Exiting before prediction.");
    return;
  }

  const tasterById = new Map(tasters.map((t) => [t.taster_id, t]));
  const perComparison = rows.map((row, index) => ({
    index,
    taster_id: row.taster_id,
    actual: row.winner,
    blind: row.blind,
    predictions: {},
  }));

  for (const predictor of args.predictors) {
    if (predictor === "random") {
      rows.forEach((row, i) => { perComparison[i].predictions.random = predictRandom(row, i); });
    } else if (predictor === "price") {
      rows.forEach((row, i) => { perComparison[i].predictions.price = predictPrice(row); });
    } else if (predictor === "engine") {
      console.log("Running engine predictor (tsx bridge, live Supabase reference data)...");
      const results = await predictEngineBatch(rows, tasterById);
      results.forEach((result) => { perComparison[result.index].predictions.engine = result; });
    } else if (predictor === "llm") {
      if (!process.env.OPENAI_API_KEY) throw new Error("OPENAI_API_KEY required for the llm predictor");
      const manual = await fs.readFile(MANUAL_PATH, "utf8");
      const client = new OpenAI();
      console.log(`Running llm predictor (${args.model}, manual as system prompt)...`);
      for (let i = 0; i < rows.length; i++) {
        try {
          perComparison[i].predictions.llm = await predictLlm(client, args.model, manual, rows[i], tasterById);
        } catch (error) {
          console.error(`  llm failed on row ${i + 1}: ${error.message}`);
          perComparison[i].predictions.llm = { predicted: null, error: String(error) };
        }
        process.stdout.write(`\r  ${i + 1}/${rows.length}`);
      }
      process.stdout.write("\n");
    } else {
      throw new Error(`Unknown predictor: ${predictor}`);
    }
  }

  const summaries = args.predictors.map((name) =>
    summarize(name, perComparison.map((c) => ({ actual: c.actual, predicted: c.predictions[name]?.predicted ?? null })))
  );

  console.log("\nResults (accuracy on decisively-predicted, non-tie comparisons):\n");
  for (const s of summaries) {
    const pct = s.accuracy == null ? "n/a" : `${(s.accuracy * 100).toFixed(1)}%`;
    console.log(`  ${s.predictor.padEnd(8)} ${pct.padStart(6)}  (${s.correct}/${s.decided} decided, ${s.abstained_or_failed} abstained/failed, ${s.ground_truth_ties} true ties excluded)`);
  }

  const outPath = args.out ?? path.join(EVAL_DIR, "results", `eval-${new Date().toISOString().replace(/[:.]/g, "-")}.json`);
  await fs.mkdir(path.dirname(outPath), { recursive: true });
  await fs.writeFile(outPath, JSON.stringify({ args: { ...args, limit: rows.length }, summaries, perComparison }, null, 2));
  console.log(`\nDetail written to ${path.relative(ROOT, outPath)}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

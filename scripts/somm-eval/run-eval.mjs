#!/usr/bin/env node
/**
 * Somm cold-start eval harness.
 *
 * Predicts the winner of head-to-head tastings using several predictors and
 * scores them against recorded outcomes:
 *
 *   llm       — sommelier manual (docs/sommelier-manual.md) as system prompt (OpenAI)
 *   claude    — sommelier manual as system prompt (Anthropic Messages API, prompt-cached)
 *   engine    — the real deterministic algorithm via engine-predict.ts (tsx)
 *   consensus — group-consensus baseline: wine with the higher win rate among
 *               other tasters (plus this taster's train picks under --holdout) wins
 *   price     — naive baseline: more expensive bottle wins
 *   random    — deterministic coin flip baseline
 *
 * Holdout mode (--holdout=0.5): per taster, a deterministic fraction of their
 * comparisons is held out as the test set; the rest ("train" picks) are shown
 * to the llm/claude predictors as prior tasting history, and folded into the
 * consensus stats. This measures how well each predictor extrapolates a
 * taster's palate from partial data — the core cold-start question.
 *
 * Usage:
 *   npm run eval:somm -- --dry-run
 *   npm run eval:somm -- --predictors=price,random
 *   npm run eval:somm -- --predictors=llm,engine,price,random --model=gpt-5-mini
 *   npm run eval:somm -- --predictors=claude,consensus,random --holdout=0.5 --claude-model=claude-sonnet-5
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

// Property order matters: models fill structured output in schema order, so
// reasoning MUST come before winner — otherwise the model commits to an
// answer first and backfills (or skips) the reasoning.
const PREDICTION_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    reasoning: {
      type: "string",
      description: "Think step by step: what does the taster's history reveal about their palate, and how does each wine's style fit? Reason BEFORE picking a winner.",
    },
    winner: { type: "string", enum: ["a", "b", "tie"] },
    confidence: { type: "number" },
  },
  required: ["reasoning", "winner", "confidence"],
};

function parseArgs(argv) {
  const args = {
    predictors: ["price", "random"],
    model: "gpt-5-mini",
    claudeModel: "claude-sonnet-5",
    fastModel: "claude-haiku-4-5-20251001",
    tasters: path.join(EVAL_DIR, "data/tasters.json"),
    comparisons: path.join(EVAL_DIR, "data/comparisons.csv"),
    limit: Infinity,
    holdout: 0,
    foldSeed: 1,
    concurrency: 6,
    crowdContext: false,
    dryRun: false,
    out: null,
  };
  for (const arg of argv) {
    if (arg === "--dry-run") args.dryRun = true;
    else if (arg.startsWith("--predictors=")) args.predictors = arg.slice(13).split(",").map((s) => s.trim());
    else if (arg.startsWith("--model=")) args.model = arg.slice(8);
    else if (arg.startsWith("--claude-model=")) args.claudeModel = arg.slice(15);
    else if (arg.startsWith("--tasters=")) args.tasters = path.resolve(arg.slice(10));
    else if (arg.startsWith("--comparisons=")) args.comparisons = path.resolve(arg.slice(14));
    else if (arg.startsWith("--limit=")) args.limit = Number(arg.slice(8));
    else if (arg.startsWith("--holdout=")) args.holdout = Number(arg.slice(10));
    else if (arg.startsWith("--fold-seed=")) args.foldSeed = Number(arg.slice(12));
    else if (arg.startsWith("--concurrency=")) args.concurrency = Number(arg.slice(14));
    else if (arg === "--crowd-context") args.crowdContext = true;
    else if (arg.startsWith("--fast-model=")) args.fastModel = arg.slice(13);
    else if (arg.startsWith("--out=")) args.out = path.resolve(arg.slice(6));
    else throw new Error(`Unknown argument: ${arg}`);
  }
  if (Number.isNaN(args.holdout) || args.holdout < 0 || args.holdout >= 1) {
    throw new Error("--holdout must be a fraction in [0, 1)");
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

// ── Holdout split ────────────────────────────────────────────────────

function hashString(value) {
  let hash = 0;
  for (const ch of value) hash = (hash * 31 + ch.charCodeAt(0)) | 0;
  return Math.abs(hash);
}

/**
 * Deterministically split each taster's comparisons into train/test.
 * Returns { testIndexes: Set<number>, trainRowsByTaster: Map<taster_id, row[]> }.
 * Uses floor() for the test count so tasters with a single comparison keep it
 * in train (they contribute history/consensus data but aren't scored).
 */
function splitHoldout(rows, fraction, seed) {
  const byTaster = new Map();
  rows.forEach((row, index) => {
    if (!byTaster.has(row.taster_id)) byTaster.set(row.taster_id, []);
    byTaster.get(row.taster_id).push({ row, index });
  });
  const testIndexes = new Set();
  const trainRowsByTaster = new Map();
  for (const [tasterId, items] of byTaster) {
    const shuffled = [...items].sort(
      (x, y) => hashString(`${seed}:${tasterId}:${x.index}`) - hashString(`${seed}:${tasterId}:${y.index}`)
    );
    const testCount = Math.floor(items.length * fraction);
    shuffled.slice(0, testCount).forEach((item) => testIndexes.add(item.index));
    trainRowsByTaster.set(tasterId, shuffled.slice(testCount).map((item) => item.row));
  }
  return { testIndexes, trainRowsByTaster };
}

function describeComparisonPick(row) {
  const winner = row.winner === "a" ? row.wine_a : row.wine_b;
  const loser = row.winner === "a" ? row.wine_b : row.wine_a;
  const short = (wine) =>
    [wine.producer, wine.name, wine.vintage, wine.grapes, wine.region, wine.country].filter(Boolean).join(", ");
  if (row.winner === "tie") return `- Could not separate [${short(row.wine_a)}] and [${short(row.wine_b)}]`;
  const rating = row.winner_rating ? ` (rated the winner ${row.winner_rating}/5)` : "";
  return `- PREFERRED [${short(winner)}] OVER [${short(loser)}]${rating}`;
}

// ── Predictors ───────────────────────────────────────────────────────

async function mapWithConcurrency(items, limit, worker) {
  const results = new Array(items.length);
  let next = 0;
  async function lane() {
    while (next < items.length) {
      const index = next++;
      results[index] = await worker(items[index], index);
    }
  }
  await Promise.all(Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, lane));
  return results;
}

function wineConsensusKey(wine) {
  return [wine.producer, wine.name, wine.vintage].map((v) => String(v ?? "").toLowerCase().trim()).join("|");
}

/**
 * Group-consensus baseline. Stats are win/appearance counts over `rows`
 * excluding `excludeIndexes` (the current taster's test rows — their train
 * rows and every other taster's rows are fair game, mirroring what a
 * production system would know). Laplace-smoothed; ties only on exact equality.
 */
function buildConsensusStats(rows, excludeIndexes) {
  const stats = new Map();
  const bump = (key, won) => {
    const entry = stats.get(key) ?? { wins: 0, appearances: 0 };
    entry.appearances += 1;
    if (won) entry.wins += 1;
    stats.set(key, entry);
  };
  rows.forEach((row, index) => {
    if (excludeIndexes.has(index)) return;
    if (!["a", "b"].includes(row.winner)) return;
    bump(wineConsensusKey(row.wine_a), row.winner === "a");
    bump(wineConsensusKey(row.wine_b), row.winner === "b");
  });
  return stats;
}

function predictConsensus(comparison, stats) {
  const rate = (wine) => {
    const entry = stats.get(wineConsensusKey(wine)) ?? { wins: 0, appearances: 0 };
    return (entry.wins + 1) / (entry.appearances + 2);
  };
  const rateA = rate(comparison.wine_a);
  const rateB = rate(comparison.wine_b);
  if (rateA === rateB) return { predicted: "tie", rate_a: rateA, rate_b: rateB };
  return { predicted: rateA > rateB ? "a" : "b", rate_a: rateA, rate_b: rateB };
}

function describeCrowd(comparison, stats) {
  const line = (wine, label) => {
    const entry = stats?.get(wineConsensusKey(wine));
    if (!entry || entry.appearances === 0) return `Wine ${label.toUpperCase()}: no group data`;
    return `Wine ${label.toUpperCase()}: preferred in ${entry.wins} of ${entry.appearances} head-to-heads by other tasters`;
  };
  return [
    "Group signal (how the SAME bottles fared with other tasters at the same tastings — a strong prior; deviate from it only when the taster's own history clearly points the other way):",
    line(comparison.wine_a, "a"),
    line(comparison.wine_b, "b"),
  ].join("\n");
}

async function predictClaude(model, manual, comparison, tasterById, crowdStats) {
  const taster = tasterById.get(comparison.taster_id);
  const user = [
    "Two wines were tasted head-to-head BLIND by the taster below — labels, producers, and prices were hidden, so prestige and reputation could not influence the pick. Judge purely on wine style versus the taster's demonstrated palate. Using the recommendation manual, predict which wine the taster preferred.",
    "",
    describeTaster(taster),
    "",
    describeWine(comparison.wine_a, "a"),
    describeWine(comparison.wine_b, "b"),
    crowdStats ? `\n${describeCrowd(comparison, crowdStats)}` : "",
    comparison.food_context ? `\nFood context: ${comparison.food_context}` : "",
    "",
    'Reason first, then answer with the wine the taster more likely preferred ("a" or "b"), or "tie" only if the manual genuinely cannot separate them.',
  ].join("\n");

  const started = Date.now();
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": process.env.ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model,
      max_tokens: 1500,
      // The manual is identical across every call — cache it so repeated
      // requests only pay for the per-comparison user message.
      system: [{ type: "text", text: manual, cache_control: { type: "ephemeral" } }],
      messages: [{ role: "user", content: user }],
      tools: [
        {
          name: "record_prediction",
          description: "Record the head-to-head preference prediction.",
          input_schema: PREDICTION_SCHEMA,
        },
      ],
      tool_choice: { type: "tool", name: "record_prediction" },
    }),
  });
  if (!response.ok) {
    throw new Error(`Anthropic API ${response.status}: ${(await response.text()).slice(0, 300)}`);
  }
  const data = await response.json();
  const toolUse = data.content?.find((block) => block.type === "tool_use");
  if (!toolUse) throw new Error("Claude response contained no tool_use block");
  return {
    predicted: toolUse.input.winner,
    confidence: toolUse.input.confidence,
    reasoning: toolUse.input.reasoning,
    latency_ms: Date.now() - started,
  };
}

// ── claude-profile: distill history once, predict pairs with a fast model ──
// This mirrors the proposed production architecture: an expensive "master
// somm reads your history" call runs offline per user; scan-time ranking
// uses only the compact distilled profile with a small fast model.

const PALATE_PROFILE_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    reasoning: { type: "string", description: "What the tasting history reveals, examined pick by pick, before summarizing." },
    profile: {
      type: "object",
      additionalProperties: false,
      properties: {
        weight_preference: { type: "string", description: "big/full vs light/delicate lean, with strength" },
        fruit_vs_savory: { type: "string" },
        structure_notes: { type: "string", description: "tannin, acid, oak tolerance" },
        favored_styles: { type: "array", items: { type: "string" } },
        avoided_styles: { type: "array", items: { type: "string" } },
        confidence: { type: "string", description: "how much history supports this profile" },
      },
      required: ["weight_preference", "fruit_vs_savory", "structure_notes", "favored_styles", "avoided_styles", "confidence"],
    },
  },
  required: ["reasoning", "profile"],
};

const FAST_PREDICT_SYSTEM = [
  "You are a master sommelier predicting the outcome of a BLIND head-to-head tasting.",
  "You are given a distilled palate profile for the taster and two wines. Labels and prices were hidden from the taster — judge purely on how each wine's style fits the profile.",
  "Wine quality matters too: between two wines a taster has no strong stylistic lean between, the better-made, more balanced wine usually wins.",
  "Reason briefly first, then commit to a winner.",
].join("\n");

async function anthropicToolCall({ model, system, user, schema, toolName, maxTokens }) {
  const started = Date.now();
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": process.env.ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model,
      max_tokens: maxTokens,
      system: [{ type: "text", text: system, cache_control: { type: "ephemeral" } }],
      messages: [{ role: "user", content: user }],
      tools: [{ name: toolName, description: `Record the ${toolName}.`, input_schema: schema }],
      tool_choice: { type: "tool", name: toolName },
    }),
  });
  if (!response.ok) throw new Error(`Anthropic API ${response.status}: ${(await response.text()).slice(0, 300)}`);
  const data = await response.json();
  const toolUse = data.content?.find((block) => block.type === "tool_use");
  if (!toolUse) throw new Error("response contained no tool_use block");
  return { input: toolUse.input, latency_ms: Date.now() - started };
}

async function distillPalateProfile(model, manual, taster) {
  const user = [
    "Distill this taster's palate into a compact profile a sommelier could hand to a colleague. Use the recommendation manual's reasoning method: isolate underlying characteristics from the picks, don't just repeat grape names.",
    "",
    describeTaster(taster),
  ].join("\n");
  const { input, latency_ms } = await anthropicToolCall({
    model, system: manual, user,
    schema: PALATE_PROFILE_SCHEMA, toolName: "palate_profile", maxTokens: 2000,
  });
  return { profile: input.profile, latency_ms };
}

async function predictWithProfile(fastModel, profile, comparison) {
  const user = [
    `Taster palate profile: ${JSON.stringify(profile)}`,
    "",
    describeWine(comparison.wine_a, "a"),
    describeWine(comparison.wine_b, "b"),
    comparison.food_context ? `\nFood context: ${comparison.food_context}` : "",
    "",
    'Which wine did the taster prefer? Answer "a" or "b" ("tie" only if genuinely inseparable).',
  ].join("\n");
  const { input, latency_ms } = await anthropicToolCall({
    model: fastModel, system: FAST_PREDICT_SYSTEM, user,
    schema: PREDICTION_SCHEMA, toolName: "record_prediction", maxTokens: 700,
  });
  return { predicted: input.winner, confidence: input.confidence, reasoning: input.reasoning, latency_ms };
}

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
  const history = taster.comparison_history ?? [];
  if (history.length > 0) {
    lines.push("", "Prior blind head-to-head picks by this taster (strongest available signal):");
    for (const row of history) lines.push(describeComparisonPick(row));
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

  const started = Date.now();
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
  return { predicted: parsed.winner, confidence: parsed.confidence, reasoning: parsed.reasoning, latency_ms: Date.now() - started };
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

  const tasterById = new Map(tasters.map((t) => [t.taster_id, { ...t }]));

  // Holdout: attach train picks to each taster as comparison history and
  // evaluate only on the held-out rows.
  let evalRows = rows.map((row, index) => ({ row, index }));
  let trainRowsByTaster = null;
  if (args.holdout > 0) {
    const split = splitHoldout(rows, args.holdout, args.foldSeed);
    trainRowsByTaster = split.trainRowsByTaster;
    for (const [tasterId, trainRows] of trainRowsByTaster) {
      const taster = tasterById.get(tasterId);
      if (taster) taster.comparison_history = trainRows;
    }
    evalRows = evalRows.filter(({ index }) => split.testIndexes.has(index));
    const trainTotal = rows.length - evalRows.length;
    console.log(
      `Holdout ${args.holdout} (seed ${args.foldSeed}): ${trainTotal} train picks fed as history, ${evalRows.length} held out for scoring.`
    );
  }

  const perComparison = evalRows.map(({ row, index }) => ({
    index,
    taster_id: row.taster_id,
    actual: row.winner,
    blind: row.blind,
    predictions: {},
  }));

  const evalRowList = evalRows.map(({ row }) => row);

  for (const predictor of args.predictors) {
    if (predictor === "random") {
      evalRowList.forEach((row, i) => { perComparison[i].predictions.random = predictRandom(row, perComparison[i].index); });
    } else if (predictor === "price") {
      evalRowList.forEach((row, i) => { perComparison[i].predictions.price = predictPrice(row); });
    } else if (predictor === "consensus") {
      console.log("Running consensus predictor (group win rates, own test rows excluded)...");
      const testIndexesByTaster = new Map();
      perComparison.forEach((c) => {
        if (!testIndexesByTaster.has(c.taster_id)) testIndexesByTaster.set(c.taster_id, new Set());
        testIndexesByTaster.get(c.taster_id).add(c.index);
      });
      const statsByTaster = new Map();
      for (const [tasterId, excludeIndexes] of testIndexesByTaster) {
        statsByTaster.set(tasterId, buildConsensusStats(rows, excludeIndexes));
      }
      evalRowList.forEach((row, i) => {
        perComparison[i].predictions.consensus = predictConsensus(row, statsByTaster.get(row.taster_id));
      });
    } else if (predictor === "engine") {
      console.log("Running engine predictor (tsx bridge, live Supabase reference data)...");
      const results = await predictEngineBatch(evalRowList, tasterById);
      results.forEach((result) => { perComparison[result.index].predictions.engine = result; });
    } else if (predictor === "claude-profile") {
      if (!process.env.ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY required for the claude-profile predictor");
      const manual = await fs.readFile(MANUAL_PATH, "utf8");
      const tasterIds = [...new Set(evalRowList.map((row) => row.taster_id))];
      console.log(`Running claude-profile predictor (distill: ${args.claudeModel}, pairwise: ${args.fastModel})...`);
      const profiles = new Map();
      await mapWithConcurrency(tasterIds, args.concurrency, async (tasterId) => {
        try {
          const result = await distillPalateProfile(args.claudeModel, manual, tasterById.get(tasterId));
          profiles.set(tasterId, result);
        } catch (error) {
          console.error(`\n  profile distillation failed for ${tasterId}: ${error.message}`);
        }
      });
      console.log(`  distilled ${profiles.size}/${tasterIds.length} profiles (p50 ${[...profiles.values()].map((p) => p.latency_ms).sort((x, y) => x - y)[Math.floor(profiles.size / 2)] ?? "?"}ms)`);
      let completed = 0;
      await mapWithConcurrency(evalRowList, args.concurrency, async (row, i) => {
        const distilled = profiles.get(row.taster_id);
        if (!distilled) {
          perComparison[i].predictions["claude-profile"] = { predicted: null, error: "no distilled profile" };
          return;
        }
        try {
          perComparison[i].predictions["claude-profile"] = await predictWithProfile(args.fastModel, distilled.profile, row);
        } catch (error) {
          console.error(`\n  claude-profile failed on row ${i + 1}: ${error.message}`);
          perComparison[i].predictions["claude-profile"] = { predicted: null, error: String(error) };
        }
        process.stdout.write(`\r  ${++completed}/${evalRowList.length}`);
      });
      process.stdout.write("\n");
    } else if (predictor === "llm" || predictor === "claude") {
      const manual = await fs.readFile(MANUAL_PATH, "utf8");
      let worker;
      if (predictor === "llm") {
        if (!process.env.OPENAI_API_KEY) throw new Error("OPENAI_API_KEY required for the llm predictor");
        const client = new OpenAI();
        console.log(`Running llm predictor (${args.model}, manual as system prompt)...`);
        worker = (row) => predictLlm(client, args.model, manual, row, tasterById);
      } else {
        if (!process.env.ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY required for the claude predictor");
        let crowdStatsByTaster = null;
        if (args.crowdContext) {
          crowdStatsByTaster = new Map();
          const testIndexesByTaster = new Map();
          perComparison.forEach((c) => {
            if (!testIndexesByTaster.has(c.taster_id)) testIndexesByTaster.set(c.taster_id, new Set());
            testIndexesByTaster.get(c.taster_id).add(c.index);
          });
          for (const [tasterId, excludeIndexes] of testIndexesByTaster) {
            crowdStatsByTaster.set(tasterId, buildConsensusStats(rows, excludeIndexes));
          }
        }
        console.log(`Running claude predictor (${args.claudeModel}${args.crowdContext ? " + crowd context" : ""}, manual as cached system prompt)...`);
        worker = (row) => predictClaude(args.claudeModel, manual, row, tasterById, crowdStatsByTaster?.get(row.taster_id) ?? null);
      }
      let completed = 0;
      await mapWithConcurrency(evalRowList, args.concurrency, async (row, i) => {
        try {
          perComparison[i].predictions[predictor] = await worker(row);
        } catch (error) {
          console.error(`\n  ${predictor} failed on row ${i + 1}: ${error.message}`);
          perComparison[i].predictions[predictor] = { predicted: null, error: String(error) };
        }
        process.stdout.write(`\r  ${++completed}/${evalRowList.length}`);
      });
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
    console.log(`  ${s.predictor.padEnd(10)} ${pct.padStart(6)}  (${s.correct}/${s.decided} decided, ${s.abstained_or_failed} abstained/failed, ${s.ground_truth_ties} true ties excluded)`);
  }

  let perTaster = null;
  if (args.holdout > 0) {
    perTaster = {};
    const tasterIds = [...new Set(perComparison.map((c) => c.taster_id))].sort();
    console.log("\nPer-taster accuracy (decided predictions only):\n");
    const header = ["taster".padEnd(12), "test", ...args.predictors.map((p) => p.padStart(10))].join("  ");
    console.log(`  ${header}`);
    for (const tasterId of tasterIds) {
      const outcomes = perComparison.filter((c) => c.taster_id === tasterId);
      const cells = args.predictors.map((name) => {
        const s = summarize(name, outcomes.map((c) => ({ actual: c.actual, predicted: c.predictions[name]?.predicted ?? null })));
        (perTaster[tasterId] ??= {})[name] = s;
        return (s.accuracy == null ? "n/a" : `${s.correct}/${s.decided}`).padStart(10);
      });
      const trainCount = trainRowsByTaster?.get(tasterId)?.length ?? 0;
      console.log(`  ${tasterId.padEnd(12)} ${String(outcomes.length).padStart(4)}  ${cells.join("  ")}   (train ${trainCount})`);
    }
  }

  const latencyStats = {};
  for (const name of args.predictors) {
    const latencies = perComparison
      .map((c) => c.predictions[name]?.latency_ms)
      .filter((v) => typeof v === "number")
      .sort((x, y) => x - y);
    if (latencies.length > 0) {
      latencyStats[name] = {
        p50_ms: latencies[Math.floor(latencies.length / 2)],
        p95_ms: latencies[Math.min(latencies.length - 1, Math.floor(latencies.length * 0.95))],
        n: latencies.length,
      };
      console.log(`\n  ${name} latency: p50 ${latencyStats[name].p50_ms}ms, p95 ${latencyStats[name].p95_ms}ms`);
    }
  }

  const outPath = args.out ?? path.join(EVAL_DIR, "results", `eval-${new Date().toISOString().replace(/[:.]/g, "-")}.json`);
  await fs.mkdir(path.dirname(outPath), { recursive: true });
  await fs.writeFile(
    outPath,
    JSON.stringify({ args: { ...args, limit: evalRowList.length }, summaries, perTaster, latencyStats, perComparison }, null, 2)
  );
  console.log(`\nDetail written to ${path.relative(ROOT, outPath)}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

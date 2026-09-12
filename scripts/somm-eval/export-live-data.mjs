#!/usr/bin/env node
/**
 * Export LIVE in-app tasting signal from prod into somm-eval harness format.
 *
 * READ-ONLY. Every Supabase call in this file is a `.select()` — nothing is
 * written back to prod. Pulls, per taster (a user who has answered at least
 * one post-entry comparison prompt):
 *
 *   - entry_comparison_feedback rows ("did you enjoy this more/less than X?"),
 *     joined to both wine_entries (name, producer, vintage, wine_type,
 *     canonical region/country, primary grapes via entry_primary_grapes, and
 *     rating) → data/live-comparisons.csv, harness CSV shape.
 *   - that user's own rated wine_entries → data/live-tasters.json
 *     logged_wines, same shape.
 *
 * Response → winner mapping: wine_a is always the NEW entry, wine_b is
 * always the COMPARISON entry the user was asked about.
 *   more            → winner=a (preferred the new entry)
 *   less            → winner=b (preferred the comparison entry)
 *   same_or_not_sure → winner=tie
 *
 * taster_id is anonymized to `user-<8charhash>` (sha256 of the real user id,
 * truncated) — stable across runs, not reversible without the DB.
 *
 * Comparisons where EITHER wine lacks both name and producer are skipped —
 * the harness can't describe an unnamed wine, and validate() would reject
 * the row anyway.
 *
 * Usage:
 *   node scripts/somm-eval/export-live-data.mjs
 *
 * Requires .env.local at the repo root with NEXT_PUBLIC_SUPABASE_URL +
 * SUPABASE_SERVICE_ROLE_KEY (same as run-eval.mjs's `engine` predictor).
 */

import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { createHash } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "../..");
const DATA_DIR = path.join(ROOT, "scripts/somm-eval/data");

const WINE_FIELDS = [
  "producer", "name", "vintage", "wine_type", "region", "sub_region",
  "country", "grapes", "classification", "price",
];

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

function anonymizeUserId(userId) {
  return `user-${createHash("sha256").update(userId).digest("hex").slice(0, 8)}`;
}

function toIntOrNull(value) {
  if (value == null) return null;
  const parsed = Number.parseInt(String(value), 10);
  return Number.isFinite(parsed) ? parsed : null;
}

function toFloatOrNull(value) {
  if (value == null) return null;
  const parsed = Number.parseFloat(String(value));
  return Number.isFinite(parsed) ? parsed : null;
}

/** Wine fact fields shared by comparisons.csv wine_a/wine_b and logged_wines. */
function wineFacts(entry, grapesByEntryId) {
  if (!entry) {
    return { producer: null, name: null, vintage: null, wine_type: null, region: null, sub_region: null, country: null, grapes: null, classification: null, price: null };
  }
  return {
    producer: entry.producer ?? null,
    name: entry.wine_name ?? null,
    vintage: toIntOrNull(entry.vintage),
    wine_type: entry.wine_type ?? null,
    region: entry.canonical_region ?? entry.region ?? null,
    sub_region: entry.canonical_sub_region ?? entry.appellation ?? null,
    country: entry.canonical_country ?? entry.country ?? null,
    grapes: grapesByEntryId.get(entry.id) ?? null,
    classification: entry.classification ?? null,
    price: toFloatOrNull(entry.price_paid),
  };
}

function hasNameOrProducer(facts) {
  return Boolean(facts.producer || facts.name);
}

function csvField(value) {
  const str = value == null ? "" : String(value);
  if (/[",\n\r]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function toCsvRow(fields) {
  return fields.map(csvField).join(",");
}

async function fetchGrapesByEntryId(supabase, entryIds) {
  const grapesByEntryId = new Map();
  if (entryIds.length === 0) return grapesByEntryId;

  // Batch — Supabase caps .in() payloads in practice well above what this
  // dataset needs, but chunk defensively for future growth.
  const CHUNK = 200;
  const rows = [];
  for (let i = 0; i < entryIds.length; i += CHUNK) {
    const chunk = entryIds.slice(i, i + CHUNK);
    const { data, error } = await supabase
      .from("entry_primary_grapes")
      .select("entry_id, position, grape_varieties(id, name)")
      .in("entry_id", chunk)
      .order("position", { ascending: true });
    if (error) throw new Error(`entry_primary_grapes query failed: ${error.message}`);
    rows.push(...(data ?? []));
  }

  const namesByEntryId = new Map();
  for (const row of rows) {
    const variety = Array.isArray(row.grape_varieties) ? row.grape_varieties[0] : row.grape_varieties;
    if (!variety?.name) continue;
    const list = namesByEntryId.get(row.entry_id) ?? [];
    list.push(variety.name);
    namesByEntryId.set(row.entry_id, list);
  }
  for (const [entryId, names] of namesByEntryId) {
    grapesByEntryId.set(entryId, names.join(", "));
  }
  return grapesByEntryId;
}

const ENTRY_SELECT =
  "id, wine_name, producer, vintage, wine_type, canonical_region, canonical_sub_region, canonical_country, region, appellation, country, classification, rating, price_paid";

async function main() {
  await loadEnvLocal();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required (.env.local)");
  }
  const supabase = createClient(url, key);

  console.log("Reading entry_comparison_feedback (read-only)...");
  const { data: feedback, error: feedbackError } = await supabase
    .from("entry_comparison_feedback")
    .select(
      `id, user_id, response, created_at,
       new_entry:wine_entries!entry_comparison_feedback_new_entry_id_fkey(${ENTRY_SELECT}),
       comparison_entry:wine_entries!entry_comparison_feedback_comparison_entry_id_fkey(${ENTRY_SELECT})`
    )
    .order("created_at", { ascending: true });
  if (feedbackError) throw new Error(`entry_comparison_feedback query failed: ${feedbackError.message}`);

  const tasterUserIds = [...new Set((feedback ?? []).map((row) => row.user_id))];
  console.log(`Loaded ${feedback.length} comparison rows across ${tasterUserIds.length} tasters.`);

  console.log("Reading rated wine_entries for those tasters (read-only)...");
  const { data: loggedEntries, error: loggedError } = await supabase
    .from("wine_entries")
    .select(`${ENTRY_SELECT}, user_id, notes`)
    .in("user_id", tasterUserIds)
    .not("rating", "is", null)
    .order("created_at", { ascending: false });
  if (loggedError) throw new Error(`wine_entries query failed: ${loggedError.message}`);
  console.log(`Loaded ${loggedEntries.length} rated entries.`);

  // ── Primary grapes — one join query for every entry we might describe ──
  const entryIds = new Set();
  for (const row of feedback) {
    if (row.new_entry?.id) entryIds.add(row.new_entry.id);
    if (row.comparison_entry?.id) entryIds.add(row.comparison_entry.id);
  }
  for (const entry of loggedEntries) entryIds.add(entry.id);
  const grapesByEntryId = await fetchGrapesByEntryId(supabase, [...entryIds]);

  // ── tasters.json ─────────────────────────────────────────────────────
  const anonById = new Map(tasterUserIds.map((id) => [id, anonymizeUserId(id)]));
  const loggedByUser = new Map();
  for (const entry of loggedEntries) {
    const list = loggedByUser.get(entry.user_id) ?? [];
    const facts = wineFacts(entry, grapesByEntryId);
    list.push({ ...facts, rating: entry.rating, notes: entry.notes ?? null });
    loggedByUser.set(entry.user_id, list);
  }

  const tasters = tasterUserIds.map((userId) => ({
    taster_id: anonById.get(userId),
    logged_wines: loggedByUser.get(userId) ?? [],
  }));

  // ── comparisons.csv ──────────────────────────────────────────────────
  const header = [
    "taster_id", "tasting_date", "blind", "food_context", "winner", "strength", "notes",
    ...WINE_FIELDS.map((f) => `wine_a_${f}`),
    ...WINE_FIELDS.map((f) => `wine_b_${f}`),
  ];
  const csvRows = [toCsvRow(header)];
  let skipped = 0;
  for (const row of feedback) {
    const wineA = wineFacts(row.new_entry, grapesByEntryId);
    const wineB = wineFacts(row.comparison_entry, grapesByEntryId);
    if (!hasNameOrProducer(wineA) || !hasNameOrProducer(wineB)) {
      skipped += 1;
      continue;
    }
    const winner = row.response === "more" ? "a" : row.response === "less" ? "b" : "tie";
    const fields = [
      anonById.get(row.user_id),
      row.created_at ? row.created_at.slice(0, 10) : "",
      // Post-entry "did you like this more/less" prompts are NOT blind
      // tastings — the taster knows exactly what they're drinking.
      "n",
      "",
      winner,
      "",
      "",
      ...WINE_FIELDS.map((f) => wineA[f]),
      ...WINE_FIELDS.map((f) => wineB[f]),
    ];
    csvRows.push(toCsvRow(fields));
  }

  await fs.mkdir(DATA_DIR, { recursive: true });
  const tastersPath = path.join(DATA_DIR, "live-tasters.json");
  const comparisonsPath = path.join(DATA_DIR, "live-comparisons.csv");
  await fs.writeFile(tastersPath, JSON.stringify(tasters, null, 2));
  await fs.writeFile(comparisonsPath, csvRows.join("\n") + "\n");

  const ratingCounts = tasters.map((t) => t.logged_wines.length);
  console.log(`\nWrote ${path.relative(ROOT, tastersPath)} — ${tasters.length} tasters, ${ratingCounts.reduce((a, b) => a + b, 0)} logged wines (min ${Math.min(...ratingCounts)}, max ${Math.max(...ratingCounts)} per taster).`);
  console.log(`Wrote ${path.relative(ROOT, comparisonsPath)} — ${csvRows.length - 1} comparisons (${skipped} skipped: missing name+producer on one side).`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

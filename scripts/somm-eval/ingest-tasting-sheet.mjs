#!/usr/bin/env node
/**
 * Bulk-uploads a Tasting Night paper score sheet into real CellarSnap
 * accounts: one wine_entries row per taster per rated wine, plus
 * entry_comparison_feedback rows for every head-to-head outcome.
 *
 * Input is the Tasting Night workbook (built by build-tasting-score-sheet.py)
 * with its "Wine Log" and "Score Sheet" tabs, read with read-excel-file
 * (pure JS, already a dependency) — or CSV exports of the two tabs via
 * --wine-log= / --score-sheet= (parsed with papaparse).
 *
 * Protocol recap (labels-visible, paper on the night, bulk upload after):
 * each taster rates BOTH wines of a pairing 1-100, picks a winner (ties
 * allowed), and gives a short "why" (mapped to notes). Every bottle is in
 * the Wine Log with price; ringers have price hidden from tasters on the
 * night but recorded in the log (and therefore in the entries).
 *
 * What gets written per taster (only in --apply):
 *   - wine_entries: one row PER RATED WINE, deduped on
 *     (user, wine_name, producer, vintage, consumed_at) — a wine rated twice
 *     by the same taster (deliberate repeat pairs) UPDATES the existing row
 *     (last rating wins, "why" notes are merged) instead of duplicating.
 *     Columns written (all verified against supabase/sql migrations and
 *     src/server/entries/schema.ts): wine_name, producer, vintage, country,
 *     region, wine_type, rating, notes, price_paid (+ price_paid_currency
 *     'usd' + price_paid_source 'retail' — the DB check constraint requires
 *     all three together), consumed_at, entry_status 'consumed',
 *     is_feed_visible false, entry_privacy 'private' (same defaults as the
 *     CellarTracker bulk import).
 *   - entry_primary_grapes: grapes from the Wine Log are resolved against
 *     grape_varieties.name then grape_aliases.alias_normalized (the app's own
 *     lookup order) and linked, up to 3, best-effort.
 *   - entry_comparison_feedback: new_entry = wine A's entry, comparison_entry
 *     = wine B's entry; response is from the NEW entry's point of view
 *     (confirmed against EntryWineComparisonModal + palateDistillation):
 *     winner A -> 'more', winner B -> 'less', tie -> 'same_or_not_sure'.
 *
 * KNOWN LIMITATION — unique(new_entry_id) on entry_comparison_feedback:
 * the table allows at most ONE comparison row per new_entry_id (it was built
 * for the single post-save prompt). A tasting night produces several
 * comparisons per taster, so if wine A's entry has already been used as
 * new_entry (repeat pair, or the same wine appearing as "A" in two
 * pairings), this script FLIPS the row — new_entry = wine B's entry with the
 * response inverted ('more' <-> 'less', tie unchanged), which encodes the
 * identical preference. If BOTH entries are already used as new_entry, the
 * comparison is DROPPED and reported. With 6 distinct pairings + 1-2 repeat
 * pairs per taster the flip absorbs almost everything; dropped rows mean the
 * schema needs a follow-up migration (drop the unique constraint or add a
 * tasting_comparisons table) before the signal can be stored losslessly.
 *
 * DRY-RUN IS THE DEFAULT and makes zero network/DB calls: it parses,
 * validates, dedupes, and prints the full plan (N entries / N comparisons
 * per user, flips, drops). Only --apply touches Supabase. There is
 * deliberately NO delete/wipe functionality in this script.
 *
 * Usage:
 *   node scripts/somm-eval/ingest-tasting-sheet.mjs \
 *     --sheet=~/Downloads/Cluster_Tasting3_Predictions.xlsx \
 *     --mapping=scripts/somm-eval/data/tasting3-mapping.json \
 *     [--date=2026-07-12] [--apply]
 *
 *   # or from CSV exports of the two tabs:
 *   node scripts/somm-eval/ingest-tasting-sheet.mjs \
 *     --wine-log=wine-log.csv --score-sheet=score-sheet.csv \
 *     --mapping=mapping.json
 *
 * mapping.json maps sheet taster names to auth user ids:
 *   { "Eitan": "8f14e45f-...", "Nico": "..." }
 * Tasters on the sheet with no mapping entry are skipped (reported).
 *
 * --apply requires .env.local at the repo root (read automatically) with
 * NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY.
 */

import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "../..");

const WINE_TYPE_VALUES = new Set(["red", "white", "rose", "sparkling", "sweet", "orange"]);
const WINE_TYPE_ALIASES = { "rosé": "rose", dessert: "sweet", fortified: "sweet" };

function usage(message) {
  if (message) console.error(`Error: ${message}\n`);
  console.error(
    "Usage: node scripts/somm-eval/ingest-tasting-sheet.mjs --sheet=<xlsx> --mapping=<json> [--date=YYYY-MM-DD] [--apply]\n" +
      "       (or --wine-log=<csv> --score-sheet=<csv> instead of --sheet=)"
  );
  process.exit(1);
}

function parseArgs(argv) {
  const args = {
    sheet: null,
    wineLogCsv: null,
    scoreSheetCsv: null,
    mapping: null,
    date: new Date().toISOString().slice(0, 10),
    apply: false,
  };
  for (const arg of argv) {
    if (arg === "--apply") args.apply = true;
    else if (arg.startsWith("--sheet=")) args.sheet = expandPath(arg.slice(8));
    else if (arg.startsWith("--wine-log=")) args.wineLogCsv = expandPath(arg.slice(11));
    else if (arg.startsWith("--score-sheet=")) args.scoreSheetCsv = expandPath(arg.slice(14));
    else if (arg.startsWith("--mapping=")) args.mapping = expandPath(arg.slice(10));
    else if (arg.startsWith("--date=")) args.date = arg.slice(7);
    else usage(`Unknown argument: ${arg}`);
  }
  if (!args.mapping) usage("--mapping= is required");
  if (!args.sheet && !(args.wineLogCsv && args.scoreSheetCsv)) {
    usage("Provide --sheet=<xlsx>, or both --wine-log=<csv> and --score-sheet=<csv>");
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(args.date)) usage("--date must be YYYY-MM-DD");
  return args;
}

function expandPath(p) {
  const expanded = p.startsWith("~/") ? path.join(process.env.HOME ?? "", p.slice(2)) : p;
  return path.resolve(expanded);
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

// ---------------------------------------------------------------------------
// Input parsing — xlsx (read-excel-file) or CSV (papaparse), both to
// [headerRow, ...rows] arrays of raw cell values.
// ---------------------------------------------------------------------------

async function readTabs(args) {
  if (args.sheet) {
    const { readSheet } = await import("read-excel-file/node");
    const [wineLog, scoreSheet] = await Promise.all([
      readSheet(args.sheet, "Wine Log"),
      readSheet(args.sheet, "Score Sheet"),
    ]);
    return { wineLog, scoreSheet, source: `xlsx ${args.sheet}` };
  }
  const Papa = (await import("papaparse")).default;
  const parseCsv = async (csvPath) => {
    const text = await fs.readFile(csvPath, "utf8");
    const result = Papa.parse(text.trim(), { skipEmptyLines: true });
    if (result.errors.length > 0) {
      throw new Error(`CSV parse failed for ${csvPath}: ${result.errors[0].message}`);
    }
    return result.data;
  };
  return {
    wineLog: await parseCsv(args.wineLogCsv),
    scoreSheet: await parseCsv(args.scoreSheetCsv),
    source: `csv ${args.wineLogCsv} + ${args.scoreSheetCsv}`,
  };
}

function cellText(value) {
  if (value == null) return null;
  const text = String(value).trim();
  return text.length > 0 ? text : null;
}

function cellNumber(value) {
  if (value == null || value === "") return null;
  const parsed = Number(String(value).replace(/[$,]/g, "").trim());
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeWineType(value) {
  const text = cellText(value)?.toLowerCase();
  if (!text) return null;
  const mapped = WINE_TYPE_ALIASES[text] ?? text;
  return WINE_TYPE_VALUES.has(mapped) ? mapped : null;
}

function headerIndex(headerRow, name) {
  const needle = name.toLowerCase();
  return headerRow.findIndex((h) => cellText(h)?.toLowerCase().startsWith(needle));
}

function parseWineLog(rows) {
  const [header, ...body] = rows;
  const col = {
    number: headerIndex(header, "#"),
    producer: headerIndex(header, "producer"),
    name: headerIndex(header, "name"),
    vintage: headerIndex(header, "vintage"),
    wineType: headerIndex(header, "wine type"),
    country: headerIndex(header, "country"),
    region: headerIndex(header, "region"),
    grapes: headerIndex(header, "grapes"),
    price: headerIndex(header, "price"),
    ringer: headerIndex(header, "ringer"),
  };
  for (const [key, idx] of Object.entries(col)) {
    if (idx === -1) throw new Error(`Wine Log tab is missing the "${key}" column`);
  }
  const wines = new Map();
  for (const row of body) {
    const number = cellText(row[col.number]);
    if (!number) continue;
    const wine = {
      number,
      producer: cellText(row[col.producer]),
      name: cellText(row[col.name]),
      vintage: cellText(row[col.vintage]),
      wine_type: normalizeWineType(row[col.wineType]),
      country: cellText(row[col.country]),
      region: cellText(row[col.region]),
      grapes: cellText(row[col.grapes]),
      price: cellNumber(row[col.price]),
      ringer: /^y/i.test(cellText(row[col.ringer]) ?? ""),
    };
    if (!wine.name && !wine.producer) continue; // archetype row never purchased/filled
    wines.set(number, wine);
  }
  return wines;
}

function parseScoreSheet(rows) {
  const [header, ...body] = rows;
  const col = {
    taster: headerIndex(header, "taster"),
    pairing: headerIndex(header, "pairing"),
    wineA: headerIndex(header, "wine a"),
    wineB: headerIndex(header, "wine b"),
    ratingA: headerIndex(header, "rating a"),
    ratingB: headerIndex(header, "rating b"),
    winner: headerIndex(header, "winner"),
    why: headerIndex(header, "why"),
  };
  for (const [key, idx] of Object.entries(col)) {
    if (idx === -1) throw new Error(`Score Sheet tab is missing the "${key}" column`);
  }
  const entries = [];
  for (const row of body) {
    const taster = cellText(row[col.taster]);
    const wineA = cellText(row[col.wineA]);
    const wineB = cellText(row[col.wineB]);
    if (!taster || (!wineA && !wineB)) continue; // blank / protocol-note rows
    entries.push({
      taster,
      pairing: cellText(row[col.pairing]),
      wineA,
      wineB,
      ratingA: cellNumber(row[col.ratingA]),
      ratingB: cellNumber(row[col.ratingB]),
      winner: cellText(row[col.winner])?.toLowerCase().replace(/^#/, "") ?? null,
      why: cellText(row[col.why]),
    });
  }
  return entries;
}

// ---------------------------------------------------------------------------
// Plan building — pure, no I/O. Turns sheet rows into per-user entry upserts
// and comparison inserts, with all dedupe decisions made up front.
// ---------------------------------------------------------------------------

function validRating(value, context, problems) {
  if (value === null) return null;
  if (!Number.isInteger(value) || value < 1 || value > 100) {
    problems.push(`${context}: rating ${value} is not an integer in 1-100 — skipped that rating`);
    return null;
  }
  return value;
}

function buildPlan({ wines, scoreRows, mapping, consumedAt }) {
  const problems = [];
  const skippedTasters = new Set();
  const plans = new Map(); // taster -> { userId, entries: Map<wineNumber, entry>, comparisons: [] }

  for (const [index, row] of scoreRows.entries()) {
    const rowLabel = `Score Sheet row ${index + 2} (${row.taster} ${row.pairing ?? ""})`.trim();
    const userId = mapping[row.taster];
    if (!userId) {
      skippedTasters.add(row.taster);
      continue;
    }

    let plan = plans.get(row.taster);
    if (!plan) {
      plan = { userId, entries: new Map(), comparisons: [] };
      plans.set(row.taster, plan);
    }

    const resolveWine = (num, label) => {
      if (!num) return null;
      const wine = wines.get(num);
      if (!wine) problems.push(`${rowLabel}: wine ${label} #${num} not found in Wine Log — row skipped`);
      return wine ?? null;
    };
    const wineA = resolveWine(row.wineA, "A");
    const wineB = resolveWine(row.wineB, "B");
    if ((row.wineA && !wineA) || (row.wineB && !wineB)) continue;

    const upsertEntry = (wine, rating) => {
      if (!wine) return null;
      const existing = plan.entries.get(wine.number);
      const validatedRating = validRating(rating, rowLabel, problems);
      if (existing) {
        // Repeat pair: update, don't duplicate. Last rating wins; whys merge.
        if (validatedRating !== null) existing.rating = validatedRating;
        if (row.why && !existing.whys.includes(row.why)) existing.whys.push(row.why);
        return existing;
      }
      const entry = {
        wine,
        rating: validatedRating,
        whys: row.why ? [row.why] : [],
        consumed_at: consumedAt,
      };
      plan.entries.set(wine.number, entry);
      return entry;
    };

    const entryA = upsertEntry(wineA, row.ratingA);
    const entryB = upsertEntry(wineB, row.ratingB);

    if (entryA && entryB && wineA.number !== wineB.number) {
      let response = null;
      if (row.winner === "tie") response = "same_or_not_sure";
      else if (row.winner === wineA.number.toLowerCase()) response = "more";
      else if (row.winner === wineB.number.toLowerCase()) response = "less";
      else if (row.winner) {
        problems.push(`${rowLabel}: winner "${row.winner}" matches neither wine # nor 'tie' — comparison skipped`);
      }
      if (response) {
        plan.comparisons.push({
          pairing: row.pairing,
          wineA: wineA.number,
          wineB: wineB.number,
          response,
        });
      }
    } else if (entryA && entryB && wineA.number === wineB.number) {
      problems.push(`${rowLabel}: wine A and wine B are the same bottle — comparison skipped`);
    }
  }

  // Resolve the unique(new_entry_id) constraint per taster: each entry may be
  // new_entry at most once. Flip (invert response) when A is taken; drop when
  // both are taken.
  const INVERT = { more: "less", less: "more", same_or_not_sure: "same_or_not_sure" };
  for (const [taster, plan] of plans) {
    const usedAsNew = new Set();
    const resolved = [];
    for (const cmp of plan.comparisons) {
      if (!usedAsNew.has(cmp.wineA)) {
        usedAsNew.add(cmp.wineA);
        resolved.push({ ...cmp, newWine: cmp.wineA, comparisonWine: cmp.wineB, flipped: false });
      } else if (!usedAsNew.has(cmp.wineB)) {
        usedAsNew.add(cmp.wineB);
        resolved.push({
          ...cmp,
          newWine: cmp.wineB,
          comparisonWine: cmp.wineA,
          response: INVERT[cmp.response],
          flipped: true,
        });
      } else {
        problems.push(
          `${taster} ${cmp.pairing ?? ""}: both #${cmp.wineA} and #${cmp.wineB} already used as ` +
            `new_entry (unique constraint) — comparison DROPPED`
        );
        resolved.push({ ...cmp, dropped: true });
      }
    }
    plan.comparisons = resolved;
  }

  return { plans, problems, skippedTasters };
}

function wineLabel(wine) {
  return [wine.producer, wine.name, wine.vintage].filter(Boolean).join(" ") || `#${wine.number}`;
}

function entryRowFor(userId, entry) {
  const wine = entry.wine;
  const row = {
    user_id: userId,
    wine_name: wine.name ?? wine.producer,
    producer: wine.producer,
    vintage: wine.vintage,
    country: wine.country,
    region: wine.region,
    wine_type: wine.wine_type,
    rating: entry.rating,
    notes: entry.whys.length > 0 ? entry.whys.join("; ") : null,
    consumed_at: entry.consumed_at,
    entry_status: "consumed",
    is_feed_visible: false,
    entry_privacy: "private",
  };
  if (wine.price !== null) {
    // The DB check constraint requires price, currency, and source together.
    row.price_paid = wine.price;
    row.price_paid_currency = "usd";
    row.price_paid_source = "retail";
  }
  return row;
}

function printPlan({ plans, problems, skippedTasters, source, apply }) {
  console.log(`Source: ${source}`);
  console.log(`Mode:   ${apply ? "APPLY (writing to Supabase)" : "dry-run (no DB access, nothing written)"}\n`);

  let totalEntries = 0;
  let totalComparisons = 0;
  let totalFlipped = 0;
  let totalDropped = 0;

  for (const [taster, plan] of plans) {
    const active = plan.comparisons.filter((c) => !c.dropped);
    const flipped = active.filter((c) => c.flipped);
    const dropped = plan.comparisons.filter((c) => c.dropped);
    totalEntries += plan.entries.size;
    totalComparisons += active.length;
    totalFlipped += flipped.length;
    totalDropped += dropped.length;

    console.log(`${taster} (${plan.userId})`);
    console.log(`  ${plan.entries.size} entries:`);
    for (const entry of plan.entries.values()) {
      const bits = [
        `#${entry.wine.number} ${wineLabel(entry.wine)}`,
        entry.rating !== null ? `rating ${entry.rating}` : "no rating",
        entry.wine.price !== null ? `$${entry.wine.price}` : "no price",
      ];
      if (entry.wine.ringer) bits.push("RINGER");
      if (entry.whys.length > 0) bits.push(`why: "${entry.whys.join("; ")}"`);
      console.log(`    - ${bits.join(" | ")}`);
    }
    console.log(`  ${active.length} comparisons (${flipped.length} flipped, ${dropped.length} dropped):`);
    for (const cmp of active) {
      const flip = cmp.flipped ? " [flipped]" : "";
      console.log(
        `    - ${cmp.pairing ?? "free"}: new=#${cmp.newWine} vs #${cmp.comparisonWine} -> ${cmp.response}${flip}`
      );
    }
    console.log("");
  }

  if (skippedTasters.size > 0) {
    console.log(`Tasters skipped (no entry in mapping.json): ${[...skippedTasters].join(", ")}\n`);
  }
  if (problems.length > 0) {
    console.log("Problems:");
    for (const problem of problems) console.log(`  ! ${problem}`);
    console.log("");
  }
  console.log(
    `TOTAL: ${totalEntries} entries, ${totalComparisons} comparisons ` +
      `(${totalFlipped} flipped for the unique constraint, ${totalDropped} dropped) ` +
      `across ${plans.size} tasters`
  );
}

// ---------------------------------------------------------------------------
// Apply — the only code path that touches Supabase. Upserts entries (update
// on the dedupe key, insert otherwise), links grapes, inserts comparisons.
// No deletes anywhere.
// ---------------------------------------------------------------------------

function normalizeGrapeQuery(value) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

async function resolveGrapeIds(supabase, grapesText, cache) {
  if (!grapesText) return [];
  const names = grapesText.split(/[,;/]+/).map((g) => g.trim()).filter(Boolean).slice(0, 3);
  const ids = [];
  for (const name of names) {
    const cacheKey = name.toLowerCase();
    if (cache.has(cacheKey)) {
      const cached = cache.get(cacheKey);
      if (cached) ids.push(cached);
      continue;
    }
    // Same lookup order as the app: grape_varieties.name, then alias_normalized.
    const { data: byName } = await supabase
      .from("grape_varieties")
      .select("id")
      .ilike("name", name)
      .limit(1)
      .maybeSingle();
    let varietyId = byName?.id ?? null;
    if (!varietyId) {
      const { data: byAlias } = await supabase
        .from("grape_aliases")
        .select("variety_id")
        .ilike("alias_normalized", normalizeGrapeQuery(name))
        .limit(1)
        .maybeSingle();
      varietyId = byAlias?.variety_id ?? null;
    }
    cache.set(cacheKey, varietyId);
    if (varietyId) ids.push(varietyId);
  }
  return [...new Set(ids)];
}

async function applyPlan({ plans, problems }) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error(
      "--apply requires NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (via .env.local at the repo root)"
    );
  }
  const { createClient } = await import("@supabase/supabase-js");
  const supabase = createClient(url, key);
  const grapeCache = new Map();

  let inserted = 0;
  let updated = 0;
  let comparisonsInserted = 0;
  let comparisonsSkippedExisting = 0;

  for (const [taster, plan] of plans) {
    const entryIdByWineNumber = new Map();

    for (const entry of plan.entries.values()) {
      const row = entryRowFor(plan.userId, entry);

      // Dedupe key: same taster, same bottle, same tasting date. Re-running
      // --apply updates in place instead of duplicating.
      let query = supabase
        .from("wine_entries")
        .select("id")
        .eq("user_id", plan.userId)
        .eq("consumed_at", entry.consumed_at)
        .limit(1);
      for (const field of ["wine_name", "producer", "vintage"]) {
        query = row[field] === null ? query.is(field, null) : query.eq(field, row[field]);
      }
      const { data: existing, error: lookupError } = await query.maybeSingle();
      if (lookupError) throw new Error(`${taster}: entry lookup failed: ${lookupError.message}`);

      let entryId;
      if (existing) {
        const { error } = await supabase.from("wine_entries").update(row).eq("id", existing.id);
        if (error) throw new Error(`${taster}: entry update failed: ${error.message}`);
        entryId = existing.id;
        updated += 1;
      } else {
        const { data, error } = await supabase.from("wine_entries").insert(row).select("id").single();
        if (error) throw new Error(`${taster}: entry insert failed: ${error.message}`);
        entryId = data.id;
        inserted += 1;
      }
      entryIdByWineNumber.set(entry.wine.number, entryId);

      const grapeIds = await resolveGrapeIds(supabase, entry.wine.grapes, grapeCache);
      if (grapeIds.length > 0) {
        const { error } = await supabase.from("entry_primary_grapes").upsert(
          grapeIds.map((varietyId, index) => ({
            entry_id: entryId,
            variety_id: varietyId,
            position: index + 1,
          })),
          { onConflict: "entry_id,position", ignoreDuplicates: true }
        );
        if (error) problems.push(`${taster} #${entry.wine.number}: grape linking failed: ${error.message}`);
      }
    }

    for (const cmp of plan.comparisons) {
      if (cmp.dropped) continue;
      const newEntryId = entryIdByWineNumber.get(cmp.newWine);
      const comparisonEntryId = entryIdByWineNumber.get(cmp.comparisonWine);
      if (!newEntryId || !comparisonEntryId) continue;
      const { error } = await supabase.from("entry_comparison_feedback").insert({
        user_id: plan.userId,
        new_entry_id: newEntryId,
        comparison_entry_id: comparisonEntryId,
        response: cmp.response,
      });
      if (error) {
        if (error.code === "23505") {
          // unique(new_entry_id) — already recorded (e.g. re-run). Skip.
          comparisonsSkippedExisting += 1;
        } else {
          throw new Error(`${taster}: comparison insert failed: ${error.message}`);
        }
      } else {
        comparisonsInserted += 1;
      }
    }
  }

  console.log(
    `\nAPPLIED: ${inserted} entries inserted, ${updated} updated, ` +
      `${comparisonsInserted} comparisons inserted, ${comparisonsSkippedExisting} already existed`
  );
}

// ---------------------------------------------------------------------------

async function main() {
  const args = parseArgs(process.argv.slice(2));

  const mappingRaw = JSON.parse(await fs.readFile(args.mapping, "utf8"));
  if (typeof mappingRaw !== "object" || mappingRaw === null || Array.isArray(mappingRaw)) {
    throw new Error("mapping.json must be an object of { \"TasterName\": \"user-uuid\" }");
  }
  for (const [name, id] of Object.entries(mappingRaw)) {
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
      throw new Error(`mapping.json: "${name}" maps to "${id}", which is not a UUID`);
    }
  }

  const { wineLog, scoreSheet, source } = await readTabs(args);
  const wines = parseWineLog(wineLog);
  const scoreRows = parseScoreSheet(scoreSheet);
  if (wines.size === 0) throw new Error("Wine Log has no filled-in wines (name/producer all blank)");
  if (scoreRows.length === 0) throw new Error("Score Sheet has no data rows");

  const { plans, problems, skippedTasters } = buildPlan({
    wines,
    scoreRows,
    mapping: mappingRaw,
    consumedAt: args.date,
  });

  printPlan({ plans, problems, skippedTasters, source, apply: args.apply });

  if (args.apply) {
    await loadEnvLocal();
    await applyPlan({ plans, problems });
  } else {
    console.log("\nDry-run complete. Re-run with --apply to write.");
  }
}

main().catch((error) => {
  console.error(`FAILED: ${error.message}`);
  process.exit(1);
});

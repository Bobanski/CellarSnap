import { NextResponse } from "next/server";
import { z } from "zod";
import { RequestAuthError, requireRequestAuth } from "@/server/auth/requestAuth";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import Papa from "papaparse";
import { enrichImportedEntries } from "@/server/algorithm/enrichImportedEntries";

const MAX_ENTRIES = 500;

const requestSchema = z.object({
  ct_username: z.string().min(1),
  ct_password: z.string().min(1),
});

const CT_LIST_MAPPING: Record<string, string> = {
  Wine: "wine_name",
  Vintage: "vintage",
  Quantity: "cellar_quantity",
  Size: "bottle_format",
  Locale: "region",
  Country: "country",
  Region: "appellation",
  Type: "wine_type",
  Varietal: "varietal",
  Price: "price_paid",
  Producer: "producer",
  // Custom fields
  CT: "custom",
  MY: "custom",
  Community: "custom",
  "Drink starting": "custom",
  "Drink by": "custom",
  Location: "custom",
  Bin: "custom",
};

const CT_CUSTOM_FIELD_LABELS: Record<string, string> = {
  CT: "CT Score",
  MY: "My Score",
  Community: "Community Score",
  "Drink starting": "Drink Starting",
  "Drink by": "Drink By",
  Location: "Location",
  Bin: "Bin",
};

const CT_CUSTOM_FIELD_TYPES: Record<string, string> = {
  CT: "number",
  MY: "number",
  Community: "number",
  "Drink starting": "text",
  "Drink by": "text",
  Location: "text",
  Bin: "text",
};

const VALID_WINE_TYPES = new Set([
  "red",
  "white",
  "rose",
  "rosé",
  "sparkling",
  "orange",
  "sweet",
]);

const CT_SIZE_MAP: Record<string, string> = {
  "375 ml": "375ml",
  "750 ml": "750ml",
  "1500 ml": "1.5L",
  "3000 ml": "3L",
  "5000 ml": "5L",
  "6000 ml": "6L",
};

const CT_TYPE_MAP: Record<string, string> = {
  red: "red",
  white: "white",
  rosé: "rose",
  rose: "rose",
  sparkling: "sparkling",
  "dessert/fortified": "sweet",
};

function normalizeGrapeQuery(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function getField(
  row: Record<string, string>,
  ctColumn: string
): string | null {
  const value = row[ctColumn]?.trim();
  return value && value.length > 0 ? value : null;
}

async function fetchCTData(
  username: string,
  password: string,
  table: string
): Promise<{ ok: boolean; data?: string; error?: string }> {
  const url = new URL("https://www.cellartracker.com/xlquery.asp");
  url.searchParams.set("User", username);
  url.searchParams.set("Password", password);
  url.searchParams.set("Format", "csv");
  url.searchParams.set("Table", table);
  if (table === "List") {
    url.searchParams.set("Location", "1");
  }

  const response = await fetch(url.toString());

  if (!response.ok) {
    return {
      ok: false,
      error: `CellarTracker returned status ${response.status} for ${table}`,
    };
  }

  const text = await response.text();

  if (
    !text ||
    text.trim().length === 0 ||
    text.includes("Invalid credentials") ||
    text.includes("Not authorized")
  ) {
    return {
      ok: false,
      error: `CellarTracker authentication failed or returned empty data for ${table}`,
    };
  }

  return { ok: true, data: text };
}

function parseCsv(
  csvText: string
): { data: Record<string, string>[]; errors: string[] } {
  const result = Papa.parse<Record<string, string>>(csvText, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (h: string) => h.trim(),
  });

  const parseErrors = result.errors
    .filter((e: { type: string }) => e.type !== "FieldMismatch")
    .map((e: { row?: number; message?: string }) => `CSV parse error row ${e.row}: ${e.message}`);

  return { data: result.data, errors: parseErrors };
}

export async function POST(request: Request) {
  let auth;
  try {
    auth = await requireRequestAuth(request);
  } catch (error) {
    if (error instanceof RequestAuthError) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    throw error;
  }

  const { supabase, user } = auth;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = requestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const { ct_username, ct_password } = parsed.data;
  const errors: string[] = [];

  // --- Fetch cellar data and tasting notes from CellarTracker ---
  const [listResult, notesResult] = await Promise.all([
    fetchCTData(ct_username, ct_password, "List"),
    fetchCTData(ct_username, ct_password, "Notes"),
  ]);

  if (!listResult.ok && !notesResult.ok) {
    return NextResponse.json(
      {
        error:
          listResult.error ??
          notesResult.error ??
          "Failed to fetch data from CellarTracker",
      },
      { status: 400 }
    );
  }

  // --- Parse CSVs ---
  let listRows: Record<string, string>[] = [];
  let notesRows: Record<string, string>[] = [];

  if (listResult.ok && listResult.data) {
    const parsed = parseCsv(listResult.data);
    listRows = parsed.data.slice(0, MAX_ENTRIES);
    errors.push(...parsed.errors);
  }

  if (notesResult.ok && notesResult.data) {
    const parsed = parseCsv(notesResult.data);
    notesRows = parsed.data.slice(0, MAX_ENTRIES);
    errors.push(...parsed.errors);
  }

  if (listRows.length === 0 && notesRows.length === 0) {
    return NextResponse.json(
      { error: "No wine data found in CellarTracker export" },
      { status: 400 }
    );
  }

  // --- Grape matching (using admin client, no RLS) ---
  const adminSupabase = createSupabaseAdminClient();
  const grapeIdByName = new Map<string, string>();

  const uniqueGrapes = new Set<string>();
  for (const row of listRows) {
    const val = getField(row, "Varietal");
    if (val) uniqueGrapes.add(val);
  }
  for (const row of notesRows) {
    const val = getField(row, "Varietal");
    if (val) uniqueGrapes.add(val);
  }

  if (uniqueGrapes.size > 0) {
    for (const grape of uniqueGrapes) {
      const { data: byName } = await adminSupabase
        .from("grape_varieties")
        .select("id, name")
        .ilike("name", grape)
        .limit(1)
        .maybeSingle();

      if (byName) {
        grapeIdByName.set(grape.toLowerCase(), byName.id);
        continue;
      }

      const normalizedGrape = normalizeGrapeQuery(grape);
      const { data: aliasRow } = await adminSupabase
        .from("grape_aliases")
        .select("variety_id")
        .ilike("alias_normalized", normalizedGrape)
        .limit(1)
        .maybeSingle();

      if (aliasRow) {
        grapeIdByName.set(grape.toLowerCase(), aliasRow.variety_id);
      }
    }
  }

  // --- Duplicate detection ---
  const { data: existingEntries } = await supabase
    .from("wine_entries")
    .select("id, wine_name, producer, vintage")
    .eq("user_id", user.id);

  const existingKeySet = new Set<string>();
  for (const entry of existingEntries ?? []) {
    const key = [
      (entry.wine_name ?? "").toLowerCase().trim(),
      (entry.producer ?? "").toLowerCase().trim(),
      (entry.vintage ?? "").toLowerCase().trim(),
    ].join("|");
    existingKeySet.add(key);
  }

  // --- Process cellar wines (List) ---
  const cellarInserts: Record<string, unknown>[] = [];
  const cellarGrapeIds: (string | null)[] = [];
  const cellarCustomValues: {
    rowIndex: number;
    ctColumn: string;
    value: string;
  }[] = [];
  let duplicateCount = 0;

  for (const row of listRows) {
    const wineName = getField(row, "Wine");
    const producer = getField(row, "Producer");
    const vintage = getField(row, "Vintage");

    // Duplicate check
    const dupeKey = [
      (wineName ?? "").toLowerCase().trim(),
      (producer ?? "").toLowerCase().trim(),
      (vintage ?? "").toLowerCase().trim(),
    ].join("|");

    if (existingKeySet.has(dupeKey)) {
      duplicateCount++;
      continue;
    }
    // Add to set so we don't import duplicates within the batch
    existingKeySet.add(dupeKey);

    const rawType = getField(row, "Type");
    const wineType =
      rawType && CT_TYPE_MAP[rawType.toLowerCase()]
        ? CT_TYPE_MAP[rawType.toLowerCase()]
        : rawType && VALID_WINE_TYPES.has(rawType.toLowerCase())
          ? rawType.toLowerCase()
          : null;

    const rawSize = getField(row, "Size");
    const bottleFormat =
      rawSize && CT_SIZE_MAP[rawSize]
        ? CT_SIZE_MAP[rawSize]
        : "750ml";

    const rawQuantity = getField(row, "Quantity");
    const cellarQuantity =
      rawQuantity &&
      Number.isFinite(Number(rawQuantity)) &&
      Number(rawQuantity) > 0
        ? Math.floor(Number(rawQuantity))
        : 1;

    const rawPrice = getField(row, "Price");
    const pricePaid =
      rawPrice &&
      Number.isFinite(Number(rawPrice)) &&
      Number(rawPrice) >= 0
        ? Number(rawPrice)
        : null;

    const rawVarietal = getField(row, "Varietal");
    const grapeId = rawVarietal
      ? grapeIdByName.get(rawVarietal.toLowerCase()) ?? null
      : null;
    cellarGrapeIds.push(grapeId);

    const entryRow: Record<string, unknown> = {
      user_id: user.id,
      wine_name: wineName,
      producer,
      vintage,
      country: getField(row, "Country"),
      region: getField(row, "Locale"),
      appellation: getField(row, "Region"),
      wine_type: wineType,
      varietal: rawVarietal,
      cellar_quantity: cellarQuantity,
      bottle_format: bottleFormat,
      entry_status: "cellaring",
      is_feed_visible: false,
      entry_privacy: "private",
    };

    if (pricePaid !== null) {
      entryRow.price_paid = pricePaid;
      entryRow.price_paid_source = "retail";
      entryRow.price_paid_currency = "usd";
    }

    const rowIndex = cellarInserts.length;
    cellarInserts.push(entryRow);

    // Collect custom field values
    for (const ctColumn of Object.keys(CT_LIST_MAPPING)) {
      if (CT_LIST_MAPPING[ctColumn] !== "custom") continue;
      const value = getField(row, ctColumn);
      if (value) {
        cellarCustomValues.push({ rowIndex, ctColumn, value });
      }
    }
  }

  // --- Process tasting notes (Notes) ---
  const notesInserts: Record<string, unknown>[] = [];
  const notesGrapeIds: (string | null)[] = [];

  for (const row of notesRows) {
    const wineName = getField(row, "Wine");
    const producer = getField(row, "Producer");
    const vintage = getField(row, "Vintage");

    // Duplicate check
    const dupeKey = [
      (wineName ?? "").toLowerCase().trim(),
      (producer ?? "").toLowerCase().trim(),
      (vintage ?? "").toLowerCase().trim(),
    ].join("|");

    if (existingKeySet.has(dupeKey)) {
      duplicateCount++;
      continue;
    }
    existingKeySet.add(dupeKey);

    const rawType = getField(row, "Type");
    const wineType =
      rawType && CT_TYPE_MAP[rawType.toLowerCase()]
        ? CT_TYPE_MAP[rawType.toLowerCase()]
        : rawType && VALID_WINE_TYPES.has(rawType.toLowerCase())
          ? rawType.toLowerCase()
          : null;

    const rawPrice = getField(row, "Price");
    const pricePaid =
      rawPrice &&
      Number.isFinite(Number(rawPrice)) &&
      Number(rawPrice) >= 0
        ? Number(rawPrice)
        : null;

    const rawScore = getField(row, "Score");
    const rating =
      rawScore &&
      Number.isFinite(Number(rawScore)) &&
      Number(rawScore) >= 0 &&
      Number(rawScore) <= 100
        ? Number(rawScore)
        : null;

    const consumedAt = getField(row, "Date") ?? null;

    const rawVarietal = getField(row, "Varietal");
    const grapeId = rawVarietal
      ? grapeIdByName.get(rawVarietal.toLowerCase()) ?? null
      : null;
    notesGrapeIds.push(grapeId);

    const entryRow: Record<string, unknown> = {
      user_id: user.id,
      wine_name: wineName,
      producer,
      vintage,
      country: getField(row, "Country"),
      region: getField(row, "Region"),
      appellation: getField(row, "Locale"),
      wine_type: wineType,
      varietal: rawVarietal,
      notes: getField(row, "Note"),
      entry_status: "consumed",
      is_feed_visible: false,
      entry_privacy: "private",
    };

    if (rating !== null) {
      entryRow.rating = rating;
    }

    if (consumedAt) {
      entryRow.consumed_at = consumedAt;
    }

    if (pricePaid !== null) {
      entryRow.price_paid = pricePaid;
      entryRow.price_paid_source = "retail";
      entryRow.price_paid_currency = "usd";
    }

    notesInserts.push(entryRow);
  }

  // --- Bulk insert cellar entries ---
  let cellarEntryIds: string[] = [];
  if (cellarInserts.length > 0) {
    const { data: insertedCellar, error: cellarError } = await supabase
      .from("wine_entries")
      .insert(cellarInserts)
      .select("id");

    if (cellarError) {
      return NextResponse.json(
        { error: `Cellar import failed: ${cellarError.message}` },
        { status: 500 }
      );
    }
    cellarEntryIds = (insertedCellar ?? []).map((e) => e.id);
  }

  // --- Bulk insert notes entries ---
  let notesEntryIds: string[] = [];
  if (notesInserts.length > 0) {
    const { data: insertedNotes, error: notesError } = await supabase
      .from("wine_entries")
      .insert(notesInserts)
      .select("id");

    if (notesError) {
      return NextResponse.json(
        { error: `Notes import failed: ${notesError.message}` },
        { status: 500 }
      );
    }
    notesEntryIds = (insertedNotes ?? []).map((e) => e.id);
  }

  // --- Insert grape links ---
  let grapesMatched = 0;
  const grapeInserts: {
    entry_id: string;
    variety_id: string;
    position: number;
  }[] = [];

  for (let i = 0; i < cellarEntryIds.length; i++) {
    const grapeId = cellarGrapeIds[i];
    if (grapeId) {
      grapesMatched++;
      grapeInserts.push({
        entry_id: cellarEntryIds[i],
        variety_id: grapeId,
        position: 1,
      });
    }
  }

  for (let i = 0; i < notesEntryIds.length; i++) {
    const grapeId = notesGrapeIds[i];
    if (grapeId) {
      grapesMatched++;
      grapeInserts.push({
        entry_id: notesEntryIds[i],
        variety_id: grapeId,
        position: 1,
      });
    }
  }

  if (grapeInserts.length > 0) {
    const { error: grapeInsertError } = await supabase
      .from("entry_primary_grapes")
      .insert(grapeInserts);

    if (grapeInsertError) {
      errors.push(`Grape linking failed: ${grapeInsertError.message}`);
    }
  }

  // --- Create custom field definitions (upsert by field_name) ---
  const customFieldsCreated: string[] = [];
  const fieldDefIdByLabel = new Map<string, string>();

  // Collect unique custom columns that actually have values
  const usedCustomColumns = new Set(
    cellarCustomValues.map((cv) => cv.ctColumn)
  );

  for (const ctColumn of usedCustomColumns) {
    const fieldLabel = CT_CUSTOM_FIELD_LABELS[ctColumn] ?? ctColumn;
    const fieldType = CT_CUSTOM_FIELD_TYPES[ctColumn] ?? "text";

    const { data: existing } = await supabase
      .from("cellar_custom_field_defs")
      .select("id")
      .eq("user_id", user.id)
      .eq("field_name", fieldLabel)
      .maybeSingle();

    if (existing) {
      fieldDefIdByLabel.set(ctColumn, existing.id);
    } else {
      const { data: maxRow } = await supabase
        .from("cellar_custom_field_defs")
        .select("position")
        .eq("user_id", user.id)
        .order("position", { ascending: false })
        .limit(1)
        .maybeSingle();

      const nextPosition = (maxRow?.position ?? 0) + 1;

      const { data: created, error: createError } = await supabase
        .from("cellar_custom_field_defs")
        .insert({
          user_id: user.id,
          field_name: fieldLabel,
          field_type: fieldType,
          position: nextPosition,
        })
        .select("id")
        .single();

      if (createError) {
        if (createError.code === "23505") {
          const { data: reFetched } = await supabase
            .from("cellar_custom_field_defs")
            .select("id")
            .eq("user_id", user.id)
            .eq("field_name", fieldLabel)
            .maybeSingle();

          if (reFetched) {
            fieldDefIdByLabel.set(ctColumn, reFetched.id);
          } else {
            errors.push(
              `Custom field creation failed for "${fieldLabel}": ${createError.message}`
            );
          }
        } else {
          errors.push(
            `Custom field creation failed for "${fieldLabel}": ${createError.message}`
          );
        }
      } else if (created) {
        fieldDefIdByLabel.set(ctColumn, created.id);
        customFieldsCreated.push(fieldLabel);
      }
    }
  }

  // --- Insert custom field values ---
  const customValueInserts: {
    entry_id: string;
    field_def_id: string;
    value: string;
  }[] = [];

  for (const { rowIndex, ctColumn, value } of cellarCustomValues) {
    const fieldDefId = fieldDefIdByLabel.get(ctColumn);
    if (!fieldDefId) continue;
    const entryId = cellarEntryIds[rowIndex];
    if (!entryId) continue;

    customValueInserts.push({
      entry_id: entryId,
      field_def_id: fieldDefId,
      value,
    });
  }

  if (customValueInserts.length > 0) {
    const { error: customValError } = await supabase
      .from("cellar_custom_field_values")
      .insert(customValueInserts);

    if (customValError) {
      errors.push(
        `Custom field values insert failed: ${customValError.message}`
      );
    }
  }

  // --- Enrich imported entries ---
  const allEntryIds = [...cellarEntryIds, ...notesEntryIds];
  const allInserts = [...cellarInserts, ...notesInserts];
  const enrichmentEntries = allEntryIds.map((id, i) => ({
    id,
    wine_name: allInserts[i]?.wine_name as string | null ?? null,
    producer: allInserts[i]?.producer as string | null ?? null,
    vintage: allInserts[i]?.vintage as string | null ?? null,
    country: allInserts[i]?.country as string | null ?? null,
    region: allInserts[i]?.region as string | null ?? null,
    appellation: allInserts[i]?.appellation as string | null ?? null,
    classification: allInserts[i]?.classification as string | null ?? null,
    wine_type: allInserts[i]?.wine_type as string | null ?? null,
    primary_grapes: null as string | null,
  }));

  let enrichment = null;
  try {
    enrichment = await enrichImportedEntries(supabase, user.id, enrichmentEntries);
  } catch {
    errors.push("Enrichment partially failed — entries imported but may lack sensory profiles.");
  }

  // --- Response ---
  return NextResponse.json({
    cellar_imported: cellarEntryIds.length,
    notes_imported: notesEntryIds.length,
    duplicates: duplicateCount,
    grapes_matched: grapesMatched,
    custom_fields_created: customFieldsCreated,
    enrichment: enrichment
      ? {
          resolved: enrichment.resolved,
          sensory_assembled: enrichment.sensoryAssembled,
          wine_types_inferred: enrichment.wineTypesInferred,
          ambiguous_entries: enrichment.ambiguousEntries,
        }
      : null,
    errors,
  });
}

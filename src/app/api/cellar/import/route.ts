import { NextResponse } from "next/server";
import { z } from "zod";
import { RequestAuthError, requireRequestAuth } from "@/server/auth/requestAuth";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { enrichImportedEntries } from "@/server/algorithm/enrichImportedEntries";

const MAX_ROWS = 500;

const mappingValueSchema = z.union([
  z.object({ target: z.string() }),
  z.object({ target: z.literal("custom"), field_type: z.enum(["text", "number", "date"]) }),
]);

const requestSchema = z.object({
  mappings: z.record(z.string(), mappingValueSchema),
  headers: z.array(z.string()).min(1),
  rows: z.array(z.array(z.string())).min(1).max(MAX_ROWS),
});

type Mapping = { target: string; field_type?: string };

const VALID_WINE_TYPES = new Set([
  "red", "white", "rose", "rosé", "sparkling", "orange", "sweet",
]);

const VALID_BOTTLE_FORMATS = new Set([
  "375ml", "750ml", "1.5L", "1.5l", "3L", "3l", "5L", "5l", "6L", "6l", "other",
]);

function normalizeGrapeQuery(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function getCellValue(
  row: string[],
  headers: string[],
  headerName: string
): string | null {
  const index = headers.indexOf(headerName);
  if (index === -1) return null;
  const value = row[index]?.trim();
  return value && value.length > 0 ? value : null;
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

  const { mappings, headers, rows } = parsed.data;

  if (rows.length > MAX_ROWS) {
    return NextResponse.json(
      { error: `Maximum ${MAX_ROWS} rows allowed. You sent ${rows.length}.` },
      { status: 400 }
    );
  }

  // Build a lookup: target field -> CSV header name
  const targetToHeader = new Map<string, string>();
  const customHeaders: { header: string; field_type: string }[] = [];

  for (const [header, mapping] of Object.entries(mappings)) {
    const m = mapping as Mapping;
    if (m.target === "custom") {
      customHeaders.push({
        header,
        field_type: m.field_type ?? "text",
      });
    } else {
      targetToHeader.set(m.target, header);
    }
  }

  // --- Grape matching (using admin client, no RLS) ---
  const adminSupabase = createSupabaseAdminClient();
  const varietalHeader = targetToHeader.get("varietal");
  const grapeIdByName = new Map<string, string>(); // normalized grape name -> variety_id

  if (varietalHeader) {
    // Collect unique grape values from the rows
    const uniqueGrapes = new Set<string>();
    for (const row of rows) {
      const val = getCellValue(row, headers, varietalHeader);
      if (val) uniqueGrapes.add(val);
    }

    if (uniqueGrapes.size > 0) {
      const grapeValues = Array.from(uniqueGrapes);

      // Look up by name (case-insensitive via ilike)
      for (const grape of grapeValues) {
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

        // Try alias lookup
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
  }

  // --- Duplicate detection ---
  // Build a set of existing entries for this user (wine_name + producer + vintage)
  const { data: existingEntries } = await supabase
    .from("wine_entries")
    .select("id, wine_name, producer, vintage")
    .eq("user_id", user.id);

  const existingKeyToId = new Map<string, string>();
  for (const entry of existingEntries ?? []) {
    const key = [
      (entry.wine_name ?? "").toLowerCase().trim(),
      (entry.producer ?? "").toLowerCase().trim(),
      (entry.vintage ?? "").toLowerCase().trim(),
    ].join("|");
    existingKeyToId.set(key, entry.id);
  }

  // --- Process rows ---
  const entryInserts: Record<string, unknown>[] = [];
  const rowDuplicateOf: (string | null)[] = [];
  const rowGrapeId: (string | null)[] = [];
  const errors: string[] = [];

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];

    const wineName = getCellValue(row, headers, targetToHeader.get("wine_name") ?? "") ?? null;
    const producer = getCellValue(row, headers, targetToHeader.get("producer") ?? "") ?? null;
    const vintage = getCellValue(row, headers, targetToHeader.get("vintage") ?? "") ?? null;
    const country = getCellValue(row, headers, targetToHeader.get("country") ?? "") ?? null;
    const region = getCellValue(row, headers, targetToHeader.get("region") ?? "") ?? null;
    const appellation = getCellValue(row, headers, targetToHeader.get("appellation") ?? "") ?? null;
    const classification = getCellValue(row, headers, targetToHeader.get("classification") ?? "") ?? null;
    const notes = getCellValue(row, headers, targetToHeader.get("notes") ?? "") ?? null;

    const rawWineType = getCellValue(row, headers, targetToHeader.get("wine_type") ?? "");
    const wineType =
      rawWineType && VALID_WINE_TYPES.has(rawWineType.toLowerCase())
        ? rawWineType.toLowerCase()
        : null;

    const rawQuantity = getCellValue(row, headers, targetToHeader.get("cellar_quantity") ?? "");
    const cellarQuantity =
      rawQuantity && Number.isFinite(Number(rawQuantity)) && Number(rawQuantity) > 0
        ? Math.floor(Number(rawQuantity))
        : 1;

    const rawFormat = getCellValue(row, headers, targetToHeader.get("bottle_format") ?? "");
    const bottleFormat =
      rawFormat && VALID_BOTTLE_FORMATS.has(rawFormat) ? rawFormat : "750ml";

    const rawPrice = getCellValue(row, headers, targetToHeader.get("price_paid") ?? "");
    const pricePaid =
      rawPrice && Number.isFinite(Number(rawPrice)) && Number(rawPrice) >= 0
        ? Number(rawPrice)
        : null;

    // Duplicate check
    const dupeKey = [
      (wineName ?? "").toLowerCase().trim(),
      (producer ?? "").toLowerCase().trim(),
      (vintage ?? "").toLowerCase().trim(),
    ].join("|");
    const duplicateOf = existingKeyToId.get(dupeKey) ?? null;
    rowDuplicateOf.push(duplicateOf);

    // Grape match
    const rawVarietal = getCellValue(row, headers, varietalHeader ?? "");
    const grapeId = rawVarietal ? grapeIdByName.get(rawVarietal.toLowerCase()) ?? null : null;
    rowGrapeId.push(grapeId);

    const entryRow: Record<string, unknown> = {
      user_id: user.id,
      wine_name: wineName,
      producer,
      vintage,
      country,
      region,
      appellation,
      classification,
      wine_type: wineType,
      notes,
      cellar_quantity: cellarQuantity,
      bottle_format: bottleFormat,
      entry_status: "cellaring",
      is_feed_visible: false,
      entry_privacy: "private",
      consumed_at: new Date().toISOString().slice(0, 10),
    };

    // Only include price if we have a valid number — the DB requires
    // price_paid_source + price_paid_currency when price_paid is set
    if (pricePaid !== null) {
      entryRow.price_paid = pricePaid;
      entryRow.price_paid_source = "retail";
      entryRow.price_paid_currency = "usd";
    }

    entryInserts.push(entryRow);
  }

  // --- Bulk insert entries ---
  // Supabase insert returns rows in insert order
  const { data: insertedEntries, error: insertError } = await supabase
    .from("wine_entries")
    .insert(entryInserts)
    .select("id");

  if (insertError) {
    return NextResponse.json({ error: insertError.message }, { status: 500 });
  }

  const entryIds = (insertedEntries ?? []).map((e) => e.id);

  // --- Insert grape links ---
  let grapesMatched = 0;
  const grapeInserts: { entry_id: string; variety_id: string; position: number }[] = [];

  for (let i = 0; i < entryIds.length; i++) {
    const grapeId = rowGrapeId[i];
    if (grapeId) {
      grapesMatched++;
      grapeInserts.push({
        entry_id: entryIds[i],
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
      // Non-fatal — log but continue
      errors.push(`Grape linking failed: ${grapeInsertError.message}`);
    }
  }

  // --- Create custom field definitions (upsert by field_name) ---
  const customFieldsCreated: string[] = [];
  const fieldDefIdByName = new Map<string, string>();

  for (const { header, field_type } of customHeaders) {
    // Check if the field def already exists for this user
    const { data: existing } = await supabase
      .from("cellar_custom_field_defs")
      .select("id")
      .eq("user_id", user.id)
      .eq("field_name", header)
      .maybeSingle();

    if (existing) {
      fieldDefIdByName.set(header, existing.id);
    } else {
      // Get max position
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
          field_name: header,
          field_type,
          position: nextPosition,
        })
        .select("id")
        .single();

      if (createError) {
        // Could be a race condition duplicate — try fetching again
        if (createError.code === "23505") {
          const { data: reFetched } = await supabase
            .from("cellar_custom_field_defs")
            .select("id")
            .eq("user_id", user.id)
            .eq("field_name", header)
            .maybeSingle();

          if (reFetched) {
            fieldDefIdByName.set(header, reFetched.id);
          } else {
            errors.push(`Custom field creation failed for "${header}": ${createError.message}`);
          }
        } else {
          errors.push(`Custom field creation failed for "${header}": ${createError.message}`);
        }
      } else if (created) {
        fieldDefIdByName.set(header, created.id);
        customFieldsCreated.push(header);
      }
    }
  }

  // --- Insert custom field values ---
  const customValueInserts: { entry_id: string; field_def_id: string; value: string }[] = [];

  for (const { header } of customHeaders) {
    const fieldDefId = fieldDefIdByName.get(header);
    if (!fieldDefId) continue;

    for (let i = 0; i < entryIds.length; i++) {
      const value = getCellValue(rows[i], headers, header);
      if (value) {
        customValueInserts.push({
          entry_id: entryIds[i],
          field_def_id: fieldDefId,
          value,
        });
      }
    }
  }

  if (customValueInserts.length > 0) {
    const { error: customValError } = await supabase
      .from("cellar_custom_field_values")
      .insert(customValueInserts);

    if (customValError) {
      errors.push(`Custom field values insert failed: ${customValError.message}`);
    }
  }

  // --- Enrich imported entries ---
  // Canonical resolution, wine type inference, sensory profile assembly
  const enrichmentEntries = entryIds.map((id, i) => ({
    id,
    wine_name: entryInserts[i]?.wine_name as string | null ?? null,
    producer: entryInserts[i]?.producer as string | null ?? null,
    vintage: entryInserts[i]?.vintage as string | null ?? null,
    country: entryInserts[i]?.country as string | null ?? null,
    region: entryInserts[i]?.region as string | null ?? null,
    appellation: entryInserts[i]?.appellation as string | null ?? null,
    classification: entryInserts[i]?.classification as string | null ?? null,
    wine_type: entryInserts[i]?.wine_type as string | null ?? null,
    primary_grapes: rowGrapeId[i] ? null : null, // grapes already linked via entry_primary_grapes
  }));

  let enrichment = null;
  try {
    enrichment = await enrichImportedEntries(supabase, user.id, enrichmentEntries);
  } catch {
    errors.push("Enrichment partially failed — entries imported but may lack sensory profiles.");
  }

  // --- Build response ---
  const duplicateCount = rowDuplicateOf.filter((d) => d !== null).length;

  return NextResponse.json({
    imported: entryIds.length,
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

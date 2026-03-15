import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { chunkMarkdown, chunkText } from "@/server/sommelier/chunker";
import { generateEmbeddings } from "@/server/sommelier/embeddings";
import type {
  DocumentIngestionSummary,
  StructuredIngestionSummary,
} from "@/server/sommelier/types";

type DataRow = Record<string, unknown>;
type AdminClient = ReturnType<typeof createSupabaseAdminClient>;

const STRUCTURED_TABLES = [
  "base_profiles",
  "classification_tier_modifiers",
  "producer_modifiers",
  "aging_curve_baselines",
  "vintage_weather_modifiers",
  "grape_sensitivity_coefficients",
  "taxonomy_classification_tiers",
] as const;

type StructuredTable = (typeof STRUCTURED_TABLES)[number];

function normalizeText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function toNumber(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function parseList(value: unknown) {
  if (Array.isArray(value)) {
    return value
      .filter((item): item is string => typeof item === "string")
      .map((item) => item.trim())
      .filter(Boolean);
  }

  if (typeof value !== "string") {
    return [] as string[];
  }

  return value
    .split(/[;,/|]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function labelizeKey(key: string) {
  return key
    .replace(/_/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function formatList(values: string[]) {
  if (values.length === 0) {
    return "";
  }
  if (values.length === 1) {
    return values[0] ?? "";
  }
  if (values.length === 2) {
    return `${values[0]} and ${values[1]}`;
  }
  return `${values.slice(0, -1).join(", ")}, and ${values[values.length - 1]}`;
}

function buildLocation(row: DataRow) {
  const parts = [row.country, row.region, row.sub_region]
    .map((value) => normalizeText(value))
    .filter(Boolean);

  return parts.length > 0 ? parts.join(" / ") : "Unknown origin";
}

function collectAxisNotes(row: DataRow) {
  const axisDescriptions: string[] = [];
  const candidateAxes = [
    "body",
    "acidity",
    "tannin",
    "alcohol_perception",
    "fruit_ripeness",
    "oak_presence",
    "earthy",
    "mineral",
    "savory",
    "aromatic_intensity",
    "sweetness_perception",
    "bitterness_phenolic_grip",
    "finish_length",
    "concentration",
    "complexity",
    "freshness",
  ];

  for (const axis of candidateAxes) {
    const value = toNumber(row[axis]);
    if (value === null) {
      continue;
    }
    axisDescriptions.push(`${labelizeKey(axis).toLowerCase()} ${value}/5`);
  }

  return axisDescriptions;
}

function collectDeltaNotes(row: DataRow) {
  return Object.entries(row)
    .filter(([key, value]) => {
      if (toNumber(value) === null) {
        return false;
      }

      return (
        key.startsWith("delta_") ||
        key.endsWith("_delta") ||
        key.startsWith("red_delta_") ||
        key.startsWith("white_delta_") ||
        key.startsWith("rose_delta_") ||
        key.startsWith("orange_delta_") ||
        key.startsWith("sparkling_delta_") ||
        key.startsWith("sweet_delta_") ||
        key.startsWith("coefficient_")
      );
    })
    .sort((left, right) => Math.abs(toNumber(right[1]) ?? 0) - Math.abs(toNumber(left[1]) ?? 0))
    .slice(0, 6)
    .map(([key, value]) => {
      const numericValue = toNumber(value) ?? 0;
      const prefix = numericValue >= 0 ? "+" : "";
      return `${labelizeKey(key).toLowerCase()} ${prefix}${numericValue}`;
    });
}

function serializeBaseProfileRow(row: DataRow) {
  const wineType = normalizeText(row.wine_type) || "wine";
  const grapes = parseList(row.primary_grapes);
  const styles = parseList(row.style_families);
  const aromas = [
    ...parseList(row.primary_aroma_clusters),
    ...parseList(row.secondary_aroma_clusters),
    ...parseList(row.tertiary_aroma_clusters),
  ];
  const sensory = collectAxisNotes(row);
  const balance = toNumber(row.overall_balance);
  const qualityTier = normalizeText(row.quality_tier);
  const regulatoryClassification = normalizeText(row.regulatory_classification);
  const blendStyle = normalizeText(row.blend_style);
  const texture = normalizeText(row.texture);

  return [
    `${buildLocation(row)} ${wineType} profile.`,
    grapes.length > 0 ? `Primary grapes: ${formatList(grapes)}.` : null,
    blendStyle ? `Blend style: ${blendStyle}.` : null,
    regulatoryClassification ? `Regulatory classification: ${regulatoryClassification}.` : null,
    qualityTier ? `Quality tier: ${qualityTier}.` : null,
    balance !== null ? `Overall balance: ${balance}/5.` : null,
    texture ? `Texture: ${texture}.` : null,
    styles.length > 0 ? `Style families: ${formatList(styles)}.` : null,
    aromas.length > 0 ? `Common aromas: ${formatList(aromas)}.` : null,
    sensory.length > 0 ? `Sensory profile: ${sensory.join(", ")}.` : null,
  ]
    .filter(Boolean)
    .join(" ");
}

function serializeClassificationTierRow(row: DataRow) {
  const tier = normalizeText(row.tier_name) || normalizeText(row.quality_tier);
  const system = normalizeText(row.classification_system);
  const wineType = normalizeText(row.wine_type);
  const deltas = collectDeltaNotes(row);
  const location = buildLocation(row);
  const rank = toNumber(row.quality_rank);

  return [
    `${location} classification reference.`,
    tier ? `Tier: ${tier}.` : null,
    system ? `System: ${system}.` : null,
    wineType ? `Wine type: ${wineType}.` : null,
    rank !== null ? `Rank position: ${rank}.` : null,
    deltas.length > 0 ? `Typical adjustments: ${deltas.join(", ")}.` : null,
  ]
    .filter(Boolean)
    .join(" ");
}

function serializeProducerModifierRow(row: DataRow) {
  const producer = normalizeText(row.producer_name) || "Unknown producer";
  const grapes = parseList(row.grapes);
  const wineType = normalizeText(row.wine_type);
  const appellation = normalizeText(row.appellation);
  const deltas = collectDeltaNotes(row);

  return [
    `${producer} producer profile for ${buildLocation(row)}.`,
    appellation ? `Appellation focus: ${appellation}.` : null,
    wineType ? `Wine type: ${wineType}.` : null,
    grapes.length > 0 ? `Common grapes: ${formatList(grapes)}.` : null,
    deltas.length > 0 ? `Notable style shifts: ${deltas.join(", ")}.` : null,
  ]
    .filter(Boolean)
    .join(" ");
}

function serializeAgingCurveRow(row: DataRow) {
  const grapes = parseList(row.primary_grapes);

  return [
    `${buildLocation(row)} aging baseline.`,
    normalizeText(row.wine_type) ? `Wine type: ${normalizeText(row.wine_type)}.` : null,
    grapes.length > 0 ? `Primary grapes: ${formatList(grapes)}.` : null,
    normalizeText(row.aging_curve_family)
      ? `Curve family: ${normalizeText(row.aging_curve_family)}.`
      : null,
    toNumber(row.youth_end) !== null ? `Youth phase ends around year ${toNumber(row.youth_end)}.` : null,
    toNumber(row.development_end) !== null
      ? `Development phase ends around year ${toNumber(row.development_end)}.`
      : null,
    toNumber(row.peak_end) !== null ? `Peak phase ends around year ${toNumber(row.peak_end)}.` : null,
    toNumber(row.decline_end) !== null
      ? `Decline phase ends around year ${toNumber(row.decline_end)}.`
      : null,
  ]
    .filter(Boolean)
    .join(" ");
}

function serializeVintageWeatherRow(row: DataRow) {
  const vintage = toNumber(row.vintage);
  const deltas = collectDeltaNotes(row);

  return [
    `${buildLocation(row)} vintage weather modifier.`,
    vintage !== null ? `Vintage: ${vintage}.` : null,
    deltas.length > 0 ? `Weather effects: ${deltas.join(", ")}.` : null,
  ]
    .filter(Boolean)
    .join(" ");
}

function serializeGrapeSensitivityRow(row: DataRow) {
  const grape = normalizeText(row.grape_name) || "Unknown grape";
  const coefficients = collectDeltaNotes(row);

  return [
    `${grape} sensitivity profile.`,
    coefficients.length > 0 ? `Relevant coefficients: ${coefficients.join(", ")}.` : null,
  ]
    .filter(Boolean)
    .join(" ");
}

function serializeGenericRow(table: string, row: DataRow) {
  const fields = Object.entries(row)
    .filter(([, value]) => value !== null && value !== undefined && value !== "")
    .slice(0, 10)
    .map(([key, value]) =>
      `${labelizeKey(key)}: ${
        Array.isArray(value) ? formatList(value.map(String)) : String(value)
      }`
    );

  return `${labelizeKey(table)} reference. ${fields.join(". ")}.`;
}

function serializeStructuredRow(table: StructuredTable, row: DataRow) {
  switch (table) {
    case "base_profiles":
      return serializeBaseProfileRow(row);
    case "classification_tier_modifiers":
    case "taxonomy_classification_tiers":
      return serializeClassificationTierRow(row);
    case "producer_modifiers":
      return serializeProducerModifierRow(row);
    case "aging_curve_baselines":
      return serializeAgingCurveRow(row);
    case "vintage_weather_modifiers":
      return serializeVintageWeatherRow(row);
    case "grape_sensitivity_coefficients":
      return serializeGrapeSensitivityRow(row);
    default:
      return serializeGenericRow(table, row);
  }
}

function getRowId(row: DataRow, fallbackIndex: number) {
  const value = row.id;
  if (typeof value === "string" || typeof value === "number") {
    return String(value);
  }

  return String(fallbackIndex);
}

async function batchGenerateEmbeddings(contents: string[]) {
  const embeddings: number[][] = [];

  for (let index = 0; index < contents.length; index += 96) {
    const batch = contents.slice(index, index + 96);
    const batchEmbeddings = await generateEmbeddings(batch);
    embeddings.push(...batchEmbeddings);
  }

  return embeddings;
}

async function replaceWineKnowledgeChunks(
  supabase: AdminClient,
  sourceTable: StructuredTable,
  rows: Array<{
    source_row_id: string;
    chunk_index: number;
    content: string;
    embedding: number[];
    metadata: Record<string, unknown>;
  }>
) {
  const { error: deleteError } = await supabase
    .from("wine_knowledge_chunks")
    .delete()
    .eq("source_table", sourceTable);

  if (deleteError) {
    throw new Error(deleteError.message);
  }

  if (rows.length === 0) {
    return;
  }

  const { error: insertError } = await supabase.from("wine_knowledge_chunks").insert(
    rows.map((row) => ({
      source_table: sourceTable,
      source_row_id: row.source_row_id,
      chunk_index: row.chunk_index,
      content: row.content,
      embedding: row.embedding,
      metadata: row.metadata,
    }))
  );

  if (insertError) {
    throw new Error(insertError.message);
  }
}

async function chunkDocumentContent({
  content,
  contentType,
}: {
  content: string;
  contentType: string;
}) {
  const normalizedType = contentType.toLowerCase();
  return normalizedType === "markdown"
    ? chunkMarkdown(content)
    : chunkText(content);
}

export async function ingestStructuredWineKnowledge(
  dependencies: {
    supabase?: AdminClient;
  } = {}
): Promise<StructuredIngestionSummary[]> {
  const supabase = dependencies.supabase ?? createSupabaseAdminClient();
  const summaries: StructuredIngestionSummary[] = [];

  for (const table of STRUCTURED_TABLES) {
    const { data, error } = await supabase.from(table).select("*");
    if (error) {
      throw new Error(`Failed to load ${table}: ${error.message}`);
    }

    const rows = (data ?? []) as DataRow[];
    const serializedRows = rows
      .map((row, index) => ({
        source_row_id: getRowId(row, index),
        chunk_index: 0,
        content: serializeStructuredRow(table, row).trim(),
        metadata: {
          table,
          row_id: getRowId(row, index),
          title:
            normalizeText(row.producer_name) ||
            normalizeText(row.tier_name) ||
            normalizeText(row.region) ||
            labelizeKey(table),
          region: normalizeText(row.region) || null,
          sub_region: normalizeText(row.sub_region) || null,
          wine_type: normalizeText(row.wine_type) || null,
        } satisfies Record<string, unknown>,
      }))
      .filter((row) => row.content.length > 0);

    const embeddings = await batchGenerateEmbeddings(
      serializedRows.map((row) => row.content)
    );

    await replaceWineKnowledgeChunks(
      supabase,
      table,
      serializedRows.map((row, index) => ({
        ...row,
        embedding: embeddings[index] ?? [],
      }))
    );

    summaries.push({
      sourceTable: table,
      insertedCount: serializedRows.length,
    });
  }

  return summaries;
}

export async function extractDocumentTextFromFile(file: File) {
  const fileName = file.name.toLowerCase();
  const contentType = file.type.toLowerCase();

  if (
    contentType === "application/pdf" ||
    fileName.endsWith(".pdf")
  ) {
    const { PDFParse } = await import("pdf-parse");
    const parser = new PDFParse({ data: Buffer.from(await file.arrayBuffer()) });
    try {
      const result = await parser.getText();
      return {
        contentType: "pdf",
        content: result.text.trim(),
      };
    } finally {
      await parser.destroy();
    }
  }

  const text = await file.text();
  const normalizedType =
    contentType.includes("markdown") || fileName.endsWith(".md") ? "markdown" : "text";

  return {
    contentType: normalizedType,
    content: text.trim(),
  };
}

export async function ingestKnowledgeDocument(
  params: {
    title: string;
    content: string;
    contentType: string;
    uploadedBy: string;
    sourceUrl?: string | null;
    sourceFilename?: string | null;
    metadata?: Record<string, unknown>;
    documentId?: string;
    supabase?: AdminClient;
  }
): Promise<DocumentIngestionSummary> {
  const supabase = params.supabase ?? createSupabaseAdminClient();
  const nowIso = new Date().toISOString();

  const upsertPayload = {
    title: params.title.trim(),
    source_url: params.sourceUrl ?? null,
    source_filename: params.sourceFilename ?? null,
    content_type: params.contentType,
    content: params.content,
    metadata: params.metadata ?? {},
    ingest_status: "processing",
    uploaded_by: params.uploadedBy,
    last_ingested_at: nowIso,
  };

  const documentResult = params.documentId
    ? await supabase
        .from("knowledge_documents")
        .update(upsertPayload)
        .eq("id", params.documentId)
        .select("id, title, content_type")
        .single()
    : await supabase
        .from("knowledge_documents")
        .insert(upsertPayload)
        .select("id, title, content_type")
        .single();

  if (documentResult.error || !documentResult.data) {
    throw new Error(documentResult.error?.message ?? "Failed to save document.");
  }

  const chunks = await chunkDocumentContent({
    content: params.content,
    contentType: params.contentType,
  });
  const embeddings = await batchGenerateEmbeddings(chunks.map((chunk) => chunk.content));

  const { error: deleteError } = await supabase
    .from("general_knowledge_chunks")
    .delete()
    .eq("document_id", documentResult.data.id);

  if (deleteError) {
    throw new Error(deleteError.message);
  }

  if (chunks.length > 0) {
    const { error: insertError } = await supabase.from("general_knowledge_chunks").insert(
      chunks.map((chunk, index) => ({
        document_id: documentResult.data.id,
        chunk_index: chunk.chunkIndex,
        content: chunk.content,
        embedding: embeddings[index] ?? [],
        metadata: {
          title: documentResult.data.title,
          heading: chunk.heading ?? null,
          approx_tokens: chunk.approxTokens,
          source_filename: params.sourceFilename ?? null,
        },
      }))
    );

    if (insertError) {
      throw new Error(insertError.message);
    }
  }

  const { error: updateError } = await supabase
    .from("knowledge_documents")
    .update({
      chunk_count: chunks.length,
      ingest_status: "ready",
      last_ingested_at: nowIso,
    })
    .eq("id", documentResult.data.id);

  if (updateError) {
    throw new Error(updateError.message);
  }

  return {
    documentId: documentResult.data.id,
    title: documentResult.data.title,
    chunkCount: chunks.length,
    contentType: documentResult.data.content_type,
  };
}

export async function reingestKnowledgeDocument(
  documentId: string,
  dependencies: {
    supabase?: AdminClient;
  } = {}
) {
  const supabase = dependencies.supabase ?? createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("knowledge_documents")
    .select("id, title, content, content_type, source_url, source_filename, uploaded_by, metadata")
    .eq("id", documentId)
    .single();

  if (error || !data) {
    throw new Error(error?.message ?? "Document not found.");
  }

  return ingestKnowledgeDocument({
    documentId: data.id,
    title: data.title,
    content: data.content ?? "",
    contentType: data.content_type,
    sourceUrl: data.source_url,
    sourceFilename: data.source_filename,
    uploadedBy: data.uploaded_by,
    metadata: (data.metadata ?? {}) as Record<string, unknown>,
    supabase,
  });
}

export async function createDocumentChunksPreview({
  content,
  contentType,
}: {
  content: string;
  contentType: string;
}) {
  return chunkDocumentContent({ content, contentType });
}

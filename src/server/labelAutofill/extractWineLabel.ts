import OpenAI from "openai";
import { z } from "zod";
import { normalizeProducerText, normalizeWineNameText } from "@/lib/wineText";
import { isValidWineType } from "@/server/algorithm/resolver";
import type { WineType } from "@/types/wine";

/**
 * Shared bottle-label vision extraction — originally inline in
 * /api/label-autofill's route handler. Extracted so it can be reused by
 * /api/sommelier/identify-bottle (bottle photo -> somm chat) without
 * duplicating the OpenAI prompt/schema. See both callers for usage.
 */

const responseSchema = z.object({
  wine_name: z.string().nullable().optional(),
  producer: z.string().nullable().optional(),
  vintage: z.string().nullable().optional(),
  country: z.string().nullable().optional(),
  region: z.string().nullable().optional(),
  appellation: z.string().nullable().optional(),
  classification: z.string().nullable().optional(),
  wine_type: z.string().nullable().optional(),
  primary_grape_suggestions: z.array(z.string()).optional(),
  primary_grape_confidence: z.number().min(0).max(1).nullable().optional(),
  confidence: z.number().min(0).max(1).nullable().optional(),
  warnings: z.array(z.string()).optional(),
  inferred_fields: z.array(z.string()).optional(),
});

// Fields eligible for the "inferred, not read" flag — provenance guardrail
// (feedback, round 2: a label scan "made everything up lowkey" for a wine
// the model didn't recognize). Anything the model lists in inferred_fields
// gets nulled out below rather than passed through, per the product
// decision that a blank field invites correction while a wrong-but-plausible
// one gets trusted and shipped straight into the entry. primary_grape_*
// confidence/overall confidence and warnings are meta fields, not identity
// data, so they're excluded from this blanking behavior.
const INFERABLE_FIELDS = [
  "wine_name",
  "producer",
  "vintage",
  "country",
  "region",
  "appellation",
  "classification",
  "wine_type",
  "primary_grape_suggestions",
] as const;

export type WineLabelExtraction = {
  wine_name: string | null;
  producer: string | null;
  vintage: string | null;
  country: string | null;
  region: string | null;
  appellation: string | null;
  classification: string | null;
  wine_type: WineType | null;
  primary_grape_suggestions: string[];
  primary_grape_confidence: number | null;
  confidence: number | null;
  warnings: string[];
  // Field names the model flagged as inferred/guessed rather than directly
  // legible on the label. By the time this is returned, every field listed
  // here has already been nulled/blanked out (see extraction logic below) —
  // this array is kept for transparency/debugging and so callers can
  // message "N fields left blank" without re-deriving it.
  inferred_fields: string[];
};

export type WineLabelExtractionErrorCode =
  | "timeout"
  | "openai_error"
  | "no_data"
  | "invalid_data";

export class WineLabelExtractionError extends Error {
  code: WineLabelExtractionErrorCode;
  status: number;

  constructor(code: WineLabelExtractionErrorCode, message: string, status: number) {
    super(message);
    this.name = "WineLabelExtractionError";
    this.code = code;
    this.status = status;
  }
}

const LABEL_EXTRACTION_TIMEOUT_MS = 30000;

function normalize(value?: string | null) {
  if (value === undefined || value === null) return null;
  const trimmed = value.trim();
  return trimmed.length ? trimmed : null;
}

function normalizeGrapeSuggestions(values?: string[] | null) {
  if (!Array.isArray(values)) {
    return [] as string[];
  }

  const unique = new Set<string>();
  const suggestions: string[] = [];

  values.forEach((value) => {
    const normalized = value.trim();
    if (!normalized) {
      return;
    }
    const dedupeKey = normalized.toLowerCase();
    if (unique.has(dedupeKey)) {
      return;
    }
    unique.add(dedupeKey);
    suggestions.push(normalized);
  });

  return suggestions.slice(0, 3);
}

function extractJson(text: string) {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) {
    throw new Error("Invalid JSON response");
  }
  return JSON.parse(text.slice(start, end + 1));
}

/**
 * Extract wine label fields from a bottle/label photo via OpenAI vision.
 * Shared by /api/label-autofill and /api/sommelier/identify-bottle.
 *
 * Throws `WineLabelExtractionError` for all known failure modes (timeout,
 * OpenAI API errors, unparseable/empty output) so callers can map to their
 * own HTTP responses.
 */
export async function extractWineLabelFromDataUrl(
  dataUrl: string,
  options: {
    apiKey: string;
    userId: string;
    openaiClient?: OpenAI;
    timeoutMs?: number;
  }
): Promise<WineLabelExtraction> {
  const openai = options.openaiClient ?? new OpenAI({ apiKey: options.apiKey });
  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(),
    options.timeoutMs ?? LABEL_EXTRACTION_TIMEOUT_MS
  );

  try {
    const response = await openai.responses.create(
      {
        model: "gpt-5-mini",
        reasoning: { effort: "minimal" },
        max_output_tokens: 450,
        text: {
          format: {
            type: "json_schema",
            name: "label_autofill",
            strict: true,
            schema: {
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
                wine_type: { type: ["string", "null"] },
                primary_grape_suggestions: {
                  type: "array",
                  items: { type: "string" },
                },
                primary_grape_confidence: { type: ["number", "null"] },
                confidence: { type: ["number", "null"] },
                warnings: {
                  type: "array",
                  items: { type: "string" },
                },
                inferred_fields: {
                  type: "array",
                  items: { type: "string" },
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
                "wine_type",
                "primary_grape_suggestions",
                "primary_grape_confidence",
                "confidence",
                "warnings",
                "inferred_fields",
              ],
            },
          },
        },
        input: [
          {
            role: "user",
            content: [
              {
                type: "input_text",
                text:
                  "You are extracting wine label info from a bottle photo. Return ONLY JSON with keys: " +
                  "wine_name, producer, vintage, country, region, appellation, classification, wine_type, " +
                  "primary_grape_suggestions, primary_grape_confidence, confidence, warnings, inferred_fields. " +
                  "CORE RULE — read, don't guess: for EVERY field (not just wine_name/producer/vintage), only fill it in if " +
                  "it is legible text printed on the label itself, or is certain and unambiguous given what IS legible " +
                  "(e.g. the vintage is printed as '2021' — that's a read, not a guess). Do NOT infer, estimate, or fill in " +
                  "a field from indirect signals: bottle shape, capsule/foil color, glass color, wax seal style, cork " +
                  "material, general knowledge about a producer's usual style, regional reputation, or 'typical' grapes for " +
                  "an appellation. If you recognize the producer/wine from general knowledge but the label itself doesn't " +
                  "show a given field, leave that field null rather than filling it from what you know about the wine. " +
                  "If ANY field is not clearly legible or directly stated on the label, return null for it — a blank field " +
                  "is always better than a plausible-sounding guess. " +
                  "Appellation must be place-based only (for example Saint-Aubin, Pauillac, Barolo). " +
                  "Classification must hold quality tiers or legal quality markers (for example Premier Cru, Grand Cru Classe, DOCG). " +
                  "For wine_type, classify as exactly one of: red, white, rose, sparkling, sweet, orange, using the label color, style, " +
                  "region, grape variety, and description — return null only if genuinely impossible to determine from the label. " +
                  "For primary_grape_suggestions, include canonical grape variety names and be conservative: prefer one grape by default, " +
                  "only return multiple grapes if the label explicitly shows a blend or the style implies a highly certain blend. " +
                  "Do not guess multiple grapes from weak regional hints alone. Use null for unknown scalar fields, [] for unknown grapes. " +
                  "inferred_fields: array of field name strings (from: wine_name, producer, vintage, country, region, appellation, " +
                  "classification, wine_type, primary_grape_suggestions) — list ANY field where the value you returned (if non-null) " +
                  "was not read directly off visible label text but was inferred, recognized from general knowledge, or guessed from " +
                  "partial/blurry/angled text. Be honest and conservative here: when in doubt, include the field name. Do not include " +
                  "field names you already returned null for — inferred_fields is only for non-null values you're not fully certain " +
                  "were directly read. If every returned field was a direct, confident read, return an empty array. " +
                  "Both confidence fields are 0-1.",
              },
              { type: "input_image", image_url: dataUrl, detail: "high" },
            ],
          },
        ],
        safety_identifier: options.userId,
      },
      { signal: controller.signal }
    );

    const outputText =
      "output_text" in response && typeof response.output_text === "string"
        ? response.output_text
        : "";
    if (!outputText.trim()) {
      throw new WineLabelExtractionError(
        "no_data",
        "No data returned from label analysis",
        422
      );
    }

    let parsedJson: unknown;
    try {
      parsedJson = extractJson(outputText);
    } catch {
      throw new WineLabelExtractionError("invalid_data", "Unable to parse label data", 422);
    }

    const parsed = responseSchema.safeParse(parsedJson);
    if (!parsed.success) {
      throw new WineLabelExtractionError("invalid_data", "Unable to parse label data", 422);
    }

    const data = parsed.data;
    const rawWineType = normalize(data.wine_type);
    const wine_type = isValidWineType(rawWineType) ? rawWineType : null;

    // Provenance guardrail (feedback, round 2: a scan "made everything up
    // lowkey" for an unrecognized wine): the model may still occasionally
    // return a confident-looking value for a field it isn't actually
    // certain was read off the label. inferred_fields is the model's own
    // admission of that — enforce it server-side by blanking those fields
    // rather than trusting the client (or a future caller) to honor the
    // flag. A blank field invites correction; a wrong one gets trusted.
    const inferredFieldsRaw = Array.isArray(data.inferred_fields) ? data.inferred_fields : [];
    const inferredSet = new Set(
      inferredFieldsRaw
        .filter((f): f is string => typeof f === "string")
        .map((f) => f.toLowerCase().trim())
    );
    const inferred_fields = INFERABLE_FIELDS.filter((field) => inferredSet.has(field));

    const wine_name = inferredSet.has("wine_name")
      ? null
      : normalizeWineNameText(data.wine_name) ?? normalize(data.wine_name);
    const producer = inferredSet.has("producer")
      ? null
      : normalizeProducerText(data.producer) ?? normalize(data.producer);
    const vintage = inferredSet.has("vintage") ? null : normalize(data.vintage);
    const country = inferredSet.has("country") ? null : normalize(data.country);
    const region = inferredSet.has("region") ? null : normalize(data.region);
    const appellation = inferredSet.has("appellation") ? null : normalize(data.appellation);
    const classification = inferredSet.has("classification") ? null : normalize(data.classification);
    const finalWineType = inferredSet.has("wine_type") ? null : wine_type;
    const primary_grape_suggestions = inferredSet.has("primary_grape_suggestions")
      ? []
      : normalizeGrapeSuggestions(data.primary_grape_suggestions);

    return {
      wine_name,
      producer,
      vintage,
      country,
      region,
      appellation,
      classification,
      wine_type: finalWineType,
      primary_grape_suggestions,
      primary_grape_confidence: data.primary_grape_confidence ?? null,
      confidence: data.confidence ?? null,
      warnings: data.warnings ?? [],
      inferred_fields,
    };
  } catch (error) {
    if (error instanceof WineLabelExtractionError) {
      throw error;
    }
    if (error instanceof Error && error.name === "AbortError") {
      throw new WineLabelExtractionError("timeout", "Request timed out", 504);
    }
    if (error instanceof OpenAI.APIError) {
      throw new WineLabelExtractionError(
        "openai_error",
        error.message || "OpenAI request failed",
        error.status ?? 500
      );
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

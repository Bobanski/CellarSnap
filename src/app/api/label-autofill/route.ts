import { NextResponse } from "next/server";
import { z } from "zod";
import OpenAI from "openai";
import { applyRateLimit, rateLimitHeaders } from "@/lib/rateLimit";
import { normalizeProducerText, normalizeWineNameText } from "@/lib/wineText";
import { requireRequestAuth, RequestAuthError } from "@/server/auth/requestAuth";
import {
  OpenAiImagePreparationError,
  prepareOpenAiImageDataUrl,
} from "@/server/images/openAiImage";
import { isValidWineType } from "@/server/algorithm/resolver";

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
});

const TIMEOUT_MS = 30000;
const MAX_LABEL_INPUT_BYTES = 24 * 1024 * 1024;
const MAX_LABEL_PROCESSED_BYTES = 8 * 1024 * 1024;
const RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000;
const RATE_LIMIT_MAX_REQUESTS = 120;

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
  const { user } = auth;

  const rateLimit = await applyRateLimit({
    request,
    routeKey: "label-autofill",
    windowMs: RATE_LIMIT_WINDOW_MS,
    maxRequests: RATE_LIMIT_MAX_REQUESTS,
    userId: user.id,
  });
  if (!rateLimit.allowed) {
    return NextResponse.json(
      {
        error:
          "Too many label scans in a short time. Please wait a bit and try again.",
      },
      { status: 429, headers: rateLimitHeaders(rateLimit) }
    );
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "Missing OPENAI_API_KEY" },
      { status: 500 }
    );
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json({ error: "Invalid form data" }, { status: 400 });
  }

  const file = formData.get("label");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Label image is required" }, { status: 400 });
  }
  if (!file.type.startsWith("image/")) {
    return NextResponse.json({ error: "Label must be an image" }, { status: 400 });
  }
  if (file.size > MAX_LABEL_INPUT_BYTES) {
    return NextResponse.json(
      { error: "Label image is too large (max 24 MB)" },
      { status: 413 }
    );
  }

  let dataUrl: string;
  try {
    const prepared = await prepareOpenAiImageDataUrl(file, {
      maxInputBytes: MAX_LABEL_INPUT_BYTES,
      maxOutputBytes: MAX_LABEL_PROCESSED_BYTES,
      maxDimension: 1600,
      jpegQuality: 80,
    });
    dataUrl = prepared.dataUrl;
  } catch (error) {
    if (
      error instanceof OpenAiImagePreparationError &&
      error.code === "output_too_large"
    ) {
      return NextResponse.json({ error: "Label image is too large" }, { status: 413 });
    }
    throw error;
  }

  const openai = new OpenAI({ apiKey });

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

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
                  "primary_grape_suggestions, primary_grape_confidence, confidence, warnings. " +
                  "Appellation must be place-based only (for example Saint-Aubin, Pauillac, Barolo). " +
                  "Classification must hold quality tiers or legal quality markers (for example Premier Cru, Grand Cru Classe, DOCG). " +
                  "For wine_type, classify as exactly one of: red, white, rose, sparkling, sweet, orange. " +
                  "Use the label color, style, region, grape variety, and description to determine wine_type. " +
                  "Return null for wine_type only if genuinely impossible to determine from the label. " +
                  "For primary_grape_suggestions, include canonical grape variety names and be conservative: prefer one grape by default, " +
                  "only return multiple grapes if the label explicitly shows a blend or the style implies a highly certain blend. " +
                  "Do not infer wine_name, producer, or vintage from bottle shape, capsule color, or scene context; require readable label evidence. " +
                  "If readable label text is insufficient, return null for scalar fields instead of guessing. " +
                  "Do not guess multiple grapes from weak regional hints alone. Use null for unknown scalar fields, [] for unknown grapes. " +
                  "Both confidence fields are 0-1.",
              },
              { type: "input_image", image_url: dataUrl, detail: "high" },
            ],
          },
        ],
        safety_identifier: user.id,
      },
      { signal: controller.signal }
    );

    const outputText =
      "output_text" in response && typeof response.output_text === "string"
        ? response.output_text
        : "";
    if (!outputText.trim()) {
      return NextResponse.json(
        { error: "No data returned from label analysis" },
        { status: 422 }
      );
    }

    const parsed = responseSchema.safeParse(extractJson(outputText));
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Unable to parse label data" },
        { status: 422 }
      );
    }

    const data = parsed.data;
    const rawWineType = normalize(data.wine_type);
    const wine_type = isValidWineType(rawWineType) ? rawWineType : null;

    return NextResponse.json({
      wine_name:
        normalizeWineNameText(data.wine_name) ?? normalize(data.wine_name),
      producer: normalizeProducerText(data.producer) ?? normalize(data.producer),
      vintage: normalize(data.vintage),
      country: normalize(data.country),
      region: normalize(data.region),
      appellation: normalize(data.appellation),
      classification: normalize(data.classification),
      wine_type,
      primary_grape_suggestions: normalizeGrapeSuggestions(
        data.primary_grape_suggestions
      ),
      primary_grape_confidence: data.primary_grape_confidence ?? null,
      confidence: data.confidence ?? null,
      warnings: data.warnings ?? [],
    }, {
      headers: rateLimitHeaders(rateLimit),
    });
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      return NextResponse.json({ error: "Request timed out" }, { status: 504 });
    }
    if (error instanceof OpenAI.APIError) {
      return NextResponse.json(
        { error: error.message || "OpenAI request failed" },
        { status: error.status ?? 500 }
      );
    }
    return NextResponse.json({ error: "Autofill failed" }, { status: 500 });
  } finally {
    clearTimeout(timeout);
  }
}

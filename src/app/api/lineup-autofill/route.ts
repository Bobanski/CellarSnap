import { NextResponse } from "next/server";
import { z } from "zod";
import OpenAI from "openai";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const wineSchema = z.object({
  wine_name: z.string().nullable().optional(),
  producer: z.string().nullable().optional(),
  vintage: z.string().nullable().optional(),
  country: z.string().nullable().optional(),
  region: z.string().nullable().optional(),
  appellation: z.string().nullable().optional(),
  classification: z.string().nullable().optional(),
  primary_grape_suggestions: z.array(z.string()).optional(),
  confidence: z.number().min(0).max(1).nullable().optional(),
  bottle_bbox: z
    .object({
      x: z.number(),
      y: z.number(),
      width: z.number(),
      height: z.number(),
    })
    .nullable()
    .optional(),
  label_bbox: z
    .object({
      x: z.number(),
      y: z.number(),
      width: z.number(),
      height: z.number(),
    })
    .nullable()
    .optional(),
  label_anchor: z
    .object({
      x: z.number(),
      y: z.number(),
    })
    .nullable()
    .optional(),
});

const responseSchema = z.object({
  wines: z.array(wineSchema),
  total_bottles_detected: z.number().int().min(0).optional(),
});

const TIMEOUT_MS = 55000;
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;

function normalize(value?: string | null) {
  if (value === undefined || value === null) return null;
  const trimmed = value.trim();
  return trimmed.length ? trimmed : null;
}

function normalizeBottleBbox(value?: {
  x?: number;
  y?: number;
  width?: number;
  height?: number;
} | null) {
  return normalizeRect(value, 0.05, 0.08);
}

function normalizeLabelBbox(value?: {
  x?: number;
  y?: number;
  width?: number;
  height?: number;
} | null) {
  return normalizeRect(value, 0.03, 0.03);
}

function normalizeRect(
  value:
    | {
        x?: number;
        y?: number;
        width?: number;
        height?: number;
      }
    | null
    | undefined,
  minWidth: number,
  minHeight: number
) {
  if (!value) return null;

  const x = Number(value.x);
  const y = Number(value.y);
  const width = Number(value.width);
  const height = Number(value.height);

  if (
    !Number.isFinite(x) ||
    !Number.isFinite(y) ||
    !Number.isFinite(width) ||
    !Number.isFinite(height)
  ) {
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

  return {
    x: clampedX,
    y: clampedY,
    width: finalWidth,
    height: finalHeight,
  };
}

function normalizeAnchor(value?: { x?: number; y?: number } | null) {
  if (!value) return null;

  const x = Number(value.x);
  const y = Number(value.y);
  if (!Number.isFinite(x) || !Number.isFinite(y)) {
    return null;
  }

  return {
    x: Math.min(1, Math.max(0, x)),
    y: Math.min(1, Math.max(0, y)),
  };
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
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
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

  const file = formData.get("photo");
  if (!(file instanceof File)) {
    return NextResponse.json(
      { error: "Photo is required" },
      { status: 400 }
    );
  }
  if (!file.type.startsWith("image/")) {
    return NextResponse.json(
      { error: "File must be an image" },
      { status: 400 }
    );
  }
  if (file.size > MAX_IMAGE_BYTES) {
    return NextResponse.json(
      { error: "Image is too large (max 8 MB)" },
      { status: 413 }
    );
  }

  const arrayBuffer = await file.arrayBuffer();
  const base64 = Buffer.from(arrayBuffer).toString("base64");
  const mimeType = file.type || "image/jpeg";
  const dataUrl = `data:${mimeType};base64,${base64}`;

  const openai = new OpenAI({ apiKey });

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const response = await openai.responses.create(
      {
        model: "gpt-5-mini",
        reasoning: { effort: "minimal" },
        max_output_tokens: 6000,
        text: {
          format: {
            type: "json_schema",
            name: "lineup_autofill",
            strict: true,
            schema: {
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
                  "This photo shows one or more wine bottles. First, count every distinct bottle visible in the image. " +
                  "Then, for each bottle, extract as much label information as you can read. " +
                  "Return JSON with 'total_bottles_detected' (integer, generated first) followed by a 'wines' array (one object per bottle, left-to-right order). " +
                  "CRITICAL: wines array length MUST equal total_bottles_detected. Do not omit bottles because labels are unreadable or partially occluded. " +
                  "If text is unreadable, still include that bottle object with null fields, empty grape array, and low confidence. " +
                  "Each wine object has keys: wine_name, producer, vintage, country, region, appellation, classification, primary_grape_suggestions, confidence, bottle_bbox, label_bbox, label_anchor. " +
                  "bottle_bbox is a normalized box for the full bottle silhouette with keys x, y, width, height in 0-1 image coordinates; use null if uncertain. " +
                  "The box should include the whole bottle from top to bottom with a little padding and must align to the same bottle represented by that wine object. " +
                  "label_bbox is a normalized rectangle for the primary front body label with keys x, y, width, height; use null if that label is not visible. " +
                  "The label_bbox must tightly frame the main front label and stay inside the same bottle. Do not include neck labels, foil, shoulder emblems, or bottle top. " +
                  "label_anchor is a normalized point with x and y at the visual center of the bottle's primary front label; use null if the label center is not visible. " +
                  "The label_anchor must target the main body label and not the neck label, capsule foil, shoulder badge, crest, or bottle top. " +
                  "Appellation must be place-based only (e.g. Saint-Aubin, Pauillac, Barolo). " +
                  "Classification must hold quality tiers or legal quality markers (e.g. Premier Cru, Grand Cru Classe, DOCG). " +
                  "For primary_grape_suggestions, include canonical grape variety names. " +
                  "Infer grapes from what is stated on the label, the wine name, and from high-confidence regional associations " +
                  "(e.g. Barolo -> Nebbiolo, Chablis -> Chardonnay, Sancerre -> Sauvignon Blanc, Chianti -> Sangiovese). " +
                  "Only include grapes you are highly confident about. Use [] if unsure. " +
                  "Use null for fields you cannot determine. confidence is 0-1 per bottle. " +
                  "If only one bottle is visible, return an array with one element.",
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
        { error: "No data returned from image analysis" },
        { status: 422 }
      );
    }

    const parsed = responseSchema.safeParse(extractJson(outputText));
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Unable to parse bottle data" },
        { status: 422 }
      );
    }

    const wines = parsed.data.wines.map((wine) => ({
      wine_name: normalize(wine.wine_name),
      producer: normalize(wine.producer),
      vintage: normalize(wine.vintage),
      country: normalize(wine.country),
      region: normalize(wine.region),
      appellation: normalize(wine.appellation),
      classification: normalize(wine.classification),
      primary_grape_suggestions: (wine.primary_grape_suggestions ?? [])
        .map((s) => s.trim())
        .filter((s) => s.length > 0)
        .slice(0, 3),
      confidence: wine.confidence ?? null,
      bottle_bbox: normalizeBottleBbox(wine.bottle_bbox),
      label_bbox: normalizeLabelBbox(wine.label_bbox),
      label_anchor: normalizeAnchor(wine.label_anchor),
    }));

    return NextResponse.json({
      wines,
      total_bottles_detected: parsed.data.total_bottles_detected ?? wines.length,
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
    return NextResponse.json(
      { error: "Lineup analysis failed" },
      { status: 500 }
    );
  } finally {
    clearTimeout(timeout);
  }
}

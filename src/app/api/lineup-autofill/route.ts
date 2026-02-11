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
});

const responseSchema = z.object({
  wines: z.array(wineSchema),
  total_bottles_detected: z.number().int().min(0).optional(),
});

const TIMEOUT_MS = 30000;
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;

function normalize(value?: string | null) {
  if (value === undefined || value === null) return null;
  const trimmed = value.trim();
  return trimmed.length ? trimmed : null;
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
        reasoning: { effort: "medium" },
        max_output_tokens: 2000,
        text: {
          format: {
            type: "json_schema",
            name: "lineup_autofill",
            strict: true,
            schema: {
              type: "object",
              additionalProperties: false,
              properties: {
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
                    ],
                  },
                },
                total_bottles_detected: { type: "number" },
              },
              required: ["wines", "total_bottles_detected"],
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
                  "This photo shows one or more wine bottles. Identify each unique bottle visible in the image. " +
                  "For each bottle, extract as much label information as you can read. " +
                  "Return JSON with a 'wines' array (one object per bottle, left-to-right order) and 'total_bottles_detected' (integer). " +
                  "Each wine object has keys: wine_name, producer, vintage, country, region, appellation, classification, primary_grape_suggestions, confidence. " +
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

import { NextResponse } from "next/server";
import { z } from "zod";
import OpenAI from "openai";

const responseSchema = z.object({
  wine_name: z.string().nullable().optional(),
  producer: z.string().nullable().optional(),
  vintage: z.string().nullable().optional(),
  country: z.string().nullable().optional(),
  region: z.string().nullable().optional(),
  appellation: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
  confidence: z.number().min(0).max(1).optional(),
  warnings: z.array(z.string()).optional(),
});

const TIMEOUT_MS = 15000;

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
        response_format: {
          type: "json_schema",
          json_schema: {
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
                notes: { type: ["string", "null"] },
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
                "notes",
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
                  "You are extracting wine label info. Return ONLY JSON with keys: " +
                  "wine_name, producer, vintage, country, region, appellation, notes, confidence, warnings. " +
                  "Use null for unknown values. confidence is 0-1.",
              },
              { type: "input_image", image_url: dataUrl, detail: "high" },
            ],
          },
        ],
      } as unknown as Parameters<typeof openai.responses.create>[0],
      { signal: controller.signal }
    );

    const outputText =
      "output_text" in response && typeof response.output_text === "string"
        ? response.output_text
        : "";
    const parsed = responseSchema.safeParse(extractJson(outputText));
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Unable to parse label data" },
        { status: 422 }
      );
    }

    const data = parsed.data;
    return NextResponse.json({
      wine_name: normalize(data.wine_name),
      producer: normalize(data.producer),
      vintage: normalize(data.vintage),
      country: normalize(data.country),
      region: normalize(data.region),
      appellation: normalize(data.appellation),
      notes: normalize(data.notes),
      confidence: data.confidence ?? null,
      warnings: data.warnings ?? [],
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

import { NextResponse } from "next/server";
import OpenAI from "openai";
import { z } from "zod";
import { applyRateLimit, rateLimitHeaders } from "@/lib/rateLimit";
import { requireRequestAuth, RequestAuthError } from "@/server/auth/requestAuth";
import {
  OpenAiImagePreparationError,
  prepareOpenAiImageDataUrl,
} from "@/server/images/openAiImage";

const responseSchema = z.object({
  tag: z.enum(["place", "pairing", "people", "other_bottles", "unknown"]),
  confidence: z.number().min(0).max(1).nullable().optional(),
});

const TIMEOUT_MS = 20000;
const MAX_IMAGE_INPUT_BYTES = 24 * 1024 * 1024;
const MAX_IMAGE_PROCESSED_BYTES = 8 * 1024 * 1024;
const RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000;
const RATE_LIMIT_MAX_REQUESTS = 180;

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
    routeKey: "photo-context",
    windowMs: RATE_LIMIT_WINDOW_MS,
    maxRequests: RATE_LIMIT_MAX_REQUESTS,
    userId: user.id,
  });
  if (!rateLimit.allowed) {
    return NextResponse.json(
      {
        error:
          "Too many photo context checks in a short time. Please wait a bit and try again.",
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

  const file = formData.get("photo");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Photo is required" }, { status: 400 });
  }
  if (!file.type.startsWith("image/")) {
    return NextResponse.json({ error: "File must be an image" }, { status: 400 });
  }
  if (file.size > MAX_IMAGE_INPUT_BYTES) {
    return NextResponse.json(
      { error: "Image is too large (max 24 MB)" },
      { status: 413 }
    );
  }

  let dataUrl: string;
  try {
    const prepared = await prepareOpenAiImageDataUrl(file, {
      maxInputBytes: MAX_IMAGE_INPUT_BYTES,
      maxOutputBytes: MAX_IMAGE_PROCESSED_BYTES,
      maxDimension: 1600,
      jpegQuality: 80,
    });
    dataUrl = prepared.dataUrl;
  } catch (error) {
    if (
      error instanceof OpenAiImagePreparationError &&
      error.code === "output_too_large"
    ) {
      return NextResponse.json(
        { error: "Image is too large (max 8 MB after processing)" },
        { status: 413 }
      );
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
        max_output_tokens: 200,
        text: {
          format: {
            type: "json_schema",
            name: "photo_context",
            strict: true,
            schema: {
              type: "object",
              additionalProperties: false,
              properties: {
                tag: {
                  type: "string",
                  enum: [
                    "place",
                    "pairing",
                    "people",
                    "other_bottles",
                    "unknown",
                  ],
                },
                confidence: { type: ["number", "null"] },
              },
              required: ["tag", "confidence"],
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
                  "Classify this wine-entry photo into one tag based on PRIMARY PHOTO INTENT.\n" +
                  "Intent first, object presence second.\n" +
                  "people = one or more people are the main subject, even if bottles are visible.\n" +
                  "pairing = food/drink pairing is the main subject, even if bottles are visible.\n" +
                  "place = venue/location/environment is the main subject (table, room, bar, scenery).\n" +
                  "other_bottles = bottle(s) are the dominant subject (hero bottle shot, cellar/shelf/bottle-focused scene with weak people/place/pairing intent).\n" +
                  "unknown = ambiguous/uncertain.\n" +
                  "Use bottle prominence/proximity only as a tiebreaker when intent is unclear.\n" +
                  "If intent appears social or environmental, prefer people/place/pairing over other_bottles even when a bottle is near the center.\n" +
                  "Return exactly one tag and confidence 0-1.",
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
        { error: "No context returned from image analysis" },
        { status: 422 }
      );
    }

    const parsed = responseSchema.safeParse(extractJson(outputText));
    if (!parsed.success) {
      return NextResponse.json({ error: "Unable to parse context tag" }, { status: 422 });
    }

    return NextResponse.json(
      {
        tag: parsed.data.tag,
        confidence:
          typeof parsed.data.confidence === "number" &&
          Number.isFinite(parsed.data.confidence)
            ? Math.min(1, Math.max(0, parsed.data.confidence))
            : null,
      },
      {
        headers: rateLimitHeaders(rateLimit),
      }
    );
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
    return NextResponse.json({ error: "Photo context tagging failed" }, { status: 500 });
  } finally {
    clearTimeout(timeout);
  }
}

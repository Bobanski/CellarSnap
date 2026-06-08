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
  total_bottles_detected: z.number().min(0),
});

const TIMEOUT_MS = 12000;
const MAX_IMAGE_INPUT_BYTES = 24 * 1024 * 1024;
const MAX_IMAGE_PROCESSED_BYTES = 8 * 1024 * 1024;
const RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000;
const RATE_LIMIT_MAX_REQUESTS = 120;

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
    routeKey: "bottle-count",
    windowMs: RATE_LIMIT_WINDOW_MS,
    maxRequests: RATE_LIMIT_MAX_REQUESTS,
    userId: user.id,
  });
  if (!rateLimit.allowed) {
    return NextResponse.json(
      {
        error:
          "Too many bottle-count checks in a short time. Please wait a bit and try again.",
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
        max_output_tokens: 160,
        text: {
          format: {
            type: "json_schema",
            name: "bottle_count",
            strict: true,
            schema: {
              type: "object",
              additionalProperties: false,
              properties: {
                total_bottles_detected: { type: "number" },
              },
              required: ["total_bottles_detected"],
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
                  "Count distinct wine bottles that are clearly visible foreground bottle subjects with visible bottle silhouette and/or label area, even if label text is partially unreadable. " +
                  "Ignore tiny/blurred background bottles, reflections, wine glasses, people, and bottle-like background objects. " +
                  "If you are unsure something is a wine bottle, exclude it. " +
                  "Return only total_bottles_detected as a non-negative integer.",
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
        { error: "No count returned from image analysis" },
        { status: 422 }
      );
    }

    const parsed = responseSchema.safeParse(extractJson(outputText));
    if (!parsed.success) {
      return NextResponse.json({ error: "Unable to parse bottle count" }, { status: 422 });
    }

    return NextResponse.json({
      total_bottles_detected: Math.max(
        0,
        Math.round(parsed.data.total_bottles_detected)
      ),
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
    return NextResponse.json({ error: "Bottle count failed" }, { status: 500 });
  } finally {
    clearTimeout(timeout);
  }
}

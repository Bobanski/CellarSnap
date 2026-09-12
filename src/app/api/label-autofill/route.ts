import { NextResponse } from "next/server";
import { applyRateLimit, rateLimitHeaders } from "@/lib/rateLimit";
import { requireRequestAuth, RequestAuthError } from "@/server/auth/requestAuth";
import {
  OpenAiImagePreparationError,
  prepareOpenAiImageDataUrl,
} from "@/server/images/openAiImage";
import {
  extractWineLabelFromDataUrl,
  WineLabelExtractionError,
} from "@/server/labelAutofill/extractWineLabel";

const MAX_LABEL_INPUT_BYTES = 24 * 1024 * 1024;
const MAX_LABEL_PROCESSED_BYTES = 8 * 1024 * 1024;
const RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000;
const RATE_LIMIT_MAX_REQUESTS = 120;

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

  try {
    const extraction = await extractWineLabelFromDataUrl(dataUrl, {
      apiKey,
      userId: user.id,
    });

    return NextResponse.json(extraction, {
      headers: rateLimitHeaders(rateLimit),
    });
  } catch (error) {
    if (error instanceof WineLabelExtractionError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    return NextResponse.json({ error: "Autofill failed" }, { status: 500 });
  }
}

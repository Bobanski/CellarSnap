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
const MAX_IMAGE_INPUT_BYTES = 24 * 1024 * 1024;
const MAX_IMAGE_PROCESSED_BYTES = 8 * 1024 * 1024;
const RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000;
const RATE_LIMIT_MAX_REQUESTS = 60;
const MIN_CROP_SIDE = 8;
const DEFAULT_CROP_OUTPUT_SIZE = 960;

type NormalizedRect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

type NormalizedAnchor = {
  x: number;
  y: number;
};

type SharpFactory = (
  input: Buffer,
  options?: Record<string, unknown>
) => {
  metadata: () => Promise<{ width?: number; height?: number }>;
  extract: (region: {
    left: number;
    top: number;
    width: number;
    height: number;
  }) => {
    resize: (options: {
      width: number;
      height: number;
      fit: "inside";
      withoutEnlargement: boolean;
    }) => {
      jpeg: (options: { quality: number; mozjpeg: boolean }) => {
        toBuffer: () => Promise<Buffer>;
      };
    };
  };
};

let sharpFactoryPromise: Promise<SharpFactory | null> | null = null;

function normalize(value?: string | null) {
  if (value === undefined || value === null) return null;
  const trimmed = value.trim();
  return trimmed.length ? trimmed : null;
}

function hasReadableIdentityFields(wine: {
  wine_name: string | null;
  producer: string | null;
  vintage: string | null;
  country: string | null;
  region: string | null;
  appellation: string | null;
  classification: string | null;
}) {
  return Boolean(
    wine.wine_name ||
      wine.producer ||
      wine.vintage ||
      wine.country ||
      wine.region ||
      wine.appellation ||
      wine.classification
  );
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

async function loadSharpFactory() {
  if (!sharpFactoryPromise) {
    sharpFactoryPromise = import("sharp")
      .then((module) => {
        const candidate = (module as { default?: unknown }).default;
        return typeof candidate === "function"
          ? (candidate as SharpFactory)
          : null;
      })
      .catch(() => null);
  }
  return sharpFactoryPromise;
}

function parseImageDataUrl(dataUrl: string) {
  const match = /^data:(image\/[a-z0-9.+-]+);base64,(.+)$/i.exec(dataUrl.trim());
  if (!match) {
    return null;
  }

  try {
    return {
      mimeType: match[1].toLowerCase(),
      buffer: Buffer.from(match[2], "base64"),
    };
  } catch {
    return null;
  }
}

function computeBottleCrop({
  imageWidth,
  imageHeight,
  bottleBbox,
  labelBbox,
  labelAnchor,
}: {
  imageWidth: number;
  imageHeight: number;
  bottleBbox: NormalizedRect | null;
  labelBbox: NormalizedRect | null;
  labelAnchor: NormalizedAnchor | null;
}) {
  if (!bottleBbox) {
    return null;
  }

  const boxX = Math.round(bottleBbox.x * imageWidth);
  const boxY = Math.round(bottleBbox.y * imageHeight);
  const boxWidth = Math.round(bottleBbox.width * imageWidth);
  const boxHeight = Math.round(bottleBbox.height * imageHeight);

  if (boxWidth < MIN_CROP_SIDE || boxHeight < MIN_CROP_SIDE) {
    return null;
  }

  const horizontalPadding = Math.round(boxWidth * 0.16);
  const cropX = Math.max(0, boxX - horizontalPadding);
  const cropRight = Math.min(imageWidth, boxX + boxWidth + horizontalPadding);
  const cropWidth = cropRight - cropX;
  const side = Math.round(Math.min(cropWidth, imageWidth, imageHeight));

  if (side < MIN_CROP_SIDE) {
    return null;
  }

  const inferredLabelTop = boxY + boxHeight * 0.28;
  const inferredLabelBottom = boxY + boxHeight * 0.82;
  let labelTop = inferredLabelTop;
  let labelBottom = inferredLabelBottom;

  if (labelBbox) {
    const modelLabelTop = labelBbox.y * imageHeight;
    const modelLabelBottom = (labelBbox.y + labelBbox.height) * imageHeight;
    const boundedTop = Math.max(
      boxY + boxHeight * 0.12,
      Math.min(boxY + boxHeight * 0.9, modelLabelTop)
    );
    const boundedBottom = Math.max(
      boundedTop + MIN_CROP_SIDE,
      Math.min(boxY + boxHeight * 0.95, modelLabelBottom)
    );
    if (boundedBottom - boundedTop >= MIN_CROP_SIDE) {
      labelTop = boundedTop;
      labelBottom = boundedBottom;
    }
  }

  const labelHeight = Math.max(MIN_CROP_SIDE, labelBottom - labelTop);
  const labelCenterY = labelTop + labelHeight / 2;
  const anchorY = labelAnchor ? labelAnchor.y * imageHeight : null;
  const anchorIsReasonable =
    typeof anchorY === "number" &&
    Number.isFinite(anchorY) &&
    anchorY >= labelTop - boxHeight * 0.08 &&
    anchorY <= labelBottom + boxHeight * 0.18;
  const blendedCenterY = anchorIsReasonable
    ? labelCenterY * 0.7 + anchorY * 0.3
    : labelCenterY;

  const focusY = blendedCenterY + labelHeight * 0.16;
  const minY = labelTop + labelHeight * 0.2;
  const maxY = labelBottom + labelHeight * 0.9;
  const constrainedFocusY = Math.min(maxY, Math.max(minY, focusY));
  const cropY = Math.min(
    Math.max(0, Math.round(constrainedFocusY - side / 2)),
    Math.max(0, imageHeight - side)
  );
  const cropLeft = Math.min(Math.max(0, Math.round(cropX)), Math.max(0, imageWidth - side));

  return {
    left: cropLeft,
    top: cropY,
    width: side,
    height: side,
  };
}

async function createFocusCropDataUrls({
  sourceDataUrl,
  wines,
}: {
  sourceDataUrl: string;
  wines: Array<{
    bottle_bbox: NormalizedRect | null;
    label_bbox: NormalizedRect | null;
    label_anchor: NormalizedAnchor | null;
  }>;
}) {
  const parsed = parseImageDataUrl(sourceDataUrl);
  if (!parsed) {
    return wines.map(() => null as string | null);
  }

  const sharpFactory = await loadSharpFactory();
  if (!sharpFactory) {
    return wines.map(() => null as string | null);
  }

  let width = 0;
  let height = 0;
  try {
    const metadata = await sharpFactory(parsed.buffer, { failOn: "none" }).metadata();
    width = metadata.width ?? 0;
    height = metadata.height ?? 0;
  } catch {
    return wines.map(() => null as string | null);
  }

  if (width < MIN_CROP_SIDE || height < MIN_CROP_SIDE) {
    return wines.map(() => null as string | null);
  }

  const outputs = await Promise.all(
    wines.map(async (wine) => {
      const crop = computeBottleCrop({
        imageWidth: width,
        imageHeight: height,
        bottleBbox: wine.bottle_bbox,
        labelBbox: wine.label_bbox,
        labelAnchor: wine.label_anchor,
      });

      if (!crop) {
        return null;
      }

      try {
        const croppedBuffer = await sharpFactory(parsed.buffer, { failOn: "none" })
          .extract(crop)
          .resize({
            width: DEFAULT_CROP_OUTPUT_SIZE,
            height: DEFAULT_CROP_OUTPUT_SIZE,
            fit: "inside",
            withoutEnlargement: true,
          })
          .jpeg({
            quality: 88,
            mozjpeg: true,
          })
          .toBuffer();

        if (!croppedBuffer.byteLength) {
          return null;
        }

        return `data:image/jpeg;base64,${croppedBuffer.toString("base64")}`;
      } catch {
        return null;
      }
    })
  );

  return outputs;
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
    routeKey: "lineup-autofill",
    windowMs: RATE_LIMIT_WINDOW_MS,
    maxRequests: RATE_LIMIT_MAX_REQUESTS,
    userId: user.id,
  });
  if (!rateLimit.allowed) {
    return NextResponse.json(
      {
        error:
          "Too many lineup scans in a short time. Please wait a bit and try again.",
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
                  "This photo shows one or more wine bottles. Identify the bottles that are relevant for creating entries: " +
                  "focus on the main lineup / foreground bottles that are clearly bottle subjects with visible label area, even if text is partially unreadable. " +
                  "Ignore tiny/blurred background bottles, reflections, posters, glassware, bottle-like shapes, and non-bottle objects. " +
                  "Return JSON with 'total_bottles_detected' (integer, generated first) followed by a 'wines' array (one object per included bottle, left-to-right order). " +
                  "CRITICAL: include each clearly visible foreground bottle once, even when readable identity details are limited. " +
                  "Do not guess winery or cuvee names from bottle shape, foil color, capsule, scene context, or prior popularity; use readable label evidence only. " +
                  "For wine_name, producer, and vintage, set null unless there is explicit readable text supporting that exact value. " +
                  "If a bottle has little/no readable identifying text, keep it in wines but set unknown fields to null. " +
                  "If you are unsure something is a wine bottle, exclude it. " +
                  "wines array length MUST equal total_bottles_detected. total_bottles_detected should equal wines.length. " +
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
      wine_name:
        normalizeWineNameText(wine.wine_name) ?? normalize(wine.wine_name),
      producer: normalizeProducerText(wine.producer) ?? normalize(wine.producer),
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

    const focusCrops = await createFocusCropDataUrls({
      sourceDataUrl: dataUrl,
      wines,
    });

    const winesWithCrops = wines.map((wine, index) => ({
      ...wine,
      focus_crop_data_url: focusCrops[index] ?? null,
    }));

    const reportedBottleCount =
      typeof parsed.data.total_bottles_detected === "number" &&
      Number.isFinite(parsed.data.total_bottles_detected)
        ? Math.max(0, Math.round(parsed.data.total_bottles_detected))
        : 0;

    const filteredWines = winesWithCrops.filter((wine) => {
      return (
        hasReadableIdentityFields(wine) ||
        Boolean(wine.bottle_bbox || wine.label_bbox || wine.label_anchor)
      );
    });

    const detectedBottleCount = Math.max(reportedBottleCount, filteredWines.length);

    return NextResponse.json({
      wines: filteredWines,
      total_bottles_detected: detectedBottleCount,
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
    return NextResponse.json(
      { error: "Lineup analysis failed" },
      { status: 500 }
    );
  } finally {
    clearTimeout(timeout);
  }
}

type OpenAiImagePreparationCode =
  | "input_too_large"
  | "output_too_large"
  | "unsupported_format";

export class OpenAiImagePreparationError extends Error {
  code: OpenAiImagePreparationCode;

  constructor(code: OpenAiImagePreparationCode, message: string) {
    super(message);
    this.name = "OpenAiImagePreparationError";
    this.code = code;
  }
}

export type PrepareOpenAiImageOptions = {
  maxInputBytes?: number;
  maxOutputBytes?: number;
  maxDimension?: number;
  jpegQuality?: number;
};

export type PreparedOpenAiImage = {
  dataUrl: string;
  mimeType: string;
  byteLength: number;
  transformed: boolean;
};

type SharpFactory = (
  input: Buffer,
  options?: Record<string, unknown>
) => {
  metadata: () => Promise<{ width?: number; height?: number; format?: string }>;
  rotate: () => {
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

const DEFAULT_MAX_INPUT_BYTES = 24 * 1024 * 1024;
const DEFAULT_MAX_OUTPUT_BYTES = 8 * 1024 * 1024;
const DEFAULT_MAX_DIMENSION = 1600;
const DEFAULT_JPEG_QUALITY = 80;
const FALLBACK_IMAGE_MIME = "image/jpeg";
const OPENAI_SUPPORTED_IMAGE_MIMES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
]);

let sharpFactoryPromise: Promise<SharpFactory | null> | null = null;

function normalizeMimeType(mimeType: string | null | undefined) {
  if (mimeType && mimeType.startsWith("image/")) {
    return mimeType;
  }
  return FALLBACK_IMAGE_MIME;
}

function mimeTypeForSharpFormat(format?: string) {
  const normalized = format?.toLowerCase();
  if (!normalized) {
    return null;
  }
  if (normalized === "jpeg" || normalized === "jpg") {
    return "image/jpeg";
  }
  if (normalized === "png") {
    return "image/png";
  }
  if (normalized === "webp") {
    return "image/webp";
  }
  if (normalized === "heif" || normalized === "heic") {
    return "image/heic";
  }
  if (normalized === "gif") {
    return "image/gif";
  }
  return null;
}

async function loadSharpFactory(): Promise<SharpFactory | null> {
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

async function maybeResizeForAi(
  sourceBuffer: Buffer,
  sourceMimeType: string,
  maxDimension: number,
  jpegQuality: number
): Promise<{ buffer: Buffer; mimeType: string; transformed: boolean }> {
  const sharpFactory = await loadSharpFactory();
  if (!sharpFactory) {
    if (!OPENAI_SUPPORTED_IMAGE_MIMES.has(sourceMimeType)) {
      throw new OpenAiImagePreparationError(
        "unsupported_format",
        "Image format is not supported for AI processing."
      );
    }
    return {
      buffer: sourceBuffer,
      mimeType: sourceMimeType,
      transformed: false,
    };
  }

  try {
    const metadata = await sharpFactory(sourceBuffer, { failOn: "none" }).metadata();
    const width = metadata.width ?? 0;
    const height = metadata.height ?? 0;
    const detectedMimeType = mimeTypeForSharpFormat(metadata.format) ?? sourceMimeType;
    const withinBounds = Math.max(width, height) <= maxDimension;
    const supportsDirectUpload = OPENAI_SUPPORTED_IMAGE_MIMES.has(detectedMimeType);

    if (supportsDirectUpload && withinBounds) {
      return {
        buffer: sourceBuffer,
        mimeType: detectedMimeType,
        transformed: detectedMimeType !== sourceMimeType,
      };
    }

    const resized = await sharpFactory(sourceBuffer, { failOn: "none" })
      .rotate()
      .resize({
        width: maxDimension,
        height: maxDimension,
        fit: "inside",
        withoutEnlargement: true,
      })
      .jpeg({
        quality: jpegQuality,
        mozjpeg: true,
      })
      .toBuffer();

    if (!resized.length) {
      if (!OPENAI_SUPPORTED_IMAGE_MIMES.has(detectedMimeType)) {
        throw new OpenAiImagePreparationError(
          "unsupported_format",
          "Image format is not supported for AI processing."
        );
      }
      return {
        buffer: sourceBuffer,
        mimeType: detectedMimeType,
        transformed: detectedMimeType !== sourceMimeType,
      };
    }

    return {
      buffer: resized,
      mimeType: "image/jpeg",
      transformed: true,
    };
  } catch {
    if (!OPENAI_SUPPORTED_IMAGE_MIMES.has(sourceMimeType)) {
      throw new OpenAiImagePreparationError(
        "unsupported_format",
        "Image format is not supported for AI processing."
      );
    }
    return {
      buffer: sourceBuffer,
      mimeType: sourceMimeType,
      transformed: false,
    };
  }
}

export async function prepareOpenAiImageDataUrl(
  file: File,
  options?: PrepareOpenAiImageOptions
): Promise<PreparedOpenAiImage> {
  const maxInputBytes = options?.maxInputBytes ?? DEFAULT_MAX_INPUT_BYTES;
  const maxOutputBytes = options?.maxOutputBytes ?? DEFAULT_MAX_OUTPUT_BYTES;
  const maxDimension = options?.maxDimension ?? DEFAULT_MAX_DIMENSION;
  const jpegQuality = options?.jpegQuality ?? DEFAULT_JPEG_QUALITY;

  if (file.size > maxInputBytes) {
    throw new OpenAiImagePreparationError(
      "input_too_large",
      "Image exceeds maximum input size."
    );
  }

  const sourceBuffer = Buffer.from(await file.arrayBuffer());
  const sourceMimeType = normalizeMimeType(file.type);
  const prepared = await maybeResizeForAi(
    sourceBuffer,
    sourceMimeType,
    maxDimension,
    jpegQuality
  );

  if (prepared.buffer.byteLength > maxOutputBytes) {
    throw new OpenAiImagePreparationError(
      "output_too_large",
      "Image exceeds maximum processed size."
    );
  }

  return {
    dataUrl: `data:${prepared.mimeType};base64,${prepared.buffer.toString("base64")}`,
    mimeType: prepared.mimeType,
    byteLength: prepared.buffer.byteLength,
    transformed: prepared.transformed,
  };
}

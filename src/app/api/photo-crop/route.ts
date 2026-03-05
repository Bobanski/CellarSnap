import { NextResponse } from "next/server";
import { requireRequestAuth, RequestAuthError } from "@/server/auth/requestAuth";

const MAX_INPUT_BYTES = 24 * 1024 * 1024;
const MAX_OUTPUT_BYTES = 8 * 1024 * 1024;
const MIN_CROP_SIDE = 96;
const MAX_ZOOM = 4;
const OUTPUT_SIDE = 1200;

type SharpFactory = (
  input: Buffer,
  options?: Record<string, unknown>
) => {
  rotate: () => {
    metadata: () => Promise<{ width?: number; height?: number }>;
    extract: (region: {
      left: number;
      top: number;
      width: number;
      height: number;
    }) => {
      resize: (options: { width: number; height: number; fit: "inside" }) => {
        jpeg: (options: { quality: number; mozjpeg: boolean }) => {
          toBuffer: () => Promise<Buffer>;
        };
      };
    };
  };
};

let sharpFactoryPromise: Promise<SharpFactory | null> | null = null;

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

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function parseCenterPercent(value: FormDataEntryValue | null, fallback: number) {
  if (typeof value !== "string") {
    return fallback;
  }
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  return clamp(parsed, 0, 100);
}

function parseZoom(value: FormDataEntryValue | null, fallback: number) {
  if (typeof value !== "string") {
    return fallback;
  }
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  return clamp(parsed, 1, MAX_ZOOM);
}

function parseImageDataUrl(value: string) {
  const match = /^data:(image\/[a-z0-9.+-]+);base64,([a-z0-9+/=\s]+)$/i.exec(
    value.trim()
  );
  if (!match?.[1] || !match[2]) {
    return null;
  }

  const base64Payload = match[2].replace(/\s+/g, "");
  if (base64Payload.length === 0) {
    return null;
  }

  try {
    const buffer = Buffer.from(base64Payload, "base64");
    if (buffer.byteLength === 0) {
      return null;
    }
    return {
      mimeType: match[1].toLowerCase(),
      buffer,
    };
  } catch {
    return null;
  }
}

export async function POST(request: Request) {
  try {
    await requireRequestAuth(request);
  } catch (error) {
    if (error instanceof RequestAuthError) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    throw error;
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json({ error: "Invalid form data." }, { status: 400 });
  }

  const file = formData.get("photo");
  const dataUrlInput = formData.get("photo_data_url");
  let sourceBuffer: Buffer | null = null;

  if (file instanceof File && file.type.startsWith("image/")) {
    if (file.size > MAX_INPUT_BYTES) {
      return NextResponse.json(
        { error: "Image is too large (max 24 MB)." },
        { status: 413 }
      );
    }
    sourceBuffer = Buffer.from(await file.arrayBuffer());
  } else if (typeof dataUrlInput === "string") {
    const parsed = parseImageDataUrl(dataUrlInput);
    if (!parsed || !parsed.mimeType.startsWith("image/")) {
      return NextResponse.json({ error: "Invalid image data." }, { status: 400 });
    }
    if (parsed.buffer.byteLength > MAX_INPUT_BYTES) {
      return NextResponse.json(
        { error: "Image is too large (max 24 MB)." },
        { status: 413 }
      );
    }
    sourceBuffer = parsed.buffer;
  }

  if (!sourceBuffer || sourceBuffer.byteLength === 0) {
    return NextResponse.json({ error: "Photo is required." }, { status: 400 });
  }

  const sharpFactory = await loadSharpFactory();
  if (!sharpFactory) {
    return NextResponse.json(
      { error: "Image crop support unavailable." },
      { status: 503 }
    );
  }

  const centerXPercent = parseCenterPercent(formData.get("center_x"), 50);
  const centerYPercent = parseCenterPercent(formData.get("center_y"), 50);
  const zoom = parseZoom(formData.get("zoom"), 1);

  try {
    const image = sharpFactory(sourceBuffer, { failOn: "none" }).rotate();
    const metadata = await image.metadata();
    const width = metadata.width ?? 0;
    const height = metadata.height ?? 0;

    if (width < MIN_CROP_SIDE || height < MIN_CROP_SIDE) {
      return NextResponse.json(
        { error: "Image is too small to crop." },
        { status: 422 }
      );
    }

    const baseSide = Math.min(width, height);
    const cropSide = Math.max(
      MIN_CROP_SIDE,
      Math.min(baseSide, Math.round(baseSide / zoom))
    );
    const centerX = (centerXPercent / 100) * width;
    const centerY = (centerYPercent / 100) * height;
    const left = Math.round(clamp(centerX - cropSide / 2, 0, width - cropSide));
    const top = Math.round(clamp(centerY - cropSide / 2, 0, height - cropSide));

    const croppedBuffer = await image
      .extract({
        left,
        top,
        width: cropSide,
        height: cropSide,
      })
      .resize({
        width: Math.min(OUTPUT_SIDE, cropSide),
        height: Math.min(OUTPUT_SIDE, cropSide),
        fit: "inside",
      })
      .jpeg({
        quality: 88,
        mozjpeg: true,
      })
      .toBuffer();

    if (croppedBuffer.byteLength > MAX_OUTPUT_BYTES) {
      return NextResponse.json(
        { error: "Cropped image is too large." },
        { status: 413 }
      );
    }

    return NextResponse.json({
      cropped_data_url: `data:image/jpeg;base64,${croppedBuffer.toString("base64")}`,
      mime_type: "image/jpeg",
    });
  } catch {
    return NextResponse.json(
      { error: "Unable to crop this photo." },
      { status: 500 }
    );
  }
}

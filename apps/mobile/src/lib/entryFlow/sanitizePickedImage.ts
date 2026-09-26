import { manipulateAsync, SaveFormat } from "expo-image-manipulator";

export type SanitizedPickedImage = {
  uri: string;
  fileName: string;
  mimeType: "image/jpeg";
};

const MIN_JPEG_QUALITY = 0.25;
const MIN_RESIZED_WIDTH = 720;
const MAX_SIZE_REENCODE_PASSES = 6;

function jpegFileName(fileName: string | null | undefined, fallbackBaseName: string) {
  const baseName = fileName?.trim().replace(/\.[^.]+$/, "") || fallbackBaseName;
  return `${baseName}.jpg`;
}

/**
 * Re-encode a picker result before it leaves the device. This normalizes native
 * formats and avoids uploading source EXIF/IPTC metadata, including embedded GPS.
 */
export async function sanitizePickedImage({
  uri,
  fileName,
  fallbackBaseName,
  quality,
  maxBytes,
}: {
  uri: string;
  fileName?: string | null;
  fallbackBaseName: string;
  quality: number;
  maxBytes?: number;
}): Promise<SanitizedPickedImage> {
  let converted = await manipulateAsync(uri, [], {
    compress: quality,
    format: SaveFormat.JPEG,
  });

  if (maxBytes !== undefined) {
    let convertedBytes = (await (await fetch(converted.uri)).blob()).size;
    let nextQuality = quality;

    for (
      let pass = 0;
      convertedBytes > maxBytes && pass < MAX_SIZE_REENCODE_PASSES;
      pass += 1
    ) {
      const ratio = Math.sqrt(maxBytes / convertedBytes);
      const nextWidth = Math.max(
        MIN_RESIZED_WIDTH,
        Math.floor(converted.width * Math.min(0.9, Math.max(0.5, ratio * 0.9)))
      );
      nextQuality = Math.max(MIN_JPEG_QUALITY, nextQuality - 0.12);
      converted = await manipulateAsync(
        converted.uri,
        nextWidth < converted.width ? [{ resize: { width: nextWidth } }] : [],
        {
          compress: nextQuality,
          format: SaveFormat.JPEG,
        }
      );
      convertedBytes = (await (await fetch(converted.uri)).blob()).size;
    }

    if (convertedBytes > maxBytes) {
      throw new Error("Unable to reduce the image to the upload size limit.");
    }
  }

  return {
    uri: converted.uri,
    fileName: jpegFileName(fileName, fallbackBaseName),
    mimeType: "image/jpeg",
  };
}

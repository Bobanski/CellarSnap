import { manipulateAsync, SaveFormat } from "expo-image-manipulator";

export type SanitizedPickedImage = {
  uri: string;
  fileName: string;
  mimeType: "image/jpeg";
};

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
}: {
  uri: string;
  fileName?: string | null;
  fallbackBaseName: string;
  quality: number;
}): Promise<SanitizedPickedImage> {
  const converted = await manipulateAsync(uri, [], {
    compress: quality,
    format: SaveFormat.JPEG,
  });

  return {
    uri: converted.uri,
    fileName: jpegFileName(fileName, fallbackBaseName),
    mimeType: "image/jpeg",
  };
}

import ExifReader from "exifreader";

export async function extractGpsFromFile(
  file: File
): Promise<{ lat: number; lng: number } | null> {
  try {
    const buffer = await file.arrayBuffer();
    const tags = ExifReader.load(buffer, { expanded: true });

    const lat = tags.gps?.Latitude;
    const lng = tags.gps?.Longitude;

    if (typeof lat === "number" && typeof lng === "number") {
      return { lat, lng };
    }

    return null;
  } catch {
    return null;
  }
}

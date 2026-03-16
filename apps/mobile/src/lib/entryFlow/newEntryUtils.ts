import { normalizeConfidence, type PrivacyLevel } from "@cellarsnap/shared";
import { getPublicProfileName } from "@/src/lib/publicProfiles";
import { colors } from "@/src/lib/theme";

export type UploadPhotoType =
  | "label"
  | "place"
  | "people"
  | "pairing"
  | "lineup"
  | "other_bottles";

export type LegacyUploadPhotoType = "label" | "place" | "pairing";

export type AdvancedNotesPayloadInput = {
  acidity: string;
  tannin: string;
  alcohol: string;
  sweetness: string;
  body: string;
};

export const PHOTO_TYPE_LABELS: Record<UploadPhotoType, string> = {
  label: "Label",
  place: "Place",
  people: "People",
  pairing: "Pairing",
  lineup: "Lineup",
  other_bottles: "Other bottle",
};

export const PHOTO_TYPE_OPTIONS: Array<{ value: UploadPhotoType; label: string }> = [
  { value: "label", label: "Label" },
  { value: "place", label: "Place" },
  { value: "people", label: "People" },
  { value: "pairing", label: "Pairing" },
  { value: "lineup", label: "Lineup" },
  { value: "other_bottles", label: "Other bottle" },
];

export const LEGACY_UPLOAD_COLUMN_BY_TYPE: Record<
  LegacyUploadPhotoType,
  "label_image_path" | "place_image_path" | "pairing_image_path"
> = {
  label: "label_image_path",
  place: "place_image_path",
  pairing: "pairing_image_path",
};

export const MAX_PHOTOS_PER_TYPE = 10;
export const MAX_TOTAL_UPLOAD_PHOTOS = 30;
export const BULK_CREATE_CONCURRENCY = 4;
export const FIELD_ROW_GAP = 10;

export const WEEKDAY_LABELS = [
  "Sun",
  "Mon",
  "Tue",
  "Wed",
  "Thu",
  "Fri",
  "Sat",
] as const;

export const MONTH_LABELS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
] as const;

const MONTH_SHORT_LABELS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
] as const;

export function formatYmd(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function parseYmd(value: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  if (!match) {
    return null;
  }
  const year = Number(match[1]);
  const monthIndex = Number(match[2]) - 1;
  const day = Number(match[3]);
  const parsed = new Date(year, monthIndex, day);
  if (
    parsed.getFullYear() !== year ||
    parsed.getMonth() !== monthIndex ||
    parsed.getDate() !== day
  ) {
    return null;
  }
  return parsed;
}

export function formatYmdDisplay(value: string): string {
  const parsed = parseYmd(value);
  if (!parsed) {
    return value;
  }
  return `${MONTH_SHORT_LABELS[parsed.getMonth()]} ${parsed.getDate()}, ${parsed.getFullYear()}`;
}

export function isNetworkFailureError(error: unknown) {
  if (!(error instanceof Error)) {
    return false;
  }
  const message = error.message.toLowerCase();
  return (
    message.includes("network request failed") ||
    message.includes("failed to fetch") ||
    message.includes("networkerror")
  );
}

export function normalizePhotoUploadErrorMessage(value: unknown) {
  const message = value instanceof Error ? value.message : String(value ?? "");
  const normalized = message.toLowerCase();

  if (
    normalized.includes("entry_photos") &&
    (normalized.includes("does not exist") ||
      normalized.includes("check constraint") ||
      normalized.includes("violates"))
  ) {
    return "Photo schema is out of date in Supabase. Run migrations 007_entry_photos.sql and 028_entry_photo_context_types.sql.";
  }

  if (
    normalized.includes("wine-photos") &&
    (normalized.includes("bucket") || normalized.includes("not found"))
  ) {
    return "Storage bucket is not configured. Run migration 002_storage.sql.";
  }

  if (normalized.includes("row-level security")) {
    return "Storage permissions are blocked. Re-apply migration 002_storage.sql policies for wine-photos.";
  }

  if (normalized.includes("unable to read selected photo")) {
    return "Could not read the selected image on device. Re-pick the photo and try again.";
  }

  return message.trim() || "Photo upload failed.";
}

export function isLegacyUploadPhotoType(
  type: UploadPhotoType
): type is LegacyUploadPhotoType {
  return type === "label" || type === "place" || type === "pairing";
}

export function isEntryPhotosSchemaCompatibilityError(value: unknown) {
  const message = value instanceof Error ? value.message : String(value ?? "");
  const normalized = message.toLowerCase();
  if (!normalized.includes("entry_photos")) {
    return false;
  }
  return (
    normalized.includes("does not exist") ||
    normalized.includes("check constraint") ||
    normalized.includes("violates") ||
    normalized.includes("column") ||
    normalized.includes("relation")
  );
}

export function computeOverallConfidence(values: Array<number | null | undefined>) {
  const normalized = values
    .map((value) => normalizeConfidence(value))
    .filter((value): value is number => typeof value === "number");
  if (normalized.length === 0) {
    return null;
  }
  const total = normalized.reduce((sum, value) => sum + value, 0);
  return Math.min(1, Math.max(0, total / normalized.length));
}

export function getPrivacyBadgeTone(level: PrivacyLevel) {
  if (level === "public") {
    return {
      backgroundColor: "rgba(59, 130, 246, 0.16)",
      borderColor: "rgba(96, 165, 250, 0.7)",
      textColor: colors.info,
    };
  }
  if (level === "friends_of_friends") {
    return {
      backgroundColor: "rgba(16, 185, 129, 0.14)",
      borderColor: "rgba(52, 211, 153, 0.7)",
      textColor: colors.success,
    };
  }
  if (level === "friends") {
    return {
      backgroundColor: colors.accentSoft,
      borderColor: "rgba(196, 96, 122, 0.7)",
      textColor: colors.screenBg,
    };
  }
  return {
    backgroundColor: "rgba(192, 57, 43, 0.14)",
    borderColor: "rgba(192, 57, 43, 0.7)",
    textColor: colors.accentSecondary,
  };
}

export function formatFriendName(user: {
  display_name: string | null;
  username?: string | null;
  first_name?: string | null;
  last_name?: string | null;
  name_display_preference?: "real_name" | "username" | null;
  email: string | null;
}) {
  return getPublicProfileName(user);
}

export function formatSurveyWineTitle(wine: {
  wine_name: string | null;
  producer: string | null;
  vintage: string | null;
}) {
  return wine.wine_name?.trim() || "Untitled wine";
}

export function formatSurveyWineMeta(wine: {
  wine_name: string | null;
  producer: string | null;
  vintage: string | null;
}) {
  if (wine.producer && wine.vintage) {
    return `${wine.producer} · ${wine.vintage}`;
  }
  if (wine.producer) {
    return wine.producer;
  }
  if (wine.vintage) {
    return wine.vintage;
  }
  return "No producer or vintage";
}

export function toAdvancedNotesPayload(values: AdvancedNotesPayloadInput) {
  const payload = {
    acidity: values.acidity || null,
    tannin: values.tannin || null,
    alcohol: values.alcohol || null,
    sweetness: values.sweetness || null,
    body: values.body || null,
  };
  return Object.values(payload).some((value) => value !== null) ? payload : null;
}

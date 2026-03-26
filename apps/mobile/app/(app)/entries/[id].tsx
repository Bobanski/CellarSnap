import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import * as ImagePicker from "expo-image-picker";
import {
  ActivityIndicator,
  Alert,
  Image,
  KeyboardAvoidingView,
  Linking,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  type GestureResponderEvent,
  View,
} from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { manipulateAsync, SaveFormat } from "expo-image-manipulator";
import {
  PRICE_PAID_CURRENCY_LABELS,
  PRICE_PAID_CURRENCY_VALUES,
  PRICE_PAID_SOURCE_LABELS,
  PRICE_PAID_SOURCE_VALUES,
  QPR_LEVEL_LABELS,
  QPR_LEVEL_VALUES,
  mapContextTagToPhotoType,
  normalizeProducerText,
  normalizeWineNameText,
  type PricePaidCurrency,
  type PricePaidSource,
  type PrivacyLevel,
  type QprLevel,
} from "@cellarsnap/shared";
import { AppTopBar } from "@/src/components/AppTopBar";
import { ReactionSummaryPills } from "@/src/components/ReactionSummaryPills";
import { AppText } from "@/src/components/AppText";
import { DoneTextInput } from "@/src/components/DoneTextInput";
import { getPublicProfileName } from "@/src/lib/publicProfiles";
import { getAccessTokenForApi, getWebApiBaseUrl } from "@/src/lib/api/webApi";
import {
  canViewerAccessByPrivacy,
  loadSocialAudience,
} from "@/src/lib/feed/feedPage";
import {
  AdaptiveFieldRow,
  Field,
  SelectField,
} from "@/src/components/entries/newEntryFormParts";
import { signPhotoUrl } from "@/src/lib/storage/signedUrls";
import {
  ensurePhotoMimeType,
  extensionForMimeType,
  readPhotoBytes,
} from "@/src/lib/entryFlow/photoIO";
import { requestPhotoContext } from "@/src/lib/entryFlow/photoAnalysisClient";
import { supabase } from "@/src/lib/supabase";
import { useAuth } from "@/src/providers/AuthProvider";
import { colors } from "@/src/lib/theme";

type EntryPhotoType =
  | "label"
  | "place"
  | "people"
  | "pairing"
  | "lineup"
  | "other_bottles";

type EntryDetailRow = {
  id: string;
  user_id: string;
  wine_name: string | null;
  producer: string | null;
  vintage: string | null;
  country: string | null;
  region: string | null;
  appellation: string | null;
  classification: string | null;
  rating: number | null;
  price_paid: number | null;
  price_paid_currency: string | null;
  price_paid_source: "retail" | "restaurant" | null;
  qpr_level: QprLevel | null;
  notes: string | null;
  advanced_notes: Record<string, unknown> | null;
  location_text: string | null;
  location_place_id: string | null;
  consumed_at: string;
  tasted_with_user_ids: string[] | null;
  label_image_path: string | null;
  place_image_path: string | null;
  pairing_image_path: string | null;
  created_at: string;
  entry_group_id?: string | null;
  entry_privacy: PrivacyLevel;
  reaction_privacy?: PrivacyLevel | null;
};

type EntryGroupMode = "event" | "catch_up";

type EntryGroupSummary = {
  id: string;
  mode: EntryGroupMode;
  title: string;
};

type EntryPhotoRow = {
  id: string;
  entry_id: string;
  type: EntryPhotoType;
  path: string;
  position: number;
  created_at: string;
};

type EntryPrimaryGrapeRow = {
  entry_id: string;
  position: number;
  grape_varieties:
    | {
        id: string;
        name: string;
      }
    | {
        id: string;
        name: string;
      }[]
    | null;
};

type PrimaryGrape = {
  id: string;
  name: string;
  position: number;
};

type LocationSuggestion = {
  description: string;
  place_id: string;
};

const GOOGLE_MAPS_API_KEY = process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY;

type BulkReviewFormState = {
  wine_name: string;
  producer: string;
  vintage: string;
  country: string;
  region: string;
  appellation: string;
  classification: string;
  rating: string;
  price_paid: string;
  price_paid_currency: PricePaidCurrency | "";
  price_paid_source: PricePaidSource | "";
  qpr_level: QprLevel | "";
  location_text: string;
  location_place_id: string;
  consumed_at: string;
  notes: string;
};

type ProfileRow = {
  id: string;
  display_name: string | null;
  email: string | null;
  avatar_path?: string | null;
};

type EntryPhotoItem = {
  id: string;
  type: EntryPhotoType;
  url: string | null;
  editable: boolean;
};

type CropGestureState =
  | {
      mode: "pan";
      startX: number;
      startY: number;
      startCenterX: number;
      startCenterY: number;
    }
  | {
      mode: "pinch";
      startDistance: number;
      startZoom: number;
    };

type SavedCropState = {
  centerX: number;
  centerY: number;
  zoom: number;
};

type FriendRequestRow = {
  requester_id: string;
  recipient_id: string;
  status: string | null;
};

type AdvancedNoteKey = keyof typeof ADVANCED_NOTE_OPTIONS;

type AdvancedNotesFormState = Record<AdvancedNoteKey, string>;

type EditAccordionKey =
  | "wine_details"
  | "location_date"
  | "tasted_with"
  | "advanced_notes"
  | "price";

const PHOTO_TYPE_LABELS: Record<EntryPhotoType, string> = {
  label: "Label",
  place: "Place",
  people: "People",
  pairing: "Pairing",
  lineup: "Lineup",
  other_bottles: "Other bottle",
};

const ENTRY_PHOTO_TYPES: EntryPhotoType[] = [
  "label",
  "place",
  "people",
  "pairing",
  "lineup",
  "other_bottles",
];

const MAX_ENTRY_PHOTOS_PER_TYPE = 10;
const WEB_API_BASE_URL = getWebApiBaseUrl();
const REACTION_EMOJIS = ["\u{1F377}", "\u{1F525}", "\u2764\uFE0F", "\u{1F440}", "\u{1F91D}"] as const;

const ADVANCED_NOTE_FIELDS: Array<{ key: string; label: string }> = [
  { key: "acidity", label: "Acidity" },
  { key: "tannin", label: "Tannin" },
  { key: "alcohol", label: "Alcohol" },
  { key: "sweetness", label: "Sweetness" },
  { key: "body", label: "Body" },
];

const ADVANCED_NOTE_OPTIONS: Record<string, Record<string, string>> = {
  acidity: {
    low: "Low",
    medium_minus: "Medium-",
    medium: "Medium",
    medium_plus: "Medium+",
    high: "High",
  },
  tannin: {
    low: "Low",
    medium_minus: "Medium-",
    medium: "Medium",
    medium_plus: "Medium+",
    high: "High",
  },
  alcohol: {
    low: "Low",
    medium: "Medium",
    high: "High",
  },
  sweetness: {
    dry: "Dry",
    off_dry: "Off-Dry",
    medium_sweet: "Medium-Sweet",
    sweet: "Sweet",
  },
  body: {
    light: "Light",
    medium_minus: "Medium-",
    medium: "Medium",
    medium_plus: "Medium+",
    full: "Full",
  },
};

const EMPTY_ADVANCED_NOTES: AdvancedNotesFormState = {
  acidity: "",
  tannin: "",
  alcohol: "",
  sweetness: "",
  body: "",
};

const MONTH_LABELS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
] as const;
const WEEKDAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;

function parseYmd(value: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  if (!match) return null;
  const year = Number(match[1]);
  const monthIndex = Number(match[2]) - 1;
  const day = Number(match[3]);
  const parsed = new Date(year, monthIndex, day);
  if (parsed.getFullYear() !== year || parsed.getMonth() !== monthIndex || parsed.getDate() !== day) {
    return null;
  }
  return parsed;
}

function formatYmd(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

const QPR_OPTIONS = [
  { value: "", label: "Not set" },
  ...QPR_LEVEL_VALUES.map((value) => ({
    value,
    label: QPR_LEVEL_LABELS[value],
  })),
];

function formatConsumedDate(raw: string) {
  const dateOnly = raw.slice(0, 10);
  const date = new Date(`${dateOnly}T00:00:00`);
  if (Number.isNaN(date.getTime())) {
    return raw;
  }
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function getDisplayRating(rating: number | null): string | null {
  if (typeof rating !== "number" || Number.isNaN(rating)) {
    return null;
  }
  const normalized = Math.max(0, Math.min(100, Math.round(rating)));
  return `${normalized}/100`;
}

function normalizeOptionalText(value: string) {
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function firstNonEmptyText(
  ...values: Array<string | null | undefined>
): string | null {
  for (const value of values) {
    if (typeof value !== "string") {
      continue;
    }
    const trimmed = value.trim();
    if (trimmed.length > 0) {
      return trimmed;
    }
  }
  return null;
}

function resolveEntryWineName(entry: EntryDetailRow): string {
  return (
    firstNonEmptyText(
      entry.wine_name,
      entry.producer,
      entry.appellation,
      entry.region,
      entry.classification,
      entry.country,
      entry.vintage
    ) ?? "Unknown wine"
  );
}

function normalizePhotoPath(path: string) {
  return path.replace(/^\/+/, "").trim();
}

function isAbsolutePhotoUrl(path: string) {
  return /^https?:\/\//i.test(path);
}

function toStorageObjectPath(path: string) {
  const raw = path.trim();
  if (!raw) {
    return null;
  }

  if (isAbsolutePhotoUrl(raw)) {
    try {
      const parsed = new URL(raw);
      const match = parsed.pathname.match(
        /\/storage\/v1\/object\/(?:public|sign|authenticated)\/wine-photos\/(.+)$/i
      );
      if (!match?.[1]) {
        return null;
      }
      return decodeURIComponent(match[1]).replace(/^\/+/, "").trim() || null;
    } catch {
      return null;
    }
  }

  let normalizedPath = normalizePhotoPath(raw);
  if (
    normalizedPath.startsWith("http://") ||
    normalizedPath.startsWith("https://")
  ) {
    return null;
  }
  if (normalizedPath.startsWith("wine-photos/")) {
    normalizedPath = normalizedPath.slice("wine-photos/".length);
  }
  if (normalizedPath.startsWith("storage/v1/object/public/wine-photos/")) {
    normalizedPath = normalizedPath.slice(
      "storage/v1/object/public/wine-photos/".length
    );
  }
  if (normalizedPath.startsWith("storage/v1/object/sign/wine-photos/")) {
    normalizedPath = normalizedPath.slice(
      "storage/v1/object/sign/wine-photos/".length
    );
    const tokenIndex = normalizedPath.indexOf("?");
    if (tokenIndex >= 0) {
      normalizedPath = normalizedPath.slice(0, tokenIndex);
    }
    normalizedPath = decodeURIComponent(normalizedPath);
  }

  return normalizedPath || null;
}

function arrayBufferToBase64(buffer: ArrayBuffer) {
  const bytes = new Uint8Array(buffer);
  if (bytes.length === 0) {
    return "";
  }
  let binary = "";
  const chunkSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    const chunk = bytes.subarray(offset, Math.min(bytes.length, offset + chunkSize));
    binary += String.fromCharCode(...chunk);
  }
  if (typeof globalThis.btoa === "function") {
    return globalThis.btoa(binary);
  }
  throw new Error("Base64 encoding not supported on this device.");
}

function formatProfileName(profile: ProfileRow) {
  return getPublicProfileName(profile);
}

function isPrimaryGrapeTableMissingError(message: string) {
  return (
    message.includes("entry_primary_grapes") || message.includes("grape_varieties")
  );
}

function toAdvancedNotesFormState(value: unknown): AdvancedNotesFormState {
  if (!value || typeof value !== "object") {
    return { ...EMPTY_ADVANCED_NOTES };
  }
  const source = value as Record<string, unknown>;
  const next = { ...EMPTY_ADVANCED_NOTES };
  (Object.keys(EMPTY_ADVANCED_NOTES) as AdvancedNoteKey[]).forEach((key) => {
    const raw = source[key];
    if (typeof raw !== "string" || raw.length === 0) {
      return;
    }
    if (!ADVANCED_NOTE_OPTIONS[key]?.[raw]) {
      return;
    }
    next[key] = raw;
  });
  return next;
}

function toAdvancedNotesPayload(value: AdvancedNotesFormState) {
  const payload = {
    acidity: value.acidity || null,
    tannin: value.tannin || null,
    alcohol: value.alcohol || null,
    sweetness: value.sweetness || null,
    body: value.body || null,
  };
  return Object.values(payload).some((item) => item !== null) ? payload : null;
}

function toOrdinal(value: number) {
  const abs = Math.abs(value);
  const mod100 = abs % 100;
  if (mod100 >= 11 && mod100 <= 13) {
    return `${value}th`;
  }
  const mod10 = abs % 10;
  if (mod10 === 1) return `${value}st`;
  if (mod10 === 2) return `${value}nd`;
  if (mod10 === 3) return `${value}rd`;
  return `${value}th`;
}

function buildLocationDisplayLabel(locationText: string): string {
  const normalized = locationText.trim();
  if (!normalized) {
    return normalized;
  }

  const parts = normalized
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);

  if (parts.length <= 1) {
    return normalized;
  }

  const name = parts[0];
  const city = parts.length >= 4 ? parts[parts.length - 3] : parts[1];
  if (!city || city.toLowerCase() === name.toLowerCase()) {
    return name;
  }

  return `${name}, ${city}`;
}

function buildGoogleMapsLocationUrl(locationText: string): string {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
    locationText
  )}`;
}

function isMissingAvatarColumn(message: string) {
  return message.includes("avatar_path") || message.includes("column");
}

function normalizeVariety(
  variety: EntryPrimaryGrapeRow["grape_varieties"]
): { id: string; name: string } | null {
  if (!variety) {
    return null;
  }
  if (Array.isArray(variety)) {
    return variety[0] ?? null;
  }
  return variety;
}

async function createSignedUrlMap(paths: string[]) {
  const uniquePaths = Array.from(
    new Set(paths.filter((path) => Boolean(path && path !== "pending")))
  );
  const map = new Map<string, string | null>();

  await Promise.all(
    uniquePaths.map(async (path) => {
      const normalizedPath = normalizePhotoPath(path);
      const storagePath = toStorageObjectPath(path);
      if (!normalizedPath && !storagePath) {
        map.set(path, null);
        return;
      }
      if (!storagePath) {
        if (isAbsolutePhotoUrl(path)) {
          map.set(path, path);
          if (normalizedPath && !map.has(normalizedPath)) {
            map.set(normalizedPath, path);
          }
        }
        return;
      }

      const signedUrl = await signPhotoUrl(storagePath, {
        supabaseClient: supabase,
      });
      map.set(path, signedUrl);
      map.set(storagePath, signedUrl);
      if (!map.has(normalizedPath)) {
        map.set(normalizedPath, signedUrl);
      }
    })
  );

  return map;
}

function resolvePhotoUrl(path: string | null | undefined, signedUrlMap: Map<string, string | null>) {
  if (!path) {
    return null;
  }
  const directMatch = signedUrlMap.get(path);
  if (typeof directMatch === "string" && directMatch.length > 0) {
    return directMatch;
  }
  const normalizedPath = normalizePhotoPath(path);
  const normalizedMatch = signedUrlMap.get(normalizedPath);
  if (typeof normalizedMatch === "string" && normalizedMatch.length > 0) {
    return normalizedMatch;
  }
  const storagePath = toStorageObjectPath(path);
  if (storagePath) {
    const storageMatch = signedUrlMap.get(storagePath);
    if (typeof storageMatch === "string" && storageMatch.length > 0) {
      return storageMatch;
    }
  }
  if (isAbsolutePhotoUrl(path)) {
    return path;
  }
  return null;
}

function getAdvancedNoteRows(value: unknown): Array<{ label: string; value: string }> {
  if (!value || typeof value !== "object") {
    return [];
  }

  const input = value as Record<string, unknown>;
  return ADVANCED_NOTE_FIELDS.reduce<Array<{ label: string; value: string }>>(
    (rows, field) => {
      const rawValue = input[field.key];
      if (typeof rawValue !== "string" || rawValue.trim().length === 0) {
        return rows;
      }
      const optionLabel = ADVANCED_NOTE_OPTIONS[field.key]?.[rawValue];
      const formattedValue =
        optionLabel ??
        rawValue
          .replace(/_/g, " ")
          .replace(/\b\w/g, (char) => char.toUpperCase());
      rows.push({ label: field.label, value: formattedValue });
      return rows;
    },
    []
  );
}

export default function EntryDetailScreen() {
  const params = useLocalSearchParams<{
    id?: string | string[];
    bulk?: string | string[];
    queue?: string | string[];
    index?: string | string[];
  }>();
  const { user } = useAuth();
  const entryId = Array.isArray(params.id) ? params.id[0] : params.id;
  const bulkFlag = Array.isArray(params.bulk) ? params.bulk[0] : params.bulk;
  const queueParam = Array.isArray(params.queue) ? params.queue[0] : params.queue;
  const bulkQueue = useMemo(() => {
    if (!queueParam) {
      return [] as string[];
    }
    let decoded = queueParam;
    try {
      decoded = decodeURIComponent(queueParam);
    } catch {
      decoded = queueParam;
    }
    return decoded
      .split(",")
      .map((id) => id.trim())
      .filter((id) => id.length > 0);
  }, [queueParam]);
  const isBulkReview = Boolean(
    bulkFlag === "1" && entryId && bulkQueue.includes(entryId)
  );
  const currentBulkIndex = isBulkReview && entryId
    ? Math.max(0, bulkQueue.indexOf(entryId))
    : -1;
  const nextBulkEntryId =
    currentBulkIndex >= 0 && currentBulkIndex < bulkQueue.length - 1
      ? bulkQueue[currentBulkIndex + 1]
      : null;
  const bulkProgressLabel =
    currentBulkIndex >= 0 ? `${currentBulkIndex + 1}/${bulkQueue.length}` : null;
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [entry, setEntry] = useState<(EntryDetailRow & { primary_grapes: PrimaryGrape[] }) | null>(
    null
  );
  const [authorName, setAuthorName] = useState("Unknown");
  const [authorAvatarUrl, setAuthorAvatarUrl] = useState<string | null>(null);
  const [viewerReactionName, setViewerReactionName] = useState<string | null>(null);
  const [tastedWithNames, setTastedWithNames] = useState<string[]>([]);
  const [photos, setPhotos] = useState<EntryPhotoItem[]>([]);
  const [failedPhotoIds, setFailedPhotoIds] = useState<Set<string>>(() => new Set());
  const [activePhotoIndex, setActivePhotoIndex] = useState(0);
  const [photoFrameWidth, setPhotoFrameWidth] = useState(0);
  const [cropPhotoId, setCropPhotoId] = useState<string | null>(null);
  const [cropImageNaturalSize, setCropImageNaturalSize] = useState<{
    width: number;
    height: number;
  } | null>(null);
  const [cropFrameSize, setCropFrameSize] = useState(0);
  const [cropCenterX, setCropCenterX] = useState(50);
  const [cropCenterY, setCropCenterY] = useState(50);
  const [cropZoom, setCropZoom] = useState(1);
  const [cropSourceLoading, setCropSourceLoading] = useState(false);
  const [isSavingCrop, setIsSavingCrop] = useState(false);
  const [savedCropByPhotoId, setSavedCropByPhotoId] = useState<
    Record<string, SavedCropState>
  >({});
  const [cropSourceDataUrlByPhotoId, setCropSourceDataUrlByPhotoId] = useState<
    Record<string, string>
  >({});
  const [advancedNotesOpen, setAdvancedNotesOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [isDeletingBulkQueue, setIsDeletingBulkQueue] = useState(false);
  const [isSavingBulkReview, setIsSavingBulkReview] = useState(false);
  const [bulkReviewError, setBulkReviewError] = useState<string | null>(null);
  const [selectedPrimaryGrapes, setSelectedPrimaryGrapes] = useState<PrimaryGrape[]>([]);
  const [primaryGrapeQuery, setPrimaryGrapeQuery] = useState("");
  const [primaryGrapeSuggestions, setPrimaryGrapeSuggestions] = useState<PrimaryGrape[]>(
    []
  );
  const [isPrimaryGrapeFocused, setIsPrimaryGrapeFocused] = useState(false);
  const [isPrimaryGrapeLoading, setIsPrimaryGrapeLoading] = useState(false);
  const [primaryGrapeError, setPrimaryGrapeError] = useState<string | null>(null);
  const [bulkAdvancedNotes, setBulkAdvancedNotes] =
    useState<AdvancedNotesFormState>({ ...EMPTY_ADVANCED_NOTES });
  const [friendUsers, setFriendUsers] = useState<ProfileRow[]>([]);
  const [entryGroup, setEntryGroup] = useState<EntryGroupSummary | null>(null);
  const [selectedTastedWithIds, setSelectedTastedWithIds] = useState<string[]>([]);
  const [friendSearch, setFriendSearch] = useState("");
  const [locationSuggestions, setLocationSuggestions] = useState<LocationSuggestion[]>([]);
  const [isLocationLoading, setIsLocationLoading] = useState(false);
  const [locationApiMessage, setLocationApiMessage] = useState<string | null>(null);
  const [locationSessionToken, setLocationSessionToken] = useState(() =>
    `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
  );
  const [isLoadingFriends, setIsLoadingFriends] = useState(false);
  const [bulkReviewForm, setBulkReviewForm] = useState<BulkReviewFormState>({
    wine_name: "",
    producer: "",
    vintage: "",
    country: "",
    region: "",
    appellation: "",
    classification: "",
    rating: "",
    price_paid: "",
    price_paid_currency: "",
    price_paid_source: "",
    qpr_level: "",
    location_text: "",
    location_place_id: "",
    consumed_at: "",
    notes: "",
  });
  const [ownerEditOpen, setOwnerEditOpen] = useState(false);
  const [isSavingOwnerEdit, setIsSavingOwnerEdit] = useState(false);
  const [isUpdatingPhotoMeta, setIsUpdatingPhotoMeta] = useState(false);
  const [photoTypePickerOpen, setPhotoTypePickerOpen] = useState(false);
  const [photoOrderPickerOpen, setPhotoOrderPickerOpen] = useState(false);
  const [datePickerOpen, setDatePickerOpen] = useState(false);
  const [visibleMonth, setVisibleMonth] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });
  const [editExpanded, setEditExpanded] = useState<Record<EditAccordionKey, boolean>>({
    wine_details: false,
    location_date: false,
    tasted_with: false,
    advanced_notes: false,
    price: false,
  });
  const [showBulkMoreDetails, setShowBulkMoreDetails] = useState(false);
  const [photoEditError, setPhotoEditError] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [canReact, setCanReact] = useState(false);
  const [myReactions, setMyReactions] = useState<string[]>([]);
  const [reactionCounts, setReactionCounts] = useState<Record<string, number>>({});
  const [reactionUsers, setReactionUsers] = useState<Record<string, string[]>>({});
  const [reactionPickerOpen, setReactionPickerOpen] = useState(false);
  const galleryScrollRef = useRef<ScrollView | null>(null);
  const cropDragRef = useRef<CropGestureState | null>(null);

  useEffect(() => {
    setShowBulkMoreDetails(false);
  }, [entryId, isBulkReview]);

  const loadEntry = useCallback(async () => {
    if (!entryId) {
      setErrorMessage("Entry not found.");
      setLoading(false);
      return;
    }

    setLoading(true);
    setErrorMessage(null);

    const { data: entryData, error: entryError } = await supabase
      .from("wine_entries")
      .select(
        "id, user_id, wine_name, producer, vintage, country, region, appellation, classification, rating, price_paid, price_paid_currency, price_paid_source, qpr_level, notes, advanced_notes, location_text, location_place_id, consumed_at, tasted_with_user_ids, label_image_path, place_image_path, pairing_image_path, created_at, entry_group_id, entry_privacy, reaction_privacy"
      )
      .eq("id", entryId)
      .maybeSingle();

    if (entryError || !entryData) {
      setEntryGroup(null);
      setErrorMessage(entryError?.message ?? "Entry unavailable.");
      setLoading(false);
      return;
    }

    const nextEntry = entryData as EntryDetailRow;
    const nextEntryGroupId =
      typeof nextEntry.entry_group_id === "string" && nextEntry.entry_group_id.length > 0
        ? nextEntry.entry_group_id
        : null;

    const [{ data: photoRows }, { data: grapeRows }, groupResponse] = await Promise.all([
      supabase
        .from("entry_photos")
        .select("id, entry_id, type, path, position, created_at")
        .eq("entry_id", entryId)
        .order("position", { ascending: true })
        .order("created_at", { ascending: true }),
      supabase
        .from("wine_entry_primary_grapes")
        .select("entry_id, position, grape_varieties(id, name)")
        .eq("entry_id", entryId)
        .order("position", { ascending: true }),
      nextEntryGroupId
        ? supabase
            .from("entry_groups")
            .select("id, mode, title")
            .eq("id", nextEntryGroupId)
            .maybeSingle()
        : Promise.resolve({ data: null, error: null }),
    ]);
    const nextEntryGroup =
      groupResponse?.data &&
      typeof groupResponse.data.id === "string" &&
      (groupResponse.data.mode === "event" || groupResponse.data.mode === "catch_up")
        ? {
            id: groupResponse.data.id,
            mode: groupResponse.data.mode as EntryGroupMode,
            title:
              typeof groupResponse.data.title === "string" ? groupResponse.data.title : "",
          }
        : null;

    const primaryGrapes: PrimaryGrape[] = ((grapeRows ?? []) as EntryPrimaryGrapeRow[])
      .map((row) => {
        const variety = normalizeVariety(row.grape_varieties);
        if (!variety) {
          return null;
        }
        return {
          id: variety.id,
          name: variety.name,
          position: row.position,
        };
      })
      .filter((row): row is PrimaryGrape => Boolean(row));

    const profileIds = Array.from(
      new Set([
        nextEntry.user_id,
        ...(nextEntry.tasted_with_user_ids ?? []),
        ...(user?.id ? [user.id] : []),
      ])
    );

    const profileResponse = profileIds.length
      ? await supabase
          .from("public_profiles")
          .select("id, display_name, email, avatar_path")
          .in("id", profileIds)
      : { data: [] as ProfileRow[], error: null };

    let profileRows = (profileResponse.data ?? []) as ProfileRow[];
    if (profileResponse.error && isMissingAvatarColumn(profileResponse.error.message)) {
      const fallback = profileIds.length
        ? await supabase
            .from("public_profiles")
            .select("id, display_name, email")
            .in("id", profileIds)
        : { data: [] };
      profileRows = (fallback.data ?? []) as ProfileRow[];
    }

    const entryPhotoRows = (photoRows ?? []) as EntryPhotoRow[];
    const legacyPhotoTuples: Array<{ id: string; type: EntryPhotoType; path: string | null }> = [
      { id: "legacy-label", type: "label", path: nextEntry.label_image_path },
      { id: "legacy-place", type: "place", path: nextEntry.place_image_path },
      { id: "legacy-pairing", type: "pairing", path: nextEntry.pairing_image_path },
    ];

    const signedUrlMap = await createSignedUrlMap([
      ...entryPhotoRows.map((photo) => photo.path),
      ...legacyPhotoTuples
        .map((photo) => photo.path)
        .filter((path): path is string => Boolean(path)),
      ...profileRows
        .map((profile) => profile.avatar_path ?? null)
        .filter((path): path is string => Boolean(path)),
    ]);

    const nextPhotos: EntryPhotoItem[] =
      entryPhotoRows.length > 0
        ? entryPhotoRows.map((photo) => ({
            id: photo.id,
            type: photo.type,
            url: resolvePhotoUrl(photo.path, signedUrlMap),
            editable: true,
          }))
        : legacyPhotoTuples
            .filter((photo) => Boolean(photo.path))
            .map((photo) => ({
              id: photo.id,
              type: photo.type,
              url: photo.path ? resolvePhotoUrl(photo.path, signedUrlMap) : null,
              editable: false,
            }));

    const profileMap = new Map(profileRows.map((row) => [row.id, row]));
    const authorProfile = profileMap.get(nextEntry.user_id);
    const viewerProfile = user?.id ? profileMap.get(user.id) : null;
    const socialAudience = user?.id
      ? await loadSocialAudience(user.id, supabase)
      : {
          socialAuthorIds: [],
          acceptedFriendIds: new Set<string>(),
          friendsOfFriendsIds: new Set<string>(),
        };
    const resolvedReactionPrivacy = (nextEntry.reaction_privacy ??
      nextEntry.entry_privacy ??
      "public") as PrivacyLevel;
    const canEntryReact = user?.id
      ? canViewerAccessByPrivacy({
          viewerUserId: user.id,
          ownerUserId: nextEntry.user_id,
          privacy: resolvedReactionPrivacy,
          acceptedFriendIds: socialAudience.acceptedFriendIds,
          friendsOfFriendsIds: socialAudience.friendsOfFriendsIds,
        })
      : false;
    const nextReactionCounts: Record<string, number> = {};
    const nextMyReactions: string[] = [];
    const reactionUserIds: Record<string, string[]> = {};

    const { data: reactionRows } = await supabase
      .from("entry_reactions")
      .select("user_id, emoji")
      .eq("entry_id", entryId);

    const reactorIds = new Set<string>();
    (reactionRows ?? []).forEach((row) => {
      nextReactionCounts[row.emoji] = (nextReactionCounts[row.emoji] ?? 0) + 1;
      reactorIds.add(row.user_id);
      if (user?.id === row.user_id && !nextMyReactions.includes(row.emoji)) {
        nextMyReactions.push(row.emoji);
      }
      const list = reactionUserIds[row.emoji] ?? [];
      if (!list.includes(row.user_id)) {
        list.push(row.user_id);
      }
      reactionUserIds[row.emoji] = list;
    });

    const missingReactorIds = Array.from(reactorIds).filter((id) => !profileMap.has(id));
    if (missingReactorIds.length > 0) {
      const { data: reactorProfiles } = await supabase
        .from("public_profiles")
        .select("id, display_name, email")
        .in("id", missingReactorIds);

      (reactorProfiles ?? []).forEach((row) => {
        const typedRow = row as ProfileRow;
        profileMap.set(typedRow.id, typedRow);
      });
    }

    const nextReactionUsers: Record<string, string[]> = {};
    Object.entries(reactionUserIds).forEach(([emoji, ids]) => {
      nextReactionUsers[emoji] = ids.map((id) => getPublicProfileName(profileMap.get(id)));
    });

    setAuthorName(
      getPublicProfileName(authorProfile)
    );
    setAuthorAvatarUrl(
      authorProfile?.avatar_path
        ? resolvePhotoUrl(authorProfile.avatar_path, signedUrlMap)
        : null
    );

    setTastedWithNames(
      (nextEntry.tasted_with_user_ids ?? []).map((id) => {
        const profile = profileMap.get(id);
        return profile ? formatProfileName(profile) : "Unknown";
      })
    );
    setViewerReactionName(
      viewerProfile ? getPublicProfileName(viewerProfile) : user?.email ?? null
    );
    setCanReact(canEntryReact);
    setMyReactions(canEntryReact ? nextMyReactions : []);
    setReactionCounts(canEntryReact ? nextReactionCounts : {});
    setReactionUsers(canEntryReact ? nextReactionUsers : {});
    setReactionPickerOpen(false);
    setEntry({ ...nextEntry, primary_grapes: primaryGrapes });
    setEntryGroup(nextEntryGroup);
    setSelectedPrimaryGrapes(primaryGrapes.map((grape) => ({ ...grape })));
    setSelectedTastedWithIds(nextEntry.tasted_with_user_ids ?? []);
    setBulkAdvancedNotes(toAdvancedNotesFormState(nextEntry.advanced_notes));
    setPrimaryGrapeQuery("");
    setPrimaryGrapeSuggestions([]);
    setPrimaryGrapeError(null);
    setBulkReviewForm({
      wine_name: resolveEntryWineName(nextEntry),
      producer: nextEntry.producer ?? "",
      vintage: nextEntry.vintage ?? "",
      country: nextEntry.country ?? "",
      region: nextEntry.region ?? "",
      appellation: nextEntry.appellation ?? "",
      classification: nextEntry.classification ?? "",
      rating:
        typeof nextEntry.rating === "number" && Number.isFinite(nextEntry.rating)
          ? String(Math.round(nextEntry.rating))
          : "",
      price_paid:
        typeof nextEntry.price_paid === "number" && Number.isFinite(nextEntry.price_paid)
          ? String(nextEntry.price_paid)
          : "",
      price_paid_currency:
        nextEntry.price_paid_currency &&
        PRICE_PAID_CURRENCY_VALUES.includes(nextEntry.price_paid_currency as PricePaidCurrency)
          ? (nextEntry.price_paid_currency as PricePaidCurrency)
          : "",
      price_paid_source:
        nextEntry.price_paid_source &&
        PRICE_PAID_SOURCE_VALUES.includes(nextEntry.price_paid_source as PricePaidSource)
          ? (nextEntry.price_paid_source as PricePaidSource)
          : "",
      qpr_level:
        nextEntry.qpr_level && QPR_LEVEL_VALUES.includes(nextEntry.qpr_level)
          ? nextEntry.qpr_level
          : "",
      location_text: nextEntry.location_text ?? "",
      location_place_id: nextEntry.location_place_id ?? "",
      consumed_at: nextEntry.consumed_at ?? "",
      notes: nextEntry.notes ?? "",
    });
    setBulkReviewError(null);
    setLocationSuggestions([]);
    setLocationApiMessage(null);
    setPhotos(nextPhotos);
    setFailedPhotoIds(new Set());
    setActivePhotoIndex(0);
    setAdvancedNotesOpen(false);
    setEditExpanded({
      wine_details: false,
      location_date: false,
      tasted_with: false,
      advanced_notes: false,
      price: false,
    });
    setPhotoEditError(null);
    setPhotoTypePickerOpen(false);
    setPhotoOrderPickerOpen(false);
    if (galleryScrollRef.current) {
      galleryScrollRef.current.scrollTo({ x: 0, animated: false });
    }
    setLoading(false);
  }, [entryId, user?.email, user?.id]);

  useEffect(() => {
    void loadEntry();
  }, [loadEntry]);

  const toggleReaction = useCallback(
    async (emoji: string) => {
      if (!entryId || !user?.id) {
        return;
      }

      const hasMine = myReactions.includes(emoji);
      const viewerName = viewerReactionName ?? "You";

      if (hasMine) {
        const { error } = await supabase
          .from("entry_reactions")
          .delete()
          .eq("entry_id", entryId)
          .eq("user_id", user.id)
          .eq("emoji", emoji);

        if (error) {
          setErrorMessage(error.message);
          return;
        }

        setReactionCounts((current) => {
          const next = { ...current };
          const nextCount = Math.max(0, (next[emoji] ?? 1) - 1);
          if (nextCount === 0) {
            delete next[emoji];
          } else {
            next[emoji] = nextCount;
          }
          return next;
        });
        setReactionUsers((current) => {
          const next = { ...current };
          const filtered = (next[emoji] ?? []).filter((name) => name !== viewerName);
          if (filtered.length > 0) {
            next[emoji] = filtered;
          } else {
            delete next[emoji];
          }
          return next;
        });
        setMyReactions((current) => current.filter((value) => value !== emoji));
      } else {
        const { error } = await supabase.from("entry_reactions").insert({
          entry_id: entryId,
          user_id: user.id,
          emoji,
        });

        if (error) {
          setErrorMessage(error.message);
          return;
        }

        setReactionCounts((current) => ({
          ...current,
          [emoji]: (current[emoji] ?? 0) + 1,
        }));
        setReactionUsers((current) => {
          const next = { ...current };
          const existing = next[emoji] ?? [];
          next[emoji] = existing.includes(viewerName)
            ? existing
            : [...existing, viewerName];
          return next;
        });
        setMyReactions((current) => [...current, emoji]);
      }

      setReactionPickerOpen(false);
    },
    [entryId, myReactions, user?.id, viewerReactionName]
  );

  useEffect(() => {
    const maxIndex = Math.max(0, photos.length - 1);
    if (activePhotoIndex > maxIndex) {
      setActivePhotoIndex(maxIndex);
    }
  }, [activePhotoIndex, photos.length]);

  useEffect(() => {
    let cancelled = false;
    const query = bulkReviewForm.location_text.trim();
    const sessionToken = locationSessionToken;

    const timer = setTimeout(async () => {
      if (!GOOGLE_MAPS_API_KEY) {
        if (!cancelled) {
          setLocationSuggestions([]);
          setIsLocationLoading(false);
        }
        return;
      }

      if (query.length < 2) {
        if (!cancelled) {
          setLocationSuggestions([]);
          setIsLocationLoading(false);
        }
        return;
      }

      setIsLocationLoading(true);

      const url =
        "https://maps.googleapis.com/maps/api/place/autocomplete/json" +
        `?input=${encodeURIComponent(query)}` +
        `&sessiontoken=${encodeURIComponent(sessionToken)}` +
        `&key=${encodeURIComponent(GOOGLE_MAPS_API_KEY)}`;

      try {
        const response = await fetch(url);
        const payload = (await response.json()) as {
          status?: string;
          predictions?: Array<{ description?: string; place_id?: string }>;
        };

        if (cancelled) return;

        if (payload.status !== "OK" && payload.status !== "ZERO_RESULTS") {
          setLocationSuggestions([]);
          setIsLocationLoading(false);
          return;
        }

        const suggestions = (payload.predictions ?? [])
          .map((item) => ({
            description: item.description ?? "",
            place_id: item.place_id ?? "",
          }))
          .filter((item) => item.description.length > 0 && item.place_id.length > 0)
          .slice(0, 5);

        setLocationSuggestions(suggestions);
        setIsLocationLoading(false);
      } catch {
        if (!cancelled) {
          setLocationSuggestions([]);
          setIsLocationLoading(false);
        }
      }
    }, 250);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [bulkReviewForm.location_text, locationSessionToken]);

  useEffect(() => {
    let cancelled = false;
    const query = primaryGrapeQuery.trim();
    const shouldSearch =
      isBulkReview &&
      isPrimaryGrapeFocused &&
      selectedPrimaryGrapes.length < 3 &&
      query.length >= 4;

    const timer = setTimeout(async () => {
      if (!shouldSearch) {
        if (!cancelled) {
          setPrimaryGrapeSuggestions([]);
          setIsPrimaryGrapeLoading(false);
          setPrimaryGrapeError(null);
        }
        return;
      }

      setIsPrimaryGrapeLoading(true);
      setPrimaryGrapeError(null);
      const { data, error } = await supabase
        .from("grape_varieties")
        .select("id, name")
        .ilike("name", `%${query}%`)
        .order("name", { ascending: true })
        .limit(8);

      if (cancelled) {
        return;
      }

      if (error) {
        setPrimaryGrapeSuggestions([]);
        setPrimaryGrapeError(error.message);
        setIsPrimaryGrapeLoading(false);
        return;
      }

      const selectedIds = new Set(selectedPrimaryGrapes.map((grape) => grape.id));
      const suggestions = (data ?? [])
        .map((row) => ({ id: row.id, name: row.name, position: 0 }))
        .filter((row) => !selectedIds.has(row.id));
      setPrimaryGrapeSuggestions(suggestions);
      setIsPrimaryGrapeLoading(false);
    }, 180);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [isBulkReview, isPrimaryGrapeFocused, primaryGrapeQuery, selectedPrimaryGrapes]);

  useEffect(() => {
    let cancelled = false;
    const query = bulkReviewForm.location_text.trim();
    const sessionToken = locationSessionToken;
    const canLookup = isBulkReview || ownerEditOpen;

    const timer = setTimeout(async () => {
      if (!canLookup) {
        if (!cancelled) {
          setLocationSuggestions([]);
          setIsLocationLoading(false);
          setLocationApiMessage(null);
        }
        return;
      }

      if (!GOOGLE_MAPS_API_KEY) {
        if (!cancelled) {
          setLocationSuggestions([]);
          setIsLocationLoading(false);
          setLocationApiMessage(
            "Set EXPO_PUBLIC_GOOGLE_MAPS_API_KEY to enable location autocomplete."
          );
        }
        return;
      }

      if (query.length < 2) {
        if (!cancelled) {
          setLocationSuggestions([]);
          setIsLocationLoading(false);
          setLocationApiMessage(null);
        }
        return;
      }

      setIsLocationLoading(true);
      setLocationApiMessage(null);

      const url =
        "https://maps.googleapis.com/maps/api/place/autocomplete/json" +
        `?input=${encodeURIComponent(query)}` +
        "&types=establishment|geocode" +
        `&sessiontoken=${encodeURIComponent(sessionToken)}` +
        `&key=${encodeURIComponent(GOOGLE_MAPS_API_KEY)}`;

      try {
        const response = await fetch(url);
        const payload = (await response.json()) as {
          status?: string;
          error_message?: string;
          predictions?: Array<{ description?: string; place_id?: string }>;
        };

        if (cancelled) {
          return;
        }

        if (payload.status !== "OK" && payload.status !== "ZERO_RESULTS") {
          setLocationSuggestions([]);
          setLocationApiMessage(payload.error_message || "Location lookup failed.");
          setIsLocationLoading(false);
          return;
        }

        const suggestions = (payload.predictions ?? [])
          .map((item) => ({
            description: item.description ?? "",
            place_id: item.place_id ?? "",
          }))
          .filter((item) => item.description.length > 0 && item.place_id.length > 0)
          .slice(0, 5);
        setLocationSuggestions(suggestions);
        setIsLocationLoading(false);
      } catch {
        if (!cancelled) {
          setLocationSuggestions([]);
          setLocationApiMessage("Unable to reach Google Maps. Check connection.");
          setIsLocationLoading(false);
        }
      }
    }, 250);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [bulkReviewForm.location_text, isBulkReview, locationSessionToken, ownerEditOpen]);

  useEffect(() => {
    if (!user?.id || !isBulkReview) {
      return;
    }
    let cancelled = false;
    const loadFriends = async () => {
      setIsLoadingFriends(true);
      const { data: requests, error: requestsError } = await supabase
        .from("friend_requests")
        .select("requester_id, recipient_id, status")
        .eq("status", "accepted")
        .or(`requester_id.eq.${user.id},recipient_id.eq.${user.id}`);

      if (cancelled) {
        return;
      }
      if (requestsError || !requests) {
        setFriendUsers([]);
        setIsLoadingFriends(false);
        return;
      }

      const friendIds = Array.from(
        new Set(
          (requests as FriendRequestRow[]).map((request) =>
            request.requester_id === user.id
              ? request.recipient_id
              : request.requester_id
          )
        )
      );

      if (friendIds.length === 0) {
        setFriendUsers([]);
        setIsLoadingFriends(false);
        return;
      }

      const { data: profiles, error: profilesError } = await supabase
        .from("public_profiles")
        .select("id, display_name, email")
        .in("id", friendIds);

      if (cancelled) {
        return;
      }
      if (profilesError) {
        setFriendUsers([]);
        setIsLoadingFriends(false);
        return;
      }

      const usersByName = ((profiles ?? []) as ProfileRow[]).sort((a, b) =>
        formatProfileName(a).localeCompare(formatProfileName(b), "en", {
          sensitivity: "base",
        })
      );
      setFriendUsers(usersByName);
      setIsLoadingFriends(false);
    };
    void loadFriends();
    return () => {
      cancelled = true;
    };
  }, [isBulkReview, user?.id]);

  useEffect(() => {
    const cropPhoto =
      cropPhotoId !== null
        ? photos.find((photo) => photo.id === cropPhotoId) ?? null
        : null;
    const sourceUri =
      cropPhoto && cropSourceDataUrlByPhotoId[cropPhoto.id]
        ? cropSourceDataUrlByPhotoId[cropPhoto.id]
        : cropPhoto?.url ?? null;
    if (!sourceUri) {
      setCropImageNaturalSize(null);
      setCropSourceLoading(false);
      return;
    }

    let cancelled = false;
    setCropSourceLoading(true);
    Image.getSize(
      sourceUri,
      (width, height) => {
        if (cancelled) {
          return;
        }
        setCropImageNaturalSize({
          width: Math.max(1, width),
          height: Math.max(1, height),
        });
        setCropSourceLoading(false);
      },
      () => {
        if (cancelled) {
          return;
        }
        setCropImageNaturalSize(null);
        setCropSourceLoading(false);
      }
    );

    return () => {
      cancelled = true;
    };
  }, [cropPhotoId, cropSourceDataUrlByPhotoId, photos]);

  useEffect(() => {
    setCropSourceDataUrlByPhotoId((current) => {
      const photoIds = new Set(photos.map((photo) => photo.id));
      let changed = false;
      const next: Record<string, string> = {};
      for (const [photoId, dataUrl] of Object.entries(current)) {
        if (photoIds.has(photoId)) {
          next[photoId] = dataUrl;
        } else {
          changed = true;
        }
      }
      return changed ? next : current;
    });
  }, [photos]);

  useEffect(() => {
    setSavedCropByPhotoId((current) => {
      const photoIds = new Set(photos.map((photo) => photo.id));
      let changed = false;
      const next: Record<string, SavedCropState> = {};
      for (const [photoId, state] of Object.entries(current)) {
        if (photoIds.has(photoId)) {
          next[photoId] = state;
        } else {
          changed = true;
        }
      }
      return changed ? next : current;
    });
  }, [photos]);

  const isOwner = Boolean(user?.id && entry?.user_id === user.id);
  const hasMultiplePhotos = photos.length > 1;
  const isEditFormVisible = isBulkReview || (isOwner && ownerEditOpen);
  const activePhoto =
    photos[Math.max(0, Math.min(photos.length - 1, activePhotoIndex))] ?? null;
  const activeCropPhoto =
    cropPhotoId !== null
      ? photos.find((photo) => photo.id === cropPhotoId) ?? null
      : null;
  const activeCropPhotoSourceUri =
    activeCropPhoto && cropSourceDataUrlByPhotoId[activeCropPhoto.id]
      ? cropSourceDataUrlByPhotoId[activeCropPhoto.id]
      : activeCropPhoto?.url ?? null;
  const clampCropPercent = (value: number) => Math.min(100, Math.max(0, value));
  const clampCropZoom = (value: number) => Math.min(4, Math.max(1, value));
  const getCropGeometry = useCallback(() => {
    if (!cropImageNaturalSize || cropFrameSize <= 0) {
      return null;
    }

    const baseScale = Math.min(
      cropFrameSize / cropImageNaturalSize.width,
      cropFrameSize / cropImageNaturalSize.height
    );
    const effectiveScale = baseScale * cropZoom;
    const renderedWidth = cropImageNaturalSize.width * effectiveScale;
    const renderedHeight = cropImageNaturalSize.height * effectiveScale;
    const overflowX = Math.max(0, renderedWidth - cropFrameSize);
    const overflowY = Math.max(0, renderedHeight - cropFrameSize);
    const centerPadX = Math.max(0, (cropFrameSize - renderedWidth) / 2);
    const centerPadY = Math.max(0, (cropFrameSize - renderedHeight) / 2);

    return {
      renderedWidth,
      renderedHeight,
      overflowX,
      overflowY,
      offsetX: centerPadX - overflowX * (cropCenterX / 100),
      offsetY: centerPadY - overflowY * (cropCenterY / 100),
    };
  }, [cropCenterX, cropCenterY, cropFrameSize, cropImageNaturalSize, cropZoom]);
  const activePhotoFailed = activePhoto ? failedPhotoIds.has(activePhoto.id) : false;
  const canEditActivePhotoMeta = Boolean(
    isOwner && isEditFormVisible && activePhoto?.editable && !isUpdatingPhotoMeta
  );
  const canManagePhotoContent = Boolean(
    isOwner && isEditFormVisible && !isUpdatingPhotoMeta
  );
  const canRemoveActivePhoto = Boolean(
    canManagePhotoContent && activePhoto?.editable
  );
  const displayRating = getDisplayRating(entry?.rating ?? null);
  const advancedNoteRows = useMemo(
    () => getAdvancedNoteRows(entry?.advanced_notes),
    [entry?.advanced_notes]
  );
  const primaryGrapeDisplay =
    entry && entry.primary_grapes.length > 0
      ? [...entry.primary_grapes]
          .sort((a, b) => a.position - b.position)
          .map((grape) => grape.name)
          .join(", ")
      : null;
  const locationText = entry?.location_text?.trim() ?? "";
  const hasLocation = locationText.length > 0;
  const canOpenLocation = hasLocation;
  const locationDisplayLabel = hasLocation
    ? buildLocationDisplayLabel(locationText)
    : "";
  const bulkActionsDisabled = deleting || isDeletingBulkQueue || isSavingBulkReview;
  const ownerEditActionsDisabled =
    deleting || isDeletingBulkQueue || isSavingBulkReview || isSavingOwnerEdit;
  const topFriends = friendUsers.slice(0, 5);
  const topFriendIds = new Set(topFriends.map((profile) => profile.id));
  const extraSelectedFriends = friendUsers.filter(
    (profile) =>
      selectedTastedWithIds.includes(profile.id) && !topFriendIds.has(profile.id)
  );
  const isSharedEventBulkReview = isBulkReview && entryGroup?.mode === "event";
  const normalizedFriendSearch = friendSearch.trim().toLowerCase();
  const friendSearchResults =
    normalizedFriendSearch.length >= 2
      ? friendUsers.filter((profile) => {
          if (topFriendIds.has(profile.id)) {
            return false;
          }
          if (selectedTastedWithIds.includes(profile.id)) {
            return false;
          }
          const displayName = profile.display_name?.toLowerCase() ?? "";
          return displayName.includes(normalizedFriendSearch);
        })
      : [];
  const activePhotoOrder =
    activePhoto && photos.length > 0
      ? photos.findIndex((photo) => photo.id === activePhoto.id) + 1
      : 0;
  const cropGeometry = getCropGeometry();

  const toggleEditSection = useCallback((section: EditAccordionKey) => {
    setEditExpanded((current) => ({ ...current, [section]: !current[section] }));
  }, []);

  const inferPhotoTypeFromAi = useCallback(
    async ({
      fallbackType,
      uri,
      name,
      mimeType,
    }: {
      fallbackType: EntryPhotoType;
      uri: string;
      name: string;
      mimeType: string;
    }) => {
      if (!WEB_API_BASE_URL) {
        return fallbackType;
      }

      const accessToken = await getAccessTokenForApi();
      if (!accessToken) {
        return fallbackType;
      }

      try {
        const context = await requestPhotoContext({
          baseUrl: WEB_API_BASE_URL,
          accessToken,
          photo: {
            id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
            uri,
            name,
            mimeType,
          },
        });

        if (context.tag === "unknown") {
          return fallbackType === "label" ? "other_bottles" : fallbackType;
        }

        const suggestedType = mapContextTagToPhotoType(context.tag, {
          confidence: context.confidence,
          detectedBottleCount: 0,
          identifiedBottleCount: 0,
        });

        return suggestedType;
      } catch {
        return fallbackType;
      }
    },
    []
  );

  const updateActivePhotoType = useCallback(
    async (nextType: EntryPhotoType) => {
      if (!entry || !activePhoto?.editable || !isOwner || !user?.id) {
        return;
      }
      if (activePhoto.type === nextType) {
        setPhotoTypePickerOpen(false);
        return;
      }

      setIsUpdatingPhotoMeta(true);
      setPhotoEditError(null);

      const { count, error: countError } = await supabase
        .from("entry_photos")
        .select("id", { count: "exact", head: true })
        .eq("entry_id", entry.id)
        .eq("type", nextType);

      if (countError) {
        setPhotoEditError(countError.message);
        setIsUpdatingPhotoMeta(false);
        return;
      }

      if ((count ?? 0) >= MAX_ENTRY_PHOTOS_PER_TYPE) {
        setPhotoEditError(
          `Max ${MAX_ENTRY_PHOTOS_PER_TYPE} photos for ${PHOTO_TYPE_LABELS[nextType]}.`
        );
        setIsUpdatingPhotoMeta(false);
        return;
      }

      const { error } = await supabase
        .from("entry_photos")
        .update({ type: nextType })
        .eq("id", activePhoto.id)
        .eq("entry_id", entry.id);

      if (error) {
        setPhotoEditError(error.message);
        setIsUpdatingPhotoMeta(false);
        return;
      }

      setPhotoTypePickerOpen(false);
      setIsUpdatingPhotoMeta(false);
      await loadEntry();
    },
    [activePhoto?.editable, activePhoto?.id, activePhoto?.type, entry, isOwner, loadEntry, user?.id]
  );

  const updateActivePhotoOrder = useCallback(
    async (targetIndex: number) => {
      if (!entry || !activePhoto?.editable || !isOwner || !user?.id) {
        return;
      }

      const editablePhotos = photos.filter((photo) => photo.editable);
      const sourceIndex = editablePhotos.findIndex((photo) => photo.id === activePhoto.id);
      if (sourceIndex < 0) {
        return;
      }

      const clampedTarget = Math.max(0, Math.min(editablePhotos.length - 1, targetIndex));
      if (clampedTarget === sourceIndex) {
        setPhotoOrderPickerOpen(false);
        return;
      }

      const reordered = [...editablePhotos];
      const [moved] = reordered.splice(sourceIndex, 1);
      reordered.splice(clampedTarget, 0, moved);

      setIsUpdatingPhotoMeta(true);
      setPhotoEditError(null);
      for (let index = 0; index < reordered.length; index += 1) {
        const photo = reordered[index];
        const { error } = await supabase
          .from("entry_photos")
          .update({ position: index })
          .eq("id", photo.id)
          .eq("entry_id", entry.id);
        if (error) {
          setPhotoEditError(error.message);
          setIsUpdatingPhotoMeta(false);
          return;
        }
      }

      setPhotoOrderPickerOpen(false);
      setIsUpdatingPhotoMeta(false);
      await loadEntry();
    },
    [activePhoto?.editable, activePhoto?.id, entry, isOwner, loadEntry, photos, user?.id]
  );

  const addPhotosToEntry = useCallback(async () => {
    if (!entry || !isOwner || !user?.id || !isEditFormVisible) {
      return;
    }

    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      setPhotoEditError("Allow photo access to add images.");
      return;
    }

    const pickerResult = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsMultipleSelection: false,
      selectionLimit: 1,
      allowsEditing: true,
      quality: 0.8,
    });
    if (pickerResult.canceled) {
      return;
    }

    const assets = pickerResult.assets
      .filter((asset) => typeof asset.uri === "string" && asset.uri.trim().length > 0)
      .slice(0, 1);
    if (assets.length === 0) {
      setPhotoEditError("No photos selected.");
      return;
    }

    const fallbackType: EntryPhotoType =
      activePhoto?.editable && activePhoto.type ? activePhoto.type : "label";

    setIsUpdatingPhotoMeta(true);
    setPhotoEditError(null);
    try {
      const nextPositionByType = new Map<EntryPhotoType, number>();
      for (const asset of assets) {
        const mimeType = ensurePhotoMimeType(asset.mimeType, asset.fileName, asset.uri);
        const extension = extensionForMimeType(mimeType);
        const fileName =
          asset.fileName && asset.fileName.trim().length > 0
            ? asset.fileName
            : `entry-photo-${Date.now()}.${extension}`;
        const targetType = await inferPhotoTypeFromAi({
          fallbackType,
          uri: asset.uri,
          name: fileName,
          mimeType,
        });

        let nextPosition = nextPositionByType.get(targetType);
        if (nextPosition === undefined) {
          const { count, error: countError } = await supabase
            .from("entry_photos")
            .select("id", { count: "exact", head: true })
            .eq("entry_id", entry.id)
            .eq("type", targetType);

          if (countError) {
            throw new Error(countError.message);
          }

          if ((count ?? 0) >= MAX_ENTRY_PHOTOS_PER_TYPE) {
            throw new Error(
              `Max ${MAX_ENTRY_PHOTOS_PER_TYPE} photos for ${PHOTO_TYPE_LABELS[targetType]}.`
            );
          }
          nextPosition = count ?? 0;
        }

        const createResult = await supabase
          .from("entry_photos")
          .insert({
            entry_id: entry.id,
            type: targetType,
            path: "pending",
            position: nextPosition,
          })
          .select("id")
          .single();

        if (createResult.error || !createResult.data?.id) {
          throw new Error(createResult.error?.message ?? "Unable to create photo record.");
        }

        const createdPhotoId = createResult.data.id;
        const storagePath = `${user.id}/${entry.id}/${targetType}/${createdPhotoId}.${extension}`;
        try {
          const updateResult = await supabase
            .from("entry_photos")
            .update({ path: storagePath })
            .eq("id", createdPhotoId)
            .eq("entry_id", entry.id);
          if (updateResult.error) {
            throw new Error(updateResult.error.message);
          }

          const fileBytes = await readPhotoBytes(asset.uri);
          const uploadResult = await supabase.storage
            .from("wine-photos")
            .upload(storagePath, fileBytes, {
              upsert: true,
              contentType: mimeType,
            });
          if (uploadResult.error) {
            throw new Error(uploadResult.error.message);
          }
        } catch (error) {
          await supabase.storage.from("wine-photos").remove([storagePath]);
          await supabase
            .from("entry_photos")
            .delete()
            .eq("id", createdPhotoId)
            .eq("entry_id", entry.id);
          throw error;
        }

        nextPositionByType.set(targetType, nextPosition + 1);
      }

      await loadEntry();
      Alert.alert(
        "Photos added",
        `Added ${assets.length} photo${assets.length === 1 ? "" : "s"}.`
      );
    } catch (error) {
      setPhotoEditError(error instanceof Error ? error.message : "Unable to add photos.");
    } finally {
      setIsUpdatingPhotoMeta(false);
    }
  }, [
    activePhoto?.editable,
    activePhoto?.type,
    entry,
    inferPhotoTypeFromAi,
    isEditFormVisible,
    isOwner,
    loadEntry,
    user?.id,
  ]);

  const removeActivePhoto = useCallback(async () => {
    if (!entry || !activePhoto?.editable || !isOwner || !user?.id) {
      return;
    }

    setIsUpdatingPhotoMeta(true);
    setPhotoEditError(null);
    try {
      const fetchResult = await supabase
        .from("entry_photos")
        .select("id, path")
        .eq("id", activePhoto.id)
        .eq("entry_id", entry.id)
        .maybeSingle();

      if (fetchResult.error) {
        throw new Error(fetchResult.error.message);
      }
      if (!fetchResult.data) {
        throw new Error("Photo record not found.");
      }

      const storagePath = toStorageObjectPath(fetchResult.data.path);
      const deleteResult = await supabase
        .from("entry_photos")
        .delete()
        .eq("id", fetchResult.data.id)
        .eq("entry_id", entry.id);

      if (deleteResult.error) {
        throw new Error(deleteResult.error.message);
      }

      if (storagePath) {
        await supabase.storage.from("wine-photos").remove([storagePath]);
      }

      await loadEntry();
    } catch (error) {
      setPhotoEditError(error instanceof Error ? error.message : "Unable to remove photo.");
    } finally {
      setIsUpdatingPhotoMeta(false);
    }
  }, [activePhoto?.editable, activePhoto?.id, entry, isOwner, loadEntry, user?.id]);

  const openCropEditorForActivePhoto = useCallback(() => {
    if (!activePhoto?.url) {
      return;
    }
    const saved = savedCropByPhotoId[activePhoto.id];
    setPhotoEditError(null);
    setCropPhotoId(activePhoto.id);
    setCropCenterX(saved?.centerX ?? 50);
    setCropCenterY(saved?.centerY ?? 50);
    setCropZoom(saved?.zoom ?? 1);
    cropDragRef.current = null;
  }, [activePhoto?.id, activePhoto?.url, savedCropByPhotoId]);

  const closeCropEditor = useCallback(() => {
    if (isSavingCrop) {
      return;
    }
    setCropPhotoId(null);
    setCropImageNaturalSize(null);
    setCropFrameSize(0);
    setCropSourceLoading(false);
    cropDragRef.current = null;
  }, [isSavingCrop]);

  const getTouchDistance = (event: GestureResponderEvent) => {
    const touches = event.nativeEvent.touches;
    if (touches.length < 2) {
      return null;
    }
    const [touchA, touchB] = touches;
    const dx = touchA.pageX - touchB.pageX;
    const dy = touchA.pageY - touchB.pageY;
    return Math.hypot(dx, dy);
  };

  const getPrimaryTouchPoint = (event: GestureResponderEvent) => {
    const touch =
      event.nativeEvent.touches[0] ??
      event.nativeEvent.changedTouches?.[0];
    if (!touch) {
      return null;
    }
    return {
      x: touch.pageX,
      y: touch.pageY,
    };
  };

  const handleCropResponderGrant = (event: GestureResponderEvent) => {
    const pinchDistance = getTouchDistance(event);
    if (typeof pinchDistance === "number" && pinchDistance > 0) {
      cropDragRef.current = {
        mode: "pinch",
        startDistance: pinchDistance,
        startZoom: cropZoom,
      };
      return;
    }

    const touchPoint = getPrimaryTouchPoint(event);
    if (!touchPoint) {
      return;
    }
    cropDragRef.current = {
      mode: "pan",
      startX: touchPoint.x,
      startY: touchPoint.y,
      startCenterX: cropCenterX,
      startCenterY: cropCenterY,
    };
  };

  const handleCropResponderMove = (event: GestureResponderEvent) => {
    const drag = cropDragRef.current;
    const geometry = getCropGeometry();
    if (!drag || !geometry) {
      return;
    }

    const pinchDistance = getTouchDistance(event);
    if (typeof pinchDistance === "number" && pinchDistance > 0) {
      if (drag.mode !== "pinch") {
        cropDragRef.current = {
          mode: "pinch",
          startDistance: pinchDistance,
          startZoom: cropZoom,
        };
        return;
      }
      const zoomScale = pinchDistance / Math.max(1, drag.startDistance);
      const nextZoom = clampCropZoom(drag.startZoom * zoomScale);
      setCropZoom((current) =>
        Math.abs(current - nextZoom) < 0.01 ? current : nextZoom
      );
      return;
    }

    if (drag.mode !== "pan") {
      const touchPoint = getPrimaryTouchPoint(event);
      if (!touchPoint) {
        return;
      }
      cropDragRef.current = {
        mode: "pan",
        startX: touchPoint.x,
        startY: touchPoint.y,
        startCenterX: cropCenterX,
        startCenterY: cropCenterY,
      };
      return;
    }

    const touchPoint = getPrimaryTouchPoint(event);
    if (!touchPoint) {
      return;
    }
    const dx = touchPoint.x - drag.startX;
    const dy = touchPoint.y - drag.startY;
    const horizontalTravel = geometry.overflowX;
    const verticalTravel = geometry.overflowY;
    const nextCenterX =
      horizontalTravel > 6
        ? clampCropPercent(
            drag.startCenterX - (dx / horizontalTravel) * 100
          )
        : drag.startCenterX;
    const nextCenterY =
      verticalTravel > 6
        ? clampCropPercent(
            drag.startCenterY - (dy / verticalTravel) * 100
          )
        : drag.startCenterY;

    setCropCenterX((current) =>
      Math.abs(current - nextCenterX) < 0.08 ? current : nextCenterX
    );
    setCropCenterY((current) =>
      Math.abs(current - nextCenterY) < 0.08 ? current : nextCenterY
    );
  };

  const saveCropEdits = useCallback(async () => {
    if (!entry || !activeCropPhoto?.url || !isOwner) {
      return;
    }

    setIsSavingCrop(true);
    setPhotoEditError(null);
    try {
      let sourceDataUrl = cropSourceDataUrlByPhotoId[activeCropPhoto.id] ?? null;
      let croppedDataUrl: string | null = null;
      let croppedMimeType = "image/jpeg";

      if (WEB_API_BASE_URL) {
        const accessToken = await getAccessTokenForApi();
        if (!accessToken) {
          setPhotoEditError("Session expired. Sign in again to save crop edits.");
          return;
        }

        if (!sourceDataUrl) {
          const sourceBytes = await readPhotoBytes(activeCropPhoto.url);
          const sourceMimeType = ensurePhotoMimeType(null, null, activeCropPhoto.url);
          sourceDataUrl = `data:${sourceMimeType};base64,${arrayBufferToBase64(
            sourceBytes
          )}`;
        }

        const formData = new FormData();
        formData.append("photo_data_url", sourceDataUrl);
        formData.append("center_x", String(cropCenterX));
        formData.append("center_y", String(cropCenterY));
        formData.append("zoom", String(cropZoom));

        const response = await fetch(`${WEB_API_BASE_URL}/api/photo-crop`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
          body: formData,
        });
        const payload = (await response.json().catch(() => ({}))) as {
          cropped_data_url?: string;
          mime_type?: string;
          error?: string;
        };
        if (!response.ok || !payload.cropped_data_url) {
          if (response.status === 401) {
            throw new Error("Session expired. Sign in again to save crop edits.");
          }
          throw new Error(payload.error ?? "Unable to crop this image.");
        }
        croppedDataUrl = payload.cropped_data_url;
        croppedMimeType = payload.mime_type ?? croppedMimeType;
      } else {
        if (!sourceDataUrl) {
          const sourceBytes = await readPhotoBytes(activeCropPhoto.url);
          const sourceMimeType = ensurePhotoMimeType(null, null, activeCropPhoto.url);
          sourceDataUrl = `data:${sourceMimeType};base64,${arrayBufferToBase64(
            sourceBytes
          )}`;
        }
        const geometry = getCropGeometry();
        if (!geometry || !cropImageNaturalSize) {
          throw new Error("Crop support unavailable for this image.");
        }
        const originX = Math.max(0, -geometry.offsetX);
        const originY = Math.max(0, -geometry.offsetY);
        const width = Math.min(cropFrameSize, geometry.renderedWidth);
        const height = Math.min(cropFrameSize, geometry.renderedHeight);
        const scaleX =
          cropImageNaturalSize.width / Math.max(1, geometry.renderedWidth);
        const scaleY =
          cropImageNaturalSize.height / Math.max(1, geometry.renderedHeight);
        const cropRect = {
          originX: Math.max(
            0,
            Math.min(cropImageNaturalSize.width - 1, Math.round(originX * scaleX))
          ),
          originY: Math.max(
            0,
            Math.min(cropImageNaturalSize.height - 1, Math.round(originY * scaleY))
          ),
          width: Math.max(
            1,
            Math.min(cropImageNaturalSize.width, Math.round(width * scaleX))
          ),
          height: Math.max(
            1,
            Math.min(cropImageNaturalSize.height, Math.round(height * scaleY))
          ),
        };
        const croppedImage = await manipulateAsync(
          sourceDataUrl,
          [{ crop: cropRect }],
          {
            compress: 0.92,
            format: SaveFormat.JPEG,
            base64: true,
          }
        );
        if (!croppedImage.base64) {
          throw new Error("Unable to crop this image.");
        }
        croppedDataUrl = `data:image/jpeg;base64,${croppedImage.base64}`;
      }

      const cropRowResult = await supabase
        .from("entry_photos")
        .select("id, path")
        .eq("id", activeCropPhoto.id)
        .eq("entry_id", entry.id)
        .maybeSingle();
      if (cropRowResult.error) {
        throw new Error(cropRowResult.error.message);
      }
      const storagePath = toStorageObjectPath(cropRowResult.data?.path ?? "");
      if (!storagePath) {
        throw new Error("Photo record not found.");
      }

      const croppedBytes = await readPhotoBytes(croppedDataUrl);
      const uploadResult = await supabase.storage
        .from("wine-photos")
        .upload(storagePath, croppedBytes, {
          upsert: true,
          contentType: croppedMimeType,
        });
      if (uploadResult.error) {
        throw new Error(uploadResult.error.message);
      }

      if (sourceDataUrl) {
        setCropSourceDataUrlByPhotoId((current) =>
          current[activeCropPhoto.id]
            ? current
            : { ...current, [activeCropPhoto.id]: sourceDataUrl }
        );
      }
      setSavedCropByPhotoId((current) => ({
        ...current,
        [activeCropPhoto.id]: {
          centerX: cropCenterX,
          centerY: cropCenterY,
          zoom: cropZoom,
        },
      }));

      await loadEntry();
      setCropPhotoId(null);
      setCropImageNaturalSize(null);
      setCropFrameSize(0);
      setCropSourceLoading(false);
      cropDragRef.current = null;
    } catch (error) {
      setPhotoEditError(
        error instanceof Error ? error.message : "Unable to save crop edits."
      );
    } finally {
      setIsSavingCrop(false);
    }
  }, [
    activeCropPhoto?.id,
    activeCropPhoto?.url,
    cropSourceDataUrlByPhotoId,
    cropCenterX,
    cropCenterY,
    cropZoom,
    cropFrameSize,
    cropImageNaturalSize,
    getCropGeometry,
    entry,
    isOwner,
    loadEntry,
  ]);

  const addPrimaryGrape = useCallback((grape: PrimaryGrape) => {
    setSelectedPrimaryGrapes((current) => {
      if (current.some((item) => item.id === grape.id) || current.length >= 3) {
        return current;
      }
      return [
        ...current,
        {
          id: grape.id,
          name: grape.name,
          position: current.length + 1,
        },
      ];
    });
    setPrimaryGrapeQuery("");
    setPrimaryGrapeSuggestions([]);
    setPrimaryGrapeError(null);
    setBulkReviewError(null);
  }, []);

  const removePrimaryGrape = useCallback((grapeId: string) => {
    setSelectedPrimaryGrapes((current) =>
      current
        .filter((grape) => grape.id !== grapeId)
        .map((grape, index) => ({ ...grape, position: index + 1 }))
    );
    setBulkReviewError(null);
  }, []);

  const updateBulkAdvancedNote = useCallback(
    (key: AdvancedNoteKey, value: string) => {
      setBulkAdvancedNotes((current) => ({ ...current, [key]: value }));
      setBulkReviewError(null);
    },
    []
  );

  const toggleFriend = useCallback((friendId: string) => {
    setSelectedTastedWithIds((current) =>
      current.includes(friendId)
        ? current.filter((id) => id !== friendId)
        : [...current, friendId]
    );
    setFriendSearch("");
    setBulkReviewError(null);
  }, []);

  const openLocation = async () => {
    if (!canOpenLocation) {
      return;
    }
    const url = buildGoogleMapsLocationUrl(locationText);
    const canOpen = await Linking.canOpenURL(url);
    if (canOpen) {
      await Linking.openURL(url);
    }
  };

  const scrollToPhotoIndex = (index: number, animated = true) => {
    if (!galleryScrollRef.current || photoFrameWidth <= 0) {
      return;
    }
    const maxIndex = Math.max(0, photos.length - 1);
    const nextIndex = Math.max(0, Math.min(maxIndex, index));
    setActivePhotoIndex(nextIndex);
    galleryScrollRef.current.scrollTo({
      x: nextIndex * photoFrameWidth,
      animated,
    });
  };

  const markPhotoFailed = useCallback((photoId: string) => {
    setFailedPhotoIds((current) => {
      if (current.has(photoId)) {
        return current;
      }
      const next = new Set(current);
      next.add(photoId);
      return next;
    });
  }, []);

  const openAuthorProfile = () => {
    if (!entry) {
      return;
    }
    if (user?.id && entry.user_id === user.id) {
      router.push("/(app)/profile");
      return;
    }
    router.push(`/(app)/profile/${entry.user_id}`);
  };

  const buildBulkEntryHref = (targetEntryId: string, nextQueue: string[], nextIndex: number) =>
    `/(app)/entries/${targetEntryId}?bulk=1&queue=${encodeURIComponent(
      nextQueue.join(",")
    )}&index=${nextIndex}`;

  const deleteEntryById = useCallback(
    async (targetEntryId: string) => {
      if (!user?.id) {
        throw new Error("You must be signed in.");
      }

      const webApiBaseUrl = getWebApiBaseUrl();
      if (webApiBaseUrl) {
        const accessToken = await getAccessTokenForApi();
        if (accessToken) {
          let response: Response | null = null;
          const deleteRequest = fetch(`${webApiBaseUrl}/api/entries/${targetEntryId}`, {
            method: "DELETE",
            headers: {
              Authorization: `Bearer ${accessToken}`,
            },
          });
          try {
            response = await new Promise<Response | null>((resolve, reject) => {
              const timeoutId = setTimeout(() => resolve(null), 1200);

              deleteRequest
                .then((nextResponse) => {
                  clearTimeout(timeoutId);
                  resolve(nextResponse);
                })
                .catch((error) => {
                  clearTimeout(timeoutId);
                  reject(error);
                });
            });
          } catch {
            response = null;
          }

          if (response) {
            const payload = (await response.json().catch(() => ({}))) as {
              error?: string;
            };

            if (!response.ok) {
              throw new Error(payload.error ?? "Unable to delete entry.");
            }

            return;
          }
        }
      }

      const { data: targetEntry, error: targetEntryError } = await supabase
        .from("wine_entries")
        .select("id, user_id, label_image_path, place_image_path, pairing_image_path")
        .eq("id", targetEntryId)
        .maybeSingle();

      if (targetEntryError) {
        throw new Error(targetEntryError.message);
      }
      if (!targetEntry) {
        return;
      }
      if (targetEntry.user_id !== user.id) {
        throw new Error("You can only delete your own entries.");
      }

      const { data: photoRows, error: photoFetchError } = await supabase
        .from("entry_photos")
        .select("path")
        .eq("entry_id", targetEntryId);

      if (photoFetchError) {
        throw new Error(photoFetchError.message);
      }

      const paths = Array.from(
        new Set(
          [
            targetEntry.label_image_path,
            targetEntry.place_image_path,
            targetEntry.pairing_image_path,
            ...((photoRows ?? []) as Array<{ path: string | null }>).map(
              (photo) => photo.path
            ),
          ].filter((path): path is string => Boolean(path && path !== "pending"))
        )
      );

      const { error: deleteErrorResponse } = await supabase
        .from("wine_entries")
        .delete()
        .eq("id", targetEntryId)
        .eq("user_id", user.id);

      if (deleteErrorResponse) {
        throw new Error(deleteErrorResponse.message);
      }

      if (paths.length > 0) {
        await supabase.storage.from("wine-photos").remove(paths);
      }
    },
    [user?.id]
  );

  const onDeleteEntry = useCallback(async () => {
    if (!entry || deleting) {
      return;
    }

    setDeleting(true);
    setDeleteError(null);

    try {
      await deleteEntryById(entry.id);

      router.replace("/(app)/entries");
    } catch (error) {
      setDeleteError(
        error instanceof Error ? error.message : "Unable to delete entry."
      );
      setDeleting(false);
    }
  }, [deleteEntryById, deleting, entry]);

  const confirmDeleteEntry = useCallback(() => {
    if (!entry || deleting) {
      return;
    }

    Alert.alert(
      "Delete this entry?",
      "This action can't be undone. The entry and its photos will be removed.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: deleting ? "Deleting..." : "Delete",
          style: "destructive",
          onPress: () => {
            void onDeleteEntry();
          },
        },
      ]
    );
  }, [deleting, entry, onDeleteEntry]);

  const updateBulkReviewField = useCallback(
    <K extends keyof BulkReviewFormState>(field: K, value: BulkReviewFormState[K]) => {
      setBulkReviewError(null);
      setBulkReviewForm((current) => ({ ...current, [field]: value }));
    },
    []
  );

  const publishBulkQueueEntries = useCallback(
    async (entryIds: string[]) => {
      if (!user?.id || entryIds.length === 0) {
        return;
      }

      await supabase
        .from("wine_entries")
        .update({ is_feed_visible: true })
        .in("id", entryIds)
        .eq("user_id", user.id);
    },
    [user?.id]
  );

  const persistEditedEntry = useCallback(async () => {
    if (!entry || !user?.id) {
      return "You must be signed in.";
    }

    const wineName = normalizeWineNameText(bulkReviewForm.wine_name);
    if (!wineName) {
      return "Wine name is required.";
    }

    const ratingRaw = bulkReviewForm.rating.trim();
    let ratingValue: number | null = null;
    if (ratingRaw.length === 0) {
      if (isBulkReview) {
        return "Rating required.";
      }
    } else {
      const parsed = Number(ratingRaw);
      if (!Number.isFinite(parsed)) {
        return "Rating required.";
      }
      if (!Number.isInteger(parsed)) {
        return "Rating must be a whole number (integer).";
      }
      if (parsed < 1 || parsed > 100) {
        return "Rating must be between 1 and 100.";
      }
      ratingValue = parsed;
    }

    const priceRaw = bulkReviewForm.price_paid.trim();
    let priceValue: number | null = null;
    if (priceRaw.length > 0) {
      const parsed = Number(priceRaw);
      if (!Number.isFinite(parsed) || parsed < 0 || parsed > 100000) {
        return "Price paid must be a valid number.";
      }
      priceValue = Number(parsed.toFixed(2));
    }

    const priceCurrency = bulkReviewForm.price_paid_currency || null;
    const priceSource = bulkReviewForm.price_paid_source || null;
    if (priceValue !== null && !priceCurrency) {
      return "Select a currency when entering price paid.";
    }
    if (priceValue !== null && !priceSource) {
      return "Select retail or restaurant when entering price paid.";
    }
    if (priceValue === null && (priceCurrency || priceSource)) {
      return "Enter a price paid amount when setting currency/source.";
    }

    const consumedAtRaw = bulkReviewForm.consumed_at.trim();
    if (consumedAtRaw.length > 0 && !/^\d{4}-\d{2}-\d{2}$/.test(consumedAtRaw)) {
      return "Consumed date must be YYYY-MM-DD.";
    }

    const advancedNotesPayload = toAdvancedNotesPayload(bulkAdvancedNotes);
    const primaryGrapeIds = selectedPrimaryGrapes
      .slice(0, 3)
      .map((grape) => grape.id);
    const nextTastedWithIds = Array.from(new Set(selectedTastedWithIds));

    const { error: updateError } = await supabase
      .from("wine_entries")
      .update({
        wine_name: wineName,
        producer: normalizeProducerText(bulkReviewForm.producer),
        vintage: normalizeOptionalText(bulkReviewForm.vintage),
        country: normalizeOptionalText(bulkReviewForm.country),
        region: normalizeOptionalText(bulkReviewForm.region),
        appellation: normalizeOptionalText(bulkReviewForm.appellation),
        classification: normalizeOptionalText(bulkReviewForm.classification),
        rating: ratingValue,
        price_paid: priceValue,
        price_paid_currency: priceValue !== null ? priceCurrency : null,
        price_paid_source: priceValue !== null ? priceSource : null,
        qpr_level: bulkReviewForm.qpr_level || null,
        location_text: normalizeOptionalText(bulkReviewForm.location_text),
        location_place_id: normalizeOptionalText(bulkReviewForm.location_place_id),
        consumed_at: consumedAtRaw.length > 0 ? consumedAtRaw : entry.consumed_at,
        notes: normalizeOptionalText(bulkReviewForm.notes),
        tasted_with_user_ids: nextTastedWithIds,
        advanced_notes: advancedNotesPayload,
        is_feed_visible: true,
      })
      .eq("id", entry.id)
      .eq("user_id", user.id);

    if (updateError) {
      return updateError.message;
    }

    const { error: clearPrimaryGrapesError } = await supabase
      .from("entry_primary_grapes")
      .delete()
      .eq("entry_id", entry.id);

    if (
      clearPrimaryGrapesError &&
      !isPrimaryGrapeTableMissingError(clearPrimaryGrapesError.message ?? "")
    ) {
      return clearPrimaryGrapesError.message;
    }

    if (primaryGrapeIds.length > 0) {
      const { error: insertPrimaryGrapesError } = await supabase
        .from("entry_primary_grapes")
        .insert(
          primaryGrapeIds.map((grapeId, index) => ({
            entry_id: entry.id,
            variety_id: grapeId,
            position: index + 1,
          }))
        );
      if (
        insertPrimaryGrapesError &&
        !isPrimaryGrapeTableMissingError(insertPrimaryGrapesError.message ?? "")
      ) {
        return insertPrimaryGrapesError.message;
      }
    }

    return null;
  }, [
    bulkAdvancedNotes,
    bulkReviewForm,
    entry,
    isBulkReview,
    selectedPrimaryGrapes,
    selectedTastedWithIds,
    user?.id,
  ]);

  const saveBulkReview = useCallback(
    async (intent: "next" | "exit") => {
      if (
        !isBulkReview ||
        !entry ||
        !user?.id ||
        deleting ||
        isDeletingBulkQueue ||
        isSavingBulkReview
      ) {
        return;
      }

      setIsSavingBulkReview(true);
      setBulkReviewError(null);
      setDeleteError(null);

      const persistError = await persistEditedEntry();
      if (persistError) {
        setBulkReviewError(persistError);
        setIsSavingBulkReview(false);
        return;
      }

      const uniqueQueue = Array.from(new Set(bulkQueue));
      if (intent === "exit") {
        try {
          await publishBulkQueueEntries(uniqueQueue);
        } catch {
          // Best effort; current entry is already published.
        }
        router.replace("/(app)/entries");
        setIsSavingBulkReview(false);
        return;
      }

      if (nextBulkEntryId) {
        router.replace(
          buildBulkEntryHref(nextBulkEntryId, bulkQueue, currentBulkIndex + 1) as never
        );
      } else {
        router.replace("/(app)/entries");
      }

      setIsSavingBulkReview(false);
    },
    [
      bulkQueue,
      currentBulkIndex,
      deleting,
      entry,
      isBulkReview,
      isDeletingBulkQueue,
      isSavingBulkReview,
      nextBulkEntryId,
      persistEditedEntry,
      publishBulkQueueEntries,
      user?.id,
    ]
  );

  const startOwnerEdit = useCallback(() => {
    if (!isOwner || isBulkReview) {
      return;
    }
    setBulkReviewError(null);
    setDeleteError(null);
    setOwnerEditOpen(true);
  }, [isBulkReview, isOwner]);

  const cancelOwnerEdit = useCallback(() => {
    setOwnerEditOpen(false);
    setBulkReviewError(null);
    setDeleteError(null);
    void loadEntry();
  }, [loadEntry]);

  const saveOwnerEdit = useCallback(async () => {
    if (
      !isOwner ||
      isBulkReview ||
      !entry ||
      !user?.id ||
      deleting ||
      isDeletingBulkQueue ||
      isSavingBulkReview ||
      isSavingOwnerEdit
    ) {
      return;
    }

    setIsSavingOwnerEdit(true);
    setBulkReviewError(null);
    setDeleteError(null);

    const persistError = await persistEditedEntry();
    if (persistError) {
      setBulkReviewError(persistError);
      setIsSavingOwnerEdit(false);
      return;
    }

    setOwnerEditOpen(false);
    await loadEntry();
    setIsSavingOwnerEdit(false);
  }, [
    deleting,
    entry,
    isBulkReview,
    isDeletingBulkQueue,
    isOwner,
    isSavingBulkReview,
    isSavingOwnerEdit,
    loadEntry,
    persistEditedEntry,
    user?.id,
  ]);

  const goToNextBulkEntry = useCallback(() => {
    if (!isBulkReview) {
      return;
    }
    void saveBulkReview("next");
  }, [isBulkReview, saveBulkReview]);

  const cancelEntireBulkQueue = useCallback(() => {
    if (
      !isBulkReview ||
      bulkQueue.length === 0 ||
      deleting ||
      isDeletingBulkQueue ||
      isSavingBulkReview
    ) {
      return;
    }

    Alert.alert(
      "Cancel entire bulk queue?",
      `This deletes all ${bulkQueue.length} queued entr${
        bulkQueue.length === 1 ? "y" : "ies"
      } and their photos.`,
      [
        { text: "Keep queue", style: "cancel" },
        {
          text: "Delete all",
          style: "destructive",
          onPress: () => {
            void (async () => {
              setIsDeletingBulkQueue(true);
              setDeleteError(null);
              const uniqueEntryIds = Array.from(new Set(bulkQueue));
              let failedCount = 0;
              for (const queuedEntryId of uniqueEntryIds) {
                try {
                  await deleteEntryById(queuedEntryId);
                } catch {
                  failedCount += 1;
                }
              }
              setIsDeletingBulkQueue(false);
              if (failedCount > 0) {
                setDeleteError(
                  `Deleted ${
                    uniqueEntryIds.length - failedCount
                  }/${uniqueEntryIds.length} entries.`
                );
              }
              router.replace("/(app)/entries");
            })();
          },
        },
      ]
    );
  }, [
    bulkQueue,
    deleteEntryById,
    deleting,
    isBulkReview,
    isDeletingBulkQueue,
    isSavingBulkReview,
  ]);

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      style={styles.screen}
    >
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode={Platform.OS === "ios" ? "interactive" : "on-drag"}
        automaticallyAdjustKeyboardInsets
      >
        <AppTopBar />

        <Pressable
          style={styles.backLink}
          onPress={() => {
            router.back();
          }}
        >
          <AppText style={styles.backLinkText}>{"\u2190"} Back</AppText>
        </Pressable>

        {loading ? (
          <View style={styles.loadingCard}>
            <ActivityIndicator color={colors.grenache} />
            <AppText style={styles.loadingText}>Loading entry...</AppText>
          </View>
        ) : errorMessage || !entry ? (
          <View style={styles.errorCard}>
            <AppText style={styles.errorText}>{errorMessage ?? "Entry unavailable."}</AppText>
          </View>
        ) : (
          <>
            {isBulkReview ? (
              <View style={styles.bulkReviewCard}>
                <AppText style={styles.bulkReviewEyebrow}>Bulk review</AppText>
                <AppText style={styles.bulkReviewTitle}>
                  Wine {bulkProgressLabel ?? "1/1"} in your bulk queue
                </AppText>
                <AppText style={styles.bulkReviewDescription}>
                  Review this entry, then continue to the next wine.
                </AppText>
              </View>
            ) : null}
            <View style={styles.headerBlock}>
              <Pressable style={styles.authorRow} onPress={openAuthorProfile}>
                <View style={styles.authorAvatar}>
                  {authorAvatarUrl ? (
                    <Image source={{ uri: authorAvatarUrl }} style={styles.authorAvatarImage} />
                  ) : (
                    <AppText style={styles.authorAvatarFallback}>
                      {(authorName || "?")[0]?.toUpperCase() ?? "?"}
                    </AppText>
                  )}
                </View>
                <View style={styles.authorMeta}>
                  <AppText style={styles.authorName}>{authorName}</AppText>
                  <AppText style={styles.authorDate}>
                    {formatConsumedDate(entry.consumed_at)}
                  </AppText>
                </View>
              </Pressable>
              <AppText style={styles.eyebrow}>Cellar entry</AppText>
              {isBulkReview ? (
                <DoneTextInput
                  value={bulkReviewForm.wine_name}
                  onChangeText={(value) => updateBulkReviewField("wine_name", value)}
                  placeholder="Wine name"
                  placeholderTextColor={colors.textTertiary}
                  autoCapitalize="words"
                  autoCorrect={false}
                  style={styles.headerTitleInput}
                />
              ) : (
                <AppText style={styles.title}>
                  {entry.wine_name?.trim() || "Untitled wine"}
                </AppText>
              )}
              <AppText style={styles.subtitle}>
                {entry.producer?.trim() || "Unknown producer"}
              </AppText>
            </View>

            <View
              style={styles.photoFrame}
              onLayout={(event) => {
                const width = event.nativeEvent.layout.width;
                if (width > 0 && Math.abs(width - photoFrameWidth) > 0.5) {
                  setPhotoFrameWidth(width);
                  if (galleryScrollRef.current && hasMultiplePhotos) {
                    galleryScrollRef.current.scrollTo({
                      x: activePhotoIndex * width,
                      animated: false,
                    });
                  }
                }
              }}
            >
              {activePhoto?.url && !activePhotoFailed ? (
                <>
                  {hasMultiplePhotos && photoFrameWidth > 0 ? (
                    <ScrollView
                      ref={(node) => {
                        galleryScrollRef.current = node;
                      }}
                      horizontal
                      pagingEnabled
                      bounces={false}
                      showsHorizontalScrollIndicator={false}
                      decelerationRate="fast"
                      onMomentumScrollEnd={(event) => {
                        if (photoFrameWidth <= 0) {
                          return;
                        }
                        const offsetX = event.nativeEvent.contentOffset.x;
                        const nextIndex = Math.round(offsetX / photoFrameWidth);
                        const maxIndex = Math.max(0, photos.length - 1);
                        const clampedIndex = Math.max(0, Math.min(maxIndex, nextIndex));
                        setActivePhotoIndex(clampedIndex);
                        const snappedX = clampedIndex * photoFrameWidth;
                        if (Math.abs(offsetX - snappedX) > 0.5 && galleryScrollRef.current) {
                          galleryScrollRef.current.scrollTo({
                            x: snappedX,
                            animated: false,
                          });
                        }
                      }}
                    >
                      {photos.map((photo, index) => (
                        photo.url && !failedPhotoIds.has(photo.id) ? (
                          <Image
                            key={`${photo.id}-${index}`}
                            source={{ uri: photo.url }}
                            style={[styles.photoSlide, { width: photoFrameWidth }]}
                            resizeMode="cover"
                            onError={() => markPhotoFailed(photo.id)}
                          />
                        ) : (
                          <View key={`${photo.id}-${index}`} style={[styles.photoSlide, styles.photoFallback, { width: photoFrameWidth }]}>
                            <AppText style={styles.photoFallbackText}>Photo unavailable.</AppText>
                          </View>
                        )
                      ))}
                    </ScrollView>
                  ) : (
                    <Image
                      source={{ uri: activePhoto.url }}
                      style={styles.photoStatic}
                      resizeMode="cover"
                      onError={() => markPhotoFailed(activePhoto.id)}
                    />
                  )}

                  <Pressable
                    style={[
                      styles.photoTypeChip,
                      canEditActivePhotoMeta ? styles.photoTypeChipEditable : null,
                    ]}
                    onPress={() => {
                      if (canEditActivePhotoMeta) {
                        setPhotoTypePickerOpen(true);
                      }
                    }}
                    disabled={!canEditActivePhotoMeta}
                  >
                    <AppText style={styles.photoTypeChipText}>
                      {PHOTO_TYPE_LABELS[activePhoto.type]}
                      {canEditActivePhotoMeta ? " \u25BE" : ""}
                    </AppText>
                  </Pressable>
                  {hasMultiplePhotos ? (
                    <Pressable
                      style={[
                        styles.photoOrderChip,
                        canEditActivePhotoMeta ? styles.photoOrderChipEditable : null,
                      ]}
                      onPress={() => {
                        if (canEditActivePhotoMeta) {
                          setPhotoOrderPickerOpen(true);
                        }
                      }}
                      disabled={!canEditActivePhotoMeta}
                    >
                      <AppText style={styles.photoOrderChipText}>
                        {toOrdinal(activePhotoIndex + 1)}
                        {canEditActivePhotoMeta ? " \u25BE" : ""}
                      </AppText>
                    </Pressable>
                  ) : null}

                  {hasMultiplePhotos ? (
                    <View style={styles.photoDotRow}>
                      {photos.map((_, index) => (
                        <Pressable
                          key={`dot-${index}`}
                          onPress={() => scrollToPhotoIndex(index)}
                          hitSlop={6}
                          style={[
                            styles.photoDot,
                            index === activePhotoIndex ? styles.photoDotActive : null,
                          ]}
                        />
                      ))}
                    </View>
                  ) : null}
                </>
              ) : (
                <View style={styles.photoFallback}>
                  <AppText style={styles.photoFallbackText}>
                    {photos.length > 0
                      ? "Photos found, but this image could not be displayed."
                      : "No photos uploaded."}
                  </AppText>
                </View>
              )}
            </View>
            {isOwner && isEditFormVisible ? (
              <View style={styles.photoActionRow}>
                <Pressable
                  style={[
                    styles.bulkSecondaryButton,
                    !canManagePhotoContent ? styles.bulkButtonDisabled : null,
                  ]}
                  disabled={!canManagePhotoContent}
                  onPress={() => void addPhotosToEntry()}
                >
                  <AppText style={styles.bulkSecondaryButtonText}>Add images</AppText>
                </Pressable>
                <Pressable
                  style={[
                    styles.bulkSecondaryButton,
                    !canManagePhotoContent || !activePhoto?.editable || !activePhoto?.url
                      ? styles.bulkButtonDisabled
                      : null,
                  ]}
                  disabled={
                    !canManagePhotoContent || !activePhoto?.editable || !activePhoto?.url
                  }
                  onPress={openCropEditorForActivePhoto}
                >
                  <AppText style={styles.bulkSecondaryButtonText}>Crop</AppText>
                </Pressable>
                {canRemoveActivePhoto ? (
                  <Pressable
                    style={[
                      styles.bulkDangerButton,
                      !canManagePhotoContent ? styles.bulkButtonDisabled : null,
                    ]}
                    disabled={!canManagePhotoContent}
                    onPress={() => {
                      Alert.alert(
                        "Delete this photo?",
                        "This removes the current photo from this entry.",
                        [
                          { text: "Cancel", style: "cancel" },
                          {
                            text: "Delete",
                            style: "destructive",
                            onPress: () => {
                              void removeActivePhoto();
                            },
                          },
                        ]
                      );
                    }}
                  >
                    <AppText style={styles.bulkDangerButtonText}>Delete photo</AppText>
                  </Pressable>
                ) : null}
              </View>
            ) : null}
            {photoEditError ? (
              <View style={styles.inlineErrorWrap}>
                <AppText style={styles.bulkReviewErrorText}>{photoEditError}</AppText>
              </View>
            ) : null}

            {isEditFormVisible ? (
              <View style={styles.bulkEditCard}>
                <AppText style={styles.bulkEditTitle}>
                  {isBulkReview ? "Review and edit details" : "Edit entry"}
                </AppText>
                <AppText style={styles.bulkEditDescription}>
                  {isBulkReview
                    ? "Save this wine, then continue through the queue."
                    : "Update details, then save changes."}
                </AppText>
                {!isBulkReview ? (
                  <View style={styles.bulkReviewActionRow}>
                    <Pressable
                      style={[
                        styles.bulkPrimaryButton,
                        ownerEditActionsDisabled ? styles.bulkButtonDisabled : null,
                      ]}
                      onPress={() => void saveOwnerEdit()}
                      disabled={ownerEditActionsDisabled}
                    >
                      <AppText style={styles.bulkPrimaryButtonText}>
                        {isSavingOwnerEdit ? "Saving..." : "Save changes"}
                      </AppText>
                    </Pressable>
                    <Pressable
                      style={[
                        styles.bulkSecondaryButton,
                        ownerEditActionsDisabled ? styles.bulkButtonDisabled : null,
                      ]}
                      onPress={cancelOwnerEdit}
                      disabled={ownerEditActionsDisabled}
                    >
                      <AppText style={styles.bulkSecondaryButtonText}>Cancel</AppText>
                    </Pressable>
                  </View>
                ) : null}

                <View style={styles.bulkFormField}>
                  <AppText style={styles.bulkFormLabel}>Notes</AppText>
                  <DoneTextInput
                    value={bulkReviewForm.notes}
                    onChangeText={(value) => updateBulkReviewField("notes", value)}
                    placeholder="Optional tasting notes"
                    placeholderTextColor={colors.textTertiary}
                    multiline
                    style={[
                      styles.bulkFormInput,
                      styles.bulkFormInputMultiline,
                      { minHeight: 76 },
                    ]}
                  />
                </View>

                <AdaptiveFieldRow minColumnWidth={140}>
                  <Field
                    label="Rating (1-100)"
                    value={bulkReviewForm.rating}
                    onChange={(value) => updateBulkReviewField("rating", value)}
                    keyboardType="number-pad"
                    placeholder="Required"
                    required
                  />
                  <SelectField
                    label="QPR"
                    value={bulkReviewForm.qpr_level}
                    options={QPR_OPTIONS}
                    onChange={(value) =>
                      updateBulkReviewField("qpr_level", value as QprLevel | "")
                    }
                  />
                </AdaptiveFieldRow>

                {isBulkReview ? (
                  <View style={styles.bulkReviewActionRow}>
                    <Pressable
                      style={[styles.bulkSecondaryButton, styles.bulkMinorButton]}
                      onPress={() => setShowBulkMoreDetails((current) => !current)}
                    >
                      <AppText style={styles.bulkMinorButtonText}>
                        Add / edit details
                      </AppText>
                    </Pressable>
                  </View>
                ) : null}

                {isSharedEventBulkReview && showBulkMoreDetails ? (
                  <View
                    style={[
                      styles.bulkEditCard,
                      {
                        borderColor: "rgba(123,29,58,0.24)",
                        backgroundColor: "rgba(123,29,58,0.1)",
                      },
                    ]}
                  >
                    <AppText style={styles.bulkEditTitle}>
                      Shared event details already applied
                    </AppText>
                    <AppText style={styles.bulkEditDescription}>
                      Event wines inherit the shared event name, location, date, and
                      tasted-with list, so this review stays focused on each bottle.
                    </AppText>
                    <AppText style={styles.bulkSectionHint}>
                      Event: {entryGroup?.title?.trim() || "Untitled event"}
                    </AppText>
                    <AppText style={styles.bulkSectionHint}>
                      Date: {bulkReviewForm.consumed_at || entry.consumed_at}
                    </AppText>
                    {bulkReviewForm.location_text.trim().length > 0 ? (
                      <AppText style={styles.bulkSectionHint}>
                        Location: {bulkReviewForm.location_text.trim()}
                      </AppText>
                    ) : null}
                    {selectedTastedWithIds.length > 0 ? (
                      <AppText style={styles.bulkSectionHint}>
                        Tasted with: {selectedTastedWithIds.length} friend
                        {selectedTastedWithIds.length === 1 ? "" : "s"}
                      </AppText>
                    ) : null}
                  </View>
                ) : null}

                {!isBulkReview || showBulkMoreDetails ? (
                  <>
                <Accordion
                  title="Wine details"
                  description="Optional identity details for this bottle."
                  expanded={editExpanded.wine_details}
                  onToggle={() => toggleEditSection("wine_details")}
                >
                {!isBulkReview ? (
                  <Field
                    label="Wine name"
                    value={bulkReviewForm.wine_name}
                    onChange={(value) => updateBulkReviewField("wine_name", value)}
                    placeholder="Required"
                    required
                  />
                ) : null}

                <AdaptiveFieldRow minColumnWidth={160}>
                  <Field
                    label="Producer"
                    value={bulkReviewForm.producer}
                    onChange={(value) => updateBulkReviewField("producer", value)}
                    autoCapitalize="words"
                  />
                  <Field
                    label="Vintage"
                    value={bulkReviewForm.vintage}
                    onChange={(value) => updateBulkReviewField("vintage", value)}
                    keyboardType="number-pad"
                  />
                </AdaptiveFieldRow>

                <AdaptiveFieldRow minColumnWidth={160}>
                  <Field
                    label="Country"
                    value={bulkReviewForm.country}
                    onChange={(value) => updateBulkReviewField("country", value)}
                    autoCapitalize="words"
                  />
                  <Field
                    label="Region"
                    value={bulkReviewForm.region}
                    onChange={(value) => updateBulkReviewField("region", value)}
                    autoCapitalize="words"
                  />
                </AdaptiveFieldRow>

                <AdaptiveFieldRow minColumnWidth={160}>
                  <Field
                    label="Appellation"
                    value={bulkReviewForm.appellation}
                    onChange={(value) => updateBulkReviewField("appellation", value)}
                    autoCapitalize="words"
                  />
                  <Field
                    label="Classification"
                    value={bulkReviewForm.classification}
                    onChange={(value) => updateBulkReviewField("classification", value)}
                    autoCapitalize="words"
                  />
                </AdaptiveFieldRow>

                <View style={styles.bulkFormField}>
                  <View style={styles.primaryGrapeHeaderRow}>
                    <AppText style={styles.bulkFormLabel}>Primary grapes</AppText>
                    <AppText style={styles.bulkSectionHint}>
                      {selectedPrimaryGrapes.length}/3
                    </AppText>
                  </View>
                  <AppText style={styles.bulkSectionHint}>
                    Type at least 4 letters to search.
                  </AppText>
                  <View style={styles.primaryGrapeChipWrap}>
                    {selectedPrimaryGrapes.map((grape) => (
                      <Pressable
                        key={`bulk-grape-${grape.id}`}
                        style={styles.primaryGrapeChip}
                        onPress={() => removePrimaryGrape(grape.id)}
                      >
                        <AppText style={styles.primaryGrapeChipText}>{grape.name}</AppText>
                        <AppText style={styles.primaryGrapeChipRemove}>x</AppText>
                      </Pressable>
                    ))}
                    {selectedPrimaryGrapes.length === 0 ? (
                      <AppText style={styles.bulkSectionHint}>No grapes selected yet.</AppText>
                    ) : null}
                  </View>
                  <DoneTextInput
                    value={primaryGrapeQuery}
                    onChangeText={setPrimaryGrapeQuery}
                    onFocus={() => setIsPrimaryGrapeFocused(true)}
                    onBlur={() => {
                      setTimeout(() => setIsPrimaryGrapeFocused(false), 120);
                    }}
                    editable={selectedPrimaryGrapes.length < 3}
                    autoCapitalize="words"
                    autoCorrect={false}
                    placeholder={
                      selectedPrimaryGrapes.length < 3
                        ? "Search primary grapes"
                        : "Maximum primary grapes selected"
                    }
                    placeholderTextColor={colors.textTertiary}
                    style={styles.bulkFormInput}
                  />
                  {isPrimaryGrapeLoading ? (
                    <AppText style={styles.bulkSectionHint}>Searching grapes...</AppText>
                  ) : null}
                  {primaryGrapeError ? (
                    <AppText style={styles.bulkReviewErrorText}>{primaryGrapeError}</AppText>
                  ) : null}
                  {isPrimaryGrapeFocused &&
                  primaryGrapeQuery.trim().length >= 4 &&
                  primaryGrapeSuggestions.length > 0 ? (
                    <View style={styles.inlineSuggestionList}>
                      {primaryGrapeSuggestions.map((option) => (
                        <Pressable
                          key={`bulk-grape-option-${option.id}`}
                          style={styles.suggestionItem}
                          onPress={() => addPrimaryGrape(option)}
                        >
                          <AppText style={styles.suggestionText}>{option.name}</AppText>
                        </Pressable>
                      ))}
                    </View>
                  ) : null}
                  {!isPrimaryGrapeLoading &&
                  isPrimaryGrapeFocused &&
                  primaryGrapeQuery.trim().length >= 4 &&
                  primaryGrapeSuggestions.length === 0 &&
                  !primaryGrapeError ? (
                    <AppText style={styles.bulkSectionHint}>No grape matches found.</AppText>
                  ) : null}
                </View>
                </Accordion>

                {!isSharedEventBulkReview ? (
                <Accordion
                  title="Location & date"
                  description="Where and when this bottle was consumed."
                  expanded={editExpanded.location_date}
                  onToggle={() => toggleEditSection("location_date")}
                >
                <View style={styles.bulkFormField}>
                  <AppText style={styles.bulkFormLabel}>Location</AppText>
                  <DoneTextInput
                    value={bulkReviewForm.location_text}
                    onChangeText={(value) => {
                      updateBulkReviewField("location_text", value);
                      if (bulkReviewForm.location_place_id) {
                        updateBulkReviewField("location_place_id", "");
                      }
                    }}
                    onBlur={() => {
                      setTimeout(() => {
                        setLocationSuggestions([]);
                      }, 120);
                    }}
                    placeholder="Search places (optional)"
                    placeholderTextColor={colors.textTertiary}
                    autoCapitalize="words"
                    autoCorrect={false}
                    style={styles.bulkFormInput}
                  />
                  {locationSuggestions.length > 0 ? (
                    <View style={styles.inlineSuggestionList}>
                      {locationSuggestions.map((suggestion) => (
                        <Pressable
                          key={`bulk-location-${suggestion.place_id}`}
                          style={styles.suggestionItem}
                          onPress={() => {
                            updateBulkReviewField("location_text", suggestion.description);
                            updateBulkReviewField("location_place_id", suggestion.place_id);
                            setLocationSuggestions([]);
                            setLocationApiMessage(null);
                            setLocationSessionToken(
                              `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
                            );
                          }}
                        >
                          <AppText style={styles.suggestionText}>
                            {suggestion.description}
                          </AppText>
                        </Pressable>
                      ))}
                    </View>
                  ) : null}
                  {isLocationLoading ? (
                    <AppText style={styles.bulkSectionHint}>
                      Searching Google Maps...
                    </AppText>
                  ) : null}
                  {locationApiMessage ? (
                    <AppText style={styles.bulkSectionHint}>{locationApiMessage}</AppText>
                  ) : null}
                </View>

                <View style={styles.bulkFormRow}>
                  <View style={styles.bulkFormCol}>
                    <AppText style={styles.bulkFormLabel}>Consumed date</AppText>
                    <Pressable
                      style={styles.bulkSelectTrigger}
                      onPress={() => {
                        const parsed = parseYmd(bulkReviewForm.consumed_at);
                        const d = parsed ?? new Date();
                        setVisibleMonth(new Date(d.getFullYear(), d.getMonth(), 1));
                        setDatePickerOpen(true);
                      }}
                    >
                      <AppText style={styles.bulkSelectTriggerText}>
                        {bulkReviewForm.consumed_at
                          ? formatConsumedDate(bulkReviewForm.consumed_at)
                          : "Select date"}
                      </AppText>
                      <AppText style={styles.bulkSelectChevron}>{"\u25BE"}</AppText>
                    </Pressable>
                  </View>
                </View>
                </Accordion>
                ) : null}

                {!isSharedEventBulkReview ? (
                <Accordion
                  title="Tasted with"
                  description="Tag friends who were with you."
                  expanded={editExpanded.tasted_with}
                  onToggle={() => toggleEditSection("tasted_with")}
                >
                {isLoadingFriends ? (
                  <AppText style={styles.bulkSectionHint}>Loading friends...</AppText>
                ) : null}
                {!isLoadingFriends && friendUsers.length === 0 ? (
                  <AppText style={styles.bulkSectionHint}>No other users yet.</AppText>
                ) : null}
                {friendUsers.length > 0 ? (
                  <>
                    <View style={styles.primaryGrapeChipWrap}>
                      {topFriends.map((friend) => {
                        const selected = selectedTastedWithIds.includes(friend.id);
                        return (
                          <Pressable
                            key={`bulk-friend-top-${friend.id}`}
                            style={[
                              styles.friendChip,
                              selected ? styles.friendChipActive : null,
                            ]}
                            onPress={() => toggleFriend(friend.id)}
                          >
                            <AppText
                              style={[
                                styles.friendText,
                                selected ? styles.friendTextActive : null,
                              ]}
                            >
                              {formatProfileName(friend)}
                            </AppText>
                          </Pressable>
                        );
                      })}
                      {extraSelectedFriends.map((friend) => (
                        <Pressable
                          key={`bulk-friend-extra-${friend.id}`}
                          style={[styles.friendChip, styles.friendChipActive]}
                          onPress={() => toggleFriend(friend.id)}
                        >
                          <AppText style={[styles.friendText, styles.friendTextActive]}>
                            {formatProfileName(friend)}
                          </AppText>
                        </Pressable>
                      ))}
                    </View>
                    <DoneTextInput
                      value={friendSearch}
                      onChangeText={setFriendSearch}
                      placeholder="Search friends"
                      placeholderTextColor={colors.textTertiary}
                      autoCapitalize="none"
                      autoCorrect={false}
                      style={styles.bulkFormInput}
                    />
                    {friendSearchResults.length > 0 ? (
                      <View style={styles.inlineSuggestionList}>
                        {friendSearchResults.map((friend) => (
                          <Pressable
                            key={`bulk-friend-search-${friend.id}`}
                            style={styles.suggestionItem}
                            onPress={() => toggleFriend(friend.id)}
                          >
                            <AppText style={styles.suggestionText}>
                              {formatProfileName(friend)}
                            </AppText>
                          </Pressable>
                        ))}
                      </View>
                    ) : friendSearch.trim().length >= 2 ? (
                      <AppText style={styles.bulkSectionHint}>
                        No matching friends found.
                      </AppText>
                    ) : null}
                  </>
                ) : null}
                </Accordion>
                ) : null}

                <Accordion
                  title="Advanced notes"
                  description="Optional structure for deeper tasting notes."
                  expanded={editExpanded.advanced_notes}
                  onToggle={() => toggleEditSection("advanced_notes")}
                >
                {(Object.keys(ADVANCED_NOTE_OPTIONS) as AdvancedNoteKey[]).map((key) => (
                  <View key={`bulk-advanced-${key}`} style={styles.bulkFormField}>
                    <AppText style={styles.bulkFormLabel}>
                      {ADVANCED_NOTE_FIELDS.find((field) => field.key === key)?.label ?? key}
                    </AppText>
                    <View style={styles.bulkChipWrap}>
                      <Pressable
                        style={[
                          styles.bulkChip,
                          bulkAdvancedNotes[key] === "" ? styles.bulkChipActive : null,
                        ]}
                        onPress={() => updateBulkAdvancedNote(key, "")}
                      >
                        <AppText
                          style={[
                            styles.bulkChipText,
                            bulkAdvancedNotes[key] === ""
                              ? styles.bulkChipTextActive
                              : null,
                          ]}
                        >
                          Not set
                        </AppText>
                      </Pressable>
                      {Object.entries(ADVANCED_NOTE_OPTIONS[key]).map(
                        ([optionValue, optionLabel]) => (
                          <Pressable
                            key={`bulk-advanced-${key}-${optionValue}`}
                            style={[
                              styles.bulkChip,
                              bulkAdvancedNotes[key] === optionValue
                                ? styles.bulkChipActive
                                : null,
                            ]}
                            onPress={() => updateBulkAdvancedNote(key, optionValue)}
                          >
                            <AppText
                              style={[
                                styles.bulkChipText,
                                bulkAdvancedNotes[key] === optionValue
                                  ? styles.bulkChipTextActive
                                  : null,
                              ]}
                            >
                              {optionLabel}
                            </AppText>
                          </Pressable>
                        )
                      )}
                    </View>
                  </View>
                ))}
                </Accordion>

                <Accordion
                  title="Price (optional)"
                  description="Optional purchase details."
                  expanded={editExpanded.price}
                  onToggle={() => toggleEditSection("price")}
                >
                <View style={styles.bulkFormField}>
                  <AppText style={styles.bulkFormLabel}>Price currency</AppText>
                  <View style={styles.bulkChipWrap}>
                    <Pressable
                      style={[
                        styles.bulkChip,
                        bulkReviewForm.price_paid_currency === "" ? styles.bulkChipActive : null,
                      ]}
                      onPress={() => updateBulkReviewField("price_paid_currency", "")}
                    >
                      <AppText
                        style={[
                          styles.bulkChipText,
                          bulkReviewForm.price_paid_currency === ""
                            ? styles.bulkChipTextActive
                            : null,
                        ]}
                      >
                        Not set
                      </AppText>
                    </Pressable>
                    {PRICE_PAID_CURRENCY_VALUES.map((currency) => (
                      <Pressable
                        key={`currency-${currency}`}
                        style={[
                          styles.bulkChip,
                          bulkReviewForm.price_paid_currency === currency
                            ? styles.bulkChipActive
                            : null,
                        ]}
                        onPress={() => updateBulkReviewField("price_paid_currency", currency)}
                      >
                        <AppText
                          style={[
                            styles.bulkChipText,
                            bulkReviewForm.price_paid_currency === currency
                              ? styles.bulkChipTextActive
                              : null,
                          ]}
                        >
                          {PRICE_PAID_CURRENCY_LABELS[currency]}
                        </AppText>
                      </Pressable>
                    ))}
                  </View>
                </View>

                <View style={styles.bulkFormField}>
                  <AppText style={styles.bulkFormLabel}>Price source</AppText>
                  <View style={styles.bulkChipWrap}>
                    <Pressable
                      style={[
                        styles.bulkChip,
                        bulkReviewForm.price_paid_source === "" ? styles.bulkChipActive : null,
                      ]}
                      onPress={() => updateBulkReviewField("price_paid_source", "")}
                    >
                      <AppText
                        style={[
                          styles.bulkChipText,
                          bulkReviewForm.price_paid_source === ""
                            ? styles.bulkChipTextActive
                            : null,
                        ]}
                      >
                        Not set
                      </AppText>
                    </Pressable>
                    {PRICE_PAID_SOURCE_VALUES.map((source) => (
                      <Pressable
                        key={`source-${source}`}
                        style={[
                          styles.bulkChip,
                          bulkReviewForm.price_paid_source === source
                            ? styles.bulkChipActive
                            : null,
                        ]}
                        onPress={() => updateBulkReviewField("price_paid_source", source)}
                      >
                        <AppText
                          style={[
                            styles.bulkChipText,
                            bulkReviewForm.price_paid_source === source
                              ? styles.bulkChipTextActive
                              : null,
                          ]}
                        >
                          {PRICE_PAID_SOURCE_LABELS[source]}
                        </AppText>
                      </Pressable>
                    ))}
                  </View>
                </View>
                </Accordion>
                  </>
                ) : null}
                {isBulkReview ? (
                  <View style={styles.bulkReviewFooterRow}>
                    <Pressable
                      style={[
                        styles.bulkPrimaryButton,
                        bulkActionsDisabled ? styles.bulkButtonDisabled : null,
                      ]}
                      onPress={goToNextBulkEntry}
                      disabled={bulkActionsDisabled}
                    >
                      <AppText style={styles.bulkPrimaryButtonText}>
                        {isSavingBulkReview
                          ? "Saving..."
                          : nextBulkEntryId
                          ? "Next wine"
                          : "Finish review"}
                      </AppText>
                    </Pressable>
                    <Pressable
                      style={[
                        styles.bulkDangerButton,
                        bulkActionsDisabled ? styles.bulkButtonDisabled : null,
                      ]}
                      onPress={cancelEntireBulkQueue}
                      disabled={bulkActionsDisabled}
                    >
                      <AppText style={styles.bulkDangerButtonText}>
                        {isDeletingBulkQueue ? "Canceling bulk..." : "Cancel bulk entry"}
                      </AppText>
                    </Pressable>
                  </View>
                ) : null}
                {isBulkReview && bulkReviewError ? (
                  <AppText style={styles.bulkReviewErrorText}>{bulkReviewError}</AppText>
                ) : null}
              </View>
            ) : (
              <View style={styles.detailsCard}>
              {isOwner ? (
                <View style={styles.ownerActionRow}>
                  <Pressable
                    style={styles.editButton}
                    onPress={startOwnerEdit}
                    disabled={deleting}
                  >
                    <AppText style={styles.editButtonText}>Edit entry</AppText>
                  </Pressable>
                </View>
              ) : null}
              <View style={styles.metaGrid}>
                <View style={styles.metaItem}>
                  <AppText style={styles.metaLabel}>Date consumed</AppText>
                  <AppText style={styles.metaValue}>
                    {formatConsumedDate(entry.consumed_at)}
                  </AppText>
                </View>

                {isOwner || hasLocation ? (
                  <View style={styles.metaItem}>
                    <AppText style={styles.metaLabel}>Location</AppText>
                    {hasLocation ? (
                      canOpenLocation ? (
                        <Pressable onPress={() => void openLocation()}>
                          <AppText style={styles.locationLinkText}>
                            {locationDisplayLabel}
                          </AppText>
                        </Pressable>
                      ) : (
                        <AppText style={styles.metaValue}>{locationDisplayLabel}</AppText>
                      )
                    ) : (
                      <AppText style={styles.metaValue}>Not set</AppText>
                    )}
                  </View>
                ) : null}

                {displayRating ? (
                  <View style={styles.metaItem}>
                    <AppText style={styles.metaLabel}>Rating</AppText>
                    <AppText style={styles.metaValue}>{displayRating}</AppText>
                  </View>
                ) : isOwner ? (
                  <View style={styles.metaItem}>
                    <AppText style={styles.metaLabel}>Rating</AppText>
                    <AppText style={styles.metaValue}>Not set</AppText>
                  </View>
                ) : null}

                {isOwner || entry.qpr_level ? (
                  <View style={styles.metaItem}>
                    <AppText style={styles.metaLabel}>QPR</AppText>
                    {entry.qpr_level ? (
                      <AppText
                        style={[
                          styles.qprTag,
                          styles[`qpr_${entry.qpr_level}` as keyof typeof styles],
                        ]}
                      >
                        {QPR_LEVEL_LABELS[entry.qpr_level]}
                      </AppText>
                    ) : (
                      <AppText style={styles.metaValue}>Not set</AppText>
                    )}
                  </View>
                ) : null}

                {isOwner || entry.country ? (
                  <View style={styles.metaItem}>
                    <AppText style={styles.metaLabel}>Country</AppText>
                    <AppText style={styles.metaValue}>{entry.country || "Not set"}</AppText>
                  </View>
                ) : null}

                {isOwner || entry.region ? (
                  <View style={styles.metaItem}>
                    <AppText style={styles.metaLabel}>Region</AppText>
                    <AppText style={styles.metaValue}>{entry.region || "Not set"}</AppText>
                  </View>
                ) : null}

                {isOwner || entry.appellation ? (
                  <View style={styles.metaItem}>
                    <AppText style={styles.metaLabel}>Appellation</AppText>
                    <AppText style={styles.metaValue}>{entry.appellation || "Not set"}</AppText>
                  </View>
                ) : null}

                {isOwner || entry.classification ? (
                  <View style={styles.metaItem}>
                    <AppText style={styles.metaLabel}>Classification</AppText>
                    <AppText style={styles.metaValue}>
                      {entry.classification || "Not set"}
                    </AppText>
                  </View>
                ) : null}

                {isOwner || primaryGrapeDisplay ? (
                  <View style={styles.metaItem}>
                    <AppText style={styles.metaLabel}>Primary grapes</AppText>
                    <AppText style={styles.metaValue}>
                      {primaryGrapeDisplay || "Not set"}
                    </AppText>
                  </View>
                ) : null}

                {isOwner || entry.vintage ? (
                  <View style={styles.metaItem}>
                    <AppText style={styles.metaLabel}>Vintage</AppText>
                    <AppText style={styles.metaValue}>{entry.vintage || "Not set"}</AppText>
                  </View>
                ) : null}

                {isOwner || Boolean(entry.notes) ? (
                  <View style={styles.metaItem}>
                    <AppText style={styles.metaLabel}>Notes</AppText>
                    <AppText style={styles.metaValue}>{entry.notes || "Not set"}</AppText>
                  </View>
                ) : null}

                {isOwner || tastedWithNames.length > 0 ? (
                  <View style={styles.metaItem}>
                    <AppText style={styles.metaLabel}>Tasted with</AppText>
                    <AppText style={styles.metaValue}>
                      {tastedWithNames.length > 0
                        ? tastedWithNames.join(", ")
                        : "No one listed"}
                    </AppText>
                  </View>
                ) : null}
              </View>

              <View style={styles.entryReactionSection}>
                <View style={styles.entryReactionRight}>
                  <ReactionSummaryPills
                    entryId={entry.id}
                    reactionCounts={reactionCounts}
                    reactionUsers={reactionUsers}
                  />
                  <Pressable
                    onPress={() => setReactionPickerOpen((current) => !current)}
                    style={[
                      styles.reactionAddButton,
                      canReact ? null : styles.reactionAddButtonDisabled,
                    ]}
                  >
                    <View style={styles.plusIcon}>
                      <View
                        style={[
                          styles.plusLineHorizontal,
                          canReact ? null : styles.plusLineDisabled,
                        ]}
                      />
                      <View
                        style={[
                          styles.plusLineVertical,
                          canReact ? null : styles.plusLineDisabled,
                        ]}
                      />
                    </View>
                  </Pressable>
                </View>

                {reactionPickerOpen ? (
                  <Pressable style={styles.reactionPickerCard}>
                    <View style={styles.reactionPickerRow}>
                      {REACTION_EMOJIS.map((emoji) => {
                        const selected = myReactions.includes(emoji);
                        return (
                          <Pressable
                            key={`${entry.id}-${emoji}`}
                            disabled={!canReact}
                            onPress={() => void toggleReaction(emoji)}
                            style={[
                              styles.reactionEmojiBtn,
                              selected ? styles.reactionEmojiBtnActive : null,
                              !canReact ? styles.reactionEmojiBtnDisabled : null,
                            ]}
                          >
                            <AppText style={styles.reactionEmojiText}>{emoji}</AppText>
                          </Pressable>
                        );
                      })}
                    </View>
                    {!canReact ? (
                      <AppText style={styles.reactionPrivateText}>
                        Reactions are not available for this post.
                      </AppText>
                    ) : null}
                  </Pressable>
                ) : null}
              </View>

              {advancedNoteRows.length > 0 ? (
                <View style={styles.advancedNotesBlock}>
                  <Pressable
                    style={styles.advancedNotesToggle}
                    onPress={() => setAdvancedNotesOpen((current) => !current)}
                  >
                    <AppText style={styles.advancedNotesTitle}>Advanced notes</AppText>
                    <AppText style={styles.advancedNotesToggleText}>
                      {advancedNotesOpen ? "Hide" : "Show"}
                    </AppText>
                  </Pressable>
                  {advancedNotesOpen ? (
                    <View style={styles.metaGrid}>
                      {advancedNoteRows.map((row) => (
                        <View key={row.label} style={styles.metaItem}>
                          <AppText style={styles.metaLabel}>{row.label}</AppText>
                          <AppText style={styles.metaValue}>{row.value}</AppText>
                        </View>
                      ))}
                    </View>
                  ) : null}
                </View>
              ) : null}

              {isOwner && !isBulkReview ? (
                <View style={styles.deleteCard}>
                  <View style={styles.deleteHeader}>
                    <View style={styles.deleteCopy}>
                      <AppText style={styles.deleteTitle}>Delete</AppText>
                      <AppText style={styles.deleteDescription}>
                        Deleting removes this entry and its photos.
                      </AppText>
                    </View>
                    <Pressable
                      style={[
                        styles.deleteButton,
                        deleting ? styles.deleteButtonDisabled : null,
                      ]}
                      onPress={confirmDeleteEntry}
                      disabled={deleting}
                    >
                      <AppText style={styles.deleteButtonText}>
                        {deleting ? "Deleting..." : "Delete entry"}
                      </AppText>
                    </Pressable>
                  </View>
                  {deleteError ? (
                    <AppText style={styles.deleteErrorText}>{deleteError}</AppText>
                  ) : null}
                </View>
              ) : null}
              </View>
            )}
          </>
        )}
      </ScrollView>
      <Modal
        visible={Boolean(activeCropPhoto)}
        transparent
        animationType="fade"
        onRequestClose={closeCropEditor}
      >
        <View style={styles.cropModalRoot}>
          <View style={styles.cropModalBackdrop} />
          <View style={styles.cropModalCard}>
            <View style={styles.cropModalHeader}>
              <AppText style={styles.cropModalTitle}>Edit crop</AppText>
              <Pressable onPress={closeCropEditor} hitSlop={8}>
                <AppText style={styles.cropModalCloseText}>Close</AppText>
              </Pressable>
            </View>
            <View
              style={styles.cropFrame}
              onLayout={(event) => {
                const width = Math.round(event.nativeEvent.layout.width);
                setCropFrameSize((current) => (current === width ? current : width));
              }}
              onStartShouldSetResponder={() => true}
              onMoveShouldSetResponder={() => true}
              onResponderTerminationRequest={() => false}
              onResponderGrant={handleCropResponderGrant}
              onResponderMove={handleCropResponderMove}
              onResponderRelease={() => {
                cropDragRef.current = null;
              }}
              onResponderTerminate={() => {
                cropDragRef.current = null;
              }}
            >
              {cropSourceLoading ? (
                <View style={styles.cropFrameLoading}>
                  <ActivityIndicator size="small" color={colors.grenache} />
                  <AppText style={styles.cropFrameHint}>Loading image...</AppText>
                </View>
              ) : activeCropPhotoSourceUri ? (
                <>
                  <View
                    pointerEvents="none"
                    style={{ position: "absolute", left: 0, right: 0, top: 0, bottom: 0 }}
                  >
                    <Image
                      source={{ uri: activeCropPhotoSourceUri }}
                      style={[
                        styles.cropFrameImage,
                        cropGeometry
                          ? {
                              width: cropGeometry.renderedWidth,
                              height: cropGeometry.renderedHeight,
                              transform: [
                                { translateX: cropGeometry.offsetX },
                                { translateY: cropGeometry.offsetY },
                              ],
                            }
                          : null,
                      ]}
                      resizeMode="contain"
                    />
                  </View>
                  <View pointerEvents="none" style={styles.cropFrameOutline} />
                  <View pointerEvents="none" style={styles.cropFrameCrosshair} />
                </>
              ) : (
                <View style={styles.cropFrameLoading}>
                  <AppText style={styles.cropFrameHint}>Image unavailable.</AppText>
                </View>
              )}
            </View>
            <AppText style={styles.cropFrameHint}>
              Pinch to zoom and drag to reposition.
            </AppText>
            <View style={styles.cropActionRow}>
              <Pressable style={styles.bulkSecondaryButton} onPress={closeCropEditor}>
                <AppText style={styles.bulkSecondaryButtonText}>Cancel</AppText>
              </Pressable>
              <Pressable
                style={[
                  styles.bulkPrimaryButton,
                  isSavingCrop ? styles.bulkButtonDisabled : null,
                ]}
                onPress={() => void saveCropEdits()}
                disabled={isSavingCrop || cropSourceLoading || !activeCropPhoto}
              >
                {isSavingCrop ? (
                  <ActivityIndicator color={colors.textPrimary} />
                ) : (
                  <AppText style={styles.bulkPrimaryButtonText}>Save crop</AppText>
                )}
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
      <Modal
        visible={datePickerOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setDatePickerOpen(false)}
      >
        <View style={styles.pickerModalRoot}>
          <Pressable style={styles.pickerModalBackdrop} onPress={() => setDatePickerOpen(false)} />
          <View style={styles.pickerModalCard}>
            <View style={styles.calendarHeader}>
              <Pressable onPress={() => setVisibleMonth(new Date(visibleMonth.getFullYear(), visibleMonth.getMonth() - 1, 1))}>
                <AppText style={styles.calendarNavText}>{"<"}</AppText>
              </Pressable>
              <AppText style={styles.pickerModalTitle}>
                {MONTH_LABELS[visibleMonth.getMonth()]} {visibleMonth.getFullYear()}
              </AppText>
              <Pressable onPress={() => setVisibleMonth(new Date(visibleMonth.getFullYear(), visibleMonth.getMonth() + 1, 1))}>
                <AppText style={styles.calendarNavText}>{">"}</AppText>
              </Pressable>
            </View>
            <View style={styles.calendarWeekdayRow}>
              {WEEKDAY_LABELS.map((wd) => (
                <AppText key={wd} style={styles.calendarWeekdayText}>{wd}</AppText>
              ))}
            </View>
            <View style={styles.calendarGrid}>
              {(() => {
                const year = visibleMonth.getFullYear();
                const month = visibleMonth.getMonth();
                const firstWeekday = new Date(year, month, 1).getDay();
                const daysInMonth = new Date(year, month + 1, 0).getDate();
                const selected = parseYmd(bulkReviewForm.consumed_at);
                const cells: Array<number | null> = [];
                for (let i = 0; i < firstWeekday; i++) cells.push(null);
                for (let d = 1; d <= daysInMonth; d++) cells.push(d);
                while (cells.length % 7 !== 0) cells.push(null);
                return cells.map((day, idx) => {
                  if (day === null) {
                    return <View key={`blank-${idx}`} style={styles.calendarSlot} />;
                  }
                  const isSelected =
                    selected !== null &&
                    selected.getFullYear() === year &&
                    selected.getMonth() === month &&
                    selected.getDate() === day;
                  return (
                    <Pressable
                      key={`day-${day}`}
                      style={[styles.calendarSlot, styles.calendarCell, isSelected ? styles.calendarCellSelected : null]}
                      onPress={() => {
                        updateBulkReviewField("consumed_at", formatYmd(new Date(year, month, day)));
                        setDatePickerOpen(false);
                      }}
                    >
                      <AppText style={[styles.calendarCellText, isSelected ? styles.calendarCellTextSelected : null]}>
                        {day}
                      </AppText>
                    </Pressable>
                  );
                });
              })()}
            </View>
          </View>
        </View>
      </Modal>
      <Modal
        visible={photoTypePickerOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setPhotoTypePickerOpen(false)}
      >
        <View style={styles.pickerModalRoot}>
          <Pressable
            style={styles.pickerModalBackdrop}
            onPress={() => setPhotoTypePickerOpen(false)}
          />
          <View style={styles.pickerModalCard}>
            <AppText style={styles.pickerModalTitle}>Set photo tag</AppText>
            <ScrollView
              style={styles.pickerModalList}
              contentContainerStyle={styles.pickerModalListContent}
            >
              {ENTRY_PHOTO_TYPES.map((type) => (
                <Pressable
                  key={`photo-type-${type}`}
                  style={[
                    styles.pickerModalItem,
                    activePhoto?.type === type ? styles.pickerModalItemSelected : null,
                  ]}
                  onPress={() => {
                    void updateActivePhotoType(type);
                  }}
                  disabled={isUpdatingPhotoMeta}
                >
                  <AppText
                    style={[
                      styles.pickerModalItemText,
                      activePhoto?.type === type ? styles.pickerModalItemTextSelected : null,
                    ]}
                  >
                    {PHOTO_TYPE_LABELS[type]}
                  </AppText>
                </Pressable>
              ))}
            </ScrollView>
          </View>
        </View>
      </Modal>
      <Modal
        visible={photoOrderPickerOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setPhotoOrderPickerOpen(false)}
      >
        <View style={styles.pickerModalRoot}>
          <Pressable
            style={styles.pickerModalBackdrop}
            onPress={() => setPhotoOrderPickerOpen(false)}
          />
          <View style={styles.pickerModalCard}>
            <AppText style={styles.pickerModalTitle}>Set photo order</AppText>
            <ScrollView
              style={styles.pickerModalList}
              contentContainerStyle={styles.pickerModalListContent}
            >
              {photos.map((_, index) => {
                const orderNumber = index + 1;
                return (
                  <Pressable
                    key={`photo-order-${orderNumber}`}
                    style={[
                      styles.pickerModalItem,
                      activePhotoOrder === orderNumber ? styles.pickerModalItemSelected : null,
                    ]}
                    onPress={() => {
                      void updateActivePhotoOrder(index);
                    }}
                    disabled={isUpdatingPhotoMeta}
                  >
                    <AppText
                      style={[
                        styles.pickerModalItemText,
                        activePhotoOrder === orderNumber
                          ? styles.pickerModalItemTextSelected
                          : null,
                      ]}
                    >
                      {toOrdinal(orderNumber)}
                    </AppText>
                  </Pressable>
                );
              })}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </KeyboardAvoidingView>
  );
}

function Accordion({
  title,
  description,
  expanded,
  onToggle,
  children,
}: {
  title: string;
  description?: string;
  expanded: boolean;
  onToggle: () => void;
  children: ReactNode;
}) {
  return (
    <View style={styles.accordion}>
      <Pressable style={styles.accordionHeader} onPress={onToggle}>
        <View style={styles.accordionTitleRow}>
          <AppText style={styles.accordionChevron}>{expanded ? "\u25BE" : "\u25B8"}</AppText>
          <AppText style={styles.accordionTitle}>{title}</AppText>
        </View>
      </Pressable>
      {expanded ? (
        <View style={styles.accordionBody}>
          {description ? <AppText style={styles.bulkSectionHint}>{description}</AppText> : null}
          <View style={styles.accordionFields}>{children}</View>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.screenBg,
  },
  content: {
    paddingHorizontal: 18,
    paddingTop: 16,
    paddingBottom: 28,
    gap: 12,
  },
  backLink: {
    alignSelf: "flex-start",
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    backgroundColor: colors.surfacePrimary,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  backLinkText: {
    color: colors.textSecondary,
    fontSize: 12,
    fontWeight: "700",
  },
  loadingCard: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfacePrimary,
    paddingHorizontal: 16,
    paddingVertical: 18,
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  loadingText: {
    color: colors.textSecondary,
    fontSize: 13,
  },
  errorCard: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(192,57,43,0.35)",
    backgroundColor: "rgba(192,57,43,0.08)",
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  errorText: {
    color: colors.error,
    fontSize: 13,
    lineHeight: 18,
  },
  bulkReviewCard: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(123,29,58,0.36)",
    backgroundColor: "rgba(123,29,58,0.18)",
    padding: 12,
    gap: 8,
  },
  bulkReviewControlsCard: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(123,29,58,0.36)",
    backgroundColor: "rgba(123,29,58,0.14)",
    padding: 12,
    gap: 8,
  },
  bulkReviewEyebrow: {
    color: colors.rose,
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 1.5,
    textTransform: "uppercase",
  },
  bulkReviewTitle: {
    color: colors.textPrimary,
    fontSize: 15,
    fontWeight: "700",
  },
  bulkReviewDescription: {
    color: colors.textPrimary,
    fontSize: 12,
    lineHeight: 16,
  },
  bulkReviewActionRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  bulkReviewFooterRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    marginTop: 6,
  },
  bulkReviewDangerRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  bulkPrimaryButton: {
    borderRadius: 999,
    backgroundColor: colors.grenache,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  bulkPrimaryButtonText: {
    color: colors.textPrimary,
    fontSize: 12,
    fontWeight: "700",
  },
  bulkSecondaryButton: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: colors.surfacePrimary,
  },
  bulkSecondaryButtonText: {
    color: colors.textPrimary,
    fontSize: 12,
    fontWeight: "700",
  },
  bulkMinorButton: {
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  bulkMinorButtonText: {
    color: colors.textSecondary,
    fontSize: 11,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.8,
  },
  bulkDangerButton: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(192,57,43,0.48)",
    backgroundColor: "rgba(192,57,43,0.32)",
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  bulkDangerButtonText: {
    color: colors.error,
    fontSize: 12,
    fontWeight: "700",
  },
  bulkButtonDisabled: {
    opacity: 0.55,
  },
  bulkReviewErrorText: {
    color: colors.error,
    fontSize: 12,
    lineHeight: 16,
  },
  bulkEditCard: {
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfacePrimary,
    padding: 14,
    gap: 10,
  },
  bulkEditTitle: {
    color: colors.textPrimary,
    fontSize: 16,
    fontWeight: "700",
  },
  bulkEditDescription: {
    color: colors.textSecondary,
    fontSize: 12,
    lineHeight: 16,
  },
  bulkFormField: {
    gap: 6,
  },
  bulkFormRow: {
    flexDirection: "row",
    gap: 10,
  },
  bulkFormCol: {
    flex: 1,
    gap: 6,
  },
  bulkFormLabel: {
    color: colors.textSecondary,
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 1.1,
    textTransform: "uppercase",
  },
  bulkFormInput: {
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    backgroundColor: colors.surfacePrimary,
    color: colors.textPrimary,
    fontSize: 14,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  bulkSelectTrigger: {
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    backgroundColor: colors.surfacePrimary,
    minHeight: 42,
    paddingHorizontal: 12,
    paddingVertical: 9,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  bulkSelectTriggerText: {
    color: colors.textPrimary,
    fontSize: 14,
    flex: 1,
  },
  bulkSelectChevron: {
    color: colors.textSecondary,
    fontSize: 12,
    fontWeight: "700",
  },
  bulkFormInputMultiline: {
    minHeight: 88,
    textAlignVertical: "top",
  },
  bulkChipWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  bulkChip: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    backgroundColor: colors.surfacePrimary,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  bulkChipActive: {
    borderColor: "rgba(123,29,58,0.58)",
    backgroundColor: "rgba(123,29,58,0.15)",
  },
  bulkChipText: {
    color: colors.textSecondary,
    fontSize: 11,
    fontWeight: "700",
  },
  bulkChipTextActive: {
    color: colors.rose,
  },
  bulkSectionHeading: {
    color: colors.textPrimary,
    fontSize: 13,
    fontWeight: "700",
    letterSpacing: 0.3,
  },
  bulkSectionHint: {
    color: colors.textSecondary,
    fontSize: 12,
    lineHeight: 16,
  },
  primaryGrapeHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  primaryGrapeChipWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    alignItems: "center",
  },
  primaryGrapeChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(123, 29, 58, 0.5)",
    backgroundColor: "rgba(123, 29, 58, 0.14)",
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  primaryGrapeChipText: {
    color: colors.rose,
    fontSize: 12,
    fontWeight: "700",
  },
  primaryGrapeChipRemove: {
    color: colors.rose,
    fontSize: 12,
    fontWeight: "700",
  },
  inlineSuggestionList: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.limestone,
    overflow: "hidden",
    marginTop: 2,
  },
  suggestionItem: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  suggestionText: {
    color: colors.textSecondary,
    fontSize: 13,
  },
  friendChip: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    paddingHorizontal: 10,
    paddingVertical: 7,
    backgroundColor: colors.surfacePrimary,
  },
  friendChipActive: {
    borderColor: colors.grenache,
    backgroundColor: "rgba(123, 29, 58, 0.2)",
  },
  friendText: { color: colors.textSecondary, fontSize: 12, fontWeight: "600" },
  friendTextActive: { color: colors.rose },
  accordion: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfacePrimary,
    overflow: "hidden",
  },
  accordionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-start",
    paddingHorizontal: 12,
    paddingVertical: 11,
  },
  accordionTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  accordionChevron: {
    color: colors.textPrimary,
    fontSize: 12,
    fontWeight: "700",
    width: 14,
    textAlign: "center",
  },
  accordionTitle: { color: colors.textPrimary, fontSize: 14, fontWeight: "600" },
  accordionBody: {
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 8,
  },
  accordionFields: { gap: 10 },
  ownerActionRow: {
    flexDirection: "row",
    justifyContent: "flex-end",
  },
  editButton: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(123,29,58,0.45)",
    backgroundColor: "rgba(123,29,58,0.14)",
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  editButtonText: {
    color: colors.rose,
    fontSize: 12,
    fontWeight: "700",
  },
  headerBlock: {
    gap: 6,
  },
  authorRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  authorAvatar: {
    width: 34,
    height: 34,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    backgroundColor: colors.surfacePrimary,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  authorAvatarImage: {
    width: "100%",
    height: "100%",
  },
  authorAvatarFallback: {
    color: colors.textSecondary,
    fontSize: 12,
    fontWeight: "700",
  },
  authorMeta: {
    flex: 1,
    gap: 2,
  },
  authorName: {
    color: colors.textPrimary,
    fontSize: 13,
    fontWeight: "700",
  },
  authorDate: {
    color: colors.textSecondary,
    fontSize: 11,
  },
  eyebrow: {
    color: colors.rose,
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 1.4,
    textTransform: "uppercase",
  },
  title: {
    color: colors.textPrimary,
    fontSize: 24,
    fontWeight: "700",
    lineHeight: 30,
  },
  headerTitleInput: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfacePrimary,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: colors.textPrimary,
    fontSize: 24,
    fontWeight: "700",
    lineHeight: 30,
  },
  subtitle: {
    color: colors.textSecondary,
    fontSize: 13,
    lineHeight: 18,
  },
  photoFrame: {
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfacePrimary,
    overflow: "hidden",
    height: 320,
    position: "relative",
  },
  photoStatic: {
    width: "100%",
    height: "100%",
  },
  photoSlide: {
    height: "100%",
  },
  photoTypeChip: {
    position: "absolute",
    left: 10,
    top: 10,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    backgroundColor: colors.surfacePrimary,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  photoTypeChipEditable: {
    borderColor: "rgba(123,29,58,0.55)",
    backgroundColor: "rgba(123,29,58,0.8)",
  },
  photoTypeChipText: {
    color: colors.textPrimary,
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 0.4,
    textTransform: "uppercase",
  },
  photoOrderChip: {
    position: "absolute",
    right: 10,
    top: 10,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    backgroundColor: colors.surfacePrimary,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  photoOrderChipEditable: {
    borderColor: "rgba(123,29,58,0.55)",
    backgroundColor: "rgba(123,29,58,0.8)",
  },
  photoOrderChipText: {
    color: colors.textPrimary,
    fontSize: 10,
    fontWeight: "700",
  },
  inlineErrorWrap: {
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "rgba(192,57,43,0.36)",
    backgroundColor: "rgba(192,57,43,0.32)",
    paddingHorizontal: 10,
    paddingVertical: 8,
    marginTop: 8,
  },
  photoActionRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 8,
  },
  photoDotRow: {
    position: "absolute",
    bottom: 10,
    left: 10,
    right: 10,
    flexDirection: "row",
    justifyContent: "center",
    gap: 6,
  },
  photoDot: {
    width: 7,
    height: 7,
    borderRadius: 999,
    backgroundColor: colors.surfacePrimary,
  },
  photoDotActive: {
    backgroundColor: colors.rose,
  },
  photoFallback: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surfacePrimary,
    paddingHorizontal: 20,
  },
  photoFallbackText: {
    color: colors.textSecondary,
    fontSize: 12,
    textAlign: "center",
  },
  cropModalRoot: {
    flex: 1,
    justifyContent: "center",
    paddingHorizontal: 14,
  },
  cropModalBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: colors.surfacePrimary,
  },
  cropModalCard: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    backgroundColor: colors.limestone,
    padding: 14,
    gap: 12,
  },
  cropModalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  cropModalTitle: {
    color: colors.textPrimary,
    fontSize: 18,
    fontWeight: "700",
  },
  cropModalCloseText: {
    color: colors.textSecondary,
    fontSize: 12,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  cropFrame: {
    width: "100%",
    aspectRatio: 1,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    backgroundColor: colors.surfacePrimary,
    overflow: "hidden",
    position: "relative",
  },
  cropFrameImage: {
    position: "absolute",
  },
  cropFrameOutline: {
    ...StyleSheet.absoluteFillObject,
    borderWidth: 2,
    borderColor: "rgba(123, 29, 58, 0.85)",
  },
  cropFrameCrosshair: {
    position: "absolute",
    width: 18,
    height: 18,
    left: "50%",
    top: "50%",
    marginLeft: -9,
    marginTop: -9,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(123, 29, 58, 0.9)",
    backgroundColor: "rgba(123, 29, 58, 0.2)",
  },
  cropFrameLoading: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingHorizontal: 16,
  },
  cropFrameHint: {
    color: colors.textSecondary,
    fontSize: 12,
    lineHeight: 16,
  },
  cropActionRow: {
    flexDirection: "row",
    gap: 10,
    justifyContent: "flex-end",
  },
  detailsCard: {
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfacePrimary,
    padding: 14,
    gap: 12,
  },
  metaGrid: {
    gap: 10,
  },
  metaItem: {
    gap: 3,
  },
  metaLabel: {
    color: colors.textSecondary,
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 1.4,
    textTransform: "uppercase",
  },
  metaValue: {
    color: colors.textPrimary,
    fontSize: 13,
    lineHeight: 18,
  },
  qprTag: {
    alignSelf: "flex-start",
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 8,
    paddingVertical: 3,
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 0.5,
    textTransform: "uppercase",
  },
  qpr_extortion: {
    borderColor: "rgba(192,57,43,0.4)",
    backgroundColor: "rgba(192,57,43,0.1)",
    color: colors.error,
  },
  qpr_pricey: {
    borderColor: "rgba(192,57,43,0.4)",
    backgroundColor: "rgba(192,57,43,0.1)",
    color: colors.error,
  },
  qpr_mid: {
    borderColor: "rgba(123,29,58,0.4)",
    backgroundColor: "rgba(123,29,58,0.1)",
    color: colors.rose,
  },
  qpr_good_value: {
    borderColor: "rgba(45,125,70,0.4)",
    backgroundColor: "rgba(45,125,70,0.1)",
    color: colors.success,
  },
  qpr_absolute_steal: {
    borderColor: "rgba(45,125,70,0.4)",
    backgroundColor: "rgba(45,125,70,0.1)",
    color: colors.success,
  },
  entryReactionSection: {
    gap: 8,
  },
  entryReactionRight: {
    marginLeft: "auto",
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    flexWrap: "wrap",
    justifyContent: "flex-end",
  },
  reactionAddButton: {
    width: 27,
    height: 27,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surfacePrimary,
  },
  reactionAddButtonDisabled: {
    borderColor: colors.border,
  },
  plusIcon: {
    width: 12,
    height: 12,
    position: "relative",
    alignItems: "center",
    justifyContent: "center",
  },
  plusLineHorizontal: {
    position: "absolute",
    width: 12,
    height: 1.6,
    borderRadius: 999,
    backgroundColor: colors.surfaceRaised,
  },
  plusLineVertical: {
    position: "absolute",
    width: 1.6,
    height: 12,
    borderRadius: 999,
    backgroundColor: colors.surfaceRaised,
  },
  plusLineDisabled: {
    backgroundColor: colors.textSecondary,
  },
  reactionPickerCard: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfacePrimary,
    padding: 9,
    gap: 8,
  },
  reactionPickerRow: {
    flexDirection: "row",
    gap: 7,
    flexWrap: "wrap",
  },
  reactionEmojiBtn: {
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    backgroundColor: colors.surfacePrimary,
    width: 34,
    height: 34,
    alignItems: "center",
    justifyContent: "center",
  },
  reactionEmojiBtnActive: {
    borderColor: "rgba(123,29,58,0.5)",
    backgroundColor: "rgba(123,29,58,0.14)",
  },
  reactionEmojiBtnDisabled: {
    opacity: 0.5,
  },
  reactionEmojiText: {
    fontSize: 18,
  },
  reactionPrivateText: {
    color: colors.textSecondary,
    fontSize: 11,
  },
  locationLinkText: {
    color: colors.rose,
    fontSize: 13,
    fontWeight: "600",
    textDecorationLine: "underline",
  },
  advancedNotesBlock: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfacePrimary,
    padding: 10,
    gap: 10,
  },
  advancedNotesToggle: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  advancedNotesTitle: {
    color: colors.textPrimary,
    fontSize: 13,
    fontWeight: "700",
  },
  advancedNotesToggleText: {
    color: colors.textSecondary,
    fontSize: 11,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.8,
  },
  pickerModalRoot: {
    flex: 1,
    justifyContent: "center",
    paddingHorizontal: 20,
    paddingVertical: 24,
  },
  pickerModalBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: colors.surfacePrimary,
  },
  pickerModalCard: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    backgroundColor: colors.limestone,
    padding: 14,
    gap: 10,
    maxHeight: "70%",
  },
  pickerModalTitle: {
    color: colors.textPrimary,
    fontSize: 14,
    fontWeight: "700",
  },
  pickerModalList: {
    maxHeight: 320,
  },
  pickerModalListContent: {
    gap: 8,
    paddingBottom: 4,
  },
  pickerModalItem: {
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    backgroundColor: colors.surfacePrimary,
    paddingHorizontal: 12,
    paddingVertical: 11,
  },
  pickerModalItemSelected: {
    borderColor: "rgba(123,29,58,0.55)",
    backgroundColor: "rgba(123,29,58,0.16)",
  },
  pickerModalItemText: {
    color: colors.textPrimary,
    fontSize: 13,
    fontWeight: "600",
  },
  pickerModalItemTextSelected: {
    color: colors.rose,
  },
  deleteCard: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(192,57,43,0.34)",
    backgroundColor: "rgba(192,57,43,0.1)",
    padding: 12,
    gap: 8,
  },
  deleteHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  deleteCopy: {
    flex: 1,
    gap: 2,
  },
  deleteTitle: {
    color: colors.error,
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 0.8,
    textTransform: "uppercase",
  },
  deleteDescription: {
    color: colors.error,
    fontSize: 12,
    lineHeight: 16,
  },
  deleteButton: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(192,57,43,0.55)",
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: "rgba(192,57,43,0.4)",
  },
  deleteButtonDisabled: {
    opacity: 0.6,
  },
  deleteButtonText: {
    color: colors.error,
    fontSize: 12,
    fontWeight: "700",
  },
  deleteErrorText: {
    color: colors.error,
    fontSize: 12,
    lineHeight: 16,
  },
  calendarHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 10,
  },
  calendarNavText: {
    color: colors.textPrimary,
    fontSize: 18,
    fontWeight: "700",
    paddingHorizontal: 12,
    paddingVertical: 4,
  },
  calendarWeekdayRow: {
    flexDirection: "row",
    marginBottom: 4,
  },
  calendarWeekdayText: {
    flex: 1,
    textAlign: "center",
    color: colors.textSecondary,
    fontSize: 10,
    fontWeight: "700",
    textTransform: "uppercase",
  },
  calendarGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
  },
  calendarSlot: {
    width: "14.2857%",
    aspectRatio: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  calendarCell: {
    borderRadius: 999,
  },
  calendarCellSelected: {
    backgroundColor: colors.viognier,
  },
  calendarCellText: {
    color: colors.textSecondary,
    fontSize: 13,
    fontWeight: "500",
  },
  calendarCellTextSelected: {
    color: colors.textPrimary,
    fontWeight: "700",
  },
});

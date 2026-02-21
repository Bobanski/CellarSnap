import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import {
  PRICE_PAID_CURRENCY_LABELS,
  PRICE_PAID_CURRENCY_VALUES,
  PRICE_PAID_SOURCE_LABELS,
  PRICE_PAID_SOURCE_VALUES,
  QPR_LEVEL_LABELS,
  QPR_LEVEL_VALUES,
  type PricePaidCurrency,
  type PricePaidSource,
  type QprLevel,
} from "@cellarsnap/shared";
import { AppTopBar } from "@/src/components/AppTopBar";
import { AppText } from "@/src/components/AppText";
import { DoneTextInput } from "@/src/components/DoneTextInput";
import { supabase } from "@/src/lib/supabase";
import { useAuth } from "@/src/providers/AuthProvider";

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
};

type FriendRequestRow = {
  requester_id: string;
  recipient_id: string;
  status: string | null;
};

type AdvancedNoteKey = keyof typeof ADVANCED_NOTE_OPTIONS;

type AdvancedNotesFormState = Record<AdvancedNoteKey, string>;

const PHOTO_TYPE_LABELS: Record<EntryPhotoType, string> = {
  label: "Label",
  place: "Place",
  people: "People",
  pairing: "Pairing",
  lineup: "Lineup",
  other_bottles: "Other bottle",
};

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

function formatProfileName(profile: ProfileRow) {
  const display = profile.display_name?.trim();
  if (display) {
    return display;
  }
  const email = profile.email?.trim();
  if (email) {
    return email;
  }
  return "Unknown";
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

      const { data, error } = await supabase.storage
        .from("wine-photos")
        .createSignedUrl(storagePath, 60 * 60);
      const signedUrl = error ? null : data.signedUrl;
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
  const [tastedWithNames, setTastedWithNames] = useState<string[]>([]);
  const [photos, setPhotos] = useState<EntryPhotoItem[]>([]);
  const [failedPhotoIds, setFailedPhotoIds] = useState<Set<string>>(() => new Set());
  const [activePhotoIndex, setActivePhotoIndex] = useState(0);
  const [photoFrameWidth, setPhotoFrameWidth] = useState(0);
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
  const [selectedTastedWithIds, setSelectedTastedWithIds] = useState<string[]>([]);
  const [friendSearch, setFriendSearch] = useState("");
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
    consumed_at: "",
    notes: "",
  });
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const galleryScrollRef = useRef<ScrollView | null>(null);

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
        "id, user_id, wine_name, producer, vintage, country, region, appellation, classification, rating, price_paid, price_paid_currency, price_paid_source, qpr_level, notes, advanced_notes, location_text, location_place_id, consumed_at, tasted_with_user_ids, label_image_path, place_image_path, pairing_image_path, created_at"
      )
      .eq("id", entryId)
      .maybeSingle();

    if (entryError || !entryData) {
      setErrorMessage(entryError?.message ?? "Entry unavailable.");
      setLoading(false);
      return;
    }

    const nextEntry = entryData as EntryDetailRow;

    const [{ data: photoRows }, { data: grapeRows }] = await Promise.all([
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
    ]);

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
      new Set([nextEntry.user_id, ...(nextEntry.tasted_with_user_ids ?? [])])
    );

    const profileResponse = profileIds.length
      ? await supabase
          .from("profiles")
          .select("id, display_name, email, avatar_path")
          .in("id", profileIds)
      : { data: [] as ProfileRow[], error: null };

    let profileRows = (profileResponse.data ?? []) as ProfileRow[];
    if (profileResponse.error && isMissingAvatarColumn(profileResponse.error.message)) {
      const fallback = profileIds.length
        ? await supabase
            .from("profiles")
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
          }))
        : legacyPhotoTuples
            .filter((photo) => Boolean(photo.path))
            .map((photo) => ({
              id: photo.id,
              type: photo.type,
              url: photo.path ? resolvePhotoUrl(photo.path, signedUrlMap) : null,
            }));

    const profileMap = new Map(profileRows.map((row) => [row.id, row]));
    const authorProfile = profileMap.get(nextEntry.user_id);
    setAuthorName(
      authorProfile?.display_name?.trim() || authorProfile?.email?.trim() || "Unknown"
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
    setEntry({ ...nextEntry, primary_grapes: primaryGrapes });
    setSelectedPrimaryGrapes(primaryGrapes.map((grape) => ({ ...grape })));
    setSelectedTastedWithIds(nextEntry.tasted_with_user_ids ?? []);
    setBulkAdvancedNotes(toAdvancedNotesFormState(nextEntry.advanced_notes));
    setPrimaryGrapeQuery("");
    setPrimaryGrapeSuggestions([]);
    setPrimaryGrapeError(null);
    setBulkReviewForm({
      wine_name: nextEntry.wine_name ?? "",
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
      consumed_at: nextEntry.consumed_at ?? "",
      notes: nextEntry.notes ?? "",
    });
    setBulkReviewError(null);
    setPhotos(nextPhotos);
    setFailedPhotoIds(new Set());
    setActivePhotoIndex(0);
    setAdvancedNotesOpen(false);
    if (galleryScrollRef.current) {
      galleryScrollRef.current.scrollTo({ x: 0, animated: false });
    }
    setLoading(false);
  }, [entryId]);

  useEffect(() => {
    void loadEntry();
  }, [loadEntry]);

  useEffect(() => {
    const maxIndex = Math.max(0, photos.length - 1);
    if (activePhotoIndex > maxIndex) {
      setActivePhotoIndex(maxIndex);
    }
  }, [activePhotoIndex, photos.length]);

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
        .from("profiles")
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

  const isOwner = Boolean(user?.id && entry?.user_id === user.id);
  const hasMultiplePhotos = photos.length > 1;
  const activePhoto =
    photos[Math.max(0, Math.min(photos.length - 1, activePhotoIndex))] ?? null;
  const activePhotoFailed = activePhoto ? failedPhotoIds.has(activePhoto.id) : false;
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
  const canOpenLocation = hasLocation && Boolean(entry?.location_place_id?.trim());
  const locationDisplayLabel = hasLocation
    ? buildLocationDisplayLabel(locationText)
    : "";
  const bulkActionsDisabled = deleting || isDeletingBulkQueue || isSavingBulkReview;
  const topFriends = friendUsers.slice(0, 5);
  const topFriendIds = new Set(topFriends.map((profile) => profile.id));
  const extraSelectedFriends = friendUsers.filter(
    (profile) =>
      selectedTastedWithIds.includes(profile.id) && !topFriendIds.has(profile.id)
  );
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
          const email = profile.email?.toLowerCase() ?? "";
          return (
            displayName.includes(normalizedFriendSearch) ||
            email.includes(normalizedFriendSearch)
          );
        })
      : [];

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

      const wineName = bulkReviewForm.wine_name.trim();
      if (!wineName) {
        setBulkReviewError("Wine name is required.");
        return;
      }

      const ratingRaw = bulkReviewForm.rating.trim();
      let ratingValue: number | null = null;
      if (ratingRaw.length > 0) {
        const parsed = Number(ratingRaw);
        if (!Number.isFinite(parsed)) {
          setBulkReviewError("Rating must be a number between 1 and 100.");
          return;
        }
        ratingValue = Math.max(1, Math.min(100, Math.round(parsed)));
      }

      const priceRaw = bulkReviewForm.price_paid.trim();
      let priceValue: number | null = null;
      if (priceRaw.length > 0) {
        const parsed = Number(priceRaw);
        if (!Number.isFinite(parsed) || parsed < 0 || parsed > 100000) {
          setBulkReviewError("Price paid must be a valid number.");
          return;
        }
        priceValue = Number(parsed.toFixed(2));
      }

      const priceCurrency = bulkReviewForm.price_paid_currency || null;
      const priceSource = bulkReviewForm.price_paid_source || null;
      if (priceValue !== null && !priceCurrency) {
        setBulkReviewError("Select a currency when entering price paid.");
        return;
      }
      if (priceValue !== null && !priceSource) {
        setBulkReviewError("Select retail or restaurant when entering price paid.");
        return;
      }
      if (priceValue === null && (priceCurrency || priceSource)) {
        setBulkReviewError("Enter a price paid amount when setting currency/source.");
        return;
      }

      const consumedAtRaw = bulkReviewForm.consumed_at.trim();
      if (consumedAtRaw.length > 0 && !/^\d{4}-\d{2}-\d{2}$/.test(consumedAtRaw)) {
        setBulkReviewError("Consumed date must be YYYY-MM-DD.");
        return;
      }

      setIsSavingBulkReview(true);
      setBulkReviewError(null);
      setDeleteError(null);
      const advancedNotesPayload = toAdvancedNotesPayload(bulkAdvancedNotes);
      const primaryGrapeIds = selectedPrimaryGrapes
        .slice(0, 3)
        .map((grape) => grape.id);
      const nextTastedWithIds = Array.from(new Set(selectedTastedWithIds));

      const { error: updateError } = await supabase
        .from("wine_entries")
        .update({
          wine_name: wineName,
          producer: normalizeOptionalText(bulkReviewForm.producer),
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
          consumed_at: consumedAtRaw.length > 0 ? consumedAtRaw : entry.consumed_at,
          notes: normalizeOptionalText(bulkReviewForm.notes),
          tasted_with_user_ids: nextTastedWithIds,
          advanced_notes: advancedNotesPayload,
          is_feed_visible: true,
        })
        .eq("id", entry.id)
        .eq("user_id", user.id);

      if (updateError) {
        setBulkReviewError(updateError.message);
        setIsSavingBulkReview(false);
        return;
      }

      const { error: clearPrimaryGrapesError } = await supabase
        .from("entry_primary_grapes")
        .delete()
        .eq("entry_id", entry.id);

      if (
        clearPrimaryGrapesError &&
        !isPrimaryGrapeTableMissingError(clearPrimaryGrapesError.message ?? "")
      ) {
        setBulkReviewError(clearPrimaryGrapesError.message);
        setIsSavingBulkReview(false);
        return;
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
          setBulkReviewError(insertPrimaryGrapesError.message);
          setIsSavingBulkReview(false);
          return;
        }
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
      bulkAdvancedNotes,
      bulkQueue,
      bulkReviewForm,
      currentBulkIndex,
      deleting,
      entry,
      isBulkReview,
      isDeletingBulkQueue,
      isSavingBulkReview,
      nextBulkEntryId,
      publishBulkQueueEntries,
      selectedPrimaryGrapes,
      selectedTastedWithIds,
      user?.id,
    ]
  );

  const goToNextBulkEntry = useCallback(() => {
    if (!isBulkReview) {
      return;
    }
    void saveBulkReview("next");
  }, [isBulkReview, saveBulkReview]);

  const skipBulkReview = useCallback(() => {
    void saveBulkReview("exit");
  }, [saveBulkReview]);

  const cancelBulkEntry = useCallback(() => {
    if (
      !isBulkReview ||
      !entryId ||
      deleting ||
      isDeletingBulkQueue ||
      isSavingBulkReview
    ) {
      return;
    }

    Alert.alert(
      "Cancel this wine?",
      "This removes the current entry and its photos from the bulk queue.",
      [
        { text: "Keep", style: "cancel" },
        {
          text: "Cancel wine",
          style: "destructive",
          onPress: () => {
            void (async () => {
              setDeleting(true);
              setDeleteError(null);
              try {
                await deleteEntryById(entryId);
                const nextQueue = bulkQueue.filter((id) => id !== entryId);
                if (nextQueue.length === 0) {
                  router.replace("/(app)/entries");
                  return;
                }
                const targetNextEntryId =
                  nextBulkEntryId && nextQueue.includes(nextBulkEntryId)
                    ? nextBulkEntryId
                    : nextQueue[0];
                const targetIndex = Math.max(0, nextQueue.indexOf(targetNextEntryId));
                router.replace(
                  buildBulkEntryHref(targetNextEntryId, nextQueue, targetIndex) as never
                );
              } catch (error) {
                setDeleteError(
                  error instanceof Error ? error.message : "Unable to cancel this wine."
                );
              } finally {
                setDeleting(false);
              }
            })();
          },
        },
      ]
    );
  }, [
    bulkQueue,
    deleteEntryById,
    deleting,
    entryId,
    isBulkReview,
    isDeletingBulkQueue,
    isSavingBulkReview,
    nextBulkEntryId,
  ]);

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
    <View style={styles.screen}>
      <ScrollView contentContainerStyle={styles.content}>
        <AppTopBar activeHref="/(app)/entries" />

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
            <ActivityIndicator color="#fbbf24" />
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
                <View style={styles.bulkReviewActionRow}>
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
                      styles.bulkSecondaryButton,
                      bulkActionsDisabled ? styles.bulkButtonDisabled : null,
                    ]}
                    onPress={skipBulkReview}
                    disabled={bulkActionsDisabled}
                  >
                    <AppText style={styles.bulkSecondaryButtonText}>
                      Skip all and save
                    </AppText>
                  </Pressable>
                </View>
                <View style={styles.bulkReviewDangerRow}>
                  <Pressable
                    style={[
                      styles.bulkDangerButton,
                      bulkActionsDisabled ? styles.bulkButtonDisabled : null,
                    ]}
                    onPress={cancelBulkEntry}
                    disabled={bulkActionsDisabled}
                  >
                    <AppText style={styles.bulkDangerButtonText}>Cancel this wine</AppText>
                  </Pressable>
                  <Pressable
                    style={[
                      styles.bulkDangerButton,
                      bulkActionsDisabled ? styles.bulkButtonDisabled : null,
                    ]}
                    onPress={cancelEntireBulkQueue}
                    disabled={bulkActionsDisabled}
                  >
                    <AppText style={styles.bulkDangerButtonText}>Cancel bulk entry</AppText>
                  </Pressable>
                </View>
                {bulkReviewError ? (
                  <AppText style={styles.bulkReviewErrorText}>{bulkReviewError}</AppText>
                ) : null}
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
              <AppText style={styles.title}>
                {entry.wine_name?.trim() || "Untitled wine"}
              </AppText>
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

                  <View style={styles.photoTypeChip}>
                    <AppText style={styles.photoTypeChipText}>
                      {PHOTO_TYPE_LABELS[activePhoto.type]}
                    </AppText>
                  </View>
                  {hasMultiplePhotos ? (
                    <View style={styles.photoOrderChip}>
                      <AppText style={styles.photoOrderChipText}>
                        {toOrdinal(activePhotoIndex + 1)}
                      </AppText>
                    </View>
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
                  <AppText style={styles.photoFallbackText}>No photos uploaded.</AppText>
                </View>
              )}
            </View>

            {isBulkReview ? (
              <View style={styles.bulkEditCard}>
                <AppText style={styles.bulkEditTitle}>Review and edit details</AppText>
                <AppText style={styles.bulkEditDescription}>
                  Save this wine, then continue through the queue.
                </AppText>

                <AppText style={styles.bulkSectionHeading}>Notes</AppText>
                <View style={styles.bulkFormField}>
                  <AppText style={styles.bulkFormLabel}>Notes</AppText>
                  <DoneTextInput
                    value={bulkReviewForm.notes}
                    onChangeText={(value) => updateBulkReviewField("notes", value)}
                    placeholder="Optional tasting notes"
                    placeholderTextColor="#71717a"
                    autoCapitalize="sentences"
                    autoCorrect
                    multiline
                    style={[styles.bulkFormInput, styles.bulkFormInputMultiline]}
                  />
                </View>

                <View style={styles.bulkFormRow}>
                  <View style={styles.bulkFormCol}>
                    <AppText style={styles.bulkFormLabel}>Rating (1-100)</AppText>
                    <DoneTextInput
                      value={bulkReviewForm.rating}
                      onChangeText={(value) => updateBulkReviewField("rating", value)}
                      placeholder="Required"
                      placeholderTextColor="#71717a"
                      keyboardType="number-pad"
                      style={styles.bulkFormInput}
                    />
                  </View>
                  <View style={styles.bulkFormCol}>
                    <AppText style={styles.bulkFormLabel}>QPR</AppText>
                    <View style={styles.bulkChipWrap}>
                      <Pressable
                        style={[
                          styles.bulkChip,
                          bulkReviewForm.qpr_level === "" ? styles.bulkChipActive : null,
                        ]}
                        onPress={() => updateBulkReviewField("qpr_level", "")}
                      >
                        <AppText
                          style={[
                            styles.bulkChipText,
                            bulkReviewForm.qpr_level === "" ? styles.bulkChipTextActive : null,
                          ]}
                        >
                          Not set
                        </AppText>
                      </Pressable>
                      {QPR_LEVEL_VALUES.map((option) => (
                        <Pressable
                          key={`qpr-${option}`}
                          style={[
                            styles.bulkChip,
                            bulkReviewForm.qpr_level === option ? styles.bulkChipActive : null,
                          ]}
                          onPress={() => updateBulkReviewField("qpr_level", option)}
                        >
                          <AppText
                            style={[
                              styles.bulkChipText,
                              bulkReviewForm.qpr_level === option
                                ? styles.bulkChipTextActive
                                : null,
                            ]}
                          >
                            {QPR_LEVEL_LABELS[option]}
                          </AppText>
                        </Pressable>
                      ))}
                    </View>
                  </View>
                </View>

                <AppText style={styles.bulkSectionHeading}>Wine details</AppText>
                <AppText style={styles.bulkSectionHint}>
                  Optional identity details for this bottle.
                </AppText>
                <View style={styles.bulkFormField}>
                  <AppText style={styles.bulkFormLabel}>Wine name</AppText>
                  <DoneTextInput
                    value={bulkReviewForm.wine_name}
                    onChangeText={(value) => updateBulkReviewField("wine_name", value)}
                    placeholder="Required"
                    placeholderTextColor="#71717a"
                    autoCapitalize="words"
                    autoCorrect={false}
                    style={styles.bulkFormInput}
                  />
                </View>

                <View style={styles.bulkFormRow}>
                  <View style={styles.bulkFormCol}>
                    <AppText style={styles.bulkFormLabel}>Producer</AppText>
                    <DoneTextInput
                      value={bulkReviewForm.producer}
                      onChangeText={(value) => updateBulkReviewField("producer", value)}
                      placeholder="Optional"
                      placeholderTextColor="#71717a"
                      autoCapitalize="words"
                      autoCorrect={false}
                      style={styles.bulkFormInput}
                    />
                  </View>
                  <View style={styles.bulkFormCol}>
                    <AppText style={styles.bulkFormLabel}>Vintage</AppText>
                    <DoneTextInput
                      value={bulkReviewForm.vintage}
                      onChangeText={(value) => updateBulkReviewField("vintage", value)}
                      placeholder="Optional"
                      placeholderTextColor="#71717a"
                      keyboardType="number-pad"
                      style={styles.bulkFormInput}
                    />
                  </View>
                </View>

                <View style={styles.bulkFormRow}>
                  <View style={styles.bulkFormCol}>
                    <AppText style={styles.bulkFormLabel}>Country</AppText>
                    <DoneTextInput
                      value={bulkReviewForm.country}
                      onChangeText={(value) => updateBulkReviewField("country", value)}
                      placeholder="Optional"
                      placeholderTextColor="#71717a"
                      autoCapitalize="words"
                      autoCorrect={false}
                      style={styles.bulkFormInput}
                    />
                  </View>
                  <View style={styles.bulkFormCol}>
                    <AppText style={styles.bulkFormLabel}>Region</AppText>
                    <DoneTextInput
                      value={bulkReviewForm.region}
                      onChangeText={(value) => updateBulkReviewField("region", value)}
                      placeholder="Optional"
                      placeholderTextColor="#71717a"
                      autoCapitalize="words"
                      autoCorrect={false}
                      style={styles.bulkFormInput}
                    />
                  </View>
                </View>

                <View style={styles.bulkFormRow}>
                  <View style={styles.bulkFormCol}>
                    <AppText style={styles.bulkFormLabel}>Appellation</AppText>
                    <DoneTextInput
                      value={bulkReviewForm.appellation}
                      onChangeText={(value) => updateBulkReviewField("appellation", value)}
                      placeholder="Optional"
                      placeholderTextColor="#71717a"
                      autoCapitalize="words"
                      autoCorrect={false}
                      style={styles.bulkFormInput}
                    />
                  </View>
                  <View style={styles.bulkFormCol}>
                    <AppText style={styles.bulkFormLabel}>Classification</AppText>
                    <DoneTextInput
                      value={bulkReviewForm.classification}
                      onChangeText={(value) => updateBulkReviewField("classification", value)}
                      placeholder="Optional"
                      placeholderTextColor="#71717a"
                      autoCapitalize="words"
                      autoCorrect={false}
                      style={styles.bulkFormInput}
                    />
                  </View>
                </View>

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
                    placeholderTextColor="#71717a"
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

                <AppText style={styles.bulkSectionHeading}>Location & date</AppText>
                <View style={styles.bulkFormField}>
                  <AppText style={styles.bulkFormLabel}>Location</AppText>
                  <DoneTextInput
                    value={bulkReviewForm.location_text}
                    onChangeText={(value) => updateBulkReviewField("location_text", value)}
                    placeholder="Optional location"
                    placeholderTextColor="#71717a"
                    autoCapitalize="words"
                    autoCorrect={false}
                    style={styles.bulkFormInput}
                  />
                </View>

                <View style={styles.bulkFormRow}>
                  <View style={styles.bulkFormCol}>
                    <AppText style={styles.bulkFormLabel}>Consumed date</AppText>
                    <DoneTextInput
                      value={bulkReviewForm.consumed_at}
                      onChangeText={(value) => updateBulkReviewField("consumed_at", value)}
                      placeholder="YYYY-MM-DD"
                      placeholderTextColor="#71717a"
                      autoCapitalize="none"
                      autoCorrect={false}
                      style={styles.bulkFormInput}
                    />
                  </View>
                </View>

                <AppText style={styles.bulkSectionHeading}>Tasted with</AppText>
                <AppText style={styles.bulkSectionHint}>
                  Tag friends who were with you.
                </AppText>
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
                      placeholderTextColor="#71717a"
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

                <AppText style={styles.bulkSectionHeading}>Advanced notes</AppText>
                <AppText style={styles.bulkSectionHint}>
                  Optional structure for deeper tasting notes.
                </AppText>
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

                <AppText style={styles.bulkSectionHeading}>Price (optional)</AppText>
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
              </View>
            ) : (
              <View style={styles.detailsCard}>
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
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: "#0f0a09",
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
    borderColor: "rgba(255,255,255,0.14)",
    backgroundColor: "rgba(0,0,0,0.2)",
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  backLinkText: {
    color: "#d4d4d8",
    fontSize: 12,
    fontWeight: "700",
  },
  loadingCard: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    backgroundColor: "rgba(255,255,255,0.05)",
    paddingHorizontal: 16,
    paddingVertical: 18,
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  loadingText: {
    color: "#d4d4d8",
    fontSize: 13,
  },
  errorCard: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(251,113,133,0.35)",
    backgroundColor: "rgba(251,113,133,0.08)",
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  errorText: {
    color: "#fecdd3",
    fontSize: 13,
    lineHeight: 18,
  },
  bulkReviewCard: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(251,191,36,0.36)",
    backgroundColor: "rgba(146,64,14,0.18)",
    padding: 12,
    gap: 8,
  },
  bulkReviewEyebrow: {
    color: "#fcd34d",
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 1.5,
    textTransform: "uppercase",
  },
  bulkReviewTitle: {
    color: "#fef3c7",
    fontSize: 15,
    fontWeight: "700",
  },
  bulkReviewDescription: {
    color: "#e4e4e7",
    fontSize: 12,
    lineHeight: 16,
  },
  bulkReviewActionRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  bulkReviewDangerRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  bulkPrimaryButton: {
    borderRadius: 999,
    backgroundColor: "#fbbf24",
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  bulkPrimaryButtonText: {
    color: "#09090b",
    fontSize: 12,
    fontWeight: "700",
  },
  bulkSecondaryButton: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.2)",
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: "rgba(0,0,0,0.2)",
  },
  bulkSecondaryButtonText: {
    color: "#e4e4e7",
    fontSize: 12,
    fontWeight: "700",
  },
  bulkDangerButton: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(251,113,133,0.48)",
    backgroundColor: "rgba(127,29,29,0.32)",
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  bulkDangerButtonText: {
    color: "#fecdd3",
    fontSize: 12,
    fontWeight: "700",
  },
  bulkButtonDisabled: {
    opacity: 0.55,
  },
  bulkReviewErrorText: {
    color: "#fecaca",
    fontSize: 12,
    lineHeight: 16,
  },
  bulkEditCard: {
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    backgroundColor: "rgba(255,255,255,0.05)",
    padding: 14,
    gap: 10,
  },
  bulkEditTitle: {
    color: "#f4f4f5",
    fontSize: 16,
    fontWeight: "700",
  },
  bulkEditDescription: {
    color: "#a1a1aa",
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
    color: "#a1a1aa",
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 1.1,
    textTransform: "uppercase",
  },
  bulkFormInput: {
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.15)",
    backgroundColor: "rgba(0,0,0,0.22)",
    color: "#f4f4f5",
    fontSize: 14,
    paddingHorizontal: 12,
    paddingVertical: 10,
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
    borderColor: "rgba(255,255,255,0.2)",
    backgroundColor: "rgba(0,0,0,0.24)",
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  bulkChipActive: {
    borderColor: "rgba(251,191,36,0.58)",
    backgroundColor: "rgba(251,191,36,0.15)",
  },
  bulkChipText: {
    color: "#d4d4d8",
    fontSize: 11,
    fontWeight: "700",
  },
  bulkChipTextActive: {
    color: "#fde68a",
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
    borderColor: "rgba(255,255,255,0.14)",
    backgroundColor: "rgba(0,0,0,0.28)",
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  authorAvatarImage: {
    width: "100%",
    height: "100%",
  },
  authorAvatarFallback: {
    color: "#a1a1aa",
    fontSize: 12,
    fontWeight: "700",
  },
  authorMeta: {
    flex: 1,
    gap: 2,
  },
  authorName: {
    color: "#f4f4f5",
    fontSize: 13,
    fontWeight: "700",
  },
  authorDate: {
    color: "#a1a1aa",
    fontSize: 11,
  },
  eyebrow: {
    color: "#fcd34d",
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 1.4,
    textTransform: "uppercase",
  },
  title: {
    color: "#fafafa",
    fontSize: 24,
    fontWeight: "700",
    lineHeight: 30,
  },
  subtitle: {
    color: "#d4d4d8",
    fontSize: 13,
    lineHeight: 18,
  },
  photoFrame: {
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    backgroundColor: "rgba(0,0,0,0.25)",
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
    borderColor: "rgba(255,255,255,0.18)",
    backgroundColor: "rgba(0,0,0,0.55)",
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  photoTypeChipText: {
    color: "#f4f4f5",
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
    borderColor: "rgba(255,255,255,0.18)",
    backgroundColor: "rgba(0,0,0,0.55)",
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  photoOrderChipText: {
    color: "#f4f4f5",
    fontSize: 10,
    fontWeight: "700",
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
    backgroundColor: "rgba(255,255,255,0.35)",
  },
  photoDotActive: {
    backgroundColor: "#fcd34d",
  },
  photoFallback: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(0,0,0,0.35)",
    paddingHorizontal: 20,
  },
  photoFallbackText: {
    color: "#71717a",
    fontSize: 12,
    textAlign: "center",
  },
  detailsCard: {
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    backgroundColor: "rgba(255,255,255,0.05)",
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
    color: "#a1a1aa",
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 1.4,
    textTransform: "uppercase",
  },
  metaValue: {
    color: "#e4e4e7",
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
    borderColor: "rgba(251,113,133,0.4)",
    backgroundColor: "rgba(251,113,133,0.1)",
    color: "#fecdd3",
  },
  qpr_pricey: {
    borderColor: "rgba(248,113,113,0.4)",
    backgroundColor: "rgba(248,113,113,0.1)",
    color: "#fecaca",
  },
  qpr_mid: {
    borderColor: "rgba(251,191,36,0.4)",
    backgroundColor: "rgba(251,191,36,0.1)",
    color: "#fde68a",
  },
  qpr_good_value: {
    borderColor: "rgba(74,222,128,0.4)",
    backgroundColor: "rgba(74,222,128,0.1)",
    color: "#bbf7d0",
  },
  qpr_absolute_steal: {
    borderColor: "rgba(34,197,94,0.4)",
    backgroundColor: "rgba(34,197,94,0.1)",
    color: "#86efac",
  },
  locationLinkText: {
    color: "#fde68a",
    fontSize: 13,
    fontWeight: "600",
    textDecorationLine: "underline",
  },
  advancedNotesBlock: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    backgroundColor: "rgba(0,0,0,0.22)",
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
    color: "#f4f4f5",
    fontSize: 13,
    fontWeight: "700",
  },
  advancedNotesToggleText: {
    color: "#a1a1aa",
    fontSize: 11,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.8,
  },
  deleteCard: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(251,113,133,0.34)",
    backgroundColor: "rgba(244,63,94,0.1)",
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
    color: "#ffe4e6",
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 0.8,
    textTransform: "uppercase",
  },
  deleteDescription: {
    color: "#fecdd3",
    fontSize: 12,
    lineHeight: 16,
  },
  deleteButton: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(251,113,133,0.55)",
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: "rgba(127,29,29,0.4)",
  },
  deleteButtonDisabled: {
    opacity: 0.6,
  },
  deleteButtonText: {
    color: "#fecdd3",
    fontSize: 12,
    fontWeight: "700",
  },
  deleteErrorText: {
    color: "#fecaca",
    fontSize: 12,
    lineHeight: 16,
  },
});

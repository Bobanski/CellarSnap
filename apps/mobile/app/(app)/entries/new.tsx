import {
  Children,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  ActivityIndicator,
  Dimensions,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  View
} from "react-native";
import { router } from "expo-router";
import * as ImagePicker from "expo-image-picker";
import {
  createEntryInputSchema,
  getTodayLocalYmd,
  normalizePrivacyLevel,
  PRIVACY_LEVEL_LABELS,
  PRIVACY_LEVEL_VALUES,
  QPR_LEVEL_LABELS,
  QPR_LEVEL_VALUES,
  toWineEntryInsertPayload,
  type PricePaidCurrency,
  type PricePaidSource,
  type PrivacyLevel,
  type QprLevel,
} from "@cellarsnap/shared";
import { DoneTextInput } from "@/src/components/DoneTextInput";
import { supabase } from "@/src/lib/supabase";
import { useAuth } from "@/src/providers/AuthProvider";
import { AppText } from "@/src/components/AppText";

type AdvancedNotesFormValues = {
  acidity: string;
  tannin: string;
  alcohol: string;
  sweetness: string;
  body: string;
};

type EntryFormState = {
  wine_name: string;
  producer: string;
  vintage: string;
  country: string;
  region: string;
  appellation: string;
  classification: string;
  rating: string;
  price_paid: string;
  price_paid_currency: PricePaidCurrency;
  price_paid_source: PricePaidSource | "";
  qpr_level: QprLevel | "";
  notes: string;
  location_text: string;
  location_place_id: string;
  consumed_at: string;
  entry_privacy: PrivacyLevel;
  reaction_privacy: PrivacyLevel;
  comments_privacy: PrivacyLevel;
  advanced_notes: AdvancedNotesFormValues;
};

type PrivacyDefaults = {
  entry_privacy: PrivacyLevel;
  reaction_privacy: PrivacyLevel;
  comments_privacy: PrivacyLevel;
};

type FriendUser = {
  id: string;
  display_name: string | null;
  email: string | null;
  tasting_count: number;
};

type PrimaryGrapeSelection = {
  id: string;
  name: string;
};

type AccordionKey =
  | "wine_details"
  | "location_date"
  | "tasted_with"
  | "advanced_notes"
  | "visibility";

type ChipOption = {
  value: string;
  label: string;
};

type LocationSuggestion = {
  description: string;
  place_id: string;
};

type ComparisonResponse = "more" | "less" | "same_or_not_sure";
type SurveyHowWasItResponse =
  | "awful"
  | "bad"
  | "okay"
  | "good"
  | "exceptional";
type SurveyExpectationsResponse =
  | "below_expectations"
  | "met_expectations"
  | "above_expectations";
type SurveyDrinkAgainResponse = "yes" | "no";

type SurveyComparisonCandidate = {
  id: string;
  wine_name: string | null;
  producer: string | null;
  vintage: string | null;
  consumed_at: string;
  label_image_url: string | null;
};

type PendingPostSaveSurvey = {
  entryId: string;
  wine_name: string | null;
  producer: string | null;
  vintage: string | null;
  new_wine_image_url: string | null;
  candidate: SurveyComparisonCandidate | null;
};

type PostSaveSurveyAnswers = {
  how_was_it: SurveyHowWasItResponse;
  expectations: SurveyExpectationsResponse;
  drink_again: SurveyDrinkAgainResponse;
};

type UploadPhotoType =
  | "label"
  | "place"
  | "people"
  | "pairing"
  | "lineup"
  | "other_bottles";

type ContextPhotoTag = "place" | "pairing" | "people" | "other_bottles" | "unknown";

type UploadPhotoItem = {
  id: string;
  uri: string;
  name: string;
  mimeType: string;
  type: UploadPhotoType;
  contextConfidence: number | null;
};

type LabelAutofillResponse = {
  wine_name?: string | null;
  producer?: string | null;
  vintage?: string | null;
  country?: string | null;
  region?: string | null;
  appellation?: string | null;
  classification?: string | null;
  primary_grape_suggestions?: string[] | null;
  primary_grape_confidence?: number | null;
  confidence?: number | null;
  warnings?: string[] | null;
  error?: string;
};

type PhotoContextResponse = {
  tag?: string;
  confidence?: number | null;
  error?: string;
};

type LineupApiWine = {
  wine_name?: string | null;
  producer?: string | null;
  vintage?: string | null;
  country?: string | null;
  region?: string | null;
  appellation?: string | null;
  classification?: string | null;
  primary_grape_suggestions?: string[] | null;
  confidence?: number | null;
};

type LineupAutofillResponse = {
  wines?: LineupApiWine[];
  total_bottles_detected?: number;
  error?: string;
};

type LineupWine = {
  id: string;
  photoIndex: number;
  included: boolean;
  wine_name: string | null;
  producer: string | null;
  vintage: string | null;
  country: string | null;
  region: string | null;
  appellation: string | null;
  classification: string | null;
  primary_grape_suggestions: string[];
  confidence: number | null;
};

const DEFAULT_PRIVACY: PrivacyDefaults = {
  entry_privacy: "public",
  reaction_privacy: "public",
  comments_privacy: "friends_of_friends",
};

const EMPTY_ADVANCED_NOTES: AdvancedNotesFormValues = {
  acidity: "",
  tannin: "",
  alcohol: "",
  sweetness: "",
  body: "",
};

const QPR_OPTIONS: ChipOption[] = [
  { value: "", label: "Not set" },
  ...QPR_LEVEL_VALUES.map((value) => ({
    value,
    label: QPR_LEVEL_LABELS[value],
  })),
];

const PRIVACY_OPTIONS: ChipOption[] = PRIVACY_LEVEL_VALUES.map((value) => ({
  value,
  label: PRIVACY_LEVEL_LABELS[value],
}));

const HOW_WAS_IT_OPTIONS: ChipOption[] = [
  { value: "awful", label: "Awful" },
  { value: "bad", label: "Bad" },
  { value: "okay", label: "Okay" },
  { value: "good", label: "Good" },
  { value: "exceptional", label: "Exceptional" },
];

const EXPECTATIONS_OPTIONS: ChipOption[] = [
  { value: "below_expectations", label: "Below expectations" },
  { value: "met_expectations", label: "Met expectations" },
  { value: "above_expectations", label: "Above expectations" },
];

const DRINK_AGAIN_OPTIONS: ChipOption[] = [
  { value: "yes", label: "Yes" },
  { value: "no", label: "No" },
];

const PHOTO_TYPE_LABELS: Record<UploadPhotoType, string> = {
  label: "Label",
  place: "Place",
  people: "People",
  pairing: "Pairing",
  lineup: "Lineup",
  other_bottles: "Other bottle",
};

const PHOTO_TYPE_OPTIONS: ChipOption[] = [
  { value: "label", label: "Label" },
  { value: "place", label: "Place" },
  { value: "people", label: "People" },
  { value: "pairing", label: "Pairing" },
  { value: "lineup", label: "Lineup" },
  { value: "other_bottles", label: "Other bottle" },
];

const MAX_PHOTOS_PER_TYPE = 10;
const MAX_TOTAL_UPLOAD_PHOTOS = 30;

const ADVANCED_NOTE_FIELDS: Array<{
  key: keyof AdvancedNotesFormValues;
  label: string;
  options: ChipOption[];
}> = [
  {
    key: "acidity",
    label: "Acidity",
    options: [
      { value: "", label: "Not set" },
      { value: "low", label: "Low" },
      { value: "medium_minus", label: "Medium-" },
      { value: "medium", label: "Medium" },
      { value: "medium_plus", label: "Medium+" },
      { value: "high", label: "High" },
    ],
  },
  {
    key: "tannin",
    label: "Tannin",
    options: [
      { value: "", label: "Not set" },
      { value: "low", label: "Low" },
      { value: "medium_minus", label: "Medium-" },
      { value: "medium", label: "Medium" },
      { value: "medium_plus", label: "Medium+" },
      { value: "high", label: "High" },
    ],
  },
  {
    key: "alcohol",
    label: "Alcohol",
    options: [
      { value: "", label: "Not set" },
      { value: "low", label: "Low" },
      { value: "medium", label: "Medium" },
      { value: "high", label: "High" },
    ],
  },
  {
    key: "sweetness",
    label: "Sweetness",
    options: [
      { value: "", label: "Not set" },
      { value: "dry", label: "Dry" },
      { value: "off_dry", label: "Off-dry" },
      { value: "medium_sweet", label: "Medium-sweet" },
      { value: "sweet", label: "Sweet" },
    ],
  },
  {
    key: "body",
    label: "Body",
    options: [
      { value: "", label: "Not set" },
      { value: "light", label: "Light" },
      { value: "medium_minus", label: "Medium-" },
      { value: "medium", label: "Medium" },
      { value: "medium_plus", label: "Medium+" },
      { value: "full", label: "Full" },
    ],
  },
];

const GOOGLE_MAPS_API_KEY = process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY;
const WEB_API_BASE_URL = process.env.EXPO_PUBLIC_WEB_API_BASE_URL;
const WEEKDAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;
const MONTH_LABELS = [
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
const FIELD_ROW_GAP = 10;

function formatYmd(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function parseYmd(value: string): Date | null {
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

function formatYmdDisplay(value: string): string {
  const parsed = parseYmd(value);
  if (!parsed) {
    return value;
  }
  return `${MONTH_SHORT_LABELS[parsed.getMonth()]} ${parsed.getDate()}, ${parsed.getFullYear()}`;
}

function normalizeGrapeLookupValue(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function normalizeLineupText(value: unknown) {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function hasLineupWineDetails(wine: {
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

const BULK_CREATE_CONCURRENCY = 4;

async function runWithConcurrency<T>(
  tasks: Array<() => Promise<T>>,
  concurrency: number
): Promise<T[]> {
  if (tasks.length === 0) {
    return [] as T[];
  }
  const safeConcurrency = Math.max(1, Math.min(concurrency, tasks.length));
  const results = new Array<T>(tasks.length);
  let nextIndex = 0;
  const workers = Array.from({ length: safeConcurrency }, async () => {
    while (true) {
      const taskIndex = nextIndex;
      nextIndex += 1;
      if (taskIndex >= tasks.length) {
        return;
      }
      results[taskIndex] = await tasks[taskIndex]();
    }
  });
  await Promise.all(workers);
  return results;
}

function isNetworkFailureError(error: unknown) {
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

function normalizeAnalysisErrorMessage(value: string | null | undefined) {
  const message = (value ?? "").trim();
  if (!message) {
    return "Could not analyze one of the selected photos. Please retry.";
  }

  const normalized = message.toLowerCase();
  if (
    normalized.includes("does not represent a valid image") ||
    normalized.includes("supported image formats") ||
    normalized.includes("invalid image")
  ) {
    return "One of the selected photos could not be read for AI scan. Re-add the photo and retry.";
  }

  return message;
}

function normalizeConfidence(value: unknown) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return null;
  }
  return Math.min(1, Math.max(0, value));
}

function normalizeContextTag(value: unknown): ContextPhotoTag {
  return value === "place" ||
    value === "pairing" ||
    value === "people" ||
    value === "other_bottles" ||
    value === "unknown"
    ? value
    : "unknown";
}

function mapContextTagToPhotoType(tag: ContextPhotoTag): UploadPhotoType {
  if (tag === "place" || tag === "pairing" || tag === "people") {
    return tag;
  }
  return "other_bottles";
}

function extensionForMimeType(mimeType: string) {
  if (mimeType === "image/png") {
    return "png";
  }
  if (mimeType === "image/webp") {
    return "webp";
  }
  if (mimeType === "image/heic" || mimeType === "image/heif") {
    return "heic";
  }
  if (mimeType === "image/gif") {
    return "gif";
  }
  return "jpg";
}

function ensurePhotoMimeType(mimeType: string | null | undefined) {
  return mimeType && mimeType.startsWith("image/") ? mimeType : "image/jpeg";
}

function computeOverallConfidence(values: Array<number | null | undefined>) {
  const normalized = values
    .map((value) => normalizeConfidence(value))
    .filter((value): value is number => typeof value === "number");
  if (normalized.length === 0) {
    return null;
  }
  const total = normalized.reduce((sum, value) => sum + value, 0);
  return Math.min(1, Math.max(0, total / normalized.length));
}

function getPrivacyBadgeTone(level: PrivacyLevel) {
  if (level === "public") {
    return {
      backgroundColor: "rgba(59, 130, 246, 0.16)",
      borderColor: "rgba(96, 165, 250, 0.7)",
      textColor: "#dbeafe",
    };
  }
  if (level === "friends_of_friends") {
    return {
      backgroundColor: "rgba(16, 185, 129, 0.14)",
      borderColor: "rgba(52, 211, 153, 0.7)",
      textColor: "#d1fae5",
    };
  }
  if (level === "friends") {
    return {
      backgroundColor: "rgba(251, 191, 36, 0.14)",
      borderColor: "rgba(252, 211, 77, 0.7)",
      textColor: "#fef3c7",
    };
  }
  return {
    backgroundColor: "rgba(244, 63, 94, 0.14)",
    borderColor: "rgba(251, 113, 133, 0.7)",
    textColor: "#ffe4e6",
  };
}

function formatFriendName(user: FriendUser) {
  return user.display_name ?? user.email ?? "Unknown";
}

function formatSurveyWineTitle(wine: {
  wine_name: string | null;
  producer: string | null;
  vintage: string | null;
}) {
  return wine.wine_name?.trim() || "Untitled wine";
}

function formatSurveyWineMeta(wine: {
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

function toAdvancedNotesPayload(values: AdvancedNotesFormValues) {
  const payload = {
    acidity: values.acidity || null,
    tannin: values.tannin || null,
    alcohol: values.alcohol || null,
    sweetness: values.sweetness || null,
    body: values.body || null,
  };
  return Object.values(payload).some((value) => value !== null) ? payload : null;
}

export default function NewEntryScreen() {
  const { user } = useAuth();
  const defaultConsumedDate = useMemo(() => getTodayLocalYmd(), []);

  const [privacyDefaults, setPrivacyDefaults] = useState<PrivacyDefaults>(DEFAULT_PRIVACY);
  const [form, setForm] = useState<EntryFormState>({
    wine_name: "",
    producer: "",
    vintage: "",
    country: "",
    region: "",
    appellation: "",
    classification: "",
    rating: "",
    price_paid: "",
    price_paid_currency: "usd",
    price_paid_source: "",
    qpr_level: "",
    notes: "",
    location_text: "",
    location_place_id: "",
    consumed_at: defaultConsumedDate,
    entry_privacy: DEFAULT_PRIVACY.entry_privacy,
    reaction_privacy: DEFAULT_PRIVACY.reaction_privacy,
    comments_privacy: DEFAULT_PRIVACY.comments_privacy,
    advanced_notes: { ...EMPTY_ADVANCED_NOTES },
  });

  const [expanded, setExpanded] = useState<Record<AccordionKey, boolean>>({
    wine_details: false,
    location_date: false,
    tasted_with: false,
    advanced_notes: false,
    visibility: false,
  });
  const [users, setUsers] = useState<FriendUser[]>([]);
  const [selectedUserIds, setSelectedUserIds] = useState<string[]>([]);
  const [friendSearch, setFriendSearch] = useState("");
  const [isLoadingDefaults, setIsLoadingDefaults] = useState(false);
  const [isLoadingFriends, setIsLoadingFriends] = useState(false);
  const [locationSuggestions, setLocationSuggestions] = useState<LocationSuggestion[]>([]);
  const [isLocationLoading, setIsLocationLoading] = useState(false);
  const [locationApiMessage, setLocationApiMessage] = useState<string | null>(null);
  const [locationSessionToken, setLocationSessionToken] = useState(() =>
    `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
  );
  const [selectedPrimaryGrapes, setSelectedPrimaryGrapes] = useState<PrimaryGrapeSelection[]>([]);
  const [isPrimaryGrapeFocused, setIsPrimaryGrapeFocused] = useState(false);
  const [primaryGrapeQuery, setPrimaryGrapeQuery] = useState("");
  const [primaryGrapeSuggestions, setPrimaryGrapeSuggestions] = useState<
    PrimaryGrapeSelection[]
  >([]);
  const [isPrimaryGrapeLoading, setIsPrimaryGrapeLoading] = useState(false);
  const [primaryGrapeError, setPrimaryGrapeError] = useState<string | null>(null);
  const [uploadPhotos, setUploadPhotos] = useState<UploadPhotoItem[]>([]);
  const [uploadAnalysisStatus, setUploadAnalysisStatus] = useState<
    "idle" | "loading" | "success" | "error" | "timeout"
  >("idle");
  const [uploadGalleryActiveIndex, setUploadGalleryActiveIndex] = useState(0);
  const [uploadGalleryFrameWidth, setUploadGalleryFrameWidth] = useState(0);
  const uploadGalleryScrollRef = useRef<ScrollView | null>(null);
  const [lineupWines, setLineupWines] = useState<LineupWine[]>([]);
  const [isBulkCreating, setIsBulkCreating] = useState(false);
  const [bulkCreateMessage, setBulkCreateMessage] = useState<string | null>(null);
  const [isAutofillLoading, setIsAutofillLoading] = useState(false);
  const [uploadMessage, setUploadMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [pendingPostSaveSurvey, setPendingPostSaveSurvey] =
    useState<PendingPostSaveSurvey | null>(null);
  const [surveyHowWasIt, setSurveyHowWasIt] = useState<
    SurveyHowWasItResponse | ""
  >("");
  const [surveyExpectations, setSurveyExpectations] = useState<
    SurveyExpectationsResponse | ""
  >("");
  const [surveyDrinkAgain, setSurveyDrinkAgain] = useState<
    SurveyDrinkAgainResponse | ""
  >("");
  const [postSaveSurveyStep, setPostSaveSurveyStep] = useState<
    "survey" | "comparison"
  >("survey");
  const [savedSurveyAnswers, setSavedSurveyAnswers] =
    useState<PostSaveSurveyAnswers | null>(null);
  const [surveyErrorMessage, setSurveyErrorMessage] = useState<string | null>(null);
  const [isSubmittingSurvey, setIsSubmittingSurvey] = useState(false);
  const labelPhotoUri =
    uploadPhotos.find((photo) => photo.type === "label")?.uri ??
    uploadPhotos[0]?.uri ??
    null;
  const showProcessedGallery =
    uploadPhotos.length > 0 && uploadAnalysisStatus !== "loading";
  const includedLineupWines = lineupWines.filter((wine) => wine.included);
  const readyLineupWines = lineupWines.filter(
    (wine) => wine.included && hasLineupWineDetails(wine)
  );
  const isBulkLineupMode = lineupWines.length > 0;
  const showAnalysisRetry =
    (uploadAnalysisStatus === "error" ||
      uploadAnalysisStatus === "timeout" ||
      /network request failed|failed to fetch|networkerror/i.test(uploadMessage ?? "")) &&
    uploadPhotos.length > 0 &&
    !isAutofillLoading &&
    !isBulkCreating;
  const showBulkRetry = Boolean(
    bulkCreateMessage &&
      !isBulkCreating &&
      includedLineupWines.length > 0 &&
      /(failed|unable|network|error)/i.test(bulkCreateMessage)
  );

  const updateField = <K extends keyof EntryFormState>(field: K, value: EntryFormState[K]) => {
    setForm((current) => ({ ...current, [field]: value }));
  };

  const getAccessTokenForApi = async () => {
    const { data: sessionResult } = await supabase.auth.getSession();
    let session = sessionResult.session;
    const expiresSoon =
      typeof session?.expires_at === "number" &&
      session.expires_at * 1000 <= Date.now() + 90_000;

    if (!session?.access_token || expiresSoon) {
      const { data: refreshedSessionResult } = await supabase.auth.refreshSession();
      if (refreshedSessionResult.session?.access_token) {
        session = refreshedSessionResult.session;
      }
    }

    return session?.access_token ?? null;
  };

  const updateAdvanced = (field: keyof AdvancedNotesFormValues, value: string) => {
    setForm((current) => ({
      ...current,
      advanced_notes: {
        ...current.advanced_notes,
        [field]: value,
      },
    }));
  };

  const toggleSection = (section: AccordionKey) => {
    setExpanded((current) => ({ ...current, [section]: !current[section] }));
  };

  useEffect(() => {
    if (!user?.id) return;
    let cancelled = false;

    const loadDefaults = async () => {
      setIsLoadingDefaults(true);
      const fullAttempt = await supabase
        .from("profiles")
        .select(
          "default_entry_privacy, default_reaction_privacy, default_comments_privacy"
        )
        .eq("id", user.id)
        .maybeSingle();

      let profile = fullAttempt.data as
        | {
            default_entry_privacy?: string | null;
            default_reaction_privacy?: string | null;
            default_comments_privacy?: string | null;
          }
        | null;
      let profileError = fullAttempt.error;

      if (
        profileError &&
        (profileError.message.includes("default_reaction_privacy") ||
          profileError.message.includes("default_comments_privacy"))
      ) {
        const fallback = await supabase
          .from("profiles")
          .select("default_entry_privacy")
          .eq("id", user.id)
          .maybeSingle();
        profile = fallback.data as { default_entry_privacy?: string | null } | null;
        profileError = fallback.error;
      }

      if (cancelled) return;
      setIsLoadingDefaults(false);
      if (profileError) return;

      const nextDefaults: PrivacyDefaults = {
        entry_privacy: normalizePrivacyLevel(profile?.default_entry_privacy, "public"),
        reaction_privacy: normalizePrivacyLevel(profile?.default_reaction_privacy, "public"),
        comments_privacy: normalizePrivacyLevel(
          profile?.default_comments_privacy,
          "friends_of_friends"
        ),
      };

      setPrivacyDefaults(nextDefaults);
      setForm((current) => ({
        ...current,
        entry_privacy: nextDefaults.entry_privacy,
        reaction_privacy: nextDefaults.reaction_privacy,
        comments_privacy: nextDefaults.comments_privacy,
      }));
    };

    void loadDefaults();
    return () => {
      cancelled = true;
    };
  }, [user?.id]);

  useEffect(() => {
    let cancelled = false;
    const query = form.location_text.trim();
    const sessionToken = locationSessionToken;

    const timer = setTimeout(async () => {
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
          setLocationApiMessage(
            payload.error_message || "Location lookup failed."
          );
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
  }, [form.location_text, locationSessionToken]);

  useEffect(() => {
    let cancelled = false;
    const query = primaryGrapeQuery.trim();
    const shouldSearch =
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
        .map((row) => ({ id: row.id, name: row.name }))
        .filter((row) => !selectedIds.has(row.id));

      setPrimaryGrapeSuggestions(suggestions);
      setIsPrimaryGrapeLoading(false);
    }, 180);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [isPrimaryGrapeFocused, primaryGrapeQuery, selectedPrimaryGrapes]);

  useEffect(() => {
    if (!user?.id) return;
    let cancelled = false;

    const loadFriends = async () => {
      setIsLoadingFriends(true);

      const { data: requests, error: requestsError } = await supabase
        .from("friend_requests")
        .select("id, requester_id, recipient_id, status")
        .eq("status", "accepted")
        .or(`requester_id.eq.${user.id},recipient_id.eq.${user.id}`);

      if (requestsError || cancelled) {
        setIsLoadingFriends(false);
        return;
      }

      const friendIds = Array.from(
        new Set(
          (requests ?? []).map((request) =>
            request.requester_id === user.id ? request.recipient_id : request.requester_id
          )
        )
      );

      if (friendIds.length === 0) {
        if (!cancelled) {
          setUsers([]);
          setIsLoadingFriends(false);
        }
        return;
      }

      const [{ data: profiles }, { data: entries }] = await Promise.all([
        supabase.from("profiles").select("id, display_name, email").in("id", friendIds),
        supabase
          .from("wine_entries")
          .select("tasted_with_user_ids")
          .eq("user_id", user.id)
          .neq("tasted_with_user_ids", "{}"),
      ]);

      if (cancelled) return;

      const tastingCountById = new Map<string, number>();
      (entries ?? []).forEach((entry) => {
        (entry.tasted_with_user_ids ?? []).forEach((id: string) => {
          if (friendIds.includes(id)) {
            tastingCountById.set(id, (tastingCountById.get(id) ?? 0) + 1);
          }
        });
      });

      const friends: FriendUser[] = friendIds.map((id) => {
        const profile = (profiles ?? []).find((item) => item.id === id);
        return {
          id,
          display_name: profile?.display_name ?? null,
          email: profile?.email ?? null,
          tasting_count: tastingCountById.get(id) ?? 0,
        };
      });
      friends.sort((a, b) => b.tasting_count - a.tasting_count);
      setUsers(friends);
      setIsLoadingFriends(false);
    };

    void loadFriends();
    return () => {
      cancelled = true;
    };
  }, [user?.id]);

  const insertEntryWithFallback = async (initialPayload: Record<string, unknown>) => {
    const payload = { ...initialPayload };

    for (let attempt = 0; attempt < 5; attempt += 1) {
      const insertAttempt = await supabase.from("wine_entries").insert(payload).select("id").single();
      if (!insertAttempt.error) {
        return {
          error: null as null | { message: string },
          entryId: insertAttempt.data?.id ?? null,
        };
      }

      const message = insertAttempt.error.message;
      let removed = false;
      const removeIfPresent = (column: string) => {
        if (message.includes(column) && column in payload) {
          delete payload[column];
          removed = true;
        }
      };

      removeIfPresent("classification");
      removeIfPresent("location_place_id");
      removeIfPresent("entry_privacy");
      removeIfPresent("reaction_privacy");
      removeIfPresent("comments_privacy");
      removeIfPresent("comments_scope");
      removeIfPresent("price_paid");
      removeIfPresent("price_paid_currency");
      removeIfPresent("price_paid_source");
      removeIfPresent("qpr_level");
      removeIfPresent("advanced_notes");

      if (!removed) return { error: { message }, entryId: null };
    }

    return { error: { message: "Unable to create entry." }, entryId: null };
  };

  const addPrimaryGrape = (selection: PrimaryGrapeSelection) => {
    setSelectedPrimaryGrapes((current) => {
      if (current.some((item) => item.id === selection.id) || current.length >= 3) {
        return current;
      }
      return [...current, selection];
    });
    setPrimaryGrapeQuery("");
  };

  const removePrimaryGrape = (grapeId: string) => {
    setSelectedPrimaryGrapes((current) => current.filter((item) => item.id !== grapeId));
  };

  const persistPrimaryGrapes = async (entryId: string) => {
    if (selectedPrimaryGrapes.length === 0) {
      return;
    }

    const primaryGrapeRows = selectedPrimaryGrapes.slice(0, 3).map((grape, index) => ({
      entry_id: entryId,
      variety_id: grape.id,
      position: index + 1,
    }));

    const { error } = await supabase.from("entry_primary_grapes").insert(primaryGrapeRows);
    if (error) {
      const message = error.message ?? "";
      if (
        message.includes("entry_primary_grapes") ||
        message.includes("grape_varieties")
      ) {
        return;
      }
    }
  };

  const persistPrimaryGrapesByIds = async (entryId: string, grapeIds: string[]) => {
    if (grapeIds.length === 0) {
      return;
    }

    const primaryGrapeRows = grapeIds.slice(0, 3).map((grapeId, index) => ({
      entry_id: entryId,
      variety_id: grapeId,
      position: index + 1,
    }));

    const { error } = await supabase.from("entry_primary_grapes").insert(primaryGrapeRows);
    if (error) {
      const message = error.message ?? "";
      if (
        message.includes("entry_primary_grapes") ||
        message.includes("grape_varieties")
      ) {
        return;
      }
    }
  };

  const fetchComparisonCandidateForEntry = async (
    currentEntryId: string,
    ownerUserId: string
  ): Promise<SurveyComparisonCandidate | null> => {
    const { count, error: countError } = await supabase
      .from("wine_entries")
      .select("id", { count: "exact", head: true })
      .eq("user_id", ownerUserId)
      .neq("id", currentEntryId);

    if (countError || !count || count <= 0) {
      return null;
    }

    const randomOffset = Math.floor(Math.random() * count);

    const { data: candidate, error: candidateError } = await supabase
      .from("wine_entries")
      .select("id, wine_name, producer, vintage, consumed_at, label_image_path")
      .eq("user_id", ownerUserId)
      .neq("id", currentEntryId)
      .order("created_at", { ascending: false })
      .range(randomOffset, randomOffset)
      .maybeSingle();

    if (candidateError || !candidate) {
      return null;
    }

    const { data: labelPhoto } = await supabase
      .from("entry_photos")
      .select("path")
      .eq("entry_id", candidate.id)
      .eq("type", "label")
      .order("position", { ascending: true })
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();

    const labelPath = labelPhoto?.path ?? candidate.label_image_path ?? null;
    let labelImageUrl: string | null = null;
    if (labelPath) {
      const { data: signedUrl, error: signedUrlError } = await supabase.storage
        .from("wine-photos")
        .createSignedUrl(labelPath, 60 * 60);
      labelImageUrl = signedUrlError ? null : signedUrl.signedUrl;
    }

    return {
      id: candidate.id,
      wine_name: candidate.wine_name,
      producer: candidate.producer,
      vintage: candidate.vintage,
      consumed_at: candidate.consumed_at,
      label_image_url: labelImageUrl,
    };
  };

  const completePostSaveFlow = () => {
    setPendingPostSaveSurvey(null);
    setSavedSurveyAnswers(null);
    setPostSaveSurveyStep("survey");
    router.replace("/(app)/entries");
  };

  const skipPostSaveComparison = () => {
    if (!pendingPostSaveSurvey) {
      return;
    }
    completePostSaveFlow();
  };

  const submitPostSaveSurvey = async () => {
    if (!user || !pendingPostSaveSurvey || isSubmittingSurvey) {
      return;
    }

    if (!surveyHowWasIt || !surveyExpectations || !surveyDrinkAgain) {
      setSurveyErrorMessage("Please answer all 3 required questions.");
      return;
    }

    setSurveyErrorMessage(null);
    setIsSubmittingSurvey(true);

    try {
      const answers: PostSaveSurveyAnswers = {
        how_was_it: surveyHowWasIt,
        expectations: surveyExpectations,
        drink_again: surveyDrinkAgain,
      };

      const { error: surveySaveError } = await supabase
        .from("wine_entries")
        .update({
          survey_how_was_it: answers.how_was_it,
          survey_expectation_match: answers.expectations,
          survey_drink_again: answers.drink_again,
        })
        .eq("id", pendingPostSaveSurvey.entryId)
        .eq("user_id", user.id);

      if (surveySaveError) {
        const message = surveySaveError.message ?? "Unable to save survey.";
        if (
          message.includes("survey_how_was_it") ||
          message.includes("survey_expectation_match") ||
          message.includes("survey_drink_again")
        ) {
          setSurveyErrorMessage(
            "Entry survey is temporarily unavailable. Please try again later."
          );
        } else {
          setSurveyErrorMessage(message);
        }
        setIsSubmittingSurvey(false);
        return;
      }

      if (pendingPostSaveSurvey.candidate) {
        setSavedSurveyAnswers(answers);
        setPostSaveSurveyStep("comparison");
        setIsSubmittingSurvey(false);
        return;
      }

      setIsSubmittingSurvey(false);
      completePostSaveFlow();
    } catch {
      setSurveyErrorMessage("Unable to save survey. Check your connection and try again.");
      setIsSubmittingSurvey(false);
    }
  };

  const submitPostSaveComparison = async (response: ComparisonResponse) => {
    if (
      !user ||
      !pendingPostSaveSurvey ||
      !pendingPostSaveSurvey.candidate ||
      !savedSurveyAnswers ||
      isSubmittingSurvey
    ) {
      return;
    }

    setSurveyErrorMessage(null);
    setIsSubmittingSurvey(true);

    try {
      const { error: comparisonError } = await supabase
        .from("entry_comparison_feedback")
        .insert({
          user_id: user.id,
          new_entry_id: pendingPostSaveSurvey.entryId,
          comparison_entry_id: pendingPostSaveSurvey.candidate.id,
          response,
        });

      if (comparisonError && comparisonError.code !== "23505") {
        const message = comparisonError.message ?? "Unable to save comparison.";
        if (
          message.includes("entry_comparison_feedback") ||
          message.includes("entry_comparison_response")
        ) {
          setSurveyErrorMessage(
            "Wine comparison is temporarily unavailable. Please try again later."
          );
        } else {
          setSurveyErrorMessage(message);
        }
        setIsSubmittingSurvey(false);
        return;
      }

      setIsSubmittingSurvey(false);
      completePostSaveFlow();
    } catch {
      setSurveyErrorMessage("Unable to save comparison. Check your connection and try again.");
      setIsSubmittingSurvey(false);
    }
  };

  const resolveSuggestedGrapes = async (suggestions: string[]) => {
    const resolved: PrimaryGrapeSelection[] = [];
    const seenIds = new Set<string>();

    for (const suggestion of suggestions) {
      const { data, error } = await supabase
        .from("grape_varieties")
        .select("id, name")
        .ilike("name", `%${suggestion}%`)
        .order("name", { ascending: true })
        .limit(6);

      if (error) {
        continue;
      }

      const options = (data ?? []).map((row) => ({ id: row.id, name: row.name }));
      if (options.length === 0) {
        continue;
      }

      const normalizedSuggestion = normalizeGrapeLookupValue(suggestion);
      const exact =
        options.find(
          (option) => normalizeGrapeLookupValue(option.name) === normalizedSuggestion
        ) ?? options[0];

      if (!exact || seenIds.has(exact.id)) {
        continue;
      }

      seenIds.add(exact.id);
      resolved.push(exact);

      if (resolved.length >= 3) {
        break;
      }
    }

    return resolved;
  };

  const applyLabelAutofill = async (payload: LabelAutofillResponse) => {
    const normalizeText = (value?: string | null) => {
      if (typeof value !== "string") {
        return "";
      }
      const trimmed = value.trim();
      return trimmed.length > 0 ? trimmed : "";
    };

    setForm((current) => ({
      ...current,
      wine_name: current.wine_name || normalizeText(payload.wine_name),
      producer: current.producer || normalizeText(payload.producer),
      vintage: current.vintage || normalizeText(payload.vintage),
      country: current.country || normalizeText(payload.country),
      region: current.region || normalizeText(payload.region),
      appellation: current.appellation || normalizeText(payload.appellation),
      classification: current.classification || normalizeText(payload.classification),
    }));

    if (selectedPrimaryGrapes.length > 0) {
      return false;
    }

    const suggestions = Array.isArray(payload.primary_grape_suggestions)
      ? payload.primary_grape_suggestions
          .map((value) => value.trim())
          .filter((value) => value.length > 0)
      : [];
    if (suggestions.length === 0) {
      return false;
    }

    const seenSuggestions = new Set<string>();
    const uniqueSuggestions = suggestions
      .filter((suggestion) => {
        const key = suggestion.toLowerCase();
        if (seenSuggestions.has(key)) {
          return false;
        }
        seenSuggestions.add(key);
        return true;
      })
      .slice(0, 3);

    const shouldApplyMultiple =
      typeof payload.primary_grape_confidence === "number" &&
      payload.primary_grape_confidence >= 0.9 &&
      uniqueSuggestions.length <= 2;
    const suggestionsToApply = shouldApplyMultiple
      ? uniqueSuggestions
      : uniqueSuggestions.slice(0, 1);

    const resolved = await resolveSuggestedGrapes(suggestionsToApply);
    if (resolved.length === 0) {
      return false;
    }

    setSelectedPrimaryGrapes((current) => {
      if (current.length > 0) {
        return current;
      }
      return resolved;
    });
    return true;
  };

  const applyLineupAutofill = async (wine: LineupWine) => {
    const normalizeText = (value?: string | null) => {
      if (typeof value !== "string") {
        return "";
      }
      const trimmed = value.trim();
      return trimmed.length > 0 ? trimmed : "";
    };

    setForm((current) => ({
      ...current,
      wine_name: current.wine_name || normalizeText(wine.wine_name),
      producer: current.producer || normalizeText(wine.producer),
      vintage: current.vintage || normalizeText(wine.vintage),
      country: current.country || normalizeText(wine.country),
      region: current.region || normalizeText(wine.region),
      appellation: current.appellation || normalizeText(wine.appellation),
      classification: current.classification || normalizeText(wine.classification),
    }));

    if (selectedPrimaryGrapes.length > 0) {
      return false;
    }

    const suggestions = Array.isArray(wine.primary_grape_suggestions)
      ? wine.primary_grape_suggestions
          .map((value) => value.trim())
          .filter((value) => value.length > 0)
          .slice(0, 2)
      : [];
    if (suggestions.length === 0) {
      return false;
    }

    const resolved = await resolveSuggestedGrapes(suggestions);
    if (resolved.length === 0) {
      return false;
    }

    setSelectedPrimaryGrapes((current) => {
      if (current.length > 0) {
        return current;
      }
      return resolved;
    });

    return true;
  };

  const updateUploadPhotoType = (photoId: string, nextType: UploadPhotoType) => {
    setUploadPhotos((current) =>
      current.map((photo) =>
        photo.id === photoId ? { ...photo, type: nextType } : photo
      )
    );
  };

  const removeUploadPhoto = (photoId: string) => {
    const wasLastPhoto =
      uploadPhotos.length === 1 && uploadPhotos[0]?.id === photoId;
    setLineupWines([]);
    setBulkCreateMessage(null);
    setUploadPhotos((current) => {
      const next = current.filter((photo) => photo.id !== photoId);
      if (next.length === 0) return next;
      if (next.some((photo) => photo.type === "label")) {
        return next;
      }
      return next.map((photo, index) =>
        index === 0 ? { ...photo, type: "label" } : photo
      );
    });
    if (wasLastPhoto) {
      setUploadAnalysisStatus("idle");
      setUploadMessage(null);
      setUploadGalleryActiveIndex(0);
    }
  };

  useEffect(() => {
    const maxIndex = Math.max(0, uploadPhotos.length - 1);
    if (uploadGalleryActiveIndex > maxIndex) {
      setUploadGalleryActiveIndex(maxIndex);
    }
  }, [uploadGalleryActiveIndex, uploadPhotos.length]);

  const scrollToUploadPhotoIndex = (index: number, animated = true) => {
    if (!uploadGalleryScrollRef.current || uploadGalleryFrameWidth <= 0) {
      return;
    }
    const maxIndex = Math.max(0, uploadPhotos.length - 1);
    const nextIndex = Math.max(0, Math.min(maxIndex, index));
    setUploadGalleryActiveIndex(nextIndex);
    uploadGalleryScrollRef.current.scrollTo({
      x: nextIndex * uploadGalleryFrameWidth,
      animated,
    });
  };

  const requestLabelAutofill = async (photo: UploadPhotoItem, accessToken: string) => {
    if (!WEB_API_BASE_URL) {
      return {
        payload: null as LabelAutofillResponse | null,
        errorMessage:
          "Set EXPO_PUBLIC_WEB_API_BASE_URL to enable label autofill and auto-tagging.",
      };
    }

    const formData = new FormData();
    formData.append(
      "label",
      {
        uri: photo.uri,
        name: photo.name,
        type: photo.mimeType,
      } as unknown as Blob
    );

    const response = await fetch(
      `${WEB_API_BASE_URL.replace(/\/$/, "")}/api/label-autofill`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
        body: formData,
      }
    );
    const payload = (await response.json().catch(() => ({}))) as LabelAutofillResponse;

    if (!response.ok) {
      if (response.status === 401) {
        return {
          payload: null as LabelAutofillResponse | null,
          errorMessage: "Session expired. Sign in again to use AI photo analysis.",
        };
      }
      return {
        payload: null as LabelAutofillResponse | null,
        errorMessage:
          normalizeAnalysisErrorMessage(payload.error) ||
          "Could not read this label. Try a clearer photo.",
      };
    }

    return { payload, errorMessage: null as string | null };
  };

  const requestPhotoContext = async (photo: UploadPhotoItem, accessToken: string) => {
    if (!WEB_API_BASE_URL) {
      return {
        tag: "unknown" as ContextPhotoTag,
        confidence: null as number | null,
      };
    }

    const formData = new FormData();
    formData.append(
      "photo",
      {
        uri: photo.uri,
        name: photo.name,
        type: photo.mimeType,
      } as unknown as Blob
    );

    const response = await fetch(
      `${WEB_API_BASE_URL.replace(/\/$/, "")}/api/photo-context`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
        body: formData,
      }
    );

    if (!response.ok) {
      if (response.status === 401) {
        throw new Error("Session expired. Sign in again to use AI photo analysis.");
      }
      return {
        tag: "unknown" as ContextPhotoTag,
        confidence: null as number | null,
      };
    }

    const payload = (await response.json().catch(() => ({}))) as PhotoContextResponse;
    return {
      tag: normalizeContextTag(payload.tag),
      confidence: normalizeConfidence(payload.confidence),
    };
  };

  const requestLineupAutofill = async (
    photo: UploadPhotoItem,
    accessToken: string
  ) => {
    if (!WEB_API_BASE_URL) {
      return {
        wines: [] as LineupWine[],
        errorMessage: null as string | null,
      };
    }

    const formData = new FormData();
    formData.append(
      "photo",
      {
        uri: photo.uri,
        name: photo.name,
        type: photo.mimeType,
      } as unknown as Blob
    );

    const response = await fetch(
      `${WEB_API_BASE_URL.replace(/\/$/, "")}/api/lineup-autofill`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
        body: formData,
      }
    );

    if (!response.ok) {
      if (response.status === 401) {
        throw new Error("Session expired. Sign in again to use AI bulk scan.");
      }
      const payload = (await response.json().catch(() => ({}))) as LineupAutofillResponse;
      return {
        wines: [] as LineupWine[],
        errorMessage:
          normalizeAnalysisErrorMessage(payload.error) ||
          "Could not analyze one of the lineup photos.",
      };
    }

    const payload = (await response.json().catch(() => ({}))) as LineupAutofillResponse;
    const normalizedWines = (Array.isArray(payload.wines) ? payload.wines : [])
      .map((wine, index) => {
        const normalized = {
          wine_name: normalizeLineupText(wine.wine_name),
          producer: normalizeLineupText(wine.producer),
          vintage: normalizeLineupText(wine.vintage),
          country: normalizeLineupText(wine.country),
          region: normalizeLineupText(wine.region),
          appellation: normalizeLineupText(wine.appellation),
          classification: normalizeLineupText(wine.classification),
          primary_grape_suggestions: Array.isArray(wine.primary_grape_suggestions)
            ? wine.primary_grape_suggestions
                .map((value) => value.trim())
                .filter((value) => value.length > 0)
                .slice(0, 3)
            : [],
          confidence: normalizeConfidence(wine.confidence),
        };
        return {
          ...normalized,
          id: `${photo.id}-lineup-${index}`,
          photoIndex: 0,
          included: true,
        } satisfies LineupWine;
      })
      .filter((wine) => hasLineupWineDetails(wine));

    return {
      wines: normalizedWines,
      errorMessage: null as string | null,
    };
  };

  const toggleLineupWineIncluded = (wineId: string) => {
    setLineupWines((current) =>
      current.map((wine) =>
        wine.id === wineId ? { ...wine, included: !wine.included } : wine
      )
    );
  };

  const cancelBulkLineup = () => {
    setLineupWines([]);
    setBulkCreateMessage(null);
    setUploadMessage("Bulk scan canceled. Continue with single entry details.");
  };

  const uploadPhotoToEntry = async ({
    entryId,
    ownerUserId,
    photo,
    position,
  }: {
    entryId: string;
    ownerUserId: string;
    photo: UploadPhotoItem;
    position: number;
  }) => {
    let createdPhotoId: string | null = null;
    let uploadedPath: string | null = null;

    try {
      const createResult = await supabase
        .from("entry_photos")
        .insert({
          entry_id: entryId,
          type: photo.type,
          path: "pending",
          position,
        })
        .select("id")
        .single();

      if (createResult.error || !createResult.data?.id) {
        throw new Error(createResult.error?.message ?? "Unable to create photo record.");
      }

      createdPhotoId = createResult.data.id;
      const extension = extensionForMimeType(photo.mimeType);
      uploadedPath = `${ownerUserId}/${entryId}/${photo.type}/${createdPhotoId}.${extension}`;

      const updateResult = await supabase
        .from("entry_photos")
        .update({ path: uploadedPath })
        .eq("id", createdPhotoId)
        .eq("entry_id", entryId);

      if (updateResult.error) {
        throw new Error(updateResult.error.message);
      }

      const fileResponse = await fetch(photo.uri);
      if (!fileResponse.ok) {
        throw new Error("Unable to read selected photo.");
      }
      const fileBlob = await fileResponse.blob();

      const uploadResult = await supabase.storage
        .from("wine-photos")
        .upload(uploadedPath, fileBlob, {
          upsert: true,
          contentType: photo.mimeType,
        });

      if (uploadResult.error) {
        throw new Error(uploadResult.error.message);
      }
    } catch (error) {
      if (uploadedPath) {
        await supabase.storage.from("wine-photos").remove([uploadedPath]);
      }
      if (createdPhotoId) {
        await supabase
          .from("entry_photos")
          .delete()
          .eq("id", createdPhotoId)
          .eq("entry_id", entryId);
      }
      throw error;
    }
  };

  const uploadPhotosToEntry = async (entryId: string, ownerUserId: string) => {
    if (uploadPhotos.length === 0) {
      return;
    }

    const typeCount = new Map<UploadPhotoType, number>();
    for (const photo of uploadPhotos) {
      const count = (typeCount.get(photo.type) ?? 0) + 1;
      typeCount.set(photo.type, count);
      if (count > MAX_PHOTOS_PER_TYPE) {
        throw new Error(`Max ${MAX_PHOTOS_PER_TYPE} photos allowed for ${PHOTO_TYPE_LABELS[photo.type]}.`);
      }
    }

    const positionByType = new Map<UploadPhotoType, number>();
    for (const photo of uploadPhotos) {
      const position = positionByType.get(photo.type) ?? 0;
      await uploadPhotoToEntry({
        entryId,
        ownerUserId,
        photo,
        position,
      });
      positionByType.set(photo.type, position + 1);
    }
  };

  const uploadSpecificPhotosToEntry = async (
    entryId: string,
    ownerUserId: string,
    photosToUpload: UploadPhotoItem[]
  ) => {
    if (photosToUpload.length === 0) {
      return;
    }

    const typeCount = new Map<UploadPhotoType, number>();
    for (const photo of photosToUpload) {
      const count = (typeCount.get(photo.type) ?? 0) + 1;
      typeCount.set(photo.type, count);
      if (count > MAX_PHOTOS_PER_TYPE) {
        throw new Error(`Max ${MAX_PHOTOS_PER_TYPE} photos allowed for ${PHOTO_TYPE_LABELS[photo.type]}.`);
      }
    }

    const positionByType = new Map<UploadPhotoType, number>();
    for (const photo of photosToUpload) {
      const position = positionByType.get(photo.type) ?? 0;
      await uploadPhotoToEntry({
        entryId,
        ownerUserId,
        photo,
        position,
      });
      positionByType.set(photo.type, position + 1);
    }
  };

  const runPhotoAnalysis = async ({
    analysisPhotos,
    labelTarget,
    accessToken,
  }: {
    analysisPhotos: UploadPhotoItem[];
    labelTarget: UploadPhotoItem | null;
    accessToken: string;
  }) => {
    const shouldRunLabelAutofill = analysisPhotos.length === 1;
    const contextTargets = analysisPhotos.filter(
      (photo) => !labelTarget || photo.id !== labelTarget.id
    );

    try {
      const [labelResult, contextResults, lineupResults] = await Promise.all([
        shouldRunLabelAutofill && labelTarget
          ? requestLabelAutofill(labelTarget, accessToken)
          : Promise.resolve({
              payload: null as LabelAutofillResponse | null,
              errorMessage: null as string | null,
            }),
        Promise.all(
          contextTargets.map(async (photo) => {
            const context = await requestPhotoContext(photo, accessToken);
            return {
              id: photo.id,
              type: mapContextTagToPhotoType(context.tag),
              confidence: context.confidence,
            };
          })
        ),
        Promise.all(
          analysisPhotos.map(async (photo, photoIndex) => {
            const lineup = await requestLineupAutofill(photo, accessToken);
            return {
              photoIndex,
              ...lineup,
            };
          })
        ),
      ]);

      const taggedById = new Map(
        contextResults.map((result) => [
          result.id,
          { type: result.type, confidence: result.confidence },
        ])
      );

      setUploadPhotos((current) =>
        current.map((photo) => {
          if (shouldRunLabelAutofill && labelTarget && photo.id === labelTarget.id) {
            return {
              ...photo,
              type: "label",
            };
          }
          const tagged = taggedById.get(photo.id);
          if (!tagged) {
            return photo;
          }
          return {
            ...photo,
            type: tagged.type,
            contextConfidence: tagged.confidence,
          };
        })
      );

      let grapesFilled = false;
      if (labelResult.payload) {
        grapesFilled = await applyLabelAutofill(labelResult.payload);
      }

      const lineupErrors = lineupResults
        .map((result) => result.errorMessage)
        .filter((message): message is string => Boolean(message));
      const detectedLineupWines = lineupResults.flatMap((result) =>
        result.wines.map((wine, wineIndex) => ({
          ...wine,
          id: `${wine.id}-${result.photoIndex}-${wineIndex}`,
          photoIndex: result.photoIndex,
          included: true,
        }))
      );
      if (detectedLineupWines.length > 1) {
        setLineupWines(detectedLineupWines);
        setBulkCreateMessage(
          `Detected ${detectedLineupWines.length} bottles. Review and create entries below.`
        );
      } else {
        setLineupWines([]);
        setBulkCreateMessage(null);
      }

      const singleDetectedWine =
        detectedLineupWines.length === 1 ? detectedLineupWines[0] : null;
      const canFallbackToLineup =
        !labelResult.payload && Boolean(singleDetectedWine) && lineupErrors.length === 0;
      if (canFallbackToLineup && singleDetectedWine) {
        grapesFilled = (await applyLineupAutofill(singleDetectedWine)) || grapesFilled;
      }

      const analysisErrors = [
        !canFallbackToLineup && labelResult.errorMessage
          ? normalizeAnalysisErrorMessage(labelResult.errorMessage)
          : null,
        ...lineupErrors.map((message) => normalizeAnalysisErrorMessage(message)),
      ].filter((message): message is string => Boolean(message));

      if (analysisErrors.length > 0) {
        setUploadAnalysisStatus("error");
        setUploadMessage(analysisErrors[0]);
      } else {
        setUploadAnalysisStatus("success");
        const warningCount = Array.isArray(labelResult.payload?.warnings)
          ? labelResult.payload?.warnings.length ?? 0
          : 0;
        const warningLabel =
          warningCount > 0
            ? `${warningCount} field${warningCount > 1 ? "s" : ""} uncertain`
            : null;
        const overallConfidence = computeOverallConfidence([
          labelResult.payload?.confidence ?? null,
          ...contextResults.map((result) => result.confidence),
        ]);
        const confidenceLabel =
          typeof overallConfidence === "number"
            ? `Confidence ${Math.round(overallConfidence * 100)}%`
            : null;
        const successSummary = [confidenceLabel, warningLabel]
          .filter(Boolean)
          .join(" • ");
        if (detectedLineupWines.length > 1) {
          setUploadMessage(
            `Detected ${detectedLineupWines.length} bottles. Review and create entries below.`
          );
        } else {
          setUploadMessage(
            successSummary ||
              (grapesFilled
                ? "Autofill complete. Review the details."
                : "Autofill complete. Review and adjust as needed.")
          );
        }
      }
    } catch (error) {
      setUploadAnalysisStatus("error");
      if (error instanceof Error && error.message) {
        setUploadMessage(error.message);
      } else {
        setUploadMessage("Unable to analyze photos. Check your connection and try again.");
      }
    } finally {
      setIsAutofillLoading(false);
    }
  };

  const pickLabelImage = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      setUploadMessage("Allow photo access to upload and tag photos.");
      return;
    }

    const existingPhotos = uploadPhotos;
    const remainingSlots = Math.max(0, MAX_TOTAL_UPLOAD_PHOTOS - existingPhotos.length);
    if (remainingSlots <= 0) {
      setUploadMessage(`You can upload up to ${MAX_TOTAL_UPLOAD_PHOTOS} photos.`);
      return;
    }

    const pickerOptions: ImagePicker.ImagePickerOptions = {
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsMultipleSelection: true,
      selectionLimit: remainingSlots,
      orderedSelection: true,
      quality: 0.85,
    };
    if (Platform.OS === "ios") {
      pickerOptions.preferredAssetRepresentationMode =
        ImagePicker.UIImagePickerPreferredAssetRepresentationMode.Compatible;
    }
    const result = await ImagePicker.launchImageLibraryAsync(pickerOptions);
    if (result.canceled) {
      return;
    }

    const assets = result.assets
      .filter((asset) => typeof asset.uri === "string")
      .slice(0, remainingSlots);
    if (assets.length === 0) {
      setUploadMessage("No photos selected.");
      return;
    }

    const createdAt = Date.now();
    const hasLabelAlready = existingPhotos.some((photo) => photo.type === "label");
    const initialPhotos: UploadPhotoItem[] = assets.map((asset, index) => {
      const mimeType = ensurePhotoMimeType(asset.mimeType);
      const extension = extensionForMimeType(mimeType);
      const name =
        asset.fileName && asset.fileName.trim().length > 0
          ? asset.fileName
          : `entry-photo-${createdAt}-${index + 1}.${extension}`;

      return {
        id: `${createdAt}-${index}-${Math.random().toString(36).slice(2, 8)}`,
        uri: asset.uri,
        name,
        mimeType,
        type: !hasLabelAlready && index === 0 ? "label" : "other_bottles",
        contextConfidence: null,
      };
    });

    setUploadPhotos([...existingPhotos, ...initialPhotos]);

    const photosForAnalysis = [...existingPhotos, ...initialPhotos];
    const labelTarget =
      photosForAnalysis.find((photo) => photo.type === "label") ??
      photosForAnalysis[0] ??
      null;
    const totalForRun = initialPhotos.length;

    setUploadAnalysisStatus("loading");
    setIsAutofillLoading(true);
    setLineupWines([]);
    setBulkCreateMessage(null);
    setUploadMessage(
      totalForRun === 1
        ? "Extracting wine details. Please allow more time for larger lineups."
        : `Extracting wine details from ${totalForRun} photos. Please allow more time for larger lineups.`
    );

    if (!WEB_API_BASE_URL) {
      setUploadAnalysisStatus("error");
      setIsAutofillLoading(false);
      setUploadMessage(
        `Added ${initialPhotos.length} photo${
          initialPhotos.length === 1 ? "" : "s"
        }. Set EXPO_PUBLIC_WEB_API_BASE_URL to enable AI autofill and auto-tagging.`
      );
      return;
    }

    const accessToken = await getAccessTokenForApi();
    if (!accessToken) {
      setUploadAnalysisStatus("error");
      setIsAutofillLoading(false);
      setUploadMessage(
        `Added ${initialPhotos.length} photo${
          initialPhotos.length === 1 ? "" : "s"
        }. Sign in again to run AI autofill and auto-tagging.`
      );
      return;
    }

    await runPhotoAnalysis({
      analysisPhotos: photosForAnalysis,
      labelTarget,
      accessToken,
    });
  };

  const retryPhotoAnalysis = async () => {
    if (uploadPhotos.length === 0) {
      setUploadMessage("Upload photos first.");
      return;
    }
    if (!WEB_API_BASE_URL) {
      setUploadAnalysisStatus("error");
      setUploadMessage(
        "Set EXPO_PUBLIC_WEB_API_BASE_URL to enable AI autofill and auto-tagging."
      );
      return;
    }

    const accessToken = await getAccessTokenForApi();
    if (!accessToken) {
      setUploadAnalysisStatus("error");
      setUploadMessage("Session expired. Sign in again to retry analysis.");
      return;
    }

    setUploadAnalysisStatus("loading");
    setIsAutofillLoading(true);
    setLineupWines([]);
    setBulkCreateMessage(null);
    setUploadMessage(
      uploadPhotos.length === 1
        ? "Extracting wine details. Please allow more time for larger lineups."
        : `Extracting wine details from ${uploadPhotos.length} photos. Please allow more time for larger lineups.`
    );

    const labelTarget =
      uploadPhotos.find((photo) => photo.type === "label") ??
      uploadPhotos[0] ??
      null;
    await runPhotoAnalysis({
      analysisPhotos: uploadPhotos,
      labelTarget,
      accessToken,
    });
  };

  const createBulkEntriesFromLineup = async () => {
    if (!user) {
      setErrorMessage("You must be signed in.");
      return;
    }
    const selected = lineupWines.filter((wine) => wine.included);
    if (selected.length === 0) {
      setBulkCreateMessage("Select at least one detected bottle first.");
      return;
    }

    const included = selected.filter(hasLineupWineDetails);
    if (included.length === 0) {
      setBulkCreateMessage(
        "Selected bottles have no readable label details. Uncheck unknown bottles or retry with a clearer photo."
      );
      return;
    }
    if (uploadPhotos.length === 0) {
      setBulkCreateMessage("Upload photos before creating bulk entries.");
      return;
    }

    setIsBulkCreating(true);
    setBulkCreateMessage("Resolving grape varieties...");
    setErrorMessage(null);

    const accessToken = await getAccessTokenForApi();
    const normalizedBaseUrl = WEB_API_BASE_URL?.replace(/\/$/, "") ?? null;

    const grapeLookupCache = new Map<string, PrimaryGrapeSelection[]>();
    const resolveSuggestedGrapesCached = async (suggestions: string[]) => {
      const normalizedKey = suggestions
        .map(normalizeGrapeLookupValue)
        .filter((v) => v.length > 0)
        .slice(0, 2)
        .join("|");
      if (!normalizedKey) return [] as PrimaryGrapeSelection[];
      const cached = grapeLookupCache.get(normalizedKey);
      if (cached) return cached;
      const resolved = await resolveSuggestedGrapes(suggestions.slice(0, 2));
      grapeLookupCache.set(normalizedKey, resolved);
      return resolved;
    };

    const grapeIdsByIndex = new Map<number, string[]>();
    await Promise.all(
      included.map(async (wine, i) => {
        const suggestions = wine.primary_grape_suggestions ?? [];
        if (suggestions.length > 0) {
          const resolved = await resolveSuggestedGrapesCached(suggestions);
          if (resolved.length > 0) {
            grapeIdsByIndex.set(i, resolved.map((g) => g.id));
          }
        }
      })
    );

    setBulkCreateMessage(`Creating entries... (0/${included.length} started)`);

    const ratingValue =
      form.rating.trim().length > 0 ? Number(form.rating.trim()) : null;
    const numericRating =
      typeof ratingValue === "number" && Number.isFinite(ratingValue)
        ? Math.max(1, Math.min(100, Math.round(ratingValue)))
        : null;

    let started = 0;
    let fatalCreationError: string | null = null;

    type BulkCreationResult = {
      entryId: string | null;
      errorMessage: string | null;
    };

    const creationTasks = included.map(
      (wine, i) =>
        async (): Promise<BulkCreationResult> => {
          if (fatalCreationError) {
            return { entryId: null, errorMessage: fatalCreationError };
          }
          try {
            const primaryGrapeIds = grapeIdsByIndex.get(i) ?? [];

            const defaultWineName =
              wine.wine_name ??
              wine.producer ??
              wine.appellation ??
              wine.region ??
              wine.primary_grape_suggestions?.[0] ??
              "Unknown wine";

            let entryId: string | null = null;

            const createEntryViaSupabase = async () => {
              const fallbackPayload: Record<string, unknown> = {
                user_id: user.id,
                wine_name: defaultWineName,
                producer: wine.producer,
                vintage: wine.vintage,
                country: wine.country,
                region: wine.region,
                appellation: wine.appellation,
                classification: wine.classification,
                notes: form.notes.trim().length > 0 ? form.notes.trim() : null,
                location_text:
                  form.location_text.trim().length > 0 ? form.location_text.trim() : null,
                location_place_id:
                  form.location_place_id.trim().length > 0
                    ? form.location_place_id.trim()
                    : null,
                consumed_at: form.consumed_at || defaultConsumedDate,
                tasted_with_user_ids: selectedUserIds,
                entry_privacy: form.entry_privacy,
                reaction_privacy: form.reaction_privacy,
                comments_privacy: form.comments_privacy,
              };
              if (numericRating !== null) {
                fallbackPayload.rating = numericRating;
              }

              const createResult = await insertEntryWithFallback(fallbackPayload);
              if (createResult.error || !createResult.entryId) {
                throw new Error(createResult.error?.message ?? "Unable to create a bulk entry.");
              }
              const createdEntryId = createResult.entryId;
              await persistPrimaryGrapesByIds(createdEntryId, primaryGrapeIds);
              return createdEntryId;
            };

            if (normalizedBaseUrl && accessToken) {
              try {
                const response = await fetch(`${normalizedBaseUrl}/api/entries`, {
                  method: "POST",
                  headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${accessToken}`,
                  },
                  body: JSON.stringify({
                    wine_name: defaultWineName,
                    producer: wine.producer,
                    vintage: wine.vintage,
                    country: wine.country,
                    region: wine.region,
                    appellation: wine.appellation,
                    classification: wine.classification,
                    primary_grape_ids: primaryGrapeIds,
                    rating: numericRating,
                    notes: form.notes.trim().length > 0 ? form.notes.trim() : null,
                    location_text:
                      form.location_text.trim().length > 0 ? form.location_text.trim() : null,
                    location_place_id:
                      form.location_place_id.trim().length > 0
                        ? form.location_place_id.trim()
                        : null,
                    consumed_at: form.consumed_at || defaultConsumedDate,
                    tasted_with_user_ids: selectedUserIds,
                    entry_privacy: form.entry_privacy,
                    reaction_privacy: form.reaction_privacy,
                    comments_privacy: form.comments_privacy,
                    is_feed_visible: false,
                    skip_comparison_candidate: true,
                  }),
                });

                const payload = (await response.json().catch(() => ({}))) as {
                  entry?: { id?: string };
                  error?: string;
                };
                if (!response.ok) {
                  if (response.status === 401) {
                    throw new Error("Session expired. Sign in again to use bulk entry.");
                  }
                  if (response.status >= 500) {
                    entryId = await createEntryViaSupabase();
                  } else {
                    throw new Error(payload.error || "Unable to create a bulk entry.");
                  }
                } else {
                  entryId = payload.entry?.id ?? null;
                  if (!entryId) {
                    throw new Error("Bulk entry creation succeeded but no entry ID returned.");
                  }
                }
              } catch (error) {
                if (isNetworkFailureError(error)) {
                  entryId = await createEntryViaSupabase();
                } else {
                  throw error;
                }
              }
            } else {
              entryId = await createEntryViaSupabase();
            }

            if (!entryId) {
              throw new Error("Unable to create a bulk entry.");
            }

            started += 1;
            setBulkCreateMessage(
              started < included.length
                ? `Creating entries... (${started}/${included.length} started)`
                : "All entries started. Finishing photo uploads..."
            );

            const labelSourcePhoto =
              uploadPhotos[wine.photoIndex] ??
              uploadPhotos.find((photo) => photo.type === "label") ??
              uploadPhotos[0];
            if (!labelSourcePhoto) {
              throw new Error("No source photo available for this bottle.");
            }
            const contextSourcePhotos = uploadPhotos.filter(
              (photo) => photo.id !== labelSourcePhoto?.id
            );
            const photosForEntry: UploadPhotoItem[] = [
              { ...labelSourcePhoto, type: "label" },
              ...contextSourcePhotos.map((photo) => ({
                ...photo,
                type: (photo.type === "label" ? "lineup" : photo.type) as UploadPhotoType,
              })),
            ];
            try {
              await uploadSpecificPhotosToEntry(entryId, user.id, photosForEntry);
            } catch (uploadError) {
              try {
                await supabase
                  .from("wine_entries")
                  .delete()
                  .eq("id", entryId)
                  .eq("user_id", user.id);
              } catch {
                // Rollback failed; entry remains as partial record.
              }
              const uploadMessage =
                uploadError instanceof Error ? uploadError.message : "Photo upload failed.";
              return { entryId: null, errorMessage: uploadMessage };
            }

            return { entryId, errorMessage: null };
          } catch (error) {
            const message =
              error instanceof Error ? error.message : "Bulk entry creation failed.";
            fatalCreationError =
              fatalCreationError ?? (message.includes("Session expired") ? message : null);
            return { entryId: null, errorMessage: message };
          }
        }
    );

    const creationResults = await runWithConcurrency(
      creationTasks,
      BULK_CREATE_CONCURRENCY
    );

    setIsBulkCreating(false);

    const createdEntryIds = creationResults
      .map((result) => result.entryId)
      .filter((id): id is string => typeof id === "string" && id.length > 0);
    const failedCount = creationResults.length - createdEntryIds.length;
    const firstFailureMessage =
      creationResults.find(
        (result) => result.entryId === null && Boolean(result.errorMessage)
      )?.errorMessage ?? null;
    const lowConfidenceCount = included.filter(
      (wine) =>
        typeof wine.confidence === "number" &&
        Number.isFinite(wine.confidence) &&
        wine.confidence < 0.72
    ).length;
    const uncertaintyNotes: string[] = [];
    if (lowConfidenceCount > 0) {
      uncertaintyNotes.push(
        `${lowConfidenceCount} bottle${lowConfidenceCount === 1 ? "" : "s"} had low confidence`
      );
    }
    const uncertaintySuffix =
      uncertaintyNotes.length > 0 ? ` Flagged: ${uncertaintyNotes.join(" \u2022 ")}.` : "";

    if (createdEntryIds.length > 0) {
      const queue = encodeURIComponent(createdEntryIds.join(","));
      const successMessage =
        failedCount > 0
          ? `Created ${createdEntryIds.length} entr${
              createdEntryIds.length === 1 ? "y" : "ies"
            }. ${failedCount} could not be created.${
              firstFailureMessage ? ` First issue: ${firstFailureMessage}` : ""
            }${uncertaintySuffix} Opening guided review...`
          : `Created ${createdEntryIds.length} entr${
              createdEntryIds.length === 1 ? "y" : "ies"
            }!${uncertaintySuffix} Opening guided review...`;
      setBulkCreateMessage(successMessage);
      setUploadMessage(successMessage);
      router.push(
        `/(app)/entries/${createdEntryIds[0]}?bulk=1&queue=${queue}&index=0`
      );
    } else {
      setBulkCreateMessage(
        firstFailureMessage
          ? `Failed to create entries. ${firstFailureMessage}`
          : "Failed to create entries. Try again."
      );
    }
  };

  const submit = async () => {
    if (!user) {
      setErrorMessage("You must be signed in.");
      return;
    }

    const parsed = createEntryInputSchema.safeParse({
      wine_name: form.wine_name,
      producer: form.producer,
      vintage: form.vintage,
      country: form.country,
      region: form.region,
      appellation: form.appellation,
      classification: form.classification,
      rating: form.rating,
      price_paid: form.price_paid,
      price_paid_currency:
        form.price_paid.trim().length > 0 ? form.price_paid_currency : undefined,
      price_paid_source:
        form.price_paid.trim().length > 0
          ? form.price_paid_source || undefined
          : undefined,
      qpr_level: form.qpr_level,
      notes: form.notes,
      location_text: form.location_text,
      location_place_id: form.location_place_id || undefined,
      consumed_at: form.consumed_at,
      entry_privacy: form.entry_privacy,
      reaction_privacy: form.reaction_privacy,
      comments_privacy: form.comments_privacy,
    });

    if (!parsed.success) {
      setErrorMessage(parsed.error.issues[0]?.message ?? "Please correct the highlighted fields.");
      return;
    }

    setIsSubmitting(true);
    setErrorMessage(null);

    try {
      const payload = toWineEntryInsertPayload(parsed.data, user.id, privacyDefaults);
      payload.tasted_with_user_ids = selectedUserIds;
      payload.advanced_notes = toAdvancedNotesPayload(form.advanced_notes);

      const { error, entryId } = await insertEntryWithFallback(payload);

      if (error) {
        setIsSubmitting(false);
        setErrorMessage(error.message);
        return;
      }

      if (!entryId) {
        setIsSubmitting(false);
        setErrorMessage("Entry created, but response was missing the entry ID.");
        return;
      }

      await persistPrimaryGrapes(entryId);
      try {
        await uploadPhotosToEntry(entryId, user.id);
      } catch (uploadError) {
        const message =
          uploadError instanceof Error
            ? uploadError.message
            : "Photo upload failed.";
        setUploadMessage(
          `Entry saved, but at least one photo failed to upload (${message}). You can edit the entry and re-upload.`
        );
      }

      let comparisonCandidate: SurveyComparisonCandidate | null = null;
      try {
        comparisonCandidate = await fetchComparisonCandidateForEntry(entryId, user.id);
      } catch {
        comparisonCandidate = null;
      }

      setSurveyHowWasIt("");
      setSurveyExpectations("");
      setSurveyDrinkAgain("");
      setSavedSurveyAnswers(null);
      setPostSaveSurveyStep("survey");
      setSurveyErrorMessage(null);
      setIsSubmitting(false);
      setPendingPostSaveSurvey({
        entryId,
        wine_name: parsed.data.wine_name,
        producer: parsed.data.producer ?? null,
        vintage: parsed.data.vintage ?? null,
        new_wine_image_url: labelPhotoUri,
        candidate: comparisonCandidate,
      });
    } catch {
      setIsSubmitting(false);
      setErrorMessage("Unable to create entry. Check your connection.");
    }
  };

  const topFriends = users.slice(0, 5);
  const topFriendIds = new Set(topFriends.map((u) => u.id));
  const extraSelected = users.filter(
    (u) => selectedUserIds.includes(u.id) && !topFriendIds.has(u.id)
  );
  const search = friendSearch.trim().toLowerCase();
  const searchResults =
    search.length >= 2
      ? users.filter(
          (u) =>
            !topFriendIds.has(u.id) &&
            !selectedUserIds.includes(u.id) &&
            ((u.display_name ?? "").toLowerCase().includes(search) ||
              (u.email ?? "").toLowerCase().includes(search))
        )
      : [];

  const toggleFriend = (friendId: string) => {
    setSelectedUserIds((current) =>
      current.includes(friendId)
        ? current.filter((id) => id !== friendId)
        : [...current, friendId]
    );
    setFriendSearch("");
  };

  const canSubmitPostSaveSurvey = Boolean(
    surveyHowWasIt && surveyExpectations && surveyDrinkAgain
  );

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      style={styles.screen}
    >
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={styles.navRow}>
          <Pressable
            onPress={() => router.push("/(app)/home")}
            accessibilityRole="button"
            accessibilityLabel="Go to home"
          >
            <AppText style={styles.navBrand}>CellarSnap</AppText>
          </Pressable>
          <Pressable style={styles.backButton} onPress={() => router.replace("/(app)/entries")}>
            <AppText style={styles.backButtonText}>Back</AppText>
          </Pressable>
        </View>

        <View style={styles.pageHeader}>
          <AppText style={styles.eyebrow}>New entry</AppText>
          <AppText style={styles.title}>Record a new pour.</AppText>
          <AppText style={styles.subtitle}>
            Capture the bottle, the place, and the people around it.
          </AppText>
        </View>

        <View style={styles.card}>
          <View style={styles.uploadBox}>
            <View style={styles.uploadTextWrap}>
              <AppText style={styles.label}>Upload images</AppText>
              <AppText style={styles.hint}>
                upload photos of the wine and anything else from the night - pairing, people,
                place. we&apos;ll tag them
              </AppText>
            </View>
            {showProcessedGallery ? (
              <View
                style={styles.uploadGalleryFrame}
                onLayout={(event) => {
                  const width = event.nativeEvent.layout.width;
                  if (width > 0 && Math.abs(width - uploadGalleryFrameWidth) > 0.5) {
                    setUploadGalleryFrameWidth(width);
                    if (uploadGalleryScrollRef.current && uploadPhotos.length > 1) {
                      uploadGalleryScrollRef.current.scrollTo({
                        x: uploadGalleryActiveIndex * width,
                        animated: false,
                      });
                    }
                  }
                }}
              >
                {uploadPhotos.length > 1 && uploadGalleryFrameWidth > 0 ? (
                  <ScrollView
                    ref={(node) => {
                      uploadGalleryScrollRef.current = node;
                    }}
                    horizontal
                    pagingEnabled
                    bounces={false}
                    showsHorizontalScrollIndicator={false}
                    decelerationRate="fast"
                    onMomentumScrollEnd={(event) => {
                      if (uploadGalleryFrameWidth <= 0) {
                        return;
                      }
                      const offsetX = event.nativeEvent.contentOffset.x;
                      const nextIndex = Math.round(offsetX / uploadGalleryFrameWidth);
                      const maxIndex = Math.max(0, uploadPhotos.length - 1);
                      const clampedIndex = Math.max(0, Math.min(maxIndex, nextIndex));
                      setUploadGalleryActiveIndex(clampedIndex);
                      const snappedX = clampedIndex * uploadGalleryFrameWidth;
                      if (
                        Math.abs(offsetX - snappedX) > 0.5 &&
                        uploadGalleryScrollRef.current
                      ) {
                        uploadGalleryScrollRef.current.scrollTo({
                          x: snappedX,
                          animated: false,
                        });
                      }
                    }}
                  >
                    {uploadPhotos.map((photo, index) => (
                      <View
                        key={photo.id}
                        style={[styles.uploadPhotoSlide, { width: uploadGalleryFrameWidth }]}
                      >
                        <Image
                          source={{ uri: photo.uri }}
                          style={styles.uploadPreview}
                          resizeMode="cover"
                        />
                        <View style={styles.uploadPreviewTypeOverlay}>
                          <SelectField
                            label={`Photo ${index + 1} type`}
                            value={photo.type}
                            options={PHOTO_TYPE_OPTIONS}
                            onChange={(value) =>
                              updateUploadPhotoType(photo.id, value as UploadPhotoType)
                            }
                            hideLabel
                            compact
                          />
                        </View>
                      </View>
                    ))}
                  </ScrollView>
                ) : (
                  <View style={styles.uploadPhotoSlide}>
                    {uploadPhotos[0] ? (
                      <>
                        <Image
                          source={{ uri: uploadPhotos[0].uri }}
                          style={styles.uploadPreview}
                          resizeMode="cover"
                        />
                        <View style={styles.uploadPreviewTypeOverlay}>
                          <SelectField
                            label="Photo 1 type"
                            value={uploadPhotos[0].type}
                            options={PHOTO_TYPE_OPTIONS}
                            onChange={(value) =>
                              updateUploadPhotoType(uploadPhotos[0].id, value as UploadPhotoType)
                            }
                            hideLabel
                            compact
                          />
                        </View>
                      </>
                    ) : null}
                  </View>
                )}

                {uploadPhotos.length > 1 ? (
                  <View style={styles.uploadPhotoDotRow}>
                    {uploadPhotos.map((_, index) => (
                      <Pressable
                        key={`upload-dot-${index}`}
                        onPress={() => scrollToUploadPhotoIndex(index)}
                        hitSlop={6}
                        style={[
                          styles.uploadPhotoDot,
                          index === uploadGalleryActiveIndex
                            ? styles.uploadPhotoDotActive
                            : null,
                        ]}
                      />
                    ))}
                  </View>
                ) : null}
              </View>
            ) : uploadPhotos.length > 0 ? (
              <AppText style={styles.uploadWaitingText}>
                Photos uploaded. Waiting for AI processing to complete...
              </AppText>
            ) : null}
            {showProcessedGallery && uploadPhotos.length > 0 ? (
              <View style={styles.uploadGalleryFooter}>
                <AppText style={styles.hint}>
                  {uploadGalleryActiveIndex + 1} of {uploadPhotos.length}
                </AppText>
                <Pressable
                  style={styles.uploadRemoveButton}
                  onPress={() => {
                    const active = uploadPhotos[uploadGalleryActiveIndex];
                    if (active) {
                      removeUploadPhoto(active.id);
                    }
                  }}
                  disabled={isAutofillLoading || isBulkCreating}
                >
                  <AppText style={styles.uploadRemoveButtonText}>Remove</AppText>
                </Pressable>
              </View>
            ) : null}
            {uploadMessage ? (
              uploadAnalysisStatus === "loading" ? (
                <View style={styles.uploadLoadingRow}>
                  <ActivityIndicator size="small" color="#fbbf24" />
                  <AppText style={styles.uploadLoadingText}>{uploadMessage}</AppText>
                </View>
              ) : (
                <AppText
                  style={[
                    styles.uploadStatusText,
                    uploadAnalysisStatus === "error" || uploadAnalysisStatus === "timeout"
                      ? styles.uploadStatusTextError
                      : styles.uploadStatusTextSuccess,
                  ]}
                >
                  {uploadMessage}
                </AppText>
              )
            ) : null}
            {showAnalysisRetry ? (
              <Pressable
                style={styles.retryActionButton}
                onPress={() => void retryPhotoAnalysis()}
                disabled={isAutofillLoading || isBulkCreating}
              >
                <AppText style={styles.retryActionButtonText}>Retry analysis</AppText>
              </Pressable>
            ) : null}
            <Pressable
              style={[styles.ghostButton, styles.uploadActionButton]}
              onPress={() => void pickLabelImage()}
              disabled={isAutofillLoading || isBulkCreating}
            >
              <AppText style={styles.ghostButtonText}>
                {isAutofillLoading
                  ? "Analyzing..."
                  : uploadPhotos.length > 0
                  ? "Add images"
                  : "Upload images"}
              </AppText>
            </Pressable>
            {isBulkLineupMode ? (
              <View style={styles.bulkLineupCard}>
                <View style={styles.bulkLineupHeader}>
                  <AppText style={styles.bulkLineupTitle}>Lineup preview</AppText>
                  <Pressable
                    style={styles.bulkBackButton}
                    onPress={cancelBulkLineup}
                    disabled={isBulkCreating}
                  >
                    <AppText style={styles.bulkBackButtonText}>{"\u2190"} Back</AppText>
                  </Pressable>
                </View>
                {!isBulkCreating ? (
                  <View style={styles.bulkLineupList}>
                    {lineupWines.map((wine) => (
                      <Pressable
                        key={wine.id}
                        style={[
                          styles.bulkLineupRow,
                          wine.included ? styles.bulkLineupRowActive : null,
                        ]}
                        onPress={() => toggleLineupWineIncluded(wine.id)}
                      >
                        <View
                          style={[
                            styles.bulkLineupCheckbox,
                            wine.included ? styles.bulkLineupCheckboxActive : null,
                          ]}
                        >
                          {wine.included ? (
                            <AppText style={styles.bulkLineupCheckboxMark}>✓</AppText>
                          ) : null}
                        </View>
                        <View style={styles.bulkLineupCopy}>
                          <AppText style={styles.bulkLineupWineTitle} numberOfLines={1}>
                            {wine.wine_name || "Unknown wine"}
                          </AppText>
                          <AppText style={styles.bulkLineupWineMeta} numberOfLines={2}>
                            {[
                              wine.producer,
                              wine.vintage,
                              wine.region,
                              ...(wine.primary_grape_suggestions?.length
                                ? [wine.primary_grape_suggestions.join(", ")]
                                : []),
                            ]
                              .filter(Boolean)
                              .join(" \u00b7 ") || "No details detected"}
                          </AppText>
                          {wine.confidence !== null ? (
                            <AppText style={styles.bulkLineupWineMeta}>
                              Confidence: {Math.round(wine.confidence * 100)}%
                            </AppText>
                          ) : null}
                        </View>
                      </Pressable>
                    ))}
                  </View>
                ) : null}
                {bulkCreateMessage ? (
                  isBulkCreating ? (
                    <View style={styles.uploadLoadingRow}>
                      <ActivityIndicator size="small" color="#fbbf24" />
                      <AppText style={styles.uploadLoadingText}>{bulkCreateMessage}</AppText>
                    </View>
                  ) : (
                    <AppText style={styles.bulkLineupMessage}>{bulkCreateMessage}</AppText>
                  )
                ) : null}
                {showBulkRetry ? (
                  <Pressable
                    style={styles.bulkRetryButton}
                    onPress={() => void createBulkEntriesFromLineup()}
                    disabled={isBulkCreating}
                  >
                    <AppText style={styles.bulkRetryButtonText}>Retry bulk create</AppText>
                  </Pressable>
                ) : null}
                {!isBulkCreating ? (
                  <Pressable
                    style={[
                      styles.bulkCreateButton,
                      readyLineupWines.length === 0
                        ? styles.submitButtonDisabled
                        : null,
                    ]}
                    onPress={() => void createBulkEntriesFromLineup()}
                    disabled={readyLineupWines.length === 0}
                  >
                    <AppText style={styles.bulkCreateButtonText}>
                      Create {readyLineupWines.length} entr
                      {readyLineupWines.length === 1 ? "y" : "ies"}
                    </AppText>
                  </Pressable>
                ) : null}
              </View>
            ) : null}
          </View>

          {!isBulkLineupMode ? (
            <>
              <Field
                label="Notes"
                value={form.notes}
                onChange={(value) => updateField("notes", value)}
                multiline
                placeholder="Optional tasting notes"
              />

              <AdaptiveFieldRow minColumnWidth={170}>
                <Field
                  label="Rating (1-100)"
                  value={form.rating}
                  onChange={(value) => updateField("rating", value)}
                  keyboardType="number-pad"
                  placeholder="Required"
                  required
                />
                <SelectField
                  label="QPR"
                  value={form.qpr_level}
                  options={QPR_OPTIONS}
                  onChange={(value) => updateField("qpr_level", value as QprLevel | "")}
                />
              </AdaptiveFieldRow>

              <Accordion
                title="Wine details"
                description="Optional identity details for this bottle."
                expanded={expanded.wine_details}
                onToggle={() => toggleSection("wine_details")}
              >
                <Field
                  label="Wine name"
                  value={form.wine_name}
                  onChange={(value) => updateField("wine_name", value)}
                  placeholder="Required"
                />
                <Field
                  label="Producer"
                  value={form.producer}
                  onChange={(v) => updateField("producer", v)}
                />
                <AdaptiveFieldRow minColumnWidth={160}>
                  <Field
                    label="Vintage"
                    value={form.vintage}
                    onChange={(v) => updateField("vintage", v)}
                  />
                  <Field
                    label="Country"
                    value={form.country}
                    onChange={(v) => updateField("country", v)}
                  />
                </AdaptiveFieldRow>
                <AdaptiveFieldRow minColumnWidth={160}>
                  <Field
                    label="Region"
                    value={form.region}
                    onChange={(v) => updateField("region", v)}
                  />
                  <Field
                    label="Appellation"
                    value={form.appellation}
                    onChange={(v) => updateField("appellation", v)}
                  />
                </AdaptiveFieldRow>
                <Field
                  label="Classification"
                  value={form.classification}
                  onChange={(v) => updateField("classification", v)}
                  placeholder="Optional (e.g. Premier Cru, DOCG)"
                />
                <View style={styles.block}>
                  <View style={styles.primaryGrapeHeaderRow}>
                    <AppText style={styles.label}>Primary grapes</AppText>
                    <AppText style={styles.hint}>{selectedPrimaryGrapes.length}/3</AppText>
                  </View>
                  <AppText style={styles.hint}>
                    Type at least 4 letters to search. Select up to 3 grapes.
                  </AppText>
                  <View style={styles.primaryGrapeChipWrap}>
                    {selectedPrimaryGrapes.map((grape) => (
                      <Pressable
                        key={grape.id}
                        style={styles.primaryGrapeChip}
                        onPress={() => removePrimaryGrape(grape.id)}
                      >
                        <AppText style={styles.primaryGrapeChipText}>{grape.name}</AppText>
                        <AppText style={styles.primaryGrapeChipRemove}>x</AppText>
                      </Pressable>
                    ))}
                    {selectedPrimaryGrapes.length === 0 ? (
                      <AppText style={styles.hint}>No grapes selected yet.</AppText>
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
                    style={styles.input}
                  />
                  {isPrimaryGrapeLoading ? (
                    <AppText style={styles.hint}>Searching grapes...</AppText>
                  ) : null}
                  {primaryGrapeError ? (
                    <AppText style={styles.error}>{primaryGrapeError}</AppText>
                  ) : null}
                  {isPrimaryGrapeFocused &&
                  primaryGrapeQuery.trim().length >= 4 &&
                  primaryGrapeSuggestions.length > 0 ? (
                    <View style={styles.inlineSuggestionList}>
                      {primaryGrapeSuggestions.map((option) => (
                        <Pressable
                          key={option.id}
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
                    <AppText style={styles.hint}>No grape matches found.</AppText>
                  ) : null}
                </View>
              </Accordion>

              <Accordion
                title="Location & date"
                description="Where and when this bottle was consumed."
                expanded={expanded.location_date}
                onToggle={() => toggleSection("location_date")}
              >
                <View style={styles.locationDateStack}>
                  <View style={styles.block}>
                    <AppText style={styles.label}>Location</AppText>
                    <View style={styles.locationInputWrap}>
                      <DoneTextInput
                        value={form.location_text}
                        onChangeText={(value) => {
                          updateField("location_text", value);
                          if (form.location_place_id) {
                            updateField("location_place_id", "");
                          }
                        }}
                        autoCapitalize="words"
                        autoCorrect={false}
                        placeholder="Search places"
                        placeholderTextColor="#71717a"
                        style={styles.input}
                      />
                      {locationSuggestions.length > 0 ? (
                        <View style={styles.suggestionOverlay}>
                          <View style={styles.suggestionList}>
                            {locationSuggestions.map((suggestion) => (
                              <Pressable
                                key={suggestion.place_id}
                                style={styles.suggestionItem}
                                onPress={() => {
                                  updateField("location_text", suggestion.description);
                                  updateField("location_place_id", suggestion.place_id);
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
                        </View>
                      ) : null}
                    </View>
                    {isLocationLoading ? (
                      <AppText style={styles.hint}>Searching Google Maps...</AppText>
                    ) : null}
                    {locationApiMessage ? (
                      <AppText style={styles.hint}>{locationApiMessage}</AppText>
                    ) : null}
                  </View>
                  <DateField
                    label="Consumed date"
                    value={form.consumed_at}
                    onChange={(value) => updateField("consumed_at", value)}
                  />
                </View>
              </Accordion>

              <Accordion
                title="Tasted with"
                description="Tag friends who were with you."
                expanded={expanded.tasted_with}
                onToggle={() => toggleSection("tasted_with")}
              >
                {isLoadingFriends ? <AppText style={styles.hint}>Loading friends...</AppText> : null}
                {!isLoadingFriends && users.length === 0 ? (
                  <AppText style={styles.hint}>No other users yet.</AppText>
                ) : null}
                {users.length > 0 ? (
                  <>
                    <View style={styles.chipWrap}>
                      {topFriends.map((friend) => {
                        const selected = selectedUserIds.includes(friend.id);
                        return (
                          <Pressable
                            key={`friend-top-${friend.id}`}
                            style={[styles.friendChip, selected ? styles.friendChipActive : null]}
                            onPress={() => toggleFriend(friend.id)}
                          >
                            <AppText
                              style={[styles.friendText, selected ? styles.friendTextActive : null]}
                            >
                              {formatFriendName(friend)}
                            </AppText>
                          </Pressable>
                        );
                      })}
                      {extraSelected.map((friend) => (
                        <Pressable
                          key={`friend-extra-${friend.id}`}
                          style={[styles.friendChip, styles.friendChipActive]}
                          onPress={() => toggleFriend(friend.id)}
                        >
                          <AppText style={[styles.friendText, styles.friendTextActive]}>
                            {formatFriendName(friend)}
                          </AppText>
                        </Pressable>
                      ))}
                    </View>
                    <Field
                      label="Search friends"
                      value={friendSearch}
                      onChange={setFriendSearch}
                      placeholder="Type 2+ letters..."
                    />
                    {searchResults.length > 0 ? (
                      <View style={styles.chipWrap}>
                        {searchResults.map((friend) => (
                          <Pressable
                            key={`friend-search-${friend.id}`}
                            style={styles.friendChip}
                            onPress={() => toggleFriend(friend.id)}
                          >
                            <AppText style={styles.friendText}>{formatFriendName(friend)}</AppText>
                          </Pressable>
                        ))}
                      </View>
                    ) : search.length >= 2 ? (
                      <AppText style={styles.hint}>No matching friends found.</AppText>
                    ) : null}
                  </>
                ) : null}
              </Accordion>

              <Accordion
                title="Advanced notes"
                description="Optional structure for deeper tasting notes."
                expanded={expanded.advanced_notes}
                onToggle={() => toggleSection("advanced_notes")}
              >
                <View style={styles.twoColGrid}>
                  {ADVANCED_NOTE_FIELDS.map((field) => (
                    <View
                      key={field.key}
                      style={[
                        styles.twoColItem,
                        field.key === "body" ? styles.twoColItemFull : null,
                      ]}
                    >
                      <SelectField
                        label={field.label}
                        value={form.advanced_notes[field.key]}
                        options={field.options}
                        onChange={(value) => updateAdvanced(field.key, value)}
                      />
                    </View>
                  ))}
                </View>
              </Accordion>

              <Accordion
                title="Visibility & interaction"
                description="Set who can view the post, reactions, and comments."
                expanded={expanded.visibility}
                onToggle={() => toggleSection("visibility")}
              >
                {isLoadingDefaults ? (
                  <AppText style={styles.hint}>Loading your default visibility settings...</AppText>
                ) : null}
                <View style={styles.visibilityGrid}>
                  <VisibilitySelect
                    title="Post visibility"
                    value={form.entry_privacy}
                    options={PRIVACY_OPTIONS}
                    onChange={(value) => updateField("entry_privacy", value as PrivacyLevel)}
                  />
                  <VisibilitySelect
                    title="Reactions"
                    value={form.reaction_privacy}
                    options={PRIVACY_OPTIONS}
                    onChange={(value) => updateField("reaction_privacy", value as PrivacyLevel)}
                  />
                  <VisibilitySelect
                    title="Comments"
                    value={form.comments_privacy}
                    options={PRIVACY_OPTIONS}
                    onChange={(value) => updateField("comments_privacy", value as PrivacyLevel)}
                  />
                </View>
                <AppText style={styles.hint}>
                  Privacy on reactions/comments controls both visibility and participation.
                </AppText>
              </Accordion>

              {errorMessage ? <AppText style={styles.error}>{errorMessage}</AppText> : null}

              <View style={styles.actionRow}>
                <Pressable
                  style={styles.submitButton}
                  onPress={() => void submit()}
                  disabled={isSubmitting || isBulkCreating}
                >
                  {isSubmitting ? (
                    <ActivityIndicator color="#09090b" />
                  ) : (
                    <AppText style={styles.submitButtonText}>Save entry</AppText>
                  )}
                </Pressable>
                <Pressable
                  style={styles.cancelButton}
                  onPress={() => router.replace("/(app)/entries")}
                >
                  <AppText style={styles.cancelButtonText}>Cancel</AppText>
                </Pressable>
              </View>
            </>
          ) : null}
        </View>
      </ScrollView>
      <Modal
        visible={Boolean(pendingPostSaveSurvey)}
        transparent
        animationType="fade"
        onRequestClose={() => undefined}
      >
        <View style={styles.surveyModalRoot}>
          <View
            style={[
              styles.surveyCard,
              postSaveSurveyStep === "comparison" ? styles.surveyCardComparison : null,
            ]}
          >
            {postSaveSurveyStep === "survey" ? (
              <>
                <View style={styles.surveyHeader}>
                  <AppText style={styles.eyebrow}>Required survey</AppText>
                  <AppText style={styles.surveyTitle}>Quick check-in</AppText>
                </View>

                <SelectField
                  label="How was it?"
                  value={surveyHowWasIt}
                  options={HOW_WAS_IT_OPTIONS}
                  onChange={(value) =>
                    setSurveyHowWasIt(value as SurveyHowWasItResponse | "")
                  }
                  placeholderLabel="Select one"
                  tone="amber"
                  hideModalCloseAction
                />
                <SelectField
                  label="How did it compare to your expectations?"
                  value={surveyExpectations}
                  options={EXPECTATIONS_OPTIONS}
                  onChange={(value) =>
                    setSurveyExpectations(value as SurveyExpectationsResponse | "")
                  }
                  placeholderLabel="Select one"
                  tone="amber"
                  hideModalCloseAction
                />
                <SelectField
                  label="Would you drink it again?"
                  value={surveyDrinkAgain}
                  options={DRINK_AGAIN_OPTIONS}
                  onChange={(value) =>
                    setSurveyDrinkAgain(value as SurveyDrinkAgainResponse | "")
                  }
                  placeholderLabel="Select one"
                  tone="amber"
                  hideModalCloseAction
                />

                {surveyErrorMessage ? (
                  <AppText style={styles.error}>{surveyErrorMessage}</AppText>
                ) : null}

                <Pressable
                  style={[
                    styles.surveySubmitButton,
                    !canSubmitPostSaveSurvey || isSubmittingSurvey
                      ? styles.submitButtonDisabled
                      : null,
                  ]}
                  onPress={() => void submitPostSaveSurvey()}
                  disabled={!canSubmitPostSaveSurvey || isSubmittingSurvey}
                >
                  {isSubmittingSurvey ? (
                    <ActivityIndicator color="#09090b" />
                  ) : (
                    <AppText style={styles.submitButtonText}>Save and continue</AppText>
                  )}
                </Pressable>
              </>
            ) : pendingPostSaveSurvey?.candidate ? (
              <>
                <View style={styles.surveyCompareHeader}>
                  <AppText style={styles.surveyCompareTitleHeading}>
                    Which wine did you like more?
                  </AppText>
                  <Pressable
                    style={styles.surveySkipButton}
                    onPress={skipPostSaveComparison}
                    disabled={isSubmittingSurvey}
                  >
                    <AppText style={styles.surveySkipText}>Skip</AppText>
                  </Pressable>
                </View>

                {surveyErrorMessage ? (
                  <AppText style={styles.error}>{surveyErrorMessage}</AppText>
                ) : null}

                <View style={styles.surveyCompareSection}>
                  <View style={styles.surveyCompareRow}>
                    <Pressable
                      style={styles.surveyCompareCard}
                      onPress={() => void submitPostSaveComparison("more")}
                      disabled={isSubmittingSurvey}
                    >
                      <View style={styles.surveyCompareImageWrap}>
                        {pendingPostSaveSurvey.new_wine_image_url ? (
                          // eslint-disable-next-line jsx-a11y/alt-text
                          <Image
                            source={{ uri: pendingPostSaveSurvey.new_wine_image_url }}
                            style={styles.surveyCompareImage}
                          />
                        ) : (
                          <View style={styles.surveyCompareImageFallback}>
                            <AppText style={styles.hint}>No photo</AppText>
                          </View>
                        )}
                      </View>
                      <View style={styles.surveyCompareBody}>
                        <AppText style={styles.surveyCompareTag}>Wine you logged</AppText>
                        <AppText style={styles.surveyCompareTitle} numberOfLines={2}>
                          {formatSurveyWineTitle(pendingPostSaveSurvey)}
                        </AppText>
                        <AppText style={styles.surveyCompareMeta} numberOfLines={2}>
                          {formatSurveyWineMeta(pendingPostSaveSurvey)}
                        </AppText>
                      </View>
                    </Pressable>

                    <Pressable
                      style={styles.surveyCompareCard}
                      onPress={() => void submitPostSaveComparison("less")}
                      disabled={isSubmittingSurvey}
                    >
                      <View style={styles.surveyCompareImageWrap}>
                        {pendingPostSaveSurvey.candidate.label_image_url ? (
                          // eslint-disable-next-line jsx-a11y/alt-text
                          <Image
                            source={{ uri: pendingPostSaveSurvey.candidate.label_image_url }}
                            style={styles.surveyCompareImage}
                          />
                        ) : (
                          <View style={styles.surveyCompareImageFallback}>
                            <AppText style={styles.hint}>No photo</AppText>
                          </View>
                        )}
                      </View>
                      <View style={styles.surveyCompareBody}>
                        <AppText style={styles.surveyCompareTag}>Previous wine</AppText>
                        <AppText style={styles.surveyCompareTitle} numberOfLines={2}>
                          {formatSurveyWineTitle(pendingPostSaveSurvey.candidate)}
                        </AppText>
                        <AppText style={styles.surveyCompareMeta} numberOfLines={2}>
                          {formatSurveyWineMeta(pendingPostSaveSurvey.candidate)}
                        </AppText>
                        <AppText style={styles.surveyCompareMeta}>
                          Logged {formatYmdDisplay(pendingPostSaveSurvey.candidate.consumed_at)}
                        </AppText>
                      </View>
                    </Pressable>
                  </View>
                </View>
              </>
            ) : null}
          </View>
        </View>
      </Modal>
    </KeyboardAvoidingView>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  keyboardType = "default",
  autoCapitalize = "sentences",
  multiline = false,
  required = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  keyboardType?:
    | "default"
    | "number-pad"
    | "phone-pad"
    | "email-address"
    | "numeric"
    | "decimal-pad";
  autoCapitalize?: "none" | "sentences" | "words" | "characters";
  multiline?: boolean;
  required?: boolean;
}) {
  return (
    <View style={styles.block}>
      <View style={styles.labelRow}>
        <AppText style={styles.label}>{label}</AppText>
        {required ? <AppText style={styles.requiredStar}>*</AppText> : null}
      </View>
      <DoneTextInput
        value={value}
        onChangeText={onChange}
        keyboardType={keyboardType}
        autoCapitalize={autoCapitalize}
        autoCorrect={false}
        placeholder={placeholder}
        placeholderTextColor="#71717a"
        multiline={multiline}
        style={[styles.input, multiline ? styles.inputMultiline : null]}
      />
    </View>
  );
}

function AdaptiveFieldRow({
  children,
  minColumnWidth,
}: {
  children: ReactNode;
  minColumnWidth: number;
}) {
  const [rowWidth, setRowWidth] = useState(0);
  const items = Children.toArray(children);
  const canUseTwoColumns =
    items.length === 2 &&
    rowWidth > 0 &&
    (rowWidth - FIELD_ROW_GAP) / 2 >= minColumnWidth;
  const twoColWidth = canUseTwoColumns ? (rowWidth - FIELD_ROW_GAP) / 2 : 0;

  return (
    <View
      style={styles.adaptiveRow}
      onLayout={(event) => {
        const nextWidth = Math.round(event.nativeEvent.layout.width);
        setRowWidth((current) => (current === nextWidth ? current : nextWidth));
      }}
    >
      {items.map((item, index) => (
        <View
          key={`adaptive-field-${index}`}
          style={[
            styles.adaptiveCol,
            canUseTwoColumns && twoColWidth > 0
              ? { width: twoColWidth }
              : styles.adaptiveColFull,
          ]}
        >
          {item}
        </View>
      ))}
    </View>
  );
}

function SelectField({
  label,
  value,
  options,
  onChange,
  hideLabel = false,
  compact = false,
  placeholderLabel = "Not set",
  tone = "default",
  hideModalCloseAction = false,
}: {
  label: string;
  value: string;
  options: ReadonlyArray<ChipOption>;
  onChange: (value: string) => void;
  hideLabel?: boolean;
  compact?: boolean;
  placeholderLabel?: string;
  tone?: "default" | "amber";
  hideModalCloseAction?: boolean;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [popoverLayout, setPopoverLayout] = useState<{
    top: number;
    left: number;
    width: number;
    maxHeight: number;
  } | null>(null);
  const triggerRef = useRef<View>(null);
  const selectedLabel =
    options.find((option) => option.value === value)?.label ?? placeholderLabel;
  const hasSelection = value.trim().length > 0;

  const openPopover = () => {
    const trigger = triggerRef.current;
    if (!trigger) {
      setIsOpen(true);
      return;
    }

    requestAnimationFrame(() => {
      trigger.measureInWindow((x, y, width, height) => {
        const screen = Dimensions.get("window");
        const popoverWidth = Math.min(Math.max(width, 220), screen.width - 24);
        const left = Math.min(
          Math.max(12, x),
          Math.max(12, screen.width - popoverWidth - 12)
        );
        const spaceBelow = screen.height - (y + height) - 12;
        const spaceAbove = y - 12;
        const openAbove = spaceBelow < 176 && spaceAbove > spaceBelow;
        const maxHeight = Math.min(
          280,
          Math.max(160, (openAbove ? spaceAbove : spaceBelow) - 10)
        );
        const top = openAbove
          ? Math.max(12, y - maxHeight - 8)
          : y + height + 8;

        setPopoverLayout({
          top,
          left,
          width: popoverWidth,
          maxHeight,
        });
        setIsOpen(true);
      });
    });
  };

  return (
    <View style={compact ? styles.selectCompactBlock : styles.block}>
      {hideLabel ? null : <AppText style={styles.label}>{label}</AppText>}
      <Pressable
        ref={triggerRef}
        style={[
          styles.selectTrigger,
          compact ? styles.selectTriggerCompact : null,
          tone === "amber" && hasSelection ? styles.selectTriggerAmber : null,
          compact && tone === "amber" && hasSelection
            ? styles.selectTriggerCompactAmber
            : null,
        ]}
        onPress={openPopover}
      >
        <AppText
          style={[
            styles.selectTriggerText,
            compact ? styles.selectTriggerTextCompact : null,
            tone === "amber" && hasSelection ? styles.selectTriggerTextAmber : null,
          ]}
          numberOfLines={1}
        >
          {selectedLabel}
        </AppText>
        <AppText
          style={[
            styles.selectChevron,
            compact ? styles.selectChevronCompact : null,
            tone === "amber" && hasSelection ? styles.selectChevronAmber : null,
          ]}
        >
          v
        </AppText>
      </Pressable>
      <Modal
        visible={isOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setIsOpen(false)}
      >
        <View style={styles.popoverRoot}>
          <Pressable style={styles.modalDismissLayer} onPress={() => setIsOpen(false)} />
          {popoverLayout ? (
            <View
              style={[
                styles.selectPopoverCard,
                tone === "amber" ? styles.selectPopoverCardAmber : null,
                {
                  top: popoverLayout.top,
                  left: popoverLayout.left,
                  width: popoverLayout.width,
                  maxHeight: popoverLayout.maxHeight,
                },
              ]}
            >
            <View style={styles.selectModalHeader}>
              <AppText
                style={[
                  styles.selectModalTitle,
                  tone === "amber" ? styles.selectModalTitleAmber : null,
                ]}
              >
                {label}
              </AppText>
              {!hideModalCloseAction ? (
                <Pressable onPress={() => setIsOpen(false)}>
                  <AppText style={styles.selectModalCloseText}>Close</AppText>
                </Pressable>
              ) : (
                <View />
              )}
            </View>
            <ScrollView
              style={styles.selectPopoverList}
              keyboardShouldPersistTaps="handled"
            >
              {options.map((option) => {
                const selected = option.value === value;
                return (
                  <Pressable
                    key={`${label}-${option.value || "empty"}`}
                    style={[
                      styles.selectOption,
                      selected ? styles.selectOptionSelected : null,
                      selected && tone === "amber" ? styles.selectOptionSelectedAmber : null,
                    ]}
                    onPress={() => {
                      onChange(option.value);
                      setIsOpen(false);
                    }}
                  >
                    <AppText
                      style={[
                        styles.selectOptionText,
                        selected ? styles.selectOptionTextSelected : null,
                        selected && tone === "amber"
                          ? styles.selectOptionTextSelectedAmber
                          : null,
                      ]}
                    >
                      {option.label}
                    </AppText>
                  </Pressable>
                );
              })}
            </ScrollView>
          </View>
          ) : null}
        </View>
      </Modal>
    </View>
  );
}

function VisibilitySelect({
  title,
  value,
  options,
  onChange,
}: {
  title: string;
  value: PrivacyLevel;
  options: ReadonlyArray<ChipOption>;
  onChange: (value: string) => void;
}) {
  const tone = getPrivacyBadgeTone(value);
  const badgeLabel = (PRIVACY_LEVEL_LABELS[value] ?? value).toUpperCase();

  return (
    <View style={styles.visibilityColumn}>
      <View style={styles.visibilityHeaderRow}>
        <AppText style={styles.visibilityTitle}>{title}</AppText>
        <View
          style={[
            styles.visibilityBadge,
            {
              backgroundColor: tone.backgroundColor,
              borderColor: tone.borderColor,
            },
          ]}
        >
          <AppText style={[styles.visibilityBadgeText, { color: tone.textColor }]}>
            {badgeLabel}
          </AppText>
        </View>
      </View>
      <SelectField
        label={title}
        value={value}
        options={options}
        onChange={onChange}
        hideLabel
      />
    </View>
  );
}

function DateField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [popoverLayout, setPopoverLayout] = useState<{
    top: number;
    left: number;
    width: number;
    openAbove: boolean;
    anchorX: number;
  } | null>(null);
  const selectedDate = parseYmd(value) ?? new Date();
  const [visibleMonth, setVisibleMonth] = useState(
    new Date(selectedDate.getFullYear(), selectedDate.getMonth(), 1)
  );
  const triggerRef = useRef<View>(null);

  const openPopover = () => {
    const nextSelectedDate = parseYmd(value) ?? new Date();
    setVisibleMonth(
      new Date(nextSelectedDate.getFullYear(), nextSelectedDate.getMonth(), 1)
    );

    const trigger = triggerRef.current;
    if (!trigger) {
      setIsOpen(true);
      return;
    }

    requestAnimationFrame(() => {
      trigger.measureInWindow((x, y, width, height) => {
        const screen = Dimensions.get("window");
        const calendarSize = Math.min(292, screen.width - 24);
        const desiredHeight = calendarSize;
        const popoverWidth = calendarSize;
        const left = Math.min(
          Math.max(12, x),
          Math.max(12, screen.width - popoverWidth - 12)
        );
        const spaceBelow = screen.height - (y + height) - 12;
        const spaceAbove = y - 12;
        const openAbove = spaceBelow < desiredHeight && spaceAbove > spaceBelow;
        const top = openAbove
          ? Math.max(12, y - desiredHeight - 10)
          : Math.min(screen.height - desiredHeight - 12, y + height + 10);
        const triggerCenterX = x + width / 2;
        const anchorX = Math.max(
          18,
          Math.min(popoverWidth - 18, triggerCenterX - left)
        );

        setPopoverLayout({
          top,
          left,
          width: popoverWidth,
          openAbove,
          anchorX,
        });
        setIsOpen(true);
      });
    });
  };

  const year = visibleMonth.getFullYear();
  const month = visibleMonth.getMonth();
  const firstWeekday = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  const cells: Array<number | null> = [];
  for (let i = 0; i < firstWeekday; i += 1) {
    cells.push(null);
  }
  for (let day = 1; day <= daysInMonth; day += 1) {
    cells.push(day);
  }
  while (cells.length % 7 !== 0) {
    cells.push(null);
  }

  return (
    <View style={styles.block}>
      <AppText style={styles.label}>{label}</AppText>
      <Pressable
        ref={triggerRef}
        style={styles.selectTrigger}
        onPress={openPopover}
      >
        <AppText style={styles.selectTriggerText}>{formatYmdDisplay(value)}</AppText>
        <AppText style={styles.selectChevron}>v</AppText>
      </Pressable>

      <Modal
        visible={isOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setIsOpen(false)}
      >
        <View style={styles.popoverRoot}>
          <Pressable style={styles.modalDismissLayer} onPress={() => setIsOpen(false)} />
          {popoverLayout ? (
            <View
              style={[
                styles.calendarPopoverWrap,
                {
                  top: popoverLayout.top,
                  left: popoverLayout.left,
                  width: popoverLayout.width,
                },
              ]}
            >
              {!popoverLayout.openAbove ? (
                <View
                  style={[
                    styles.popoverArrow,
                    styles.popoverArrowTop,
                    { left: popoverLayout.anchorX - 9 },
                  ]}
                />
              ) : null}

              <Pressable style={styles.calendarCard} onPress={() => {}}>
            <View style={styles.calendarHeader}>
              <Pressable
                style={styles.calendarNavButton}
                onPress={() => setVisibleMonth(new Date(year, month - 1, 1))}
              >
                <AppText style={styles.calendarNavButtonText}>{"<"}</AppText>
              </Pressable>
              <AppText style={styles.calendarTitle}>
                {MONTH_LABELS[month]} {year}
              </AppText>
              <Pressable
                style={styles.calendarNavButton}
                onPress={() => setVisibleMonth(new Date(year, month + 1, 1))}
              >
                <AppText style={styles.calendarNavButtonText}>{">"}</AppText>
              </Pressable>
            </View>

            <View style={styles.weekdayRow}>
              {WEEKDAY_LABELS.map((weekday) => (
                <AppText key={weekday} style={styles.weekdayText}>
                  {weekday.toUpperCase()}
                </AppText>
              ))}
            </View>

            <View style={styles.calendarGrid}>
              {cells.map((day, index) => {
                if (day === null) {
                  return <View key={`blank-${index}`} style={styles.calendarSlot} />;
                }
                const isSelected =
                  selectedDate.getFullYear() === year &&
                  selectedDate.getMonth() === month &&
                  selectedDate.getDate() === day;
                return (
                  <View key={`slot-${day}`} style={styles.calendarSlot}>
                    <Pressable
                      style={[
                        styles.calendarCell,
                        isSelected ? styles.calendarCellSelected : null,
                      ]}
                      onPress={() => {
                        onChange(formatYmd(new Date(year, month, day)));
                        setIsOpen(false);
                      }}
                    >
                      <AppText
                        style={[
                          styles.calendarCellText,
                          isSelected ? styles.calendarCellTextSelected : null,
                        ]}
                      >
                        {day}
                      </AppText>
                    </Pressable>
                  </View>
                );
              })}
            </View>
              </Pressable>

              {popoverLayout.openAbove ? (
                <View
                  style={[
                    styles.popoverArrow,
                    styles.popoverArrowBottom,
                    { left: popoverLayout.anchorX - 9 },
                  ]}
                />
              ) : null}
            </View>
          ) : null}
        </View>
      </Modal>
    </View>
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
  description: string;
  expanded: boolean;
  onToggle: () => void;
  children: React.ReactNode;
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
          <AppText style={styles.hint}>{description}</AppText>
          <View style={styles.accordionFields}>{children}</View>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#0f0a09" },
  content: { paddingHorizontal: 18, paddingTop: 16, paddingBottom: 28, gap: 14 },
  navRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255, 255, 255, 0.06)",
    paddingBottom: 16,
  },
  navBrand: { color: "#fafafa", fontSize: 22, fontWeight: "700" },
  backButton: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.1)",
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  backButtonText: { color: "#e4e4e7", fontSize: 12, fontWeight: "700" },
  pageHeader: { marginTop: 4, gap: 6 },
  eyebrow: {
    color: "#fcd34d",
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 2,
    textTransform: "uppercase",
  },
  title: { color: "#fafafa", fontSize: 29, fontWeight: "700" },
  subtitle: { color: "#d4d4d8", fontSize: 14, lineHeight: 20 },
  card: {
    borderRadius: 24,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.1)",
    backgroundColor: "rgba(255, 255, 255, 0.05)",
    padding: 16,
    gap: 12,
  },
  uploadBox: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.1)",
    backgroundColor: "rgba(0, 0, 0, 0.25)",
    padding: 12,
    gap: 8,
  },
  uploadTextWrap: { gap: 4 },
  uploadHint: { color: "#fbbf24" },
  uploadGalleryFrame: {
    width: "100%",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.08)",
    backgroundColor: "rgba(0, 0, 0, 0.34)",
    overflow: "hidden",
  },
  uploadPhotoSlide: {
    position: "relative",
  },
  uploadPreview: {
    width: "100%",
    height: 232,
    backgroundColor: "rgba(0, 0, 0, 0.3)",
  },
  uploadPreviewTypeOverlay: {
    position: "absolute",
    left: 10,
    top: 10,
    width: 128,
  },
  uploadPhotoDotRow: {
    position: "absolute",
    bottom: 10,
    left: 0,
    right: 0,
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 14,
  },
  uploadPhotoDot: {
    width: 7,
    height: 7,
    borderRadius: 999,
    backgroundColor: "rgba(255, 255, 255, 0.42)",
  },
  uploadPhotoDotActive: {
    width: 8,
    height: 8,
    backgroundColor: "#fbbf24",
  },
  uploadGalleryFooter: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
    minHeight: 24,
  },
  uploadRemoveButton: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.16)",
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  uploadRemoveButtonText: {
    color: "#f4f4f5",
    fontSize: 11,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  uploadWaitingText: {
    color: "#a1a1aa",
    fontSize: 12,
    lineHeight: 16,
  },
  uploadLoadingRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  uploadLoadingText: {
    color: "#fbbf24",
    fontSize: 12,
    lineHeight: 16,
    flex: 1,
  },
  uploadStatusText: {
    fontSize: 12,
    lineHeight: 16,
  },
  uploadStatusTextSuccess: {
    color: "#86efac",
  },
  uploadStatusTextError: {
    color: "#fca5a5",
  },
  retryActionButton: {
    alignSelf: "flex-start",
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(251, 191, 36, 0.46)",
    backgroundColor: "rgba(251, 191, 36, 0.14)",
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  retryActionButtonText: {
    color: "#fde68a",
    fontSize: 11,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  bulkLineupCard: {
    marginTop: 8,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(251, 191, 36, 0.32)",
    backgroundColor: "rgba(146, 64, 14, 0.18)",
    padding: 10,
    gap: 8,
  },
  bulkLineupHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  bulkLineupTitle: {
    color: "#fde68a",
    fontSize: 13,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.7,
  },
  bulkBackButton: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.12)",
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  bulkBackButtonText: {
    color: "#d4d4d8",
    fontSize: 11,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  bulkLineupList: {
    gap: 7,
  },
  bulkLineupRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.08)",
    backgroundColor: "rgba(0, 0, 0, 0.22)",
    paddingHorizontal: 9,
    paddingVertical: 8,
  },
  bulkLineupRowActive: {
    borderColor: "rgba(251, 191, 36, 0.5)",
    backgroundColor: "rgba(251, 191, 36, 0.12)",
  },
  bulkLineupCheckbox: {
    width: 18,
    height: 18,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.35)",
    alignItems: "center",
    justifyContent: "center",
  },
  bulkLineupCheckboxActive: {
    borderColor: "#fbbf24",
    backgroundColor: "#fbbf24",
  },
  bulkLineupCheckboxMark: {
    color: "#09090b",
    fontSize: 11,
    fontWeight: "800",
    lineHeight: 12,
  },
  bulkLineupCopy: {
    flex: 1,
    minWidth: 0,
    gap: 1,
  },
  bulkLineupWineTitle: {
    color: "#fef3c7",
    fontSize: 12,
    fontWeight: "700",
  },
  bulkLineupWineMeta: {
    color: "#d4d4d8",
    fontSize: 11,
  },
  bulkLineupConfidence: {
    color: "#fde68a",
    fontSize: 11,
    fontWeight: "700",
  },
  bulkLineupMessage: {
    color: "#fde68a",
    fontSize: 12,
    lineHeight: 16,
  },
  bulkRetryButton: {
    alignSelf: "flex-start",
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(251, 191, 36, 0.46)",
    backgroundColor: "rgba(251, 191, 36, 0.16)",
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  bulkRetryButtonText: {
    color: "#fef3c7",
    fontSize: 11,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  bulkCreateButton: {
    borderRadius: 999,
    backgroundColor: "#fbbf24",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 10,
    minHeight: 40,
  },
  bulkCreateButtonText: {
    color: "#09090b",
    fontSize: 13,
    fontWeight: "700",
  },
  bulkCancelButton: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.2)",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 10,
    minHeight: 40,
  },
  bulkCancelButtonText: {
    color: "#e4e4e7",
    fontSize: 12,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  ghostButton: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.16)",
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  uploadActionButton: {
    alignSelf: "flex-start",
    marginTop: 2,
  },
  ghostButtonText: {
    color: "#e4e4e7",
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 0.6,
    textTransform: "uppercase",
  },
  adaptiveRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: FIELD_ROW_GAP,
  },
  adaptiveCol: {
    minWidth: 0,
  },
  adaptiveColFull: {
    width: "100%",
  },
  locationDateStack: {
    gap: 10,
  },
  twoColGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  twoColItem: {
    width: "48%",
    minWidth: 140,
  },
  twoColItemFull: {
    width: "100%",
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
    borderColor: "rgba(251, 191, 36, 0.5)",
    backgroundColor: "rgba(251, 191, 36, 0.14)",
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  primaryGrapeChipText: {
    color: "#fde68a",
    fontSize: 12,
    fontWeight: "700",
  },
  primaryGrapeChipRemove: {
    color: "#fef3c7",
    fontSize: 12,
    fontWeight: "700",
  },
  accordion: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.08)",
    backgroundColor: "rgba(0, 0, 0, 0.18)",
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
    color: "#f4f4f5",
    fontSize: 12,
    fontWeight: "700",
    width: 14,
    textAlign: "center",
  },
  accordionTitle: { color: "#e4e4e7", fontSize: 14, fontWeight: "600" },
  accordionBody: {
    borderTopWidth: 1,
    borderTopColor: "rgba(255, 255, 255, 0.07)",
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 8,
  },
  accordionFields: { gap: 10 },
  block: { gap: 6 },
  selectCompactBlock: { gap: 0 },
  labelRow: { flexDirection: "row", alignItems: "center", gap: 4 },
  label: { color: "#e4e4e7", fontSize: 14, fontWeight: "600" },
  requiredStar: { color: "#fb7185", fontSize: 14, fontWeight: "700" },
  input: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.1)",
    backgroundColor: "rgba(0, 0, 0, 0.3)",
    color: "#f4f4f5",
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
  },
  inputMultiline: { minHeight: 108, textAlignVertical: "top" },
  selectTrigger: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.1)",
    backgroundColor: "rgba(0, 0, 0, 0.3)",
    minHeight: 42,
    paddingHorizontal: 12,
    paddingVertical: 10,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  selectTriggerCompact: {
    minHeight: 28,
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 999,
    backgroundColor: "rgba(0, 0, 0, 0.62)",
    borderColor: "rgba(255, 255, 255, 0.2)",
    gap: 6,
  },
  selectTriggerAmber: {
    borderColor: "rgba(251, 191, 36, 0.45)",
    backgroundColor: "rgba(251, 191, 36, 0.08)",
  },
  selectTriggerCompactAmber: {
    borderColor: "rgba(251, 191, 36, 0.55)",
    backgroundColor: "rgba(251, 191, 36, 0.24)",
  },
  selectTriggerText: { color: "#f4f4f5", fontSize: 14, flex: 1 },
  selectTriggerTextCompact: {
    fontSize: 10,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  selectTriggerTextAmber: {
    color: "#fde68a",
    fontWeight: "600",
  },
  selectChevron: { color: "#a1a1aa", fontSize: 12, fontWeight: "700" },
  selectChevronCompact: { fontSize: 9 },
  selectChevronAmber: {
    color: "#fbbf24",
  },
  selectPopoverCard: {
    position: "absolute",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.18)",
    backgroundColor: "#000000",
    padding: 0,
    gap: 0,
    overflow: "hidden",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.45,
    shadowRadius: 18,
    elevation: 20,
  },
  selectPopoverCardAmber: {
    borderColor: "rgba(251, 191, 36, 0.5)",
    backgroundColor: "#140f08",
  },
  selectModalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  selectModalTitle: {
    color: "#f4f4f5",
    fontSize: 15,
    fontWeight: "700",
  },
  selectModalTitleAmber: {
    color: "#fde68a",
  },
  selectModalCloseText: {
    color: "#d4d4d8",
    fontSize: 12,
    fontWeight: "700",
  },
  selectPopoverList: {
    width: "100%",
  },
  selectOption: {
    width: "100%",
    paddingHorizontal: 14,
    paddingVertical: 11,
  },
  selectOptionSelected: {
    backgroundColor: "rgba(251, 191, 36, 0.16)",
  },
  selectOptionSelectedAmber: {
    backgroundColor: "rgba(251, 191, 36, 0.26)",
  },
  selectOptionText: {
    color: "#d4d4d8",
    fontSize: 13,
    fontWeight: "600",
  },
  selectOptionTextSelected: {
    color: "#fde68a",
  },
  selectOptionTextSelectedAmber: {
    color: "#fef3c7",
  },
  locationInputWrap: {
    position: "relative",
  },
  suggestionOverlay: {
    position: "absolute",
    left: 0,
    right: 0,
    top: 46,
    zIndex: 50,
    elevation: 12,
  },
  suggestionList: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.1)",
    backgroundColor: "#191513",
    overflow: "hidden",
  },
  suggestionItem: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: "rgba(255, 255, 255, 0.06)",
  },
  suggestionText: {
    color: "#d4d4d8",
    fontSize: 13,
  },
  inlineSuggestionList: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.1)",
    backgroundColor: "#191513",
    overflow: "hidden",
    marginTop: 2,
  },
  chipWrap: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.14)",
    backgroundColor: "rgba(0, 0, 0, 0.18)",
    paddingHorizontal: 11,
    paddingVertical: 7,
  },
  chipActive: {
    borderColor: "#fbbf24",
    backgroundColor: "rgba(251, 191, 36, 0.2)",
  },
  chipText: { color: "#d4d4d8", fontSize: 12, fontWeight: "600" },
  chipTextActive: { color: "#fde68a" },
  friendChip: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.16)",
    paddingHorizontal: 10,
    paddingVertical: 7,
    backgroundColor: "rgba(255, 255, 255, 0.02)",
  },
  friendChipActive: {
    borderColor: "#fbbf24",
    backgroundColor: "rgba(251, 191, 36, 0.2)",
  },
  friendText: { color: "#d4d4d8", fontSize: 12, fontWeight: "600" },
  friendTextActive: { color: "#fde68a" },
  popoverRoot: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.06)",
  },
  modalDismissLayer: {
    ...StyleSheet.absoluteFillObject,
  },
  visibilityGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  visibilityColumn: {
    flex: 1,
    minWidth: 210,
    gap: 8,
  },
  visibilityHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  visibilityTitle: {
    color: "#f4f4f5",
    fontSize: 14,
    fontWeight: "700",
  },
  visibilityBadge: {
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 11,
    paddingVertical: 6,
  },
  visibilityBadgeText: {
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 1,
  },
  calendarPopoverWrap: {
    position: "absolute",
  },
  popoverArrow: {
    position: "absolute",
    width: 18,
    height: 18,
    backgroundColor: "#1d1f26",
    transform: [{ rotate: "45deg" }],
    borderColor: "rgba(255, 255, 255, 0.18)",
    borderWidth: 1,
  },
  popoverArrowTop: {
    top: -9,
  },
  popoverArrowBottom: {
    bottom: -9,
  },
  calendarCard: {
    width: "100%",
    aspectRatio: 1,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.16)",
    backgroundColor: "#1d1f26",
    paddingHorizontal: 10,
    paddingVertical: 10,
    gap: 6,
  },
  calendarHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  calendarNavButton: {
    width: 26,
    height: 26,
    borderRadius: 999,
    borderWidth: 0,
    alignItems: "center",
    justifyContent: "center",
  },
  calendarNavButtonText: {
    color: "#60a5fa",
    fontSize: 18,
    fontWeight: "700",
  },
  calendarTitle: {
    color: "#f4f4f5",
    fontSize: 13,
    fontWeight: "700",
  },
  weekdayRow: {
    flexDirection: "row",
  },
  weekdayText: {
    width: "14.2857143%",
    textAlign: "center",
    color: "#71717a",
    fontSize: 9,
    fontWeight: "700",
  },
  calendarGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "flex-start",
  },
  calendarSlot: {
    width: "14.2857143%",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 1,
  },
  calendarCell: {
    width: 28,
    height: 28,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
  },
  calendarCellSelected: {
    backgroundColor: "#3b82f6",
  },
  calendarCellText: {
    color: "#e4e4e7",
    fontSize: 12,
    fontWeight: "500",
  },
  calendarCellTextSelected: {
    color: "#e0f2fe",
  },
  calendarActions: {
    marginTop: 6,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  calendarResetButton: {
    minWidth: 98,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.15)",
    backgroundColor: "rgba(24, 24, 27, 0.9)",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 10,
    paddingHorizontal: 14,
  },
  calendarResetButtonText: {
    color: "#e4e4e7",
    fontSize: 14,
    fontWeight: "700",
  },
  calendarConfirmButton: {
    width: 64,
    height: 64,
    borderRadius: 999,
    backgroundColor: "#3b82f6",
    alignItems: "center",
    justifyContent: "center",
  },
  calendarConfirmButtonText: {
    color: "#d1fae5",
    fontSize: 30,
    fontWeight: "700",
    lineHeight: 34,
  },
  hint: { color: "#a1a1aa", fontSize: 12, lineHeight: 16 },
  error: { color: "#fda4af", fontSize: 13 },
  surveyModalRoot: {
    flex: 1,
    padding: 12,
    justifyContent: "center",
    backgroundColor: "rgba(0, 0, 0, 0.72)",
  },
  surveyCard: {
    width: "100%",
    maxWidth: 620,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.12)",
    backgroundColor: "#14100f",
    padding: 16,
    gap: 12,
    maxHeight: "90%",
  },
  surveyCardComparison: {
    maxHeight: "94%",
  },
  surveyHeader: {
    gap: 6,
  },
  surveyTitle: {
    color: "#fafafa",
    fontSize: 24,
    fontWeight: "700",
  },
  surveyCompareSection: {
    gap: 8,
    marginTop: 4,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: "rgba(255, 255, 255, 0.08)",
  },
  surveyCompareHeader: {
    gap: 10,
  },
  surveyCompareTitleHeading: {
    color: "#fafafa",
    fontSize: 22,
    fontWeight: "700",
  },
  surveySkipButton: {
    alignSelf: "flex-start",
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.16)",
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  surveySkipText: {
    color: "#e4e4e7",
    fontSize: 11,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.6,
  },
  surveyCompareRow: {
    flexDirection: "column",
    gap: 10,
  },
  surveyCompareCard: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.1)",
    backgroundColor: "rgba(0, 0, 0, 0.25)",
    overflow: "hidden",
  },
  surveyCompareImageWrap: {
    height: 176,
    backgroundColor: "rgba(0, 0, 0, 0.4)",
  },
  surveyCompareImage: {
    width: "100%",
    height: "100%",
  },
  surveyCompareImageFallback: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  surveyCompareBody: {
    gap: 2,
    paddingHorizontal: 8,
    paddingVertical: 8,
    borderTopWidth: 1,
    borderTopColor: "rgba(255, 255, 255, 0.08)",
  },
  surveyCompareTag: {
    color: "#d4d4d8",
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 0.7,
    textTransform: "uppercase",
  },
  surveyCompareTitle: {
    color: "#f4f4f5",
    fontSize: 12,
    fontWeight: "700",
  },
  surveyCompareMeta: {
    color: "#a1a1aa",
    fontSize: 11,
  },
  surveySubmitButton: {
    borderRadius: 12,
    backgroundColor: "#fbbf24",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 12,
    minHeight: 46,
    marginTop: 2,
  },
  actionRow: { flexDirection: "row", gap: 10 },
  submitButton: {
    flex: 1,
    borderRadius: 12,
    backgroundColor: "#fbbf24",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 12,
    minHeight: 46,
  },
  submitButtonDisabled: {
    opacity: 0.55,
  },
  submitButtonText: { color: "#09090b", fontSize: 14, fontWeight: "700" },
  cancelButton: {
    flex: 1,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.12)",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 12,
  },
  cancelButtonText: { color: "#e4e4e7", fontSize: 14, fontWeight: "600" },
});

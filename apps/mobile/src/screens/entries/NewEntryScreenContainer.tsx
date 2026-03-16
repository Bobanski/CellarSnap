import {
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  ActivityIndicator,
  Alert,
  findNodeHandle,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Switch,
  type GestureResponderEvent,
  type TextInput as ReactNativeTextInput,
  View
} from "react-native";
import { router } from "expo-router";
import * as ImagePicker from "expo-image-picker";
import {
  createEntryInputSchema,
  getTodayLocalYmd,
  isUnknownWineName,
  normalizeGrapeLookupValue,
  normalizePrivacyLevel,
  normalizeProducerText,
  normalizeWineNameText,
  PRIVACY_LEVEL_LABELS,
  PRIVACY_LEVEL_VALUES,
  QPR_LEVEL_LABELS,
  QPR_LEVEL_VALUES,
  resolveLineupWineDisplayName,
  toWineEntryInsertPayload,
  type PricePaidCurrency,
  type PricePaidSource,
  type NormalizedLabelAnchor,
  type NormalizedLineupBbox,
  type PrivacyLevel,
  type QprLevel,
} from "@cellarsnap/shared";
import { DoneTextInput } from "@/src/components/DoneTextInput";
import {
  Accordion,
  AdaptiveFieldRow,
  DateField,
  Field,
  SelectField,
  VisibilitySelect,
} from "@/src/components/entries/newEntryFormParts";
import {
  ensurePhotoMimeType,
  extensionForMimeType,
} from "@/src/lib/entryFlow/photoIO";
import {
  computeOverallConfidence,
  formatFriendName,
  MAX_TOTAL_UPLOAD_PHOTOS,
  normalizePhotoUploadErrorMessage,
  PHOTO_TYPE_OPTIONS,
  toAdvancedNotesPayload,
  type UploadPhotoType,
} from "@/src/lib/entryFlow/newEntryUtils";
import {
  type LabelAutofillResponse,
} from "@/src/lib/entryFlow/photoAnalysisClient";
import {
  runBulkCreateWorkflow,
  type EntryGroupMode,
} from "@/src/lib/entryFlow/bulkCreateWorkflow";
import { styles } from "@/src/components/entries/newEntryStyles";
import { PostSaveSurveyModal } from "@/src/components/entries/PostSaveSurveyModal";
import { getAccessTokenForApi, getWebApiBaseUrl } from "@/src/lib/api/webApi";
import {
  fetchComparisonCandidateForEntry as fetchComparisonCandidateForEntryService,
  insertEntryWithFallback as insertEntryWithFallbackService,
  persistPrimaryGrapesByIds as persistPrimaryGrapesByIdsService,
} from "@/src/lib/entryFlow/entryPersistence";
import { runCreateEntryWorkflow } from "@/src/lib/entryFlow/createEntryWorkflow";
import { runPhotoAnalysisWorkflow } from "@/src/lib/entryFlow/photoAnalysisOrchestrator";
import { uploadPhotosToEntryWithFallback } from "@/src/lib/entryFlow/uploadToEntry";
import { useUploadGallery } from "@/src/lib/entryFlow/useUploadGallery";
import {
  usePostSaveSurveyFlow,
  type SurveyComparisonCandidate,
} from "@/src/lib/entryFlow/usePostSaveSurveyFlow";
import { supabase } from "@/src/lib/supabase";
import { useAuth } from "@/src/providers/AuthProvider";
import { AppText } from "@/src/components/AppText";
import { colors } from "@/src/lib/theme";

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
  drinking_now: boolean;
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

type UploadPhotoItem = {
  id: string;
  uri: string;
  originalUri?: string | null;
  name: string;
  mimeType: string;
  type: UploadPhotoType;
  contextConfidence: number | null;
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
  bottle_bbox: NormalizedLineupBbox | null;
  label_bbox: NormalizedLineupBbox | null;
  label_anchor: NormalizedLabelAnchor | null;
  focus_crop_data_url: string | null;
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

type GroupModeOption = {
  value: EntryGroupMode;
  label: string;
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

const BULK_GROUP_MODE_OPTIONS: GroupModeOption[] = [
  { value: "event", label: "Event" },
  { value: "catch_up", label: "Catch-up" },
];

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
const WEB_API_BASE_URL = getWebApiBaseUrl();
const RESCAN_CONFIDENCE_THRESHOLD = 0.6;

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
    drinking_now: false,
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
  const [isLocationFocused, setIsLocationFocused] = useState(false);
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
  const [lineupWines, setLineupWines] = useState<LineupWine[]>([]);
  const [isBulkCreating, setIsBulkCreating] = useState(false);
  const [bulkCreateMessage, setBulkCreateMessage] = useState<string | null>(null);
  const [bulkEntryMode, setBulkEntryMode] = useState<EntryGroupMode>("event");
  const [bulkEntrySetupStep, setBulkEntrySetupStep] = useState<
    "group" | "event_details"
  >("group");
  const [bulkGroupInfoOpen, setBulkGroupInfoOpen] = useState(false);
  const [bulkEntryTitle, setBulkEntryTitle] = useState("");
  const [bulkEntryConfigError, setBulkEntryConfigError] = useState<string | null>(null);
  const [isAutofillLoading, setIsAutofillLoading] = useState(false);
  const [uploadMessage, setUploadMessage] = useState<string | null>(null);
  const [cropPhotoId, setCropPhotoId] = useState<string | null>(null);
  const [cropLineupWineId, setCropLineupWineId] = useState<string | null>(null);
  const [savedCropByPhotoId, setSavedCropByPhotoId] = useState<
    Record<string, SavedCropState>
  >({});
  const [savedCropByLineupWineId, setSavedCropByLineupWineId] = useState<
    Record<string, SavedCropState>
  >({});
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
  const [lastScanConfidence, setLastScanConfidence] = useState<number | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const labelPhotoUri =
    uploadPhotos.find((photo) => photo.type === "label")?.uri ??
    uploadPhotos[0]?.uri ??
    null;
  const showProcessedGallery =
    uploadPhotos.length > 0 && uploadAnalysisStatus !== "loading";
  const includedLineupWines = lineupWines.filter((wine) => wine.included);
  const isBulkLineupMode = lineupWines.length > 0;
  const showBulkEventDetailsStep =
    bulkEntryMode === "event" && bulkEntrySetupStep === "event_details";
  const hasLowScanConfidence =
    typeof lastScanConfidence === "number" &&
    Number.isFinite(lastScanConfidence) &&
    lastScanConfidence < RESCAN_CONFIDENCE_THRESHOLD;
  const showRescanButton =
    (uploadAnalysisStatus === "error" ||
      uploadAnalysisStatus === "timeout" ||
      hasLowScanConfidence) &&
    uploadPhotos.length > 0 &&
    !isAutofillLoading &&
    !isBulkCreating;
  const showBulkRetry = Boolean(
    bulkCreateMessage &&
      !isBulkCreating &&
      includedLineupWines.length > 0 &&
      /(failed|unable|network|error)/i.test(bulkCreateMessage)
  );
  const activeCropLineupWine =
    cropLineupWineId !== null
      ? lineupWines.find((wine) => wine.id === cropLineupWineId) ?? null
      : null;
  const activeCropPhoto =
    cropPhotoId !== null
      ? uploadPhotos.find((photo) => photo.id === cropPhotoId) ?? null
      : null;
  const activeCropPhotoSourceUri =
    activeCropPhoto?.originalUri ?? activeCropPhoto?.uri ?? null;
  const clampCropPercent = (value: number) => Math.min(100, Math.max(0, value));
  const clampCropZoom = (value: number) => Math.min(4, Math.max(1, value));
  const getCropGeometry = () => {
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
  };
  const cropDragRef = useRef<CropGestureState | null>(null);
  const formScrollRef = useRef<ScrollView | null>(null);
  const locationInputRef = useRef<ReactNativeTextInput | null>(null);
  const {
    uploadGalleryActiveIndex,
    uploadGalleryFrameWidth,
    setUploadGalleryScrollNode,
    handleUploadGalleryLayout,
    handleUploadGalleryMomentumEnd,
    scrollToUploadPhotoIndex,
    resetUploadGallery,
  } = useUploadGallery(uploadPhotos.length);
  const {
    pendingPostSaveSurvey,
    surveyHowWasIt,
    surveyExpectations,
    surveyDrinkAgain,
    postSaveSurveyStep,
    surveyErrorMessage,
    isSubmittingSurvey,
    canSubmitPostSaveSurvey,
    beginPostSaveSurvey,
    setSurveyHowWasIt,
    setSurveyExpectations,
    setSurveyDrinkAgain,
    submitPostSaveSurvey,
    submitPostSaveComparison,
    skipPostSaveComparison,
  } = usePostSaveSurveyFlow({
    userId: user?.id,
    onComplete: () => {
      returnFromNewEntry();
    },
  });

  const returnFromNewEntry = () => {
    if (router.canGoBack()) {
      router.back();
      return;
    }
    router.replace("/(app)/entries");
  };

  const updateField = <K extends keyof EntryFormState>(field: K, value: EntryFormState[K]) => {
    setForm((current) => ({ ...current, [field]: value }));
  };

  const ensureLocationInputVisible = () => {
    const inputHandle = locationInputRef.current
      ? findNodeHandle(locationInputRef.current)
      : null;
    if (!inputHandle) {
      return;
    }

    const delay = Platform.OS === "ios" ? 40 : 20;
    setTimeout(() => {
      const responder = formScrollRef.current?.getScrollResponder?.() as
        | {
            scrollResponderScrollNativeHandleToKeyboard?: (
              nodeHandle: number,
              additionalOffset: number,
              preventNegativeScrollOffset: boolean
            ) => void;
          }
        | null
        | undefined;

      responder?.scrollResponderScrollNativeHandleToKeyboard?.(
        inputHandle,
        Platform.OS === "ios" ? 84 : 64,
        true
      );
    }, delay);
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
    if (!activeCropPhotoSourceUri) {
      setCropImageNaturalSize(null);
      setCropSourceLoading(false);
      return;
    }

    let cancelled = false;
    setCropSourceLoading(true);
    Image.getSize(
      activeCropPhotoSourceUri,
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
  }, [activeCropPhotoSourceUri]);

  useEffect(() => {
    setSavedCropByPhotoId((current) => {
      const photoIds = new Set(uploadPhotos.map((photo) => photo.id));
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
  }, [uploadPhotos]);

  useEffect(() => {
    setSavedCropByLineupWineId((current) => {
      const wineIds = new Set(lineupWines.map((wine) => wine.id));
      let changed = false;
      const next: Record<string, SavedCropState> = {};
      for (const [wineId, state] of Object.entries(current)) {
        if (wineIds.has(wineId)) {
          next[wineId] = state;
        } else {
          changed = true;
        }
      }
      return changed ? next : current;
    });
  }, [lineupWines]);

  useEffect(() => {
    let cancelled = false;
    const query = form.location_text.trim();
    const sessionToken = locationSessionToken;

    const timer = setTimeout(async () => {
      if (!isLocationFocused) {
        if (!cancelled) {
          setLocationSuggestions([]);
          setIsLocationLoading(false);
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
  }, [form.location_text, isLocationFocused, locationSessionToken]);

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
        supabase
          .from("public_profiles")
          .select("id, display_name, email")
          .in("id", friendIds),
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

  const insertEntryWithFallback = (initialPayload: Record<string, unknown>) =>
    insertEntryWithFallbackService({
      supabase,
      initialPayload,
    });

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
    await persistPrimaryGrapesByIds(
      entryId,
      selectedPrimaryGrapes.slice(0, 3).map((grape) => grape.id)
    );
  };

  const persistPrimaryGrapesByIds = (entryId: string, grapeIds: string[]) =>
    persistPrimaryGrapesByIdsService({
      supabase,
      entryId,
      grapeIds,
    });

  const fetchComparisonCandidateForEntry = (
    currentEntryId: string,
    ownerUserId: string
  ): Promise<SurveyComparisonCandidate | null> =>
    fetchComparisonCandidateForEntryService({
      supabase,
      currentEntryId,
      ownerUserId,
    });

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
      wine_name:
        current.wine_name ||
        (() => {
          const normalizedWineName =
            normalizeWineNameText(payload.wine_name) ?? normalizeText(payload.wine_name);
          const normalizedProducer =
            normalizeProducerText(payload.producer) ?? normalizeText(payload.producer);
          if (normalizedWineName && !isUnknownWineName(normalizedWineName)) {
            return normalizedWineName;
          }
          return normalizedProducer;
        })(),
      producer:
        current.producer ||
        normalizeProducerText(payload.producer) ||
        normalizeText(payload.producer),
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
      wine_name:
        current.wine_name ||
        (() => {
          const normalizedWineName =
            normalizeWineNameText(wine.wine_name) ?? normalizeText(wine.wine_name);
          const normalizedProducer =
            normalizeProducerText(wine.producer) ?? normalizeText(wine.producer);
          if (normalizedWineName && !isUnknownWineName(normalizedWineName)) {
            return normalizedWineName;
          }
          return normalizedProducer;
        })(),
      producer:
        current.producer ||
        normalizeProducerText(wine.producer) ||
        normalizeText(wine.producer),
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
    setSavedCropByPhotoId((current) => {
      if (!current[photoId]) {
        return current;
      }
      const next = { ...current };
      delete next[photoId];
      return next;
    });
    if (wasLastPhoto) {
      setUploadAnalysisStatus("idle");
      setLastScanConfidence(null);
      setUploadMessage(null);
      resetUploadGallery();
    }
  };

  const openCropEditorForActivePhoto = () => {
    const active = uploadPhotos[uploadGalleryActiveIndex];
    if (!active) {
      return;
    }
    const saved = savedCropByPhotoId[active.id];
    setCropLineupWineId(null);
    setCropPhotoId(active.id);
    setCropCenterX(saved?.centerX ?? 50);
    setCropCenterY(saved?.centerY ?? 50);
    setCropZoom(saved?.zoom ?? 1);
    cropDragRef.current = null;
  };

  const openCropEditorForLineupWine = (wine: LineupWine) => {
    const sourcePhoto = uploadPhotos[wine.photoIndex];
    if (!sourcePhoto) {
      setUploadMessage("Unable to open crop editor for this bottle.");
      return;
    }

    const saved = savedCropByLineupWineId[wine.id];
    let centerX = 50;
    let centerY = 50;
    let targetZoom = 1;
    if (saved) {
      centerX = saved.centerX;
      centerY = saved.centerY;
      targetZoom = saved.zoom;
    } else {
      const anchor = wine.label_anchor;
      const targetBox = wine.bottle_bbox ?? wine.label_bbox;
      centerX =
        typeof anchor?.x === "number"
          ? anchor.x * 100
          : targetBox
          ? (targetBox.x + targetBox.width / 2) * 100
          : 50;
      centerY =
        typeof anchor?.y === "number"
          ? anchor.y * 100
          : targetBox
          ? (targetBox.y + targetBox.height / 2) * 100
          : 50;
      const targetSpan = targetBox
        ? Math.max(targetBox.width, targetBox.height)
        : null;
      targetZoom =
        typeof targetSpan === "number" && targetSpan > 0
          ? clampCropZoom(1 / Math.min(1, targetSpan * 1.35))
          : 1;
    }

    setCropLineupWineId(wine.id);
    setCropPhotoId(sourcePhoto.id);
    setCropCenterX(clampCropPercent(centerX));
    setCropCenterY(clampCropPercent(centerY));
    setCropZoom(targetZoom);
    cropDragRef.current = null;
  };

  const closeCropEditor = () => {
    setCropPhotoId(null);
    setCropLineupWineId(null);
    setCropImageNaturalSize(null);
    setCropFrameSize(0);
    setCropSourceLoading(false);
    setIsSavingCrop(false);
    cropDragRef.current = null;
  };

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

  const saveCropEdits = async () => {
    const sourcePhoto = activeCropPhoto;
    if (!sourcePhoto) {
      return;
    }
    const sourceCropUri = sourcePhoto.originalUri ?? sourcePhoto.uri;
    if (!sourceCropUri) {
      setUploadMessage("Unable to load this image for crop editing.");
      return;
    }
    const targetLineupWineId = cropLineupWineId;
    if (!WEB_API_BASE_URL) {
      setUploadMessage(
        "Set EXPO_PUBLIC_WEB_API_BASE_URL to enable in-place crop editing."
      );
      return;
    }

    const accessToken = await getAccessTokenForApi();
    if (!accessToken) {
      setUploadMessage("Session expired. Sign in again to save crop edits.");
      return;
    }

    setIsSavingCrop(true);
    setUploadMessage("Saving crop...");

    try {
      const formData = new FormData();
      if (sourceCropUri.startsWith("data:image/")) {
        formData.append("photo_data_url", sourceCropUri);
      } else {
        formData.append(
          "photo",
          {
            uri: sourceCropUri,
            name: sourcePhoto.name,
            type: sourcePhoto.mimeType,
          } as unknown as Blob
        );
      }
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

      if (targetLineupWineId) {
        setSavedCropByLineupWineId((current) => ({
          ...current,
          [targetLineupWineId]: {
            centerX: cropCenterX,
            centerY: cropCenterY,
            zoom: cropZoom,
          },
        }));
        setLineupWines((current) =>
          current.map((wine) =>
            wine.id === targetLineupWineId
              ? {
                  ...wine,
                  focus_crop_data_url: payload.cropped_data_url ?? wine.focus_crop_data_url,
                }
              : wine
          )
        );
        closeCropEditor();
        setUploadMessage("Bottle crop saved.");
        return;
      }

      const nextPhotos = uploadPhotos.map((photo) =>
        photo.id === sourcePhoto.id
          ? {
              ...photo,
              uri: payload.cropped_data_url ?? photo.uri,
              originalUri: photo.originalUri ?? photo.uri,
              mimeType: payload.mime_type ?? "image/jpeg",
              name: `${photo.name.replace(/\.[a-z0-9]+$/i, "")}-crop.jpg`,
            }
          : photo
      );

      setSavedCropByPhotoId((current) => ({
        ...current,
        [sourcePhoto.id]: {
          centerX: cropCenterX,
          centerY: cropCenterY,
          zoom: cropZoom,
        },
      }));
      setUploadPhotos(nextPhotos);
      closeCropEditor();
      setUploadMessage("Crop saved.");
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unable to crop this image.";
      setUploadMessage(message);
    } finally {
      setIsSavingCrop(false);
    }
  };

  const toggleLineupWineIncluded = (wineId: string) => {
    setLineupWines((current) =>
      current.map((wine) =>
        wine.id === wineId ? { ...wine, included: !wine.included } : wine
      )
    );
  };

  const resetBulkGroupConfig = () => {
    setBulkEntryMode("event");
    setBulkEntrySetupStep("group");
    setBulkEntryTitle("");
    setBulkEntryConfigError(null);
  };

  const cancelBulkLineup = () => {
    setLineupWines([]);
    resetBulkGroupConfig();
    setBulkCreateMessage(null);
    setUploadMessage("Bulk scan canceled. Continue with single entry details.");
  };

  const uploadPhotosToEntry = async (entryId: string, ownerUserId: string) => {
    await uploadPhotosToEntryWithFallback({
      supabase,
      entryId,
      ownerUserId,
      photosToUpload: uploadPhotos,
    });
  };

  const uploadSpecificPhotosToEntry = async (
    entryId: string,
    ownerUserId: string,
    photosToUpload: UploadPhotoItem[]
  ) => {
    return uploadPhotosToEntryWithFallback({
      supabase,
      entryId,
      ownerUserId,
      photosToUpload,
    });
  };

  const beginPhotoAnalysisRun = (photoCount: number) => {
    setUploadAnalysisStatus("loading");
    setLastScanConfidence(null);
    setIsAutofillLoading(true);
    setLineupWines([]);
    resetBulkGroupConfig();
    setBulkCreateMessage(null);
    setUploadMessage(
      photoCount === 1
        ? "Extracting wine details. Please allow more time for larger lineups."
        : `Extracting wine details from ${photoCount} photos. Please allow more time for larger lineups.`
    );
  };

  const executePhotoAnalysis = async ({
    analysisPhotos,
    accessToken,
  }: {
    analysisPhotos: UploadPhotoItem[];
    accessToken: string;
  }) => {
    const labelTarget =
      analysisPhotos.find((photo) => photo.type === "label") ??
      analysisPhotos[0] ??
      null;
    await runPhotoAnalysisWorkflow({
      analysisPhotos,
      labelTarget,
      accessToken,
      baseUrl: WEB_API_BASE_URL,
      setUploadPhotos,
      setLineupWines,
      setBulkCreateMessage,
      setUploadAnalysisStatus,
      setUploadMessage,
      setIsAutofillLoading,
      applyLabelAutofill,
      applyLineupAutofill,
      computeOverallConfidence,
      setLastAnalysisConfidence: setLastScanConfidence,
    });
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

    const allowMultipleSelection = remainingSlots > 1;
    const pickerOptions: ImagePicker.ImagePickerOptions = {
      mediaTypes: ["images"],
      allowsMultipleSelection: allowMultipleSelection,
      selectionLimit: allowMultipleSelection ? remainingSlots : 1,
      orderedSelection: allowMultipleSelection,
      allowsEditing: !allowMultipleSelection,
      quality: 0.8,
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
      const mimeType = ensurePhotoMimeType(asset.mimeType, asset.fileName, asset.uri);
      const extension = extensionForMimeType(mimeType);
      const name =
        asset.fileName && asset.fileName.trim().length > 0
          ? asset.fileName
          : `entry-photo-${createdAt}-${index + 1}.${extension}`;

      return {
        id: `${createdAt}-${index}-${Math.random().toString(36).slice(2, 8)}`,
        uri: asset.uri,
        originalUri: asset.uri,
        name,
        mimeType,
        type: !hasLabelAlready && index === 0 ? "label" : "other_bottles",
        contextConfidence: null,
      };
    });

    setUploadPhotos([...existingPhotos, ...initialPhotos]);

    const photosForAnalysis = [...existingPhotos, ...initialPhotos];
    beginPhotoAnalysisRun(initialPhotos.length);

    if (!WEB_API_BASE_URL) {
      setUploadAnalysisStatus("error");
      setLastScanConfidence(null);
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
      setLastScanConfidence(null);
      setIsAutofillLoading(false);
      setUploadMessage(
        `Added ${initialPhotos.length} photo${
          initialPhotos.length === 1 ? "" : "s"
        }. Sign in again to run AI autofill and auto-tagging.`
      );
      return;
    }

    await executePhotoAnalysis({ analysisPhotos: photosForAnalysis, accessToken });
  };

  const retryPhotoAnalysis = async () => {
    if (uploadPhotos.length === 0) {
      setUploadMessage("Upload photos first.");
      return;
    }
    if (!WEB_API_BASE_URL) {
      setUploadAnalysisStatus("error");
      setLastScanConfidence(null);
      setUploadMessage(
        "Set EXPO_PUBLIC_WEB_API_BASE_URL to enable AI autofill and auto-tagging."
      );
      return;
    }

    const accessToken = await getAccessTokenForApi();
    if (!accessToken) {
      setUploadAnalysisStatus("error");
      setLastScanConfidence(null);
      setUploadMessage("Session expired. Sign in again to retry analysis.");
      return;
    }

    beginPhotoAnalysisRun(uploadPhotos.length);
    await executePhotoAnalysis({ analysisPhotos: uploadPhotos, accessToken });
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
    const normalizedBulkTitle = bulkEntryTitle.trim();
    if (!normalizedBulkTitle) {
      setBulkEntryConfigError(
        "Add an event or catch-up title before creating the grouped post."
      );
      return;
    }
    if (uploadPhotos.length === 0) {
      setBulkCreateMessage("Upload photos before creating bulk entries.");
      return;
    }

    setBulkEntryConfigError(null);
    setIsBulkCreating(true);
    setBulkCreateMessage("Resolving grape varieties...");
    setErrorMessage(null);

    const accessToken = await getAccessTokenForApi();
    const normalizedBaseUrl = WEB_API_BASE_URL;
    try {
      const result = await runBulkCreateWorkflow({
        lineupWines,
        uploadPhotos,
        userId: user.id,
        selectedUserIds,
        form: {
          rating: form.rating,
          notes: form.notes,
          location_text: form.location_text,
          location_place_id: form.location_place_id,
          consumed_at: form.consumed_at,
          entry_privacy: form.entry_privacy,
          reaction_privacy: form.reaction_privacy,
          comments_privacy: form.comments_privacy,
        },
        defaultConsumedDate,
        accessToken,
        normalizedBaseUrl,
        setBulkCreateMessage,
        groupConfig: {
          mode: bulkEntryMode,
          title: normalizedBulkTitle,
        },
        resolveSuggestedGrapes,
        insertEntryWithFallback,
        persistPrimaryGrapesByIds,
        uploadSpecificPhotosToEntry,
        rollbackEntry: async (entryId, ownerUserId) => {
          try {
            await supabase
              .from("wine_entries")
              .delete()
              .eq("id", entryId)
              .eq("user_id", ownerUserId);
          } catch {
            // Rollback failed; entry remains as partial record.
          }
        },
      });

      const uncertaintyNotes: string[] = [];
      if (result.lowConfidenceCount > 0) {
        uncertaintyNotes.push(
          `${result.lowConfidenceCount} bottle${
            result.lowConfidenceCount === 1 ? "" : "s"
          } had low confidence`
        );
      }
      const uncertaintySuffix =
        uncertaintyNotes.length > 0
          ? ` Flagged: ${uncertaintyNotes.join(" \u2022 ")}.`
          : "";

      if (result.createdEntryIds.length > 0) {
        const queue = encodeURIComponent(result.createdEntryIds.join(","));
        const successMessage = result.groupedPostErrorMessage
          ? `Created ${result.createdEntryIds.length} entr${
              result.createdEntryIds.length === 1 ? "y" : "ies"
            }, but ${result.groupedPostErrorMessage}${
              uncertaintySuffix ? uncertaintySuffix : ""
            } Opening guided review...`
          : result.failedCount > 0
            ? `Created ${result.createdEntryIds.length} entr${
                result.createdEntryIds.length === 1 ? "y" : "ies"
              }. ${result.failedCount} could not be created.${
                result.firstFailureMessage
                  ? ` First issue: ${result.firstFailureMessage}`
                  : ""
              }${uncertaintySuffix} Opening guided review...`
            : `Created ${result.createdEntryIds.length} entr${
                result.createdEntryIds.length === 1 ? "y" : "ies"
              }!${uncertaintySuffix} Opening guided review...`;
        setBulkCreateMessage(successMessage);
        setUploadMessage(successMessage);
        router.push(
          `/(app)/entries/${result.createdEntryIds[0]}?bulk=1&queue=${queue}&index=0`
        );
      } else {
        setBulkCreateMessage(
          result.firstFailureMessage
            ? `Failed to create entries. ${result.firstFailureMessage}`
            : "Failed to create entries. Try again."
        );
      }
    } finally {
      setIsBulkCreating(false);
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
      drinking_now: form.drinking_now,
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
      const result = await runCreateEntryWorkflow<SurveyComparisonCandidate>({
        userId: user.id,
        payload,
        insertEntryWithFallback,
        persistPrimaryGrapes,
        uploadPhotosToEntry,
        fetchComparisonCandidateForEntry,
        normalizePhotoUploadErrorMessage,
      });

      if (!result.ok) {
        setIsSubmitting(false);
        setErrorMessage(result.errorMessage);
        return;
      }
      if (result.uploadWarningMessage) {
        setUploadMessage(result.uploadWarningMessage);
        Alert.alert("Photo upload issue", result.uploadWarningMessage);
      }

      setIsSubmitting(false);
      beginPostSaveSurvey({
        entryId: result.entryId,
        wine_name: parsed.data.wine_name,
        producer: parsed.data.producer ?? null,
        vintage: parsed.data.vintage ?? null,
        new_wine_image_url: labelPhotoUri,
        candidate: result.comparisonCandidate,
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
            (u.display_name ?? "").toLowerCase().includes(search)
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
  const cropGeometry = getCropGeometry();

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      style={styles.screen}
    >
      <ScrollView
        ref={formScrollRef}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode={Platform.OS === "ios" ? "interactive" : "on-drag"}
        automaticallyAdjustKeyboardInsets
      >
        <View style={styles.navRow}>
          <Pressable
            onPress={() => router.push("/(app)/home")}
            accessibilityRole="button"
            accessibilityLabel="Go to home"
          >
            <AppText style={styles.navBrand}>Cluster</AppText>
          </Pressable>
          <Pressable style={styles.backButton} onPress={returnFromNewEntry}>
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
                  handleUploadGalleryLayout(event.nativeEvent.layout.width);
                }}
              >
                {uploadPhotos.length > 1 && uploadGalleryFrameWidth > 0 ? (
                  <ScrollView
                    ref={setUploadGalleryScrollNode}
                    horizontal
                    pagingEnabled
                    bounces={false}
                    showsHorizontalScrollIndicator={false}
                    decelerationRate="fast"
                    onMomentumScrollEnd={(event) => {
                      handleUploadGalleryMomentumEnd(
                        event.nativeEvent.contentOffset.x
                      );
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
                <View style={styles.uploadGalleryFooterActions}>
                  <Pressable
                    style={styles.uploadCropButton}
                    onPress={openCropEditorForActivePhoto}
                    disabled={isAutofillLoading || isBulkCreating}
                  >
                    <AppText style={styles.uploadCropButtonText}>Crop</AppText>
                  </Pressable>
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
              </View>
            ) : null}
            {uploadMessage ? (
              uploadAnalysisStatus === "loading" ? (
                <View style={styles.uploadLoadingRow}>
                  <ActivityIndicator size="small" color={colors.accentPrimary} />
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
            {showRescanButton ? (
              <Pressable
                style={styles.retryActionButton}
                onPress={() => void retryPhotoAnalysis()}
                disabled={isAutofillLoading || isBulkCreating}
              >
                <AppText style={styles.retryActionButtonText}>Re-scan</AppText>
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
                  <AppText style={styles.bulkLineupTitle}>
                    {showBulkEventDetailsStep ? "Event details" : "Lineup preview"}
                  </AppText>
                  <Pressable
                    style={styles.bulkBackButton}
                    onPress={
                      showBulkEventDetailsStep
                        ? () => {
                            setBulkEntrySetupStep("group");
                            setBulkEntryConfigError(null);
                          }
                        : cancelBulkLineup
                    }
                    disabled={isBulkCreating}
                  >
                    <AppText style={styles.bulkBackButtonText}>{"\u2190"} Back</AppText>
                  </Pressable>
                </View>
                <View style={styles.bulkGroupCard}>
                  <View style={styles.bulkGroupHeader}>
                    <View style={styles.bulkGroupHeaderRow}>
                      <AppText style={styles.bulkGroupTitle}>
                        {showBulkEventDetailsStep ? "Event details" : "Group this bulk upload"}
                      </AppText>
                      {!showBulkEventDetailsStep ? (
                        <Pressable
                          style={styles.bulkInfoButton}
                          onPress={() => setBulkGroupInfoOpen(true)}
                          hitSlop={8}
                        >
                          <AppText style={styles.bulkInfoButtonText}>i</AppText>
                        </Pressable>
                      ) : null}
                    </View>
                  </View>
                  {showBulkEventDetailsStep ? (
                    <View style={styles.block}>
                      <View style={styles.block}>
                        <AppText style={styles.bulkGroupFieldLabel}>Event name</AppText>
                        <DoneTextInput
                          value={bulkEntryTitle}
                          onChangeText={(value) => {
                            setBulkEntryTitle(value);
                            if (bulkEntryConfigError) {
                              setBulkEntryConfigError(null);
                            }
                          }}
                          placeholder="Stuytown tasting"
                          placeholderTextColor={colors.textSecondary}
                          autoCorrect={false}
                          style={[
                            styles.input,
                            bulkEntryConfigError ? styles.bulkGroupInputError : null,
                          ]}
                        />
                        {bulkEntryConfigError ? (
                          <AppText style={styles.bulkGroupErrorText}>
                            {bulkEntryConfigError}
                          </AppText>
                        ) : null}
                      </View>

                      <View style={styles.block}>
                        <AppText style={styles.bulkGroupFieldLabel}>Event location</AppText>
                        <View style={styles.locationInputWrap}>
                          <DoneTextInput
                            ref={locationInputRef}
                            value={form.location_text}
                            onChangeText={(value) => {
                              updateField("location_text", value);
                              if (form.location_place_id) {
                                updateField("location_place_id", "");
                              }
                            }}
                            onFocus={() => {
                              setIsLocationFocused(true);
                              ensureLocationInputVisible();
                            }}
                            onBlur={() => {
                              setTimeout(() => {
                                setIsLocationFocused(false);
                                setLocationSuggestions([]);
                              }, 120);
                            }}
                            autoCapitalize="words"
                            autoCorrect={false}
                            placeholder="Search places"
                            placeholderTextColor={colors.textSecondary}
                            style={styles.input}
                          />
                          {isLocationFocused && locationSuggestions.length > 0 ? (
                            <View style={styles.suggestionOverlay}>
                              <View style={styles.suggestionList}>
                                {locationSuggestions.map((suggestion) => (
                                  <Pressable
                                    key={`bulk-event-location-${suggestion.place_id}`}
                                    style={styles.suggestionItem}
                                    onPress={() => {
                                      updateField("location_text", suggestion.description);
                                      updateField("location_place_id", suggestion.place_id);
                                      setIsLocationFocused(false);
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
                        label="Event date"
                        value={form.consumed_at}
                        onChange={(value) => updateField("consumed_at", value)}
                      />

                      <View style={styles.block}>
                        <AppText style={styles.bulkGroupFieldLabel}>Tasted with</AppText>
                        {isLoadingFriends ? (
                          <AppText style={styles.hint}>Loading friends...</AppText>
                        ) : null}
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
                                    key={`bulk-event-friend-top-${friend.id}`}
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
                                      {formatFriendName(friend)}
                                    </AppText>
                                  </Pressable>
                                );
                              })}
                              {extraSelected.map((friend) => (
                                <Pressable
                                  key={`bulk-event-friend-extra-${friend.id}`}
                                  style={[styles.friendChip, styles.friendChipActive]}
                                  onPress={() => toggleFriend(friend.id)}
                                >
                                  <AppText style={[styles.friendText, styles.friendTextActive]}>
                                    {formatFriendName(friend)}
                                  </AppText>
                                </Pressable>
                              ))}
                            </View>
                            <DoneTextInput
                              value={friendSearch}
                              onChangeText={setFriendSearch}
                              placeholder="Search friends"
                              placeholderTextColor={colors.textSecondary}
                              autoCapitalize="none"
                              autoCorrect={false}
                              style={styles.input}
                            />
                            {searchResults.length > 0 ? (
                              <View style={styles.inlineSuggestionList}>
                                {searchResults.map((friend) => (
                                  <Pressable
                                    key={`bulk-event-friend-search-${friend.id}`}
                                    style={styles.suggestionItem}
                                    onPress={() => toggleFriend(friend.id)}
                                  >
                                    <AppText style={styles.suggestionText}>
                                      {formatFriendName(friend)}
                                    </AppText>
                                  </Pressable>
                                ))}
                              </View>
                            ) : friendSearch.trim().length >= 2 ? (
                              <AppText style={styles.hint}>No matching friends found.</AppText>
                            ) : null}
                          </>
                        ) : null}
                      </View>

                      <View style={{ flexDirection: "row", gap: 10 }}>
                        <Pressable
                          style={[
                            styles.bulkCreateButton,
                            { flex: 1 },
                            includedLineupWines.length === 0
                              ? styles.submitButtonDisabled
                              : null,
                          ]}
                          onPress={() => void createBulkEntriesFromLineup()}
                          disabled={includedLineupWines.length === 0}
                        >
                          <AppText style={styles.bulkCreateButtonText}>
                            Create {includedLineupWines.length} entr
                            {includedLineupWines.length === 1 ? "y" : "ies"}
                          </AppText>
                        </Pressable>
                      </View>
                    </View>
                  ) : (
                    <View style={styles.block}>
                      <View style={styles.bulkGroupModeWrap}>
                        {BULK_GROUP_MODE_OPTIONS.map((option) => {
                          const selectedOption = bulkEntryMode === option.value;
                          return (
                            <Pressable
                              key={option.value}
                              style={[
                                styles.bulkGroupModeButton,
                                selectedOption ? styles.bulkGroupModeButtonActive : null,
                              ]}
                              onPress={() => {
                                setBulkEntryMode(option.value);
                                setBulkEntrySetupStep("group");
                                setBulkEntryConfigError(null);
                              }}
                            >
                              <AppText
                                style={[
                                  styles.bulkGroupModeButtonText,
                                  selectedOption ? styles.bulkGroupModeButtonTextActive : null,
                                ]}
                              >
                                {option.label}
                              </AppText>
                            </Pressable>
                          );
                        })}
                      </View>
                      {bulkEntryMode === "catch_up" ? (
                        <>
                      <AppText style={styles.bulkGroupFieldLabel}>Group title</AppText>
                      <DoneTextInput
                        value={bulkEntryTitle}
                        onChangeText={(value) => {
                          setBulkEntryTitle(value);
                          if (bulkEntryConfigError) {
                            setBulkEntryConfigError(null);
                          }
                        }}
                        placeholder="Past 2 weeks"
                        placeholderTextColor={colors.textSecondary}
                        autoCorrect={false}
                        style={[
                          styles.input,
                          bulkEntryConfigError ? styles.bulkGroupInputError : null,
                        ]}
                      />
                      {bulkEntryConfigError ? (
                        <AppText style={styles.bulkGroupErrorText}>
                          {bulkEntryConfigError}
                        </AppText>
                      ) : null}
                        </>
                      ) : (
                        <Pressable
                          style={styles.bulkCreateButton}
                          onPress={() => {
                            setBulkEntrySetupStep("event_details");
                            setBulkEntryConfigError(null);
                          }}
                        >
                          <AppText style={styles.bulkCreateButtonText}>
                            Continue to event details
                          </AppText>
                        </Pressable>
                      )}
                    </View>
                  )}
                </View>
                {!isBulkCreating && !showBulkEventDetailsStep ? (
                  <View style={styles.bulkLineupList}>
                    {lineupWines.map((wine) => (
                      <View
                        key={wine.id}
                        style={[
                          styles.bulkLineupRow,
                          wine.included ? styles.bulkLineupRowActive : null,
                        ]}
                      >
                        <Pressable
                          style={styles.bulkLineupRowMain}
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
                              {resolveLineupWineDisplayName(wine)}
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
                        <Pressable
                          style={styles.bulkLineupCropButton}
                          onPress={() => openCropEditorForLineupWine(wine)}
                          disabled={isBulkCreating}
                        >
                          <AppText style={styles.bulkLineupCropButtonText}>
                            {wine.focus_crop_data_url ? "Edit crop" : "Crop"}
                          </AppText>
                        </Pressable>
                      </View>
                    ))}
                  </View>
                ) : null}
                {bulkCreateMessage ? (
                  isBulkCreating ? (
                    <View style={styles.uploadLoadingRow}>
                      <ActivityIndicator size="small" color={colors.accentPrimary} />
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
                {!isBulkCreating &&
                !showBulkEventDetailsStep &&
                bulkEntryMode === "catch_up" ? (
                  <Pressable
                    style={[
                      styles.bulkCreateButton,
                      includedLineupWines.length === 0
                        ? styles.submitButtonDisabled
                        : null,
                    ]}
                    onPress={() => void createBulkEntriesFromLineup()}
                    disabled={includedLineupWines.length === 0}
                  >
                    <AppText style={styles.bulkCreateButtonText}>
                      Create {includedLineupWines.length} entr
                      {includedLineupWines.length === 1 ? "y" : "ies"}
                    </AppText>
                  </Pressable>
                ) : null}
              </View>
            ) : null}
          </View>

          {!isBulkLineupMode ? (
            <>
              <View style={styles.drinkingNowCard}>
                <View style={styles.drinkingNowCopy}>
                  <AppText style={styles.drinkingNowTitle}>Drinking Now</AppText>
                  <AppText style={styles.drinkingNowDescription}>
                    Friends will see a light blue glow on Home and Feed for 2.5 hours.
                  </AppText>
                </View>
                <Switch
                  value={form.drinking_now}
                  onValueChange={(value) => updateField("drinking_now", value)}
                  trackColor={{
                    false: colors.borderStrong,
                    true: "rgba(123,29,58,0.38)",
                  }}
                  thumbColor={form.drinking_now ? colors.info : colors.surfaceRaised}
                  ios_backgroundColor={colors.borderStrong}
                />
              </View>

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
                    keyboardType="number-pad"
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
                    placeholderTextColor={colors.textSecondary}
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
                        ref={locationInputRef}
                        value={form.location_text}
                        onChangeText={(value) => {
                          updateField("location_text", value);
                          if (form.location_place_id) {
                            updateField("location_place_id", "");
                          }
                        }}
                        onFocus={() => {
                          setIsLocationFocused(true);
                          ensureLocationInputVisible();
                        }}
                        onBlur={() => {
                          setTimeout(() => {
                            setIsLocationFocused(false);
                            setLocationSuggestions([]);
                          }, 120);
                        }}
                        autoCapitalize="words"
                        autoCorrect={false}
                        placeholder="Search places"
                        placeholderTextColor={colors.textSecondary}
                        style={styles.input}
                      />
                      {isLocationFocused && locationSuggestions.length > 0 ? (
                        <View style={styles.suggestionOverlay}>
                          <View style={styles.suggestionList}>
                            {locationSuggestions.map((suggestion) => (
                              <Pressable
                                key={suggestion.place_id}
                                style={styles.suggestionItem}
                                onPress={() => {
                                  updateField("location_text", suggestion.description);
                                  updateField("location_place_id", suggestion.place_id);
                                  setIsLocationFocused(false);
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
                    <ActivityIndicator color={colors.screenBg} />
                  ) : (
                    <AppText style={styles.submitButtonText}>Save entry</AppText>
                  )}
                </Pressable>
                <Pressable
                  style={styles.cancelButton}
                  onPress={returnFromNewEntry}
                >
                  <AppText style={styles.cancelButtonText}>Cancel</AppText>
                </Pressable>
              </View>
            </>
          ) : null}
        </View>
      </ScrollView>
      <Modal
        visible={bulkGroupInfoOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setBulkGroupInfoOpen(false)}
      >
        <View style={styles.cropModalBackdrop}>
          <View style={styles.bulkInfoModalCard}>
            <View style={styles.cropModalHeader}>
              <AppText style={styles.cropModalTitle}>Event vs Catch-up</AppText>
              <Pressable onPress={() => setBulkGroupInfoOpen(false)} hitSlop={8}>
                <AppText style={styles.cropModalCloseText}>Close</AppText>
              </Pressable>
            </View>
            <View style={styles.block}>
              <AppText style={styles.bulkGroupFieldLabel}>Event</AppText>
              <AppText style={styles.hint}>
                Use this for one tasting, dinner, or wine event. Every wine will share
                the same event details.
              </AppText>
            </View>
            <View style={styles.block}>
              <AppText style={styles.bulkGroupFieldLabel}>Catch-up</AppText>
              <AppText style={styles.hint}>
                Use this when you are logging wines from different days after the fact.
                Each wine keeps its own details in review.
              </AppText>
            </View>
          </View>
        </View>
      </Modal>
      <Modal
        visible={Boolean(activeCropPhoto)}
        transparent
        animationType="fade"
        onRequestClose={closeCropEditor}
      >
        <View style={styles.cropModalBackdrop}>
          <View style={styles.cropModalCard}>
            <View style={styles.cropModalHeader}>
              <AppText style={styles.cropModalTitle}>
                {activeCropLineupWine ? "Edit bottle crop" : "Edit crop"}
              </AppText>
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
                  <ActivityIndicator size="small" color={colors.accentPrimary} />
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
              <Pressable style={styles.cancelButton} onPress={closeCropEditor}>
                <AppText style={styles.cancelButtonText}>Cancel</AppText>
              </Pressable>
              <Pressable
                style={[styles.submitButton, isSavingCrop ? styles.submitButtonDisabled : null]}
                onPress={() => void saveCropEdits()}
                disabled={isSavingCrop || cropSourceLoading || !activeCropPhoto}
              >
                {isSavingCrop ? (
                  <ActivityIndicator color={colors.screenBg} />
                ) : (
                  <AppText style={styles.submitButtonText}>Save crop</AppText>
                )}
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
      <PostSaveSurveyModal
        pendingPostSaveSurvey={pendingPostSaveSurvey}
        postSaveSurveyStep={postSaveSurveyStep}
        surveyHowWasIt={surveyHowWasIt}
        surveyExpectations={surveyExpectations}
        surveyDrinkAgain={surveyDrinkAgain}
        surveyErrorMessage={surveyErrorMessage}
        isSubmittingSurvey={isSubmittingSurvey}
        canSubmitPostSaveSurvey={canSubmitPostSaveSurvey}
        howWasItOptions={HOW_WAS_IT_OPTIONS}
        expectationsOptions={EXPECTATIONS_OPTIONS}
        drinkAgainOptions={DRINK_AGAIN_OPTIONS}
        onSurveyHowWasItChange={setSurveyHowWasIt}
        onSurveyExpectationsChange={setSurveyExpectations}
        onSurveyDrinkAgainChange={setSurveyDrinkAgain}
        onSubmitPostSaveSurvey={submitPostSaveSurvey}
        onSkipPostSaveComparison={skipPostSaveComparison}
        onSubmitPostSaveComparison={submitPostSaveComparison}
      />
    </KeyboardAvoidingView>
  );
}

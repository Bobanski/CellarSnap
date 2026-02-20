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
  error?: string;
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
  const [labelPhotoUri, setLabelPhotoUri] = useState<string | null>(null);
  const [isAutofillLoading, setIsAutofillLoading] = useState(false);
  const [uploadMessage, setUploadMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const updateField = <K extends keyof EntryFormState>(field: K, value: EntryFormState[K]) => {
    setForm((current) => ({ ...current, [field]: value }));
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

  const analyzeLabelPhoto = async (uri: string) => {
    if (!WEB_API_BASE_URL) {
      setUploadMessage(
        "Set EXPO_PUBLIC_WEB_API_BASE_URL to enable label autofill on upload."
      );
      return;
    }

    const { data: sessionResult } = await supabase.auth.getSession();
    const accessToken = sessionResult.session?.access_token;
    if (!accessToken) {
      setUploadMessage("Session expired. Sign in again to use label autofill.");
      return;
    }

    setIsAutofillLoading(true);
    setUploadMessage("Analyzing label...");

    try {
      const formData = new FormData();
      formData.append(
        "label",
        {
          uri,
          name: `label-${Date.now()}.jpg`,
          type: "image/jpeg",
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
        setUploadMessage(payload.error || "Could not read this label. Try a clearer photo.");
        setIsAutofillLoading(false);
        return;
      }

      const grapesFilled = await applyLabelAutofill(payload);
      setUploadMessage(
        grapesFilled
          ? "Label details filled and primary grapes preselected."
          : "Label details filled. Review and adjust as needed."
      );
      setIsAutofillLoading(false);
    } catch {
      setUploadMessage("Unable to analyze label. Check your connection and try again.");
      setIsAutofillLoading(false);
    }
  };

  const pickLabelImage = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      setUploadMessage("Allow photo access to upload a label image.");
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsMultipleSelection: false,
      quality: 0.85,
    });
    if (result.canceled) {
      return;
    }

    const asset = result.assets[0];
    if (!asset?.uri) {
      setUploadMessage("No image selected.");
      return;
    }

    setLabelPhotoUri(asset.uri);
    await analyzeLabelPhoto(asset.uri);
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
      setIsSubmitting(false);

      if (error) {
        setErrorMessage(error.message);
        return;
      }

      if (entryId) {
        await persistPrimaryGrapes(entryId);
      }
      router.replace("/(app)/entries");
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

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      style={styles.screen}
    >
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={styles.navRow}>
          <AppText style={styles.navBrand}>CellarSnap</AppText>
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
            {labelPhotoUri ? (
              // eslint-disable-next-line jsx-a11y/alt-text
              <Image source={{ uri: labelPhotoUri }} style={styles.uploadPreview} resizeMode="cover" />
            ) : null}
            {uploadMessage ? <AppText style={[styles.hint, styles.uploadHint]}>{uploadMessage}</AppText> : null}
            <Pressable
              style={[styles.ghostButton, styles.uploadActionButton]}
              onPress={() => void pickLabelImage()}
              disabled={isAutofillLoading}
            >
              <AppText style={styles.ghostButtonText}>
                {isAutofillLoading
                  ? "Analyzing..."
                  : labelPhotoUri
                  ? "Change image"
                  : "Upload images"}
              </AppText>
            </Pressable>
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
            <View style={styles.locationDateRow}>
              <View style={styles.locationDateLocationCol}>
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
                              <AppText style={styles.suggestionText}>{suggestion.description}</AppText>
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
              </View>
              <View style={styles.locationDateDateCol}>
                <DateField
                  label="Consumed date"
                  value={form.consumed_at}
                  onChange={(value) => updateField("consumed_at", value)}
                />
              </View>
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
                        <AppText style={[styles.friendText, selected ? styles.friendTextActive : null]}>
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
            <Pressable style={styles.submitButton} onPress={() => void submit()} disabled={isSubmitting}>
              {isSubmitting ? (
                <ActivityIndicator color="#09090b" />
              ) : (
                <AppText style={styles.submitButtonText}>Save entry</AppText>
              )}
            </Pressable>
            <Pressable style={styles.cancelButton} onPress={() => router.replace("/(app)/entries")}>
              <AppText style={styles.cancelButtonText}>Cancel</AppText>
            </Pressable>
          </View>
        </View>
      </ScrollView>
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
}: {
  label: string;
  value: string;
  options: ReadonlyArray<ChipOption>;
  onChange: (value: string) => void;
  hideLabel?: boolean;
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
    options.find((option) => option.value === value)?.label ?? "Not set";

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
    <View style={styles.block}>
      {hideLabel ? null : <AppText style={styles.label}>{label}</AppText>}
      <Pressable ref={triggerRef} style={styles.selectTrigger} onPress={openPopover}>
        <AppText style={styles.selectTriggerText} numberOfLines={1}>
          {selectedLabel}
        </AppText>
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
                styles.selectPopoverCard,
                {
                  top: popoverLayout.top,
                  left: popoverLayout.left,
                  width: popoverLayout.width,
                  maxHeight: popoverLayout.maxHeight,
                },
              ]}
            >
            <View style={styles.selectModalHeader}>
              <AppText style={styles.selectModalTitle}>{label}</AppText>
              <Pressable onPress={() => setIsOpen(false)}>
                <AppText style={styles.selectModalCloseText}>Close</AppText>
              </Pressable>
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
  uploadPreview: {
    width: "100%",
    height: 136,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.12)",
    backgroundColor: "rgba(0, 0, 0, 0.3)",
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
  locationDateRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
  },
  locationDateLocationCol: {
    flex: 1.55,
    minWidth: 0,
  },
  locationDateDateCol: {
    flex: 1,
    minWidth: 0,
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
  accordionTitle: { color: "#f4f4f5", fontSize: 14, fontWeight: "700" },
  accordionBody: {
    borderTopWidth: 1,
    borderTopColor: "rgba(255, 255, 255, 0.07)",
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 8,
  },
  accordionFields: { gap: 10 },
  block: { gap: 6 },
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
  selectTriggerText: { color: "#f4f4f5", fontSize: 14, flex: 1 },
  selectChevron: { color: "#a1a1aa", fontSize: 12, fontWeight: "700" },
  selectPopoverCard: {
    position: "absolute",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.18)",
    backgroundColor: "#1d1f26",
    padding: 14,
    gap: 10,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.45,
    shadowRadius: 18,
    elevation: 20,
  },
  selectModalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  selectModalTitle: {
    color: "#f4f4f5",
    fontSize: 15,
    fontWeight: "700",
  },
  selectModalCloseText: {
    color: "#d4d4d8",
    fontSize: 12,
    fontWeight: "700",
  },
  selectPopoverList: {
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.08)",
  },
  selectOption: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: "rgba(255, 255, 255, 0.06)",
  },
  selectOptionSelected: {
    backgroundColor: "rgba(251, 191, 36, 0.16)",
  },
  selectOptionText: {
    color: "#d4d4d8",
    fontSize: 13,
    fontWeight: "600",
  },
  selectOptionTextSelected: {
    color: "#fde68a",
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

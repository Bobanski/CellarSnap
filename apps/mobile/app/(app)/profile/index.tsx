import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import * as ImagePicker from "expo-image-picker";
import {
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  View,
  type TextInputProps,
} from "react-native";
import {
  PHONE_FORMAT_MESSAGE,
  PRIVACY_LEVEL_LABELS,
  USERNAME_FORMAT_MESSAGE,
  USERNAME_MIN_LENGTH,
  USERNAME_MIN_LENGTH_MESSAGE,
  formatPhoneForInput,
  isUsernameFormatValid,
  normalizePhone,
  normalizePrivacyLevel,
  type PrivacyLevel,
} from "@cellarsnap/shared";
import { AppTopBar } from "@/src/components/AppTopBar";
import { AppText } from "@/src/components/AppText";
import { DoneTextInput } from "@/src/components/DoneTextInput";
import { supabase } from "@/src/lib/supabase";
import { useAuth } from "@/src/providers/AuthProvider";

type EntryTile = {
  id: string;
  wine_name: string | null;
  label_image_url: string | null;
};

type Badge = {
  id: string;
  name: string;
  symbol: string;
  threshold: number;
  count: number;
  earned: boolean;
};

type BadgeConfig = {
  id: string;
  name: string;
  symbol: string;
  threshold: number;
  orFilter?: string;
  ilike?: [string, string];
};

type FriendProfile = {
  id: string;
  display_name: string | null;
  email: string | null;
  avatar_url: string | null;
};

type Friend = FriendProfile & { request_id: string | null; tasting_count: number };

type Suggestion = FriendProfile & { mutual_count: number };

type IncomingRequest = {
  id: string;
  requester: FriendProfile;
  created_at: string;
  seen_at: string | null;
};

type OutgoingRequest = {
  id: string;
  recipient: FriendProfile;
  created_at: string;
};

type ProfileData = {
  id: string;
  display_name: string | null;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  phone: string | null;
  bio: string | null;
  default_entry_privacy: PrivacyLevel;
  default_reaction_privacy: PrivacyLevel;
  default_comments_privacy: PrivacyLevel;
  created_at: string | null;
  avatar_path: string | null;
  avatar_url: string | null;
};

type SearchUser = {
  id: string;
  display_name: string | null;
  email: string | null;
};

type FriendRequestRow = {
  id: string;
  requester_id: string;
  recipient_id: string;
  status: string;
  created_at: string;
  seen_at?: string | null;
};

const PAGE_SIZE = 30;
const AVATAR_EXTENSIONS = ["jpg", "png", "webp", "gif"] as const;
const BADGE_DEFINITIONS: BadgeConfig[] = [
  {
    id: "burgundy_bitch",
    name: "Burgundy Bitch",
    symbol: "👑",
    threshold: 10,
    orFilter: "region.ilike.%burgundy%,region.ilike.%bourgogne%",
  },
  {
    id: "california_king",
    name: "California King",
    symbol: "☀️",
    threshold: 10,
    ilike: ["region", "%california%"],
  },
  {
    id: "bordeaux_hoe",
    name: "Bordeaux Hoe",
    symbol: "🏰",
    threshold: 10,
    ilike: ["region", "%bordeaux%"],
  },
  {
    id: "rioja_renegade",
    name: "Rioja Renegade",
    symbol: "🤠",
    threshold: 10,
    orFilter: "region.ilike.%rioja%,appellation.ilike.%rioja%",
  },
  {
    id: "sangiovese_savage",
    name: "Sangiovese Savage",
    symbol: "🐺",
    threshold: 10,
    orFilter: "region.ilike.%chianti%,appellation.ilike.%chianti%",
  },
  {
    id: "rhone_rider",
    name: "Rhone Rider",
    symbol: "🏇",
    threshold: 10,
    orFilter: "region.ilike.%rhone%,region.ilike.%rhône%",
  },
  {
    id: "margaux_monarch",
    name: "Margaux Monarch",
    symbol: "👸",
    threshold: 10,
    ilike: ["appellation", "%margaux%"],
  },
  {
    id: "chianti_connoisseur",
    name: "Chianti Connoisseur",
    symbol: "🍷",
    threshold: 10,
    orFilter: "region.ilike.%chianti%,appellation.ilike.%chianti%",
  },
  {
    id: "mosel_maniac",
    name: "Mosel Maniac",
    symbol: "🌊",
    threshold: 10,
    ilike: ["region", "%mosel%"],
  },
  {
    id: "champagne_champion",
    name: "Champagne Champion",
    symbol: "🥂",
    threshold: 10,
    ilike: ["region", "%champagne%"],
  },
];

const PRIVACY_OPTIONS: Array<{ value: PrivacyLevel; label: string }> = [
  { value: "public", label: PRIVACY_LEVEL_LABELS.public },
  { value: "friends_of_friends", label: PRIVACY_LEVEL_LABELS.friends_of_friends },
  { value: "friends", label: PRIVACY_LEVEL_LABELS.friends },
  { value: "private", label: PRIVACY_LEVEL_LABELS.private },
];

function displayFriendName(profile: FriendProfile | null) {
  return profile?.display_name ?? profile?.email ?? "Unknown";
}

function formatMemberSince(value: string | null): string {
  if (!value) {
    return "Unknown";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "Unknown";
  }
  return date.toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
  });
}

function getAvatarFallbackLetter(name: string | null, email: string | null) {
  const source = name?.trim() || email?.trim() || "?";
  return source[0]?.toUpperCase() ?? "?";
}

function isMissingColumn(message: string, column: string) {
  return message.includes(column) || message.includes("column");
}

function hasKnownProfileColumnError(message: string) {
  return (
    isMissingColumn(message, "first_name") ||
    isMissingColumn(message, "last_name") ||
    isMissingColumn(message, "phone") ||
    isMissingColumn(message, "bio") ||
    isMissingColumn(message, "avatar_path") ||
    isMissingColumn(message, "default_reaction_privacy") ||
    isMissingColumn(message, "default_comments_privacy") ||
    isMissingColumn(message, "default_entry_privacy") ||
    isMissingColumn(message, "privacy_confirmed_at")
  );
}

function sanitizeUserSearch(search: string) {
  return search.replace(/[(),]/g, " ").replace(/\s+/g, " ").trim();
}

function createUuid() {
  if (typeof globalThis.crypto?.randomUUID === "function") {
    return globalThis.crypto.randomUUID();
  }
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (char) => {
    const random = Math.floor(Math.random() * 16);
    const value = char === "x" ? random : (random & 0x3) | 0x8;
    return value.toString(16);
  });
}

async function createSignedUrl(path: string | null) {
  if (!path || path === "pending") {
    return null;
  }
  const { data, error } = await supabase.storage
    .from("wine-photos")
    .createSignedUrl(path, 60 * 60);
  if (error) {
    return null;
  }
  return data.signedUrl;
}

async function createSignedUrlMap(paths: string[]) {
  const uniquePaths = Array.from(
    new Set(paths.filter((path) => Boolean(path && path !== "pending")))
  );
  const map = new Map<string, string | null>();

  await Promise.all(
    uniquePaths.map(async (path) => {
      const { data, error } = await supabase.storage
        .from("wine-photos")
        .createSignedUrl(path, 60 * 60);
      map.set(path, error ? null : data.signedUrl);
    })
  );

  return map;
}

export default function ProfileScreen() {
  const { user } = useAuth();
  const didHydrateEditFields = useRef(false);
  const authMode = process.env.EXPO_PUBLIC_AUTH_MODE === "phone" ? "phone" : "email";

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadErrorMessage, setLoadErrorMessage] = useState<string | null>(null);
  const [profile, setProfile] = useState<ProfileData | null>(null);

  const [galleryTab, setGalleryTab] = useState<"mine" | "tagged">("mine");
  const [entries, setEntries] = useState<EntryTile[]>([]);
  const [entriesLoading, setEntriesLoading] = useState(false);
  const [entriesOffset, setEntriesOffset] = useState(0);
  const [entriesHasMore, setEntriesHasMore] = useState(false);
  const [wineCount, setWineCount] = useState<number | null>(null);

  const [taggedEntries, setTaggedEntries] = useState<EntryTile[]>([]);
  const [taggedLoaded, setTaggedLoaded] = useState(false);
  const [taggedLoading, setTaggedLoading] = useState(false);

  const [friendCount, setFriendCount] = useState<number | null>(null);
  const [badges, setBadges] = useState<Badge[]>([]);

  const [settingsOpen, setSettingsOpen] = useState(false);
  const [isSavingProfile, setIsSavingProfile] = useState(false);
  const [profileErrorMessage, setProfileErrorMessage] = useState<string | null>(null);
  const [profileSuccessMessage, setProfileSuccessMessage] = useState<string | null>(null);
  const [pendingAvatarAsset, setPendingAvatarAsset] =
    useState<ImagePicker.ImagePickerAsset | null>(null);
  const [pendingAvatarPreviewUri, setPendingAvatarPreviewUri] = useState<string | null>(
    null
  );
  const [avatarErrorMessage, setAvatarErrorMessage] = useState<string | null>(null);

  const [editUsername, setEditUsername] = useState("");
  const [editFirstName, setEditFirstName] = useState("");
  const [editLastName, setEditLastName] = useState("");
  const [editEmail, setEditEmail] = useState("");
  const [editPhone, setEditPhone] = useState("");
  const [editBio, setEditBio] = useState("");

  const [entryPrivacyValue, setEntryPrivacyValue] = useState<PrivacyLevel>("public");
  const [reactionPrivacyValue, setReactionPrivacyValue] = useState<PrivacyLevel>("public");
  const [commentsPrivacyValue, setCommentsPrivacyValue] =
    useState<PrivacyLevel>("friends_of_friends");
  const [isSavingPrivacy, setIsSavingPrivacy] = useState(false);
  const [privacyMessage, setPrivacyMessage] = useState<string | null>(null);

  const [isPasswordOpen, setIsPasswordOpen] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [passwordSuccess, setPasswordSuccess] = useState<string | null>(null);
  const [isSavingPassword, setIsSavingPassword] = useState(false);

  const [friendsOpen, setFriendsOpen] = useState(false);
  const [friendsLoading, setFriendsLoading] = useState(false);
  const [friends, setFriends] = useState<Friend[]>([]);
  const [incomingRequests, setIncomingRequests] = useState<IncomingRequest[]>([]);
  const [outgoingRequests, setOutgoingRequests] = useState<OutgoingRequest[]>([]);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [friendErrorMessage, setFriendErrorMessage] = useState<string | null>(null);
  const [friendSearch, setFriendSearch] = useState("");
  const [searchResults, setSearchResults] = useState<SearchUser[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [isMutatingFriend, setIsMutatingFriend] = useState(false);
  const [confirmingCancel, setConfirmingCancel] = useState<string | null>(null);
  const [confirmingRemove, setConfirmingRemove] = useState<string | null>(null);

  const fullName = useMemo(() => {
    if (!profile) {
      return "";
    }
    return [profile.first_name?.trim() || null, profile.last_name?.trim() || null]
      .filter((value): value is string => Boolean(value))
      .join(" ");
  }, [profile]);

  const friendIdSet = useMemo(() => new Set(friends.map((friend) => friend.id)), [friends]);
  const outgoingIdSet = useMemo(
    () => new Set(outgoingRequests.map((request) => request.recipient.id)),
    [outgoingRequests]
  );
  const incomingIdSet = useMemo(
    () => new Set(incomingRequests.map((request) => request.requester.id)),
    [incomingRequests]
  );

  const ensureProfileRowExists = useCallback(async () => {
    if (!user) {
      return;
    }

    const existing = await supabase
      .from("profiles")
      .select("id")
      .eq("id", user.id)
      .maybeSingle();

    if (existing.data?.id || existing.error) {
      return;
    }

    const insertPayload: Record<string, string> = { id: user.id };
    if (typeof user.email === "string" && user.email.trim()) {
      insertPayload.email = user.email.trim().toLowerCase();
    }
    if (typeof user.phone === "string" && user.phone.trim()) {
      insertPayload.phone = user.phone.trim();
    }

    const inserted = await supabase.from("profiles").insert(insertPayload);
    if (!inserted.error) {
      return;
    }

    if (inserted.error.message.includes("email") || inserted.error.message.includes("phone")) {
      await supabase.from("profiles").insert({ id: user.id });
    }
  }, [user]);

  const loadProfileData = useCallback(
    async (syncEditFields: boolean) => {
      if (!user) {
        return;
      }

      setLoadErrorMessage(null);
      await ensureProfileRowExists();

      let profileRow: Record<string, unknown> | null = null;
      let includesNames = true;
      let includesPhone = true;
      let includesBio = true;
      let includesAvatar = true;
      let includesInteractionDefaults = true;

      const fullAttempt = await supabase
        .from("profiles")
        .select(
          "id, display_name, first_name, last_name, email, phone, bio, default_entry_privacy, default_reaction_privacy, default_comments_privacy, created_at, avatar_path"
        )
        .eq("id", user.id)
        .maybeSingle();

      profileRow = fullAttempt.data as Record<string, unknown> | null;

      if (fullAttempt.error) {
        if (!hasKnownProfileColumnError(fullAttempt.error.message)) {
          throw new Error(fullAttempt.error.message);
        }
        const fallback = await supabase
          .from("profiles")
          .select("id, display_name, email, default_entry_privacy, created_at")
          .eq("id", user.id)
          .maybeSingle();
        if (fallback.error && isMissingColumn(fallback.error.message, "default_entry_privacy")) {
          const minimalFallback = await supabase
            .from("profiles")
            .select("id, display_name, email, created_at")
            .eq("id", user.id)
            .maybeSingle();
          if (minimalFallback.error) {
            throw new Error(minimalFallback.error.message);
          }
          profileRow = minimalFallback.data as Record<string, unknown> | null;
        } else if (fallback.error) {
          throw new Error(fallback.error.message);
        } else {
          profileRow = fallback.data as Record<string, unknown> | null;
        }
        includesNames = false;
        includesPhone = false;
        includesBio = false;
        includesAvatar = false;
        includesInteractionDefaults = false;
      }

      if (!profileRow) {
        setLoadErrorMessage("Unable to load profile right now.");
        return;
      }

      if (!includesNames) {
        const namesAttempt = await supabase
          .from("profiles")
          .select("first_name, last_name")
          .eq("id", user.id)
          .maybeSingle();
        if (!namesAttempt.error && namesAttempt.data) {
          profileRow.first_name = namesAttempt.data.first_name;
          profileRow.last_name = namesAttempt.data.last_name;
          includesNames = true;
        }
      }

      if (!includesPhone) {
        const phoneAttempt = await supabase
          .from("profiles")
          .select("phone")
          .eq("id", user.id)
          .maybeSingle();
        if (!phoneAttempt.error && phoneAttempt.data) {
          profileRow.phone = phoneAttempt.data.phone;
          includesPhone = true;
        }
      }

      if (!includesBio) {
        const bioAttempt = await supabase
          .from("profiles")
          .select("bio")
          .eq("id", user.id)
          .maybeSingle();
        if (!bioAttempt.error && bioAttempt.data) {
          profileRow.bio = bioAttempt.data.bio;
          includesBio = true;
        }
      }

      if (!includesAvatar) {
        const avatarAttempt = await supabase
          .from("profiles")
          .select("avatar_path")
          .eq("id", user.id)
          .maybeSingle();
        if (!avatarAttempt.error && avatarAttempt.data) {
          profileRow.avatar_path = avatarAttempt.data.avatar_path;
          includesAvatar = true;
        }
      }

      if (!includesInteractionDefaults) {
        const defaultsAttempt = await supabase
          .from("profiles")
          .select("default_reaction_privacy, default_comments_privacy")
          .eq("id", user.id)
          .maybeSingle();
        if (!defaultsAttempt.error && defaultsAttempt.data) {
          profileRow.default_reaction_privacy = defaultsAttempt.data.default_reaction_privacy;
          profileRow.default_comments_privacy = defaultsAttempt.data.default_comments_privacy;
        }
      }

      const avatarPath =
        typeof profileRow.avatar_path === "string" ? profileRow.avatar_path : null;
      const avatarUrl = await createSignedUrl(avatarPath);
      const nextProfile: ProfileData = {
        id: String(profileRow.id ?? user.id),
        display_name:
          typeof profileRow.display_name === "string" ? profileRow.display_name : null,
        first_name:
          typeof profileRow.first_name === "string" ? profileRow.first_name : null,
        last_name:
          typeof profileRow.last_name === "string" ? profileRow.last_name : null,
        email: typeof profileRow.email === "string" ? profileRow.email : null,
        phone: typeof profileRow.phone === "string" ? profileRow.phone : null,
        bio: typeof profileRow.bio === "string" ? profileRow.bio : null,
        default_entry_privacy: normalizePrivacyLevel(
          profileRow.default_entry_privacy,
          "public"
        ),
        default_reaction_privacy: normalizePrivacyLevel(
          profileRow.default_reaction_privacy,
          "public"
        ),
        default_comments_privacy: normalizePrivacyLevel(
          profileRow.default_comments_privacy,
          "friends_of_friends"
        ),
        created_at:
          typeof profileRow.created_at === "string" ? profileRow.created_at : null,
        avatar_path: avatarPath,
        avatar_url: avatarUrl,
      };

      setProfile(nextProfile);
      setEntryPrivacyValue(nextProfile.default_entry_privacy);
      setReactionPrivacyValue(nextProfile.default_reaction_privacy);
      setCommentsPrivacyValue(nextProfile.default_comments_privacy);

      if (syncEditFields || !didHydrateEditFields.current) {
        setEditUsername(nextProfile.display_name ?? "");
        setEditFirstName(nextProfile.first_name ?? "");
        setEditLastName(nextProfile.last_name ?? "");
        setEditEmail(nextProfile.email ?? "");
        setEditPhone(formatPhoneForInput(nextProfile.phone ?? ""));
        setEditBio(nextProfile.bio ?? "");
        didHydrateEditFields.current = true;
      }
    },
    [ensureProfileRowExists, user]
  );

  const loadEntriesData = useCallback(
    async (reset: boolean) => {
      if (!user) {
        return;
      }
      setEntriesLoading(true);
      const start = reset ? 0 : entriesOffset;
      const end = start + PAGE_SIZE - 1;

      try {
        const { data, error, count } = await supabase
          .from("wine_entries")
          .select(
            "id, wine_name, label_image_path, consumed_at, created_at",
            { count: "exact" }
          )
          .eq("user_id", user.id)
          .order("consumed_at", { ascending: false })
          .order("created_at", { ascending: false })
          .range(start, end);

        if (error) {
          return;
        }

        const rows = (data ?? []) as {
          id: string;
          wine_name: string | null;
          label_image_path: string | null;
        }[];
        const entryIds = rows.map((row) => row.id);

        const labelResponse =
          entryIds.length > 0
            ? await supabase
                .from("entry_photos")
                .select("entry_id, path, position, created_at")
                .eq("type", "label")
                .in("entry_id", entryIds)
                .order("position", { ascending: true })
                .order("created_at", { ascending: true })
            : { data: [] as { entry_id: string; path: string }[], error: null };

        const labelMap = new Map<string, string>();
        (labelResponse.data ?? []).forEach((photo) => {
          if (!labelMap.has(photo.entry_id)) {
            labelMap.set(photo.entry_id, photo.path);
          }
        });

        const paths = rows
          .map((row) => labelMap.get(row.id) ?? row.label_image_path ?? null)
          .filter((path): path is string => Boolean(path));
        const signedMap = await createSignedUrlMap(paths);

        const nextEntries: EntryTile[] = rows.map((row) => {
          const path = labelMap.get(row.id) ?? row.label_image_path ?? null;
          return {
            id: row.id,
            wine_name: row.wine_name ?? null,
            label_image_url: path ? signedMap.get(path) ?? null : null,
          };
        });

        setEntries((current) => (reset ? nextEntries : [...current, ...nextEntries]));
        setEntriesOffset(start + rows.length);
        setEntriesHasMore(
          typeof count === "number" ? start + rows.length < count : rows.length === PAGE_SIZE
        );
        if (typeof count === "number") {
          setWineCount(count);
        }
      } finally {
        setEntriesLoading(false);
      }
    },
    [entriesOffset, user]
  );

  const loadTaggedEntries = useCallback(async () => {
    if (!user) {
      return;
    }
    setTaggedLoading(true);

    try {
      const { data, error } = await supabase
        .from("wine_entries")
        .select("id, wine_name, label_image_path, created_at")
        .contains("tasted_with_user_ids", [user.id])
        .order("created_at", { ascending: false })
        .limit(90);

      if (error) {
        return;
      }

      const rows = (data ?? []) as {
        id: string;
        wine_name: string | null;
        label_image_path: string | null;
      }[];
      const entryIds = rows.map((row) => row.id);

      const labelResponse =
        entryIds.length > 0
          ? await supabase
              .from("entry_photos")
              .select("entry_id, path, position, created_at")
              .eq("type", "label")
              .in("entry_id", entryIds)
              .order("position", { ascending: true })
              .order("created_at", { ascending: true })
          : { data: [] as { entry_id: string; path: string }[] };

      const labelMap = new Map<string, string>();
      (labelResponse.data ?? []).forEach((photo) => {
        if (!labelMap.has(photo.entry_id)) {
          labelMap.set(photo.entry_id, photo.path);
        }
      });

      const paths = rows
        .map((row) => labelMap.get(row.id) ?? row.label_image_path ?? null)
        .filter((path): path is string => Boolean(path));
      const signedMap = await createSignedUrlMap(paths);

      const nextTagged: EntryTile[] = rows.map((row) => {
        const path = labelMap.get(row.id) ?? row.label_image_path ?? null;
        return {
          id: row.id,
          wine_name: row.wine_name ?? null,
          label_image_url: path ? signedMap.get(path) ?? null : null,
        };
      });
      setTaggedEntries(nextTagged);
    } finally {
      setTaggedLoaded(true);
      setTaggedLoading(false);
    }
  }, [user]);

  const loadFriendCount = useCallback(async () => {
    if (!user) {
      return;
    }
    const { count, error } = await supabase
      .from("friend_requests")
      .select("id", { count: "exact", head: true })
      .eq("status", "accepted")
      .or(`requester_id.eq.${user.id},recipient_id.eq.${user.id}`);

    if (error) {
      return;
    }
    setFriendCount(count ?? 0);
  }, [user]);

  const loadBadges = useCallback(async () => {
    if (!user) {
      return;
    }

    const nextBadges = await Promise.all(
      BADGE_DEFINITIONS.map(async (badge) => {
        let query = supabase
          .from("wine_entries")
          .select("id", { count: "exact", head: true })
          .eq("user_id", user.id);

        if (badge.orFilter) {
          query = query.or(badge.orFilter);
        } else if (badge.ilike) {
          query = query.ilike(badge.ilike[0], badge.ilike[1]);
        }

        const { count } = await query;
        const badgeCount = count ?? 0;
        return {
          id: badge.id,
          name: badge.name,
          symbol: badge.symbol,
          threshold: badge.threshold,
          count: badgeCount,
          earned: badgeCount >= badge.threshold,
        } satisfies Badge;
      })
    );

    setBadges(nextBadges);
  }, [user]);

  const loadProfileScreen = useCallback(
    async (refresh = false, syncEditFields = false) => {
      if (!user) {
        setLoading(false);
        return;
      }
      if (refresh) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }

      try {
        await Promise.all([
          loadProfileData(syncEditFields),
          loadEntriesData(true),
          loadFriendCount(),
          loadBadges(),
        ]);
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : "Unable to load profile right now.";
        setLoadErrorMessage(message);
      } finally {
        if (refresh) {
          setRefreshing(false);
        } else {
          setLoading(false);
        }
      }
    },
    [loadBadges, loadEntriesData, loadFriendCount, loadProfileData, user]
  );

  const loadProfilesByIds = useCallback(async (ids: string[]) => {
    if (ids.length === 0) {
      return [] as FriendProfile[];
    }
    const uniqueIds = Array.from(new Set(ids));
    const withAvatar = await supabase
      .from("profiles")
      .select("id, display_name, email, avatar_path")
      .in("id", uniqueIds);

    let rows = withAvatar.data as
      | {
          id: string;
          display_name: string | null;
          email: string | null;
          avatar_path?: string | null;
        }[]
      | null;

    if (withAvatar.error && isMissingColumn(withAvatar.error.message, "avatar_path")) {
      const fallback = await supabase
        .from("profiles")
        .select("id, display_name, email")
        .in("id", uniqueIds);
      if (fallback.error) {
        throw new Error(fallback.error.message);
      }
      rows = (fallback.data ?? []) as {
        id: string;
        display_name: string | null;
        email: string | null;
      }[];
    } else if (withAvatar.error) {
      throw new Error(withAvatar.error.message);
    }

    const pathRows = (rows ?? [])
      .map((row) => row.avatar_path ?? null)
      .filter((path): path is string => Boolean(path));
    const signedMap = await createSignedUrlMap(pathRows);
    const rowMap = new Map((rows ?? []).map((row) => [row.id, row]));

    return uniqueIds.map((id) => {
      const row = rowMap.get(id);
      const path = row?.avatar_path ?? null;
      return {
        id,
        display_name: row?.display_name ?? null,
        email: row?.email ?? null,
        avatar_url: path ? signedMap.get(path) ?? null : null,
      };
    });
  }, []);

  const loadFriendsData = useCallback(async () => {
    if (!user) {
      return;
    }

    setFriendsLoading(true);
    setFriendErrorMessage(null);

    try {
      const { data: acceptedRows, error: acceptedError } = await supabase
        .from("friend_requests")
        .select("id, requester_id, recipient_id, status")
        .eq("status", "accepted")
        .or(`requester_id.eq.${user.id},recipient_id.eq.${user.id}`);
      if (acceptedError) {
        throw new Error(acceptedError.message);
      }

      const friendRequestIdByFriendId = new Map<string, string>();
      (acceptedRows ?? []).forEach((row) => {
        const friendId = row.requester_id === user.id ? row.recipient_id : row.requester_id;
        friendRequestIdByFriendId.set(friendId, row.id);
      });
      const friendIds = Array.from(friendRequestIdByFriendId.keys());
      const friendProfiles = await loadProfilesByIds(friendIds);
      const friendProfileById = new Map(friendProfiles.map((item) => [item.id, item]));

      const frequencyMap = new Map<string, number>();
      if (friendIds.length > 0) {
        const { data: entriesWithFriends } = await supabase
          .from("wine_entries")
          .select("tasted_with_user_ids")
          .eq("user_id", user.id)
          .neq("tasted_with_user_ids", "{}");
        (entriesWithFriends ?? []).forEach((entry) => {
          (entry.tasted_with_user_ids ?? []).forEach((id: string) => {
            if (friendRequestIdByFriendId.has(id)) {
              frequencyMap.set(id, (frequencyMap.get(id) ?? 0) + 1);
            }
          });
        });
      }

      const nextFriends: Friend[] = friendIds
        .map((id) => ({
          id,
          request_id: friendRequestIdByFriendId.get(id) ?? null,
          display_name: friendProfileById.get(id)?.display_name ?? null,
          email: friendProfileById.get(id)?.email ?? null,
          avatar_url: friendProfileById.get(id)?.avatar_url ?? null,
          tasting_count: frequencyMap.get(id) ?? 0,
        }))
        .sort((left, right) =>
          displayFriendName(left).localeCompare(displayFriendName(right))
        );
      setFriends(nextFriends);

      const { data: pendingRows, error: pendingError } = await supabase
        .from("friend_requests")
        .select("id, requester_id, recipient_id, status, created_at, seen_at")
        .eq("status", "pending")
        .or(`requester_id.eq.${user.id},recipient_id.eq.${user.id}`)
        .order("created_at", { ascending: false });
      if (pendingError) {
        throw new Error(pendingError.message);
      }

      const pending = (pendingRows ?? []) as FriendRequestRow[];
      const pendingProfileIds = Array.from(
        new Set(
          pending.flatMap((row) => [row.requester_id, row.recipient_id])
        )
      );
      const pendingProfiles = await loadProfilesByIds(pendingProfileIds);
      const pendingProfileMap = new Map(pendingProfiles.map((item) => [item.id, item]));

      const nextIncoming: IncomingRequest[] = pending
        .filter((row) => row.recipient_id === user.id)
        .map((row) => ({
          id: row.id,
          requester: {
            id: row.requester_id,
            display_name: pendingProfileMap.get(row.requester_id)?.display_name ?? null,
            email: pendingProfileMap.get(row.requester_id)?.email ?? null,
            avatar_url: pendingProfileMap.get(row.requester_id)?.avatar_url ?? null,
          },
          created_at: row.created_at,
          seen_at: row.seen_at ?? null,
        }));
      const nextOutgoing: OutgoingRequest[] = pending
        .filter((row) => row.requester_id === user.id)
        .map((row) => ({
          id: row.id,
          recipient: {
            id: row.recipient_id,
            display_name: pendingProfileMap.get(row.recipient_id)?.display_name ?? null,
            email: pendingProfileMap.get(row.recipient_id)?.email ?? null,
            avatar_url: pendingProfileMap.get(row.recipient_id)?.avatar_url ?? null,
          },
          created_at: row.created_at,
        }));
      setIncomingRequests(nextIncoming);
      setOutgoingRequests(nextOutgoing);

      if (friendIds.length === 0) {
        setSuggestions([]);
      } else {
        const excludeIds = new Set<string>([user.id, ...friendIds]);
        pending.forEach((row) => {
          excludeIds.add(row.requester_id);
          excludeIds.add(row.recipient_id);
        });

        const ids = [user.id, ...friendIds];
        const idList = ids.map((id) => `"${id}"`).join(",");
        const edges = await supabase
          .from("friend_requests")
          .select("requester_id, recipient_id")
          .eq("status", "accepted")
          .or(`requester_id.in.(${idList}),recipient_id.in.(${idList})`);

        if (edges.error) {
          throw new Error(edges.error.message);
        }

        const myFriendIds = new Set(friendIds);
        const mutualCount = new Map<string, number>();

        (edges.data ?? []).forEach((row) => {
          const a = row.requester_id;
          const b = row.recipient_id;
          const myFriend = myFriendIds.has(a) ? a : myFriendIds.has(b) ? b : null;
          const candidate = myFriend === a ? b : myFriend === b ? a : null;
          if (!myFriend || !candidate || excludeIds.has(candidate)) {
            return;
          }
          mutualCount.set(candidate, (mutualCount.get(candidate) ?? 0) + 1);
        });

        const sorted = Array.from(mutualCount.entries())
          .sort((left, right) => right[1] - left[1])
          .slice(0, 5);

        const suggestionIds = sorted.map(([id]) => id);
        if (suggestionIds.length === 0) {
          setSuggestions([]);
        } else {
          const suggestionProfiles = await loadProfilesByIds(suggestionIds);
          const suggestionProfileMap = new Map(
            suggestionProfiles.map((item) => [item.id, item])
          );
          const countMap = new Map(sorted);
          setSuggestions(
            suggestionIds.map((id) => ({
              id,
              display_name: suggestionProfileMap.get(id)?.display_name ?? null,
              email: suggestionProfileMap.get(id)?.email ?? null,
              avatar_url: suggestionProfileMap.get(id)?.avatar_url ?? null,
              mutual_count: countMap.get(id) ?? 0,
            }))
          );
        }
      }
    } catch (error) {
      setFriendErrorMessage(
        error instanceof Error ? error.message : "Unable to load friends."
      );
    } finally {
      setFriendsLoading(false);
    }
  }, [loadProfilesByIds, user]);

  const closeFriends = () => {
    setFriendsOpen(false);
    setFriendSearch("");
    setSearchResults([]);
    setSearchError(null);
    setFriendErrorMessage(null);
    setConfirmingCancel(null);
    setConfirmingRemove(null);
  };

  const closeSettings = () => {
    setSettingsOpen(false);
    setProfileErrorMessage(null);
    setAvatarErrorMessage(null);
    setIsPasswordOpen(false);
    setCurrentPassword("");
    setNewPassword("");
    setConfirmPassword("");
    setPasswordError(null);
  };

  const uploadPendingAvatar = useCallback(async () => {
    if (!user || !pendingAvatarAsset) {
      return { avatarPath: null as string | null, avatarUrl: null as string | null };
    }

    const fileSize = pendingAvatarAsset.fileSize ?? 0;
    if (fileSize > 5 * 1024 * 1024) {
      throw new Error("Image must be 5 MB or smaller.");
    }

    const mimeType = pendingAvatarAsset.mimeType ?? "image/jpeg";
    if (!["image/jpeg", "image/png", "image/webp", "image/gif"].includes(mimeType)) {
      throw new Error("Image must be JPEG, PNG, WebP, or GIF.");
    }

    const ext =
      mimeType === "image/png"
        ? "png"
        : mimeType === "image/webp"
          ? "webp"
          : mimeType === "image/gif"
            ? "gif"
            : "jpg";

    const avatarPath = `${user.id}/avatar.${ext}`;
    const fileResponse = await fetch(pendingAvatarAsset.uri);
    const fileBlob = await fileResponse.blob();

    const upload = await supabase.storage
      .from("wine-photos")
      .upload(avatarPath, fileBlob, {
        upsert: true,
        contentType: mimeType,
      });
    if (upload.error) {
      throw new Error(upload.error.message);
    }

    const stalePaths = AVATAR_EXTENSIONS.map((candidateExt) => `${user.id}/avatar.${candidateExt}`)
      .filter((candidatePath) => candidatePath !== avatarPath);
    await supabase.storage.from("wine-photos").remove(stalePaths);
    const avatarUrl = await createSignedUrl(avatarPath);

    return { avatarPath, avatarUrl };
  }, [pendingAvatarAsset, user]);

  const saveProfile = useCallback(async () => {
    if (!user || !profile) {
      return;
    }

    const trimmedUsername = editUsername.trim();
    const trimmedFirstName = editFirstName.trim();
    const trimmedLastName = editLastName.trim();
    const trimmedEmail = editEmail.trim().toLowerCase();
    const trimmedPhone = editPhone.trim();
    const trimmedBio = editBio.trim();
    const normalizedPhone = trimmedPhone ? normalizePhone(trimmedPhone) : null;

    if (trimmedUsername.length < USERNAME_MIN_LENGTH) {
      setProfileErrorMessage(USERNAME_MIN_LENGTH_MESSAGE);
      return;
    }
    if (!isUsernameFormatValid(trimmedUsername)) {
      setProfileErrorMessage(USERNAME_FORMAT_MESSAGE);
      return;
    }
    if (trimmedPhone && !normalizedPhone) {
      setProfileErrorMessage(PHONE_FORMAT_MESSAGE);
      return;
    }
    if (trimmedBio.length > 100) {
      setProfileErrorMessage("Bio must be 100 characters or fewer.");
      return;
    }

    setIsSavingProfile(true);
    setProfileErrorMessage(null);
    setProfileSuccessMessage(null);
    setAvatarErrorMessage(null);

    const usernameChanged = trimmedUsername !== (profile.display_name ?? "").trim();
    const firstNameChanged = trimmedFirstName !== (profile.first_name ?? "").trim();
    const lastNameChanged = trimmedLastName !== (profile.last_name ?? "").trim();
    const phoneChanged = (normalizedPhone ?? null) !== (profile.phone ?? null);
    const bioChanged = (trimmedBio || null) !== (profile.bio ?? null);
    const emailChanged = trimmedEmail !== (profile.email ?? "").trim().toLowerCase();
    const hadPendingAvatar = Boolean(pendingAvatarAsset);

    let uploadedAvatarPath: string | null = null;
    let uploadedAvatarUrl: string | null = null;

    try {
      if (usernameChanged) {
        const lookup = await supabase
          .from("profiles")
          .select("id")
          .ilike("display_name", trimmedUsername)
          .neq("id", user.id)
          .maybeSingle();
        if (lookup.error) {
          throw new Error(lookup.error.message);
        }
        if (lookup.data) {
          setProfileErrorMessage("That username is already taken.");
          return;
        }
      }

      if (phoneChanged && normalizedPhone) {
        const phoneLookup = await supabase
          .from("profiles")
          .select("id")
          .eq("phone", normalizedPhone)
          .neq("id", user.id)
          .maybeSingle();
        if (phoneLookup.error) {
          if (isMissingColumn(phoneLookup.error.message, "phone")) {
            setProfileErrorMessage(
              "Phone profile support is temporarily unavailable."
            );
            return;
          }
          throw new Error(phoneLookup.error.message);
        }
        if (phoneLookup.data) {
          setProfileErrorMessage("That phone number is already in use.");
          return;
        }
      }

      if (pendingAvatarAsset) {
        const uploaded = await uploadPendingAvatar();
        uploadedAvatarPath = uploaded.avatarPath;
        uploadedAvatarUrl = uploaded.avatarUrl;
      }

      const updates: Record<string, string | null> = {};
      if (usernameChanged) {
        updates.display_name = trimmedUsername;
      }
      if (firstNameChanged) {
        updates.first_name = trimmedFirstName || null;
      }
      if (lastNameChanged) {
        updates.last_name = trimmedLastName || null;
      }
      if (emailChanged) {
        updates.email = trimmedEmail;
      }
      if (phoneChanged) {
        updates.phone = normalizedPhone;
      }
      if (bioChanged) {
        updates.bio = trimmedBio || null;
      }
      if (uploadedAvatarPath) {
        updates.avatar_path = uploadedAvatarPath;
      }

      let updatesToApply = { ...updates };
      while (Object.keys(updatesToApply).length > 0) {
        const result = await supabase
          .from("profiles")
          .update(updatesToApply)
          .eq("id", user.id)
          .select("id")
          .maybeSingle();

        if (!result.error) {
          break;
        }

        const message = result.error.message;
        if (message.includes("profiles_phone_unique")) {
          setProfileErrorMessage("That phone number is already in use.");
          return;
        }

        let removedUnsupportedColumn = false;
        if (isMissingColumn(message, "first_name")) {
          delete updatesToApply.first_name;
          removedUnsupportedColumn = true;
        }
        if (isMissingColumn(message, "last_name")) {
          delete updatesToApply.last_name;
          removedUnsupportedColumn = true;
        }
        if (isMissingColumn(message, "phone")) {
          delete updatesToApply.phone;
          removedUnsupportedColumn = true;
        }
        if (isMissingColumn(message, "bio")) {
          delete updatesToApply.bio;
          removedUnsupportedColumn = true;
        }
        if (isMissingColumn(message, "avatar_path")) {
          delete updatesToApply.avatar_path;
          removedUnsupportedColumn = true;
        }

        if (!removedUnsupportedColumn) {
          throw new Error(message);
        }
      }

      if (hadPendingAvatar) {
        setPendingAvatarAsset(null);
        setPendingAvatarPreviewUri(null);
      }

      await Promise.all([
        loadProfileData(true),
        loadFriendCount(),
        loadBadges(),
      ]);

      // Keep fresh avatar URL visible immediately even if profile reload raced.
      if (uploadedAvatarUrl) {
        setProfile((prev) =>
          prev
            ? {
                ...prev,
                avatar_url: uploadedAvatarUrl,
                avatar_path: uploadedAvatarPath ?? prev.avatar_path,
              }
            : prev
        );
      }

      if (
        hadPendingAvatar ||
        usernameChanged ||
        firstNameChanged ||
        lastNameChanged ||
        phoneChanged ||
        bioChanged ||
        emailChanged
      ) {
        setProfileSuccessMessage("Profile saved.");
      } else {
        setProfileSuccessMessage("No changes to save.");
      }
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unable to update profile.";
      setProfileErrorMessage(message);
      setAvatarErrorMessage(message);
    } finally {
      setIsSavingProfile(false);
    }
  }, [
    editBio,
    editEmail,
    editFirstName,
    editLastName,
    editPhone,
    editUsername,
    loadBadges,
    loadFriendCount,
    loadProfileData,
    pendingAvatarAsset,
    profile,
    uploadPendingAvatar,
    user,
  ]);

  const savePrivacyDefaults = useCallback(
    async (
      updates: Partial<{
        default_entry_privacy: PrivacyLevel;
        default_reaction_privacy: PrivacyLevel;
        default_comments_privacy: PrivacyLevel;
      }>
    ) => {
      if (!user) {
        return;
      }

      setIsSavingPrivacy(true);
      setPrivacyMessage(null);

      let updatesToApply: Record<string, string> = {
        ...updates,
        privacy_confirmed_at: new Date().toISOString(),
      };

      try {
        while (Object.keys(updatesToApply).length > 0) {
          const response = await supabase
            .from("profiles")
            .update(updatesToApply)
            .eq("id", user.id)
            .select("id")
            .maybeSingle();

          if (!response.error) {
            break;
          }

          const message = response.error.message;
          let removedUnsupportedColumn = false;
          if (isMissingColumn(message, "default_entry_privacy")) {
            delete updatesToApply.default_entry_privacy;
            removedUnsupportedColumn = true;
          }
          if (isMissingColumn(message, "default_reaction_privacy")) {
            delete updatesToApply.default_reaction_privacy;
            removedUnsupportedColumn = true;
          }
          if (isMissingColumn(message, "default_comments_privacy")) {
            delete updatesToApply.default_comments_privacy;
            removedUnsupportedColumn = true;
          }
          if (isMissingColumn(message, "privacy_confirmed_at")) {
            delete updatesToApply.privacy_confirmed_at;
            removedUnsupportedColumn = true;
          }

          if (!removedUnsupportedColumn) {
            throw new Error(message);
          }
        }

        setProfile((current) =>
          current
            ? {
                ...current,
                default_entry_privacy:
                  updates.default_entry_privacy ?? current.default_entry_privacy,
                default_reaction_privacy:
                  updates.default_reaction_privacy ?? current.default_reaction_privacy,
                default_comments_privacy:
                  updates.default_comments_privacy ?? current.default_comments_privacy,
              }
            : current
        );
        setPrivacyMessage("Default visibility settings updated.");
      } catch (error) {
        setPrivacyMessage(
          error instanceof Error
            ? error.message
            : "Unable to update privacy setting."
        );
      } finally {
        setIsSavingPrivacy(false);
      }
    },
    [user]
  );

  const savePassword = useCallback(async () => {
    setPasswordError(null);
    setPasswordSuccess(null);

    if (!profile) {
      return;
    }
    if (!currentPassword) {
      setPasswordError("Please enter your current password.");
      return;
    }
    if (newPassword.length < 8) {
      setPasswordError("New password must be at least 8 characters.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordError("Passwords do not match.");
      return;
    }

    setIsSavingPassword(true);
    try {
      const loginIdentifier =
        authMode === "phone" && profile.phone?.trim()
          ? { phone: profile.phone.trim() }
          : profile.email?.trim()
            ? { email: profile.email.trim().toLowerCase() }
            : null;

      if (!loginIdentifier) {
        setPasswordError("Unable to verify current password.");
        return;
      }

      const { error: signInError } = await supabase.auth.signInWithPassword({
        ...loginIdentifier,
        password: currentPassword,
      });
      if (signInError) {
        setPasswordError("Current password is incorrect.");
        return;
      }

      const { error: updateError } = await supabase.auth.updateUser({
        password: newPassword,
      });
      if (updateError) {
        setPasswordError(updateError.message);
        return;
      }

      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setPasswordSuccess("Password updated successfully.");
      setIsPasswordOpen(false);
    } finally {
      setIsSavingPassword(false);
    }
  }, [authMode, confirmPassword, currentPassword, newPassword, profile]);

  const sendFriendRequest = useCallback(
    async (recipientId: string) => {
      if (!user || recipientId === user.id) {
        return;
      }
      setIsMutatingFriend(true);
      setFriendErrorMessage(null);

      try {
        const reverseResult = await supabase
          .from("friend_requests")
          .select("id, status, created_at")
          .eq("requester_id", recipientId)
          .eq("recipient_id", user.id)
          .order("created_at", { ascending: false })
          .limit(10);
        if (reverseResult.error) {
          throw new Error(reverseResult.error.message);
        }
        const reverseRows = (reverseResult.data ?? []) as {
          id: string;
          status: string;
        }[];
        const reverseAccepted = reverseRows.find((row) => row.status === "accepted");
        const reversePending = reverseRows.find((row) => row.status === "pending");
        const reverse = reverseAccepted ?? reversePending ?? null;

        if (reverse) {
          if (reverse.status === "pending") {
            const nowIso = new Date().toISOString();
            const accepted = await supabase
              .from("friend_requests")
              .update({
                status: "accepted",
                responded_at: nowIso,
                seen_at: nowIso,
              })
              .eq("id", reverse.id)
              .eq("status", "pending")
              .eq("recipient_id", user.id);
            if (accepted.error) {
              throw new Error(accepted.error.message);
            }
          }

          const cleanupOutgoing = await supabase
            .from("friend_requests")
            .delete()
            .eq("requester_id", user.id)
            .eq("recipient_id", recipientId)
            .in("status", ["pending", "accepted"]);
          if (cleanupOutgoing.error) {
            throw new Error(cleanupOutgoing.error.message);
          }
          setFriendSearch("");
          await Promise.all([loadFriendsData(), loadFriendCount()]);
          return;
        }

        const existingResult = await supabase
          .from("friend_requests")
          .select("id, status, created_at")
          .eq("requester_id", user.id)
          .eq("recipient_id", recipientId)
          .order("created_at", { ascending: false })
          .limit(10);
        if (existingResult.error) {
          throw new Error(existingResult.error.message);
        }
        const existingRows = (existingResult.data ?? []) as {
          id: string;
          status: string;
        }[];
        const existingAccepted = existingRows.find((row) => row.status === "accepted");
        const existingPending = existingRows.find((row) => row.status === "pending");
        const existingDeclined = existingRows.find((row) => row.status === "declined");
        const existing = existingAccepted ?? existingPending ?? existingDeclined ?? null;

        if (existing) {
          if (existing.status === "declined") {
            const deleteDeclined = await supabase
              .from("friend_requests")
              .delete()
              .eq("requester_id", user.id)
              .eq("recipient_id", recipientId)
              .eq("status", "declined");
            if (deleteDeclined.error) {
              throw new Error(deleteDeclined.error.message);
            }

            const recreated = await supabase.from("friend_requests").insert({
              id: createUuid(),
              requester_id: user.id,
              recipient_id: recipientId,
              status: "pending",
            });
            if (recreated.error) {
              throw new Error(recreated.error.message);
            }
          }
          setFriendSearch("");
          await Promise.all([loadFriendsData(), loadFriendCount()]);
          return;
        }

        const inserted = await supabase.from("friend_requests").insert({
          id: createUuid(),
          requester_id: user.id,
          recipient_id: recipientId,
          status: "pending",
        });
        if (inserted.error) {
          throw new Error(inserted.error.message);
        }

        setFriendSearch("");
        await Promise.all([loadFriendsData(), loadFriendCount()]);
      } catch (error) {
        setFriendErrorMessage(
          error instanceof Error ? error.message : "Unable to send request."
        );
      } finally {
        setIsMutatingFriend(false);
      }
    },
    [loadFriendCount, loadFriendsData, user]
  );

  const respondToRequest = useCallback(
    async (requestId: string, action: "accept" | "decline") => {
      if (!user) {
        return;
      }
      setIsMutatingFriend(true);
      setFriendErrorMessage(null);

      try {
        const row = incomingRequests.find((request) => request.id === requestId);
        if (!row) {
          throw new Error("Request not found.");
        }
        const nowIso = new Date().toISOString();
        const update = await supabase
          .from("friend_requests")
          .update({
            status: action === "accept" ? "accepted" : "declined",
            responded_at: nowIso,
            seen_at: nowIso,
          })
          .eq("id", requestId)
          .eq("recipient_id", user.id)
          .eq("status", "pending");
        if (update.error) {
          throw new Error(update.error.message);
        }

        if (action === "accept") {
          await supabase
            .from("friend_requests")
            .delete()
            .eq("requester_id", user.id)
            .eq("recipient_id", row.requester.id)
            .in("status", ["pending", "accepted"]);
        } else {
          await supabase
            .from("friend_requests")
            .delete()
            .eq("requester_id", user.id)
            .eq("recipient_id", row.requester.id)
            .eq("status", "pending");
        }

        await Promise.all([loadFriendsData(), loadFriendCount()]);
      } catch (error) {
        setFriendErrorMessage(
          error instanceof Error ? error.message : "Unable to update request."
        );
      } finally {
        setIsMutatingFriend(false);
      }
    },
    [incomingRequests, loadFriendCount, loadFriendsData, user]
  );

  const deleteRequest = useCallback(
    async (requestId: string) => {
      if (!user) {
        return;
      }
      setIsMutatingFriend(true);
      setFriendErrorMessage(null);

      try {
        const fetched = await supabase
          .from("friend_requests")
          .select("id, requester_id, recipient_id, status")
          .eq("id", requestId)
          .maybeSingle();
        if (fetched.error) {
          throw new Error(fetched.error.message);
        }
        if (!fetched.data) {
          throw new Error("Request not found.");
        }
        if (
          fetched.data.requester_id !== user.id &&
          fetched.data.recipient_id !== user.id
        ) {
          throw new Error("Not authorized.");
        }

        if (fetched.data.status === "pending" || fetched.data.status === "accepted") {
          const [forwardDelete, reverseDelete] = await Promise.all([
            supabase
              .from("friend_requests")
              .delete()
              .eq("requester_id", fetched.data.requester_id)
              .eq("recipient_id", fetched.data.recipient_id)
              .in("status", ["pending", "accepted"]),
            supabase
              .from("friend_requests")
              .delete()
              .eq("requester_id", fetched.data.recipient_id)
              .eq("recipient_id", fetched.data.requester_id)
              .in("status", ["pending", "accepted"]),
          ]);

          if (forwardDelete.error || reverseDelete.error) {
            throw new Error(
              forwardDelete.error?.message ??
                reverseDelete.error?.message ??
                "Unable to delete request."
            );
          }
        } else {
          const singleDelete = await supabase
            .from("friend_requests")
            .delete()
            .eq("id", requestId);
          if (singleDelete.error) {
            throw new Error(singleDelete.error.message);
          }
        }

        setConfirmingCancel(null);
        setConfirmingRemove(null);
        await Promise.all([loadFriendsData(), loadFriendCount()]);
      } catch (error) {
        setFriendErrorMessage(
          error instanceof Error ? error.message : "Unable to process request."
        );
      } finally {
        setIsMutatingFriend(false);
      }
    },
    [loadFriendCount, loadFriendsData, user]
  );

  useEffect(() => {
    void loadProfileScreen(false, true);
  }, [loadProfileScreen]);

  useEffect(() => {
    if (!friendsOpen || !user) {
      return;
    }

    let isMounted = true;
    const query = friendSearch.trim();
    if (!query) {
      setSearchResults([]);
      setSearchError(null);
      setSearchLoading(false);
      return;
    }

    setSearchLoading(true);
    setSearchError(null);

    const timeout = setTimeout(() => {
      void (async () => {
        try {
          const search = sanitizeUserSearch(query);
          if (!search) {
            if (isMounted) {
              setSearchLoading(false);
              setSearchResults([]);
            }
            return;
          }
          const pattern = `%${search}%`;
          const primary = await supabase
            .from("profiles")
            .select("id, display_name, email, first_name, last_name")
            .neq("id", user.id)
            .or(
              [
                `display_name.ilike.${pattern}`,
                `email.ilike.${pattern}`,
                `first_name.ilike.${pattern}`,
                `last_name.ilike.${pattern}`,
              ].join(",")
            )
            .order("display_name", { ascending: true })
            .limit(25);

          let rows = primary.data as
            | { id: string; display_name: string | null; email: string | null }[]
            | null;
          if (
            primary.error &&
            (primary.error.message.includes("first_name") ||
              primary.error.message.includes("last_name"))
          ) {
            const fallback = await supabase
              .from("profiles")
              .select("id, display_name, email")
              .neq("id", user.id)
              .or([`display_name.ilike.${pattern}`, `email.ilike.${pattern}`].join(","))
              .order("display_name", { ascending: true })
              .limit(25);
            if (fallback.error) {
              throw new Error(fallback.error.message);
            }
            rows = (fallback.data ?? []) as {
              id: string;
              display_name: string | null;
              email: string | null;
            }[];
          } else if (primary.error) {
            throw new Error(primary.error.message);
          }

          if (!isMounted) {
            return;
          }

          setSearchResults((rows ?? []).map((row) => ({
            id: row.id,
            display_name: row.display_name ?? null,
            email: row.email ?? null,
          })));
          setSearchLoading(false);
        } catch (error) {
          if (!isMounted) {
            return;
          }
          setSearchResults([]);
          setSearchError(
            error instanceof Error ? error.message : "Unable to search users."
          );
          setSearchLoading(false);
        }
      })();
    }, 220);

    return () => {
      isMounted = false;
      clearTimeout(timeout);
    };
  }, [friendSearch, friendsOpen, user]);

  if (loading && !profile) {
    return (
      <View style={styles.screen}>
        <View style={styles.content}>
          <AppTopBar activeHref="/(app)/profile" />
          <View style={styles.loadingCard}>
            <ActivityIndicator color="#fbbf24" />
            <AppText style={styles.loadingText}>Loading profile...</AppText>
          </View>
        </View>
      </View>
    );
  }

  if (!profile) {
    return (
      <View style={styles.screen}>
        <View style={styles.content}>
          <AppTopBar activeHref="/(app)/profile" />
          <View style={styles.errorCard}>
            <AppText style={styles.errorText}>
              {loadErrorMessage ?? "Unable to load profile."}
            </AppText>
          </View>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl
            tintColor="#fbbf24"
            colors={["#fbbf24"]}
            refreshing={refreshing}
            onRefresh={() => void loadProfileScreen(true, false)}
          />
        }
      >
        <AppTopBar activeHref="/(app)/profile" />

        <View style={styles.identityCard}>
          <View style={styles.identityActions}>
            <Pressable
              style={styles.iconCircle}
              onPress={() => {
                setFriendsOpen(true);
                void loadFriendsData();
              }}
            >
              <AppText style={styles.iconCircleText}>👥</AppText>
            </Pressable>
            <Pressable
              style={styles.iconCircle}
              onPress={() => {
                setProfileErrorMessage(null);
                setProfileSuccessMessage(null);
                setSettingsOpen(true);
              }}
            >
              <AppText style={styles.iconCircleText}>⚙︎</AppText>
            </Pressable>
          </View>

          <View style={styles.identityHeader}>
            <View style={styles.avatarWrap}>
              {pendingAvatarPreviewUri || profile.avatar_url ? (
                <Image
                  source={{ uri: pendingAvatarPreviewUri ?? profile.avatar_url ?? undefined }}
                  style={styles.avatar}
                />
              ) : (
                <AppText style={styles.avatarFallback}>
                  {getAvatarFallbackLetter(profile.display_name, profile.email)}
                </AppText>
              )}
            </View>
            <View style={styles.identityMain}>
              <AppText style={styles.profileName}>
                {profile.display_name?.trim() || "Not set"}
              </AppText>
              <AppText style={styles.fullName}>{fullName || " "}</AppText>
              {profile.bio?.trim() ? (
                <AppText style={styles.bioText}>{profile.bio.trim()}</AppText>
              ) : null}
              <View style={styles.statsRow}>
                <View style={styles.statItem}>
                  <AppText style={styles.statValue}>{wineCount ?? "—"}</AppText>
                  <AppText style={styles.statLabel}>wines</AppText>
                </View>
                <View style={styles.statItem}>
                  <AppText style={styles.statValue}>{friendCount ?? "—"}</AppText>
                  <AppText style={styles.statLabel}>friends</AppText>
                </View>
              </View>
            </View>
          </View>

          <View style={styles.galleryToggle}>
            <Pressable
              style={[styles.galleryToggleBtn, galleryTab === "mine" ? styles.galleryToggleBtnActive : null]}
              onPress={() => setGalleryTab("mine")}
            >
              <AppText
                style={[
                  styles.galleryToggleText,
                  galleryTab === "mine" ? styles.galleryToggleTextActive : null,
                ]}
              >
                My wines
              </AppText>
            </Pressable>
            <Pressable
              style={[
                styles.galleryToggleBtn,
                galleryTab === "tagged" ? styles.galleryToggleBtnActive : null,
              ]}
              onPress={() => {
                setGalleryTab("tagged");
                if (!taggedLoaded) {
                  void loadTaggedEntries();
                }
              }}
            >
              <AppText
                style={[
                  styles.galleryToggleText,
                  galleryTab === "tagged" ? styles.galleryToggleTextActive : null,
                ]}
              >
                Tagged
              </AppText>
            </Pressable>
          </View>

          {profileSuccessMessage ? (
            <AppText style={styles.successText}>{profileSuccessMessage}</AppText>
          ) : null}
        </View>

        {galleryTab === "mine" ? (
          <>
            {entries.length > 0 ? (
              <View style={styles.galleryGrid}>
                {entries.map((entry) => (
                  <View key={entry.id} style={styles.galleryTile}>
                    {entry.label_image_url ? (
                      <Image
                        source={{ uri: entry.label_image_url }}
                        style={styles.galleryImage}
                        resizeMode="cover"
                      />
                    ) : (
                      <View style={styles.galleryFallback}>
                        <AppText style={styles.galleryFallbackText}>No photo</AppText>
                      </View>
                    )}
                  </View>
                ))}
              </View>
            ) : entriesLoading ? null : (
              <View style={styles.emptyCard}>
                <AppText style={styles.emptyText}>No entries yet.</AppText>
              </View>
            )}

            {entriesLoading ? (
              <View style={styles.inlineLoaderRow}>
                <ActivityIndicator color="#fbbf24" />
                <AppText style={styles.inlineLoaderText}>Loading entries...</AppText>
              </View>
            ) : null}

            {entriesHasMore && !entriesLoading ? (
              <View style={styles.loadMoreRow}>
                <Pressable style={styles.ghostButton} onPress={() => void loadEntriesData(false)}>
                  <AppText style={styles.ghostButtonText}>Load more</AppText>
                </Pressable>
              </View>
            ) : null}
          </>
        ) : (
          <>
            {taggedEntries.length > 0 ? (
              <View style={styles.galleryGrid}>
                {taggedEntries.map((entry) => (
                  <View key={entry.id} style={styles.galleryTile}>
                    {entry.label_image_url ? (
                      <Image
                        source={{ uri: entry.label_image_url }}
                        style={styles.galleryImage}
                        resizeMode="cover"
                      />
                    ) : (
                      <View style={styles.galleryFallback}>
                        <AppText style={styles.galleryFallbackText}>No photo</AppText>
                      </View>
                    )}
                  </View>
                ))}
              </View>
            ) : taggedLoading ? null : (
              <View style={styles.emptyCard}>
                <AppText style={styles.emptyText}>No tagged entries yet.</AppText>
              </View>
            )}

            {taggedLoading ? (
              <View style={styles.inlineLoaderRow}>
                <ActivityIndicator color="#fbbf24" />
                <AppText style={styles.inlineLoaderText}>Loading tagged entries...</AppText>
              </View>
            ) : null}
          </>
        )}
      </ScrollView>

      <Modal
        visible={settingsOpen}
        animationType="fade"
        transparent
        onRequestClose={closeSettings}
      >
        <View style={styles.modalOverlay}>
          <Pressable style={styles.modalBackdrop} onPress={closeSettings} />
          <KeyboardAvoidingView
            behavior={Platform.OS === "ios" ? "padding" : undefined}
            style={styles.modalCard}
          >
            <View style={styles.modalHeader}>
              <AppText style={styles.modalTitle}>Settings</AppText>
              <Pressable style={styles.iconCircleSm} onPress={closeSettings}>
                <AppText style={styles.iconCircleText}>×</AppText>
              </Pressable>
            </View>

            <ScrollView
              style={styles.modalBody}
              contentContainerStyle={styles.modalBodyContent}
              keyboardShouldPersistTaps="handled"
            >
              <View style={styles.sectionBlock}>
                <AppText style={styles.sectionTitle}>Edit profile</AppText>

                <View style={styles.avatarEditRow}>
                  <View style={styles.avatarWrapLg}>
                    {pendingAvatarPreviewUri || profile.avatar_url ? (
                      <Image
                        source={{
                          uri: pendingAvatarPreviewUri ?? profile.avatar_url ?? undefined,
                        }}
                        style={styles.avatarLg}
                      />
                    ) : (
                      <AppText style={styles.avatarFallback}>
                        {getAvatarFallbackLetter(profile.display_name, profile.email)}
                      </AppText>
                    )}
                  </View>
                  <View style={styles.avatarActionsCol}>
                    <Pressable
                      style={styles.ghostButton}
                      onPress={() => {
                        void (async () => {
                          const permission =
                            await ImagePicker.requestMediaLibraryPermissionsAsync();
                          if (!permission.granted) {
                            setAvatarErrorMessage(
                              "Allow photo access to upload a profile picture."
                            );
                            return;
                          }
                          const result = await ImagePicker.launchImageLibraryAsync({
                            mediaTypes: ImagePicker.MediaTypeOptions.Images,
                            allowsMultipleSelection: false,
                            quality: 0.85,
                          });
                          if (result.canceled || !result.assets[0]?.uri) {
                            return;
                          }
                          setAvatarErrorMessage(null);
                          setPendingAvatarAsset(result.assets[0]);
                          setPendingAvatarPreviewUri(result.assets[0].uri);
                        })();
                      }}
                    >
                      <AppText style={styles.ghostButtonText}>Choose picture</AppText>
                    </Pressable>
                    {avatarErrorMessage ? (
                      <AppText style={styles.errorSubtleText}>{avatarErrorMessage}</AppText>
                    ) : null}
                  </View>
                </View>

                <View style={styles.fieldRow}>
                  <View style={styles.fieldHalf}>
                    <LabeledInput
                      label="First name"
                      value={editFirstName}
                      onChangeText={setEditFirstName}
                      placeholder="First name"
                      maxLength={80}
                    />
                  </View>
                  <View style={styles.fieldHalf}>
                    <LabeledInput
                      label="Last name"
                      value={editLastName}
                      onChangeText={setEditLastName}
                      placeholder="Last name"
                      maxLength={80}
                    />
                  </View>
                </View>

                <LabeledInput
                  label="Bio"
                  value={editBio}
                  onChangeText={setEditBio}
                  placeholder="Wine enthusiast, cheese lover..."
                  multiline
                  maxLength={100}
                />
                <AppText style={styles.counterText}>{editBio.length}/100</AppText>

                <LabeledInput
                  label="Username"
                  value={editUsername}
                  onChangeText={setEditUsername}
                  placeholder="e.g. wine_lover"
                  maxLength={100}
                  autoCapitalize="none"
                />
                <AppText style={styles.hintText}>
                  Minimum 3 characters. No spaces or @.
                </AppText>

                <LabeledInput
                  label="Email (only you)"
                  value={editEmail}
                  onChangeText={setEditEmail}
                  placeholder="you@example.com"
                  keyboardType="email-address"
                  autoCapitalize="none"
                />

                <LabeledInput
                  label="Phone (only you)"
                  value={editPhone}
                  onChangeText={(value) => setEditPhone(formatPhoneForInput(value))}
                  placeholder="555-123-4567"
                  keyboardType="phone-pad"
                />
                <AppText style={styles.hintText}>
                  Used for sign in. US 10-digit and +E.164 formats are accepted.
                </AppText>

                <View style={styles.memberSinceRow}>
                  <AppText style={styles.labelSmall}>Member since</AppText>
                  <AppText style={styles.memberSinceValue}>
                    {formatMemberSince(profile.created_at)}
                  </AppText>
                </View>

                {profileErrorMessage ? (
                  <AppText style={styles.errorText}>{profileErrorMessage}</AppText>
                ) : null}
                {profileSuccessMessage ? (
                  <AppText style={styles.successText}>{profileSuccessMessage}</AppText>
                ) : null}

                <Pressable
                  style={[styles.primaryButton, isSavingProfile ? styles.primaryButtonDisabled : null]}
                  disabled={isSavingProfile}
                  onPress={() => void saveProfile()}
                >
                  {isSavingProfile ? (
                    <ActivityIndicator color="#09090b" />
                  ) : (
                    <AppText style={styles.primaryButtonText}>Save profile</AppText>
                  )}
                </Pressable>
              </View>

              {badges.length > 0 ? (
                <View style={styles.sectionBlockTopBorder}>
                  <AppText style={styles.sectionTitle}>Badges</AppText>
                  <AppText style={styles.hintText}>
                    Earn badges by logging 10 wines from a specific region or style.
                  </AppText>
                  <View style={styles.badgeGrid}>
                    {badges.map((badge) => (
                      <View
                        key={badge.id}
                        style={[
                          styles.badgeCard,
                          badge.earned
                            ? styles.badgeCardEarned
                            : badge.count > 0
                              ? styles.badgeCardProgress
                              : styles.badgeCardMuted,
                        ]}
                      >
                        <AppText style={styles.badgeSymbol}>{badge.symbol}</AppText>
                        <AppText style={styles.badgeName}>{badge.name}</AppText>
                        <AppText style={styles.badgeCount}>
                          {badge.count}/{badge.threshold}
                        </AppText>
                      </View>
                    ))}
                  </View>
                </View>
              ) : null}

              <View style={styles.sectionBlockTopBorder}>
                <AppText style={styles.sectionTitle}>Privacy settings</AppText>
                <AppText style={styles.hintText}>
                  Choose defaults for new posts, reactions, and comments.
                </AppText>

                <PrivacySelector
                  title="Post visibility"
                  value={entryPrivacyValue}
                  disabled={isSavingPrivacy}
                  onChange={(value) => {
                    setEntryPrivacyValue(value);
                    void savePrivacyDefaults({ default_entry_privacy: value });
                  }}
                />
                <PrivacySelector
                  title="Reactions"
                  value={reactionPrivacyValue}
                  disabled={isSavingPrivacy}
                  onChange={(value) => {
                    setReactionPrivacyValue(value);
                    void savePrivacyDefaults({ default_reaction_privacy: value });
                  }}
                />
                <PrivacySelector
                  title="Comments"
                  value={commentsPrivacyValue}
                  disabled={isSavingPrivacy}
                  onChange={(value) => {
                    setCommentsPrivacyValue(value);
                    void savePrivacyDefaults({ default_comments_privacy: value });
                  }}
                />

                <AppText style={styles.hintText}>
                  Reactions privacy controls who can see and react.
                </AppText>
                <AppText style={styles.hintText}>
                  Comments privacy controls who can see comments and comment.
                </AppText>
                {privacyMessage ? (
                  <AppText
                    style={privacyMessage.includes("updated") ? styles.successText : styles.errorText}
                  >
                    {privacyMessage}
                  </AppText>
                ) : null}
              </View>

              <View style={styles.sectionBlockTopBorder}>
                <View style={styles.rowBetween}>
                  <View style={styles.rowGrow}>
                    <AppText style={styles.sectionTitle}>Password</AppText>
                    <AppText style={styles.hintText}>Update your account password.</AppText>
                  </View>
                  {!isPasswordOpen ? (
                    <Pressable
                      style={styles.ghostButton}
                      onPress={() => {
                        setPasswordSuccess(null);
                        setPasswordError(null);
                        setIsPasswordOpen(true);
                      }}
                    >
                      <AppText style={styles.ghostButtonText}>Change password</AppText>
                    </Pressable>
                  ) : null}
                </View>

                {passwordSuccess && !isPasswordOpen ? (
                  <AppText style={styles.successText}>{passwordSuccess}</AppText>
                ) : null}

                {isPasswordOpen ? (
                  <View style={styles.passwordForm}>
                    <LabeledInput
                      label="Current password"
                      value={currentPassword}
                      onChangeText={setCurrentPassword}
                      placeholder="Enter your current password"
                      secureTextEntry
                      autoCapitalize="none"
                    />
                    <LabeledInput
                      label="New password"
                      value={newPassword}
                      onChangeText={setNewPassword}
                      placeholder="Minimum 8 characters"
                      secureTextEntry
                      autoCapitalize="none"
                    />
                    <LabeledInput
                      label="Confirm new password"
                      value={confirmPassword}
                      onChangeText={setConfirmPassword}
                      placeholder="Re-enter new password"
                      secureTextEntry
                      autoCapitalize="none"
                    />
                    {passwordError ? <AppText style={styles.errorText}>{passwordError}</AppText> : null}
                    <View style={styles.passwordActions}>
                      <Pressable
                        style={[
                          styles.primaryButton,
                          isSavingPassword ? styles.primaryButtonDisabled : null,
                        ]}
                        disabled={
                          isSavingPassword ||
                          !currentPassword ||
                          !newPassword ||
                          !confirmPassword
                        }
                        onPress={() => void savePassword()}
                      >
                        {isSavingPassword ? (
                          <ActivityIndicator color="#09090b" />
                        ) : (
                          <AppText style={styles.primaryButtonText}>Update password</AppText>
                        )}
                      </Pressable>
                      <Pressable
                        style={styles.linkButton}
                        onPress={() => {
                          setCurrentPassword("");
                          setNewPassword("");
                          setConfirmPassword("");
                          setPasswordError(null);
                          setPasswordSuccess(null);
                          setIsPasswordOpen(false);
                        }}
                      >
                        <AppText style={styles.linkButtonText}>Cancel</AppText>
                      </Pressable>
                    </View>
                  </View>
                ) : null}
              </View>
            </ScrollView>
          </KeyboardAvoidingView>
        </View>
      </Modal>

      <Modal
        visible={friendsOpen}
        animationType="fade"
        transparent
        onRequestClose={closeFriends}
      >
        <View style={styles.modalOverlay}>
          <Pressable style={styles.modalBackdrop} onPress={closeFriends} />
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <AppText style={styles.modalTitle}>Friends</AppText>
              <Pressable style={styles.iconCircleSm} onPress={closeFriends}>
                <AppText style={styles.iconCircleText}>×</AppText>
              </Pressable>
            </View>

            {friendErrorMessage ? (
              <AppText style={styles.errorText}>{friendErrorMessage}</AppText>
            ) : null}

            {friendsLoading ? (
              <View style={styles.loadingCardCompact}>
                <ActivityIndicator color="#fbbf24" />
                <AppText style={styles.loadingText}>Loading friends...</AppText>
              </View>
            ) : (
              <ScrollView
                style={styles.modalBody}
                contentContainerStyle={styles.modalBodyContent}
                keyboardShouldPersistTaps="handled"
              >
                <View style={styles.sectionBlock}>
                  <LabeledInput
                    label="Search users"
                    value={friendSearch}
                    onChangeText={setFriendSearch}
                    placeholder="Search by username, name, or email"
                    autoCapitalize="none"
                  />
                  {searchError ? <AppText style={styles.errorText}>{searchError}</AppText> : null}
                  {searchLoading ? (
                    <AppText style={styles.hintText}>Searching...</AppText>
                  ) : null}

                  {searchResults.length > 0 ? (
                    <View style={styles.compactList}>
                      {searchResults.slice(0, 6).map((candidate) => {
                        const isFriend = friendIdSet.has(candidate.id);
                        const isOutgoing = outgoingIdSet.has(candidate.id);
                        const isIncoming = incomingIdSet.has(candidate.id);
                        return (
                          <View key={candidate.id} style={styles.friendRow}>
                            <View style={styles.friendRowMain}>
                              <AppText style={styles.friendName}>
                                {candidate.display_name ?? candidate.email ?? "Unknown"}
                              </AppText>
                              {isFriend ? (
                                <AppText style={styles.statusGood}>Already friends</AppText>
                              ) : isOutgoing ? (
                                <AppText style={styles.statusWarn}>Request sent</AppText>
                              ) : isIncoming ? (
                                <AppText style={styles.statusWarn}>Requested you</AppText>
                              ) : null}
                            </View>
                            <Pressable
                              style={styles.ghostButton}
                              disabled={isFriend || isOutgoing || isMutatingFriend}
                              onPress={() => void sendFriendRequest(candidate.id)}
                            >
                              <AppText style={styles.ghostButtonText}>
                                {isFriend ? "Friends" : isOutgoing ? "Pending" : "Add"}
                              </AppText>
                            </Pressable>
                          </View>
                        );
                      })}
                    </View>
                  ) : friendSearch.trim() && !searchLoading && !searchError ? (
                    <AppText style={styles.hintText}>No matches.</AppText>
                  ) : null}
                </View>

                <View style={styles.sectionBlockTopBorder}>
                  <View style={styles.rowBetween}>
                    <AppText style={styles.sectionTitle}>Incoming requests</AppText>
                    {incomingRequests.length > 0 ? (
                      <View style={styles.countPill}>
                        <AppText style={styles.countPillText}>
                          {incomingRequests.length > 99 ? "99+" : incomingRequests.length}
                        </AppText>
                      </View>
                    ) : null}
                  </View>
                  {incomingRequests.length === 0 ? (
                    <AppText style={styles.hintText}>No new requests.</AppText>
                  ) : (
                    <View style={styles.compactList}>
                      {incomingRequests.map((request) => (
                        <View key={request.id} style={styles.cardRow}>
                          <View style={styles.friendInline}>
                            <FriendAvatar profile={request.requester} />
                            <AppText style={styles.friendName}>
                              {displayFriendName(request.requester)}
                            </AppText>
                          </View>
                          <View style={styles.actionRow}>
                            <Pressable
                              style={styles.acceptButton}
                              disabled={isMutatingFriend}
                              onPress={() => void respondToRequest(request.id, "accept")}
                            >
                              <AppText style={styles.acceptButtonText}>Accept</AppText>
                            </Pressable>
                            <Pressable
                              style={styles.declineButton}
                              disabled={isMutatingFriend}
                              onPress={() => void respondToRequest(request.id, "decline")}
                            >
                              <AppText style={styles.declineButtonText}>Decline</AppText>
                            </Pressable>
                          </View>
                        </View>
                      ))}
                    </View>
                  )}
                </View>

                {outgoingRequests.length > 0 ? (
                  <View style={styles.sectionBlockTopBorder}>
                    <AppText style={styles.sectionTitle}>Requests sent</AppText>
                    <View style={styles.compactList}>
                      {outgoingRequests.map((request) => (
                        <View key={request.id} style={styles.friendRow}>
                          <View style={styles.friendInline}>
                            <FriendAvatar profile={request.recipient} />
                            <AppText style={styles.friendName}>
                              {displayFriendName(request.recipient)}
                            </AppText>
                          </View>
                          {confirmingCancel === request.id ? (
                            <View style={styles.actionRow}>
                              <Pressable
                                style={styles.declineButton}
                                disabled={isMutatingFriend}
                                onPress={() => void deleteRequest(request.id)}
                              >
                                <AppText style={styles.declineButtonText}>Yes</AppText>
                              </Pressable>
                              <Pressable
                                style={styles.ghostButton}
                                disabled={isMutatingFriend}
                                onPress={() => setConfirmingCancel(null)}
                              >
                                <AppText style={styles.ghostButtonText}>No</AppText>
                              </Pressable>
                            </View>
                          ) : (
                            <Pressable
                              style={styles.ghostButton}
                              disabled={isMutatingFriend}
                              onPress={() => setConfirmingCancel(request.id)}
                            >
                              <AppText style={styles.ghostButtonText}>Cancel</AppText>
                            </Pressable>
                          )}
                        </View>
                      ))}
                    </View>
                  </View>
                ) : null}

                <View style={styles.sectionBlockTopBorder}>
                  <AppText style={styles.sectionTitle}>People you may know</AppText>
                  {suggestions.length === 0 ? (
                    <AppText style={styles.hintText}>No suggestions right now.</AppText>
                  ) : (
                    <View style={styles.compactList}>
                      {suggestions.map((person) => {
                        const isFriend = friendIdSet.has(person.id);
                        const isOutgoing = outgoingIdSet.has(person.id);
                        return (
                          <View key={person.id} style={styles.friendRow}>
                            <View style={styles.friendRowMain}>
                              <View style={styles.friendInline}>
                                <FriendAvatar profile={person} />
                                <AppText style={styles.friendName}>
                                  {displayFriendName(person)}
                                </AppText>
                              </View>
                              <AppText style={styles.statusWarn}>
                                {person.mutual_count === 1
                                  ? "1 mutual friend"
                                  : `${person.mutual_count} mutual friends`}
                              </AppText>
                            </View>
                            <Pressable
                              style={styles.ghostButton}
                              disabled={isFriend || isOutgoing || isMutatingFriend}
                              onPress={() => void sendFriendRequest(person.id)}
                            >
                              <AppText style={styles.ghostButtonText}>
                                {isFriend ? "Friends" : isOutgoing ? "Pending" : "Add"}
                              </AppText>
                            </Pressable>
                          </View>
                        );
                      })}
                    </View>
                  )}
                </View>

                <View style={styles.sectionBlockTopBorder}>
                  <AppText style={styles.sectionTitle}>Your friends</AppText>
                  {friends.length === 0 ? (
                    <AppText style={styles.hintText}>
                      No friends yet. Search to add someone.
                    </AppText>
                  ) : (
                    <View style={styles.compactList}>
                      {friends.map((friend) => (
                        <View key={friend.id} style={styles.friendRow}>
                          <View style={styles.friendInline}>
                            <FriendAvatar profile={friend} />
                            <View>
                              <AppText style={styles.friendName}>
                                {displayFriendName(friend)}
                              </AppText>
                              {friend.tasting_count > 0 ? (
                                <AppText style={styles.hintTextTiny}>
                                  {friend.tasting_count} shared tasting
                                  {friend.tasting_count === 1 ? "" : "s"}
                                </AppText>
                              ) : null}
                            </View>
                          </View>
                          {friend.request_id ? (
                            confirmingRemove === friend.request_id ? (
                              <View style={styles.actionRow}>
                                <Pressable
                                  style={styles.declineButton}
                                  disabled={isMutatingFriend}
                                  onPress={() => void deleteRequest(friend.request_id!)}
                                >
                                  <AppText style={styles.declineButtonText}>Yes</AppText>
                                </Pressable>
                                <Pressable
                                  style={styles.ghostButton}
                                  disabled={isMutatingFriend}
                                  onPress={() => setConfirmingRemove(null)}
                                >
                                  <AppText style={styles.ghostButtonText}>No</AppText>
                                </Pressable>
                              </View>
                            ) : (
                              <Pressable
                                style={styles.ghostButton}
                                disabled={isMutatingFriend}
                                onPress={() => setConfirmingRemove(friend.request_id)}
                              >
                                <AppText style={styles.ghostButtonText}>Remove</AppText>
                              </Pressable>
                            )
                          ) : null}
                        </View>
                      ))}
                    </View>
                  )}
                </View>
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>
    </View>
  );
}

function FriendAvatar({ profile }: { profile: FriendProfile }) {
  return (
    <View style={styles.friendAvatar}>
      {profile.avatar_url ? (
        <Image source={{ uri: profile.avatar_url }} style={styles.friendAvatarImage} />
      ) : (
        <AppText style={styles.friendAvatarText}>
          {getAvatarFallbackLetter(profile.display_name, profile.email)}
        </AppText>
      )}
    </View>
  );
}

function LabeledInput({
  label,
  ...props
}: TextInputProps & { label: string }) {
  return (
    <View style={styles.inputBlock}>
      <AppText style={styles.label}>{label}</AppText>
      <DoneTextInput
        {...props}
        autoCorrect={false}
        placeholderTextColor="#71717a"
        style={[styles.input, props.multiline ? styles.inputMultiline : null, props.style]}
      />
    </View>
  );
}

function PrivacySelector({
  title,
  value,
  onChange,
  disabled,
}: {
  title: string;
  value: PrivacyLevel;
  onChange: (value: PrivacyLevel) => void;
  disabled: boolean;
}) {
  return (
    <View style={styles.privacyBlock}>
      <AppText style={styles.privacyLabel}>{title}</AppText>
      <View style={styles.privacyOptionWrap}>
        {PRIVACY_OPTIONS.map((option) => (
          <Pressable
            key={`${title}-${option.value}`}
            onPress={() => onChange(option.value)}
            disabled={disabled}
            style={[
              styles.privacyPill,
              value === option.value ? styles.privacyPillActive : null,
            ]}
          >
            <AppText
              style={[
                styles.privacyPillText,
                value === option.value ? styles.privacyPillTextActive : null,
              ]}
            >
              {option.label}
            </AppText>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: "#0f0a09",
  },
  content: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 40,
    gap: 14,
  },
  identityCard: {
    position: "relative",
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
    backgroundColor: "rgba(255,255,255,0.05)",
    padding: 16,
    gap: 12,
  },
  identityActions: {
    position: "absolute",
    right: 12,
    top: 10,
    flexDirection: "row",
    gap: 8,
    zIndex: 3,
  },
  iconCircle: {
    width: 34,
    height: 34,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.16)",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(0,0,0,0.2)",
  },
  iconCircleSm: {
    width: 30,
    height: 30,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.16)",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(0,0,0,0.16)",
  },
  iconCircleText: {
    color: "#d4d4d8",
    fontSize: 16,
    fontWeight: "700",
    lineHeight: 18,
  },
  identityHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingRight: 74,
  },
  avatarWrap: {
    width: 94,
    height: 94,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.14)",
    backgroundColor: "rgba(0,0,0,0.28)",
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
  },
  avatarWrapLg: {
    width: 96,
    height: 96,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.14)",
    backgroundColor: "rgba(0,0,0,0.28)",
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
  },
  avatar: {
    width: "100%",
    height: "100%",
  },
  avatarLg: {
    width: "100%",
    height: "100%",
  },
  avatarFallback: {
    color: "#a1a1aa",
    fontSize: 24,
    fontWeight: "700",
  },
  identityMain: {
    flex: 1,
    gap: 2,
  },
  profileName: {
    color: "#fafafa",
    fontSize: 21,
    fontWeight: "700",
  },
  fullName: {
    color: "#a1a1aa",
    fontSize: 14,
  },
  bioText: {
    color: "#d4d4d8",
    fontSize: 13,
    fontStyle: "italic",
    marginTop: 2,
  },
  statsRow: {
    marginTop: 8,
    flexDirection: "row",
    gap: 16,
  },
  statItem: {
    flexDirection: "row",
    alignItems: "baseline",
    gap: 4,
  },
  statValue: {
    color: "#f5f5f5",
    fontSize: 14,
    fontWeight: "700",
  },
  statLabel: {
    color: "#a1a1aa",
    fontSize: 12,
  },
  galleryToggle: {
    flexDirection: "row",
    justifyContent: "center",
    gap: 8,
  },
  galleryToggleBtn: {
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderWidth: 1,
    borderColor: "transparent",
  },
  galleryToggleBtnActive: {
    backgroundColor: "rgba(255,255,255,0.1)",
    borderColor: "rgba(255,255,255,0.12)",
  },
  galleryToggleText: {
    color: "#a1a1aa",
    fontSize: 13,
    fontWeight: "700",
  },
  galleryToggleTextActive: {
    color: "#fafafa",
  },
  galleryGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 5,
  },
  galleryTile: {
    width: "32.2%",
    aspectRatio: 1,
    borderRadius: 10,
    overflow: "hidden",
    backgroundColor: "rgba(255,255,255,0.05)",
  },
  galleryImage: {
    width: "100%",
    height: "100%",
  },
  galleryFallback: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  galleryFallbackText: {
    color: "#71717a",
    fontSize: 11,
  },
  emptyCard: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    backgroundColor: "rgba(255,255,255,0.04)",
    paddingVertical: 24,
    alignItems: "center",
  },
  emptyText: {
    color: "#a1a1aa",
    fontSize: 13,
  },
  inlineLoaderRow: {
    marginTop: 6,
    flexDirection: "row",
    gap: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  inlineLoaderText: {
    color: "#a1a1aa",
    fontSize: 12,
  },
  loadMoreRow: {
    alignItems: "center",
    marginTop: 2,
  },
  ghostButton: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.16)",
    paddingHorizontal: 11,
    paddingVertical: 7,
    backgroundColor: "rgba(255,255,255,0.04)",
  },
  ghostButtonText: {
    color: "#e4e4e7",
    fontSize: 12,
    fontWeight: "700",
  },
  primaryButton: {
    borderRadius: 999,
    backgroundColor: "#fbbf24",
    paddingHorizontal: 14,
    paddingVertical: 10,
    minHeight: 40,
    alignItems: "center",
    justifyContent: "center",
    alignSelf: "flex-start",
  },
  primaryButtonDisabled: {
    opacity: 0.5,
  },
  primaryButtonText: {
    color: "#09090b",
    fontSize: 12,
    fontWeight: "800",
  },
  loadingCard: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    backgroundColor: "rgba(255,255,255,0.04)",
    paddingVertical: 28,
    gap: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  loadingCardCompact: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    backgroundColor: "rgba(255,255,255,0.04)",
    paddingVertical: 20,
    gap: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  loadingText: {
    color: "#a1a1aa",
    fontSize: 12,
  },
  errorCard: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(244,63,94,0.4)",
    backgroundColor: "rgba(190,24,93,0.14)",
    padding: 14,
  },
  errorText: {
    color: "#fecdd3",
    fontSize: 12,
    lineHeight: 17,
  },
  errorSubtleText: {
    color: "#fecdd3",
    fontSize: 11,
  },
  successText: {
    color: "#bbf7d0",
    fontSize: 12,
  },
  modalOverlay: {
    flex: 1,
    justifyContent: "center",
    paddingHorizontal: 10,
    paddingVertical: 20,
  },
  modalBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.72)",
  },
  modalCard: {
    width: "100%",
    maxHeight: "96%",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    backgroundColor: "#14100f",
    padding: 14,
    gap: 10,
    alignSelf: "center",
  },
  modalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  modalTitle: {
    color: "#fafafa",
    fontSize: 18,
    fontWeight: "700",
  },
  modalBody: {
    flexGrow: 0,
  },
  modalBodyContent: {
    paddingBottom: 6,
    gap: 14,
  },
  sectionBlock: {
    gap: 8,
  },
  sectionBlockTopBorder: {
    borderTopWidth: 1,
    borderTopColor: "rgba(255,255,255,0.10)",
    paddingTop: 12,
    gap: 8,
  },
  sectionTitle: {
    color: "#d4d4d8",
    fontSize: 12,
    fontWeight: "800",
    letterSpacing: 1.8,
    textTransform: "uppercase",
  },
  avatarEditRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  avatarActionsCol: {
    flex: 1,
    gap: 6,
  },
  inputBlock: {
    gap: 4,
  },
  label: {
    color: "#d4d4d8",
    fontSize: 12,
    fontWeight: "600",
  },
  labelSmall: {
    color: "#71717a",
    fontSize: 10,
    textTransform: "uppercase",
    letterSpacing: 1.6,
  },
  input: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    backgroundColor: "rgba(0,0,0,0.26)",
    color: "#f4f4f5",
    paddingHorizontal: 11,
    paddingVertical: 9,
    fontSize: 14,
  },
  inputMultiline: {
    minHeight: 64,
    textAlignVertical: "top",
  },
  hintText: {
    color: "#71717a",
    fontSize: 11,
    lineHeight: 15,
  },
  hintTextTiny: {
    color: "#71717a",
    fontSize: 10,
  },
  counterText: {
    color: "#71717a",
    fontSize: 11,
    textAlign: "right",
    marginTop: -4,
  },
  fieldRow: {
    flexDirection: "row",
    gap: 8,
  },
  fieldHalf: {
    flex: 1,
  },
  memberSinceRow: {
    marginTop: 2,
    gap: 2,
  },
  memberSinceValue: {
    color: "#d4d4d8",
    fontSize: 13,
  },
  badgeGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  badgeCard: {
    width: "31.7%",
    borderRadius: 12,
    borderWidth: 1,
    paddingVertical: 9,
    paddingHorizontal: 7,
    alignItems: "center",
    gap: 2,
  },
  badgeCardEarned: {
    borderColor: "rgba(252,211,77,0.52)",
    backgroundColor: "rgba(251,191,36,0.12)",
  },
  badgeCardProgress: {
    borderColor: "rgba(255,255,255,0.12)",
    backgroundColor: "rgba(0,0,0,0.2)",
  },
  badgeCardMuted: {
    borderColor: "rgba(255,255,255,0.07)",
    backgroundColor: "rgba(0,0,0,0.17)",
    opacity: 0.62,
  },
  badgeSymbol: {
    fontSize: 20,
  },
  badgeName: {
    color: "#e4e4e7",
    fontSize: 10,
    fontWeight: "700",
    textAlign: "center",
  },
  badgeCount: {
    color: "#a1a1aa",
    fontSize: 10,
  },
  privacyBlock: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    backgroundColor: "rgba(0,0,0,0.18)",
    padding: 10,
    gap: 7,
  },
  privacyLabel: {
    color: "#a1a1aa",
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 1.2,
    textTransform: "uppercase",
  },
  privacyOptionWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
  },
  privacyPill: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.14)",
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: "rgba(255,255,255,0.02)",
  },
  privacyPillActive: {
    borderColor: "rgba(252,211,77,0.55)",
    backgroundColor: "rgba(251,191,36,0.14)",
  },
  privacyPillText: {
    color: "#d4d4d8",
    fontSize: 11,
    fontWeight: "700",
  },
  privacyPillTextActive: {
    color: "#fef3c7",
  },
  rowBetween: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 10,
  },
  rowGrow: {
    flex: 1,
    gap: 4,
  },
  passwordForm: {
    gap: 8,
  },
  passwordActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  linkButton: {
    paddingVertical: 6,
    paddingHorizontal: 2,
  },
  linkButtonText: {
    color: "#a1a1aa",
    fontSize: 12,
    fontWeight: "600",
  },
  compactList: {
    gap: 8,
  },
  friendRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
    borderRadius: 11,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    backgroundColor: "rgba(0,0,0,0.2)",
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  friendRowMain: {
    flex: 1,
    gap: 2,
  },
  friendInline: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  friendAvatar: {
    width: 30,
    height: 30,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    backgroundColor: "rgba(0,0,0,0.24)",
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
  },
  friendAvatarImage: {
    width: "100%",
    height: "100%",
  },
  friendAvatarText: {
    color: "#a1a1aa",
    fontSize: 12,
    fontWeight: "700",
  },
  friendName: {
    color: "#f4f4f5",
    fontSize: 12,
    fontWeight: "600",
  },
  statusGood: {
    color: "#bbf7d0",
    fontSize: 11,
  },
  statusWarn: {
    color: "#fcd34d",
    fontSize: 11,
  },
  cardRow: {
    borderRadius: 11,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    backgroundColor: "rgba(0,0,0,0.2)",
    paddingHorizontal: 10,
    paddingVertical: 8,
    gap: 8,
  },
  actionRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  acceptButton: {
    borderRadius: 999,
    backgroundColor: "#fbbf24",
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  acceptButtonText: {
    color: "#09090b",
    fontSize: 11,
    fontWeight: "800",
  },
  declineButton: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(251,113,133,0.45)",
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: "rgba(244,63,94,0.12)",
  },
  declineButtonText: {
    color: "#fecdd3",
    fontSize: 11,
    fontWeight: "700",
  },
  countPill: {
    borderRadius: 999,
    backgroundColor: "rgba(251,191,36,0.2)",
    paddingHorizontal: 8,
    paddingVertical: 3,
    minWidth: 24,
    alignItems: "center",
    justifyContent: "center",
  },
  countPillText: {
    color: "#fde68a",
    fontSize: 10,
    fontWeight: "800",
  },
});

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  ActivityIndicator,
  Image,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  View,
} from "react-native";
import { router, useFocusEffect, type RelativePathString } from "expo-router";
import {
  FEED_REACTION_EMOJIS,
  HOME_ACTION_LABELS,
  HOME_CIRCLE_ENTRIES_LIMIT,
  HOME_EMPTY_STATE_COPY,
  HOME_HEADER_COPY,
  HOME_PRIVACY_ONBOARDING_COPY,
  HOME_PRIVACY_OPTION_DESCRIPTIONS,
  HOME_PRIVACY_OPTION_VALUES,
  HOME_RECENT_ENTRIES_LIMIT,
  HOME_SECTION_LABELS,
  PRIVACY_LEVEL_LABELS,
  QPR_LEVEL_LABELS,
  getFeedDisplayRatingLabel,
  type HomeApiResponse,
  normalizePrivacyLevel,
  type HomeApiCircleEntry,
  type HomeApiRecentEntry,
  type PrivacyLevel,
  type QprLevel,
} from "@cellarsnap/shared";
import { AppTopBar } from "@/src/components/AppTopBar";
import { ReactionSummaryPills } from "@/src/components/ReactionSummaryPills";
import { AppText } from "@/src/components/AppText";
import { fetchMobileHomeFromApi } from "@/src/lib/api/home";
import { getPublicProfileName } from "@/src/lib/publicProfiles";
import {
  DRINKING_NOW_REFRESH_INTERVAL_MS,
  isDrinkingNowActive,
} from "@/src/lib/drinkingNow";
import { resolveEntryLabelPhotos } from "@/src/lib/storage/entryLabels";
import { signPhotoUrls } from "@/src/lib/storage/signedUrls";
import { supabase } from "@/src/lib/supabase";
import { useAuth } from "@/src/providers/AuthProvider";
import { colors } from "@/src/lib/theme";
import { fonts } from "@/src/lib/typography";

type HomeEntryRow = {
  id: string;
  user_id: string;
  wine_name: string | null;
  producer: string | null;
  vintage: string | null;
  rating: number | null;
  qpr_level: QprLevel | null;
  consumed_at: string;
  created_at: string;
  tasted_with_user_ids: string[] | null;
  label_image_path: string | null;
  entry_privacy: PrivacyLevel;
  drinking_now?: boolean | null;
};

type ProfileWithPrivacyRow = {
  display_name: string | null;
  first_name: string | null;
  default_entry_privacy: string | null;
  privacy_confirmed_at: string | null;
};

type FallbackProfileRow = {
  display_name: string | null;
  first_name: string | null;
  created_at: string | null;
};

type FriendRelationRow = {
  requester_id: string;
  recipient_id: string;
};

type FriendProfileRow = {
  id: string;
  display_name: string | null;
  email: string | null;
  avatar_path?: string | null;
};

type HomeReactionRow = {
  entry_id: string;
  user_id: string;
  emoji: string;
};

type HomeInteractionSettingsRow = {
  id: string;
  reaction_privacy?: string | null;
};

type RecentEntry = HomeApiRecentEntry;
type CircleEntry = HomeApiCircleEntry;

const BACKGROUND_REFRESH_STALE_MS = 90_000;

function isMissingAvatarColumn(message: string) {
  return message.includes("avatar_path") || message.includes("column");
}

function canViewerAccessByHomePrivacy({
  viewerUserId,
  ownerUserId,
  privacy,
  acceptedFriendIds,
}: {
  viewerUserId: string;
  ownerUserId: string;
  privacy: PrivacyLevel;
  acceptedFriendIds: Set<string>;
}) {
  if (viewerUserId === ownerUserId) {
    return true;
  }

  const normalized = normalizePrivacyLevel(privacy, "public");
  if (normalized === "public") {
    return true;
  }
  if (normalized === "private") {
    return false;
  }

  return acceptedFriendIds.has(ownerUserId);
}

const PRIVACY_TONES: Record<
  PrivacyLevel,
  { borderColor: string; backgroundColor: string; textColor: string }
> = {
  public: {
    borderColor: "rgba(59, 130, 246, 0.45)",
    backgroundColor: "rgba(59, 130, 246, 0.12)",
    textColor: colors.info,
  },
  friends_of_friends: {
    borderColor: "rgba(45, 125, 70, 0.45)",
    backgroundColor: "rgba(45, 125, 70, 0.12)",
    textColor: colors.success,
  },
  friends: {
    borderColor: "rgba(123, 29, 58, 0.45)",
    backgroundColor: "rgba(123, 29, 58, 0.12)",
    textColor: colors.rose,
  },
  private: {
    borderColor: "rgba(192, 57, 43, 0.45)",
    backgroundColor: "rgba(192, 57, 43, 0.12)",
    textColor: colors.error,
  },
};

function toWordSet(value: string | null | undefined): Set<string> {
  const normalized = value?.toLowerCase() ?? "";
  const words = normalized.match(/[a-z0-9]+/g) ?? [];
  return new Set(words.filter((word) => word.length >= 2));
}

function shouldHideProducerInEntryTile(
  wineName: string | null | undefined,
  producer: string | null | undefined
) {
  const wineWords = toWordSet(wineName);
  const producerWords = toWordSet(producer);

  if (wineWords.size === 0 || producerWords.size === 0) {
    return false;
  }

  let sharedWordCount = 0;
  for (const word of producerWords) {
    if (!wineWords.has(word)) {
      continue;
    }
    sharedWordCount += 1;
    if (sharedWordCount >= 3) {
      return true;
    }
  }

  return false;
}

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

function buildOwnerWithCompanionsLabel(ownerLabel: string, companionNames: string[]) {
  return companionNames.length > 0 ? `${ownerLabel} + ${companionNames.join(", ")}` : ownerLabel;
}

function HomeEntryCard({
  entry,
  ownerLabel,
  ownerAvatarUrl,
  ownerOnPress,
  onPress,
  onToggleReaction,
  showDrinkingNowGlow,
  variant,
}: {
  entry: RecentEntry | CircleEntry;
  ownerLabel: string;
  ownerAvatarUrl?: string | null;
  ownerOnPress?: () => void;
  onPress: () => void;
  onToggleReaction: (emoji: string) => void;
  showDrinkingNowGlow: boolean;
  variant: "own" | "circle";
}) {
  const hideProducer = shouldHideProducerInEntryTile(entry.wine_name, entry.producer);
  const producer = hideProducer ? null : entry.producer?.trim() || null;
  const vintage = entry.vintage?.trim() || null;
  const displayRating = getFeedDisplayRatingLabel(entry.rating);
  const [reactionPickerOpen, setReactionPickerOpen] = useState(false);
  const ownerWithCompanionsLabel = buildOwnerWithCompanionsLabel(
    ownerLabel,
    entry.tasted_with_names
  );
  const subtitle =
    variant === "own"
      ? producer || vintage
        ? `${producer ?? ""}${producer && vintage ? " - " : ""}${vintage ?? ""}`
        : null
      : producer;

  return (
    <Pressable
      style={[styles.entryCard, showDrinkingNowGlow ? styles.entryCardDrinkingNow : null]}
      onPress={onPress}
    >
      <View style={styles.entryHeaderRow}>
        {ownerOnPress ? (
          <Pressable
            style={styles.entryOwnerStack}
            onPress={(event) => {
              event.stopPropagation();
              ownerOnPress();
            }}
          >
            {variant === "circle" ? (
              <View style={styles.entryOwnerAvatar}>
                {ownerAvatarUrl ? (
                  <Image
                    source={{ uri: ownerAvatarUrl }}
                    style={styles.entryOwnerAvatarImage}
                    resizeMode="cover"
                  />
                ) : (
                  <AppText style={styles.entryOwnerAvatarFallback}>
                    {(ownerLabel || "?")[0]?.toUpperCase() ?? "?"}
                  </AppText>
                )}
              </View>
            ) : null}
            <AppText
              style={[styles.entryOwner, styles.entryOwnerButton]}
              numberOfLines={2}
            >
              {ownerWithCompanionsLabel}
            </AppText>
          </Pressable>
        ) : (
          <View style={styles.entryOwnerStack}>
            {variant === "circle" ? (
              <View style={styles.entryOwnerAvatar}>
                {ownerAvatarUrl ? (
                  <Image
                    source={{ uri: ownerAvatarUrl }}
                    style={styles.entryOwnerAvatarImage}
                    resizeMode="cover"
                  />
                ) : (
                  <AppText style={styles.entryOwnerAvatarFallback}>
                    {(ownerLabel || "?")[0]?.toUpperCase() ?? "?"}
                  </AppText>
                )}
              </View>
            ) : null}
            <AppText style={styles.entryOwner} numberOfLines={2}>
              {ownerWithCompanionsLabel}
            </AppText>
          </View>
        )}
        <AppText style={styles.entryDate}>
          {formatConsumedDate(entry.consumed_at)}
        </AppText>
      </View>

      <View style={styles.entryBodyRow}>
        <View style={styles.photoBox}>
          {entry.label_image_url ? (
            <Image
              source={{ uri: entry.label_image_url }}
              style={styles.photoImage}
              resizeMode="cover"
            />
          ) : (
            <AppText style={styles.photoText}>No photo</AppText>
          )}
        </View>

        <View style={styles.entryMain}>
          <View>
            <AppText style={styles.entryTitle}>
              {entry.wine_name?.trim() || "Untitled wine"}
            </AppText>
            {subtitle ? <AppText style={styles.entrySubtitle}>{subtitle}</AppText> : null}
          </View>

          <View style={styles.entryMetaRow}>
            {displayRating ? <AppText style={styles.ratingText}>{displayRating}</AppText> : null}
            {entry.qpr_level ? (
              <AppText
                style={[
                  styles.qprTag,
                  styles[`qpr_${entry.qpr_level}` as keyof typeof styles],
                ]}
              >
                {QPR_LEVEL_LABELS[entry.qpr_level]}
              </AppText>
            ) : null}
          </View>

          <View style={styles.homeReactionSection}>
            <View style={styles.homeReactionRight}>
              <ReactionSummaryPills
                entryId={entry.id}
                reactionCounts={entry.reaction_counts}
                reactionUsers={entry.reaction_users}
              />
              <Pressable
                onPress={(event) => {
                  event.stopPropagation();
                  setReactionPickerOpen((current) => !current);
                }}
                style={[
                  styles.reactionAddButton,
                  entry.can_react ? null : styles.reactionAddButtonDisabled,
                ]}
              >
                <View style={styles.plusIcon}>
                  <View
                    style={[
                      styles.plusLineHorizontal,
                      entry.can_react ? null : styles.plusLineDisabled,
                    ]}
                  />
                  <View
                    style={[
                      styles.plusLineVertical,
                      entry.can_react ? null : styles.plusLineDisabled,
                    ]}
                  />
                </View>
              </Pressable>
            </View>

            {reactionPickerOpen ? (
              <Pressable
                style={styles.reactionPickerCard}
                onPress={(event) => {
                  event.stopPropagation();
                }}
              >
                <View style={styles.reactionPickerRow}>
                  {FEED_REACTION_EMOJIS.map((emoji) => {
                    const selected = entry.my_reactions.includes(emoji);
                    return (
                      <Pressable
                        key={`${entry.id}-${emoji}`}
                        disabled={!entry.can_react}
                        onPress={(event) => {
                          event.stopPropagation();
                          onToggleReaction(emoji);
                          setReactionPickerOpen(false);
                        }}
                        style={[
                          styles.reactionEmojiBtn,
                          selected ? styles.reactionEmojiBtnActive : null,
                          !entry.can_react ? styles.reactionEmojiBtnDisabled : null,
                        ]}
                      >
                        <AppText style={styles.reactionEmojiText}>{emoji}</AppText>
                      </Pressable>
                    );
                  })}
                </View>
                {!entry.can_react ? (
                  <AppText style={styles.reactionPrivateText}>
                    Reactions are not available for this post.
                  </AppText>
                ) : null}
              </Pressable>
            ) : null}
          </View>
        </View>
      </View>
    </Pressable>
  );
}

export default function HomeScreen() {
  const { user, hasPrivateBetaFeatureAccess } = useAuth();
  const hasLoadedHomeRef = useRef(false);
  const lastLoadedAtRef = useRef<number | null>(null);
  const [viewerReactionName, setViewerReactionName] = useState<string | null>(null);
  const [defaultEntryPrivacy, setDefaultEntryPrivacy] = useState<PrivacyLevel>("public");
  const [privacyConfirmedAt, setPrivacyConfirmedAt] = useState<string | null>(null);
  const [privacyOnboardingError, setPrivacyOnboardingError] = useState<string | null>(null);
  const [savingPrivacyOnboarding, setSavingPrivacyOnboarding] = useState(false);
  const [totalEntryCount, setTotalEntryCount] = useState(0);
  const [friendCount, setFriendCount] = useState(0);
  const [recentEntries, setRecentEntries] = useState<RecentEntry[]>([]);
  const [circleEntries, setCircleEntries] = useState<CircleEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [currentTimeMs, setCurrentTimeMs] = useState(() => Date.now());

  const isFirstTime = useMemo(() => totalEntryCount === 0, [totalEntryCount]);

  useEffect(() => {
    const intervalId = setInterval(() => {
      setCurrentTimeMs(Date.now());
    }, DRINKING_NOW_REFRESH_INTERVAL_MS);

    return () => {
      clearInterval(intervalId);
    };
  }, []);

  const applyHomePayload = useCallback((payload: HomeApiResponse) => {
    const firstName = payload.firstName?.trim() ?? "";
    const displayName = payload.displayName?.trim() ?? "";

    setViewerReactionName(displayName || firstName || null);
    setDefaultEntryPrivacy(normalizePrivacyLevel(payload.defaultEntryPrivacy, "public"));
    setPrivacyConfirmedAt(payload.privacyConfirmedAt ?? null);
    setTotalEntryCount(payload.totalEntryCount ?? 0);
    setFriendCount(payload.friendCount ?? 0);
    setRecentEntries(payload.recentEntries ?? []);
    setCircleEntries(payload.circleEntries ?? []);
  }, []);

  const loadHome = useCallback(
    async (refresh = false) => {
      if (!user) {
        setIsLoading(false);
        return;
      }

      if (refresh) {
        setIsRefreshing(true);
      } else {
        setIsLoading(true);
      }
      setErrorMessage(null);

      try {
        const apiResult = await fetchMobileHomeFromApi();
        if (apiResult.ok) {
          applyHomePayload(apiResult.payload);
          lastLoadedAtRef.current = Date.now();
          return;
        }

        const { data: profileWithPrivacy, error: profileError } = await supabase
          .from("profiles")
          .select("display_name, first_name, default_entry_privacy, privacy_confirmed_at")
          .eq("id", user.id)
          .maybeSingle();

        let profile = profileWithPrivacy as ProfileWithPrivacyRow | null;

        if (profileError) {
          if (
            profileError.message.includes("default_entry_privacy") ||
            profileError.message.includes("privacy_confirmed_at")
          ) {
            const fallback = await supabase
              .from("profiles")
              .select("display_name, first_name, created_at")
              .eq("id", user.id)
              .maybeSingle();

            if (fallback.error) {
              throw fallback.error;
            }

            const fallbackData = fallback.data as FallbackProfileRow | null;
            profile = fallbackData
              ? {
                  display_name: fallbackData.display_name ?? null,
                  first_name: fallbackData.first_name ?? null,
                  default_entry_privacy: "public",
                  privacy_confirmed_at:
                    fallbackData.created_at ?? new Date().toISOString(),
                }
              : null;
          } else {
            throw profileError;
          }
        }

        const { count: totalCount, error: totalCountError } = await supabase
          .from("wine_entries")
          .select("id", { count: "exact", head: true })
          .eq("user_id", user.id);

        if (totalCountError) {
          throw totalCountError;
        }

        const baseHomeSelectFields =
          "id, user_id, wine_name, producer, vintage, rating, qpr_level, consumed_at, created_at, tasted_with_user_ids, label_image_path, entry_privacy";
        const selectHomeRows = async ({
          includeDrinkingNow,
        }: {
          includeDrinkingNow: boolean;
        }) => {
          const fields = includeDrinkingNow
            ? `${baseHomeSelectFields}, drinking_now`
            : baseHomeSelectFields;
          const response = await supabase
            .from("wine_entries")
            .select(fields)
            .eq("user_id", user.id)
            .order("consumed_at", { ascending: false })
            .order("created_at", { ascending: false })
            .limit(HOME_RECENT_ENTRIES_LIMIT);
          return {
            data: (response.data ?? []).map((row) => ({
              ...(row as unknown as HomeEntryRow),
              drinking_now: includeDrinkingNow
                ? (row as unknown as HomeEntryRow).drinking_now ?? false
                : false,
            })),
            error: response.error,
          };
        };

        const ownAttempt = await selectHomeRows({ includeDrinkingNow: true });
        let ownEntries = ownAttempt.data;
        if (ownAttempt.error) {
          if (
            ownAttempt.error.message.includes("drinking_now") ||
            ownAttempt.error.message.includes("column")
          ) {
            const fallback = await selectHomeRows({ includeDrinkingNow: false });
            if (fallback.error) {
              throw fallback.error;
            }
            ownEntries = fallback.data;
          } else {
            throw ownAttempt.error;
          }
        }

        const { data: friendRows, error: friendRowsError } = await supabase
          .from("friend_requests")
          .select("requester_id, recipient_id")
          .eq("status", "accepted")
          .or(`requester_id.eq.${user.id},recipient_id.eq.${user.id}`);

        if (friendRowsError) {
          throw friendRowsError;
        }

        const friendIds = Array.from(
          new Set(
            ((friendRows ?? []) as FriendRelationRow[]).map((row) =>
              row.requester_id === user.id ? row.recipient_id : row.requester_id
            )
          )
        );

        let friendEntries: HomeEntryRow[] = [];
        if (friendIds.length > 0) {
          const buildFriendQuery = ({
            includeDrinkingNow,
            includeFeedVisibility,
          }: {
            includeDrinkingNow: boolean;
            includeFeedVisibility: boolean;
          }) => {
            const fields = includeDrinkingNow
              ? `${baseHomeSelectFields}, drinking_now`
              : baseHomeSelectFields;
            let query = supabase
              .from("wine_entries")
              .select(fields)
              .in("user_id", friendIds)
              .in("entry_privacy", ["public", "friends_of_friends", "friends"])
              .order("created_at", { ascending: false })
              .limit(HOME_CIRCLE_ENTRIES_LIMIT);

            if (includeFeedVisibility) {
              query = query.eq("is_feed_visible", true);
            }

            return query;
          };

          const friendAttempts = [
            { includeDrinkingNow: true, includeFeedVisibility: true },
            { includeDrinkingNow: false, includeFeedVisibility: true },
            { includeDrinkingNow: true, includeFeedVisibility: false },
            { includeDrinkingNow: false, includeFeedVisibility: false },
          ] as const;

          let lastFriendError: Error | { message: string } | null = null;
          for (const attempt of friendAttempts) {
            const response = await buildFriendQuery(attempt);
            if (!response.error) {
              friendEntries = (response.data ?? []).map((row) => ({
                ...(row as unknown as HomeEntryRow),
                drinking_now: attempt.includeDrinkingNow
                  ? (row as unknown as HomeEntryRow).drinking_now ?? false
                  : false,
              }));
              lastFriendError = null;
              break;
            }

            lastFriendError = response.error;
            const message = response.error.message ?? "";
            if (
              !message.includes("drinking_now") &&
              !message.includes("is_feed_visible") &&
              !message.includes("column")
            ) {
              throw response.error;
            }
          }

          if (lastFriendError) {
            throw lastFriendError;
          }
        }

        const allEntries = [...ownEntries, ...friendEntries];
        const allEntryIds = allEntries.map((entry) => entry.id);
        const labelByEntryId = await resolveEntryLabelPhotos(allEntries, {
          supabaseClient: supabase,
        });

        const reactionCountsByEntryId = new Map<string, Record<string, number>>();
        const myReactionsByEntryId = new Map<string, string[]>();
        const reactionUserIdsByEntryId = new Map<string, Record<string, string[]>>();
        const reactorUserIds = new Set<string>();
        if (allEntryIds.length > 0) {
          const { data: reactionRows, error: reactionsError } = await supabase
            .from("entry_reactions")
            .select("entry_id, user_id, emoji")
            .in("entry_id", allEntryIds);

          if (reactionsError) {
            throw reactionsError;
          }

          (reactionRows ?? []).forEach((row) => {
            const typedRow = row as HomeReactionRow;
            const counts = reactionCountsByEntryId.get(typedRow.entry_id) ?? {};
            counts[typedRow.emoji] = (counts[typedRow.emoji] ?? 0) + 1;
            reactionCountsByEntryId.set(typedRow.entry_id, counts);

            const emojiUsers = reactionUserIdsByEntryId.get(typedRow.entry_id) ?? {};
            const list = emojiUsers[typedRow.emoji] ?? [];
            if (!list.includes(typedRow.user_id)) {
              list.push(typedRow.user_id);
            }
            emojiUsers[typedRow.emoji] = list;
            reactionUserIdsByEntryId.set(typedRow.entry_id, emojiUsers);
            reactorUserIds.add(typedRow.user_id);

            if (typedRow.user_id === user.id) {
              const mine = myReactionsByEntryId.get(typedRow.entry_id) ?? [];
              if (!mine.includes(typedRow.emoji)) {
                mine.push(typedRow.emoji);
              }
              myReactionsByEntryId.set(typedRow.entry_id, mine);
            }
          });
        }

        const interactionSettingsByEntryId = new Map<string, HomeInteractionSettingsRow>();
        if (allEntryIds.length > 0) {
          const selectAttempts = ["id, reaction_privacy", "id"];

          for (let index = 0; index < selectAttempts.length; index += 1) {
            const { data, error } = await supabase
              .from("wine_entries")
              .select(selectAttempts[index])
              .in("id", allEntryIds);

            if (!error) {
              (data ?? []).forEach((row) => {
                const typedRow = row as unknown as HomeInteractionSettingsRow;
                interactionSettingsByEntryId.set(typedRow.id, typedRow);
              });
              break;
            }

            if (index === 0 && error.message.includes("reaction_privacy")) {
              continue;
            }
          }
        }

        const profileLookupIds = Array.from(
          new Set([
            ...friendEntries.map((entry) => entry.user_id),
            ...allEntries.flatMap((entry) => entry.tasted_with_user_ids ?? []),
            ...Array.from(reactorUserIds),
          ])
        );
        const acceptedFriendIds = new Set(friendIds);
        let friendProfiles: FriendProfileRow[] = [];
        if (profileLookupIds.length > 0) {
          const { data, error } = await supabase
            .from("public_profiles")
            .select("id, display_name, email, avatar_path")
            .in("id", profileLookupIds);
          if (!error && data) {
            friendProfiles = data as FriendProfileRow[];
          } else if (error && isMissingAvatarColumn(error.message)) {
            const fallback = await supabase
              .from("public_profiles")
              .select("id, display_name, email")
              .in("id", profileLookupIds);
            if (!fallback.error && fallback.data) {
              friendProfiles = fallback.data as FriendProfileRow[];
            }
          }
        }

        const profileNameById = new Map(
          friendProfiles.map((row) => [row.id, getPublicProfileName(row)])
        );
        const profileAvatarUrlById = new Map<string, string | null>();
        const signedAvatarUrlByPath = await signPhotoUrls(
          friendProfiles.map((row) => row.avatar_path ?? null),
          { supabaseClient: supabase }
        );
        friendProfiles.forEach((row) => {
          const avatarPath = row.avatar_path ?? null;
          profileAvatarUrlById.set(
            row.id,
            avatarPath ? signedAvatarUrlByPath.get(avatarPath) ?? null : null
          );
        });

        const recent = ownEntries.map((entry) => {
          const reactionPrivacy = normalizePrivacyLevel(
            interactionSettingsByEntryId.get(entry.id)?.reaction_privacy,
            entry.entry_privacy
          );
          const canReact = canViewerAccessByHomePrivacy({
            viewerUserId: user.id,
            ownerUserId: entry.user_id,
            privacy: reactionPrivacy,
            acceptedFriendIds,
          });
          return {
            id: entry.id,
            wine_name: entry.wine_name,
            producer: entry.producer,
            vintage: entry.vintage,
            rating: entry.rating,
            qpr_level: entry.qpr_level,
            consumed_at: entry.consumed_at,
            created_at: entry.created_at,
            drinking_now: entry.drinking_now === true,
            tasted_with_names: (entry.tasted_with_user_ids ?? []).map(
              (id) => profileNameById.get(id) ?? "Unknown"
            ),
            label_image_url: labelByEntryId.get(entry.id)?.signedUrl ?? null,
            can_react: canReact,
            my_reactions: canReact ? myReactionsByEntryId.get(entry.id) ?? [] : [],
            reaction_counts: canReact ? reactionCountsByEntryId.get(entry.id) ?? {} : {},
            reaction_users: canReact
              ? Object.fromEntries(
              Object.entries(reactionUserIdsByEntryId.get(entry.id) ?? {}).map(
                ([emoji, ids]) => [emoji, ids.map((id) => profileNameById.get(id) ?? "Unknown")]
              )
              )
              : {},
          };
        });

        const circle = friendEntries.map((entry) => {
          const reactionPrivacy = normalizePrivacyLevel(
            interactionSettingsByEntryId.get(entry.id)?.reaction_privacy,
            entry.entry_privacy
          );
          const canReact = canViewerAccessByHomePrivacy({
            viewerUserId: user.id,
            ownerUserId: entry.user_id,
            privacy: reactionPrivacy,
            acceptedFriendIds,
          });
          return {
            id: entry.id,
            user_id: entry.user_id,
            wine_name: entry.wine_name,
            producer: entry.producer,
            vintage: entry.vintage,
            rating: entry.rating,
            qpr_level: entry.qpr_level,
            consumed_at: entry.consumed_at,
            created_at: entry.created_at,
            drinking_now: entry.drinking_now === true,
            tasted_with_names: (entry.tasted_with_user_ids ?? []).map(
              (id) => profileNameById.get(id) ?? "Unknown"
            ),
            author_name: profileNameById.get(entry.user_id) ?? "Unknown",
            author_avatar_url: profileAvatarUrlById.get(entry.user_id) ?? null,
            label_image_url: labelByEntryId.get(entry.id)?.signedUrl ?? null,
            can_react: canReact,
            my_reactions: canReact ? myReactionsByEntryId.get(entry.id) ?? [] : [],
            reaction_counts: canReact ? reactionCountsByEntryId.get(entry.id) ?? {} : {},
            reaction_users: canReact
              ? Object.fromEntries(
              Object.entries(reactionUserIdsByEntryId.get(entry.id) ?? {}).map(
                ([emoji, ids]) => [emoji, ids.map((id) => profileNameById.get(id) ?? "Unknown")]
              )
              )
              : {},
          };
        });

        applyHomePayload({
          firstName: typeof profile?.first_name === "string" ? profile.first_name : null,
          displayName:
            typeof profile?.display_name === "string" ? profile.display_name : null,
          defaultEntryPrivacy: normalizePrivacyLevel(
            profile?.default_entry_privacy,
            "public"
          ),
          privacyConfirmedAt:
            typeof profile?.privacy_confirmed_at === "string"
              ? profile.privacy_confirmed_at
              : null,
          totalEntryCount: totalCount ?? 0,
          friendCount: friendIds.length,
          recentEntries: recent,
          circleEntries: circle,
        });
        lastLoadedAtRef.current = Date.now();
      } catch (error) {
        setErrorMessage(
          error instanceof Error ? error.message : "Unable to load home right now."
        );
      } finally {
        setIsLoading(false);
        setIsRefreshing(false);
      }
    },
    [applyHomePayload, user]
  );

  useFocusEffect(
    useCallback(() => {
      if (!hasLoadedHomeRef.current) {
        hasLoadedHomeRef.current = true;
        void loadHome();
        return;
      }

      const msSinceLastLoad = lastLoadedAtRef.current
        ? Date.now() - lastLoadedAtRef.current
        : Infinity;
      if (msSinceLastLoad >= BACKGROUND_REFRESH_STALE_MS) {
        void loadHome(true);
      }
    }, [loadHome])
  );

  const toggleHomeReaction = useCallback(
    async (entryId: string, emoji: string) => {
      if (!user?.id) {
        return;
      }

      const target =
        recentEntries.find((entry) => entry.id === entryId) ??
        circleEntries.find((entry) => entry.id === entryId);
      if (!target) {
        return;
      }

      const hasMine = target.my_reactions.includes(emoji);
      const viewerName = viewerReactionName ?? "You";
      const applyToEntry = <T extends RecentEntry | CircleEntry>(entry: T): T => {
        if (entry.id !== entryId) {
          return entry;
        }

        if (hasMine) {
          const nextCounts = { ...entry.reaction_counts };
          const nextCount = Math.max(0, (nextCounts[emoji] ?? 1) - 1);
          if (nextCount === 0) {
            delete nextCounts[emoji];
          } else {
            nextCounts[emoji] = nextCount;
          }

          const nextUsers = { ...entry.reaction_users };
          const filteredUsers = (nextUsers[emoji] ?? []).filter((name) => name !== viewerName);
          if (filteredUsers.length > 0) {
            nextUsers[emoji] = filteredUsers;
          } else {
            delete nextUsers[emoji];
          }

          return {
            ...entry,
            reaction_counts: nextCounts,
            reaction_users: nextUsers,
            my_reactions: entry.my_reactions.filter((value) => value !== emoji),
          } as T;
        }

        const nextUsers = { ...entry.reaction_users };
        const currentUsers = nextUsers[emoji] ?? [];
        nextUsers[emoji] = currentUsers.includes(viewerName)
          ? currentUsers
          : [...currentUsers, viewerName];

        return {
          ...entry,
          reaction_counts: {
            ...entry.reaction_counts,
            [emoji]: (entry.reaction_counts[emoji] ?? 0) + 1,
          },
          reaction_users: nextUsers,
          my_reactions: [...entry.my_reactions, emoji],
        } as T;
      };

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
      }

      setRecentEntries((current) => current.map(applyToEntry));
      setCircleEntries((current) => current.map(applyToEntry));
    },
    [circleEntries, recentEntries, user?.id, viewerReactionName]
  );

  const confirmDefaultPrivacy = async () => {
    if (!user) {
      return;
    }

    setSavingPrivacyOnboarding(true);
    setPrivacyOnboardingError(null);
    const nowIso = new Date().toISOString();

    const { error } = await supabase
      .from("profiles")
      .update({
        default_entry_privacy: defaultEntryPrivacy,
        privacy_confirmed_at: nowIso,
      })
      .eq("id", user.id);

    setSavingPrivacyOnboarding(false);

    if (error) {
      if (
        error.message.includes("default_entry_privacy") ||
        error.message.includes("privacy_confirmed_at") ||
        error.message.includes("column")
      ) {
        setPrivacyConfirmedAt(nowIso);
        return;
      }

      setPrivacyOnboardingError(
        error.message ?? "Unable to confirm privacy preference."
      );
      return;
    }

    setPrivacyConfirmedAt(nowIso);
  };

  if (isLoading) {
    return (
      <View style={styles.screen}>
        <ScrollView contentContainerStyle={styles.content}>
          <AppTopBar />
          <View style={styles.loadingCard}>
            <ActivityIndicator color={colors.grenache} />
            <AppText style={styles.loadingText}>Loading...</AppText>
          </View>
        </ScrollView>
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={() => void loadHome(true)}
            tintColor={colors.grenache}
          />
        }
      >
        <AppTopBar />

        <View style={styles.header}>
          <AppText style={styles.eyebrow}>{HOME_HEADER_COPY.eyebrow}</AppText>
          <AppText
            style={[styles.title, !isFirstTime ? styles.returningTitle : null]}
          >
            {isFirstTime
              ? HOME_HEADER_COPY.firstTimeTitle
              : HOME_HEADER_COPY.returningTitle}
          </AppText>
          <AppText style={styles.subtitle}>
            {isFirstTime
              ? HOME_HEADER_COPY.firstTimeSubtitle
              : HOME_HEADER_COPY.returningSubtitle}
          </AppText>
        </View>

        {errorMessage ? (
          <View style={styles.errorCard}>
            <AppText style={styles.errorText}>{errorMessage}</AppText>
          </View>
        ) : null}

        {!privacyConfirmedAt ? (
          <View style={styles.onboardingCard}>
            <AppText style={styles.onboardingEyebrow}>
              {HOME_PRIVACY_ONBOARDING_COPY.eyebrow}
            </AppText>
            <AppText style={styles.onboardingTitle}>
              {HOME_PRIVACY_ONBOARDING_COPY.title}
            </AppText>
            <AppText style={styles.onboardingSubtitle}>
              {HOME_PRIVACY_ONBOARDING_COPY.subtitle}
            </AppText>

            <View style={styles.privacyOptions}>
              {HOME_PRIVACY_OPTION_VALUES.map((value) => {
                const selected = defaultEntryPrivacy === value;
                const tone = PRIVACY_TONES[value];
                return (
                  <Pressable
                    key={value}
                    onPress={() => setDefaultEntryPrivacy(value)}
                    style={[
                      styles.privacyOption,
                      selected ? styles.privacyOptionSelected : null,
                    ]}
                  >
                    <View
                      style={[
                        styles.privacyBadge,
                        {
                          borderColor: tone.borderColor,
                          backgroundColor: tone.backgroundColor,
                        },
                      ]}
                    >
                      <AppText
                        style={[
                          styles.privacyBadgeText,
                          { color: tone.textColor },
                        ]}
                      >
                        {PRIVACY_LEVEL_LABELS[value]}
                      </AppText>
                    </View>
                    <AppText style={styles.privacyDescription}>
                      {HOME_PRIVACY_OPTION_DESCRIPTIONS[value]}
                    </AppText>
                  </Pressable>
                );
              })}
            </View>

            {privacyOnboardingError ? (
              <AppText style={styles.errorText}>{privacyOnboardingError}</AppText>
            ) : null}

            <Pressable
              onPress={() => void confirmDefaultPrivacy()}
              disabled={savingPrivacyOnboarding}
              style={[
                styles.confirmPrivacyButton,
                savingPrivacyOnboarding ? styles.confirmPrivacyButtonDisabled : null,
              ]}
            >
              <AppText style={styles.confirmPrivacyButtonText}>
                {savingPrivacyOnboarding
                  ? HOME_PRIVACY_ONBOARDING_COPY.savingLabel
                  : HOME_PRIVACY_ONBOARDING_COPY.confirmLabel}
              </AppText>
            </Pressable>
          </View>
        ) : null}

        {isFirstTime ? (
          <View style={styles.heroCard}>
            <AppText style={styles.heroTitle}>Record your first pour</AppText>
            <AppText style={styles.heroSubtitle}>
              Snap a photo of the label and we&apos;ll autofill the details. Or jot
              down what you&apos;re drinking.
            </AppText>
            <Pressable
              style={styles.primaryButton}
              onPress={() => router.push("/(app)/entries/new")}
            >
              <AppText style={styles.primaryButtonText}>
                {HOME_ACTION_LABELS.recordNewPour}
              </AppText>
            </Pressable>
            {hasPrivateBetaFeatureAccess ? (
              <Pressable
                style={styles.secondaryCtaButton}
                onPress={() => router.push("../list-scan" as RelativePathString)}
              >
                <AppText style={styles.secondaryCtaButtonText}>
                  {HOME_ACTION_LABELS.scanUploadList}
                </AppText>
              </Pressable>
            ) : null}
          </View>
        ) : (
          <View style={styles.inlineCtaRow}>
            <Pressable
              style={styles.inlineCtaButton}
              onPress={() => router.push("/(app)/entries/new")}
            >
              <AppText style={styles.inlineCtaButtonText}>
                {HOME_ACTION_LABELS.recordNewPour}
              </AppText>
            </Pressable>
            {hasPrivateBetaFeatureAccess ? (
              <Pressable
                style={styles.inlineSecondaryCtaButton}
                onPress={() => router.push("../list-scan" as RelativePathString)}
              >
                <AppText style={styles.inlineSecondaryCtaButtonText}>
                  {HOME_ACTION_LABELS.scanUploadList}
                </AppText>
              </Pressable>
            ) : null}
          </View>
        )}

        {!isFirstTime ? <View style={styles.sectionDivider} /> : null}

        {!isFirstTime ? (
          <View style={styles.section}>
            <AppText style={styles.sectionLabel}>
              {HOME_SECTION_LABELS.recentFromYou}
            </AppText>
            <View style={styles.cardStack}>
              {recentEntries.length > 0 ? (
                recentEntries.map((entry) => (
                  <HomeEntryCard
                    key={entry.id}
                    entry={entry}
                    ownerLabel="You"
                    onPress={() => router.push(`/(app)/entries/${entry.id}`)}
                    onToggleReaction={(emoji) => void toggleHomeReaction(entry.id, emoji)}
                    showDrinkingNowGlow={isDrinkingNowActive({
                      drinkingNow: entry.drinking_now,
                      createdAt: entry.created_at,
                      now: currentTimeMs,
                    })}
                    variant="own"
                  />
                ))
              ) : (
                <View style={styles.emptyCard}>
                  <AppText style={styles.emptyText}>
                    {HOME_EMPTY_STATE_COPY.noRecentEntries}
                  </AppText>
                </View>
              )}
            </View>
            <Pressable onPress={() => router.push("/(app)/entries")}>
              <AppText style={[styles.inlineLink, styles.inlineLinkCompact]}>
                {HOME_ACTION_LABELS.viewMyLibrary}
              </AppText>
            </Pressable>
          </View>
        ) : null}

        {!isFirstTime ? (
          <View
            style={[styles.sectionDivider, styles.sectionDividerBeforeCircle]}
          />
        ) : null}

        <View style={styles.section}>
          <AppText style={styles.sectionLabel}>
            {HOME_SECTION_LABELS.fromYourCircle}
          </AppText>

          {circleEntries.length === 0 ? (
            <View style={styles.emptyCard}>
              {friendCount === 0 ? (
                <>
                  <AppText style={styles.emptyText}>
                    {isFirstTime
                      ? HOME_EMPTY_STATE_COPY.noFriendsFirstTime
                      : HOME_EMPTY_STATE_COPY.noFriendsReturning}
                  </AppText>
                  <Pressable
                    style={styles.secondaryButton}
                    onPress={() => router.push("/(app)/feed")}
                  >
                    <AppText style={styles.secondaryButtonText}>
                      {HOME_ACTION_LABELS.findFriends}
                    </AppText>
                  </Pressable>
                </>
              ) : (
                <>
                  <AppText style={styles.emptyText}>
                    {HOME_EMPTY_STATE_COPY.noCirclePosts}
                  </AppText>
                  <Pressable onPress={() => router.push("/(app)/feed")}>
                    <AppText style={[styles.inlineLink, styles.inlineLinkHighlight]}>
                      {HOME_ACTION_LABELS.browsePublicFeed}
                    </AppText>
                  </Pressable>
                </>
              )}
            </View>
          ) : (
            <>
              <View style={styles.cardStack}>
                {circleEntries.map((entry) => (
                  <HomeEntryCard
                    key={entry.id}
                    entry={entry}
                    ownerLabel={entry.author_name}
                    ownerAvatarUrl={entry.author_avatar_url}
                    ownerOnPress={() => router.push("/(app)/feed")}
                    onPress={() => router.push(`/(app)/entries/${entry.id}`)}
                    onToggleReaction={(emoji) => void toggleHomeReaction(entry.id, emoji)}
                    showDrinkingNowGlow={isDrinkingNowActive({
                      drinkingNow: entry.drinking_now,
                      createdAt: entry.created_at,
                      now: currentTimeMs,
                    })}
                    variant="circle"
                  />
                ))}
              </View>
              <Pressable onPress={() => router.push("/(app)/feed")}>
                <AppText style={[styles.inlineLink, styles.inlineLinkCompact]}>
                  {HOME_ACTION_LABELS.viewFullFeed}
                </AppText>
              </Pressable>
            </>
          )}
        </View>
      </ScrollView>
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
  header: {
    gap: 6,
  },
  eyebrow: {
    color: colors.accentSecondary,
    fontSize: 9,
    fontWeight: "700",
    letterSpacing: 3,
    textTransform: "uppercase",
  },
  title: {
    color: colors.textPrimary,
    fontFamily: fonts.serif.light,
    fontSize: 28,
    lineHeight: 34,
  },
  returningTitle: {
    fontSize: 28,
    lineHeight: 34,
  },
  subtitle: {
    color: colors.textSecondary,
    fontSize: 13,
    lineHeight: 18,
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
  onboardingCard: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(123,29,58,0.35)",
    backgroundColor: "rgba(123,29,58,0.1)",
    padding: 13,
    gap: 8,
  },
  onboardingEyebrow: {
    color: colors.rose,
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 1.4,
    textTransform: "uppercase",
  },
  onboardingTitle: {
    color: colors.textPrimary,
    fontSize: 18,
    fontWeight: "700",
  },
  onboardingSubtitle: {
    color: colors.textSecondary,
    fontSize: 13,
    lineHeight: 18,
  },
  privacyOptions: {
    gap: 8,
  },
  privacyOption: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfacePrimary,
    paddingHorizontal: 11,
    paddingVertical: 10,
  },
  privacyOptionSelected: {
    borderColor: "rgba(123,29,58,0.55)",
    backgroundColor: "rgba(123,29,58,0.14)",
  },
  privacyBadge: {
    alignSelf: "flex-start",
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  privacyBadgeText: {
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 0.4,
    textTransform: "uppercase",
  },
  privacyDescription: {
    marginTop: 6,
    color: colors.textSecondary,
    fontSize: 12,
    lineHeight: 16,
  },
  confirmPrivacyButton: {
    alignSelf: "flex-start",
    marginTop: 2,
    borderRadius: 999,
    backgroundColor: colors.grenache,
    paddingHorizontal: 14,
    paddingVertical: 9,
  },
  confirmPrivacyButtonDisabled: {
    opacity: 0.7,
  },
  confirmPrivacyButtonText: {
    color: colors.textPrimary,
    fontSize: 13,
    fontWeight: "700",
  },
  heroCard: {
    borderRadius: 22,
    borderWidth: 1,
    borderColor: "rgba(123,29,58,0.32)",
    backgroundColor: "rgba(123,29,58,0.08)",
    paddingHorizontal: 18,
    paddingVertical: 18,
    alignItems: "center",
    gap: 8,
  },
  heroTitle: {
    color: colors.textPrimary,
    fontSize: 20,
    fontWeight: "700",
  },
  heroSubtitle: {
    color: colors.textSecondary,
    fontSize: 13,
    lineHeight: 18,
    textAlign: "center",
  },
  primaryButton: {
    marginTop: 2,
    borderRadius: 999,
    backgroundColor: colors.grenache,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  primaryButtonText: {
    color: colors.textPrimary,
    fontSize: 13,
    fontWeight: "700",
  },
  secondaryCtaButton: {
    marginTop: 2,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(45,125,70,0.34)",
    backgroundColor: "rgba(45,125,70,0.12)",
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  secondaryCtaButtonText: {
    color: colors.success,
    fontSize: 13,
    fontWeight: "700",
  },
  inlineCtaRow: {
    alignSelf: "flex-start",
    flexDirection: "column",
    flexWrap: "wrap",
    gap: 10,
  },
  inlineCtaButton: {
    borderRadius: 999,
    backgroundColor: colors.grenache,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  inlineCtaButtonText: {
    color: colors.textPrimary,
    fontSize: 13,
    fontWeight: "700",
  },
  inlineSecondaryCtaButton: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(45,125,70,0.34)",
    backgroundColor: "rgba(45,125,70,0.12)",
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  inlineSecondaryCtaButtonText: {
    color: colors.success,
    fontSize: 13,
    fontWeight: "700",
  },
  section: {
    gap: 10,
  },
  sectionDivider: {
    borderTopWidth: 1,
    borderTopColor: colors.border,
    marginVertical: 2,
  },
  sectionDividerBeforeCircle: {
    marginTop: 10,
  },
  sectionLabel: {
    color: colors.textSecondary,
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 1.4,
    textTransform: "uppercase",
  },
  cardStack: {
    gap: 10,
  },
  entryCard: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfacePrimary,
    padding: 13,
  },
  entryCardDrinkingNow: {
    borderColor: "rgba(74,48,96,0.4)",
    backgroundColor: "#130d1e",
    shadowColor: colors.accentPurple,
    shadowOpacity: 0.15,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 0 },
    elevation: 10,
  },
  entryHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  entryOwner: {
    color: colors.textPrimary,
    fontSize: 12,
    fontWeight: "600",
    flexShrink: 1,
    lineHeight: 17,
  },
  entryOwnerStack: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    flex: 1,
    minWidth: 0,
  },
  entryOwnerAvatar: {
    width: 28,
    height: 28,
    borderRadius: 999,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfacePrimary,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  entryOwnerAvatarImage: {
    width: "100%",
    height: "100%",
  },
  entryOwnerAvatarFallback: {
    color: colors.textSecondary,
    fontSize: 11,
    fontWeight: "700",
  },
  entryOwnerButton: {
    color: colors.textPrimary,
  },
  entryDate: {
    color: colors.textSecondary,
    fontSize: 12,
  },
  entryBodyRow: {
    marginTop: 10,
    flexDirection: "row",
    gap: 12,
  },
  photoBox: {
    width: 80,
    height: 80,
    borderRadius: 14,
    backgroundColor: colors.surfacePrimary,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  photoImage: {
    width: "100%",
    height: "100%",
  },
  photoText: {
    color: colors.textSecondary,
    fontSize: 11,
    textAlign: "center",
    paddingHorizontal: 6,
  },
  entryMain: {
    flex: 1,
    justifyContent: "space-between",
    gap: 8,
  },
  entryTitle: {
    color: colors.textPrimary,
    fontSize: 15,
    fontWeight: "700",
  },
  entrySubtitle: {
    marginTop: 2,
    color: colors.textSecondary,
    fontSize: 12,
  },
  entryMetaRow: {
    marginTop: 2,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    flexWrap: "wrap",
  },
  homeReactionSection: {
    marginTop: 4,
    gap: 8,
  },
  homeReactionRight: {
    marginLeft: "auto",
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 6,
    justifyContent: "flex-end",
    flexShrink: 1,
  },
  ratingText: {
    color: colors.accentGold,
    fontSize: 12,
    fontWeight: "800",
    backgroundColor: "rgba(201,168,76,0.1)",
    borderRadius: 6,
    overflow: "hidden",
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  qprTag: {
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 8,
    paddingVertical: 3,
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 0.6,
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
  inlineLink: {
    color: colors.textSecondary,
    fontSize: 13,
    fontWeight: "600",
  },
  inlineLinkCompact: {
    fontSize: 11,
  },
  inlineLinkHighlight: {
    color: colors.rose,
  },
  emptyCard: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfacePrimary,
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 8,
  },
  emptyText: {
    color: colors.textSecondary,
    fontSize: 13,
    lineHeight: 18,
  },
  secondaryButton: {
    alignSelf: "flex-start",
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  secondaryButtonText: {
    color: colors.textPrimary,
    fontSize: 12,
    fontWeight: "700",
  },
});

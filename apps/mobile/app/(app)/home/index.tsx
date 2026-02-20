import {
  useCallback,
  useEffect,
  useMemo,
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
import { router } from "expo-router";
import {
  PRIVACY_LEVEL_LABELS,
  QPR_LEVEL_LABELS,
  normalizePrivacyLevel,
  type PrivacyLevel,
  type QprLevel,
} from "@cellarsnap/shared";
import { AppTopBar } from "@/src/components/AppTopBar";
import { AppText } from "@/src/components/AppText";
import { supabase } from "@/src/lib/supabase";
import { useAuth } from "@/src/providers/AuthProvider";

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
  label_image_path: string | null;
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

type EntryPhotoRow = {
  entry_id: string;
  path: string;
  position: number;
  created_at: string;
};

type FriendProfileRow = {
  id: string;
  display_name: string | null;
  email: string | null;
};

type RecentEntry = {
  id: string;
  wine_name: string | null;
  producer: string | null;
  vintage: string | null;
  rating: number | null;
  qpr_level: QprLevel | null;
  consumed_at: string;
  label_image_url: string | null;
};

type CircleEntry = RecentEntry & {
  user_id: string;
  author_name: string;
};

const PRIVACY_OPTIONS: Array<{
  value: PrivacyLevel;
  description: string;
}> = [
  { value: "public", description: "Visible to everyone" },
  {
    value: "friends_of_friends",
    description: "Visible to friends and their friends",
  },
  { value: "friends", description: "Visible only to accepted friends" },
  { value: "private", description: "Visible only to you" },
];

const PRIVACY_TONES: Record<
  PrivacyLevel,
  { borderColor: string; backgroundColor: string; textColor: string }
> = {
  public: {
    borderColor: "rgba(125, 211, 252, 0.45)",
    backgroundColor: "rgba(14, 165, 233, 0.12)",
    textColor: "#e0f2fe",
  },
  friends_of_friends: {
    borderColor: "rgba(45, 212, 191, 0.45)",
    backgroundColor: "rgba(20, 184, 166, 0.12)",
    textColor: "#ccfbf1",
  },
  friends: {
    borderColor: "rgba(252, 211, 77, 0.45)",
    backgroundColor: "rgba(251, 191, 36, 0.12)",
    textColor: "#fef3c7",
  },
  private: {
    borderColor: "rgba(251, 113, 133, 0.45)",
    backgroundColor: "rgba(244, 63, 94, 0.12)",
    textColor: "#fecdd3",
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

function getDisplayRating(rating: number | null): string | null {
  if (typeof rating !== "number" || Number.isNaN(rating)) {
    return null;
  }
  const normalized = Math.max(0, Math.min(100, Math.round(rating)));
  return `${normalized}/100`;
}

async function createSignedUrlMap(paths: string[]) {
  const signedUrlByPath = new Map<string, string | null>();

  await Promise.all(
    paths.map(async (path) => {
      const { data, error } = await supabase.storage
        .from("wine-photos")
        .createSignedUrl(path, 60 * 60);
      signedUrlByPath.set(path, error ? null : data.signedUrl);
    })
  );

  return signedUrlByPath;
}

function HomeEntryCard({
  entry,
  ownerLabel,
  ownerOnPress,
  onPress,
  variant,
}: {
  entry: RecentEntry | CircleEntry;
  ownerLabel: string;
  ownerOnPress?: () => void;
  onPress: () => void;
  variant: "own" | "circle";
}) {
  const hideProducer = shouldHideProducerInEntryTile(entry.wine_name, entry.producer);
  const producer = hideProducer ? null : entry.producer?.trim() || null;
  const vintage = entry.vintage?.trim() || null;
  const displayRating = getDisplayRating(entry.rating);
  const subtitle =
    variant === "own"
      ? producer || vintage
        ? `${producer ?? ""}${producer && vintage ? " - " : ""}${vintage ?? ""}`
        : null
      : producer;

  return (
    <Pressable style={styles.entryCard} onPress={onPress}>
      <View style={styles.entryHeaderRow}>
        {ownerOnPress ? (
          <Pressable onPress={ownerOnPress}>
            <AppText style={[styles.entryOwner, styles.entryOwnerButton]}>
              {ownerLabel}
            </AppText>
          </Pressable>
        ) : (
          <AppText style={styles.entryOwner}>{ownerLabel}</AppText>
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
        </View>
      </View>
    </Pressable>
  );
}

export default function HomeScreen() {
  const { user } = useAuth();
  const [welcomeName, setWelcomeName] = useState<string | null>(null);
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

  const isFirstTime = useMemo(() => totalEntryCount === 0, [totalEntryCount]);
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

        const { data: ownRows, error: ownRowsError } = await supabase
          .from("wine_entries")
          .select(
            "id, user_id, wine_name, producer, vintage, rating, qpr_level, consumed_at, created_at, label_image_path"
          )
          .eq("user_id", user.id)
          .order("consumed_at", { ascending: false })
          .order("created_at", { ascending: false })
          .limit(3);

        if (ownRowsError) {
          throw ownRowsError;
        }

        const ownEntries = (ownRows ?? []) as HomeEntryRow[];

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
          const buildFriendQuery = () =>
            supabase
              .from("wine_entries")
              .select(
                "id, user_id, wine_name, producer, vintage, rating, qpr_level, consumed_at, created_at, label_image_path"
              )
              .in("user_id", friendIds)
              .in("entry_privacy", ["public", "friends_of_friends", "friends"])
              .order("created_at", { ascending: false })
              .limit(6);

          const attempt = await buildFriendQuery().eq("is_feed_visible", true);
          if (!attempt.error) {
            friendEntries = (attempt.data ?? []) as HomeEntryRow[];
          } else if (
            attempt.error.message.includes("is_feed_visible") ||
            attempt.error.message.includes("column")
          ) {
            const fallback = await buildFriendQuery();
            if (fallback.error) {
              throw fallback.error;
            }
            friendEntries = (fallback.data ?? []) as HomeEntryRow[];
          } else {
            throw attempt.error;
          }
        }

        const allEntries = [...ownEntries, ...friendEntries];
        const allEntryIds = allEntries.map((entry) => entry.id);

        let labelPhotos: EntryPhotoRow[] = [];
        if (allEntryIds.length > 0) {
          const { data, error } = await supabase
            .from("entry_photos")
            .select("entry_id, path, position, created_at")
            .eq("type", "label")
            .in("entry_id", allEntryIds)
            .order("position", { ascending: true })
            .order("created_at", { ascending: true });

          if (!error && data) {
            labelPhotos = data as EntryPhotoRow[];
          }
        }

        const labelPathByEntryId = new Map<string, string>();
        labelPhotos.forEach((photo) => {
          if (!labelPathByEntryId.has(photo.entry_id)) {
            labelPathByEntryId.set(photo.entry_id, photo.path);
          }
        });

        const labelPathsToSign = Array.from(
          new Set(
            allEntries
              .map(
                (entry) =>
                  labelPathByEntryId.get(entry.id) ?? entry.label_image_path ?? null
              )
              .filter((path): path is string => Boolean(path && path !== "pending"))
          )
        );
        const signedUrlByPath = await createSignedUrlMap(labelPathsToSign);

        const friendUserIds = Array.from(new Set(friendEntries.map((entry) => entry.user_id)));
        let friendProfiles: FriendProfileRow[] = [];
        if (friendUserIds.length > 0) {
          const { data, error } = await supabase
            .from("profiles")
            .select("id, display_name, email")
            .in("id", friendUserIds);
          if (!error && data) {
            friendProfiles = data as FriendProfileRow[];
          }
        }

        const profileNameById = new Map(
          friendProfiles.map((row) => [
            row.id,
            row.display_name?.trim() || row.email?.trim() || "Unknown",
          ])
        );

        const recent = ownEntries.map((entry) => {
          const labelPath =
            labelPathByEntryId.get(entry.id) ?? entry.label_image_path ?? null;
          return {
            id: entry.id,
            wine_name: entry.wine_name,
            producer: entry.producer,
            vintage: entry.vintage,
            rating: entry.rating,
            qpr_level: entry.qpr_level,
            consumed_at: entry.consumed_at,
            label_image_url: labelPath
              ? signedUrlByPath.get(labelPath) ?? null
              : null,
          };
        });

        const circle = friendEntries.map((entry) => {
          const labelPath =
            labelPathByEntryId.get(entry.id) ?? entry.label_image_path ?? null;
          return {
            id: entry.id,
            user_id: entry.user_id,
            wine_name: entry.wine_name,
            producer: entry.producer,
            vintage: entry.vintage,
            rating: entry.rating,
            qpr_level: entry.qpr_level,
            consumed_at: entry.consumed_at,
            author_name: profileNameById.get(entry.user_id) ?? "Unknown",
            label_image_url: labelPath
              ? signedUrlByPath.get(labelPath) ?? null
              : null,
          };
        });

        const firstName =
          typeof profile?.first_name === "string" ? profile.first_name.trim() : "";
        const displayName =
          typeof profile?.display_name === "string"
            ? profile.display_name.trim()
            : "";

        setWelcomeName(firstName || displayName || null);
        setDefaultEntryPrivacy(
          normalizePrivacyLevel(profile?.default_entry_privacy, "public")
        );
        setPrivacyConfirmedAt(
          typeof profile?.privacy_confirmed_at === "string"
            ? profile.privacy_confirmed_at
            : null
        );
        setTotalEntryCount(totalCount ?? 0);
        setFriendCount(friendIds.length);
        setRecentEntries(recent);
        setCircleEntries(circle);
      } catch (error) {
        setErrorMessage(
          error instanceof Error ? error.message : "Unable to load home right now."
        );
      } finally {
        setIsLoading(false);
        setIsRefreshing(false);
      }
    },
    [user]
  );

  useEffect(() => {
    void loadHome();
  }, [loadHome]);

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
          <AppTopBar activeHref="/(app)/home" />
          <View style={styles.loadingCard}>
            <ActivityIndicator color="#fbbf24" />
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
            tintColor="#fbbf24"
          />
        }
      >
        <AppTopBar activeHref="/(app)/home" />

        <View style={styles.header}>
          <AppText style={styles.eyebrow}>
            {isFirstTime ? "Getting started" : "Home"}
          </AppText>
          <AppText style={styles.title}>
            {isFirstTime
              ? welcomeName
                ? `Welcome to CellarSnap, ${welcomeName}.`
                : "Welcome to CellarSnap."
              : welcomeName
                ? `Welcome back, ${welcomeName}.`
                : "Welcome back."}
          </AppText>
          <AppText style={styles.subtitle}>
            {isFirstTime
              ? "Your personal wine journal. Snap a label, log the moment, share with friends."
              : "What's happening in your wine world right now?"}
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
              Onboarding privacy check
            </AppText>
            <AppText style={styles.onboardingTitle}>
              Confirm who should see new entries by default
            </AppText>
            <AppText style={styles.onboardingSubtitle}>
              You can still override visibility per entry at any time.
            </AppText>

            <View style={styles.privacyOptions}>
              {PRIVACY_OPTIONS.map((option) => {
                const selected = defaultEntryPrivacy === option.value;
                const tone = PRIVACY_TONES[option.value];
                return (
                  <Pressable
                    key={option.value}
                    onPress={() => setDefaultEntryPrivacy(option.value)}
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
                        {PRIVACY_LEVEL_LABELS[option.value]}
                      </AppText>
                    </View>
                    <AppText style={styles.privacyDescription}>
                      {option.description}
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
                  ? "Saving..."
                  : "Confirm default privacy"}
              </AppText>
            </Pressable>
          </View>
        ) : null}

        {isFirstTime ? (
          <View style={styles.heroCard}>
            <AppText style={styles.heroTitle}>Record your first pour</AppText>
            <AppText style={styles.heroSubtitle}>
              Snap a photo of the label and we'll autofill the details. Or jot
              down what you're drinking.
            </AppText>
            <Pressable
              style={styles.primaryButton}
              onPress={() => router.push("/(app)/entries/new")}
            >
              <AppText style={styles.primaryButtonText}>+ Record a new pour</AppText>
            </Pressable>
          </View>
        ) : (
          <Pressable
            style={styles.inlineCtaButton}
            onPress={() => router.push("/(app)/entries/new")}
          >
            <AppText style={styles.inlineCtaButtonText}>+ Record a new pour</AppText>
          </Pressable>
        )}

        {!isFirstTime ? <View style={styles.sectionDivider} /> : null}

        {!isFirstTime ? (
          <View style={styles.section}>
            <AppText style={styles.sectionLabel}>Recent from you</AppText>
            <View style={styles.cardStack}>
              {recentEntries.length > 0 ? (
                recentEntries.map((entry) => (
                  <HomeEntryCard
                    key={entry.id}
                    entry={entry}
                    ownerLabel="You"
                    onPress={() => router.push("/(app)/entries")}
                    variant="own"
                  />
                ))
              ) : (
                <View style={styles.emptyCard}>
                  <AppText style={styles.emptyText}>No recent entries yet.</AppText>
                </View>
              )}
            </View>
            <Pressable onPress={() => router.push("/(app)/entries")}>
              <AppText style={styles.inlineLink}>View my library {"\u2192"}</AppText>
            </Pressable>
          </View>
        ) : null}

        {!isFirstTime ? <View style={styles.sectionDivider} /> : null}

        <View style={styles.section}>
          <AppText style={styles.sectionLabel}>From your circle</AppText>

          {circleEntries.length === 0 ? (
            <View style={styles.emptyCard}>
              {friendCount === 0 ? (
                <>
                  <AppText style={styles.emptyText}>
                    {isFirstTime
                      ? "CellarSnap is better with friends. Add the people you drink with and see what they're enjoying."
                      : "You haven't added any friends yet."}
                  </AppText>
                  <Pressable
                    style={styles.secondaryButton}
                    onPress={() => router.push("/(app)/feed")}
                  >
                    <AppText style={styles.secondaryButtonText}>Find friends</AppText>
                  </Pressable>
                </>
              ) : (
                <>
                  <AppText style={styles.emptyText}>
                    Your friends haven't posted anything yet. Check back soon!
                  </AppText>
                  <Pressable onPress={() => router.push("/(app)/feed")}>
                    <AppText style={[styles.inlineLink, styles.inlineLinkHighlight]}>
                      Browse the public feed -&gt;
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
                    ownerOnPress={() => router.push("/(app)/feed")}
                    onPress={() => router.push("/(app)/feed")}
                    variant="circle"
                  />
                ))}
              </View>
              <Pressable onPress={() => router.push("/(app)/feed")}>
                <AppText style={styles.inlineLink}>View full feed {"\u2192"}</AppText>
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
    backgroundColor: "#0f0a09",
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
  header: {
    gap: 6,
  },
  eyebrow: {
    color: "#fcd34d",
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 2,
    textTransform: "uppercase",
  },
  title: {
    color: "#fafafa",
    fontSize: 30,
    fontWeight: "700",
    lineHeight: 36,
  },
  subtitle: {
    color: "#d4d4d8",
    fontSize: 13,
    lineHeight: 18,
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
  onboardingCard: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(252,211,77,0.35)",
    backgroundColor: "rgba(251,191,36,0.1)",
    padding: 13,
    gap: 8,
  },
  onboardingEyebrow: {
    color: "#fde68a",
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 1.4,
    textTransform: "uppercase",
  },
  onboardingTitle: {
    color: "#fafafa",
    fontSize: 18,
    fontWeight: "700",
  },
  onboardingSubtitle: {
    color: "#d4d4d8",
    fontSize: 13,
    lineHeight: 18,
  },
  privacyOptions: {
    gap: 8,
  },
  privacyOption: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    backgroundColor: "rgba(0,0,0,0.25)",
    paddingHorizontal: 11,
    paddingVertical: 10,
  },
  privacyOptionSelected: {
    borderColor: "rgba(252,211,77,0.55)",
    backgroundColor: "rgba(251,191,36,0.14)",
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
    color: "#d4d4d8",
    fontSize: 12,
    lineHeight: 16,
  },
  confirmPrivacyButton: {
    alignSelf: "flex-start",
    marginTop: 2,
    borderRadius: 999,
    backgroundColor: "#fbbf24",
    paddingHorizontal: 14,
    paddingVertical: 9,
  },
  confirmPrivacyButtonDisabled: {
    opacity: 0.7,
  },
  confirmPrivacyButtonText: {
    color: "#09090b",
    fontSize: 13,
    fontWeight: "700",
  },
  heroCard: {
    borderRadius: 22,
    borderWidth: 1,
    borderColor: "rgba(252,211,77,0.32)",
    backgroundColor: "rgba(251,191,36,0.08)",
    paddingHorizontal: 18,
    paddingVertical: 18,
    alignItems: "center",
    gap: 8,
  },
  heroTitle: {
    color: "#fafafa",
    fontSize: 20,
    fontWeight: "700",
  },
  heroSubtitle: {
    color: "#d4d4d8",
    fontSize: 13,
    lineHeight: 18,
    textAlign: "center",
  },
  primaryButton: {
    marginTop: 2,
    borderRadius: 999,
    backgroundColor: "#fbbf24",
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  primaryButtonText: {
    color: "#09090b",
    fontSize: 13,
    fontWeight: "700",
  },
  inlineCtaButton: {
    alignSelf: "flex-start",
    borderRadius: 999,
    backgroundColor: "rgba(251,191,36,0.9)",
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  inlineCtaButtonText: {
    color: "#09090b",
    fontSize: 13,
    fontWeight: "700",
  },
  section: {
    gap: 10,
  },
  sectionDivider: {
    borderTopWidth: 1,
    borderTopColor: "rgba(255,255,255,0.1)",
    marginVertical: 2,
  },
  sectionLabel: {
    color: "#a1a1aa",
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 1.4,
    textTransform: "uppercase",
  },
  cardStack: {
    gap: 10,
  },
  entryCard: {
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    backgroundColor: "rgba(255,255,255,0.05)",
    padding: 13,
  },
  entryHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  entryOwner: {
    color: "#e4e4e7",
    fontSize: 12,
    fontWeight: "600",
  },
  entryOwnerButton: {
    color: "#e4e4e7",
  },
  entryDate: {
    color: "#a1a1aa",
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
    backgroundColor: "rgba(0,0,0,0.35)",
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  photoImage: {
    width: "100%",
    height: "100%",
  },
  photoText: {
    color: "#71717a",
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
    color: "#fafafa",
    fontSize: 15,
    fontWeight: "700",
  },
  entrySubtitle: {
    marginTop: 2,
    color: "#a1a1aa",
    fontSize: 12,
  },
  entryMetaRow: {
    marginTop: 2,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    flexWrap: "wrap",
  },
  ratingText: {
    color: "#fcd34d",
    fontSize: 13,
    fontWeight: "800",
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
  inlineLink: {
    color: "#a1a1aa",
    fontSize: 13,
    fontWeight: "600",
  },
  inlineLinkHighlight: {
    color: "#fde68a",
  },
  emptyCard: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    backgroundColor: "rgba(255,255,255,0.05)",
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 8,
  },
  emptyText: {
    color: "#d4d4d8",
    fontSize: 13,
    lineHeight: 18,
  },
  secondaryButton: {
    alignSelf: "flex-start",
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.14)",
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  secondaryButtonText: {
    color: "#e4e4e7",
    fontSize: 12,
    fontWeight: "700",
  },
});

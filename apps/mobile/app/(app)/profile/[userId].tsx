import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  View,
} from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import {
  PUBLIC_PROFILE_COPY,
  PUBLIC_PROFILE_ENTRY_LIMIT,
  QPR_LEVEL_LABELS,
  type ProfileFriendStatus,
  getFeedDisplayRatingLabel,
  getPublicProfileEyebrow,
  getPublicProfileSubtitle,
  getPublicProfileTaggedEmpty,
  getPublicProfileTaggedTitle,
  getPublicProfileUploadedEmpty,
  getPublicProfileUploadedTitle,
  shouldHideProducerInEntryTile,
} from "@cellarsnap/shared";
import { AppText } from "@/src/components/AppText";
import { AppTopBar } from "@/src/components/AppTopBar";
import { lightImpact } from "@/src/lib/haptics";
import {
  acceptMobileFriendRequest,
  deleteMobileFriendRequest,
  fetchMobilePublicProfileBundle,
  removeMobileFriend,
  sendMobileFriendRequest,
  updateMobileBlockedState,
  type MobilePublicProfileEntry,
  type MobilePublicProfileProfile,
} from "@/src/lib/api/publicProfile";
import {
  getPublicProfileInitial,
  getPublicProfileName,
} from "@/src/lib/publicProfiles";
import { useAuth } from "@/src/providers/AuthProvider";
import { colors } from "@/src/lib/theme";

type EntryTile = MobilePublicProfileEntry;
type PublicProfile = MobilePublicProfileProfile;
type RelationshipPayload = {
  friend_status?: ProfileFriendStatus;
  incoming_request_id?: string | null;
  outgoing_request_id?: string | null;
  friend_request_id?: string | null;
};

function readRouteParam(value: string | string[] | undefined) {
  if (Array.isArray(value)) return value[0] ?? null;
  return typeof value === "string" ? value : null;
}

function formatConsumedDate(raw: string) {
  const date = new Date(`${raw}T00:00:00`);
  return Number.isNaN(date.getTime())
    ? raw
    : date.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function getEntryProducerLine(entry: EntryTile) {
  const hideProducer = shouldHideProducerInEntryTile(entry.wine_name, entry.producer);
  const producerLabel = entry.producer
    ? hideProducer
      ? null
      : entry.producer
    : PUBLIC_PROFILE_COPY.unknownProducerLabel;
  if (!producerLabel && !entry.vintage) return null;
  return producerLabel && entry.vintage
    ? `${producerLabel} \u00B7 ${entry.vintage}`
    : producerLabel ?? entry.vintage ?? null;
}

function getEntryQprLabel(entry: EntryTile) {
  if (!entry.qpr_level) return null;
  return Object.prototype.hasOwnProperty.call(QPR_LEVEL_LABELS, entry.qpr_level)
    ? QPR_LEVEL_LABELS[entry.qpr_level as keyof typeof QPR_LEVEL_LABELS]
    : null;
}

export default function UserProfileScreen() {
  const { user } = useAuth();
  const params = useLocalSearchParams<{ userId?: string | string[] }>();
  const userId = readRouteParam(params.userId);

  const [profile, setProfile] = useState<PublicProfile | null>(null);
  const [entries, setEntries] = useState<EntryTile[]>([]);
  const [taggedEntries, setTaggedEntries] = useState<EntryTile[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [friendStatus, setFriendStatus] = useState<ProfileFriendStatus>("none");
  const [incomingRequestId, setIncomingRequestId] = useState<string | null>(null);
  const [outgoingRequestId, setOutgoingRequestId] = useState<string | null>(null);
  const [friendRequestId, setFriendRequestId] = useState<string | null>(null);
  const [confirmingUnfriend, setConfirmingUnfriend] = useState(false);
  const [friendActionLoading, setFriendActionLoading] = useState(false);
  const [friendActionError, setFriendActionError] = useState<string | null>(null);
  const [isBlocked, setIsBlocked] = useState(false);
  const [blockActionLoading, setBlockActionLoading] = useState(false);
  const [blockActionError, setBlockActionError] = useState<string | null>(null);
  const [blocksUnavailable, setBlocksUnavailable] = useState(false);
  const [showAllEntries, setShowAllEntries] = useState(false);
  const [showAllTaggedEntries, setShowAllTaggedEntries] = useState(false);

  const isOwnProfile = Boolean(user?.id && userId && user.id === userId);
  const fullName = useMemo(() => {
    if (!profile) return "";
    return [profile.first_name?.trim() || null, profile.last_name?.trim() || null]
      .filter((value): value is string => Boolean(value))
      .join(" ");
  }, [profile]);
  const displayedEntries = showAllEntries ? entries : entries.slice(0, PUBLIC_PROFILE_ENTRY_LIMIT);
  const displayedTaggedEntries = showAllTaggedEntries
    ? taggedEntries
    : taggedEntries.slice(0, PUBLIC_PROFILE_ENTRY_LIMIT);

  const applyRelationshipPayload = useCallback((payload: RelationshipPayload) => {
    if (!payload.friend_status) return false;
    setFriendStatus(payload.friend_status);
    setIncomingRequestId(payload.incoming_request_id ?? null);
    setOutgoingRequestId(payload.outgoing_request_id ?? null);
    setFriendRequestId(payload.friend_request_id ?? null);
    setConfirmingUnfriend(false);
    return true;
  }, []);

  const loadUserProfile = useCallback(
    async (refresh = false) => {
      if (!user?.id || !userId) {
        setErrorMessage(PUBLIC_PROFILE_COPY.profileNotFound);
        setLoading(false);
        setRefreshing(false);
        return;
      }

      if (refresh) setRefreshing(true);
      else setLoading(true);
      setErrorMessage(null);
      setFriendActionError(null);
      setBlockActionError(null);

      try {
        const result = await fetchMobilePublicProfileBundle(userId);
        if (!result.ok) {
          setErrorMessage(result.errorMessage);
          setProfile(null);
          setEntries([]);
          setTaggedEntries([]);
          return;
        }

        setProfile(result.payload.profile);
        setEntries(result.payload.entries);
        setTaggedEntries(result.payload.taggedEntries);
        setFriendStatus(result.payload.profile.friend_status ?? "none");
        setIncomingRequestId(result.payload.profile.incoming_request_id ?? null);
        setOutgoingRequestId(result.payload.profile.outgoing_request_id ?? null);
        setFriendRequestId(result.payload.profile.friend_request_id ?? null);
        setIsBlocked(result.payload.blocked);
        setBlocksUnavailable(result.payload.blocksUnavailable);
        setShowAllEntries(false);
        setShowAllTaggedEntries(false);
        setConfirmingUnfriend(false);
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [user?.id, userId]
  );

  useEffect(() => {
    if (!user?.id || !userId) return;
    if (userId === user.id) {
      router.replace("/(app)/profile");
      return;
    }
    void loadUserProfile();
  }, [loadUserProfile, user?.id, userId]);

  const sendFriendRequest = useCallback(async () => {
    if (!userId || friendActionLoading) return;
    setFriendActionLoading(true);
    setFriendActionError(null);
    try {
      const response = await sendMobileFriendRequest(userId);
      if (!response.ok) {
        setFriendActionError(response.errorMessage);
        return;
      }
      if (!applyRelationshipPayload(response.payload)) {
        setFriendActionError("Unexpected response while sending request.");
      }
    } finally {
      setFriendActionLoading(false);
    }
  }, [applyRelationshipPayload, friendActionLoading, userId]);

  const acceptRequest = useCallback(async () => {
    if (!incomingRequestId || friendActionLoading) return;
    setFriendActionLoading(true);
    setFriendActionError(null);
    try {
      const response = await acceptMobileFriendRequest(incomingRequestId);
      if (!response.ok) {
        setFriendActionError(response.errorMessage);
        return;
      }
      if (response.payload.success && response.payload.status === "accepted") {
        setFriendStatus("friends");
        setFriendRequestId(response.payload.request_id ?? incomingRequestId);
        setIncomingRequestId(null);
        setOutgoingRequestId(null);
        setConfirmingUnfriend(false);
        return;
      }
      setFriendActionError("Request was not accepted.");
    } finally {
      setFriendActionLoading(false);
    }
  }, [friendActionLoading, incomingRequestId]);

  const removeFriend = useCallback(async () => {
    if (!userId || friendActionLoading) return;
    setFriendActionLoading(true);
    setFriendActionError(null);
    try {
      if (friendRequestId) {
        const response = await deleteMobileFriendRequest(friendRequestId);
        if (!response.ok) {
          setFriendActionError(response.errorMessage);
          return;
        }
        setFriendStatus("none");
        setIncomingRequestId(null);
        setOutgoingRequestId(null);
        setFriendRequestId(null);
        setConfirmingUnfriend(false);
        return;
      }
      const response = await removeMobileFriend(userId);
      if (!response.ok) {
        setFriendActionError(response.errorMessage);
        return;
      }
      if (!applyRelationshipPayload(response.payload)) {
        setFriendActionError("Friend status did not update as expected.");
      }
    } finally {
      setFriendActionLoading(false);
    }
  }, [applyRelationshipPayload, friendActionLoading, friendRequestId, userId]);

  const cancelOutgoingRequest = useCallback(async () => {
    if (!outgoingRequestId || friendActionLoading) return;
    setFriendActionLoading(true);
    setFriendActionError(null);
    try {
      const response = await deleteMobileFriendRequest(outgoingRequestId);
      if (!response.ok) {
        setFriendActionError(response.errorMessage);
        return;
      }
      setFriendStatus("none");
      setIncomingRequestId(null);
      setOutgoingRequestId(null);
      setFriendRequestId(null);
      setConfirmingUnfriend(false);
    } finally {
      setFriendActionLoading(false);
    }
  }, [friendActionLoading, outgoingRequestId]);

  const toggleBlock = useCallback(async () => {
    if (!userId || blockActionLoading || blocksUnavailable) return;
    setBlockActionLoading(true);
    setBlockActionError(null);
    try {
      const response = await updateMobileBlockedState(userId, !isBlocked);
      if (!response.ok) {
        if (response.code === "BLOCKS_UNAVAILABLE") setBlocksUnavailable(true);
        setBlockActionError(response.errorMessage);
        return;
      }
      const nextBlocked = Boolean(response.payload.blocked);
      setIsBlocked(nextBlocked);
      if (nextBlocked) {
        setFriendStatus("none");
        setIncomingRequestId(null);
        setOutgoingRequestId(null);
        setFriendRequestId(null);
        setConfirmingUnfriend(false);
      } else {
        await loadUserProfile(true);
      }
    } finally {
      setBlockActionLoading(false);
    }
  }, [blockActionLoading, blocksUnavailable, isBlocked, loadUserProfile, userId]);

  const handleToggleBlock = useCallback(() => {
    if (isBlocked) {
      void toggleBlock();
      return;
    }
    Alert.alert("Block user?", "You will no longer see each other's posts or comments.", [
      { text: PUBLIC_PROFILE_COPY.cancelLabel, style: "cancel" },
      {
        text: PUBLIC_PROFILE_COPY.blockUserLabel,
        style: "destructive",
        onPress: () => void toggleBlock(),
      },
    ]);
  }, [isBlocked, toggleBlock]);

  const renderEntryCard = useCallback((entry: EntryTile, tagged: boolean) => {
    const producerLine = getEntryProducerLine(entry);
    const ratingLabel = getFeedDisplayRatingLabel(entry.rating);
    const qprLabel = getEntryQprLabel(entry);
    return (
      <Pressable
        key={entry.id}
        onPress={() => router.push(`/(app)/entries/${entry.id}`)}
        style={styles.entryCard}
      >
        <View style={styles.imageWrap}>
          {entry.label_image_url ? (
            <Image source={{ uri: entry.label_image_url }} style={styles.image} resizeMode="cover" />
          ) : (
            <AppText style={styles.imageFallback}>{PUBLIC_PROFILE_COPY.noPhotoLabel}</AppText>
          )}
        </View>
        <View style={styles.entryBody}>
          {tagged ? (
            <AppText style={styles.entryAuthor}>
              {PUBLIC_PROFILE_COPY.loggedByPrefix} {entry.author_name ?? "Unknown"}
            </AppText>
          ) : null}
          <AppText style={styles.entryName} numberOfLines={2}>
            {entry.wine_name ?? PUBLIC_PROFILE_COPY.untitledWineLabel}
          </AppText>
          {producerLine ? <AppText style={styles.entryMeta}>{producerLine}</AppText> : null}
          <View style={styles.footer}>
            <View style={styles.badges}>
              {ratingLabel ? <AppText style={styles.badge}>{ratingLabel}</AppText> : null}
              {qprLabel ? <AppText style={styles.badge}>{qprLabel}</AppText> : null}
            </View>
            <AppText style={styles.entryDate}>{formatConsumedDate(entry.consumed_at)}</AppText>
          </View>
        </View>
      </Pressable>
    );
  }, []);

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color={colors.grenache} />
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              lightImpact();
              void loadUserProfile(true);
            }}
          />
        }
      >
        <AppTopBar />
        <Pressable style={styles.backButton} onPress={() => router.back()}>
          <AppText style={styles.backButtonText}>{"<"} Back</AppText>
        </Pressable>

        {errorMessage || !profile ? (
          <View style={styles.errorCard}>
            <AppText style={styles.errorText}>
              {errorMessage ?? PUBLIC_PROFILE_COPY.profileNotFound}
            </AppText>
          </View>
        ) : (
          <>
            <View style={styles.card}>
              <AppText style={styles.eyebrow}>{getPublicProfileEyebrow(isOwnProfile)}</AppText>
              <View style={styles.headerRow}>
                <View style={styles.identity}>
                  <View style={styles.avatarWrap}>
                    {profile.avatar_url ? (
                      <Image source={{ uri: profile.avatar_url }} style={styles.avatar} resizeMode="cover" />
                    ) : (
                      <AppText style={styles.avatarFallback}>{getPublicProfileInitial(profile)}</AppText>
                    )}
                  </View>
                  <View style={styles.identityText}>
                    <AppText style={styles.username}>{getPublicProfileName(profile)}</AppText>
                    {fullName ? <AppText style={styles.fullName}>{fullName}</AppText> : null}
                    <AppText style={styles.subtitle}>{getPublicProfileSubtitle(isOwnProfile)}</AppText>
                  </View>
                </View>

                {!isOwnProfile ? (
                  <View style={styles.actions}>
                    {blocksUnavailable ? (
                      <AppText style={styles.inlineError}>{PUBLIC_PROFILE_COPY.blockingUnavailable}</AppText>
                    ) : isBlocked ? (
                      <View style={styles.rowWrap}>
                        <AppText style={[styles.badge, styles.badgeDanger]}>{PUBLIC_PROFILE_COPY.blockedLabel}</AppText>
                        <Pressable style={styles.secondaryButton} onPress={handleToggleBlock} disabled={blockActionLoading}>
                          <AppText style={styles.secondaryButtonText}>
                            {blockActionLoading ? PUBLIC_PROFILE_COPY.updatingLabel : PUBLIC_PROFILE_COPY.unblockLabel}
                          </AppText>
                        </Pressable>
                      </View>
                    ) : friendStatus === "friends" ? (
                      confirmingUnfriend ? (
                        <View style={styles.rowWrap}>
                          <AppText style={styles.hint}>{PUBLIC_PROFILE_COPY.removeFriendPrompt}</AppText>
                          <Pressable style={styles.primaryButton} onPress={() => void removeFriend()} disabled={friendActionLoading}>
                            <AppText style={styles.primaryButtonText}>{PUBLIC_PROFILE_COPY.removeFriendConfirmLabel}</AppText>
                          </Pressable>
                          <Pressable style={styles.secondaryButton} onPress={() => setConfirmingUnfriend(false)} disabled={friendActionLoading}>
                            <AppText style={styles.secondaryButtonText}>{PUBLIC_PROFILE_COPY.cancelLabel}</AppText>
                          </Pressable>
                        </View>
                      ) : (
                        <View style={styles.rowWrap}>
                          <AppText style={[styles.badge, styles.badgeSuccess]}>{PUBLIC_PROFILE_COPY.friendsLabel}</AppText>
                          <Pressable style={styles.secondaryButton} onPress={() => setConfirmingUnfriend(true)}>
                            <AppText style={styles.secondaryButtonText}>{PUBLIC_PROFILE_COPY.removeLabel}</AppText>
                          </Pressable>
                        </View>
                      )
                    ) : friendStatus === "request_sent" ? (
                      <View style={styles.rowWrap}>
                        <AppText style={styles.badge}>{PUBLIC_PROFILE_COPY.requestSentLabel}</AppText>
                        <Pressable style={styles.secondaryButton} onPress={() => void cancelOutgoingRequest()} disabled={friendActionLoading}>
                          <AppText style={styles.secondaryButtonText}>
                            {friendActionLoading ? PUBLIC_PROFILE_COPY.cancellingLabel : PUBLIC_PROFILE_COPY.cancelLabel}
                          </AppText>
                        </Pressable>
                      </View>
                    ) : friendStatus === "request_received" ? (
                      <Pressable style={styles.primaryButton} onPress={() => void acceptRequest()} disabled={friendActionLoading}>
                        <AppText style={styles.primaryButtonText}>
                          {friendActionLoading ? PUBLIC_PROFILE_COPY.acceptingLabel : PUBLIC_PROFILE_COPY.acceptFriendRequestLabel}
                        </AppText>
                      </Pressable>
                    ) : (
                      <Pressable style={styles.primaryButton} onPress={() => void sendFriendRequest()} disabled={friendActionLoading}>
                        <AppText style={styles.primaryButtonText}>
                          {friendActionLoading ? PUBLIC_PROFILE_COPY.sendingLabel : PUBLIC_PROFILE_COPY.addFriendLabel}
                        </AppText>
                      </Pressable>
                    )}
                    {!blocksUnavailable && !isBlocked ? (
                      <Pressable onPress={handleToggleBlock} disabled={blockActionLoading}>
                        <AppText style={styles.blockLink}>
                          {blockActionLoading ? PUBLIC_PROFILE_COPY.updatingLabel : PUBLIC_PROFILE_COPY.blockUserLabel}
                        </AppText>
                      </Pressable>
                    ) : null}
                  </View>
                ) : null}
              </View>

              {friendActionError ? <AppText style={styles.inlineError}>{friendActionError}</AppText> : null}
              {blockActionError ? <AppText style={styles.inlineError}>{blockActionError}</AppText> : null}
            </View>

            {!isOwnProfile && isBlocked ? (
              <View style={styles.warningCard}>
                <AppText style={styles.warningText}>{PUBLIC_PROFILE_COPY.blockedContentMessage}</AppText>
              </View>
            ) : (
              <>
                <View style={styles.section}>
                  <AppText style={styles.sectionTitle}>{getPublicProfileUploadedTitle(isOwnProfile)}</AppText>
                  {entries.length === 0 ? (
                    <View style={styles.emptyCard}>
                      <AppText style={styles.emptyText}>{getPublicProfileUploadedEmpty(isOwnProfile)}</AppText>
                    </View>
                  ) : (
                    displayedEntries.map((entry) => renderEntryCard(entry, false))
                  )}
                  {entries.length > PUBLIC_PROFILE_ENTRY_LIMIT ? (
                    <Pressable style={styles.toggleButton} onPress={() => setShowAllEntries((prev) => !prev)}>
                      <AppText style={styles.toggleButtonText}>
                        {showAllEntries ? PUBLIC_PROFILE_COPY.showFewerEntriesLabel : PUBLIC_PROFILE_COPY.seeAllEntriesLabel}
                      </AppText>
                    </Pressable>
                  ) : null}
                </View>

                <View style={styles.section}>
                  <AppText style={styles.sectionTitle}>{getPublicProfileTaggedTitle(isOwnProfile)}</AppText>
                  {taggedEntries.length === 0 ? (
                    <View style={styles.emptyCard}>
                      <AppText style={styles.emptyText}>{getPublicProfileTaggedEmpty(isOwnProfile)}</AppText>
                    </View>
                  ) : (
                    displayedTaggedEntries.map((entry) => renderEntryCard(entry, true))
                  )}
                  {taggedEntries.length > PUBLIC_PROFILE_ENTRY_LIMIT ? (
                    <Pressable style={styles.toggleButton} onPress={() => setShowAllTaggedEntries((prev) => !prev)}>
                      <AppText style={styles.toggleButtonText}>
                        {showAllTaggedEntries ? PUBLIC_PROFILE_COPY.showFewerTaggedEntriesLabel : PUBLIC_PROFILE_COPY.seeAllTaggedEntriesLabel}
                      </AppText>
                    </Pressable>
                  ) : null}
                </View>
              </>
            )}
          </>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.screenBg },
  centered: { flex: 1, backgroundColor: colors.screenBg, alignItems: "center", justifyContent: "center" },
  content: { paddingHorizontal: 18, paddingTop: 16, paddingBottom: 28, gap: 12 },
  backButton: { alignSelf: "flex-start", borderRadius: 999, borderWidth: 1, borderColor: colors.borderStrong, backgroundColor: colors.surfacePrimary, paddingHorizontal: 12, paddingVertical: 6 },
  backButtonText: { color: colors.textSecondary, fontSize: 12, fontWeight: "600" },
  errorCard: { borderRadius: 14, borderWidth: 1, borderColor: "rgba(251,113,133,0.4)", backgroundColor: "rgba(251,113,133,0.12)", paddingHorizontal: 12, paddingVertical: 10 },
  errorText: { color: colors.error, fontSize: 13 },
  card: { borderRadius: 16, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surfacePrimary, padding: 14, gap: 10 },
  eyebrow: { color: colors.textSecondary, fontSize: 11, fontWeight: "700", letterSpacing: 1.8, textTransform: "uppercase" },
  headerRow: { gap: 12 },
  identity: { flexDirection: "row", gap: 12 },
  avatarWrap: { width: 56, height: 56, borderRadius: 999, overflow: "hidden", borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surfacePrimary, alignItems: "center", justifyContent: "center" },
  avatar: { width: "100%", height: "100%" },
  avatarFallback: { color: colors.textSecondary, fontSize: 18, fontWeight: "700" },
  identityText: { flex: 1, gap: 3 },
  username: { color: colors.textPrimary, fontSize: 19, fontWeight: "700" },
  fullName: { color: colors.textSecondary, fontSize: 13 },
  subtitle: { color: colors.textSecondary, fontSize: 12, lineHeight: 18 },
  actions: { gap: 8 },
  rowWrap: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 8 },
  hint: { color: colors.textSecondary, fontSize: 12 },
  primaryButton: { alignSelf: "flex-start", borderRadius: 999, backgroundColor: colors.grenache, paddingHorizontal: 14, paddingVertical: 9 },
  primaryButtonText: { color: colors.surfacePrimary, fontSize: 12, fontWeight: "700" },
  secondaryButton: { alignSelf: "flex-start", borderRadius: 999, borderWidth: 1, borderColor: colors.borderStrong, backgroundColor: colors.surfacePrimary, paddingHorizontal: 12, paddingVertical: 8 },
  secondaryButtonText: { color: colors.textPrimary, fontSize: 12, fontWeight: "700" },
  badge: { borderRadius: 999, overflow: "hidden", borderWidth: 1, borderColor: colors.borderStrong, backgroundColor: colors.surfaceRaised, color: colors.textPrimary, fontSize: 10, fontWeight: "700", paddingHorizontal: 8, paddingVertical: 4 },
  badgeDanger: { borderColor: "rgba(251,113,133,0.4)", backgroundColor: "rgba(251,113,133,0.12)", color: colors.error },
  badgeSuccess: { borderColor: "rgba(52,211,153,0.35)", backgroundColor: "rgba(52,211,153,0.12)", color: "#b6f0d2" },
  blockLink: { color: colors.textSecondary, fontSize: 11, fontWeight: "700", letterSpacing: 1.1, textTransform: "uppercase" },
  inlineError: { color: colors.error, fontSize: 12 },
  warningCard: { borderRadius: 14, borderWidth: 1, borderColor: "rgba(251,113,133,0.3)", backgroundColor: "rgba(251,113,133,0.12)", paddingHorizontal: 12, paddingVertical: 10 },
  warningText: { color: "#ffd7df", fontSize: 12, lineHeight: 18 },
  section: { gap: 8 },
  sectionTitle: { color: colors.textPrimary, fontSize: 16, fontWeight: "700" },
  emptyCard: { borderRadius: 12, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surfacePrimary, paddingHorizontal: 12, paddingVertical: 10 },
  emptyText: { color: colors.textSecondary, fontSize: 12 },
  entryCard: { flexDirection: "row", gap: 10, borderRadius: 14, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surfacePrimary, padding: 10 },
  imageWrap: { width: 92, height: 92, borderRadius: 12, borderWidth: 1, borderColor: colors.border, overflow: "hidden", backgroundColor: colors.surfaceRaised, alignItems: "center", justifyContent: "center" },
  image: { width: "100%", height: "100%" },
  imageFallback: { color: colors.textSecondary, fontSize: 11 },
  entryBody: { flex: 1, gap: 4 },
  entryAuthor: { color: colors.textSecondary, fontSize: 11 },
  entryName: { color: colors.textPrimary, fontSize: 14, fontWeight: "700" },
  entryMeta: { color: colors.textSecondary, fontSize: 12 },
  footer: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8, marginTop: "auto" },
  badges: { flexDirection: "row", flexWrap: "wrap", gap: 6, flex: 1 },
  entryDate: { color: colors.textSecondary, fontSize: 11 },
  toggleButton: { alignSelf: "center", borderRadius: 999, borderWidth: 1, borderColor: colors.borderStrong, backgroundColor: colors.surfacePrimary, paddingHorizontal: 14, paddingVertical: 8 },
  toggleButtonText: { color: colors.textPrimary, fontSize: 12, fontWeight: "700" },
});


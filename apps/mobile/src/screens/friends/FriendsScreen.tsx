import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from "react-native";
import { router } from "expo-router";
import { AppTopBar } from "@/src/components/AppTopBar";
import { AppText } from "@/src/components/AppText";
import { DoneTextInput } from "@/src/components/DoneTextInput";
import {
  acceptMobileFriendRequest,
  deleteMobileFriendRequest,
  declineMobileFriendRequest,
  fetchMobileFriendsBundle,
  searchMobileFriends,
  sendMobileFriendRequest,
  type MobileFriend,
  type MobileFriendSearchUser,
  type MobileFriendSuggestion,
  type MobileIncomingFriendRequest,
  type MobileOutgoingFriendRequest,
} from "@/src/lib/api/friends";
import { colors } from "@/src/lib/theme";
import { fonts } from "@/src/lib/typography";

function displayName(value: { display_name: string | null; email: string | null }) {
  return value.display_name?.trim() || value.email?.trim() || "Unknown";
}

function friendSearchLabel(user: MobileFriendSearchUser) {
  return user.display_name?.trim() || user.username?.trim() || "Unknown";
}

function friendStatusLabel(status?: MobileFriendSearchUser["friend_status"]) {
  if (status === "friends") {
    return "Already friends";
  }
  if (status === "request_sent") {
    return "Request sent";
  }
  if (status === "request_received") {
    return "Requested you";
  }
  return null;
}

export default function FriendsScreen() {
  const [friends, setFriends] = useState<MobileFriend[]>([]);
  const [incomingRequests, setIncomingRequests] = useState<MobileIncomingFriendRequest[]>([]);
  const [outgoingRequests, setOutgoingRequests] = useState<MobileOutgoingFriendRequest[]>([]);
  const [suggestions, setSuggestions] = useState<MobileFriendSuggestion[]>([]);
  const [friendSearch, setFriendSearch] = useState("");
  const [searchResults, setSearchResults] = useState<MobileFriendSearchUser[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [friendError, setFriendError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [isSignedOut, setIsSignedOut] = useState(false);
  const [isMutating, setIsMutating] = useState(false);
  const [confirmingCancel, setConfirmingCancel] = useState<string | null>(null);
  const [confirmingRemove, setConfirmingRemove] = useState<string | null>(null);
  const searchSequenceRef = useRef(0);

  const loadPageData = useCallback(async () => {
    setLoading(true);
    setFriendError(null);
    setIsSignedOut(false);

    const result = await fetchMobileFriendsBundle();
    if (!result.ok) {
      setFriends([]);
      setIncomingRequests([]);
      setOutgoingRequests([]);
      setSuggestions([]);
      setFriendError(result.errorMessage);
      setIsSignedOut(result.status === 401);
      setLoading(false);
      return;
    }

    setFriends(result.payload.friends);
    setIncomingRequests(result.payload.incoming);
    setOutgoingRequests(result.payload.outgoing);
    setSuggestions(result.payload.suggestions);
    setLoading(false);
  }, []);

  useEffect(() => {
    void loadPageData();
  }, [loadPageData]);

  const runSearch = useCallback(async (query: string) => {
    const trimmed = query.trim();
    const sequence = ++searchSequenceRef.current;

    if (!trimmed) {
      setSearchResults([]);
      setSearchError(null);
      setSearchLoading(false);
      return;
    }

    setSearchLoading(true);
    setSearchError(null);

    const result = await searchMobileFriends(trimmed);
    if (sequence !== searchSequenceRef.current) {
      return;
    }

    if (!result.ok) {
      setSearchResults([]);
      setSearchError("Unable to search right now.");
      setSearchLoading(false);
      return;
    }

    setSearchResults(result.payload.users ?? []);
    setSearchLoading(false);
  }, []);

  useEffect(() => {
    const timeoutId = setTimeout(() => {
      void runSearch(friendSearch);
    }, 220);

    return () => {
      clearTimeout(timeoutId);
    };
  }, [friendSearch, runSearch]);

  const openProfile = useCallback((userId: string) => {
    router.push({
      pathname: "/(app)/profile/[userId]",
      params: { userId },
    });
  }, []);

  const refreshAll = useCallback(async () => {
    await loadPageData();
    if (friendSearch.trim()) {
      void runSearch(friendSearch);
    }
  }, [friendSearch, loadPageData, runSearch]);

  const withMutation = useCallback(async (task: () => Promise<void>) => {
    setIsMutating(true);
    setFriendError(null);
    try {
      await task();
    } finally {
      setIsMutating(false);
    }
  }, []);

  const handleSendRequest = useCallback(
    async (userId: string) => {
      await withMutation(async () => {
        const result = await sendMobileFriendRequest(userId);
        if (!result.ok) {
          setFriendError(result.errorMessage);
          return;
        }

        setFriendSearch("");
        setSearchResults([]);
        await loadPageData();
      });
    },
    [loadPageData, withMutation]
  );

  const handleAcceptRequest = useCallback(
    async (requestId: string) => {
      await withMutation(async () => {
        const result = await acceptMobileFriendRequest(requestId);
        if (!result.ok) {
          setFriendError(result.errorMessage);
          return;
        }

        await refreshAll();
      });
    },
    [refreshAll, withMutation]
  );

  const handleDeclineRequest = useCallback(
    async (requestId: string) => {
      await withMutation(async () => {
        const result = await declineMobileFriendRequest(requestId);
        if (!result.ok) {
          setFriendError(result.errorMessage);
          return;
        }

        await refreshAll();
      });
    },
    [refreshAll, withMutation]
  );

  const handleDeleteRequest = useCallback(
    async (requestId: string) => {
      await withMutation(async () => {
        const result = await deleteMobileFriendRequest(requestId);
        if (!result.ok) {
          setFriendError(result.errorMessage);
          return;
        }

        setConfirmingCancel(null);
        setConfirmingRemove(null);
        await refreshAll();
      });
    },
    [refreshAll, withMutation]
  );

  if (loading) {
    return (
      <View style={styles.screen}>
        <AppTopBar />
        <View style={styles.loadingWrap}>
          <View style={styles.loadingCard}>
            <ActivityIndicator color={colors.grenache} />
            <AppText style={styles.loadingText}>Loading friends...</AppText>
          </View>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
      >
        <AppTopBar />

        <View style={styles.header}>
          <AppText style={styles.eyebrow}>Friends</AppText>
          <AppText style={styles.title}>Keep your cellar circle close.</AppText>
          <AppText style={styles.subtitle}>
            Review requests, add friends, and see who you&apos;re connected with.
          </AppText>
        </View>

        {friendError ? (
          <View style={styles.errorCard}>
            <AppText style={styles.errorText}>{friendError}</AppText>
            <View style={styles.actionRow}>
              {isSignedOut ? (
                <Pressable
                  style={styles.secondaryButton}
                  onPress={() => router.push("/(auth)/sign-in")}
                >
                  <AppText style={styles.secondaryButtonText}>Sign in</AppText>
                </Pressable>
              ) : (
                <Pressable style={styles.secondaryButton} onPress={() => void loadPageData()}>
                  <AppText style={styles.secondaryButtonText}>Try again</AppText>
                </Pressable>
              )}
            </View>
          </View>
        ) : null}

        <View style={styles.sectionCard}>
          <AppText style={styles.sectionTitle}>Your friends</AppText>
          <AppText style={styles.sectionSubtitle}>People you&apos;re connected with.</AppText>

          {friends.length === 0 ? (
            <AppText style={styles.emptyText}>No friends yet. Search to add someone.</AppText>
          ) : (
            <View style={styles.list}>
              {friends.map((friend) => (
                <View key={friend.id} style={styles.row}>
                  <Pressable
                    style={styles.rowMain}
                    onPress={() => openProfile(friend.id)}
                    accessibilityRole="button"
                    accessibilityLabel={`View ${displayName(friend)} profile`}
                  >
                    <AppText style={styles.rowName}>{displayName(friend)}</AppText>
                    {friend.tasting_count > 0 ? (
                      <AppText style={styles.rowHint}>
                        {friend.tasting_count} shared tasting
                        {friend.tasting_count === 1 ? "" : "s"}
                      </AppText>
                    ) : null}
                  </Pressable>

                  {friend.request_id ? (
                    confirmingRemove === friend.request_id ? (
                      <View style={styles.rowActions}>
                        <AppText style={styles.inlinePrompt}>Remove?</AppText>
                        <Pressable
                          style={styles.dangerButton}
                          disabled={isMutating}
                          onPress={() => void handleDeleteRequest(friend.request_id ?? "")}
                        >
                          <AppText style={styles.dangerButtonText}>Yes</AppText>
                        </Pressable>
                        <Pressable
                          style={styles.secondaryButton}
                          disabled={isMutating}
                          onPress={() => setConfirmingRemove(null)}
                        >
                          <AppText style={styles.secondaryButtonText}>No</AppText>
                        </Pressable>
                      </View>
                    ) : (
                      <Pressable
                        style={styles.secondaryButton}
                        disabled={isMutating}
                        onPress={() => setConfirmingRemove(friend.request_id)}
                      >
                        <AppText style={styles.secondaryButtonText}>Remove</AppText>
                      </Pressable>
                    )
                  ) : null}
                </View>
              ))}
            </View>
          )}

          {outgoingRequests.length > 0 ? (
            <View style={styles.sectionBlock}>
              <AppText style={styles.subsectionTitle}>Pending invites</AppText>
              <View style={styles.list}>
                {outgoingRequests.map((request) => (
                  <View key={request.id} style={styles.row}>
                    <Pressable
                      style={styles.rowMain}
                      onPress={() => openProfile(request.recipient.id)}
                      accessibilityRole="button"
                      accessibilityLabel={`View ${displayName(request.recipient)} profile`}
                    >
                      <AppText style={styles.rowName}>{displayName(request.recipient)}</AppText>
                    </Pressable>

                    {confirmingCancel === request.id ? (
                      <View style={styles.rowActions}>
                        <AppText style={styles.inlinePrompt}>Cancel?</AppText>
                        <Pressable
                          style={styles.dangerButton}
                          disabled={isMutating}
                          onPress={() => void handleDeleteRequest(request.id)}
                        >
                          <AppText style={styles.dangerButtonText}>Yes</AppText>
                        </Pressable>
                        <Pressable
                          style={styles.secondaryButton}
                          disabled={isMutating}
                          onPress={() => setConfirmingCancel(null)}
                        >
                          <AppText style={styles.secondaryButtonText}>No</AppText>
                        </Pressable>
                      </View>
                    ) : (
                      <Pressable
                        style={styles.secondaryButton}
                        disabled={isMutating}
                        onPress={() => setConfirmingCancel(request.id)}
                      >
                        <AppText style={styles.secondaryButtonText}>Cancel</AppText>
                      </Pressable>
                    )}
                  </View>
                ))}
              </View>
            </View>
          ) : null}
        </View>

        <View style={styles.sectionCard}>
          <View style={styles.sectionHeaderRow}>
            <AppText style={styles.sectionTitle}>Incoming requests</AppText>
            {incomingRequests.length > 0 ? (
              <View style={styles.countPill}>
                <AppText style={styles.countPillText}>
                  {incomingRequests.length > 99 ? "99+" : incomingRequests.length}
                </AppText>
              </View>
            ) : null}
          </View>
          <AppText style={styles.sectionSubtitle}>Accept or decline new friend requests.</AppText>

          {incomingRequests.length === 0 ? (
            <AppText style={styles.emptyText}>No new requests right now.</AppText>
          ) : (
            <View style={styles.list}>
              {incomingRequests.map((request) => (
                <View key={request.id} style={styles.requestCard}>
                  <Pressable
                    onPress={() => openProfile(request.requester.id)}
                    accessibilityRole="button"
                    accessibilityLabel={`View ${displayName(request.requester)} profile`}
                  >
                    <AppText style={styles.rowName}>{displayName(request.requester)}</AppText>
                  </Pressable>
                  <View style={styles.actionRow}>
                    <Pressable
                      style={styles.primaryButton}
                      disabled={isMutating}
                      onPress={() => void handleAcceptRequest(request.id)}
                    >
                      <AppText style={styles.primaryButtonText}>Accept</AppText>
                    </Pressable>
                    <Pressable
                      style={styles.dangerButton}
                      disabled={isMutating}
                      onPress={() => void handleDeclineRequest(request.id)}
                    >
                      <AppText style={styles.dangerButtonText}>Decline</AppText>
                    </Pressable>
                  </View>
                </View>
              ))}
            </View>
          )}
        </View>

        <View style={styles.sectionCard}>
          <AppText style={styles.sectionTitle}>Find friends</AppText>
          <AppText style={styles.sectionSubtitle}>
            Search by username or name. Results show usernames only.
          </AppText>

          <DoneTextInput
            value={friendSearch}
            onChangeText={setFriendSearch}
            placeholder="Search by username or name"
            placeholderTextColor={colors.textTertiary}
            autoCapitalize="none"
            autoCorrect={false}
            style={styles.searchInput}
          />

          {searchError ? <AppText style={styles.errorText}>{searchError}</AppText> : null}
          {searchLoading ? <AppText style={styles.hintText}>Searching...</AppText> : null}

          {searchResults.length > 0 ? (
            <View style={styles.list}>
              {searchResults.slice(0, 5).map((user) => {
                const statusLabel = friendStatusLabel(user.friend_status);
                const isFriend = user.friend_status === "friends";
                const isOutgoing = user.friend_status === "request_sent";
                const isIncoming = user.friend_status === "request_received";

                return (
                  <View key={user.id} style={styles.searchRow}>
                    <Pressable
                      style={styles.rowMain}
                      onPress={() => openProfile(user.id)}
                      accessibilityRole="button"
                      accessibilityLabel={`View ${friendSearchLabel(user)} profile`}
                    >
                      <AppText style={styles.rowName}>{friendSearchLabel(user)}</AppText>
                      {statusLabel ? <AppText style={styles.rowStatus}>{statusLabel}</AppText> : null}
                    </Pressable>
                    <Pressable
                      style={styles.secondaryButton}
                      disabled={isFriend || isOutgoing || isIncoming || isMutating}
                      onPress={() => void handleSendRequest(user.id)}
                    >
                      <AppText style={styles.secondaryButtonText}>
                        {isFriend ? "Friends" : isOutgoing ? "Pending" : "Add"}
                      </AppText>
                    </Pressable>
                  </View>
                );
              })}
            </View>
          ) : friendSearch.trim() && !searchLoading && !searchError ? (
            <AppText style={styles.emptyText}>No matches.</AppText>
          ) : null}
        </View>

        <View style={styles.sectionCard}>
          <AppText style={styles.sectionTitle}>People you may know</AppText>
          <AppText style={styles.sectionSubtitle}>
            Suggested based on mutual friends.
          </AppText>

          {suggestions.length === 0 ? (
            <AppText style={styles.emptyText}>
              No suggestions right now. Add more friends to see recommendations.
            </AppText>
          ) : (
            <View style={styles.list}>
              {suggestions.map((person) => {
                const isFriend = friends.some((friend) => friend.id === person.id);
                const isOutgoing = outgoingRequests.some((request) => request.recipient.id === person.id);
                return (
                  <View key={person.id} style={styles.row}>
                    <Pressable
                      style={styles.rowMain}
                      onPress={() => openProfile(person.id)}
                      accessibilityRole="button"
                      accessibilityLabel={`View ${displayName(person)} profile`}
                    >
                      <AppText style={styles.rowName}>{displayName(person)}</AppText>
                      <AppText style={styles.rowStatus}>
                        {person.mutual_count === 1
                          ? "1 mutual friend"
                          : `${person.mutual_count} mutual friends`}
                      </AppText>
                    </Pressable>
                    <Pressable
                      style={styles.secondaryButton}
                      disabled={isFriend || isOutgoing || isMutating}
                      onPress={() => void handleSendRequest(person.id)}
                    >
                      <AppText style={styles.secondaryButtonText}>
                        {isFriend ? "Friends" : isOutgoing ? "Pending" : "Add"}
                      </AppText>
                    </Pressable>
                  </View>
                );
              })}
            </View>
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
    gap: 14,
  },
  loadingWrap: {
    flex: 1,
    paddingHorizontal: 18,
    paddingTop: 14,
  },
  loadingCard: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfacePrimary,
    paddingVertical: 18,
    paddingHorizontal: 16,
    alignItems: "center",
    gap: 10,
  },
  loadingText: {
    color: colors.textSecondary,
    fontSize: 13,
  },
  header: {
    gap: 6,
    marginBottom: 4,
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
    fontSize: 24,
    lineHeight: 30,
  },
  subtitle: {
    color: colors.textSecondary,
    fontSize: 13,
    lineHeight: 18,
  },
  sectionCard: {
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfacePrimary,
    padding: 14,
    gap: 10,
  },
  sectionHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  sectionTitle: {
    color: colors.textPrimary,
    fontSize: 15,
    fontWeight: "700",
  },
  subsectionTitle: {
    color: colors.textSecondary,
    fontSize: 12,
    letterSpacing: 1,
    textTransform: "uppercase",
    fontWeight: "700",
  },
  sectionSubtitle: {
    color: colors.textSecondary,
    fontSize: 12,
    lineHeight: 17,
  },
  sectionBlock: {
    gap: 8,
    paddingTop: 6,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  list: {
    gap: 8,
  },
  row: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceRaised,
    paddingHorizontal: 12,
    paddingVertical: 12,
    gap: 10,
  },
  requestCard: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceRaised,
    paddingHorizontal: 12,
    paddingVertical: 12,
    gap: 10,
  },
  searchRow: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceRaised,
    paddingHorizontal: 12,
    paddingVertical: 12,
    gap: 10,
  },
  rowMain: {
    gap: 4,
  },
  rowName: {
    color: colors.textPrimary,
    fontSize: 14,
    fontWeight: "600",
  },
  rowHint: {
    color: colors.textSecondary,
    fontSize: 11,
  },
  rowStatus: {
    color: colors.accentSecondary,
    fontSize: 11,
    fontWeight: "600",
  },
  rowActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    flexWrap: "wrap",
  },
  actionRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    flexWrap: "wrap",
  },
  inlinePrompt: {
    color: colors.textSecondary,
    fontSize: 11,
  },
  primaryButton: {
    borderRadius: 999,
    backgroundColor: colors.accentPrimary,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  primaryButtonText: {
    color: colors.textOnAccent,
    fontSize: 12,
    fontWeight: "700",
  },
  secondaryButton: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  secondaryButtonText: {
    color: colors.textSecondary,
    fontSize: 12,
    fontWeight: "700",
  },
  dangerButton: {
    borderRadius: 999,
    backgroundColor: "rgba(192,57,43,0.18)",
    borderWidth: 1,
    borderColor: "rgba(192,57,43,0.4)",
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  dangerButtonText: {
    color: colors.error,
    fontSize: 12,
    fontWeight: "700",
  },
  searchInput: {
    minHeight: 46,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.inputBg,
    color: colors.textPrimary,
    fontSize: 13,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  countPill: {
    minWidth: 20,
    height: 20,
    borderRadius: 999,
    backgroundColor: colors.accentPrimary,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 6,
  },
  countPillText: {
    color: colors.textOnAccent,
    fontSize: 10,
    fontWeight: "800",
  },
  emptyText: {
    color: colors.textSecondary,
    fontSize: 13,
    lineHeight: 18,
  },
  hintText: {
    color: colors.textSecondary,
    fontSize: 12,
  },
  errorCard: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(192,57,43,0.28)",
    backgroundColor: "rgba(192,57,43,0.12)",
    padding: 14,
    gap: 10,
  },
  errorText: {
    color: colors.error,
    fontSize: 13,
    lineHeight: 18,
  },
});

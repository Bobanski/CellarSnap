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
import { AppText } from "@/src/components/AppText";
import { AppTopBar } from "@/src/components/AppTopBar";
import { supabase } from "@/src/lib/supabase";
import { useAuth } from "@/src/providers/AuthProvider";

type PublicProfile = {
  id: string;
  display_name: string | null;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  avatar_path: string | null;
  avatar_url: string | null;
};

type EntryTile = {
  id: string;
  wine_name: string | null;
  consumed_at: string;
  label_image_path: string | null;
  label_image_url: string | null;
};

function readRouteParam(value: string | string[] | undefined) {
  if (Array.isArray(value)) {
    return value[0] ?? null;
  }
  return typeof value === "string" ? value : null;
}

function formatConsumedDate(raw: string) {
  const date = new Date(`${raw}T00:00:00`);
  if (Number.isNaN(date.getTime())) {
    return raw;
  }
  return date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function isKnownMissingProfileColumn(message: string) {
  return (
    message.includes("first_name") ||
    message.includes("last_name") ||
    message.includes("avatar_path") ||
    message.includes("column")
  );
}

function isMissingBlocksTableError(message: string) {
  const lower = message.toLowerCase();
  return (
    lower.includes("user_blocks") ||
    lower.includes("relation") ||
    lower.includes("does not exist") ||
    lower.includes("column")
  );
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

export default function UserProfileScreen() {
  const { user } = useAuth();
  const params = useLocalSearchParams<{ userId?: string | string[] }>();
  const userId = readRouteParam(params.userId);

  const [profile, setProfile] = useState<PublicProfile | null>(null);
  const [entries, setEntries] = useState<EntryTile[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isBlocked, setIsBlocked] = useState(false);
  const [blockActionLoading, setBlockActionLoading] = useState(false);
  const [blockActionError, setBlockActionError] = useState<string | null>(null);
  const [blocksUnavailable, setBlocksUnavailable] = useState(false);

  const fullName = useMemo(() => {
    if (!profile) {
      return "";
    }
    return [profile.first_name?.trim() || null, profile.last_name?.trim() || null]
      .filter((value): value is string => Boolean(value))
      .join(" ");
  }, [profile]);

  const loadUserProfile = useCallback(
    async (refresh = false) => {
      if (!user?.id || !userId) {
        setLoading(false);
        setRefreshing(false);
        setErrorMessage("Profile not found.");
        return;
      }

      if (refresh) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }
      setErrorMessage(null);
      setBlockActionError(null);

      try {
        const profileAttempt = await supabase
          .from("profiles")
          .select("id, display_name, first_name, last_name, email, avatar_path")
          .eq("id", userId)
          .maybeSingle();

        let profileRow: {
          id: string;
          display_name: string | null;
          first_name?: string | null;
          last_name?: string | null;
          email: string | null;
          avatar_path?: string | null;
        } | null = profileAttempt.data;

        if (profileAttempt.error) {
          if (!isKnownMissingProfileColumn(profileAttempt.error.message)) {
            throw new Error(profileAttempt.error.message);
          }
          const fallbackAttempt = await supabase
            .from("profiles")
            .select("id, display_name, email")
            .eq("id", userId)
            .maybeSingle();
          if (fallbackAttempt.error) {
            throw new Error(fallbackAttempt.error.message);
          }
          profileRow = fallbackAttempt.data
            ? {
                ...fallbackAttempt.data,
                first_name: null,
                last_name: null,
                avatar_path: null,
              }
            : null;
        }

        if (!profileRow) {
          setErrorMessage("Profile not found.");
          setProfile(null);
          setEntries([]);
          setIsBlocked(false);
          return;
        }

        const entryResponse = await supabase
          .from("wine_entries")
          .select("id, wine_name, consumed_at, label_image_path, created_at")
          .eq("user_id", userId)
          .order("consumed_at", { ascending: false })
          .order("created_at", { ascending: false })
          .limit(30);

        if (entryResponse.error) {
          throw new Error(entryResponse.error.message);
        }

        const entryRows = (entryResponse.data ?? []) as Array<{
          id: string;
          wine_name: string | null;
          consumed_at: string;
          label_image_path: string | null;
        }>;
        const entryIds = entryRows.map((row) => row.id);

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
        (labelResponse.data ?? []).forEach((row) => {
          if (!labelMap.has(row.entry_id)) {
            labelMap.set(row.entry_id, row.path);
          }
        });

        const paths = [
          profileRow.avatar_path ?? null,
          ...entryRows.map((row) => labelMap.get(row.id) ?? row.label_image_path ?? null),
        ].filter((path): path is string => Boolean(path));
        const signedUrlMap = await createSignedUrlMap(paths);
        const avatarUrl = profileRow.avatar_path
          ? signedUrlMap.get(profileRow.avatar_path) ?? null
          : null;

        const nextEntries: EntryTile[] = entryRows.map((row) => {
          const path = labelMap.get(row.id) ?? row.label_image_path ?? null;
          return {
            id: row.id,
            wine_name: row.wine_name,
            consumed_at: row.consumed_at,
            label_image_path: path,
            label_image_url: path ? signedUrlMap.get(path) ?? null : null,
          };
        });

        setProfile({
          id: profileRow.id,
          display_name: profileRow.display_name ?? null,
          first_name: profileRow.first_name ?? null,
          last_name: profileRow.last_name ?? null,
          email: profileRow.email ?? null,
          avatar_path: profileRow.avatar_path ?? null,
          avatar_url: avatarUrl,
        });
        setEntries(nextEntries);

        const blockState = await supabase
          .from("user_blocks")
          .select("blocker_id")
          .eq("blocker_id", user.id)
          .eq("blocked_id", userId)
          .maybeSingle();

        if (blockState.error) {
          if (isMissingBlocksTableError(blockState.error.message)) {
            setBlocksUnavailable(true);
            setIsBlocked(false);
          } else {
            setBlocksUnavailable(false);
            setBlockActionError("Unable to load block status.");
            setIsBlocked(false);
          }
        } else {
          setBlocksUnavailable(false);
          setIsBlocked(Boolean(blockState.data));
        }
      } catch (error) {
        setErrorMessage(error instanceof Error ? error.message : "Unable to load profile.");
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [user?.id, userId]
  );

  useEffect(() => {
    if (!user?.id || !userId) {
      return;
    }
    if (userId === user.id) {
      router.replace("/(app)/profile");
      return;
    }
    void loadUserProfile();
  }, [loadUserProfile, user?.id, userId]);

  const toggleBlock = useCallback(async () => {
    if (!user?.id || !userId || blockActionLoading || blocksUnavailable) {
      return;
    }

    setBlockActionLoading(true);
    setBlockActionError(null);

    try {
      if (isBlocked) {
        const { error } = await supabase
          .from("user_blocks")
          .delete()
          .eq("blocker_id", user.id)
          .eq("blocked_id", userId);
        if (error) {
          if (isMissingBlocksTableError(error.message)) {
            setBlocksUnavailable(true);
            setBlockActionError("Blocking is temporarily unavailable.");
            return;
          }
          throw new Error(error.message);
        }

        setIsBlocked(false);
        await loadUserProfile(true);
        return;
      }

      const { error: blockError } = await supabase.from("user_blocks").insert({
        blocker_id: user.id,
        blocked_id: userId,
      });

      if (blockError && blockError.code !== "23505") {
        if (isMissingBlocksTableError(blockError.message)) {
          setBlocksUnavailable(true);
          setBlockActionError("Blocking is temporarily unavailable.");
          return;
        }
        throw new Error(blockError.message);
      }

      const nowIso = new Date().toISOString();
      await Promise.all([
        supabase
          .from("friend_requests")
          .delete()
          .eq("requester_id", user.id)
          .eq("recipient_id", userId),
        supabase
          .from("friend_requests")
          .delete()
          .eq("requester_id", userId)
          .eq("recipient_id", user.id),
        supabase
          .from("wine_notifications")
          .update({ seen_at: nowIso })
          .eq("user_id", user.id)
          .eq("actor_id", userId)
          .is("seen_at", null),
      ]);

      setIsBlocked(true);
      setEntries([]);
    } catch (error) {
      setBlockActionError(
        error instanceof Error ? error.message : "Unable to update block state."
      );
    } finally {
      setBlockActionLoading(false);
    }
  }, [blockActionLoading, blocksUnavailable, isBlocked, loadUserProfile, user?.id, userId]);

  const handleToggleBlock = useCallback(() => {
    if (isBlocked) {
      void toggleBlock();
      return;
    }

    Alert.alert(
      "Block user?",
      "You will no longer see each other's posts or comments.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Block",
          style: "destructive",
          onPress: () => {
            void toggleBlock();
          },
        },
      ]
    );
  }, [isBlocked, toggleBlock]);

  if (loading) {
    return (
      <View style={styles.loadingScreen}>
        <ActivityIndicator color="#fbbf24" />
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
            onRefresh={() => void loadUserProfile(true)}
            tintColor="#fbbf24"
          />
        }
      >
        <AppTopBar activeHref="/(app)/profile" />

        <Pressable style={styles.backButton} onPress={() => router.back()}>
          <AppText style={styles.backButtonText}>{"<"} Back</AppText>
        </Pressable>

        {errorMessage || !profile ? (
          <View style={styles.errorCard}>
            <AppText style={styles.errorText}>{errorMessage ?? "Profile not found."}</AppText>
          </View>
        ) : (
          <>
            <View style={styles.profileCard}>
              <View style={styles.profileHeader}>
                <View style={styles.avatarWrap}>
                  {profile.avatar_url ? (
                    <Image
                      source={{ uri: profile.avatar_url }}
                      style={styles.avatarImage}
                      resizeMode="cover"
                    />
                  ) : (
                    <AppText style={styles.avatarFallback}>
                      {(profile.display_name ?? profile.email ?? "?")[0]?.toUpperCase() ?? "?"}
                    </AppText>
                  )}
                </View>
                <View style={styles.profileMeta}>
                  <AppText style={styles.username}>
                    {profile.display_name ?? profile.email ?? "Unknown"}
                  </AppText>
                  {fullName ? <AppText style={styles.fullName}>{fullName}</AppText> : null}
                  <AppText style={styles.subtitle}>
                    {isBlocked
                      ? "You have blocked this user."
                      : "Tap below to block if needed."}
                  </AppText>
                </View>
              </View>

              {blocksUnavailable ? (
                <AppText style={styles.blockUnavailable}>
                  Blocking is temporarily unavailable.
                </AppText>
              ) : (
                <View style={styles.blockRow}>
                  {isBlocked ? (
                    <View style={styles.blockedChip}>
                      <AppText style={styles.blockedChipText}>Blocked</AppText>
                    </View>
                  ) : null}
                  <Pressable
                    style={[
                      styles.blockButton,
                      isBlocked ? styles.unblockButton : styles.blockActionButton,
                      blockActionLoading ? styles.blockButtonDisabled : null,
                    ]}
                    disabled={blockActionLoading}
                    onPress={handleToggleBlock}
                  >
                    <AppText style={styles.blockButtonText}>
                      {blockActionLoading
                        ? "Updating..."
                        : isBlocked
                          ? "Unblock"
                          : "Block user"}
                    </AppText>
                  </Pressable>
                </View>
              )}

              {blockActionError ? (
                <AppText style={styles.blockErrorText}>{blockActionError}</AppText>
              ) : null}
            </View>

            <View style={styles.section}>
              <AppText style={styles.sectionTitle}>Recent posts</AppText>
              {isBlocked ? (
                <View style={styles.emptyCard}>
                  <AppText style={styles.emptyText}>
                    This user's content is hidden while blocked.
                  </AppText>
                </View>
              ) : entries.length === 0 ? (
                <View style={styles.emptyCard}>
                  <AppText style={styles.emptyText}>No posts yet.</AppText>
                </View>
              ) : (
                <View style={styles.entryGrid}>
                  {entries.map((entry) => (
                    <Pressable
                      key={entry.id}
                      onPress={() => router.push(`/(app)/entries/${entry.id}`)}
                      style={styles.entryCard}
                    >
                      <View style={styles.entryImageWrap}>
                        {entry.label_image_url ? (
                          <Image
                            source={{ uri: entry.label_image_url }}
                            style={styles.entryImage}
                            resizeMode="cover"
                          />
                        ) : (
                          <AppText style={styles.entryImageFallback}>No photo</AppText>
                        )}
                      </View>
                      <AppText style={styles.entryName} numberOfLines={2}>
                        {entry.wine_name ?? "Untitled wine"}
                      </AppText>
                      <AppText style={styles.entryDate}>
                        {formatConsumedDate(entry.consumed_at)}
                      </AppText>
                    </Pressable>
                  ))}
                </View>
              )}
            </View>
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
  loadingScreen: {
    flex: 1,
    backgroundColor: "#0f0a09",
    alignItems: "center",
    justifyContent: "center",
  },
  content: {
    paddingHorizontal: 18,
    paddingTop: 16,
    paddingBottom: 28,
    gap: 12,
  },
  backButton: {
    alignSelf: "flex-start",
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    backgroundColor: "rgba(255,255,255,0.04)",
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  backButtonText: {
    color: "#d4d4d8",
    fontSize: 12,
    fontWeight: "600",
  },
  errorCard: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(251,113,133,0.4)",
    backgroundColor: "rgba(251,113,133,0.12)",
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  errorText: {
    color: "#fecdd3",
    fontSize: 13,
  },
  profileCard: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    backgroundColor: "rgba(255,255,255,0.05)",
    padding: 12,
    gap: 10,
  },
  profileHeader: {
    flexDirection: "row",
    gap: 10,
    alignItems: "center",
  },
  avatarWrap: {
    width: 48,
    height: 48,
    borderRadius: 999,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    backgroundColor: "rgba(0,0,0,0.35)",
    alignItems: "center",
    justifyContent: "center",
  },
  avatarImage: {
    width: "100%",
    height: "100%",
  },
  avatarFallback: {
    color: "#a1a1aa",
    fontSize: 16,
    fontWeight: "700",
  },
  profileMeta: {
    flex: 1,
    gap: 2,
  },
  username: {
    color: "#f4f4f5",
    fontSize: 18,
    fontWeight: "700",
  },
  fullName: {
    color: "#d4d4d8",
    fontSize: 12,
  },
  subtitle: {
    color: "#a1a1aa",
    fontSize: 12,
  },
  blockUnavailable: {
    color: "#fca5a5",
    fontSize: 12,
  },
  blockRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
    gap: 8,
  },
  blockedChip: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(251,113,133,0.4)",
    backgroundColor: "rgba(251,113,133,0.12)",
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  blockedChipText: {
    color: "#fecdd3",
    fontSize: 11,
    fontWeight: "700",
  },
  blockButton: {
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 11,
    paddingVertical: 6,
  },
  blockActionButton: {
    borderColor: "rgba(255,255,255,0.2)",
    backgroundColor: "rgba(255,255,255,0.04)",
  },
  unblockButton: {
    borderColor: "rgba(255,255,255,0.2)",
    backgroundColor: "rgba(0,0,0,0.3)",
  },
  blockButtonDisabled: {
    opacity: 0.6,
  },
  blockButtonText: {
    color: "#e4e4e7",
    fontSize: 12,
    fontWeight: "700",
  },
  blockErrorText: {
    color: "#fecdd3",
    fontSize: 12,
    textAlign: "right",
  },
  section: {
    gap: 8,
  },
  sectionTitle: {
    color: "#f4f4f5",
    fontSize: 15,
    fontWeight: "700",
  },
  emptyCard: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    backgroundColor: "rgba(0,0,0,0.25)",
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  emptyText: {
    color: "#a1a1aa",
    fontSize: 12,
  },
  entryGrid: {
    gap: 10,
  },
  entryCard: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    backgroundColor: "rgba(255,255,255,0.04)",
    padding: 10,
    gap: 6,
  },
  entryImageWrap: {
    width: "100%",
    aspectRatio: 7 / 5,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    overflow: "hidden",
    backgroundColor: "rgba(0,0,0,0.35)",
    alignItems: "center",
    justifyContent: "center",
  },
  entryImage: {
    width: "100%",
    height: "100%",
  },
  entryImageFallback: {
    color: "#71717a",
    fontSize: 11,
  },
  entryName: {
    color: "#f4f4f5",
    fontSize: 13,
    fontWeight: "600",
  },
  entryDate: {
    color: "#a1a1aa",
    fontSize: 11,
  },
});

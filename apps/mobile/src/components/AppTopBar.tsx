import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from "react-native";
import { router, usePathname } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { getAccessTokenForApi, getWebApiBaseUrl } from "@/src/lib/api/webApi";
import {
  getPublicProfileInitial,
  getPublicProfileName,
} from "@/src/lib/publicProfiles";
import { supabase } from "@/src/lib/supabase";
import { useAuth } from "@/src/providers/AuthProvider";
import { AppText } from "@/src/components/AppText";
import { colors } from "@/src/lib/theme";
import { fonts } from "@/src/lib/typography";

type TagAlert = {
  id: string;
  type: "tagged";
  entry_id: string;
  created_at: string;
  actor_name: string;
  wine_name: string | null;
};

type FriendRequestAlert = {
  id: string;
  type: "friend_request";
  created_at: string;
  requester_name: string;
};

type AlertItem = TagAlert | FriendRequestAlert;

type MenuProfileData = {
  displayName: string;
  initial: string;
  username: string | null;
  entryCount: number;
  friendCount: number;
  countryCount: number;
};

const WEB_API_BASE_URL = getWebApiBaseUrl();

function formatAlertDate(value: string) {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return "";
  }
  return parsed.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}

function isMissingAvatarColumn(message: string) {
  return message.includes("avatar_path") || message.includes("column");
}

export function AppTopBar() {
  const pathname = usePathname();
  const { user, signOut } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);
  const [alertsOpen, setAlertsOpen] = useState(false);
  const [alertCount, setAlertCount] = useState(0);
  const [alertsLoading, setAlertsLoading] = useState(false);
  const [alertsError, setAlertsError] = useState<string | null>(null);
  const [alerts, setAlerts] = useState<AlertItem[]>([]);
  const [respondingRequestId, setRespondingRequestId] = useState<string | null>(
    null
  );
  const [dismissingTagId, setDismissingTagId] = useState<string | null>(null);
  const [addingToCellarId, setAddingToCellarId] = useState<string | null>(null);
  const [menuProfile, setMenuProfile] = useState<MenuProfileData | null>(null);

  useEffect(() => {
    setMenuOpen(false);
    setAlertsOpen(false);
  }, [pathname]);

  // Load profile data for menu overlay
  const loadMenuProfile = useCallback(async () => {
    if (!user) {
      setMenuProfile(null);
      return;
    }

    const [profileRes, entryCountRes, friendCountRes, countryRes] =
      await Promise.all([
        supabase
          .from("public_profiles")
          .select("display_name, username, first_name, last_name, email")
          .eq("id", user.id)
          .maybeSingle(),
        supabase
          .from("wine_entries")
          .select("id", { count: "exact", head: true })
          .eq("user_id", user.id),
        supabase
          .from("friendships")
          .select("id", { count: "exact", head: true })
          .or(`user_a.eq.${user.id},user_b.eq.${user.id}`),
        supabase
          .from("wine_entries")
          .select("country")
          .eq("user_id", user.id)
          .not("country", "is", null),
      ]);

    const profile = profileRes.data;
    const uniqueCountries = new Set(
      (countryRes.data ?? [])
        .map((row: { country: string | null }) => row.country)
        .filter(Boolean)
    );

    setMenuProfile({
      displayName: getPublicProfileName(profile),
      initial: getPublicProfileInitial(profile),
      username: profile?.username ?? null,
      entryCount: entryCountRes.count ?? 0,
      friendCount: friendCountRes.count ?? 0,
      countryCount: uniqueCountries.size,
    });
  }, [user]);

  const refreshAlertCount = useCallback(async () => {
    if (!user) {
      setAlertCount(0);
      return;
    }

    const [
      { data: tagRows, error: tagError },
      { data: requestRows, error: requestError },
    ] = await Promise.all([
      supabase
        .from("wine_notifications")
        .select("id")
        .eq("user_id", user.id)
        .is("seen_at", null),
      supabase
        .from("friend_requests")
        .select("id")
        .eq("recipient_id", user.id)
        .eq("status", "pending")
        .is("seen_at", null),
    ]);

    if (tagError || requestError) {
      return;
    }

    setAlertCount((tagRows?.length ?? 0) + (requestRows?.length ?? 0));
  }, [user]);

  const loadAlerts = useCallback(async () => {
    if (!user) {
      setAlerts([]);
      return;
    }

    setAlertsLoading(true);
    setAlertsError(null);

    const [
      { data: notificationRows, error: notificationError },
      { data: requestRows, error: requestError },
    ] = await Promise.all([
      supabase
        .from("wine_notifications")
        .select("id, entry_id, actor_id, created_at")
        .eq("user_id", user.id)
        .is("seen_at", null)
        .order("created_at", { ascending: false })
        .limit(12),
      supabase
        .from("friend_requests")
        .select("id, requester_id, created_at")
        .eq("recipient_id", user.id)
        .eq("status", "pending")
        .is("seen_at", null)
        .order("created_at", { ascending: false })
        .limit(12),
    ]);

    if (notificationError || requestError) {
      setAlertsLoading(false);
      setAlertsError(
        notificationError?.message ??
          requestError?.message ??
          "Unable to load alerts."
      );
      return;
    }

    const tagRows = (notificationRows ?? []) as {
      id: string;
      entry_id: string;
      actor_id: string;
      created_at: string;
    }[];
    const friendRows = (requestRows ?? []) as {
      id: string;
      requester_id: string;
      created_at: string;
    }[];

    const actorIds = Array.from(new Set(tagRows.map((row) => row.actor_id)));
    const requesterIds = Array.from(
      new Set(friendRows.map((row) => row.requester_id))
    );
    const profileIds = Array.from(new Set([...actorIds, ...requesterIds]));
    const entryIds = Array.from(new Set(tagRows.map((row) => row.entry_id)));

    const [{ data: entryRows }, profileResponse] = await Promise.all([
      entryIds.length > 0
        ? supabase
            .from("wine_entries")
            .select("id, wine_name")
            .in("id", entryIds)
        : Promise.resolve({
            data: [] as { id: string; wine_name: string | null }[],
          }),
      profileIds.length > 0
        ? supabase
            .from("public_profiles")
            .select("id, display_name, email, avatar_path")
            .in("id", profileIds)
        : Promise.resolve({
            data: [] as {
              id: string;
              display_name: string | null;
              email: string | null;
              avatar_path?: string | null;
            }[],
            error: null,
          }),
    ]);

    let profileRows = profileResponse.data as
      | {
          id: string;
          display_name: string | null;
          email: string | null;
        }[]
      | null;

    if (
      profileResponse.error &&
      isMissingAvatarColumn(profileResponse.error.message)
    ) {
      const fallback = profileIds.length
        ? await supabase
            .from("public_profiles")
            .select("id, display_name, email")
            .in("id", profileIds)
        : { data: [] };
      profileRows = (fallback.data ?? []) as {
        id: string;
        display_name: string | null;
        email: string | null;
      }[];
    } else if (profileResponse.error) {
      setAlertsLoading(false);
      setAlertsError(profileResponse.error.message);
      return;
    }

    const profileNameById = new Map(
      (profileRows ?? []).map((row) => [row.id, getPublicProfileName(row)])
    );
    const wineNameByEntryId = new Map(
      (entryRows ?? []).map((entry) => [entry.id, entry.wine_name ?? null])
    );

    const tagAlerts: TagAlert[] = tagRows.map((row) => ({
      id: row.id,
      type: "tagged",
      entry_id: row.entry_id,
      created_at: row.created_at,
      actor_name: profileNameById.get(row.actor_id) ?? "Unknown",
      wine_name: wineNameByEntryId.get(row.entry_id) ?? null,
    }));
    const friendAlerts: FriendRequestAlert[] = friendRows.map((row) => ({
      id: row.id,
      type: "friend_request",
      created_at: row.created_at,
      requester_name: profileNameById.get(row.requester_id) ?? "Unknown",
    }));

    const mergedAlerts = [...tagAlerts, ...friendAlerts].sort((left, right) =>
      right.created_at.localeCompare(left.created_at)
    );
    setAlerts(mergedAlerts);
    setAlertCount(mergedAlerts.length);
    setAlertsLoading(false);
  }, [user]);

  useEffect(() => {
    void refreshAlertCount();
    const intervalId = setInterval(() => {
      void refreshAlertCount();
    }, 25000);
    return () => {
      clearInterval(intervalId);
    };
  }, [refreshAlertCount]);

  useEffect(() => {
    if (!alertsOpen) {
      return;
    }
    void loadAlerts();
  }, [alertsOpen, loadAlerts]);

  useEffect(() => {
    if (!menuOpen) {
      return;
    }
    void loadMenuProfile();
  }, [menuOpen, loadMenuProfile]);

  const onSignOut = async () => {
    setMenuOpen(false);
    await signOut();
    router.replace("/(auth)/sign-in");
  };

  const onRespondToFriendRequest = async (
    requestId: string,
    action: "accept" | "decline"
  ) => {
    if (!user) {
      return;
    }
    if (!WEB_API_BASE_URL) {
      setAlertsError(
        "Set EXPO_PUBLIC_WEB_API_BASE_URL to handle friend requests."
      );
      return;
    }

    const accessToken = await getAccessTokenForApi();
    if (!accessToken) {
      setAlertsError("Session expired. Sign in again and try.");
      return;
    }

    setRespondingRequestId(requestId);
    setAlertsError(null);
    const endpoint =
      action === "accept"
        ? `/api/friends/requests/${requestId}/accept`
        : `/api/friends/requests/${requestId}/decline`;
    const response = await fetch(`${WEB_API_BASE_URL}${endpoint}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    if (!response.ok) {
      const payload = (await response.json().catch(() => ({}))) as {
        error?: string;
      };
      setAlertsError(payload.error ?? "Unable to update friend request.");
      setRespondingRequestId(null);
      return;
    }

    setRespondingRequestId(null);
    await Promise.all([loadAlerts(), refreshAlertCount()]);
  };

  const onDismissTag = async (notificationId: string) => {
    if (!user) {
      return;
    }
    setDismissingTagId(notificationId);
    setAlertsError(null);
    const nowIso = new Date().toISOString();

    const { error } = await supabase
      .from("wine_notifications")
      .update({ seen_at: nowIso })
      .eq("id", notificationId)
      .eq("user_id", user.id)
      .is("seen_at", null);

    if (error) {
      setAlertsError(error.message);
      setDismissingTagId(null);
      return;
    }

    setDismissingTagId(null);
    await Promise.all([loadAlerts(), refreshAlertCount()]);
  };

  const onAddToCellar = async (alert: TagAlert) => {
    if (!WEB_API_BASE_URL) {
      setAlertsError(
        "Set EXPO_PUBLIC_WEB_API_BASE_URL to enable Add to my cellar."
      );
      return;
    }

    const accessToken = await getAccessTokenForApi();
    if (!accessToken) {
      setAlertsError("Session expired. Sign in again and try.");
      return;
    }

    setAddingToCellarId(alert.id);
    setAlertsError(null);

    try {
      const response = await fetch(
        `${WEB_API_BASE_URL}/api/entries/${alert.entry_id}/add-to-log`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        }
      );

      const payload = (await response.json().catch(() => ({}))) as {
        entry_id?: unknown;
        error?: string;
      };

      if (!response.ok) {
        setAlertsError(
          payload.error ?? "Unable to add this tasting right now."
        );
        return;
      }

      const nextEntryId =
        typeof payload.entry_id === "string" ? payload.entry_id : null;
      if (!nextEntryId) {
        setAlertsError("Unable to add this tasting right now.");
        return;
      }

      setAlerts((current) => current.filter((item) => item.id !== alert.id));
      setAlertCount((current) => Math.max(0, current - 1));
      setAlertsOpen(false);
      router.push(`/(app)/entries/${nextEntryId}`);
      void refreshAlertCount();
    } catch {
      setAlertsError("Unable to add this tasting right now.");
    } finally {
      setAddingToCellarId(null);
    }
  };

  const markAllSeen = async () => {
    if (!user) {
      return;
    }
    setAlertsError(null);
    const nowIso = new Date().toISOString();

    const [{ error: notificationsError }, { error: requestsError }] =
      await Promise.all([
        supabase
          .from("wine_notifications")
          .update({ seen_at: nowIso })
          .eq("user_id", user.id)
          .is("seen_at", null),
        supabase
          .from("friend_requests")
          .update({ seen_at: nowIso })
          .eq("recipient_id", user.id)
          .eq("status", "pending")
          .is("seen_at", null),
      ]);

    if (notificationsError || requestsError) {
      setAlertsError(
        notificationsError?.message ??
          requestsError?.message ??
          "Unable to mark alerts seen."
      );
      return;
    }

    await Promise.all([loadAlerts(), refreshAlertCount()]);
  };

  const toggleMenu = () => {
    setMenuOpen((current) => !current);
    setAlertsOpen(false);
  };

  const toggleAlerts = () => {
    setAlertsOpen((current) => !current);
    setMenuOpen(false);
  };

  return (
    <View style={styles.container}>
      {/* ── Slim header bar ─────────────────────────── */}
      <View style={styles.headerRow}>
        <Pressable
          onPress={() => router.push("/(app)/feed")}
          accessibilityRole="button"
          accessibilityLabel="Go to feed"
        >
          <AppText style={styles.wordmark}>cluster</AppText>
        </Pressable>
        <View style={styles.headerActions}>
          <Pressable
            style={styles.newBtn}
            onPress={() => router.push("/(app)/entries/new")}
          >
            <AppText style={styles.newBtnText}>+ New</AppText>
          </Pressable>

          <Pressable
            style={styles.iconButton}
            onPress={toggleAlerts}
            accessibilityRole="button"
            accessibilityLabel={alertsOpen ? "Close alerts" : "Open alerts"}
          >
            <Feather name="bell" size={16} color={colors.textPrimary} />
            {alertCount > 0 ? (
              <View style={styles.alertBadge}>
                <AppText style={styles.alertBadgeText}>
                  {alertCount > 99 ? "99+" : alertCount}
                </AppText>
              </View>
            ) : null}
          </Pressable>

          <Pressable
            style={styles.iconButton}
            onPress={toggleMenu}
            accessibilityRole="button"
            accessibilityLabel={menuOpen ? "Close menu" : "Open menu"}
          >
            <Feather
              name={menuOpen ? "x" : "menu"}
              size={18}
              color={colors.textPrimary}
            />
          </Pressable>
        </View>
      </View>

      {/* ── Alerts panel ────────────────────────────── */}
      {alertsOpen ? (
        <View style={[styles.panel, styles.floatingPanel]}>
          <View style={styles.panelHeader}>
            <AppText style={styles.panelTitle}>Alerts</AppText>
            <Pressable onPress={() => void markAllSeen()}>
              <AppText style={styles.panelAction}>Mark all seen</AppText>
            </Pressable>
          </View>
          {alertsLoading ? (
            <View style={styles.loadingRow}>
              <ActivityIndicator color={colors.accentPrimary} />
            </View>
          ) : alertsError ? (
            <AppText style={styles.panelError}>{alertsError}</AppText>
          ) : alerts.length === 0 ? (
            <AppText style={styles.panelEmpty}>No new alerts yet.</AppText>
          ) : (
            <View style={styles.alertList}>
              {alerts.map((alert) =>
                alert.type === "friend_request" ? (
                  <View
                    key={`${alert.type}-${alert.id}`}
                    style={styles.alertRow}
                  >
                    <View style={styles.alertBody}>
                      <AppText style={styles.alertLabel}>
                        <AppText style={styles.alertActor}>
                          {alert.requester_name}
                        </AppText>
                        {" sent a friend request"}
                      </AppText>
                      <AppText style={styles.alertDate}>
                        {formatAlertDate(alert.created_at)}
                      </AppText>
                    </View>
                    <View style={styles.alertActions}>
                      <Pressable
                        style={styles.actionPill}
                        disabled={respondingRequestId === alert.id}
                        onPress={() =>
                          void onRespondToFriendRequest(alert.id, "accept")
                        }
                      >
                        <AppText style={styles.actionPillText}>
                          {respondingRequestId === alert.id ? "..." : "Accept"}
                        </AppText>
                      </Pressable>
                      <Pressable
                        style={styles.actionGhost}
                        disabled={respondingRequestId === alert.id}
                        onPress={() =>
                          void onRespondToFriendRequest(alert.id, "decline")
                        }
                      >
                        <AppText style={styles.actionGhostText}>
                          Decline
                        </AppText>
                      </Pressable>
                    </View>
                  </View>
                ) : (
                  <View
                    key={`${alert.type}-${alert.id}`}
                    style={styles.alertRow}
                  >
                    <View style={styles.alertTagHeader}>
                      <View style={styles.alertTagTextWrap}>
                        <AppText style={styles.alertLabel}>
                          <AppText style={styles.alertActor}>
                            {alert.actor_name}
                          </AppText>
                          {" tagged you in "}
                          <AppText style={styles.alertWineName}>
                            {alert.wine_name ?? "a wine"}
                          </AppText>
                        </AppText>
                        <AppText style={styles.alertDate}>
                          {formatAlertDate(alert.created_at)}
                        </AppText>
                      </View>
                      <Pressable
                        style={styles.alertDismissButton}
                        disabled={dismissingTagId === alert.id}
                        onPress={() => void onDismissTag(alert.id)}
                      >
                        <AppText style={styles.alertDismissButtonText}>
                          {dismissingTagId === alert.id ? "..." : "x"}
                        </AppText>
                      </Pressable>
                    </View>
                    <View style={styles.alertActions}>
                      <Pressable
                        style={styles.actionGhost}
                        onPress={() =>
                          router.push(`/(app)/entries/${alert.entry_id}`)
                        }
                      >
                        <AppText style={styles.actionGhostText}>View</AppText>
                      </Pressable>
                      <Pressable
                        style={styles.actionAmber}
                        disabled={addingToCellarId === alert.id}
                        onPress={() => void onAddToCellar(alert)}
                      >
                        <AppText style={styles.actionAmberText}>
                          {addingToCellarId === alert.id
                            ? "Adding..."
                            : "Add to my cellar"}
                        </AppText>
                      </Pressable>
                    </View>
                  </View>
                )
              )}
            </View>
          )}
        </View>
      ) : null}

      {/* ── Menu overlay (full-screen modal) ────────── */}
      <Modal
        visible={menuOpen}
        animationType="slide"
        transparent
        onRequestClose={() => setMenuOpen(false)}
      >
        <View style={menuStyles.backdrop}>
          <View style={menuStyles.sheet}>
            <View style={menuStyles.sheetHeader}>
              <AppText style={styles.wordmark}>cluster</AppText>
              <Pressable
                style={styles.iconButton}
                onPress={() => setMenuOpen(false)}
              >
                <Feather name="x" size={18} color={colors.textPrimary} />
              </Pressable>
            </View>

            <ScrollView
              style={menuStyles.scrollBody}
              contentContainerStyle={menuStyles.scrollContent}
              showsVerticalScrollIndicator={false}
            >
              {/* User card */}
              {menuProfile ? (
                <Pressable
                  style={menuStyles.userCard}
                  onPress={() => {
                    setMenuOpen(false);
                    router.push("/(app)/profile");
                  }}
                >
                  <View style={menuStyles.avatar}>
                    <AppText style={menuStyles.avatarText}>
                      {menuProfile.initial}
                    </AppText>
                  </View>
                  <View style={menuStyles.userInfo}>
                    <AppText style={menuStyles.userName}>
                      {menuProfile.displayName}
                    </AppText>
                    {menuProfile.username ? (
                      <AppText style={menuStyles.userHandle}>
                        @{menuProfile.username}
                      </AppText>
                    ) : null}
                  </View>
                </Pressable>
              ) : null}

              {/* Stats row */}
              {menuProfile ? (
                <View style={menuStyles.statsRow}>
                  <View style={menuStyles.statItem}>
                    <AppText style={menuStyles.statValue}>
                      {menuProfile.entryCount}
                    </AppText>
                    <AppText style={menuStyles.statLabel}>Pours</AppText>
                  </View>
                  <View style={menuStyles.statDivider} />
                  <View style={menuStyles.statItem}>
                    <AppText style={menuStyles.statValue}>
                      {menuProfile.friendCount}
                    </AppText>
                    <AppText style={menuStyles.statLabel}>Friends</AppText>
                  </View>
                  <View style={menuStyles.statDivider} />
                  <View style={menuStyles.statItem}>
                    <AppText style={menuStyles.statValue}>
                      {menuProfile.countryCount}
                    </AppText>
                    <AppText style={menuStyles.statLabel}>Countries</AppText>
                  </View>
                </View>
              ) : null}

              {/* Account section */}
              <View style={menuStyles.section}>
                <AppText style={menuStyles.sectionTitle}>Account</AppText>
                <Pressable
                  style={menuStyles.menuItem}
                  onPress={() => {
                    setMenuOpen(false);
                    router.push("/(app)/profile");
                  }}
                >
                  <Feather
                    name="user"
                    size={16}
                    color={colors.textSecondary}
                  />
                  <AppText style={menuStyles.menuItemText}>Profile</AppText>
                </Pressable>
                <Pressable
                  style={menuStyles.menuItem}
                  onPress={() => {
                    setMenuOpen(false);
                    router.push("/(app)/friends");
                  }}
                >
                  <Feather
                    name="users"
                    size={16}
                    color={colors.textSecondary}
                  />
                  <AppText style={menuStyles.menuItemText}>Friends</AppText>
                </Pressable>
              </View>

              {/* More section */}
              <View style={menuStyles.section}>
                <AppText style={menuStyles.sectionTitle}>More</AppText>
                <Pressable
                  style={menuStyles.menuItem}
                  onPress={() => {
                    setMenuOpen(false);
                    toggleAlerts();
                  }}
                >
                  <Feather
                    name="bell"
                    size={16}
                    color={colors.textSecondary}
                  />
                  <AppText style={menuStyles.menuItemText}>
                    Notifications
                  </AppText>
                  {alertCount > 0 ? (
                    <View style={menuStyles.countBadge}>
                      <AppText style={menuStyles.countBadgeText}>
                        {alertCount > 99 ? "99+" : alertCount}
                      </AppText>
                    </View>
                  ) : null}
                </Pressable>
                <Pressable style={menuStyles.menuItem}>
                  <Feather
                    name="message-square"
                    size={16}
                    color={colors.textSecondary}
                  />
                  <AppText style={menuStyles.menuItemText}>Feedback</AppText>
                </Pressable>
                <Pressable
                  style={menuStyles.menuItem}
                  onPress={() => {
                    setMenuOpen(false);
                    router.push("/privacy" as Parameters<typeof router.push>[0]);
                  }}
                >
                  <Feather
                    name="shield"
                    size={16}
                    color={colors.textSecondary}
                  />
                  <AppText style={menuStyles.menuItemText}>
                    Privacy & Terms
                  </AppText>
                </Pressable>
              </View>

              {/* Sign out */}
              <Pressable
                style={menuStyles.signOutBtn}
                onPress={() => void onSignOut()}
              >
                <Feather
                  name="log-out"
                  size={16}
                  color={colors.textSecondary}
                />
                <AppText style={menuStyles.signOutText}>Sign out</AppText>
              </Pressable>
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: "relative",
    overflow: "visible",
    zIndex: 20,
  },
  headerRow: {
    height: 50,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  wordmark: {
    fontFamily: fonts.serif.light,
    color: colors.textPrimary,
    fontSize: 22,
    letterSpacing: 7,
    textTransform: "lowercase",
  },
  headerActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  newBtn: {
    borderRadius: 999,
    backgroundColor: colors.accentPrimary,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  newBtnText: {
    color: colors.champagne,
    fontSize: 12,
    fontWeight: "700",
  },
  iconButton: {
    width: 36,
    height: 36,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    alignItems: "center",
    justifyContent: "center",
    position: "relative",
  },
  alertBadge: {
    position: "absolute",
    right: -3,
    top: -5,
    borderRadius: 999,
    backgroundColor: colors.accentPrimary,
    paddingHorizontal: 4,
    minWidth: 16,
    height: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  alertBadgeText: {
    color: colors.champagne,
    fontSize: 9,
    fontWeight: "800",
  },
  panel: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceRaised,
    padding: 10,
    gap: 8,
  },
  floatingPanel: {
    position: "absolute",
    top: 54,
    left: 0,
    right: 0,
    zIndex: 40,
    shadowColor: colors.textPrimary,
    shadowOpacity: 0.15,
    shadowRadius: 22,
    shadowOffset: {
      width: 0,
      height: 14,
    },
    elevation: 14,
  },
  panelHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  panelTitle: {
    color: colors.textPrimary,
    fontSize: 13,
    fontWeight: "700",
  },
  panelAction: {
    color: colors.accentSecondary,
    fontSize: 11,
    fontWeight: "700",
  },
  loadingRow: {
    paddingVertical: 6,
    alignItems: "center",
  },
  panelError: {
    color: colors.error,
    fontSize: 12,
  },
  panelEmpty: {
    color: colors.textSecondary,
    fontSize: 12,
  },
  alertList: {
    gap: 8,
  },
  alertRow: {
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.border,
    padding: 9,
    gap: 7,
  },
  alertBody: {
    gap: 2,
  },
  alertTagHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
  },
  alertTagTextWrap: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  alertLabel: {
    color: colors.textPrimary,
    fontSize: 12,
    lineHeight: 17,
  },
  alertActor: {
    color: colors.accentSecondary,
    fontWeight: "700",
  },
  alertWineName: {
    color: colors.textPrimary,
    fontWeight: "600",
  },
  alertDate: {
    color: colors.textSecondary,
    fontSize: 11,
  },
  alertDismissButton: {
    width: 24,
    height: 24,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  alertDismissButtonText: {
    color: colors.textSecondary,
    fontSize: 11,
    fontWeight: "700",
  },
  alertActions: {
    flexDirection: "row",
    gap: 8,
    alignItems: "center",
    flexWrap: "wrap",
  },
  actionPill: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(45,125,70,0.5)",
    backgroundColor: "rgba(45,125,70,0.14)",
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  actionPillText: {
    color: colors.success,
    fontSize: 11,
    fontWeight: "700",
  },
  actionGhost: {
    alignSelf: "flex-start",
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  actionGhostText: {
    color: colors.textSecondary,
    fontSize: 11,
    fontWeight: "700",
  },
  actionAmber: {
    borderRadius: 999,
    backgroundColor: colors.accentPrimary,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  actionAmberText: {
    color: colors.champagne,
    fontSize: 11,
    fontWeight: "700",
  },
});

const menuStyles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: colors.overlay,
  },
  sheet: {
    flex: 1,
    backgroundColor: colors.screenBg,
    paddingTop: 60,
  },
  sheetHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 18,
    paddingBottom: 16,
    borderBottomWidth: 0.5,
    borderBottomColor: colors.border,
  },
  scrollBody: {
    flex: 1,
  },
  scrollContent: {
    padding: 18,
    paddingBottom: 40,
    gap: 20,
  },
  userCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: colors.accentPrimary,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: {
    color: colors.champagne,
    fontSize: 20,
    fontWeight: "700",
  },
  userInfo: {
    flex: 1,
    gap: 2,
  },
  userName: {
    color: colors.textPrimary,
    fontSize: 16,
    fontWeight: "700",
  },
  userHandle: {
    color: colors.textSecondary,
    fontSize: 13,
  },
  statsRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 20,
    paddingVertical: 14,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfacePrimary,
  },
  statItem: {
    alignItems: "center",
    gap: 2,
  },
  statValue: {
    color: colors.textPrimary,
    fontSize: 18,
    fontWeight: "700",
  },
  statLabel: {
    color: colors.textSecondary,
    fontSize: 10,
    letterSpacing: 1,
    textTransform: "uppercase",
    fontWeight: "500",
  },
  statDivider: {
    width: 1,
    height: 28,
    backgroundColor: colors.border,
  },
  section: {
    gap: 4,
  },
  sectionTitle: {
    color: colors.textTertiary,
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 1.5,
    textTransform: "uppercase",
    marginBottom: 6,
  },
  menuItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 13,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfacePrimary,
    marginBottom: 4,
  },
  menuItemText: {
    flex: 1,
    color: colors.textPrimary,
    fontSize: 14,
    fontWeight: "600",
  },
  betaBadge: {
    borderRadius: 999,
    backgroundColor: colors.accentSoft,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  betaBadgeText: {
    color: colors.accentSecondary,
    fontSize: 9,
    fontWeight: "800",
    letterSpacing: 1,
  },
  countBadge: {
    borderRadius: 999,
    backgroundColor: colors.accentPrimary,
    minWidth: 20,
    height: 20,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 6,
  },
  countBadgeText: {
    color: colors.champagne,
    fontSize: 10,
    fontWeight: "800",
  },
  signOutBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 13,
    borderWidth: 1,
    borderColor: colors.border,
    marginTop: 8,
  },
  signOutText: {
    color: colors.textSecondary,
    fontSize: 14,
    fontWeight: "600",
  },
});

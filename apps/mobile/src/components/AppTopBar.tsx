import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, View } from "react-native";
import { router, usePathname } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { supabase } from "@/src/lib/supabase";
import { useAuth } from "@/src/providers/AuthProvider";
import { AppText } from "@/src/components/AppText";

type AppRoute = "/(app)/home" | "/(app)/entries" | "/(app)/feed" | "/(app)/profile";

type NavItem = {
  label: string;
  href: AppRoute;
};

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

const NAV_ITEMS: NavItem[] = [
  { label: "Home", href: "/(app)/home" },
  { label: "My library", href: "/(app)/entries" },
  { label: "Feed", href: "/(app)/feed" },
  { label: "Profile", href: "/(app)/profile" },
];
const WEB_API_BASE_URL = process.env.EXPO_PUBLIC_WEB_API_BASE_URL;

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

export function AppTopBar({ activeHref }: { activeHref: AppRoute }) {
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

  useEffect(() => {
    setMenuOpen(false);
    setAlertsOpen(false);
  }, [pathname]);

  const refreshAlertCount = useCallback(async () => {
    if (!user) {
      setAlertCount(0);
      return;
    }

    const [{ count: tagCount, error: tagError }, { count: requestCount, error: requestError }] =
      await Promise.all([
        supabase
          .from("wine_notifications")
          .select("id", { count: "exact", head: true })
          .eq("user_id", user.id)
          .is("seen_at", null),
        supabase
          .from("friend_requests")
          .select("id", { count: "exact", head: true })
          .eq("recipient_id", user.id)
          .eq("status", "pending")
          .is("seen_at", null),
      ]);

    if (tagError || requestError) {
      return;
    }

    setAlertCount((tagCount ?? 0) + (requestCount ?? 0));
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
      setAlertsError(notificationError?.message ?? requestError?.message ?? "Unable to load alerts.");
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
    const requesterIds = Array.from(new Set(friendRows.map((row) => row.requester_id)));
    const profileIds = Array.from(new Set([...actorIds, ...requesterIds]));
    const entryIds = Array.from(new Set(tagRows.map((row) => row.entry_id)));

    const [{ data: entryRows }, profileResponse] = await Promise.all([
      entryIds.length > 0
        ? supabase.from("wine_entries").select("id, wine_name").in("id", entryIds)
        : Promise.resolve({ data: [] as { id: string; wine_name: string | null }[] }),
      profileIds.length > 0
        ? supabase
            .from("profiles")
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

    if (profileResponse.error && isMissingAvatarColumn(profileResponse.error.message)) {
      const fallback = profileIds.length
        ? await supabase
            .from("profiles")
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
      (profileRows ?? []).map((row) => [
        row.id,
        row.display_name ?? row.email ?? "Unknown",
      ])
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

    setAlerts(
      [...tagAlerts, ...friendAlerts].sort((left, right) =>
        right.created_at.localeCompare(left.created_at)
      )
    );
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

  const onSignOut = async () => {
    await signOut();
    router.replace("/(auth)/sign-in");
  };

  const onOpenLegalPage = (path: "/privacy" | "/terms") => {
    setMenuOpen(false);
    router.push(path);
  };

  const onRespondToFriendRequest = async (
    requestId: string,
    action: "accept" | "decline"
  ) => {
    if (!user) {
      return;
    }
    setRespondingRequestId(requestId);
    setAlertsError(null);
    const nowIso = new Date().toISOString();
    const { error } = await supabase
      .from("friend_requests")
      .update({
        status: action === "accept" ? "accepted" : "declined",
        responded_at: nowIso,
        seen_at: nowIso,
      })
      .eq("id", requestId)
      .eq("recipient_id", user.id)
      .eq("status", "pending");

    if (error) {
      setAlertsError(error.message);
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

    const { data: sessionResult } = await supabase.auth.getSession();
    const accessToken = sessionResult.session?.access_token;
    if (!accessToken) {
      setAlertsError("Session expired. Sign in again and try.");
      return;
    }

    setAddingToCellarId(alert.id);
    setAlertsError(null);

    try {
      const response = await fetch(
        `${WEB_API_BASE_URL.replace(/\/$/, "")}/api/entries/${alert.entry_id}/add-to-log`,
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
        setAlertsError(payload.error ?? "Unable to add this tasting right now.");
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

    const [{ error: notificationsError }, { error: requestsError }] = await Promise.all([
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
      setAlertsError(notificationsError?.message ?? requestsError?.message ?? "Unable to mark alerts seen.");
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
      <View style={styles.navRow}>
        <AppText style={styles.brand}>CellarSnap</AppText>
        <View style={styles.navActions}>
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
            <Feather name="bell" size={16} color="#e4e4e7" />
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
            <Feather name={menuOpen ? "x" : "menu"} size={18} color="#e4e4e7" />
          </Pressable>
        </View>
      </View>

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
              <ActivityIndicator color="#fbbf24" />
            </View>
          ) : alertsError ? (
            <AppText style={styles.panelError}>{alertsError}</AppText>
          ) : alerts.length === 0 ? (
            <AppText style={styles.panelEmpty}>No new alerts yet.</AppText>
          ) : (
            <View style={styles.alertList}>
              {alerts.map((alert) =>
                alert.type === "friend_request" ? (
                  <View key={`${alert.type}-${alert.id}`} style={styles.alertRow}>
                    <View style={styles.alertBody}>
                      <AppText style={styles.alertLabel}>
                        <AppText style={styles.alertActor}>{alert.requester_name}</AppText>
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
                        <AppText style={styles.actionGhostText}>Decline</AppText>
                      </Pressable>
                    </View>
                  </View>
                ) : (
                  <View key={`${alert.type}-${alert.id}`} style={styles.alertRow}>
                    <View style={styles.alertTagHeader}>
                      <View style={styles.alertTagTextWrap}>
                        <AppText style={styles.alertLabel}>
                          <AppText style={styles.alertActor}>{alert.actor_name}</AppText>
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
                        onPress={() => router.push(`/(app)/entries/${alert.entry_id}`)}
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

      {menuOpen ? (
        <View style={[styles.panel, styles.floatingPanel]}>
          <View style={styles.menuList}>
            {NAV_ITEMS.map((item) => (
              <Pressable
                key={item.href}
                style={[
                  styles.menuItem,
                  activeHref === item.href ? styles.menuItemActive : null,
                ]}
                onPress={() => router.push(item.href)}
              >
                <AppText
                  style={[
                    styles.menuItemText,
                    activeHref === item.href ? styles.menuItemTextActive : null,
                  ]}
                >
                  {item.label}
                </AppText>
              </Pressable>
            ))}
            <Pressable style={styles.menuItem} onPress={() => void onSignOut()}>
              <AppText style={styles.menuItemText}>Sign out</AppText>
            </Pressable>
            <View style={styles.menuLegalRow}>
              <Pressable onPress={() => void onOpenLegalPage("/privacy")}>
                <AppText style={styles.menuLegalLink}>Privacy</AppText>
              </Pressable>
              <AppText style={styles.menuLegalSeparator}>{" \u00B7 "}</AppText>
              <Pressable onPress={() => void onOpenLegalPage("/terms")}>
                <AppText style={styles.menuLegalLink}>Terms</AppText>
              </Pressable>
            </View>
          </View>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.06)",
    paddingBottom: 12,
    gap: 10,
    position: "relative",
    overflow: "visible",
    zIndex: 20,
  },
  navRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  brand: {
    color: "#fafafa",
    fontSize: 20,
    fontWeight: "700",
  },
  navActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  newBtn: {
    borderRadius: 999,
    backgroundColor: "#fbbf24",
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  newBtnText: {
    color: "#09090b",
    fontSize: 12,
    fontWeight: "700",
  },
  iconButton: {
    width: 36,
    height: 36,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.14)",
    alignItems: "center",
    justifyContent: "center",
    position: "relative",
  },
  alertBadge: {
    position: "absolute",
    right: -3,
    top: -5,
    borderRadius: 999,
    backgroundColor: "#fbbf24",
    paddingHorizontal: 4,
    minWidth: 16,
    height: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  alertBadgeText: {
    color: "#09090b",
    fontSize: 9,
    fontWeight: "800",
  },
  panel: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    backgroundColor: "rgba(20,16,15,0.98)",
    padding: 10,
    gap: 8,
  },
  floatingPanel: {
    position: "absolute",
    top: 44,
    left: 0,
    right: 0,
    zIndex: 40,
    shadowColor: "#000",
    shadowOpacity: 0.45,
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
    color: "#fafafa",
    fontSize: 13,
    fontWeight: "700",
  },
  panelAction: {
    color: "#fcd34d",
    fontSize: 11,
    fontWeight: "700",
  },
  loadingRow: {
    paddingVertical: 6,
    alignItems: "center",
  },
  panelError: {
    color: "#fecdd3",
    fontSize: 12,
  },
  panelEmpty: {
    color: "#a1a1aa",
    fontSize: 12,
  },
  alertList: {
    gap: 8,
  },
  alertRow: {
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    backgroundColor: "rgba(255,255,255,0.04)",
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
    color: "#f4f4f5",
    fontSize: 12,
    lineHeight: 17,
  },
  alertActor: {
    color: "#fcd34d",
    fontWeight: "700",
  },
  alertWineName: {
    color: "#fafafa",
    fontWeight: "600",
  },
  alertDate: {
    color: "#a1a1aa",
    fontSize: 11,
  },
  alertDismissButton: {
    width: 24,
    height: 24,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.14)",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  alertDismissButtonText: {
    color: "#d4d4d8",
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
    borderColor: "rgba(74,222,128,0.5)",
    backgroundColor: "rgba(74,222,128,0.14)",
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  actionPillText: {
    color: "#bbf7d0",
    fontSize: 11,
    fontWeight: "700",
  },
  actionGhost: {
    alignSelf: "flex-start",
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.18)",
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  actionGhostText: {
    color: "#d4d4d8",
    fontSize: 11,
    fontWeight: "700",
  },
  actionAmber: {
    borderRadius: 999,
    backgroundColor: "#fbbf24",
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  actionAmberText: {
    color: "#09090b",
    fontSize: 11,
    fontWeight: "700",
  },
  menuList: {
    gap: 7,
  },
  menuItem: {
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  menuItemActive: {
    borderColor: "rgba(252,211,77,0.55)",
    backgroundColor: "rgba(251,191,36,0.14)",
  },
  menuItemText: {
    color: "#e4e4e7",
    fontSize: 12,
    fontWeight: "700",
  },
  menuItemTextActive: {
    color: "#fef3c7",
  },
  menuLegalRow: {
    paddingTop: 2,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
  },
  menuLegalLink: {
    color: "#71717a",
    fontSize: 11,
    letterSpacing: 1.2,
    textTransform: "uppercase",
    fontWeight: "600",
  },
  menuLegalSeparator: {
    color: "#71717a",
    fontSize: 11,
    letterSpacing: 1.2,
  },
});

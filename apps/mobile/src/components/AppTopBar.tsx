import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { router, usePathname } from "expo-router";
import { supabase } from "@/src/lib/supabase";
import { useAuth } from "@/src/providers/AuthProvider";

type AppRoute = "/(app)/entries" | "/(app)/feed";

type NavItem = {
  label: string;
  href: AppRoute;
};

type TagAlert = {
  id: string;
  type: "tagged";
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
  { label: "My library", href: "/(app)/entries" },
  { label: "Feed", href: "/(app)/feed" },
];

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
        <Text style={styles.brand}>CellarSnap</Text>
        <View style={styles.navActions}>
          <Pressable
            style={styles.newBtn}
            onPress={() => router.push("/(app)/entries/new")}
          >
            <Text style={styles.newBtnText}>+ New</Text>
          </Pressable>

          <Pressable
            style={styles.iconButton}
            onPress={toggleAlerts}
            accessibilityRole="button"
            accessibilityLabel={alertsOpen ? "Close alerts" : "Open alerts"}
          >
            <View style={styles.bellIconWrap}>
              <View style={styles.bellTop} />
              <View style={styles.bellLip} />
              <View style={styles.bellClapper} />
            </View>
            {alertCount > 0 ? (
              <View style={styles.alertBadge}>
                <Text style={styles.alertBadgeText}>
                  {alertCount > 99 ? "99+" : alertCount}
                </Text>
              </View>
            ) : null}
          </Pressable>

          <Pressable
            style={styles.iconButton}
            onPress={toggleMenu}
            accessibilityRole="button"
            accessibilityLabel={menuOpen ? "Close menu" : "Open menu"}
          >
            {menuOpen ? (
              <Text style={styles.closeIcon}>×</Text>
            ) : (
              <View style={styles.hamburgerWrap}>
                <View style={styles.hamburgerLine} />
                <View style={styles.hamburgerLine} />
                <View style={styles.hamburgerLine} />
              </View>
            )}
          </Pressable>
        </View>
      </View>

      {alertsOpen ? (
        <View style={styles.panel}>
          <View style={styles.panelHeader}>
            <Text style={styles.panelTitle}>Alerts</Text>
            <Pressable onPress={() => void markAllSeen()}>
              <Text style={styles.panelAction}>Mark all seen</Text>
            </Pressable>
          </View>
          {alertsLoading ? (
            <View style={styles.loadingRow}>
              <ActivityIndicator color="#fbbf24" />
            </View>
          ) : alertsError ? (
            <Text style={styles.panelError}>{alertsError}</Text>
          ) : alerts.length === 0 ? (
            <Text style={styles.panelEmpty}>No new alerts yet.</Text>
          ) : (
            <View style={styles.alertList}>
              {alerts.map((alert) => (
                <View key={`${alert.type}-${alert.id}`} style={styles.alertRow}>
                  <View style={styles.alertBody}>
                    <Text style={styles.alertLabel}>
                      {alert.type === "friend_request"
                        ? `${alert.requester_name} sent a friend request`
                        : `${alert.actor_name} tagged you in ${alert.wine_name ?? "a post"}`}
                    </Text>
                    <Text style={styles.alertDate}>{formatAlertDate(alert.created_at)}</Text>
                  </View>
                  {alert.type === "friend_request" ? (
                    <View style={styles.alertActions}>
                      <Pressable
                        style={styles.actionPill}
                        disabled={respondingRequestId === alert.id}
                        onPress={() => void onRespondToFriendRequest(alert.id, "accept")}
                      >
                        <Text style={styles.actionPillText}>
                          {respondingRequestId === alert.id ? "..." : "Accept"}
                        </Text>
                      </Pressable>
                      <Pressable
                        style={styles.actionGhost}
                        disabled={respondingRequestId === alert.id}
                        onPress={() => void onRespondToFriendRequest(alert.id, "decline")}
                      >
                        <Text style={styles.actionGhostText}>Decline</Text>
                      </Pressable>
                    </View>
                  ) : (
                    <Pressable
                      style={styles.actionGhost}
                      disabled={dismissingTagId === alert.id}
                      onPress={() => void onDismissTag(alert.id)}
                    >
                      <Text style={styles.actionGhostText}>
                        {dismissingTagId === alert.id ? "..." : "Dismiss"}
                      </Text>
                    </Pressable>
                  )}
                </View>
              ))}
            </View>
          )}
        </View>
      ) : null}

      {menuOpen ? (
        <View style={styles.panel}>
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
                <Text
                  style={[
                    styles.menuItemText,
                    activeHref === item.href ? styles.menuItemTextActive : null,
                  ]}
                >
                  {item.label}
                </Text>
              </Pressable>
            ))}
            <Pressable style={styles.menuItem} onPress={() => void onSignOut()}>
              <Text style={styles.menuItemText}>Sign out</Text>
            </Pressable>
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
  hamburgerWrap: {
    width: 14,
    gap: 2.5,
  },
  hamburgerLine: {
    height: 1.5,
    borderRadius: 999,
    backgroundColor: "#e4e4e7",
  },
  closeIcon: {
    color: "#e4e4e7",
    fontSize: 20,
    lineHeight: 20,
    marginTop: -2,
  },
  bellIconWrap: {
    width: 16,
    alignItems: "center",
    justifyContent: "center",
    gap: 1,
  },
  bellTop: {
    width: 9,
    height: 6,
    borderTopLeftRadius: 4,
    borderTopRightRadius: 4,
    borderWidth: 1.5,
    borderBottomWidth: 0,
    borderColor: "#e4e4e7",
  },
  bellLip: {
    width: 12,
    height: 1.7,
    borderRadius: 999,
    backgroundColor: "#e4e4e7",
  },
  bellClapper: {
    width: 3.5,
    height: 2,
    borderRadius: 999,
    backgroundColor: "#e4e4e7",
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
  alertLabel: {
    color: "#f4f4f5",
    fontSize: 12,
    lineHeight: 17,
  },
  alertDate: {
    color: "#a1a1aa",
    fontSize: 11,
  },
  alertActions: {
    flexDirection: "row",
    gap: 8,
    alignItems: "center",
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
});

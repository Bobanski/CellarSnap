import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { AppTopBar } from "@/src/components/AppTopBar";
import { AppText } from "@/src/components/AppText";
import {
  fetchListScanHistory,
  type MobileListScanHistoryItem,
} from "@/src/lib/api/listScan";
import { useAuth } from "@/src/providers/AuthProvider";
import { colors } from "@/src/lib/theme";

function formatSourceTypeLabel(sourceType: MobileListScanHistoryItem["source_type"]) {
  if (sourceType === "pdf") {
    return "PDF";
  }
  if (sourceType === "url") {
    return "URL";
  }
  return "Photo";
}

export default function ListScanHistoryScreen() {
  const params = useLocalSearchParams<{ fromScanId?: string }>();
  const { hasPrivateBetaFeatureAccess } = useAuth();
  const [items, setItems] = useState<MobileListScanHistoryItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSignedOut, setIsSignedOut] = useState(false);
  const [backToScanId, setBackToScanId] = useState<string | null>(null);
  const isMountedRef = useRef(true);
  const renderNow = useMemo(() => Date.now(), [items]);

  useEffect(() => {
    const fromScanId =
      typeof params.fromScanId === "string" && params.fromScanId.trim().length > 0
        ? params.fromScanId
        : null;
    setBackToScanId(fromScanId);
  }, [params.fromScanId]);

  useEffect(() => {
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (!hasPrivateBetaFeatureAccess) {
      router.replace("/(app)/feed");
    }
  }, [hasPrivateBetaFeatureAccess]);

  const loadHistory = useCallback(async () => {
    setIsLoading(true);
    setErrorMessage(null);
    setIsSignedOut(false);

    const result = await fetchListScanHistory();
    if (!isMountedRef.current) {
      return;
    }

    if (!result.ok) {
      setIsSignedOut(result.status === 401);
      setErrorMessage(result.errorMessage);
      setItems([]);
      setIsLoading(false);
      return;
    }

    setItems(result.payload);
    setIsLoading(false);
  }, []);

  useEffect(() => {
    const timerId = window.setTimeout(() => {
      void loadHistory();
    }, 0);

    return () => {
      window.clearTimeout(timerId);
    };
  }, [loadHistory]);

  const goToCurrentScan = useCallback(() => {
    if (backToScanId) {
      router.push({
        pathname: "/(app)/list-scan/results",
        params: { scanId: backToScanId },
      });
    }
  }, [backToScanId]);

  if (!hasPrivateBetaFeatureAccess) {
    return null;
  }

  return (
    <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <AppTopBar />

      <View style={styles.header}>
        <AppText style={styles.eyebrow}>LIST SCAN</AppText>
        <AppText style={styles.title}>My scans</AppText>
        <AppText style={styles.subtitle}>
          Revisit previously scanned wine lists across devices.
        </AppText>

        <View style={styles.actionRow}>
          {backToScanId ? (
            <Pressable style={styles.secondaryButton} onPress={goToCurrentScan}>
              <AppText style={styles.secondaryButtonText}>Back to current scan</AppText>
            </Pressable>
          ) : null}
          <Pressable
            style={[styles.primaryButton, backToScanId ? styles.primaryButtonCompact : null]}
            onPress={() => router.push("/(app)/list-scan")}
          >
            <AppText style={styles.primaryButtonText}>Scan another</AppText>
          </Pressable>
        </View>
      </View>

      {isLoading ? (
        <View style={styles.infoCard}>
          <AppText style={styles.infoText}>Loading saved scans...</AppText>
        </View>
      ) : errorMessage ? (
        <View style={styles.infoCard}>
          <AppText style={styles.infoText}>{errorMessage}</AppText>
          <View style={styles.actionRow}>
            {isSignedOut ? (
              <Pressable
                style={styles.secondaryButton}
                onPress={() => router.push("/(auth)/sign-in")}
              >
                <AppText style={styles.secondaryButtonText}>Sign in</AppText>
              </Pressable>
            ) : (
              <Pressable style={styles.secondaryButton} onPress={loadHistory}>
                <AppText style={styles.secondaryButtonText}>Try again</AppText>
              </Pressable>
            )}
            <Pressable
              style={styles.primaryButton}
              onPress={() => router.push("/(app)/list-scan")}
            >
              <AppText style={styles.primaryButtonText}>Scan another</AppText>
            </Pressable>
          </View>
        </View>
      ) : items.length === 0 ? (
        <View style={styles.infoCard}>
          <AppText style={styles.infoText}>
            No saved scans yet. Scan a wine list while signed in and it will show up here.
          </AppText>
          <View style={styles.actionRow}>
            <Pressable
              style={styles.secondaryButton}
              onPress={() => router.push("/(app)/list-scan")}
            >
              <AppText style={styles.secondaryButtonText}>Scan your first list</AppText>
            </Pressable>
          </View>
        </View>
      ) : (
        <View style={styles.list}>
          {items.map((item) => {
            const title =
              item.venue_name || item.list_title || item.source_label || "Saved scan";
            const elapsed = renderNow - new Date(item.scanned_at).getTime();
            const daysAgo = Math.floor(elapsed / (1000 * 60 * 60 * 24));
            const timeLabel =
              daysAgo === 0
                ? "today"
                : daysAgo === 1
                ? "1 day ago"
                : `${daysAgo} days ago`;
            const meta = `${item.wine_count} wine${item.wine_count === 1 ? "" : "s"} parsed · ${timeLabel}`;
            const confidence =
              typeof item.overall_confidence === "number"
                ? `${item.overall_confidence}% confidence`
                : null;

            return (
              <Pressable
                key={item.scan_id}
                style={styles.scanCard}
                onPress={() =>
                  router.push({
                    pathname: "/(app)/list-scan/results",
                    params: { scanId: item.scan_id },
                  })
                }
              >
                <View style={styles.scanCardTopRow}>
                  <View style={styles.sourceBadge}>
                    <AppText style={styles.sourceBadgeText}>
                      {formatSourceTypeLabel(item.source_type)}
                    </AppText>
                  </View>
                  <AppText style={styles.scanTime}>{timeLabel}</AppText>
                </View>

                <AppText numberOfLines={2} style={styles.scanTitle}>
                  {title}
                </AppText>
                <AppText numberOfLines={1} style={styles.scanMeta}>
                  {meta}
                  {confidence ? ` · ${confidence}` : ""}
                </AppText>
              </Pressable>
            );
          })}
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingHorizontal: 20,
    paddingTop: 18,
    paddingBottom: 28,
    gap: 18,
    backgroundColor: colors.screenBg,
    minHeight: "100%",
  },
  header: {
    gap: 8,
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
    fontSize: 28,
    lineHeight: 34,
    fontWeight: "700",
  },
  subtitle: {
    color: colors.textSecondary,
    fontSize: 14,
    lineHeight: 21,
  },
  actionRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    marginTop: 4,
  },
  primaryButton: {
    borderRadius: 999,
    backgroundColor: colors.accentPrimary,
    paddingHorizontal: 18,
    paddingVertical: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  primaryButtonCompact: {
    flexGrow: 1,
  },
  primaryButtonText: {
    color: colors.screenBg,
    fontSize: 15,
    fontWeight: "700",
  },
  secondaryButton: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceTinted,
    paddingHorizontal: 16,
    paddingVertical: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  secondaryButtonText: {
    color: colors.textPrimary,
    fontSize: 14,
    fontWeight: "700",
  },
  infoCard: {
    borderRadius: 24,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.border,
    padding: 18,
    gap: 14,
  },
  infoText: {
    color: colors.textSecondary,
    fontSize: 14,
    lineHeight: 20,
  },
  list: {
    gap: 10,
  },
  scanCard: {
    borderRadius: 24,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceTinted,
    padding: 16,
    gap: 8,
  },
  scanCardTopRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  sourceBadge: {
    alignSelf: "flex-start",
    borderRadius: 999,
    backgroundColor: colors.border,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  sourceBadgeText: {
    color: colors.textSecondary,
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 1.2,
    textTransform: "uppercase",
  },
  scanTime: {
    color: colors.textTertiary,
    fontSize: 11,
    fontWeight: "600",
  },
  scanTitle: {
    color: colors.textPrimary,
    fontSize: 17,
    lineHeight: 23,
    fontWeight: "700",
  },
  scanMeta: {
    color: colors.textSecondary,
    fontSize: 12,
    lineHeight: 18,
  },
});

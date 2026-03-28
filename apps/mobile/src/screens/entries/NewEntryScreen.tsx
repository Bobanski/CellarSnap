import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  Pressable,
  StyleSheet,
  View,
} from "react-native";
import { router } from "expo-router";
import { AppText } from "@/src/components/AppText";
import { colors } from "@/src/lib/theme";
import { fonts } from "@/src/lib/typography";
import { fetchCellarEntries, drinkFromCellar } from "@/src/lib/api/cellar";
import type { CellarEntry } from "@cellarsnap/shared";
import NewEntryScreenContainer from "@/src/screens/entries/NewEntryScreenContainer";

export default function NewEntryScreen() {
  const [mode, setMode] = useState<"choose" | "new" | "cellar">("choose");
  const [cellarEntries, setCellarEntries] = useState<CellarEntry[]>([]);
  const [loadingCellar, setLoadingCellar] = useState(true);
  const [drinking, setDrinking] = useState(false);

  useEffect(() => {
    (async () => {
      const result = await fetchCellarEntries();
      if (result.ok) {
        setCellarEntries(result.entries.filter((e) => (e.cellar_quantity ?? 0) > 0));
      }
      setLoadingCellar(false);
    })();
  }, []);

  // If no cellar wines, skip the choice and go straight to new entry
  useEffect(() => {
    if (!loadingCellar && cellarEntries.length === 0) {
      setMode("new");
    }
  }, [loadingCellar, cellarEntries.length]);

  const handleDrink = useCallback(async (entry: CellarEntry) => {
    Alert.alert(
      "Drink this wine?",
      `${entry.wine_name ?? "This wine"}${entry.vintage ? ` ${entry.vintage}` : ""}`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Drink it",
          onPress: async () => {
            setDrinking(true);
            const result = await drinkFromCellar(entry.id);
            setDrinking(false);
            if (result.ok) {
              router.replace(`/(app)/entries/${result.consumedEntryId}`);
            } else {
              Alert.alert("Error", result.errorMessage);
            }
          },
        },
      ]
    );
  }, []);

  if (mode === "new") {
    return <NewEntryScreenContainer />;
  }

  if (loadingCellar) {
    return (
      <View style={[cs.screen, cs.center]}>
        <ActivityIndicator color={colors.accentSecondary} size="large" />
      </View>
    );
  }

  // Choice screen
  if (mode === "choose") {
    return (
      <View style={cs.screen}>
        <View style={cs.choiceContent}>
          <AppText style={cs.choiceTitle}>What are you logging?</AppText>

          <Pressable style={cs.choiceCard} onPress={() => setMode("new")}>
            <View style={cs.choiceCardIcon}>
              <AppText style={cs.choiceCardIconText}>+</AppText>
            </View>
            <View style={cs.choiceCardText}>
              <AppText style={cs.choiceCardTitle}>Log a new wine</AppText>
              <AppText style={cs.choiceCardSubtitle}>
                Scan a label or enter details manually
              </AppText>
            </View>
          </Pressable>

          <Pressable style={cs.choiceCard} onPress={() => setMode("cellar")}>
            <View style={[cs.choiceCardIcon, cs.choiceCardIconAlt]}>
              <AppText style={cs.choiceCardIconText}>🍷</AppText>
            </View>
            <View style={cs.choiceCardText}>
              <AppText style={cs.choiceCardTitle}>Drink from my cellar</AppText>
              <AppText style={cs.choiceCardSubtitle}>
                {cellarEntries.length} wine{cellarEntries.length !== 1 ? "s" : ""} in your cellar
              </AppText>
            </View>
          </Pressable>

          <Pressable style={cs.skipLink} onPress={() => router.back()}>
            <AppText style={cs.skipLinkText}>Cancel</AppText>
          </Pressable>
        </View>
      </View>
    );
  }

  // Cellar picker
  return (
    <View style={cs.screen}>
      <View style={cs.cellarHeader}>
        <Pressable onPress={() => setMode("choose")} style={cs.backBtn}>
          <AppText style={cs.backBtnText}>{"\u2190"}</AppText>
        </Pressable>
        <View>
          <AppText style={cs.cellarTitle}>Pick a wine</AppText>
          <AppText style={cs.cellarSubtitle}>Select a bottle from your cellar to log</AppText>
        </View>
      </View>

      {drinking && (
        <View style={cs.drinkingOverlay}>
          <ActivityIndicator color={colors.accentSecondary} size="large" />
          <AppText style={cs.drinkingText}>Opening bottle...</AppText>
        </View>
      )}

      <FlatList
        data={cellarEntries}
        keyExtractor={(item) => item.id}
        contentContainerStyle={cs.cellarList}
        renderItem={({ item }) => (
          <Pressable style={cs.cellarItem} onPress={() => handleDrink(item)}>
            {item.label_image_url ? (
              <Image
                source={{ uri: item.label_image_url }}
                style={cs.cellarThumb}
                resizeMode="cover"
              />
            ) : (
              <View style={[cs.cellarThumb, cs.cellarThumbFallback]}>
                <AppText style={cs.cellarThumbFallbackText}>🍷</AppText>
              </View>
            )}
            <View style={cs.cellarItemInfo}>
              <AppText style={cs.cellarItemName} numberOfLines={1}>
                {item.wine_name ?? "Unknown wine"}
              </AppText>
              <AppText style={cs.cellarItemMeta} numberOfLines={1}>
                {[item.producer, item.vintage, item.region].filter(Boolean).join(" · ")}
              </AppText>
            </View>
            <View style={cs.cellarItemRight}>
              <AppText style={cs.cellarItemQty}>
                {item.cellar_quantity ?? 1}
              </AppText>
            </View>
          </Pressable>
        )}
      />
    </View>
  );
}

const cs = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.screenBg },
  center: { alignItems: "center", justifyContent: "center" },

  // Choice screen
  choiceContent: {
    flex: 1,
    justifyContent: "center",
    paddingHorizontal: 24,
    gap: 14,
  },
  choiceTitle: {
    color: colors.textPrimary,
    fontFamily: fonts.serif.light,
    fontSize: 26,
    textAlign: "center",
    marginBottom: 8,
  },
  choiceCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfacePrimary,
    padding: 16,
  },
  choiceCardIcon: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: colors.accentPrimary,
    alignItems: "center",
    justifyContent: "center",
  },
  choiceCardIconAlt: {
    backgroundColor: colors.surfaceRaised,
  },
  choiceCardIconText: {
    fontSize: 20,
    color: colors.textOnAccent,
  },
  choiceCardText: { flex: 1, gap: 2 },
  choiceCardTitle: {
    color: colors.textPrimary,
    fontSize: 15,
    fontWeight: "700",
  },
  choiceCardSubtitle: {
    color: colors.textSecondary,
    fontSize: 12,
  },
  skipLink: { alignSelf: "center", paddingVertical: 10 },
  skipLinkText: { color: colors.textTertiary, fontSize: 13, fontWeight: "600" },

  // Cellar picker
  cellarHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 18,
    paddingTop: 16,
    paddingBottom: 10,
  },
  backBtn: {
    width: 34,
    height: 34,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
  },
  backBtnText: { color: colors.textPrimary, fontSize: 16, fontWeight: "700" },
  cellarTitle: {
    color: colors.textPrimary,
    fontFamily: fonts.serif.light,
    fontSize: 22,
  },
  cellarSubtitle: {
    color: colors.textSecondary,
    fontSize: 12,
  },
  cellarList: { paddingHorizontal: 18, paddingBottom: 40, gap: 8 },
  cellarItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfacePrimary,
    padding: 10,
  },
  cellarThumb: {
    width: 48,
    height: 48,
    borderRadius: 8,
    backgroundColor: colors.surfaceHover,
  },
  cellarThumbFallback: {
    alignItems: "center",
    justifyContent: "center",
  },
  cellarThumbFallbackText: { fontSize: 20 },
  cellarItemInfo: { flex: 1, gap: 2 },
  cellarItemName: {
    color: colors.textPrimary,
    fontSize: 14,
    fontWeight: "700",
  },
  cellarItemMeta: {
    color: colors.textSecondary,
    fontSize: 11,
  },
  cellarItemRight: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceMuted,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  cellarItemQty: {
    color: colors.textTertiary,
    fontSize: 11,
    fontWeight: "700",
  },
  drinkingOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 10,
    backgroundColor: colors.overlay,
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
  },
  drinkingText: {
    color: colors.textPrimary,
    fontSize: 14,
    fontWeight: "600",
  },
});

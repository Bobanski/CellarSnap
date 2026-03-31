import React from "react";
import { Pressable, ScrollView, StyleSheet, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { AppTopBar } from "@/src/components/AppTopBar";
import { AppText } from "@/src/components/AppText";
import BadgeIcon from "@/src/components/BadgeIcon";
import { colors } from "@/src/lib/theme";
import { fonts } from "@/src/lib/typography";
import { getBadgeById, BADGE_TIER_COLORS } from "@cellarsnap/shared";

const TIER_LABEL: Record<string, string> = {
  nouveau: "Nouveau",
  vieilles_vignes: "Vieilles Vignes",
  reserve: "Réserve",
  mise_en_cave: "Mise en Cave",
};

export default function BadgeDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const badge = id ? getBadgeById(id) : undefined;

  if (!badge) {
    return (
      <View style={s.container}>
        <ScrollView contentContainerStyle={s.scrollContent}>
          <AppTopBar />
          <View style={s.empty}>
            <AppText style={s.emptyText}>Badge not found.</AppText>
          </View>
        </ScrollView>
      </View>
    );
  }

  const tierColor = BADGE_TIER_COLORS[badge.tier] ?? colors.accentSecondary;

  return (
    <View style={s.container}>
      <ScrollView contentContainerStyle={s.scrollContent}>
        <AppTopBar />

        {/* Back */}
        <Pressable onPress={() => router.back()} style={s.backBtn}>
          <AppText style={s.backText}>&larr; All Badges</AppText>
        </Pressable>

        {/* Badge */}
        <View style={s.center}>
          <BadgeIcon
            shape={badge.shape}
            color={badge.color}
            accent={badge.accent}
            tier={badge.tier}
            size={120}
          />

          <AppText style={s.name}>{badge.name}</AppText>

          <View style={[s.tierPill, { backgroundColor: tierColor + "22" }]}>
            <AppText style={[s.tierText, { color: tierColor }]}>
              {TIER_LABEL[badge.tier] ?? badge.tier}
            </AppText>
          </View>

          <AppText style={s.description}>{badge.description}</AppText>
        </View>
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.screenBg,
  },
  scrollContent: {
    paddingHorizontal: 18,
    paddingTop: 16,
    paddingBottom: 40,
  },
  backBtn: {
    marginBottom: 24,
  },
  backText: {
    fontSize: 11,
    fontWeight: "500",
    letterSpacing: 1,
    textTransform: "uppercase",
    color: colors.accentSecondary,
  },
  center: {
    alignItems: "center",
    gap: 16,
  },
  name: {
    fontFamily: fonts.serif.regular,
    fontSize: 24,
    color: colors.textPrimary,
    textAlign: "center",
    marginTop: 8,
  },
  tierPill: {
    paddingHorizontal: 16,
    paddingVertical: 5,
    borderRadius: 20,
  },
  tierText: {
    fontSize: 10,
    fontWeight: "600",
    letterSpacing: 2,
    textTransform: "uppercase",
  },
  description: {
    fontSize: 14,
    color: colors.textSecondary,
    textAlign: "center",
    lineHeight: 21,
    maxWidth: 300,
    marginTop: 4,
  },
  empty: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 100,
  },
  emptyText: {
    fontSize: 13,
    color: colors.textTertiary,
  },
});

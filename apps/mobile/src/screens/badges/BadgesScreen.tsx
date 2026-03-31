import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from "react-native";
import { router } from "expo-router";
import { AppText } from "@/src/components/AppText";
import { AppTopBar } from "@/src/components/AppTopBar";
import BadgeIcon from "@/src/components/BadgeIcon";
import { getAccessTokenForApi, getWebApiBaseUrl } from "@/src/lib/api/webApi";
import { colors } from "@/src/lib/theme";
import { fonts } from "@/src/lib/typography";
import {
  BADGE_DEFINITIONS,
  type BadgeCategory,
  type BadgeDefinition,
} from "@cellarsnap/shared";

type EarnedRecord = {
  id: string;
  earned_at: string;
};

type BadgesResponse = {
  badges: Array<EarnedRecord & { name: string; category: string; tier: string; color: string; accent: string; shape: string; description: string }>;
  featured_badge_id: string | null;
  total_earned: number;
};

const CATEGORY_TABS: Array<{ label: string; value: BadgeCategory | "all" }> = [
  { label: "All", value: "all" },
  { label: "Taste", value: "taste" },
  { label: "Region", value: "region" },
  { label: "Milestone", value: "milestone" },
  { label: "Social", value: "social" },
];

const CATEGORY_DOT_COLOR: Record<string, string> = {
  all: "#7B1D3A",
  taste: "#C4607A",
  region: "#4A3060",
  milestone: "#C9A84C",
  social: "#7B1D3A",
};

const TIER_DOT: Record<string, string> = {
  nouveau: "#C4607A",
  vieilles_vignes: "#7B1D3A",
  reserve: "#C9A84C",
  mise_en_cave: "#2C1A0E",
};

export default function BadgesScreen() {
  const [earnedSet, setEarnedSet] = useState<Set<string>>(new Set());
  const [featuredId, setFeaturedId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeCategory, setActiveCategory] = useState<BadgeCategory | "all">("all");

  const fetchBadges = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const token = await getAccessTokenForApi();
      const base = getWebApiBaseUrl();
      const res = await fetch(`${base}/api/badges`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error("Failed to fetch badges");
      const data: BadgesResponse = await res.json();
      setEarnedSet(new Set(data.badges.map((b) => b.id)));
      setFeaturedId(data.featured_badge_id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchBadges();
  }, [fetchBadges]);

  const setFeaturedBadge = useCallback(async (badgeId: string) => {
    const prev = featuredId;
    setFeaturedId(badgeId);
    try {
      const token = await getAccessTokenForApi();
      const base = getWebApiBaseUrl();
      const res = await fetch(`${base}/api/badges/featured`, {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ badge_id: badgeId }),
      });
      if (!res.ok) throw new Error("Failed");
    } catch {
      setFeaturedId(prev);
    }
  }, [featuredId]);

  const filtered = (
    activeCategory === "all"
      ? [...BADGE_DEFINITIONS]
      : BADGE_DEFINITIONS.filter((b) => b.category === activeCategory)
  ).sort((a, b) => {
    const aEarned = earnedSet.has(a.id) ? 0 : 1;
    const bEarned = earnedSet.has(b.id) ? 0 : 1;
    return aEarned - bEarned;
  });

  return (
    <View style={s.container}>
      <ScrollView contentContainerStyle={s.scrollContent}>
        <AppTopBar />
        <AppText style={s.title}>Badges</AppText>
        <AppText style={s.subtitle}>
          {earnedSet.size} of {BADGE_DEFINITIONS.length} earned
        </AppText>

        {/* Category tabs */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.tabRow}>
          {CATEGORY_TABS.map((tab) => (
            <Pressable
              key={tab.value}
              onPress={() => setActiveCategory(tab.value)}
              style={[
                s.tab,
                activeCategory === tab.value && {
                  backgroundColor: CATEGORY_DOT_COLOR[tab.value] ?? colors.accentPrimary,
                },
              ]}
            >
              <AppText
                style={[
                  s.tabText,
                  activeCategory === tab.value && s.tabTextActive,
                ]}
              >
                {tab.label}
              </AppText>
            </Pressable>
          ))}
        </ScrollView>

        {/* Loading / Error */}
        {isLoading && (
          <ActivityIndicator color={colors.accentSecondary} style={s.loader} />
        )}
        {error && <AppText style={s.error}>{error}</AppText>}

        {/* Badge grid */}
        {!isLoading && (
          <View style={s.grid}>
            {filtered.map((badge) => {
              const earned = earnedSet.has(badge.id);
              const isFeatured = featuredId === badge.id;
              if (!earned) {
                return (
                  <View key={badge.id} style={s.card}>
                    <BadgeIcon
                      shape={badge.shape}
                      color={badge.color}
                      accent={badge.accent}
                      tier={badge.tier}
                      size={48}
                      locked
                    />
                    <AppText style={s.lockedName}>???</AppText>
                    <View
                      style={[
                        s.categoryDot,
                        { backgroundColor: CATEGORY_DOT_COLOR[badge.category] ?? colors.textTertiary },
                      ]}
                    />
                  </View>
                );
              }

              return (
                <Pressable
                  key={badge.id}
                  style={[
                    s.card,
                    s.earnedCard,
                    isFeatured && s.featuredCard,
                  ]}
                  onPress={() =>
                    router.push(`/(app)/badges/${badge.id}` as Parameters<typeof router.push>[0])
                  }
                >
                  <BadgeIcon
                    shape={badge.shape}
                    color={badge.color}
                    accent={badge.accent}
                    tier={badge.tier}
                    size={48}
                  />
                  <AppText style={s.badgeName} numberOfLines={2}>
                    {badge.name}
                  </AppText>
                  <View
                    style={[
                      s.tierDot,
                      { backgroundColor: TIER_DOT[badge.tier] ?? colors.accentSecondary },
                    ]}
                  />
                </Pressable>
              );
            })}
          </View>
        )}

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
    paddingBottom: 28,
    gap: 14,
  },
  title: {
    fontFamily: fonts.serif.regular,
    fontSize: 24,
    color: colors.textPrimary,
    marginTop: 8,
  },
  subtitle: {
    fontSize: 13,
    color: colors.textSecondary,
    marginTop: 4,
    marginBottom: 16,
  },
  tabRow: {
    flexDirection: "row",
    marginBottom: 16,
  },
  tab: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: colors.surfaceRaised,
    marginRight: 8,
  },
  // tabActive color is set inline via CATEGORY_DOT_COLOR
  tabText: {
    fontSize: 12,
    fontWeight: "500",
    color: colors.textSecondary,
    letterSpacing: 0.5,
  },
  tabTextActive: {
    color: colors.textOnAccent,
  },
  loader: {
    marginTop: 40,
  },
  error: {
    color: colors.error,
    fontSize: 13,
    textAlign: "center",
    marginTop: 40,
  },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  card: {
    width: "30%",
    alignItems: "center",
    padding: 12,
    borderRadius: 12,
    backgroundColor: colors.surfaceRaised,
    gap: 6,
  },
  earnedCard: {
    backgroundColor: colors.surfaceRaised,
  },
  featuredCard: {
    borderWidth: 1.5,
    borderColor: colors.accentGold,
  },
  lockedName: {
    fontSize: 11,
    fontWeight: "500",
    color: colors.textTertiary,
  },
  categoryDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  badgeName: {
    fontSize: 10,
    fontWeight: "600",
    color: colors.textPrimary,
    textAlign: "center",
    lineHeight: 13,
  },
  tierDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
});

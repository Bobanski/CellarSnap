import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { toExploreSlug } from "@cellarsnap/shared";
import { AppText } from "@/src/components/AppText";
import { colors } from "@/src/lib/theme";
import { fonts } from "@/src/lib/typography";
import {
  fetchExploreProfile,
  type ExploreProfileResponse,
  type ExploreProfileType,
} from "@/src/lib/api/explore";

// ─── Sensory bar (reused from palate) ───────────────────────

function SensoryBar({ label, value }: { label: string; value: number }) {
  const pct = Math.max(0, Math.min(100, (value / 5) * 100));
  const isHigh = value >= 3.8;
  return (
    <View style={bs.row}>
      <View style={bs.labelRow}>
        <AppText style={bs.label}>{label}</AppText>
        <AppText style={[bs.value, isHigh && bs.valueHigh]}>
          {value.toFixed(1)}
        </AppText>
      </View>
      <View style={bs.track}>
        <View style={[bs.fill, isHigh && bs.fillHigh, { width: `${pct}%` }]} />
      </View>
    </View>
  );
}

const bs = StyleSheet.create({
  row: { gap: 3 },
  labelRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  label: { color: colors.textSecondary, fontSize: 12 },
  value: { color: colors.textPrimary, fontSize: 12, fontWeight: "700" },
  valueHigh: { color: colors.accentSecondary },
  track: { height: 5, borderRadius: 3, backgroundColor: colors.surfaceHover },
  fill: {
    height: "100%",
    borderRadius: 3,
    backgroundColor: colors.accentPrimary,
  },
  fillHigh: { backgroundColor: colors.accentSecondary },
});

// ─── Chip / pill ────────────────────────────────────────────

function Chip({
  label,
  onPress,
}: {
  label: string;
  onPress?: () => void;
}) {
  const inner = (
    <View style={s.chip}>
      <AppText style={s.chipText}>{label}</AppText>
    </View>
  );
  if (onPress) {
    return <Pressable onPress={onPress}>{inner}</Pressable>;
  }
  return inner;
}

// ─── Info card ──────────────────────────────────────────────

function InfoCard({
  label,
  value,
}: {
  label: string;
  value: string | string[] | undefined;
}) {
  if (!value || (Array.isArray(value) && value.length === 0)) return null;
  const display = Array.isArray(value) ? value.join(", ") : value;
  return (
    <View style={s.infoCard}>
      <AppText style={s.infoCardLabel}>{label}</AppText>
      <AppText style={s.infoCardValue}>{display}</AppText>
    </View>
  );
}

// ─── Section wrapper ────────────────────────────────────────

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <View style={s.section}>
      <AppText style={s.sectionTitle}>{title}</AppText>
      {children}
    </View>
  );
}

// ─── Type badge label ───────────────────────────────────────

function typeBadgeLabel(type: ExploreProfileType): string {
  switch (type) {
    case "grape":
      return "GRAPE VARIETY";
    case "region":
      return "WINE REGION";
    case "producer":
      return "PRODUCER";
    default:
      return type.toUpperCase();
  }
}

// ─── Main screen ────────────────────────────────────────────

export default function ExploreProfileScreen() {
  const { type, slug } = useLocalSearchParams<{
    type: string;
    slug: string;
  }>();
  const router = useRouter();
  const [data, setData] = useState<ExploreProfileResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [heroFailed, setHeroFailed] = useState(false);

  useEffect(() => {
    if (!type || !slug) return;
    setLoading(true);
    setError(null);
    setData(null);
    setHeroFailed(false);
    (async () => {
      const result = await fetchExploreProfile(type, slug);
      if (result.ok) {
        setData(result.data);
      } else {
        setError(result.errorMessage);
      }
      setLoading(false);
    })();
  }, [type, slug]);

  if (loading) {
    return (
      <View style={[s.screen, s.center]}>
        <ActivityIndicator color={colors.accentSecondary} size="large" />
      </View>
    );
  }

  if (error || !data) {
    return (
      <View style={[s.screen, s.center, { paddingHorizontal: 24, gap: 12 }]}>
        <AppText style={s.errorTitle}>Unable to load profile</AppText>
        <AppText style={s.errorSubtitle}>
          {error ?? "Something went wrong."}
        </AppText>
        <Pressable style={s.backBtn} onPress={() => router.back()}>
          <AppText style={s.backBtnText}>Go back</AppText>
        </Pressable>
      </View>
    );
  }

  const { profile, personal_stats } = data;
  const c = profile.content;
  const profileType = profile.type as ExploreProfileType;

  // Build "At a Glance" cards based on type
  const glanceCards: { label: string; value: string | string[] | undefined }[] =
    [];
  if (profileType === "grape") {
    if (c.body) glanceCards.push({ label: "Body", value: c.body });
    if (c.acidity) glanceCards.push({ label: "Acidity", value: c.acidity });
    if (c.tannin) glanceCards.push({ label: "Tannin", value: c.tannin });
    if (c.key_regions?.length)
      glanceCards.push({ label: "Key Regions", value: c.key_regions });
  } else if (profileType === "region") {
    if (c.climate) glanceCards.push({ label: "Climate", value: c.climate });
    if (c.key_grapes?.length)
      glanceCards.push({ label: "Key Grapes", value: c.key_grapes });
    if (c.classification)
      glanceCards.push({ label: "Classification", value: c.classification });
  } else if (profileType === "producer") {
    if (c.key_regions?.length)
      glanceCards.push({ label: "Region", value: c.key_regions });
    if (c.founded) glanceCards.push({ label: "Founded", value: c.founded });
    if (c.classification)
      glanceCards.push({ label: "Classification", value: c.classification });
  }

  // Story text
  const storyParts: string[] = [];
  if (c.origin) storyParts.push(c.origin);
  if (c.characteristics) storyParts.push(c.characteristics);
  if (c.style) storyParts.push(c.style);

  // Related items
  const relatedItems: { name: string; type: ExploreProfileType }[] = [];
  if (c.related_grapes) {
    for (const name of c.related_grapes) {
      relatedItems.push({ name, type: "grape" });
    }
  }
  if (c.related_regions) {
    for (const name of c.related_regions) {
      relatedItems.push({ name, type: "region" });
    }
  }
  if (c.related_producers) {
    for (const name of c.related_producers) {
      relatedItems.push({ name, type: "producer" });
    }
  }

  // Sensory data
  const sensoryEntries = profile.sensory_data
    ? Object.entries(profile.sensory_data).filter(
        ([, v]) => typeof v === "number" && v > 0,
      )
    : [];

  const hasHeroImage = !!profile.hero_image_url && !heroFailed;

  return (
    <View style={s.screen}>
      <ScrollView
        contentContainerStyle={s.scroll}
        showsVerticalScrollIndicator={false}
      >
        {/* ── Hero ───────────────────────────────────────── */}
        <View style={s.hero}>
          {hasHeroImage ? (
            <Image
              source={{ uri: profile.hero_image_url }}
              style={s.heroImage}
              resizeMode="cover"
              onError={() => setHeroFailed(true)}
            />
          ) : null}
          <View
            style={[s.heroOverlay, !hasHeroImage && s.heroOverlayNoImage]}
          />

          {/* Back button */}
          <Pressable
            onPress={() => router.back()}
            style={s.heroBackBtn}
          >
            <AppText style={s.heroBackBtnText}>{"\u2190"}</AppText>
          </Pressable>

          {/* Content at bottom of hero */}
          <View style={s.heroContent}>
            <View style={s.typeBadge}>
              <AppText style={s.typeBadgeText}>
                {typeBadgeLabel(profileType)}
              </AppText>
            </View>
            <AppText style={s.heroTitle}>{profile.display_name}</AppText>
            {c.tagline ? (
              <AppText style={s.heroTagline}>{c.tagline}</AppText>
            ) : null}
          </View>
        </View>

        {/* ── At a Glance ────────────────────────────────── */}
        {glanceCards.length > 0 ? (
          <Section title="AT A GLANCE">
            <View style={s.glanceRow}>
              {glanceCards.map((card) => (
                <InfoCard
                  key={card.label}
                  label={card.label}
                  value={card.value}
                />
              ))}
            </View>
          </Section>
        ) : null}

        {/* ── Your History ───────────────────────────────── */}
        {personal_stats.entry_count > 0 ? (
          <View style={s.card}>
            <AppText style={s.cardLabel}>YOUR HISTORY</AppText>
            <AppText style={s.historyText}>
              You've logged{" "}
              <AppText style={s.historyBold}>
                {personal_stats.entry_count}{" "}
                {personal_stats.entry_count === 1 ? "wine" : "wines"}
              </AppText>
              {personal_stats.avg_rating > 0
                ? ` with an average rating of ${personal_stats.avg_rating.toFixed(1)}`
                : ""}
            </AppText>
          </View>
        ) : null}

        {/* ── The Story ──────────────────────────────────── */}
        {storyParts.length > 0 || c.fun_fact ? (
          <Section title="THE STORY">
            {storyParts.length > 0 ? (
              <AppText style={s.storyText}>{storyParts.join("\n\n")}</AppText>
            ) : null}
            {c.fun_fact ? (
              <View style={s.funFactCard}>
                <AppText style={s.funFactLabel}>FUN FACT</AppText>
                <AppText style={s.funFactText}>{c.fun_fact}</AppText>
              </View>
            ) : null}
          </Section>
        ) : null}

        {/* ── Sensory Profile ────────────────────────────── */}
        {sensoryEntries.length > 0 ? (
          <Section title="SENSORY PROFILE">
            <View style={s.card}>
              <View style={{ gap: 8 }}>
                {sensoryEntries.map(([key, value]) => (
                  <SensoryBar
                    key={key}
                    label={key.charAt(0).toUpperCase() + key.slice(1)}
                    value={value}
                  />
                ))}
              </View>
            </View>
          </Section>
        ) : null}

        {/* ── Food Pairings ──────────────────────────────── */}
        {c.food_pairings && c.food_pairings.length > 0 ? (
          <Section title="FOOD PAIRINGS">
            <View style={s.chipRow}>
              {c.food_pairings.map((item) => (
                <Chip key={item} label={item} />
              ))}
            </View>
          </Section>
        ) : null}

        {/* ── Aging Potential (grape) ────────────────────── */}
        {c.aging_potential ? (
          <Section title="AGING POTENTIAL">
            <AppText style={s.storyText}>{c.aging_potential}</AppText>
          </Section>
        ) : null}

        {/* ── Key Wines (producer) ───────────────────────── */}
        {c.key_wines && c.key_wines.length > 0 ? (
          <Section title="KEY WINES">
            <View style={s.chipRow}>
              {c.key_wines.map((item) => (
                <Chip key={item} label={item} />
              ))}
            </View>
          </Section>
        ) : null}

        {/* ── Appellations (region) ──────────────────────── */}
        {c.appellations && c.appellations.length > 0 ? (
          <Section title="APPELLATIONS">
            <View style={s.chipRow}>
              {c.appellations.map((item) => (
                <Chip
                  key={item}
                  label={item}
                  onPress={() =>
                    router.push(
                      `/(app)/explore/region/${toExploreSlug(item)}`,
                    )
                  }
                />
              ))}
            </View>
          </Section>
        ) : null}

        {/* ── Related ────────────────────────────────────── */}
        {relatedItems.length > 0 ? (
          <Section title="RELATED">
            <View style={{ gap: 6 }}>
              {relatedItems.map((item) => (
                <Pressable
                  key={`${item.type}-${item.name}`}
                  style={s.relatedItem}
                  onPress={() =>
                    router.push(
                      `/(app)/explore/${item.type}/${toExploreSlug(item.name)}`,
                    )
                  }
                >
                  <View style={s.relatedBadge}>
                    <AppText style={s.relatedBadgeText}>
                      {item.type.charAt(0).toUpperCase()}
                    </AppText>
                  </View>
                  <AppText style={s.relatedName}>{item.name}</AppText>
                  <AppText style={s.relatedArrow}>{"\u2192"}</AppText>
                </Pressable>
              ))}
            </View>
          </Section>
        ) : null}

        {/* Attribution footer */}
        {profile.hero_image_attribution ? (
          <AppText style={s.attribution}>
            Photo by {profile.hero_image_attribution.photographer}
          </AppText>
        ) : null}
      </ScrollView>
    </View>
  );
}

// ─── Styles ─────────────────────────────────────────────────

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.screenBg },
  center: { alignItems: "center", justifyContent: "center" },
  scroll: { paddingBottom: 48 },

  // Hero
  hero: {
    height: 250,
    position: "relative",
    justifyContent: "flex-end",
    overflow: "hidden",
  },
  heroImage: {
    ...StyleSheet.absoluteFillObject,
    width: "100%",
    height: "100%",
  },
  heroOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(12,8,16,0.55)",
  },
  heroOverlayNoImage: {
    backgroundColor: colors.surfacePrimary,
  },
  heroBackBtn: {
    position: "absolute",
    top: 54,
    left: 16,
    width: 34,
    height: 34,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(240,236,228,0.3)",
    backgroundColor: "rgba(12,8,16,0.4)",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 10,
  },
  heroBackBtnText: {
    color: colors.textPrimary,
    fontSize: 16,
    fontWeight: "700",
  },
  heroContent: {
    paddingHorizontal: 18,
    paddingBottom: 18,
    gap: 4,
  },
  typeBadge: {
    alignSelf: "flex-start",
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.accentRose,
    backgroundColor: colors.accentSoft,
    paddingHorizontal: 10,
    paddingVertical: 3,
    marginBottom: 4,
  },
  typeBadgeText: {
    color: colors.accentSecondary,
    fontSize: 9,
    fontWeight: "700",
    letterSpacing: 2,
  },
  heroTitle: {
    color: colors.textPrimary,
    fontFamily: fonts.serif.light,
    fontSize: 28,
    lineHeight: 34,
  },
  heroTagline: {
    color: colors.textSecondary,
    fontSize: 13,
    lineHeight: 18,
  },

  // Section
  section: {
    paddingHorizontal: 18,
    gap: 10,
  },
  sectionTitle: {
    color: colors.textTertiary,
    fontSize: 9,
    fontWeight: "700",
    letterSpacing: 2,
    textTransform: "uppercase",
    marginTop: 18,
  },

  // Card
  card: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfacePrimary,
    padding: 14,
    gap: 8,
    marginHorizontal: 18,
    marginTop: 14,
  },
  cardLabel: {
    color: colors.textTertiary,
    fontSize: 9,
    fontWeight: "700",
    letterSpacing: 2,
    textTransform: "uppercase",
  },

  // At a Glance
  glanceRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  infoCard: {
    flex: 1,
    minWidth: 100,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfacePrimary,
    padding: 14,
    gap: 4,
  },
  infoCardLabel: {
    color: colors.textTertiary,
    fontSize: 9,
    fontWeight: "700",
    letterSpacing: 2,
    textTransform: "uppercase",
  },
  infoCardValue: {
    color: colors.textPrimary,
    fontSize: 13,
    lineHeight: 18,
  },

  // Your History
  historyText: {
    color: colors.textSecondary,
    fontSize: 13,
    lineHeight: 18,
  },
  historyBold: {
    color: colors.textPrimary,
    fontWeight: "700",
  },

  // Story
  storyText: {
    color: colors.textSecondary,
    fontSize: 13,
    lineHeight: 20,
  },
  funFactCard: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.accentRose,
    backgroundColor: colors.accentSoft,
    padding: 14,
    gap: 4,
    marginTop: 8,
  },
  funFactLabel: {
    color: colors.accentSecondary,
    fontSize: 9,
    fontWeight: "700",
    letterSpacing: 2,
  },
  funFactText: {
    color: colors.textPrimary,
    fontSize: 13,
    lineHeight: 18,
  },

  // Chips
  chipRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
  },
  chip: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfacePrimary,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  chipText: {
    color: colors.textSecondary,
    fontSize: 12,
  },

  // Related
  relatedItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfacePrimary,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  relatedBadge: {
    width: 24,
    height: 24,
    borderRadius: 999,
    backgroundColor: colors.accentSoft,
    alignItems: "center",
    justifyContent: "center",
  },
  relatedBadgeText: {
    color: colors.accentSecondary,
    fontSize: 11,
    fontWeight: "700",
  },
  relatedName: {
    flex: 1,
    color: colors.textPrimary,
    fontSize: 13,
    fontWeight: "600",
  },
  relatedArrow: {
    color: colors.textTertiary,
    fontSize: 14,
  },

  // Attribution
  attribution: {
    color: colors.textTertiary,
    fontSize: 10,
    textAlign: "center",
    paddingTop: 16,
    paddingHorizontal: 18,
  },

  // Error state
  errorTitle: {
    color: colors.textPrimary,
    fontFamily: fonts.serif.light,
    fontSize: 20,
    textAlign: "center",
  },
  errorSubtitle: {
    color: colors.textSecondary,
    fontSize: 13,
    textAlign: "center",
    lineHeight: 18,
  },
  backBtn: { paddingVertical: 8 },
  backBtnText: {
    color: colors.textTertiary,
    fontSize: 13,
    fontWeight: "600",
  },
});

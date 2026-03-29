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
import { toExploreSlug, EDUCATION_PAGE_ACCENTS, EDUCATION_BG_PRIMARY, EDUCATION_BG_ALT } from "@cellarsnap/shared";
import { AppText } from "@/src/components/AppText";
import { colors } from "@/src/lib/theme";
import { fonts } from "@/src/lib/typography";
import FlavorRadar from "@/src/components/explore/FlavorRadar";
import {
  fetchExploreProfile,
  type ExploreProfileResponse,
  type ExploreProfileType,
} from "@/src/lib/api/explore";

// ─── Chip / pill ────────────────────────────────────────────

function Chip({
  label,
  accentColor,
  onPress,
}: {
  label: string;
  accentColor?: string;
  onPress?: () => void;
}) {
  const inner = (
    <View style={[s.chip, accentColor ? { borderColor: accentColor + "40" } : null]}>
      <AppText style={[s.chipText, accentColor ? { color: accentColor } : null]}>{label}</AppText>
    </View>
  );
  if (onPress) {
    return <Pressable onPress={onPress}>{inner}</Pressable>;
  }
  return inner;
}

// ─── Section wrapper with alternating background ───────────

function EducationSection({
  title,
  index,
  children,
  accentColor,
}: {
  title: string;
  index: number;
  children: React.ReactNode;
  accentColor?: string;
}) {
  const bg = index % 2 === 0 ? EDUCATION_BG_PRIMARY : EDUCATION_BG_ALT;
  return (
    <View style={[s.eduSection, { backgroundColor: bg }]}>
      <AppText style={[s.eduSectionTitle, accentColor ? { color: accentColor } : null]}>
        {title}
      </AppText>
      {children}
    </View>
  );
}

// ─── Winemaker card ────────────────────────────────────────

function WinemakerCard({
  name,
  why,
  accentColor,
  onPress,
}: {
  name: string;
  why: string;
  accentColor: string;
  onPress: () => void;
}) {
  return (
    <Pressable onPress={onPress} style={s.winemakerCard}>
      <AppText style={[s.winemakerName, { color: accentColor }]}>{name}</AppText>
      <AppText style={s.winemakerWhy}>{why}</AppText>
    </Pressable>
  );
}

// ─── Appellation card ──────────────────────────────────────

function AppellationCard({
  name,
  character,
  onPress,
}: {
  name: string;
  character: string;
  onPress: () => void;
}) {
  return (
    <Pressable onPress={onPress} style={s.appellationCard}>
      <AppText style={s.appellationName}>{name}</AppText>
      <AppText style={s.appellationCharacter}>{character}</AppText>
    </Pressable>
  );
}

// ─── Type badge label ──────────────────────────────────────

function typeBadgeLabel(type: ExploreProfileType): string {
  switch (type) {
    case "grape":
      return "GRAPE VARIETY";
    case "region":
      return "WINE REGION";
    case "producer":
      return "PRODUCER";
    case "concept":
      return "CONCEPT";
    default:
      return (type as string).toUpperCase();
  }
}

// ─── Region page (12-layer architecture) ───────────────────

function RegionPage({
  data,
  heroFailed,
  onHeroError,
}: {
  data: ExploreProfileResponse;
  heroFailed: boolean;
  onHeroError: () => void;
}) {
  const router = useRouter();
  const { profile, personal_stats } = data;
  const c = profile.content;
  const accent = EDUCATION_PAGE_ACCENTS.region;
  const hasHeroImage = !!profile.hero_image_url && !heroFailed;
  const hasLogs = personal_stats.entry_count > 0;

  // Parse enriched fields (new GPT format returns objects, old returns strings)
  const grapeItems: Array<{ name: string; context: string }> =
    Array.isArray(c.key_grapes)
      ? c.key_grapes.map((g: string | { name: string; context: string }) =>
          typeof g === "string" ? { name: g, context: "" } : g
        )
      : [];

  const winemakerItems: Array<{ name: string; why: string }> =
    Array.isArray(c.notable_winemakers)
      ? c.notable_winemakers
      : [];

  const appellationItems: Array<{ name: string; character: string }> =
    Array.isArray(c.appellations)
      ? c.appellations.map((a: string | { name: string; character: string }) =>
          typeof a === "string" ? { name: a, character: "" } : a
        )
      : [];

  const funFacts: string[] =
    Array.isArray(c.fun_facts)
      ? c.fun_facts
      : c.fun_fact
        ? [c.fun_fact]
        : [];

  const flavorProfile = c.flavor_profile as
    | { Tannin: number; Acidity: number; Body: number; Oak: number; Fruit: number }
    | undefined;

  const storyText = typeof c.story === "string" ? c.story : "";

  let sectionIndex = 0;

  return (
    <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>
      {/* ── Layer 1: Hero ─────────────────────────────── */}
      <View style={s.hero}>
        {hasHeroImage ? (
          <Image
            source={{ uri: profile.hero_image_url }}
            style={s.heroImage}
            resizeMode="cover"
            onError={onHeroError}
          />
        ) : null}
        <View style={[s.heroOverlay, { backgroundColor: accent + "CC" }, !hasHeroImage && { backgroundColor: accent }]} />

        <Pressable onPress={() => router.back()} style={s.heroBackBtn}>
          <AppText style={s.heroBackBtnText}>{"\u2190"}</AppText>
        </Pressable>

        <View style={s.heroContent}>
          <View style={[s.typeBadge, { borderColor: accent }]}>
            <AppText style={[s.typeBadgeText, { color: accent }]}>WINE REGION</AppText>
          </View>
          <AppText style={s.heroTitle}>{profile.display_name}</AppText>
          {c.tagline ? (
            <AppText style={s.heroTagline}>{c.tagline}</AppText>
          ) : null}
          {c.country ? (
            <AppText style={s.heroCountry}>{c.country}</AppText>
          ) : null}
        </View>
      </View>

      {/* ── Layer 2/3: Personal Layer ─────────────────── */}
      {hasLogs ? (
        <View style={[s.personalCard, { borderColor: accent + "40" }]}>
          <AppText style={[s.personalLabel, { color: accent }]}>YOUR HISTORY</AppText>
          <AppText style={s.personalText}>
            You've logged{" "}
            <AppText style={s.personalBold}>
              {personal_stats.entry_count} {personal_stats.entry_count === 1 ? "wine" : "wines"}
            </AppText>
            {" "}from {profile.display_name}
            {personal_stats.avg_rating > 0
              ? ` with an average rating of ${personal_stats.avg_rating.toFixed(1)}`
              : ""}
            .
          </AppText>
        </View>
      ) : (
        <View style={[s.personalCard, { borderColor: accent + "40" }]}>
          <AppText style={[s.personalLabel, { color: accent }]}>DISCOVER THIS REGION</AppText>
          <AppText style={s.personalText}>
            You haven't explored {profile.display_name} yet. Start logging wines from here to see how your palate connects with this region.
          </AppText>
        </View>
      )}

      {/* ── Layer 4: Flavor Profile ───────────────────── */}
      {flavorProfile ? (
        <EducationSection title="Flavor Profile" index={sectionIndex++} accentColor={accent}>
          <View style={s.radarWrap}>
            <FlavorRadar data={flavorProfile} accentColor={accent} size={220} />
          </View>
          <AppText style={s.radarHint}>
            Typical flavor signature of wines from {profile.display_name}
          </AppText>
        </EducationSection>
      ) : null}

      {/* ── Layer 5: The Story ────────────────────────── */}
      {storyText ? (
        <EducationSection title="The Story" index={sectionIndex++} accentColor={accent}>
          <AppText style={s.storyText}>{storyText}</AppText>
        </EducationSection>
      ) : null}

      {/* ── Layer 6: Grapes Grown Here ────────────────── */}
      {grapeItems.length > 0 ? (
        <EducationSection title="Grapes Grown Here" index={sectionIndex++} accentColor={accent}>
          <View style={s.grapeList}>
            {grapeItems.map((grape) => (
              <Pressable
                key={grape.name}
                style={s.grapeItem}
                onPress={() => router.push(`/(app)/explore/grape/${toExploreSlug(grape.name)}`)}
              >
                <AppText style={[s.grapeName, { color: EDUCATION_PAGE_ACCENTS.grape }]}>{grape.name}</AppText>
                {grape.context ? (
                  <AppText style={s.grapeContext}>{grape.context}</AppText>
                ) : null}
              </Pressable>
            ))}
          </View>
        </EducationSection>
      ) : null}

      {/* ── Layer 7: Notable Winemakers ───────────────── */}
      {winemakerItems.length > 0 ? (
        <EducationSection title="Notable Winemakers" index={sectionIndex++} accentColor={accent}>
          <View style={s.winemakerList}>
            {winemakerItems.map((wm) => (
              <WinemakerCard
                key={wm.name}
                name={wm.name}
                why={wm.why}
                accentColor={EDUCATION_PAGE_ACCENTS.producer}
                onPress={() => router.push(`/(app)/explore/producer/${toExploreSlug(wm.name)}`)}
              />
            ))}
          </View>
        </EducationSection>
      ) : null}

      {/* ── Layer 8: Appellations ─────────────────────── */}
      {appellationItems.length > 0 ? (
        <EducationSection title="Appellations & Sub-Zones" index={sectionIndex++} accentColor={accent}>
          <View style={s.appellationList}>
            {appellationItems.map((app) => (
              <AppellationCard
                key={app.name}
                name={app.name}
                character={app.character}
                onPress={() => router.push(`/(app)/explore/region/${toExploreSlug(app.name)}`)}
              />
            ))}
          </View>
        </EducationSection>
      ) : null}

      {/* ── Layer 9: Community Pulse (placeholder) ────── */}
      {/* Community pulse with QPR distribution will be built once we have aggregate data */}

      {/* ── Layer 10: Recommendations (placeholder) ───── */}
      {/* Personalized recommendations will be powered by the palate matching algorithm */}

      {/* ── Layer 11: Food Pairings ───────────────────── */}
      {c.food_pairings && c.food_pairings.length > 0 ? (
        <EducationSection title="Food Pairings" index={sectionIndex++} accentColor={accent}>
          <View style={s.chipRow}>
            {c.food_pairings.map((item: string) => (
              <Chip key={item} label={item} accentColor={accent} />
            ))}
          </View>
        </EducationSection>
      ) : null}

      {/* ── Layer 12: Fun Facts ────────────────────────── */}
      {funFacts.length > 0 ? (
        <EducationSection title="Did You Know?" index={sectionIndex++} accentColor={accent}>
          {funFacts.map((fact, i) => (
            <View key={i} style={[s.funFactCard, { borderColor: accent + "30" }]}>
              <AppText style={s.funFactText}>{fact}</AppText>
            </View>
          ))}
        </EducationSection>
      ) : null}

      {/* ── Related Regions ───────────────────────────── */}
      {c.related_regions && c.related_regions.length > 0 ? (
        <EducationSection title="Explore Similar Regions" index={sectionIndex++} accentColor={accent}>
          <View style={s.chipRow}>
            {c.related_regions.map((name: string) => (
              <Chip
                key={name}
                label={name}
                accentColor={accent}
                onPress={() => router.push(`/(app)/explore/region/${toExploreSlug(name)}`)}
              />
            ))}
          </View>
        </EducationSection>
      ) : null}

      {/* Attribution */}
      {profile.hero_image_attribution ? (
        <AppText style={s.attribution}>
          Photo by {profile.hero_image_attribution.photographer}
        </AppText>
      ) : null}
    </ScrollView>
  );
}

// ─── Fallback page for grape/producer (existing layout) ────

function FallbackProfilePage({
  data,
  heroFailed,
  onHeroError,
}: {
  data: ExploreProfileResponse;
  heroFailed: boolean;
  onHeroError: () => void;
}) {
  const router = useRouter();
  const { profile, personal_stats } = data;
  const c = profile.content;
  const profileType = profile.type as ExploreProfileType;
  const hasHeroImage = !!profile.hero_image_url && !heroFailed;

  const glanceCards: { label: string; value: string | string[] | undefined }[] = [];
  if (profileType === "grape") {
    if (c.body) glanceCards.push({ label: "Body", value: c.body });
    if (c.acidity) glanceCards.push({ label: "Acidity", value: c.acidity });
    if (c.tannin) glanceCards.push({ label: "Tannin", value: c.tannin });
    if (c.key_regions?.length) glanceCards.push({ label: "Key Regions", value: c.key_regions });
  } else if (profileType === "producer") {
    if (c.key_regions?.length) glanceCards.push({ label: "Region", value: c.key_regions });
    if (c.founded) glanceCards.push({ label: "Founded", value: c.founded });
    if (c.classification) glanceCards.push({ label: "Classification", value: c.classification });
  }

  const storyParts: string[] = [];
  if (c.origin) storyParts.push(c.origin);
  if (c.characteristics) storyParts.push(c.characteristics);
  if (c.style) storyParts.push(c.style);

  const relatedItems: { name: string; type: ExploreProfileType }[] = [];
  if (c.related_grapes) for (const name of c.related_grapes) relatedItems.push({ name, type: "grape" });
  if (c.related_regions) for (const name of c.related_regions) relatedItems.push({ name, type: "region" });
  if (c.related_producers) for (const name of c.related_producers) relatedItems.push({ name, type: "producer" });

  const sensoryEntries = profile.sensory_data
    ? Object.entries(profile.sensory_data).filter(([, v]) => typeof v === "number" && v > 0)
    : [];

  return (
    <ScrollView contentContainerStyle={fallback.scroll} showsVerticalScrollIndicator={false}>
      {/* Hero */}
      <View style={fallback.hero}>
        {hasHeroImage ? (
          <Image
            source={{ uri: profile.hero_image_url }}
            style={fallback.heroImage}
            resizeMode="cover"
            onError={onHeroError}
          />
        ) : null}
        <View style={[fallback.heroOverlay, !hasHeroImage && fallback.heroOverlayNoImage]} />
        <Pressable onPress={() => router.back()} style={s.heroBackBtn}>
          <AppText style={s.heroBackBtnText}>{"\u2190"}</AppText>
        </Pressable>
        <View style={s.heroContent}>
          <View style={s.typeBadge}>
            <AppText style={s.typeBadgeText}>{typeBadgeLabel(profileType)}</AppText>
          </View>
          <AppText style={s.heroTitle}>{profile.display_name}</AppText>
          {c.tagline ? <AppText style={s.heroTagline}>{c.tagline}</AppText> : null}
        </View>
      </View>

      {/* At a Glance */}
      {glanceCards.length > 0 ? (
        <View style={fallback.section}>
          <AppText style={fallback.sectionTitle}>AT A GLANCE</AppText>
          {glanceCards.map((card) => (
            <View key={card.label} style={fallback.infoCard}>
              <AppText style={fallback.infoLabel}>{card.label}</AppText>
              <AppText style={fallback.infoValue}>
                {Array.isArray(card.value) ? card.value.join(", ") : card.value}
              </AppText>
            </View>
          ))}
        </View>
      ) : null}

      {/* Your History */}
      {personal_stats.entry_count > 0 ? (
        <View style={fallback.card}>
          <AppText style={fallback.cardLabel}>YOUR HISTORY</AppText>
          <AppText style={fallback.cardText}>
            You've logged {personal_stats.entry_count} {personal_stats.entry_count === 1 ? "wine" : "wines"}
            {personal_stats.avg_rating > 0 ? ` with an average rating of ${personal_stats.avg_rating.toFixed(1)}` : ""}
          </AppText>
        </View>
      ) : null}

      {/* Story */}
      {storyParts.length > 0 ? (
        <View style={fallback.section}>
          <AppText style={fallback.sectionTitle}>THE STORY</AppText>
          <AppText style={s.storyText}>{storyParts.join("\n\n")}</AppText>
        </View>
      ) : null}

      {/* Sensory */}
      {sensoryEntries.length > 0 ? (
        <View style={fallback.section}>
          <AppText style={fallback.sectionTitle}>SENSORY PROFILE</AppText>
          <View style={fallback.card}>
            {sensoryEntries.map(([key, value]) => (
              <View key={key} style={fallback.sensoryRow}>
                <AppText style={fallback.sensoryLabel}>{key.charAt(0).toUpperCase() + key.slice(1)}</AppText>
                <View style={fallback.sensoryTrack}>
                  <View style={[fallback.sensoryFill, { width: `${Math.max(0, Math.min(100, (value / 5) * 100))}%` }]} />
                </View>
              </View>
            ))}
          </View>
        </View>
      ) : null}

      {/* Food Pairings */}
      {c.food_pairings && c.food_pairings.length > 0 ? (
        <View style={fallback.section}>
          <AppText style={fallback.sectionTitle}>FOOD PAIRINGS</AppText>
          <View style={s.chipRow}>{c.food_pairings.map((item: string) => <Chip key={item} label={item} />)}</View>
        </View>
      ) : null}

      {/* Related */}
      {relatedItems.length > 0 ? (
        <View style={fallback.section}>
          <AppText style={fallback.sectionTitle}>RELATED</AppText>
          {relatedItems.map((item) => (
            <Pressable
              key={`${item.type}-${item.name}`}
              style={fallback.relatedItem}
              onPress={() => router.push(`/(app)/explore/${item.type}/${toExploreSlug(item.name)}`)}
            >
              <AppText style={fallback.relatedName}>{item.name}</AppText>
              <AppText style={fallback.relatedArrow}>{"\u2192"}</AppText>
            </Pressable>
          ))}
        </View>
      ) : null}

      {profile.hero_image_attribution ? (
        <AppText style={s.attribution}>Photo by {profile.hero_image_attribution.photographer}</AppText>
      ) : null}
    </ScrollView>
  );
}

// ─── Main screen ────────────────────────────────────────────

export default function ExploreProfileScreen() {
  const { type, slug } = useLocalSearchParams<{ type: string; slug: string }>();
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
        <AppText style={s.errorSubtitle}>{error ?? "Something went wrong."}</AppText>
        <Pressable style={s.backBtn} onPress={() => router.back()}>
          <AppText style={s.backBtnText}>Go back</AppText>
        </Pressable>
      </View>
    );
  }

  const profileType = data.profile.type as ExploreProfileType;

  return (
    <View style={s.screen}>
      {profileType === "region" ? (
        <RegionPage data={data} heroFailed={heroFailed} onHeroError={() => setHeroFailed(true)} />
      ) : (
        <FallbackProfilePage data={data} heroFailed={heroFailed} onHeroError={() => setHeroFailed(true)} />
      )}
    </View>
  );
}

// ─── Shared styles ──────────────────────────────────────────

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: EDUCATION_BG_PRIMARY },
  center: { alignItems: "center", justifyContent: "center" },
  scroll: { paddingBottom: 48 },

  // Hero
  hero: {
    height: 280,
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
    color: "#F5EDD6",
    fontSize: 16,
    fontWeight: "700",
  },
  heroContent: {
    paddingHorizontal: 18,
    paddingBottom: 20,
    gap: 4,
  },
  typeBadge: {
    alignSelf: "flex-start",
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.accentRose,
    backgroundColor: "rgba(0,0,0,0.3)",
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
    color: "#F5EDD6",
    fontFamily: fonts.serif.light,
    fontSize: 30,
    lineHeight: 36,
  },
  heroTagline: {
    color: "rgba(245,237,214,0.75)",
    fontSize: 13,
    lineHeight: 19,
    fontStyle: "italic",
  },
  heroCountry: {
    color: "rgba(245,237,214,0.5)",
    fontSize: 11,
    letterSpacing: 1.5,
    textTransform: "uppercase",
    fontWeight: "600",
    marginTop: 2,
  },

  // Personal layer
  personalCard: {
    marginHorizontal: 16,
    marginTop: 16,
    borderRadius: 16,
    borderWidth: 1,
    backgroundColor: EDUCATION_BG_ALT,
    padding: 16,
    gap: 6,
  },
  personalLabel: {
    fontSize: 9,
    fontWeight: "700",
    letterSpacing: 2,
    textTransform: "uppercase",
  },
  personalText: {
    color: "rgba(245,237,214,0.7)",
    fontSize: 13,
    lineHeight: 19,
  },
  personalBold: {
    color: "#F5EDD6",
    fontWeight: "700",
  },

  // Education section
  eduSection: {
    paddingHorizontal: 18,
    paddingVertical: 20,
    gap: 12,
  },
  eduSectionTitle: {
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 2.2,
    textTransform: "uppercase",
    color: "rgba(245,237,214,0.5)",
  },

  // Radar
  radarWrap: {
    alignItems: "center",
    paddingVertical: 8,
  },
  radarHint: {
    color: "rgba(245,237,214,0.4)",
    fontSize: 11,
    textAlign: "center",
  },

  // Story
  storyText: {
    color: "rgba(245,237,214,0.75)",
    fontSize: 14,
    lineHeight: 22,
    fontFamily: fonts.serif.light,
  },

  // Grape list
  grapeList: {
    gap: 8,
  },
  grapeItem: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(74,48,96,0.3)",
    backgroundColor: "rgba(74,48,96,0.08)",
    padding: 14,
    gap: 3,
  },
  grapeName: {
    fontSize: 14,
    fontWeight: "700",
  },
  grapeContext: {
    color: "rgba(245,237,214,0.6)",
    fontSize: 12,
    lineHeight: 17,
  },

  // Winemaker
  winemakerList: {
    gap: 8,
  },
  winemakerCard: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(196,96,122,0.2)",
    backgroundColor: "rgba(196,96,122,0.06)",
    padding: 14,
    gap: 4,
  },
  winemakerName: {
    fontSize: 14,
    fontWeight: "700",
  },
  winemakerWhy: {
    color: "rgba(245,237,214,0.6)",
    fontSize: 12,
    lineHeight: 17,
  },

  // Appellation
  appellationList: {
    gap: 8,
  },
  appellationCard: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(123,29,58,0.25)",
    backgroundColor: "rgba(123,29,58,0.08)",
    padding: 14,
    gap: 3,
  },
  appellationName: {
    color: "#F5EDD6",
    fontSize: 14,
    fontWeight: "700",
  },
  appellationCharacter: {
    color: "rgba(245,237,214,0.6)",
    fontSize: 12,
    lineHeight: 17,
    fontStyle: "italic",
  },

  // Chips
  chipRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  chip: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(245,237,214,0.15)",
    backgroundColor: "rgba(245,237,214,0.05)",
    paddingHorizontal: 14,
    paddingVertical: 7,
  },
  chipText: {
    color: "rgba(245,237,214,0.7)",
    fontSize: 12,
    fontWeight: "500",
  },

  // Fun facts
  funFactCard: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(245,237,214,0.1)",
    backgroundColor: "rgba(245,237,214,0.03)",
    padding: 14,
  },
  funFactText: {
    color: "rgba(245,237,214,0.75)",
    fontSize: 13,
    lineHeight: 19,
  },

  // Attribution
  attribution: {
    color: "rgba(245,237,214,0.3)",
    fontSize: 10,
    textAlign: "center",
    paddingTop: 16,
    paddingHorizontal: 18,
  },

  // Error state
  errorTitle: {
    color: "#F5EDD6",
    fontFamily: fonts.serif.light,
    fontSize: 20,
    textAlign: "center",
  },
  errorSubtitle: {
    color: "rgba(245,237,214,0.6)",
    fontSize: 13,
    textAlign: "center",
    lineHeight: 18,
  },
  backBtn: { paddingVertical: 8 },
  backBtnText: {
    color: "rgba(245,237,214,0.5)",
    fontSize: 13,
    fontWeight: "600",
  },
});

// ─── Fallback styles (for grape/producer — keeping current layout) ──

const fallback = StyleSheet.create({
  scroll: { paddingBottom: 48 },
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
  section: {
    paddingHorizontal: 18,
    gap: 10,
    marginTop: 18,
  },
  sectionTitle: {
    color: colors.textTertiary,
    fontSize: 9,
    fontWeight: "700",
    letterSpacing: 2,
    textTransform: "uppercase",
  },
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
  cardText: {
    color: colors.textSecondary,
    fontSize: 13,
    lineHeight: 18,
  },
  infoCard: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfacePrimary,
    padding: 14,
    gap: 4,
  },
  infoLabel: {
    color: colors.textTertiary,
    fontSize: 9,
    fontWeight: "700",
    letterSpacing: 2,
    textTransform: "uppercase",
  },
  infoValue: {
    color: colors.textPrimary,
    fontSize: 13,
    lineHeight: 18,
  },
  sensoryRow: { gap: 3 },
  sensoryLabel: { color: colors.textSecondary, fontSize: 12 },
  sensoryTrack: { height: 5, borderRadius: 3, backgroundColor: colors.surfaceHover },
  sensoryFill: { height: "100%", borderRadius: 3, backgroundColor: colors.accentPrimary },
  relatedItem: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfacePrimary,
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginTop: 6,
  },
  relatedName: {
    color: colors.textPrimary,
    fontSize: 13,
    fontWeight: "600",
  },
  relatedArrow: {
    color: colors.textTertiary,
    fontSize: 14,
  },
});

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
import FlavorRadar from "@/src/components/explore/FlavorRadar";
import {
  fetchExploreProfile,
  type ExploreProfileResponse,
  type ExploreProfileType,
} from "@/src/lib/api/explore";

// ─── Constants matching brand guide ────────────────────────

const CHAMPAGNE = "#F5EDD6";
const FOG = "#A08878";
const ROSE = "#C4607A";
const GRENACHE = "#7B1D3A";
const NEBBIOLO = "#4A3060";
const VERDOT = "#3D6B4F";
const BG_ODD = "#140A0F";
const BG_EVEN = "#0F0810";
const DEVICE_BG = "#0E0608";
const SECTION_BORDER = "rgba(255,255,255,0.06)";

const ACCENTS: Record<string, string> = {
  region: GRENACHE,
  grape: NEBBIOLO,
  producer: ROSE,
  concept: VERDOT,
};

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
  const hasHeroImage = !!profile.hero_image_url && !heroFailed;
  const hasLogs = personal_stats.entry_count > 0;

  // Parse enriched fields (handles both old string[] and new object[] formats)
  const grapeItems: Array<{ name: string; context: string; primary: boolean }> =
    Array.isArray(c.key_grapes)
      ? c.key_grapes.map((g, i) =>
          typeof g === "string"
            ? { name: g, context: "", primary: i < 3 }
            : { name: g.name, context: g.context, primary: i < 3 }
        )
      : [];

  const winemakerItems: Array<{ name: string; why: string }> =
    Array.isArray(c.notable_winemakers) ? c.notable_winemakers : [];

  const appellationItems: Array<{ name: string; character: string }> =
    Array.isArray(c.appellations)
      ? c.appellations.map((a) =>
          typeof a === "string" ? { name: a, character: "" } : a
        )
      : [];

  const funFacts: string[] = Array.isArray(c.fun_facts)
    ? c.fun_facts
    : c.fun_fact
      ? [c.fun_fact]
      : [];

  const flavorProfile = c.flavor_profile as
    | { Tannin: number; Acidity: number; Body: number; Oak: number; Fruit: number }
    | undefined;

  const storyText = typeof c.story === "string" ? c.story : "";

  // Determine section index for alternating backgrounds
  let bgIndex = 0;
  const nextBg = () => (bgIndex++ % 2 === 0 ? BG_ODD : BG_EVEN);

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: DEVICE_BG }}
      contentContainerStyle={{ paddingBottom: 48 }}
      showsVerticalScrollIndicator={false}
    >
      {/* ── Layer 1: Hero ─────────────────────────────── */}
      <View style={r.hero}>
        {hasHeroImage ? (
          <Image
            source={{ uri: profile.hero_image_url }}
            style={StyleSheet.absoluteFillObject}
            resizeMode="cover"
            onError={onHeroError}
          />
        ) : null}
        <View style={r.heroGradient} />

        <Pressable onPress={() => router.back()} style={r.backBtn}>
          <AppText style={r.backBtnArrow}>{"←"}</AppText>
          <AppText style={r.backBtnLabel}>Explore</AppText>
        </Pressable>

        <View style={r.heroBottom}>
          <AppText style={r.heroBadge}>
            WINE REGION · {(c.country ?? "").toUpperCase()}
          </AppText>
          <AppText style={r.heroTitle}>{profile.display_name}</AppText>
          {c.tagline ? (
            <AppText style={r.heroTagline}>{c.tagline}</AppText>
          ) : null}
        </View>
      </View>

      {/* ── Layer 2/3: Personal Layer ─────────────────── */}
      <View style={[r.section, { backgroundColor: nextBg() }]}>
        <AppText style={r.sectionLabelAccent}>
          {hasLogs ? "YOUR EXPERIENCE HERE" : "DISCOVER THIS REGION"}
        </AppText>

        {hasLogs ? (
          <>
            {/* Top rated card */}
            <View style={r.personalTopCard}>
              <View style={{ flex: 1 }}>
                <AppText style={r.personalSmallLabel}>TOP RATED</AppText>
                <AppText style={r.personalWineName}>
                  {personal_stats.entry_count}{" "}
                  {personal_stats.entry_count === 1 ? "wine" : "wines"} logged
                </AppText>
              </View>
              {personal_stats.avg_rating > 0 ? (
                <View style={{ alignItems: "flex-end" }}>
                  <AppText style={r.personalRating}>
                    {Math.round(personal_stats.avg_rating)}
                  </AppText>
                </View>
              ) : null}
            </View>

            {/* Insight card */}
            <View style={r.insightCard}>
              <AppText style={r.insightText}>
                {c.personal_insight ?? `You've logged ${personal_stats.entry_count} ${personal_stats.entry_count === 1 ? "wine" : "wines"} from ${profile.display_name}. Your average sits at ${personal_stats.avg_rating > 0 ? personal_stats.avg_rating.toFixed(1) : "—"}.`}
              </AppText>
            </View>

            {/* + Log another */}
            <Pressable
              style={r.logAnotherBtn}
              onPress={() => router.push("/(app)/entries/new")}
            >
              <AppText style={r.logAnotherText}>+ Log another</AppText>
            </Pressable>
          </>
        ) : (
          <View style={r.insightCard}>
            <AppText style={r.insightText}>
              You haven't explored {profile.display_name} yet. Log your first
              wine from here to start tracking your taste across this region.
            </AppText>
          </View>
        )}
      </View>

      {/* ── Layer 4: Flavor Profile ───────────────────── */}
      {flavorProfile ? (
        <View style={[r.section, { backgroundColor: nextBg() }]}>
          <AppText style={r.sectionLabel}>FLAVOR PROFILE</AppText>
          <View style={r.radarWrap}>
            <FlavorRadar
              data={flavorProfile}
              accentColor={GRENACHE}
              size={200}
            />
          </View>
          <View style={r.legendRow}>
            {hasLogs ? (
              <View style={r.legendItem}>
                <View style={[r.legendLine, { backgroundColor: ROSE }]} />
                <AppText style={r.legendText}>Your {personal_stats.entry_count} {personal_stats.entry_count === 1 ? "log" : "logs"}</AppText>
              </View>
            ) : null}
            <View style={r.legendItem}>
              <View style={[r.legendLine, { backgroundColor: GRENACHE }]} />
              <AppText style={r.legendText}>Region avg</AppText>
            </View>
          </View>
          <AppText style={r.radarInsight}>
            {c.personal_insight ?? `Typical flavor signature of wines from ${profile.display_name}.`}
          </AppText>
        </View>
      ) : null}

      {/* ── Layer 5: The Story ────────────────────────── */}
      {storyText ? (
        <View style={[r.section, { backgroundColor: nextBg() }]}>
          <AppText style={r.storyTitle}>The Story</AppText>
          <AppText style={r.storyBody}>{storyText}</AppText>
          {funFacts.length > 0 ? (
            <View style={r.didYouKnowBox}>
              <AppText style={r.didYouKnowLabel}>DID YOU KNOW?</AppText>
              <AppText style={r.didYouKnowText}>{funFacts[0]}</AppText>
            </View>
          ) : null}
        </View>
      ) : null}

      {/* ── Layer 6: Grapes Grown Here ────────────────── */}
      {grapeItems.length > 0 ? (
        <View style={[r.section, { backgroundColor: nextBg() }]}>
          <AppText style={r.sectionLabel}>GRAPES GROWN HERE</AppText>
          <View style={r.grapeChipRow}>
            {grapeItems.map((grape) => (
              <Pressable
                key={grape.name}
                onPress={() =>
                  router.push(
                    `/(app)/explore/grape/${toExploreSlug(grape.name)}`
                  )
                }
                style={[
                  r.grapeChip,
                  grape.primary ? r.grapeChipPrimary : r.grapeChipSecondary,
                ]}
              >
                <AppText
                  style={[
                    r.grapeChipText,
                    grape.primary
                      ? r.grapeChipTextPrimary
                      : r.grapeChipTextSecondary,
                  ]}
                >
                  {grape.name}
                </AppText>
              </Pressable>
            ))}
          </View>
          {grapeItems.some((g) => g.context) ? (
            <AppText style={r.grapeHelper}>
              Tap any grape to explore its full profile
            </AppText>
          ) : null}
        </View>
      ) : null}

      {/* ── Layer 7: Notable Winemakers ───────────────── */}
      {winemakerItems.length > 0 ? (
        <View style={[r.section, { backgroundColor: nextBg() }]}>
          <AppText style={r.sectionLabel}>NOTABLE WINEMAKERS</AppText>
          {winemakerItems.map((wm) => (
            <Pressable
              key={wm.name}
              style={r.winemakerRow}
              onPress={() =>
                router.push(
                  `/(app)/explore/producer/${toExploreSlug(wm.name)}`
                )
              }
            >
              <View style={r.winemakerAccent} />
              <View style={{ flex: 1 }}>
                <AppText style={r.winemakerName}>{wm.name}</AppText>
                <AppText style={r.winemakerNote}>{wm.why}</AppText>
              </View>
            </Pressable>
          ))}
        </View>
      ) : null}

      {/* ── Layer 8: Key Appellations ─────────────────── */}
      {(() => {
        const zones = Array.isArray(c.zone_descriptions) && c.zone_descriptions.length > 0
          ? c.zone_descriptions
          : appellationItems.length > 0
            ? appellationItems.map((a) => ({ name: a.name, note: a.character }))
            : [];
        if (zones.length === 0 && appellationItems.length === 0) return null;
        return (
          <View style={[r.section, { backgroundColor: nextBg() }]}>
            <AppText style={r.sectionLabel}>KEY APPELLATIONS + ZONES</AppText>
            {/* Appellation chips */}
            {appellationItems.length > 0 ? (
              <View style={r.grapeChipRow}>
                {appellationItems.map((app) => (
                  <Pressable
                    key={app.name}
                    onPress={() => router.push(`/(app)/explore/region/${toExploreSlug(app.name)}`)}
                    style={r.grapeChipPrimary}
                  >
                    <AppText style={r.grapeChipTextPrimary}>{app.name}</AppText>
                  </Pressable>
                ))}
              </View>
            ) : null}
            {/* Zone descriptions */}
            {zones.length > 0 ? (
              <View style={{ marginTop: 10 }}>
                {zones.map((zone) => (
                  <View key={zone.name} style={r.zoneRow}>
                    <AppText style={r.zoneName}>{zone.name}</AppText>
                    {zone.note ? <AppText style={r.zoneNote}>{zone.note}</AppText> : null}
                  </View>
                ))}
              </View>
            ) : null}
          </View>
        );
      })()}

      {/* ── Layer 9: Community Pulse ──────────────────── */}
      {(() => {
        const qpr = data.community_qpr;
        const hasQpr = qpr && qpr.total > 0;
        const hasProducers = c.most_loved_producer || c.best_qpr_producer;
        if (!hasQpr && !hasProducers) return null;

        // Compute percentages
        const pctSpotOn = hasQpr ? Math.round((qpr.spot_on / qpr.total) * 100) : 0;
        const pctGoodValue = hasQpr ? Math.round((qpr.good_value / qpr.total) * 100) : 0;
        const pctSteal = hasQpr ? Math.round((qpr.absolute_steal / qpr.total) * 100) : 0;
        const pctPricey = hasQpr ? Math.round((qpr.pricey / qpr.total) * 100) : 0;
        const pctExtortion = hasQpr ? Math.round((qpr.extortion / qpr.total) * 100) : 0;

        // Best QPR subtitle
        const bestQprSub = hasQpr && (pctSteal + pctGoodValue) > 0
          ? `Best QPR · ${pctSteal + pctGoodValue}% said Good Value or better`
          : "Best QPR";

        return (
          <View style={[r.section, { backgroundColor: nextBg() }]}>
            <AppText style={r.sectionLabel}>COMMUNITY PULSE</AppText>

            {/* QPR bar — only if real data */}
            {hasQpr ? (
              <>
                <AppText style={r.qprBarLabel}>QPR across {qpr.total} community logs</AppText>
                <View style={r.qprBar}>
                  {pctExtortion > 0 ? <View style={[r.qprSegment, { flex: pctExtortion, backgroundColor: "rgba(184,48,96,0.75)" }]} /> : null}
                  {pctPricey > 0 ? <View style={[r.qprSegment, { flex: pctPricey, backgroundColor: "rgba(92,85,80,0.75)" }]} /> : null}
                  {pctSpotOn > 0 ? <View style={[r.qprSegment, { flex: pctSpotOn, backgroundColor: "rgba(61,107,79,0.75)" }]} /> : null}
                  {(pctGoodValue + pctSteal) > 0 ? <View style={[r.qprSegment, { flex: pctGoodValue + pctSteal, backgroundColor: "rgba(123,29,58,0.75)" }]} /> : null}
                </View>
                <View style={r.qprLegendRow}>
                  {pctSpotOn > 0 ? <AppText style={[r.qprLegendText, { color: VERDOT }]}>{pctSpotOn}% Spot On</AppText> : null}
                  {(pctGoodValue + pctSteal) > 0 ? <AppText style={[r.qprLegendText, { color: GRENACHE }]}>{pctGoodValue + pctSteal}% Good Value</AppText> : null}
                  {pctPricey > 0 ? <AppText style={[r.qprLegendText, { color: FOG }]}>{pctPricey}% Pricey</AppText> : null}
                </View>
              </>
            ) : null}

            {/* Producer cards */}
            {hasProducers ? (
              <View style={[r.communityCardRow, hasQpr ? { marginTop: 10 } : null]}>
                {c.most_loved_producer ? (
                  <Pressable
                    style={r.communityCard}
                    onPress={() => router.push(`/(app)/explore/producer/${toExploreSlug(c.most_loved_producer!.name)}`)}
                  >
                    <AppText style={r.communityCardWine}>{c.most_loved_producer.name}</AppText>
                    <AppText style={r.communityCardSub}>Most loved · {c.most_loved_producer.avg_rating} avg</AppText>
                  </Pressable>
                ) : null}
                {c.best_qpr_producer ? (
                  <Pressable
                    style={r.communityCard}
                    onPress={() => router.push(`/(app)/explore/producer/${toExploreSlug(c.best_qpr_producer!.name)}`)}
                  >
                    <AppText style={r.communityCardWine}>{c.best_qpr_producer.name}</AppText>
                    <AppText style={r.communityCardSub}>{bestQprSub}</AppText>
                  </Pressable>
                ) : null}
              </View>
            ) : null}
          </View>
        );
      })()}

      {/* ── Layer 10: Based on your palate ────────────── */}
      {c.recommendation_picks && c.recommendation_picks.length > 0 ? (
        <View style={[r.section, { backgroundColor: nextBg() }]}>
          <AppText style={r.sectionLabel}>IF YOU LIKE THIS, YOU MAY ALSO ENJOY...</AppText>
          <View style={r.recCardRow}>
            {c.recommendation_picks.map((rec) => (
              <Pressable
                key={rec.name}
                style={r.recCard}
                onPress={() => router.push(`/(app)/explore/${rec.type}/${toExploreSlug(rec.name)}`)}
              >
                <AppText style={r.recCardName}>{rec.name}</AppText>
                <AppText style={r.recCardWhy}>{rec.why}</AppText>
              </Pressable>
            ))}
          </View>
        </View>
      ) : null}

      {/* ── Layer 11: Food Pairings ───────────────────── */}
      {c.food_pairings && c.food_pairings.length > 0 ? (
        <View style={[r.section, { backgroundColor: nextBg() }]}>
          <AppText style={r.storyTitle}>Food Pairings</AppText>
          <View style={r.pairingRow}>
            {c.food_pairings.map((item: string) => (
              <View key={item} style={r.pairingChip}>
                <AppText style={r.pairingChipText}>{item}</AppText>
              </View>
            ))}
          </View>
        </View>
      ) : null}

      {/* ── Layer 12: More to Know / Fun Facts ─────────── */}
      {funFacts.length > 1 ? (
        <View style={[r.section, { backgroundColor: nextBg() }]}>
          <AppText style={r.sectionLabel}>MORE TO KNOW</AppText>
          {funFacts.slice(1).map((fact, i) => (
            <View key={i} style={r.factRow}>
              <AppText style={r.factBullet}>✦</AppText>
              <AppText style={r.factText}>{fact}</AppText>
            </View>
          ))}
        </View>
      ) : null}

      {/* ── Related Regions ───────────────────────────── */}
      {c.related_regions && c.related_regions.length > 0 ? (
        <View style={[r.section, { backgroundColor: nextBg() }]}>
          <AppText style={r.sectionLabel}>EXPLORE SIMILAR REGIONS</AppText>
          <View style={r.grapeChipRow}>
            {c.related_regions.map((name: string) => (
              <Pressable
                key={name}
                onPress={() =>
                  router.push(
                    `/(app)/explore/region/${toExploreSlug(name)}`
                  )
                }
                style={r.grapeChipSecondary}
              >
                <AppText style={r.grapeChipTextSecondary}>{name}</AppText>
              </Pressable>
            ))}
          </View>
        </View>
      ) : null}

      {/* Attribution */}
      {profile.hero_image_attribution ? (
        <AppText style={r.attribution}>
          Photo by {profile.hero_image_attribution.photographer}
        </AppText>
      ) : null}
    </ScrollView>
  );
}

// ─── Varietal page (12-layer architecture) ─────────────────

function VarietalPage({
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
  const accent = NEBBIOLO;
  const hasHeroImage = !!profile.hero_image_url && !heroFailed;
  const hasLogs = personal_stats.entry_count > 0;

  const storyText = typeof c.story === "string" ? c.story : "";
  const funFacts: string[] = Array.isArray(c.fun_facts) ? c.fun_facts : c.fun_fact ? [c.fun_fact] : [];
  const flavorProfile = c.flavor_profile as { Tannin: number; Acidity: number; Body: number; Oak: number; Fruit: number } | undefined;
  const whereItGrows: Array<{ name: string; size: string }> = Array.isArray(c.where_it_grows) ? c.where_it_grows : (Array.isArray(c.key_regions) ? (c.key_regions as string[]).map((n, i) => ({ name: n, size: i < 2 ? "large" : i < 4 ? "medium" : "small" })) : []);
  const stylesExpressions: Array<{ style: string; desc: string; example: string }> = Array.isArray(c.styles_expressions) ? c.styles_expressions : [];
  const notableProducers: Array<{ name: string; note: string }> = Array.isArray(c.notable_producers) ? c.notable_producers : [];

  let bgIndex = 0;
  const nextBg = () => (bgIndex++ % 2 === 0 ? BG_ODD : BG_EVEN);

  return (
    <ScrollView style={{ flex: 1, backgroundColor: DEVICE_BG }} contentContainerStyle={{ paddingBottom: 48 }} showsVerticalScrollIndicator={false}>
      {/* ── Hero ──────────────────────────────────────── */}
      <View style={[r.hero, { height: 180 }]}>
        {hasHeroImage ? <Image source={{ uri: profile.hero_image_url }} style={StyleSheet.absoluteFillObject} resizeMode="cover" onError={onHeroError} /> : null}
        <View style={r.heroGradient} />
        <Pressable onPress={() => router.back()} style={r.backBtn}>
          <AppText style={r.backBtnArrow}>{"←"}</AppText>
          <AppText style={r.backBtnLabel}>Explore</AppText>
        </Pressable>
        <View style={r.heroBottom}>
          <AppText style={[r.heroBadge, { color: accent }]}>VARIETAL</AppText>
          <AppText style={r.heroTitle}>{profile.display_name}</AppText>
          {c.tagline ? <AppText style={[r.heroTagline, { fontFamily: fonts.serif.light }]}>{c.tagline}</AppText> : null}
        </View>
      </View>

      {/* ── Personal Layer ────────────────────────────── */}
      <View style={[r.section, { backgroundColor: nextBg() }]}>
        <AppText style={r.sectionLabelAccent}>YOUR {profile.display_name.toUpperCase()}</AppText>
        {hasLogs ? (
          <>
            <View style={v.statsRow}>
              <View style={v.statCard}>
                <AppText style={[v.statNumber, { color: CHAMPAGNE }]}>{personal_stats.entry_count}</AppText>
                <AppText style={v.statLabel}>wines logged</AppText>
              </View>
              {personal_stats.avg_rating > 0 ? (
                <View style={v.statCard}>
                  <AppText style={v.statNumber}>{personal_stats.avg_rating.toFixed(1)}</AppText>
                  <AppText style={v.statLabel}>your avg rating</AppText>
                </View>
              ) : null}
              <View style={v.statCard}>
                <AppText style={[v.statNumber, { color: CHAMPAGNE }]}>—</AppText>
                <AppText style={v.statLabel}>community avg</AppText>
              </View>
            </View>
            <AppText style={v.insightText}>
              {c.personal_insight ?? `You've logged ${personal_stats.entry_count} ${profile.display_name} wines. Keep exploring to see your taste pattern emerge.`}
            </AppText>
          </>
        ) : (
          <View style={r.insightCard}>
            <AppText style={r.insightText}>
              You haven't logged any {profile.display_name} wines yet. Start exploring this grape to discover your personal preferences.
            </AppText>
          </View>
        )}
      </View>

      {/* ── Flavor Profile ────────────────────────────── */}
      {flavorProfile ? (
        <View style={[r.section, { backgroundColor: nextBg() }]}>
          <AppText style={r.sectionLabel}>FLAVOUR PROFILE</AppText>
          <View style={r.radarWrap}>
            <FlavorRadar data={flavorProfile} accentColor={accent} size={200} />
          </View>
          <View style={r.legendRow}>
            {hasLogs ? (
              <View style={r.legendItem}>
                <View style={[r.legendLine, { backgroundColor: ROSE }]} />
                <AppText style={r.legendText}>Your {personal_stats.entry_count} {personal_stats.entry_count === 1 ? "log" : "logs"}</AppText>
              </View>
            ) : null}
            <View style={r.legendItem}>
              <View style={[r.legendLine, { backgroundColor: accent }]} />
              <AppText style={r.legendText}>{profile.display_name} avg</AppText>
            </View>
          </View>
          {c.personal_insight ? <AppText style={r.radarInsight}>{c.personal_insight}</AppText> : null}
        </View>
      ) : null}

      {/* ── The Story ─────────────────────────────────── */}
      {storyText ? (
        <View style={[r.section, { backgroundColor: nextBg() }]}>
          <AppText style={r.storyTitle}>{profile.display_name}</AppText>
          <AppText style={[r.storyBody, { fontFamily: fonts.serif.light, fontSize: 16, lineHeight: 24, color: CHAMPAGNE }]}>{storyText}</AppText>
          {funFacts.length > 0 ? (
            <View style={{ flexDirection: "row", gap: 8, alignItems: "flex-start", marginTop: 8 }}>
              <AppText style={{ color: accent, fontSize: 9, flexShrink: 0, marginTop: 1 }}>✦</AppText>
              <AppText style={{ fontSize: 10, color: "rgba(245,237,214,0.5)", lineHeight: 15 }}>{funFacts[0]}</AppText>
            </View>
          ) : null}
        </View>
      ) : null}

      {/* ── Where It Grows ────────────────────────────── */}
      {whereItGrows.length > 0 ? (
        <View style={[r.section, { backgroundColor: nextBg() }]}>
          <AppText style={r.sectionLabel}>WHERE IT GROWS BEST</AppText>
          <View style={r.grapeChipRow}>
            {whereItGrows.map((region) => (
              <Pressable
                key={region.name}
                onPress={() => router.push(`/(app)/explore/region/${toExploreSlug(region.name)}`)}
                style={[v.regionChip, region.size === "large" ? v.regionChipLarge : region.size === "medium" ? v.regionChipMedium : v.regionChipSmall]}
              >
                <AppText style={[v.regionChipText, region.size === "large" ? v.regionChipTextLarge : region.size === "medium" ? v.regionChipTextMedium : v.regionChipTextSmall]}>
                  {region.name}
                </AppText>
              </Pressable>
            ))}
          </View>
        </View>
      ) : null}

      {/* ── Styles & Expressions ──────────────────────── */}
      {stylesExpressions.length > 0 ? (
        <View style={[r.section, { backgroundColor: nextBg() }]}>
          <AppText style={r.sectionLabel}>STYLES + EXPRESSIONS</AppText>
          {stylesExpressions.map((expr) => (
            <View key={expr.style} style={v.exprCard}>
              <AppText style={v.exprTitle}>{expr.style}</AppText>
              <AppText style={v.exprDesc}>{expr.desc}</AppText>
              <AppText style={v.exprExample}>{expr.example}</AppText>
            </View>
          ))}
        </View>
      ) : null}

      {/* ── Notable Producers ─────────────────────────── */}
      {notableProducers.length > 0 ? (
        <View style={[r.section, { backgroundColor: nextBg() }]}>
          <AppText style={r.sectionLabel}>NOTABLE PRODUCERS</AppText>
          {notableProducers.map((prod) => (
            <Pressable key={prod.name} style={v.producerRow} onPress={() => router.push(`/(app)/explore/producer/${toExploreSlug(prod.name)}`)}>
              <View style={[v.producerDot, { backgroundColor: accent }]} />
              <View style={{ flex: 1 }}>
                <AppText style={v.producerName}>{prod.name}</AppText>
                <AppText style={v.producerNote}>{prod.note}</AppText>
              </View>
            </Pressable>
          ))}
        </View>
      ) : null}

      {/* ── Community Pulse ───────────────────────────── */}
      {(() => {
        const qpr = data.community_qpr;
        const hasQpr = qpr && qpr.total > 0;
        const hasProducers = c.most_loved_producer || c.best_qpr_producer;
        if (!hasQpr && !hasProducers) return null;
        const pctSpotOn = hasQpr ? Math.round((qpr.spot_on / qpr.total) * 100) : 0;
        const pctGoodValue = hasQpr ? Math.round(((qpr.good_value + qpr.absolute_steal) / qpr.total) * 100) : 0;
        const pctPricey = hasQpr ? Math.round((qpr.pricey / qpr.total) * 100) : 0;
        const pctExtortion = hasQpr ? Math.round((qpr.extortion / qpr.total) * 100) : 0;
        return (
          <View style={[r.section, { backgroundColor: nextBg() }]}>
            <AppText style={r.sectionLabel}>COMMUNITY PULSE</AppText>
            {hasQpr ? (
              <>
                <AppText style={r.qprBarLabel}>QPR across {qpr.total} {profile.display_name} logs</AppText>
                <View style={r.qprBar}>
                  {pctExtortion > 0 ? <View style={[r.qprSegment, { flex: pctExtortion, backgroundColor: "rgba(184,48,96,0.75)" }]} /> : null}
                  {pctPricey > 0 ? <View style={[r.qprSegment, { flex: pctPricey, backgroundColor: "rgba(92,85,80,0.75)" }]} /> : null}
                  {pctSpotOn > 0 ? <View style={[r.qprSegment, { flex: pctSpotOn, backgroundColor: "rgba(61,107,79,0.75)" }]} /> : null}
                  {pctGoodValue > 0 ? <View style={[r.qprSegment, { flex: pctGoodValue, backgroundColor: "rgba(123,29,58,0.75)" }]} /> : null}
                </View>
                <View style={r.qprLegendRow}>
                  {pctSpotOn > 0 ? <AppText style={[r.qprLegendText, { color: VERDOT }]}>{pctSpotOn}% Spot On</AppText> : null}
                  {pctGoodValue > 0 ? <AppText style={[r.qprLegendText, { color: GRENACHE }]}>{pctGoodValue}% Good Value</AppText> : null}
                  {pctPricey > 0 ? <AppText style={[r.qprLegendText, { color: FOG }]}>{pctPricey}% Pricey</AppText> : null}
                </View>
              </>
            ) : null}
            {hasProducers ? (
              <View style={[r.communityCardRow, hasQpr ? { marginTop: 10 } : null]}>
                {c.most_loved_producer ? (
                  <Pressable style={r.communityCard} onPress={() => router.push(`/(app)/explore/producer/${toExploreSlug(c.most_loved_producer!.name)}`)}>
                    <AppText style={r.communityCardWine}>{c.most_loved_producer.name}</AppText>
                    <AppText style={r.communityCardSub}>Most loved · {c.most_loved_producer.avg_rating} avg</AppText>
                  </Pressable>
                ) : null}
                {c.best_qpr_producer ? (
                  <Pressable style={r.communityCard} onPress={() => router.push(`/(app)/explore/producer/${toExploreSlug(c.best_qpr_producer!.name)}`)}>
                    <AppText style={r.communityCardWine}>{c.best_qpr_producer.name}</AppText>
                    <AppText style={r.communityCardSub}>Best QPR</AppText>
                  </Pressable>
                ) : null}
              </View>
            ) : null}
          </View>
        );
      })()}

      {/* ── Recommendations ───────────────────────────── */}
      {c.recommendation_picks && c.recommendation_picks.length > 0 ? (
        <View style={[r.section, { backgroundColor: nextBg() }]}>
          <AppText style={r.sectionLabel}>IF YOU LIKE THIS, YOU MAY ALSO ENJOY...</AppText>
          <View style={r.recCardRow}>
            {c.recommendation_picks.map((rec) => (
              <Pressable key={rec.name} style={r.recCard} onPress={() => router.push(`/(app)/explore/${rec.type}/${toExploreSlug(rec.name)}`)}>
                <AppText style={r.recCardName}>{rec.name}</AppText>
                <AppText style={r.recCardWhy}>{rec.why}</AppText>
              </Pressable>
            ))}
          </View>
        </View>
      ) : null}

      {/* ── Food Pairings ─────────────────────────────── */}
      {c.food_pairings && c.food_pairings.length > 0 ? (
        <View style={[r.section, { backgroundColor: nextBg() }]}>
          <AppText style={r.storyTitle}>Food Pairings</AppText>
          <View style={r.pairingRow}>
            {c.food_pairings.map((item: string) => (
              <View key={item} style={r.pairingChip}><AppText style={r.pairingChipText}>{item}</AppText></View>
            ))}
          </View>
        </View>
      ) : null}

      {/* ── More to Know ──────────────────────────────── */}
      {funFacts.length > 1 ? (
        <View style={[r.section, { backgroundColor: nextBg(), borderBottomWidth: 0 }]}>
          <AppText style={r.sectionLabel}>MORE TO KNOW</AppText>
          {funFacts.slice(1).map((fact, i) => (
            <View key={i} style={r.factRow}>
              <AppText style={[r.factBullet, { color: accent }]}>✦</AppText>
              <AppText style={r.factText}>{fact}</AppText>
            </View>
          ))}
        </View>
      ) : null}

      {/* Attribution */}
      {profile.hero_image_attribution ? <AppText style={r.attribution}>Photo by {profile.hero_image_attribution.photographer}</AppText> : null}
    </ScrollView>
  );
}

// ─── Varietal-specific styles ───────────────────────────────

const v = StyleSheet.create({
  // Personal layer stat cards
  statsRow: {
    flexDirection: "row",
    gap: 8,
  },
  statCard: {
    flex: 1,
    backgroundColor: "rgba(255,255,255,0.04)",
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  statNumber: {
    fontFamily: fonts.serif.light,
    fontSize: 20,
    color: "#C9A84C", // Viognier
  },
  statLabel: {
    fontSize: 8,
    color: "rgba(245,237,214,0.4)",
  },
  insightText: {
    fontSize: 10,
    color: "rgba(245,237,214,0.5)",
    lineHeight: 15,
    marginTop: 6,
  },

  // Where it grows — sized chips
  regionChip: {
    borderRadius: 20,
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: 0.5,
    borderColor: "rgba(255,255,255,0.08)",
  },
  regionChipLarge: {
    paddingHorizontal: 14,
    paddingVertical: 6,
  },
  regionChipMedium: {
    paddingHorizontal: 11,
    paddingVertical: 5,
  },
  regionChipSmall: {
    paddingHorizontal: 9,
    paddingVertical: 4,
  },
  regionChipText: {},
  regionChipTextLarge: {
    fontSize: 11,
    color: "rgba(245,237,214,0.8)",
    fontWeight: "500",
  },
  regionChipTextMedium: {
    fontSize: 10,
    color: "rgba(245,237,214,0.5)",
  },
  regionChipTextSmall: {
    fontSize: 9,
    color: "rgba(245,237,214,0.5)",
  },

  // Styles & Expressions cards
  exprCard: {
    backgroundColor: "rgba(255,255,255,0.04)",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 6,
  },
  exprTitle: {
    fontFamily: fonts.serif.light,
    fontSize: 13,
    color: CHAMPAGNE,
    marginBottom: 3,
  },
  exprDesc: {
    fontSize: 9,
    color: "rgba(245,237,214,0.45)",
    lineHeight: 13,
    marginBottom: 3,
  },
  exprExample: {
    fontSize: 8,
    color: FOG, // Dust — supporting text, not gold per Dani Round 2 Task 2
  },

  // Notable producers with dot
  producerRow: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 8,
    alignItems: "flex-start",
  },
  producerDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginTop: 5,
    flexShrink: 0,
  },
  producerName: {
    fontFamily: fonts.serif.light,
    fontSize: 12,
    color: CHAMPAGNE,
  },
  producerNote: {
    fontSize: 9,
    color: "rgba(245,237,214,0.4)",
    lineHeight: 13,
  },
});

// ─── Producer page (11-layer architecture) ─────────────────

function ProducerPage({
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
  const accent = ROSE;
  const hasHeroImage = !!profile.hero_image_url && !heroFailed;
  const hasLogs = personal_stats.entry_count > 0;

  const storyText = typeof c.story === "string" ? c.story : [c.origin, c.characteristics, c.style].filter(Boolean).join(" ");
  const funFacts: string[] = Array.isArray(c.fun_facts) ? c.fun_facts : c.fun_fact ? [c.fun_fact] : [];
  const philosophyTags: Array<{ tag: string; note: string }> = Array.isArray(c.philosophy_tags) ? c.philosophy_tags : [];
  const keyWines: Array<{ name: string; desc: string; rating: string }> = Array.isArray(c.key_wines)
    ? c.key_wines.map((w: string | { name: string; desc: string; rating: string }) => typeof w === "string" ? { name: w, desc: "", rating: "" } : w)
    : [];
  const regionGrapes: string[] = Array.isArray(c.region_grapes) ? c.region_grapes : [...(c.grapes ?? []), ...(c.key_regions ?? []) as string[]];
  const similarProducers: Array<{ name: string; why: string }> = Array.isArray(c.similar_producers) ? c.similar_producers : [];

  let bgIndex = 0;
  const nextBg = () => (bgIndex++ % 2 === 0 ? BG_ODD : BG_EVEN);

  return (
    <ScrollView style={{ flex: 1, backgroundColor: DEVICE_BG }} contentContainerStyle={{ paddingBottom: 48 }} showsVerticalScrollIndicator={false}>
      {/* ── Hero ──────────────────────────────────────── */}
      <View style={[r.hero, { height: 180 }]}>
        {hasHeroImage ? <Image source={{ uri: profile.hero_image_url }} style={StyleSheet.absoluteFillObject} resizeMode="cover" onError={onHeroError} /> : null}
        <View style={r.heroGradient} />
        <Pressable onPress={() => router.back()} style={r.backBtn}>
          <AppText style={r.backBtnArrow}>{"←"}</AppText>
          <AppText style={r.backBtnLabel}>Explore</AppText>
        </Pressable>
        <View style={r.heroBottom}>
          <AppText style={[r.heroBadge, { color: accent }]}>PRODUCER</AppText>
          <AppText style={[r.heroTitle, { fontSize: 24 }]}>{profile.display_name}</AppText>
          {c.tagline ? <AppText style={[r.heroTagline, { fontFamily: fonts.serif.light }]}>{c.tagline}</AppText> : null}
        </View>
      </View>

      {/* ── Personal Layer ────────────────────────────── */}
      <View style={[r.section, { backgroundColor: nextBg() }]}>
        <AppText style={r.sectionLabelAccent}>YOUR {profile.display_name.toUpperCase()}</AppText>
        {hasLogs ? (
          <AppText style={p.personalNarrative}>
            You've opened <AppText style={p.personalHighlight}>{personal_stats.entry_count} {personal_stats.entry_count === 1 ? "bottle" : "bottles"}</AppText>
            {personal_stats.avg_rating > 0 ? (
              <>. Your average rating: <AppText style={p.personalHighlight}>{personal_stats.avg_rating.toFixed(1)}</AppText></>
            ) : null}.
          </AppText>
        ) : (
          <View style={r.insightCard}>
            <AppText style={r.insightText}>
              You haven't logged any {profile.display_name} wines yet. Open your first bottle to start tracking.
            </AppText>
          </View>
        )}
      </View>

      {/* ── The Story ─────────────────────────────────── */}
      {storyText ? (
        <View style={[r.section, { backgroundColor: nextBg() }]}>
          <AppText style={[r.storyBody, { fontFamily: fonts.serif.light, fontSize: 16, lineHeight: 24, color: CHAMPAGNE }]}>{storyText}</AppText>
          {funFacts.length > 0 ? (
            <View style={{ flexDirection: "row", gap: 8, alignItems: "flex-start", marginTop: 8 }}>
              <AppText style={{ color: accent, fontSize: 9, flexShrink: 0, marginTop: 1 }}>✦</AppText>
              <AppText style={{ fontSize: 10, color: "rgba(245,237,214,0.5)", lineHeight: 15 }}>{funFacts[0]}</AppText>
            </View>
          ) : null}
        </View>
      ) : null}

      {/* ── Philosophy & Approach ─────────────────────── */}
      {philosophyTags.length > 0 ? (
        <View style={[r.section, { backgroundColor: nextBg() }]}>
          <AppText style={r.sectionLabel}>PHILOSOPHY + APPROACH</AppText>
          {philosophyTags.map((item) => (
            <View key={item.tag} style={{ marginBottom: 8 }}>
              <AppText style={p.philoTag}>{item.tag}</AppText>
              <AppText style={p.philoNote}>{item.note}</AppText>
            </View>
          ))}
        </View>
      ) : null}

      {/* ── Key Wines ─────────────────────────────────── */}
      {keyWines.length > 0 ? (
        <View style={[r.section, { backgroundColor: nextBg() }]}>
          <AppText style={r.sectionLabel}>KEY WINES</AppText>
          {keyWines.map((wine) => (
            <View key={wine.name} style={p.wineCard}>
              <View style={{ flex: 1 }}>
                <AppText style={p.wineName}>{wine.name}</AppText>
                {wine.desc ? <AppText style={p.wineDesc}>{wine.desc}</AppText> : null}
              </View>
              {wine.rating ? <AppText style={p.wineRating}>{wine.rating}</AppText> : null}
            </View>
          ))}
        </View>
      ) : null}

      {/* ── Region + Grapes ───────────────────────────── */}
      {regionGrapes.length > 0 ? (
        <View style={[r.section, { backgroundColor: nextBg() }]}>
          <AppText style={r.sectionLabel}>REGION + GRAPES</AppText>
          <View style={r.grapeChipRow}>
            {regionGrapes.map((name) => (
              <Pressable
                key={name}
                onPress={() => {
                  // Attempt to determine if it's a region or grape — grapes are typically single words
                  const isRegion = name.includes("-") || name.includes(" ") && name.length > 12;
                  router.push(`/(app)/explore/${isRegion ? "region" : "grape"}/${toExploreSlug(name)}`);
                }}
                style={r.grapeChipSecondary}
              >
                <AppText style={[r.grapeChipTextSecondary, { fontSize: 10, color: "rgba(245,237,214,0.6)" }]}>{name}</AppText>
              </Pressable>
            ))}
          </View>
        </View>
      ) : null}

      {/* ── Similar Producers ─────────────────────────── */}
      {similarProducers.length > 0 ? (
        <View style={[r.section, { backgroundColor: nextBg() }]}>
          <AppText style={r.sectionLabel}>SIMILAR PRODUCERS</AppText>
          <View style={r.recCardRow}>
            {similarProducers.map((prod) => (
              <Pressable key={prod.name} style={r.recCard} onPress={() => router.push(`/(app)/explore/producer/${toExploreSlug(prod.name)}`)}>
                <AppText style={r.recCardName}>{prod.name}</AppText>
                <AppText style={r.recCardWhy}>{prod.why}</AppText>
              </Pressable>
            ))}
          </View>
        </View>
      ) : null}

      {/* ── Food Pairings ─────────────────────────────── */}
      {c.food_pairings && c.food_pairings.length > 0 ? (
        <View style={[r.section, { backgroundColor: nextBg() }]}>
          <AppText style={r.storyTitle}>Food Pairings</AppText>
          <View style={r.pairingRow}>
            {c.food_pairings.map((item: string) => (
              <View key={item} style={r.pairingChip}><AppText style={r.pairingChipText}>{item}</AppText></View>
            ))}
          </View>
        </View>
      ) : null}

      {/* ── More to Know ──────────────────────────────── */}
      {funFacts.length > 1 ? (
        <View style={[r.section, { backgroundColor: nextBg(), borderBottomWidth: 0 }]}>
          <AppText style={r.sectionLabel}>MORE TO KNOW</AppText>
          {funFacts.slice(1).map((fact, i) => (
            <View key={i} style={r.factRow}>
              <AppText style={[r.factBullet, { color: accent }]}>✦</AppText>
              <AppText style={r.factText}>{fact}</AppText>
            </View>
          ))}
        </View>
      ) : null}

      {/* Attribution */}
      {profile.hero_image_attribution ? <AppText style={r.attribution}>Photo by {profile.hero_image_attribution.photographer}</AppText> : null}
    </ScrollView>
  );
}

// ─── Producer-specific styles ───────────────────────────────

const p = StyleSheet.create({
  // Personal narrative
  personalNarrative: {
    fontSize: 10,
    color: "rgba(245,237,214,0.55)",
    lineHeight: 16,
  },
  personalHighlight: {
    color: CHAMPAGNE, // Count emphasis in prose — not a score; gold reserved per Dani rule
    fontWeight: "600",
  },

  // Philosophy tags
  philoTag: {
    fontSize: 10,
    color: CHAMPAGNE, // Tag label — not a score; gold reserved per Dani rule
    fontWeight: "500",
    marginBottom: 2,
  },
  philoNote: {
    fontSize: 9,
    color: "rgba(245,237,214,0.4)",
    lineHeight: 13,
  },

  // Key wines
  wineCard: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    backgroundColor: "rgba(255,255,255,0.04)",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 6,
  },
  wineName: {
    fontFamily: fonts.serif.light,
    fontSize: 13,
    color: CHAMPAGNE,
    marginBottom: 3,
  },
  wineDesc: {
    fontSize: 9,
    color: "rgba(245,237,214,0.4)",
    lineHeight: 13,
  },
  wineRating: {
    fontSize: 10,
    color: "#C9A84C", // Viognier
    flexShrink: 0,
    marginLeft: 8,
  },
});

// ─── Region styles (pixel-matched to brand guide) ──────────

const r = StyleSheet.create({
  // Hero
  hero: {
    height: 210,
    position: "relative",
    justifyContent: "flex-end",
    overflow: "hidden",
  },
  heroGradient: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(14,6,8,0.55)",
  },
  backBtn: {
    position: "absolute",
    top: 12,
    left: 14,
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: "rgba(0,0,0,0.35)",
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 5,
    zIndex: 10,
  },
  backBtnArrow: {
    color: "rgba(245,237,214,0.8)",
    fontSize: 11,
  },
  backBtnLabel: {
    color: "rgba(245,237,214,0.8)",
    fontSize: 10,
    fontWeight: "500",
  },
  heroBottom: {
    paddingHorizontal: 16,
    paddingBottom: 16,
  },
  heroBadge: {
    fontSize: 9,
    color: ROSE,
    letterSpacing: 3,
    textTransform: "uppercase",
    marginBottom: 5,
  },
  heroTitle: {
    fontFamily: fonts.serif.light,
    fontSize: 26,
    color: CHAMPAGNE,
    fontWeight: "300",
    lineHeight: 30,
    marginBottom: 5,
  },
  heroTagline: {
    fontSize: 11,
    color: "rgba(245,237,214,0.65)",
    lineHeight: 16,
  },

  // Section container
  section: {
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 0.5,
    borderBottomColor: SECTION_BORDER,
  },

  // Section labels
  sectionLabel: {
    fontSize: 8,
    color: FOG,
    letterSpacing: 2.5,
    textTransform: "uppercase",
    fontWeight: "700",
    marginBottom: 10,
  },
  sectionLabelAccent: {
    fontSize: 8,
    color: ROSE,
    letterSpacing: 2.5,
    textTransform: "uppercase",
    fontWeight: "700",
    marginBottom: 10,
  },

  // Personal layer
  personalTopCard: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.05)",
    borderRadius: 10,
    padding: 12,
    marginBottom: 8,
  },
  personalSmallLabel: {
    fontSize: 8,
    color: "rgba(245,237,214,0.4)",
    letterSpacing: 1,
    textTransform: "uppercase",
    marginBottom: 3,
  },
  personalWineName: {
    fontFamily: fonts.serif.light,
    fontSize: 14,
    color: CHAMPAGNE,
  },
  personalRating: {
    fontSize: 18,
    color: ROSE,
    fontWeight: "500",
  },
  insightCard: {
    backgroundColor: "rgba(196,96,122,0.1)",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderLeftWidth: 2,
    borderLeftColor: "rgba(196,96,122,0.5)",
    marginBottom: 8,
  },
  insightText: {
    fontSize: 11,
    color: "rgba(245,237,214,0.85)",
    lineHeight: 17,
  },

  // Flavor radar
  radarWrap: {
    alignItems: "center",
    paddingVertical: 4,
  },
  legendRow: {
    flexDirection: "row",
    justifyContent: "center",
    gap: 16,
    marginTop: 8,
  },
  legendItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  legendLine: {
    width: 14,
    height: 2,
    borderRadius: 1,
  },
  legendText: {
    fontSize: 9,
    color: "rgba(245,237,214,0.5)",
  },
  radarInsight: {
    fontSize: 10,
    color: "rgba(245,237,214,0.55)",
    lineHeight: 16,
    marginTop: 8,
  },

  // Story
  storyTitle: {
    fontFamily: fonts.serif.light,
    fontSize: 16,
    color: CHAMPAGNE,
    marginBottom: 8,
  },
  storyBody: {
    fontSize: 11,
    color: "rgba(245,237,214,0.72)",
    lineHeight: 19,
    marginBottom: 10,
  },
  didYouKnowBox: {
    backgroundColor: "rgba(196,96,122,0.07)",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderWidth: 0.5,
    borderColor: "rgba(196,96,122,0.2)",
  },
  didYouKnowLabel: {
    fontSize: 8,
    color: ROSE,
    letterSpacing: 2,
    textTransform: "uppercase",
    fontWeight: "700",
    marginBottom: 4,
  },
  didYouKnowText: {
    fontSize: 11,
    color: "rgba(245,237,214,0.65)",
    lineHeight: 18,
  },

  // Grapes
  grapeChipRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 5,
  },
  grapeChip: {
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  grapeChipPrimary: {
    backgroundColor: "rgba(123,29,58,0.35)",
    borderWidth: 0.5,
    borderColor: "rgba(196,96,122,0.3)",
  },
  grapeChipSecondary: {
    backgroundColor: "rgba(255,255,255,0.05)",
    borderWidth: 0.5,
    borderColor: "rgba(255,255,255,0.08)",
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  grapeChipText: {
    fontSize: 10,
    fontWeight: "500",
  },
  grapeChipTextPrimary: {
    color: CHAMPAGNE,
  },
  grapeChipTextSecondary: {
    fontSize: 9,
    color: "rgba(245,237,214,0.45)",
  },
  grapeHelper: {
    fontSize: 9,
    color: "rgba(245,237,214,0.3)",
    marginTop: 8,
  },

  // Log another button
  logAnotherBtn: {
    alignSelf: "flex-start",
    backgroundColor: "rgba(196,96,122,0.12)",
    borderRadius: 20,
    paddingHorizontal: 9,
    paddingVertical: 3,
    marginTop: 4,
  },
  logAnotherText: {
    fontSize: 9,
    color: ROSE,
    fontWeight: "500",
  },

  // QPR bar
  qprBarLabel: {
    fontSize: 9,
    color: "rgba(245,237,214,0.4)",
    marginBottom: 5,
  },
  qprBar: {
    flexDirection: "row",
    height: 5,
    borderRadius: 3,
    overflow: "hidden",
    gap: 1,
  },
  qprSegment: {
    height: "100%",
  },
  qprLegendRow: {
    flexDirection: "row",
    gap: 10,
    marginTop: 5,
  },
  qprLegendText: {
    fontSize: 8,
    fontWeight: "500",
  },

  // Community pulse
  communityCardRow: {
    flexDirection: "row",
    gap: 6,
  },
  communityCard: {
    flex: 1,
    backgroundColor: "rgba(255,255,255,0.04)",
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  communityCardWine: {
    fontFamily: fonts.serif.light,
    fontSize: 12,
    color: CHAMPAGNE,
    marginBottom: 2,
  },
  communityCardSub: {
    fontSize: 9,
    color: "rgba(245,237,214,0.4)",
  },

  // Recommendation cards
  recCardRow: {
    flexDirection: "row",
    gap: 6,
  },
  recCard: {
    flex: 1,
    backgroundColor: "rgba(255,255,255,0.04)",
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 9,
    borderWidth: 0.5,
    borderColor: "rgba(255,255,255,0.06)",
  },
  recCardName: {
    fontFamily: fonts.serif.light,
    fontSize: 13,
    color: CHAMPAGNE,
    marginBottom: 3,
  },
  recCardWhy: {
    fontSize: 9,
    color: "rgba(245,237,214,0.42)",
    lineHeight: 13,
  },

  // Winemakers
  winemakerRow: {
    flexDirection: "row",
    gap: 10,
    alignItems: "flex-start",
    marginBottom: 8,
  },
  winemakerAccent: {
    width: 3,
    alignSelf: "stretch",
    backgroundColor: ROSE,
    borderRadius: 2,
    opacity: 0.6,
    flexShrink: 0,
  },
  winemakerName: {
    fontFamily: fonts.serif.light,
    fontSize: 13,
    color: CHAMPAGNE,
    marginBottom: 2,
  },
  winemakerNote: {
    fontSize: 10,
    color: "rgba(245,237,214,0.5)",
    lineHeight: 14,
  },

  // Appellations
  zoneRow: {
    marginBottom: 7,
  },
  zoneName: {
    fontSize: 10,
    color: "rgba(245,237,214,0.7)",
    fontWeight: "500",
    marginBottom: 2,
  },
  zoneNote: {
    fontSize: 9,
    color: "rgba(245,237,214,0.4)",
    lineHeight: 13,
  },

  // Food pairings
  pairingRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
  },
  pairingChip: {
    backgroundColor: "rgba(255,255,255,0.06)",
    borderRadius: 20,
    paddingHorizontal: 11,
    paddingVertical: 5,
    borderWidth: 0.5,
    borderColor: "rgba(255,255,255,0.08)",
  },
  pairingChipText: {
    fontSize: 10,
    color: "rgba(245,237,214,0.6)",
  },

  // Fun facts
  factRow: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 8,
  },
  factBullet: {
    color: ROSE,
    fontSize: 9,
    flexShrink: 0,
    marginTop: 1,
  },
  factText: {
    fontSize: 10,
    color: "rgba(245,237,214,0.55)",
    lineHeight: 16,
    flex: 1,
  },

  // Attribution
  attribution: {
    fontSize: 10,
    color: "rgba(245,237,214,0.2)",
    textAlign: "center",
    paddingTop: 16,
    paddingHorizontal: 18,
  },
});

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
    if (c.key_regions?.length) glanceCards.push({ label: "Key Regions", value: c.key_regions as string[] });
  } else if (profileType === "producer") {
    if (c.key_regions?.length) glanceCards.push({ label: "Region", value: c.key_regions as string[] });
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
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.screenBg }}
      contentContainerStyle={{ paddingBottom: 48 }}
      showsVerticalScrollIndicator={false}
    >
      <View style={fb.hero}>
        {hasHeroImage ? (
          <Image source={{ uri: profile.hero_image_url }} style={StyleSheet.absoluteFillObject} resizeMode="cover" onError={onHeroError} />
        ) : null}
        <View style={[fb.heroOverlay, !hasHeroImage && fb.heroOverlayNoImage]} />
        <Pressable onPress={() => router.back()} style={r.backBtn}>
          <AppText style={r.backBtnArrow}>{"←"}</AppText>
          <AppText style={r.backBtnLabel}>Back</AppText>
        </Pressable>
        <View style={fb.heroContent}>
          <AppText style={fb.typeBadge}>{profileType === "grape" ? "GRAPE VARIETY" : "PRODUCER"}</AppText>
          <AppText style={fb.heroTitle}>{profile.display_name}</AppText>
          {c.tagline ? <AppText style={fb.heroTagline}>{c.tagline}</AppText> : null}
        </View>
      </View>

      {glanceCards.length > 0 ? (
        <View style={fb.section}>
          <AppText style={fb.sectionTitle}>AT A GLANCE</AppText>
          {glanceCards.map((card) => (
            <View key={card.label} style={fb.infoCard}>
              <AppText style={fb.infoLabel}>{card.label}</AppText>
              <AppText style={fb.infoValue}>{Array.isArray(card.value) ? card.value.join(", ") : card.value}</AppText>
            </View>
          ))}
        </View>
      ) : null}

      {personal_stats.entry_count > 0 ? (
        <View style={fb.card}>
          <AppText style={fb.cardLabel}>YOUR HISTORY</AppText>
          <AppText style={fb.cardText}>
            You've logged {personal_stats.entry_count} {personal_stats.entry_count === 1 ? "wine" : "wines"}
            {personal_stats.avg_rating > 0 ? ` with an average rating of ${personal_stats.avg_rating.toFixed(1)}` : ""}
          </AppText>
        </View>
      ) : null}

      {storyParts.length > 0 ? (
        <View style={fb.section}>
          <AppText style={fb.sectionTitle}>THE STORY</AppText>
          <AppText style={fb.storyText}>{storyParts.join("\n\n")}</AppText>
        </View>
      ) : null}

      {sensoryEntries.length > 0 ? (
        <View style={fb.section}>
          <AppText style={fb.sectionTitle}>SENSORY PROFILE</AppText>
          <View style={fb.card}>
            {sensoryEntries.map(([key, value]) => (
              <View key={key} style={fb.sensoryRow}>
                <View style={fb.sensoryLabelRow}>
                  <AppText style={fb.sensoryLabel}>{key.charAt(0).toUpperCase() + key.slice(1)}</AppText>
                  <AppText style={fb.sensoryValue}>{value.toFixed(1)}</AppText>
                </View>
                <View style={fb.sensoryTrack}>
                  <View style={[fb.sensoryFill, { width: `${Math.max(0, Math.min(100, (value / 5) * 100))}%` }]} />
                </View>
              </View>
            ))}
          </View>
        </View>
      ) : null}

      {c.food_pairings && c.food_pairings.length > 0 ? (
        <View style={fb.section}>
          <AppText style={fb.sectionTitle}>FOOD PAIRINGS</AppText>
          <View style={r.pairingRow}>
            {c.food_pairings.map((item: string) => (
              <View key={item} style={r.pairingChip}>
                <AppText style={r.pairingChipText}>{item}</AppText>
              </View>
            ))}
          </View>
        </View>
      ) : null}

      {relatedItems.length > 0 ? (
        <View style={fb.section}>
          <AppText style={fb.sectionTitle}>RELATED</AppText>
          {relatedItems.map((item) => (
            <Pressable
              key={`${item.type}-${item.name}`}
              style={fb.relatedItem}
              onPress={() => router.push(`/(app)/explore/${item.type}/${toExploreSlug(item.name)}`)}
            >
              <AppText style={fb.relatedName}>{item.name}</AppText>
              <AppText style={fb.relatedArrow}>{"→"}</AppText>
            </Pressable>
          ))}
        </View>
      ) : null}

      {profile.hero_image_attribution ? (
        <AppText style={r.attribution}>Photo by {profile.hero_image_attribution.photographer}</AppText>
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
      <View style={{ flex: 1, backgroundColor: DEVICE_BG, alignItems: "center", justifyContent: "center" }}>
        <ActivityIndicator color={ROSE} size="large" />
      </View>
    );
  }

  if (error || !data) {
    return (
      <View style={{ flex: 1, backgroundColor: DEVICE_BG, alignItems: "center", justifyContent: "center", paddingHorizontal: 24, gap: 12 }}>
        <AppText style={{ fontFamily: fonts.serif.light, fontSize: 20, color: CHAMPAGNE, textAlign: "center" }}>Unable to load profile</AppText>
        <AppText style={{ fontSize: 13, color: "rgba(245,237,214,0.6)", textAlign: "center", lineHeight: 18 }}>{error ?? "Something went wrong."}</AppText>
        <Pressable style={{ paddingVertical: 8 }} onPress={() => router.back()}>
          <AppText style={{ fontSize: 13, color: "rgba(245,237,214,0.5)", fontWeight: "600" }}>Go back</AppText>
        </Pressable>
      </View>
    );
  }

  const profileType = data.profile.type as ExploreProfileType;

  if (profileType === "region") {
    return <RegionPage data={data} heroFailed={heroFailed} onHeroError={() => setHeroFailed(true)} />;
  }
  if (profileType === "grape") {
    return <VarietalPage data={data} heroFailed={heroFailed} onHeroError={() => setHeroFailed(true)} />;
  }
  if (profileType === "producer") {
    return <ProducerPage data={data} heroFailed={heroFailed} onHeroError={() => setHeroFailed(true)} />;
  }
  return <FallbackProfilePage data={data} heroFailed={heroFailed} onHeroError={() => setHeroFailed(true)} />;
}

// ─── Fallback styles ────────────────────────────────────────

const fb = StyleSheet.create({
  hero: { height: 250, position: "relative", justifyContent: "flex-end", overflow: "hidden" },
  heroOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(12,8,16,0.55)" },
  heroOverlayNoImage: { backgroundColor: colors.surfacePrimary },
  heroContent: { paddingHorizontal: 18, paddingBottom: 18, gap: 4 },
  typeBadge: { fontSize: 9, color: colors.accentSecondary, letterSpacing: 2, fontWeight: "700", marginBottom: 4 },
  heroTitle: { fontFamily: fonts.serif.light, fontSize: 28, color: colors.textPrimary, lineHeight: 34 },
  heroTagline: { fontSize: 13, color: colors.textSecondary, lineHeight: 18 },
  section: { paddingHorizontal: 18, gap: 10, marginTop: 18 },
  sectionTitle: { color: colors.textTertiary, fontSize: 9, fontWeight: "700", letterSpacing: 2, textTransform: "uppercase" },
  card: { borderRadius: 16, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surfacePrimary, padding: 14, gap: 8, marginHorizontal: 18, marginTop: 14 },
  cardLabel: { color: colors.textTertiary, fontSize: 9, fontWeight: "700", letterSpacing: 2, textTransform: "uppercase" },
  cardText: { color: colors.textSecondary, fontSize: 13, lineHeight: 18 },
  infoCard: { borderRadius: 16, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surfacePrimary, padding: 14, gap: 4 },
  infoLabel: { color: colors.textTertiary, fontSize: 9, fontWeight: "700", letterSpacing: 2, textTransform: "uppercase" },
  infoValue: { color: colors.textPrimary, fontSize: 13, lineHeight: 18 },
  storyText: { color: colors.textSecondary, fontSize: 13, lineHeight: 20 },
  sensoryRow: { gap: 3 },
  sensoryLabelRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  sensoryLabel: { color: colors.textSecondary, fontSize: 12 },
  sensoryValue: { color: colors.textPrimary, fontSize: 12, fontWeight: "700" },
  sensoryTrack: { height: 5, borderRadius: 3, backgroundColor: colors.surfaceHover },
  sensoryFill: { height: "100%", borderRadius: 3, backgroundColor: colors.accentPrimary },
  relatedItem: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", borderRadius: 12, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surfacePrimary, paddingHorizontal: 14, paddingVertical: 10, marginTop: 6 },
  relatedName: { color: colors.textPrimary, fontSize: 13, fontWeight: "600" },
  relatedArrow: { color: colors.textTertiary, fontSize: 14 },
});

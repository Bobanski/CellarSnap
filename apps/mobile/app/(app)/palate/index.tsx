import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from "react-native";
import Svg, { Circle, Line, Polygon, Text as SvgText } from "react-native-svg";
import { useRouter } from "expo-router";
import { AppText } from "@/src/components/AppText";
import { colors } from "@/src/lib/theme";
import { fonts } from "@/src/lib/typography";
import {
  fetchPalateData,
  type PalateData,
  type RadarPoint,
} from "@/src/lib/api/palate";

// ─── Radar chart (native SVG) ────────────────────────────────

function toXY(value: number, index: number, total: number, radius: number, cx: number, cy: number, scaleMin: number, scaleMax: number) {
  const angle = (Math.PI * 2 * index) / total - Math.PI / 2;
  const range = scaleMax - scaleMin;
  const normalized = 0.10 + ((Math.max(scaleMin, Math.min(scaleMax, value)) - scaleMin) / range) * 0.90;
  const r = normalized * radius;
  return { x: cx + Math.cos(angle) * r, y: cy + Math.sin(angle) * r };
}

function polygonPoints(points: RadarPoint[], accessor: "neutral" | "user", radius: number, cx: number, cy: number, sMin: number, sMax: number) {
  return points.map((p, i) => {
    const { x, y } = toXY(p[accessor], i, points.length, radius, cx, cy, sMin, sMax);
    return `${x},${y}`;
  }).join(" ");
}

function RadarChart({ points }: { points: RadarPoint[] }) {
  if (points.length === 0) return null;

  const size = 300;
  const cx = size / 2;
  const cy = size / 2;
  const radius = 110;

  const values = points.flatMap((p) => [p.user, p.neutral]);
  const dataMin = Math.min(...values);
  const dataMax = Math.max(...values);
  const sMin = Math.max(1, Math.floor((dataMin - 0.5) * 2) / 2);
  const sMax = Math.min(5, Math.ceil((dataMax + 0.5) * 2) / 2);
  const range = sMax - sMin;
  const ringCount = 4;
  const rings = Array.from({ length: ringCount }, (_, i) => sMin + ((i + 1) / ringCount) * range);
  const neutralRing = rings.reduce((c, r) => Math.abs(r - 3) < Math.abs(c - 3) ? r : c);

  return (
    <View style={rs.container}>
      <View style={rs.legendRow}>
        <View style={rs.legendItem}>
          <View style={[rs.legendDot, { backgroundColor: "rgba(196,96,122,0.3)" }]} />
          <AppText style={rs.legendText}>Neutral</AppText>
        </View>
        <View style={rs.legendItem}>
          <View style={[rs.legendDot, { backgroundColor: colors.rose }]} />
          <AppText style={rs.legendText}>Your palate</AppText>
        </View>
      </View>
      <View style={rs.chartWrap}>
        <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
          {/* Grid rings */}
          {rings.map((ring) => (
            <Polygon
              key={ring}
              points={points.map((_, i) => {
                const { x, y } = toXY(ring, i, points.length, radius, cx, cy, sMin, sMax);
                return `${x},${y}`;
              }).join(" ")}
              fill="none"
              stroke={ring === neutralRing ? "rgba(196,96,122,0.14)" : "rgba(196,96,122,0.06)"}
              strokeWidth={ring === neutralRing ? 1.5 : 1}
            />
          ))}

          {/* Spokes + labels */}
          {points.map((point, i) => {
            const angle = (Math.PI * 2 * i) / points.length - Math.PI / 2;
            const end = toXY(sMax, i, points.length, radius, cx, cy, sMin, sMax);
            const lr = radius + 22;
            const lx = cx + Math.cos(angle) * lr;
            const ly = cy + Math.sin(angle) * lr;
            const anchor = lx < cx - 10 ? "end" : lx > cx + 10 ? "start" : "middle";
            return (
              <Line key={point.key} x1={cx} y1={cy} x2={end.x} y2={end.y} stroke="rgba(196,96,122,0.06)" strokeWidth={1} />
            );
          })}
          {points.map((point, i) => {
            const angle = (Math.PI * 2 * i) / points.length - Math.PI / 2;
            const lr = radius + 22;
            const lx = cx + Math.cos(angle) * lr;
            const ly = cy + Math.sin(angle) * lr;
            const anchor = lx < cx - 10 ? "end" : lx > cx + 10 ? "start" : "middle";
            return (
              <SvgText
                key={`label-${point.key}`}
                x={lx}
                y={ly}
                textAnchor={anchor}
                alignmentBaseline="middle"
                fill="rgba(155,147,168,0.9)"
                fontSize={10}
                fontWeight="500"
              >
                {point.label}
              </SvgText>
            );
          })}

          {/* Neutral baseline */}
          <Polygon
            points={polygonPoints(points, "neutral", radius, cx, cy, sMin, sMax)}
            fill="rgba(196,96,122,0.03)"
            stroke="rgba(196,96,122,0.18)"
            strokeWidth={1}
            strokeDasharray="4,4"
          />

          {/* User palate */}
          <Polygon
            points={polygonPoints(points, "user", radius, cx, cy, sMin, sMax)}
            fill="rgba(196,96,122,0.12)"
            stroke={colors.rose}
            strokeWidth={2.5}
            strokeLinejoin="round"
          />

          {/* Dots */}
          {points.map((point, i) => {
            const { x, y } = toXY(point.user, i, points.length, radius, cx, cy, sMin, sMax);
            return (
              <Circle key={`dot-${point.key}`} cx={x} cy={y} r={3.5} fill={colors.rose} stroke={colors.screenBg} strokeWidth={1.5} />
            );
          })}
        </Svg>
      </View>
    </View>
  );
}

const rs = StyleSheet.create({
  container: { gap: 8 },
  legendRow: { flexDirection: "row", justifyContent: "center", gap: 16 },
  legendItem: { flexDirection: "row", alignItems: "center", gap: 5 },
  legendDot: { width: 8, height: 8, borderRadius: 999 },
  legendText: { color: colors.textTertiary, fontSize: 10 },
  chartWrap: {
    borderRadius: 14,
    backgroundColor: colors.screenBg,
    padding: 8,
    alignItems: "center",
  },
});

// ─── Sensory bar ─────────────────────────────────────────────

function SensoryBar({ label, value }: { label: string; value: number }) {
  const pct = Math.max(0, Math.min(100, (value / 5) * 100));
  const isHigh = value >= 3.8;
  return (
    <View style={bs.row}>
      <View style={bs.labelRow}>
        <AppText style={bs.label}>{label}</AppText>
        <AppText style={[bs.value, isHigh && bs.valueHigh]}>{value.toFixed(1)}</AppText>
      </View>
      <View style={bs.track}>
        <View style={[bs.fill, isHigh && bs.fillHigh, { width: `${pct}%` }]} />
      </View>
    </View>
  );
}

const bs = StyleSheet.create({
  row: { gap: 3 },
  labelRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  label: { color: colors.textSecondary, fontSize: 12 },
  value: { color: colors.textPrimary, fontSize: 12, fontWeight: "700" },
  valueHigh: { color: colors.accentSecondary },
  track: { height: 5, borderRadius: 3, backgroundColor: colors.surfaceHover },
  fill: { height: "100%", borderRadius: 3, backgroundColor: colors.accentPrimary },
  fillHigh: { backgroundColor: colors.accentSecondary },
});

// ─── Type distribution bar ───────────────────────────────────

function TypeBar({ stats }: { stats: PalateData["wineTypeStats"] }) {
  const typeColors: Record<string, string> = {
    Red: "#7B1D3A", White: "#C9A84C", Sparkling: "#7C8FE6",
    Rosé: "#C4607A", Orange: "#D4A574", Sweet: "#9B2449",
  };
  return (
    <View style={{ gap: 8 }}>
      <View style={tb.bar}>
        {stats.map((s) => (
          <View key={s.type} style={[tb.segment, { width: `${s.pct}%`, backgroundColor: typeColors[s.type] ?? colors.surfaceHover }]} />
        ))}
      </View>
      <View style={tb.legend}>
        {stats.map((s) => (
          <View key={s.type} style={tb.legendItem}>
            <View style={[tb.legendDot, { backgroundColor: typeColors[s.type] ?? colors.surfaceHover }]} />
            <AppText style={tb.legendText}>{s.type} {s.pct}%</AppText>
          </View>
        ))}
      </View>
    </View>
  );
}

const tb = StyleSheet.create({
  bar: { height: 10, borderRadius: 5, flexDirection: "row", overflow: "hidden" },
  segment: { minWidth: 3 },
  legend: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  legendItem: { flexDirection: "row", alignItems: "center", gap: 4 },
  legendDot: { width: 7, height: 7, borderRadius: 999 },
  legendText: { color: colors.textSecondary, fontSize: 11 },
});

// ─── Main screen ─────────────────────────────────────────────

export default function PalateScreen() {
  const router = useRouter();
  const [data, setData] = useState<PalateData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const result = await fetchPalateData();
      if (result.ok) {
        setData(result.data);
      } else {
        setError(result.errorMessage);
      }
      setLoading(false);
    })();
  }, []);

  if (loading) {
    return (
      <View style={[ps.screen, ps.center]}>
        <ActivityIndicator color={colors.accentSecondary} size="large" />
      </View>
    );
  }

  if (error || !data) {
    return (
      <View style={[ps.screen, ps.center, { paddingHorizontal: 24, gap: 12 }]}>
        <AppText style={ps.emptyTitle}>Unable to load palate</AppText>
        <AppText style={ps.emptySubtitle}>{error ?? "Something went wrong."}</AppText>
        <Pressable style={ps.backBtn} onPress={() => router.back()}>
          <AppText style={ps.backBtnText}>Go back</AppText>
        </Pressable>
      </View>
    );
  }

  // Gate: require at least 8 entries
  if (data.gated) {
    return (
      <View style={[ps.screen, ps.center, { paddingHorizontal: 24, gap: 14 }]}>
        <AppText style={ps.emptyTitle}>Almost there</AppText>
        <AppText style={ps.emptySubtitle}>
          Log {data.entriesNeeded} more {data.entriesNeeded === 1 ? "wine" : "wines"} to unlock your palate profile.
          You have {data.totalRated} so far.
        </AppText>
        <Pressable
          style={ps.primaryBtn}
          onPress={() => router.push("/(app)/entries/new")}
        >
          <AppText style={ps.primaryBtnText}>Log a wine</AppText>
        </Pressable>
        <Pressable style={ps.backBtn} onPress={() => router.back()}>
          <AppText style={ps.backBtnText}>Go back</AppText>
        </Pressable>
      </View>
    );
  }

  const hasData = data.totalRated > 0 || data.hasSurvey;

  return (
    <View style={ps.screen}>
      <ScrollView contentContainerStyle={ps.scroll} showsVerticalScrollIndicator={false}>
        {/* Back arrow */}
        <Pressable onPress={() => router.back()} style={ps.backArrow}>
          <AppText style={ps.backArrowText}>{"\u2190"}</AppText>
        </Pressable>

        {/* Hero */}
        <View style={ps.heroBlock}>
          <AppText style={ps.eyebrow}>YOUR PALATE</AppText>
          {data.topStyle ? (
            <AppText style={ps.heroTitle}>
              Your style is{" "}
              <AppText style={ps.heroAccent}>{data.topStyle}</AppText>
            </AppText>
          ) : (
            <AppText style={ps.heroTitle}>Your taste profile</AppText>
          )}
          <AppText style={ps.heroSubtitle}>
            {data.totalRated > 0
              ? `Based on ${data.totalRated} rated wines across ${data.regionCount} ${data.regionCount === 1 ? "country" : "countries"}`
              : data.hasSurvey
                ? "Based on your taste quiz answers"
                : "Take the taste quiz or log wines to build your profile"}
          </AppText>
          <Pressable onPress={() => router.push("/(app)/taste-survey")}>
            <AppText style={ps.editLink}>
              {data.hasSurvey ? "Edit taste preferences \u2192" : "Take the taste quiz \u2192"}
            </AppText>
          </Pressable>
        </View>

        {!hasData ? (
          <View style={ps.emptyCard}>
            <AppText style={ps.emptyTitle}>Nothing here yet</AppText>
            <AppText style={ps.emptySubtitle}>
              Take the taste quiz or log a few wines to start building your profile.
            </AppText>
          </View>
        ) : (
          <>
            {/* Insight pills */}
            {data.insights.length > 0 ? (
              <View style={ps.insightRow}>
                {data.insights.map((insight) => (
                  <View key={insight} style={ps.insightPill}>
                    <AppText style={ps.insightText}>{insight}</AppText>
                  </View>
                ))}
              </View>
            ) : null}

            {/* Top grapes + regions */}
            <View style={ps.twoCol}>
              <View style={ps.card}>
                <AppText style={ps.cardLabel}>TOP GRAPES</AppText>
                {data.topGrapes.length > 0 ? (
                  data.topGrapes.map((g, i) => (
                    <View key={g.name} style={ps.statRow}>
                      <AppText style={[ps.statName, i === 0 && ps.statNameBold]}>{g.name}</AppText>
                      <View style={ps.countBadge}>
                        <AppText style={ps.countBadgeText}>{g.count}</AppText>
                      </View>
                    </View>
                  ))
                ) : data.surveyFallback?.varietals.length ? (
                  <AppText style={ps.fallbackText}>
                    You said: {data.surveyFallback.varietals.join(", ")}
                  </AppText>
                ) : (
                  <AppText style={ps.emptyHint}>Log wines with grapes to see patterns</AppText>
                )}
              </View>

              <View style={ps.card}>
                <AppText style={ps.cardLabel}>TOP REGIONS</AppText>
                {data.regionStats.length > 0 ? (
                  data.regionStats.slice(0, 4).map((r, i) => (
                    <View key={r.region} style={ps.statRow}>
                      <AppText style={[ps.statName, i === 0 && ps.statNameBold]}>{r.region}</AppText>
                      <AppText style={[ps.deltaText, r.delta > 0.5 && ps.deltaPositive]}>
                        {(r as { deltaLabel?: string }).deltaLabel ?? "On par"}
                      </AppText>
                    </View>
                  ))
                ) : data.surveyFallback?.regions.length ? (
                  <AppText style={ps.fallbackText}>
                    You said: {data.surveyFallback.regions.join(", ")}
                  </AppText>
                ) : (
                  <AppText style={ps.emptyHint}>Log more wines to see patterns</AppText>
                )}
              </View>
            </View>

            {/* Wine type distribution */}
            {data.wineTypeStats.length > 0 ? (
              <View style={ps.card}>
                <AppText style={ps.cardLabel}>WHAT YOU DRINK</AppText>
                <TypeBar stats={data.wineTypeStats} />
              </View>
            ) : null}

            {/* Radar chart */}
            {data.radarPoints.length > 0 ? (
              <View style={ps.card}>
                <AppText style={ps.cardLabel}>SENSORY MAP</AppText>
                <RadarChart points={data.radarPoints} />
              </View>
            ) : null}

            {/* Leans into / avoids */}
            {(data.leansInto.length > 0 || data.avoids.length > 0) ? (
              <View style={ps.card}>
                {data.leansInto.length > 0 ? (
                  <View style={{ gap: 8 }}>
                    <AppText style={ps.signalLabel}>YOU LEAN INTO</AppText>
                    {data.leansInto.map((s) => (
                      <SensoryBar key={s.axis} label={s.label} value={s.value} />
                    ))}
                  </View>
                ) : null}
                {data.avoids.length > 0 ? (
                  <View style={{ gap: 8, marginTop: data.leansInto.length > 0 ? 16 : 0 }}>
                    <AppText style={ps.signalLabelMuted}>YOU TEND TO AVOID</AppText>
                    {data.avoids.map((s) => (
                      <SensoryBar key={s.axis} label={s.label} value={s.value} />
                    ))}
                  </View>
                ) : null}
              </View>
            ) : null}

            {/* Per-type breakdown */}
            {data.typeBreakdown.length > 1 ? (
              <View style={ps.card}>
                <AppText style={ps.cardLabel}>TASTE BY STYLE</AppText>
                <AppText style={ps.cardSubtitle}>
                  How your preferences differ across wine types
                </AppText>
                <View style={{ gap: 10, marginTop: 8 }}>
                  {data.typeBreakdown.map((item) => (
                    <View key={item.wineType} style={ps.typeCard}>
                      <View style={ps.typeHeader}>
                        <AppText style={ps.typeName}>{item.wineType}</AppText>
                        <AppText style={ps.typeCount}>{item.eventCount} entries</AppText>
                      </View>
                      <View style={{ gap: 6 }}>
                        {item.topAxes.map((a) => (
                          <SensoryBar key={`${item.wineType}-${a.axis}`} label={a.label} value={a.value} />
                        ))}
                      </View>
                    </View>
                  ))}
                </View>
              </View>
            ) : null}

            {/* Confidence footer */}
            <View style={ps.confidenceFooter}>
              <View style={{ flex: 1 }}>
                <AppText style={ps.confidenceTitle}>
                  Profile confidence: {data.preferenceStrength.label}
                </AppText>
                <AppText style={ps.confidenceDetail}>
                  {data.preferenceStrength.detail}
                </AppText>
              </View>
              <View style={ps.confidenceTrack}>
                <View style={[ps.confidenceFill, { width: `${data.preferenceStrength.progress}%` }]} />
              </View>
            </View>
          </>
        )}
      </ScrollView>
    </View>
  );
}

// ─── Styles ──────────────────────────────────────────────────

const ps = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.screenBg },
  center: { alignItems: "center", justifyContent: "center" },
  scroll: { paddingHorizontal: 18, paddingTop: 12, paddingBottom: 48, gap: 14 },

  backArrow: {
    width: 34, height: 34, borderRadius: 999, borderWidth: 1,
    borderColor: colors.border, alignItems: "center", justifyContent: "center",
  },
  backArrowText: { color: colors.textPrimary, fontSize: 16, fontWeight: "700" },

  heroBlock: { gap: 4 },
  eyebrow: {
    color: colors.accentSecondary, fontSize: 9, fontWeight: "700",
    letterSpacing: 3, textTransform: "uppercase",
  },
  heroTitle: {
    color: colors.textPrimary, fontFamily: fonts.serif.light,
    fontSize: 26, lineHeight: 32,
  },
  heroAccent: { color: colors.accentSecondary },
  heroSubtitle: { color: colors.textSecondary, fontSize: 13, lineHeight: 18 },
  editLink: { color: colors.textTertiary, fontSize: 12, fontWeight: "600", marginTop: 2 },

  insightRow: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  insightPill: {
    borderRadius: 999, borderWidth: 1, borderColor: colors.accentRose,
    backgroundColor: colors.accentSoft, paddingHorizontal: 10, paddingVertical: 5,
  },
  insightText: { color: colors.accentSecondary, fontSize: 11, fontWeight: "600" },

  twoCol: { flexDirection: "row", gap: 10 },
  card: {
    flex: 1, borderRadius: 16, borderWidth: 1, borderColor: colors.border,
    backgroundColor: colors.surfacePrimary, padding: 14, gap: 8,
  },
  cardLabel: {
    color: colors.textTertiary, fontSize: 9, fontWeight: "700",
    letterSpacing: 2, textTransform: "uppercase",
  },
  cardSubtitle: { color: colors.textSecondary, fontSize: 12, lineHeight: 16 },

  statRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  statName: { color: colors.textSecondary, fontSize: 13 },
  statNameBold: { color: colors.textPrimary, fontWeight: "700" },
  countBadge: {
    borderRadius: 999, borderWidth: 1, borderColor: colors.border,
    backgroundColor: colors.surfaceMuted, paddingHorizontal: 7, paddingVertical: 2,
  },
  countBadgeText: { color: colors.textTertiary, fontSize: 10, fontWeight: "700" },
  countText: { color: colors.textTertiary, fontSize: 10 },
  deltaText: { color: colors.textTertiary, fontSize: 10, fontWeight: "700" },
  deltaPositive: { color: "#34d399" },
  fallbackText: { color: colors.textSecondary, fontSize: 12 },
  emptyHint: { color: colors.textTertiary, fontSize: 11 },

  signalLabel: {
    color: colors.accentSecondary, fontSize: 9, fontWeight: "700",
    letterSpacing: 2, textTransform: "uppercase",
  },
  signalLabelMuted: {
    color: colors.textTertiary, fontSize: 9, fontWeight: "700",
    letterSpacing: 2, textTransform: "uppercase",
  },

  typeCard: {
    borderRadius: 12, borderWidth: 1, borderColor: colors.border,
    backgroundColor: colors.surfaceMuted, padding: 12, gap: 8,
  },
  typeHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  typeName: { color: colors.textPrimary, fontSize: 13, fontWeight: "700" },
  typeCount: { color: colors.textTertiary, fontSize: 10, fontWeight: "600" },

  confidenceFooter: {
    flexDirection: "row", alignItems: "center", gap: 12,
    borderRadius: 12, borderWidth: 1, borderColor: colors.border,
    backgroundColor: colors.surfaceTinted, paddingHorizontal: 14, paddingVertical: 10,
  },
  confidenceTitle: { color: colors.textPrimary, fontSize: 12, fontWeight: "700" },
  confidenceDetail: { color: colors.textTertiary, fontSize: 10, lineHeight: 14 },
  confidenceTrack: { width: 80, height: 5, borderRadius: 3, backgroundColor: colors.surfaceHover },
  confidenceFill: { height: "100%", borderRadius: 3, backgroundColor: colors.accentSecondary },

  emptyCard: {
    borderRadius: 16, borderWidth: 1, borderColor: colors.border,
    backgroundColor: colors.surfacePrimary, padding: 20, alignItems: "center", gap: 8,
  },
  emptyTitle: {
    color: colors.textPrimary, fontFamily: fonts.serif.light,
    fontSize: 20, textAlign: "center",
  },
  emptySubtitle: { color: colors.textSecondary, fontSize: 13, textAlign: "center", lineHeight: 18 },
  primaryBtn: {
    borderRadius: 12, backgroundColor: colors.accentPrimary,
    paddingHorizontal: 24, paddingVertical: 14,
  },
  primaryBtnText: { color: colors.textOnAccent, fontSize: 14, fontWeight: "700" },
  backBtn: { paddingVertical: 8 },
  backBtnText: { color: colors.textTertiary, fontSize: 13, fontWeight: "600" },
});

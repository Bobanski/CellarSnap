"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import AppImage from "@/components/AppImage";

// ─── Constants ─────────────────────────────────────────────

const CHAMPAGNE = "#F5EDD6";
const FOG = "#A08878";
const ROSE = "#C4607A";
const GRENACHE = "#7B1D3A";
const NEBBIOLO = "#4A3060";
const VERDOT = "#3D6B4F";
const VIOGNIER = "#C9A84C";
const BG_ODD = "#220E14";
const BG_EVEN = "#2E1420";
const DEVICE_BG = "#220E14";
const SECTION_BORDER = "rgba(196,96,122,0.06)";
const SERIF = "var(--font-serif)";
const SANS = "var(--font-sans)";

// ─── Types ─────────────────────────────────────────────────

type ProfileType = "grape" | "region" | "producer" | "concept";

type ProfileContent = {
  tagline?: string;
  origin?: string;
  characteristics?: string;
  body?: string;
  acidity?: string;
  tannin?: string;
  climate?: string;
  style?: string;
  classification?: string;
  country?: string;
  key_regions?: Array<string | { name: string; context: string }>;
  key_grapes?: Array<string | { name: string; context: string }>;
  key_wines?: Array<string | { name: string; desc: string; rating: string }>;
  appellations?: Array<string | { name: string; character: string }>;
  food_pairings?: string[];
  fun_fact?: string;
  fun_facts?: string[];
  related_grapes?: string[];
  related_regions?: string[];
  related_producers?: string[];
  founded?: string;
  grapes?: string[];
  aging_potential?: string;
  story?: string;
  notable_winemakers?: Array<{ name: string; why: string }>;
  flavor_profile?: { Tannin: number; Acidity: number; Body: number; Oak: number; Fruit: number };
  most_loved_producer?: { name: string; avg_rating: number };
  best_qpr_producer?: { name: string; avg_rating: number };
  recommendation_picks?: Array<{ name: string; type: string; why: string }>;
  zone_descriptions?: Array<{ name: string; note: string }>;
  personal_insight?: string;
  where_it_grows?: Array<{ name: string; size: string }>;
  styles_expressions?: Array<{ style: string; desc: string; example: string }>;
  notable_producers?: Array<{ name: string; note: string }>;
  philosophy_tags?: Array<{ tag: string; note: string }>;
  region_grapes?: string[];
  similar_producers?: Array<{ name: string; why: string }>;
};

type CommunityQpr = {
  extortion: number;
  pricey: number;
  spot_on: number;
  good_value: number;
  absolute_steal: number;
  total: number;
};

type ProfileResponse = {
  profile: {
    type: string;
    slug: string;
    display_name: string;
    content: ProfileContent;
    hero_image_url?: string | null;
    hero_image_attribution?: { photographer: string; url: string } | null;
    sensory_data?: Record<string, number> | null;
  };
  personal_stats: { entry_count: number; avg_rating: number; label_photos: string[] };
  community_qpr?: CommunityQpr | null;
  generating?: boolean;
};

// ─── Helpers ───────────────────────────────────────────────

function toSlug(name: string): string {
  return name.toLowerCase().trim().replace(/\s+/g, "-");
}

function exploreHref(type: string, name: string): string {
  return `/explore/${type}/${toSlug(name)}`;
}

// ─── FlavorRadar (SVG pentagon for web) ────────────────────

const AXES: Array<"Tannin" | "Acidity" | "Body" | "Oak" | "Fruit"> = ["Tannin", "Acidity", "Body", "Oak", "Fruit"];

function radarPoint(cx: number, cy: number, r: number, i: number): [number, number] {
  const angle = (i * 2 * Math.PI) / 5 - Math.PI / 2;
  return [cx + r * Math.cos(angle), cy + r * Math.sin(angle)];
}

function radarPolygon(cx: number, cy: number, radius: number, values?: Record<string, number>): string {
  return AXES.map((axis, i) => {
    const scale = values ? (values[axis] ?? 0) / 100 : 1;
    const [x, y] = radarPoint(cx, cy, radius * scale, i);
    return `${x},${y}`;
  }).join(" ");
}

function FlavorRadar({ data, accentColor, size = 200 }: { data: Record<string, number>; accentColor: string; size?: number }) {
  const pad = 28;
  const vb = size + pad * 2;
  const cx = vb / 2;
  const cy = vb / 2;
  const maxR = size / 2 - 10;

  return (
    <svg width={size} height={size} viewBox={`0 0 ${vb} ${vb}`} className="mx-auto">
      {[0.33, 0.66, 1.0].map((level) => (
        <polygon key={level} points={radarPolygon(cx, cy, maxR * level)} fill="none" stroke="rgba(245,237,214,0.08)" strokeWidth="0.5" />
      ))}
      {AXES.map((_, i) => {
        const [x, y] = radarPoint(cx, cy, maxR, i);
        return <line key={i} x1={cx} y1={cy} x2={x} y2={y} stroke="rgba(245,237,214,0.08)" strokeWidth="0.5" />;
      })}
      <polygon points={radarPolygon(cx, cy, maxR, data)} fill={accentColor} fillOpacity={0.25} stroke={accentColor} strokeWidth={1} />
      {AXES.map((label, i) => {
        const [x, y] = radarPoint(cx, cy, maxR + 14, i);
        const angle = (i * 2 * Math.PI) / 5 - Math.PI / 2;
        const anchor = Math.cos(angle) > 0.1 ? "start" : Math.cos(angle) < -0.1 ? "end" : "middle";
        return <text key={label} x={x} y={y} fill="rgba(245,237,214,0.35)" fontSize="10" textAnchor={anchor} dominantBaseline="central">{label}</text>;
      })}
    </svg>
  );
}

// ─── Section wrapper ───────────────────────────────────────

function Section({ bg, children }: { bg: string; children: React.ReactNode }) {
  return (
    <div style={{ background: bg, borderBottom: `0.5px solid ${SECTION_BORDER}`, padding: "14px 16px" }}>
      {children}
    </div>
  );
}

function SectionLabel({ color, children }: { color?: string; children: React.ReactNode }) {
  return (
    <p style={{ fontFamily: SANS, fontSize: 8, color: color ?? FOG, letterSpacing: 2.5, textTransform: "uppercase", fontWeight: 700, marginBottom: 10 }}>
      {children}
    </p>
  );
}

function StoryTitle({ children }: { children: React.ReactNode }) {
  return <p style={{ fontFamily: SERIF, fontSize: 16, color: CHAMPAGNE, marginBottom: 8 }}>{children}</p>;
}

// Shown while the narrative content (tagline, story, flavor notes, etc.) is
// still being generated by OpenAI in the background — the page itself
// renders immediately with the title/hero, this just flags that the rest of
// the sections below are still on the way instead of silently being empty.
function GeneratingBanner() {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        padding: "10px 16px",
        background: "rgba(196,96,122,0.08)",
        borderBottom: `0.5px solid ${SECTION_BORDER}`,
      }}
    >
      <div className="h-3 w-3 animate-spin rounded-full border-2 border-[rgba(245,237,214,0.3)] border-t-[#C4607A]" />
      <span style={{ fontFamily: SANS, fontSize: 11, color: "rgba(245,237,214,0.6)" }}>
        Crafting your wine profile…
      </span>
    </div>
  );
}

// ─── QPR Bar ───────────────────────────────────────────────

function QprBar({ qpr, label }: { qpr: CommunityQpr; label: string }) {
  const pctSpotOn = Math.round((qpr.spot_on / qpr.total) * 100);
  const pctGoodValue = Math.round(((qpr.good_value + qpr.absolute_steal) / qpr.total) * 100);
  const pctPricey = Math.round((qpr.pricey / qpr.total) * 100);
  const pctExtortion = Math.round((qpr.extortion / qpr.total) * 100);

  return (
    <>
      <p style={{ fontFamily: SANS, fontSize: 9, color: "rgba(245,237,214,0.4)", marginBottom: 5 }}>{label}</p>
      <div style={{ display: "flex", height: 5, borderRadius: 3, overflow: "hidden", gap: 1 }}>
        {pctExtortion > 0 ? <div style={{ flex: pctExtortion, background: "rgba(184,48,96,0.75)" }} /> : null}
        {pctPricey > 0 ? <div style={{ flex: pctPricey, background: "rgba(92,85,80,0.75)" }} /> : null}
        {pctSpotOn > 0 ? <div style={{ flex: pctSpotOn, background: "rgba(61,107,79,0.75)" }} /> : null}
        {pctGoodValue > 0 ? <div style={{ flex: pctGoodValue, background: "rgba(123,29,58,0.75)" }} /> : null}
      </div>
      <div style={{ display: "flex", gap: 10, marginTop: 5 }}>
        {pctSpotOn > 0 ? <span style={{ fontFamily: SANS, fontSize: 8, color: VERDOT }}>{pctSpotOn}% Spot On</span> : null}
        {pctGoodValue > 0 ? <span style={{ fontFamily: SANS, fontSize: 8, color: GRENACHE }}>{pctGoodValue}% Good Value</span> : null}
        {pctPricey > 0 ? <span style={{ fontFamily: SANS, fontSize: 8, color: FOG }}>{pctPricey}% Pricey</span> : null}
      </div>
    </>
  );
}

// ─── Community Pulse section ───────────────────────────────

function CommunityPulse({ c, qpr, bg, displayName }: { c: ProfileContent; qpr?: CommunityQpr | null; bg: string; displayName: string }) {
  const hasQpr = qpr && qpr.total > 0;
  const hasProducers = c.most_loved_producer || c.best_qpr_producer;
  if (!hasQpr && !hasProducers) return null;

  const bestQprSub = hasQpr && ((qpr.good_value + qpr.absolute_steal) > 0)
    ? `Best QPR · ${Math.round(((qpr.good_value + qpr.absolute_steal) / qpr.total) * 100)}% said Good Value or better`
    : "Best QPR";

  return (
    <Section bg={bg}>
      <SectionLabel>COMMUNITY PULSE</SectionLabel>
      {hasQpr ? <QprBar qpr={qpr} label={`QPR across ${qpr.total} ${displayName} logs`} /> : null}
      {hasProducers ? (
        <div style={{ display: "flex", gap: 6, marginTop: hasQpr ? 10 : 0 }}>
          {c.most_loved_producer ? (
            <Link href={exploreHref("producer", c.most_loved_producer.name)} style={{ flex: 1, background: "rgba(255,255,255,0.04)", borderRadius: 8, padding: "8px 10px", textDecoration: "none" }}>
              <p style={{ fontFamily: SERIF, fontSize: 12, color: CHAMPAGNE, marginBottom: 2 }}>{c.most_loved_producer.name}</p>
              <p style={{ fontFamily: SANS, fontSize: 9, color: "rgba(245,237,214,0.4)" }}>Most loved · {c.most_loved_producer.avg_rating} avg</p>
            </Link>
          ) : null}
          {c.best_qpr_producer ? (
            <Link href={exploreHref("producer", c.best_qpr_producer.name)} style={{ flex: 1, background: "rgba(255,255,255,0.04)", borderRadius: 8, padding: "8px 10px", textDecoration: "none" }}>
              <p style={{ fontFamily: SERIF, fontSize: 12, color: CHAMPAGNE, marginBottom: 2 }}>{c.best_qpr_producer.name}</p>
              <p style={{ fontFamily: SANS, fontSize: 9, color: "rgba(245,237,214,0.4)" }}>{bestQprSub}</p>
            </Link>
          ) : null}
        </div>
      ) : null}
    </Section>
  );
}

// ─── Recommendations section ───────────────────────────────

function Recommendations({ picks, bg }: { picks: Array<{ name: string; type: string; why: string }>; bg: string }) {
  if (picks.length === 0) return null;
  return (
    <Section bg={bg}>
      <SectionLabel>IF YOU LIKE THIS, YOU MAY ALSO ENJOY...</SectionLabel>
      <div style={{ display: "flex", gap: 6 }}>
        {picks.map((rec) => (
          <Link key={rec.name} href={exploreHref(rec.type, rec.name)} style={{ flex: 1, background: "rgba(255,255,255,0.04)", borderRadius: 8, padding: "9px 8px", border: "0.5px solid rgba(255,255,255,0.06)", textDecoration: "none" }}>
            <p style={{ fontFamily: SERIF, fontSize: 12, color: CHAMPAGNE, marginBottom: 3 }}>{rec.name}</p>
            <p style={{ fontFamily: SANS, fontSize: 9, color: "rgba(245,237,214,0.42)", lineHeight: 1.4 }}>{rec.why}</p>
          </Link>
        ))}
      </div>
    </Section>
  );
}

// ─── Food Pairings section ─────────────────────────────────

function FoodPairings({ items, bg }: { items: string[]; bg: string }) {
  if (items.length === 0) return null;
  return (
    <Section bg={bg}>
      <StoryTitle>Food Pairings</StoryTitle>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
        {items.map((item) => (
          <span key={item} style={{ background: "rgba(255,255,255,0.06)", borderRadius: 20, padding: "5px 11px", fontFamily: SANS, fontSize: 10, color: "rgba(245,237,214,0.6)", border: "0.5px solid rgba(255,255,255,0.08)" }}>
            {item}
          </span>
        ))}
      </div>
    </Section>
  );
}

// ─── Fun Facts section ─────────────────────────────────────

function MoreToKnow({ facts, accentColor, bg, noBorder }: { facts: string[]; accentColor: string; bg: string; noBorder?: boolean }) {
  if (facts.length === 0) return null;
  return (
    <div style={{ background: bg, borderBottom: noBorder ? "none" : `0.5px solid ${SECTION_BORDER}`, padding: "14px 16px" }}>
      <SectionLabel>MORE TO KNOW</SectionLabel>
      {facts.map((fact, i) => (
        <div key={i} style={{ display: "flex", gap: 8, marginBottom: 8 }}>
          <span style={{ color: accentColor, fontFamily: SANS, fontSize: 9, flexShrink: 0, marginTop: 1 }}>✦</span>
          <span style={{ fontFamily: SANS, fontSize: 10, color: "rgba(245,237,214,0.55)", lineHeight: 1.55 }}>{fact}</span>
        </div>
      ))}
    </div>
  );
}

// ─── Hero ──────────────────────────────────────────────────

function Hero({ profile, accentColor, badge, heroFailed, onHeroFail }: {
  profile: ProfileResponse["profile"];
  accentColor: string;
  badge: string;
  heroFailed: boolean;
  onHeroFail: () => void;
}) {
  const c = profile.content;
  const hasImage = !!profile.hero_image_url && !heroFailed;
  return (
    <div style={{ position: "relative", height: 210, overflow: "hidden", display: "flex", flexDirection: "column", justifyContent: "flex-end" }}>
      {hasImage ? (
        <AppImage src={profile.hero_image_url!} alt="" className="absolute inset-0 h-full w-full object-cover" onError={onHeroFail} />
      ) : null}
      <div style={{ position: "absolute", inset: 0, background: "rgba(14,6,8,0.55)" }} />
      <Link href="/explore" style={{ position: "absolute", top: 12, left: 14, display: "flex", alignItems: "center", gap: 5, background: "rgba(0,0,0,0.35)", borderRadius: 20, padding: "5px 12px", textDecoration: "none", zIndex: 10 }}>
        <span style={{ color: "rgba(245,237,214,0.8)", fontSize: 11 }}>←</span>
        <span style={{ fontFamily: SANS, color: "rgba(245,237,214,0.8)", fontSize: 10, fontWeight: 500 }}>Explore</span>
      </Link>
      <div style={{ position: "relative", padding: "0 16px 16px" }}>
        <p style={{ fontFamily: SANS, fontSize: 9, color: accentColor, letterSpacing: 3, textTransform: "uppercase", marginBottom: 5 }}>{badge}</p>
        <h1 style={{ fontFamily: SERIF, fontSize: 26, color: CHAMPAGNE, fontWeight: 300, lineHeight: 1.15, marginBottom: 5 }}>{profile.display_name}</h1>
        {c.tagline ? <p style={{ fontFamily: SERIF, fontSize: 12, color: "rgba(245,237,214,0.55)", fontStyle: "italic" }}>{c.tagline}</p> : null}
      </div>
    </div>
  );
}

// ─── Region Page ───────────────────────────────────────────

function RegionPage({ data, heroFailed, onHeroFail }: { data: ProfileResponse; heroFailed: boolean; onHeroFail: () => void }) {
  const { profile, personal_stats, community_qpr } = data;
  const c = profile.content;
  const accent = GRENACHE;
  const hasLogs = personal_stats.entry_count > 0;

  const grapeItems = Array.isArray(c.key_grapes) ? c.key_grapes.map((g, i) => typeof g === "string" ? { name: g, context: "", primary: i < 3 } : { name: g.name, context: g.context, primary: i < 3 }) : [];
  const winemakerItems = Array.isArray(c.notable_winemakers) ? c.notable_winemakers : [];
  const appellationItems = Array.isArray(c.appellations) ? c.appellations.map((a) => typeof a === "string" ? { name: a, character: "" } : a) : [];
  const funFacts: string[] = Array.isArray(c.fun_facts) ? c.fun_facts : c.fun_fact ? [c.fun_fact] : [];
  const flavorProfile = c.flavor_profile;
  const storyText = typeof c.story === "string" ? c.story : "";
  const zones = Array.isArray(c.zone_descriptions) ? c.zone_descriptions : [];

  let bgIdx = 0;
  const nextBg = () => (bgIdx++ % 2 === 0 ? BG_ODD : BG_EVEN);

  return (
    <>
      <Hero profile={profile} accentColor={accent} badge={`WINE REGION · ${(c.country ?? "").toUpperCase()}`} heroFailed={heroFailed} onHeroFail={onHeroFail} />

      {/* Personal Layer */}
      <Section bg={nextBg()}>
        <SectionLabel color={ROSE}>{hasLogs ? "YOUR EXPERIENCE HERE" : "DISCOVER THIS REGION"}</SectionLabel>
        {hasLogs ? (
          <>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", background: "rgba(255,255,255,0.05)", borderRadius: 10, padding: 12, marginBottom: 8 }}>
              <div>
                <p style={{ fontFamily: SANS, fontSize: 8, color: "rgba(245,237,214,0.4)", letterSpacing: 1, textTransform: "uppercase", marginBottom: 3 }}>TOP RATED</p>
                <p style={{ fontFamily: SERIF, fontSize: 14, color: CHAMPAGNE }}>{personal_stats.entry_count} {personal_stats.entry_count === 1 ? "wine" : "wines"} logged</p>
              </div>
              {personal_stats.avg_rating > 0 ? <span style={{ fontFamily: SANS, fontSize: 18, color: ROSE, fontWeight: 500 }}>{Math.round(personal_stats.avg_rating)}</span> : null}
            </div>
            <div style={{ background: "rgba(196,96,122,0.1)", borderRadius: 8, padding: "9px 12px", borderLeft: "2px solid rgba(196,96,122,0.5)", marginBottom: 8 }}>
              <p style={{ fontFamily: SANS, fontSize: 11, color: "rgba(245,237,214,0.85)", lineHeight: 1.55 }}>
                {c.personal_insight ?? `You've logged ${personal_stats.entry_count} wines from ${profile.display_name}. Your average sits at ${personal_stats.avg_rating > 0 ? personal_stats.avg_rating.toFixed(1) : "—"}.`}
              </p>
            </div>
            <Link href="/entries/new" style={{ display: "inline-block", background: "rgba(196,96,122,0.12)", borderRadius: 20, padding: "3px 9px", fontFamily: SANS, fontSize: 9, color: ROSE, textDecoration: "none" }}>+ Log another</Link>
          </>
        ) : (
          <div style={{ background: "rgba(196,96,122,0.1)", borderRadius: 8, padding: "9px 12px", borderLeft: "2px solid rgba(196,96,122,0.5)" }}>
            <p style={{ fontFamily: SANS, fontSize: 11, color: "rgba(245,237,214,0.85)", lineHeight: 1.55 }}>
              You haven&apos;t explored {profile.display_name} yet. Log your first wine from here to start tracking your taste across this region.
            </p>
          </div>
        )}
      </Section>

      {/* Flavor Profile */}
      {flavorProfile ? (
        <Section bg={nextBg()}>
          <SectionLabel>FLAVOR PROFILE</SectionLabel>
          <FlavorRadar data={flavorProfile} accentColor={accent} size={200} />
          <div style={{ display: "flex", justifyContent: "center", gap: 16, marginTop: 8 }}>
            {hasLogs ? <div style={{ display: "flex", alignItems: "center", gap: 6 }}><div style={{ width: 14, height: 2, borderRadius: 1, background: ROSE }} /><span style={{ fontFamily: SANS, fontSize: 9, color: "rgba(245,237,214,0.5)" }}>Your {personal_stats.entry_count} {personal_stats.entry_count === 1 ? "log" : "logs"}</span></div> : null}
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}><div style={{ width: 14, height: 2, borderRadius: 1, background: accent }} /><span style={{ fontFamily: SANS, fontSize: 9, color: "rgba(245,237,214,0.5)" }}>Region avg</span></div>
          </div>
          <p style={{ fontFamily: SANS, fontSize: 10, color: "rgba(245,237,214,0.55)", lineHeight: 1.55, marginTop: 8, textAlign: "center" }}>
            {c.personal_insight ?? `Typical flavor signature of wines from ${profile.display_name}.`}
          </p>
        </Section>
      ) : null}

      {/* The Story */}
      {storyText ? (
        <Section bg={nextBg()}>
          <StoryTitle>The Story</StoryTitle>
          <p style={{ fontFamily: SANS, fontSize: 11, color: "rgba(245,237,214,0.72)", lineHeight: 1.75, marginBottom: 10 }}>{storyText}</p>
          {funFacts.length > 0 ? (
            <div style={{ background: "rgba(196,96,122,0.07)", borderRadius: 8, padding: "10px 12px", border: "0.5px solid rgba(196,96,122,0.2)" }}>
              <p style={{ fontFamily: SANS, fontSize: 8, color: ROSE, letterSpacing: 2, textTransform: "uppercase", fontWeight: 700, marginBottom: 4 }}>DID YOU KNOW?</p>
              <p style={{ fontFamily: SANS, fontSize: 11, color: "rgba(245,237,214,0.65)", lineHeight: 1.6 }}>{funFacts[0]}</p>
            </div>
          ) : null}
        </Section>
      ) : null}

      {/* Grapes Grown Here */}
      {grapeItems.length > 0 ? (
        <Section bg={nextBg()}>
          <SectionLabel>GRAPES GROWN HERE</SectionLabel>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
            {grapeItems.map((grape) => (
              <Link key={grape.name} href={exploreHref("grape", grape.name)} style={{
                borderRadius: 20, padding: grape.primary ? "4px 10px" : "4px 10px", textDecoration: "none",
                background: grape.primary ? "rgba(123,29,58,0.35)" : "rgba(255,255,255,0.05)",
                border: grape.primary ? "0.5px solid rgba(196,96,122,0.3)" : "0.5px solid rgba(255,255,255,0.08)",
              }}>
                <span style={{ fontFamily: SANS, fontSize: grape.primary ? 10 : 9, color: grape.primary ? CHAMPAGNE : "rgba(245,237,214,0.45)", fontWeight: grape.primary ? 500 : 400 }}>{grape.name}</span>
              </Link>
            ))}
          </div>
          <p style={{ fontFamily: SANS, fontSize: 9, color: "rgba(245,237,214,0.3)", marginTop: 8 }}>Primary grapes highlighted · tap any to explore</p>
        </Section>
      ) : null}

      {/* Notable Winemakers */}
      {winemakerItems.length > 0 ? (
        <Section bg={nextBg()}>
          <SectionLabel>NOTABLE WINEMAKERS</SectionLabel>
          {winemakerItems.map((wm) => (
            <Link key={wm.name} href={exploreHref("producer", wm.name)} style={{ display: "flex", gap: 10, marginBottom: 8, alignItems: "flex-start", textDecoration: "none" }}>
              <div style={{ width: 3, alignSelf: "stretch", background: ROSE, borderRadius: 2, opacity: 0.6, flexShrink: 0 }} />
              <div>
                <p style={{ fontFamily: SERIF, fontSize: 13, color: CHAMPAGNE, marginBottom: 2 }}>{wm.name}</p>
                <p style={{ fontFamily: SANS, fontSize: 10, color: "rgba(245,237,214,0.5)", lineHeight: 1.4 }}>{wm.why}</p>
              </div>
            </Link>
          ))}
        </Section>
      ) : null}

      {/* Key Appellations + Zones */}
      {(appellationItems.length > 0 || zones.length > 0) ? (
        <Section bg={nextBg()}>
          <SectionLabel>KEY APPELLATIONS + ZONES</SectionLabel>
          {appellationItems.length > 0 ? (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 5, marginBottom: zones.length > 0 ? 10 : 0 }}>
              {appellationItems.map((app) => (
                <Link key={app.name} href={exploreHref("region", app.name)} style={{ borderRadius: 20, padding: "4px 10px", background: "rgba(123,29,58,0.35)", border: "0.5px solid rgba(196,96,122,0.3)", textDecoration: "none" }}>
                  <span style={{ fontFamily: SANS, fontSize: 10, color: CHAMPAGNE, fontWeight: 500 }}>{app.name}</span>
                </Link>
              ))}
            </div>
          ) : null}
          {zones.map((zone) => (
            <div key={zone.name} style={{ marginBottom: 7 }}>
              <p style={{ fontFamily: SANS, fontSize: 10, color: "rgba(245,237,214,0.7)", fontWeight: 500, marginBottom: 2 }}>{zone.name}</p>
              {zone.note ? <p style={{ fontFamily: SANS, fontSize: 9, color: "rgba(245,237,214,0.4)", lineHeight: 1.45 }}>{zone.note}</p> : null}
            </div>
          ))}
        </Section>
      ) : null}

      <CommunityPulse c={c} qpr={community_qpr} bg={nextBg()} displayName={profile.display_name} />
      {c.recommendation_picks ? <Recommendations picks={c.recommendation_picks} bg={nextBg()} /> : null}
      {c.food_pairings ? <FoodPairings items={c.food_pairings} bg={nextBg()} /> : null}
      {funFacts.length > 1 ? <MoreToKnow facts={funFacts.slice(1)} accentColor={ROSE} bg={nextBg()} /> : null}

      {/* Related Regions */}
      {c.related_regions && c.related_regions.length > 0 ? (
        <Section bg={nextBg()}>
          <SectionLabel>EXPLORE SIMILAR REGIONS</SectionLabel>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
            {c.related_regions.map((name) => (
              <Link key={name} href={exploreHref("region", name)} style={{ borderRadius: 20, padding: "4px 10px", background: "rgba(255,255,255,0.05)", border: "0.5px solid rgba(255,255,255,0.08)", textDecoration: "none" }}>
                <span style={{ fontFamily: SANS, fontSize: 9, color: "rgba(245,237,214,0.45)" }}>{name}</span>
              </Link>
            ))}
          </div>
        </Section>
      ) : null}
    </>
  );
}

// ─── Varietal Page ─────────────────────────────────────────

function VarietalPage({ data, heroFailed, onHeroFail }: { data: ProfileResponse; heroFailed: boolean; onHeroFail: () => void }) {
  const { profile, personal_stats, community_qpr } = data;
  const c = profile.content;
  const accent = NEBBIOLO;
  const hasLogs = personal_stats.entry_count > 0;

  const storyText = typeof c.story === "string" ? c.story : "";
  const funFacts: string[] = Array.isArray(c.fun_facts) ? c.fun_facts : c.fun_fact ? [c.fun_fact] : [];
  const flavorProfile = c.flavor_profile;
  const whereItGrows = Array.isArray(c.where_it_grows) ? c.where_it_grows : (Array.isArray(c.key_regions) ? (c.key_regions as string[]).map((n, i) => ({ name: n, size: i < 2 ? "large" : i < 4 ? "medium" : "small" })) : []);
  const stylesExpressions = Array.isArray(c.styles_expressions) ? c.styles_expressions : [];
  const notableProducers = Array.isArray(c.notable_producers) ? c.notable_producers : [];

  let bgIdx = 0;
  const nextBg = () => (bgIdx++ % 2 === 0 ? BG_ODD : BG_EVEN);

  return (
    <>
      <Hero profile={profile} accentColor={accent} badge="VARIETAL" heroFailed={heroFailed} onHeroFail={onHeroFail} />

      {/* Personal Layer */}
      <Section bg={nextBg()}>
        <SectionLabel color={ROSE}>YOUR {profile.display_name.toUpperCase()}</SectionLabel>
        {hasLogs ? (
          <>
            <div style={{ display: "flex", gap: 8 }}>
              <div style={{ flex: 1, background: "rgba(255,255,255,0.04)", borderRadius: 8, padding: "8px 10px" }}>
                <p style={{ fontFamily: SERIF, fontSize: 20, color: CHAMPAGNE }}>{personal_stats.entry_count}</p>
                <p style={{ fontFamily: SANS, fontSize: 8, color: "rgba(245,237,214,0.4)" }}>wines logged</p>
              </div>
              {personal_stats.avg_rating > 0 ? (
                <div style={{ flex: 1, background: "rgba(255,255,255,0.04)", borderRadius: 8, padding: "8px 10px" }}>
                  <p style={{ fontFamily: SERIF, fontSize: 20, color: VIOGNIER }}>{personal_stats.avg_rating.toFixed(1)}</p>
                  <p style={{ fontFamily: SANS, fontSize: 8, color: "rgba(245,237,214,0.4)" }}>your avg rating</p>
                </div>
              ) : null}
              <div style={{ flex: 1, background: "rgba(255,255,255,0.04)", borderRadius: 8, padding: "8px 10px" }}>
                <p style={{ fontFamily: SERIF, fontSize: 20, color: CHAMPAGNE }}>—</p>
                <p style={{ fontFamily: SANS, fontSize: 8, color: "rgba(245,237,214,0.4)" }}>community avg</p>
              </div>
            </div>
            <p style={{ fontFamily: SANS, fontSize: 10, color: "rgba(245,237,214,0.5)", lineHeight: 1.5, marginTop: 6 }}>
              {c.personal_insight ?? `You've logged ${personal_stats.entry_count} ${profile.display_name} wines. Keep exploring to see your taste pattern emerge.`}
            </p>
          </>
        ) : (
          <div style={{ background: "rgba(196,96,122,0.1)", borderRadius: 8, padding: "9px 12px", borderLeft: "2px solid rgba(196,96,122,0.5)" }}>
            <p style={{ fontFamily: SANS, fontSize: 11, color: "rgba(245,237,214,0.85)", lineHeight: 1.55 }}>You haven&apos;t logged any {profile.display_name} wines yet. Start exploring this grape to discover your personal preferences.</p>
          </div>
        )}
      </Section>

      {/* Flavor Profile */}
      {flavorProfile ? (
        <Section bg={nextBg()}>
          <SectionLabel>FLAVOUR PROFILE</SectionLabel>
          <FlavorRadar data={flavorProfile} accentColor={accent} size={200} />
          <div style={{ display: "flex", justifyContent: "center", gap: 16, marginTop: 8 }}>
            {hasLogs ? <div style={{ display: "flex", alignItems: "center", gap: 6 }}><div style={{ width: 14, height: 2, borderRadius: 1, background: ROSE }} /><span style={{ fontFamily: SANS, fontSize: 9, color: "rgba(245,237,214,0.5)" }}>Your {personal_stats.entry_count} logs</span></div> : null}
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}><div style={{ width: 14, height: 2, borderRadius: 1, background: accent }} /><span style={{ fontFamily: SANS, fontSize: 9, color: "rgba(245,237,214,0.5)" }}>{profile.display_name} avg</span></div>
          </div>
          {c.personal_insight ? <p style={{ fontFamily: SANS, fontSize: 9, color: "rgba(245,237,214,0.45)", textAlign: "center", marginTop: 4 }}>{c.personal_insight}</p> : null}
        </Section>
      ) : null}

      {/* The Story */}
      {storyText ? (
        <Section bg={nextBg()}>
          <p style={{ fontFamily: SERIF, fontSize: 16, color: CHAMPAGNE, lineHeight: 1.5, marginBottom: 8 }}>{storyText}</p>
          {funFacts.length > 0 ? (
            <div style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
              <span style={{ color: accent, fontFamily: SANS, fontSize: 9, flexShrink: 0, marginTop: 1 }}>✦</span>
              <span style={{ fontFamily: SANS, fontSize: 10, color: "rgba(245,237,214,0.5)", lineHeight: 1.5 }}>{funFacts[0]}</span>
            </div>
          ) : null}
        </Section>
      ) : null}

      {/* Where It Grows */}
      {whereItGrows.length > 0 ? (
        <Section bg={nextBg()}>
          <SectionLabel>WHERE IT GROWS BEST</SectionLabel>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
            {whereItGrows.map((region) => (
              <Link key={region.name} href={exploreHref("region", region.name)} style={{
                borderRadius: 20, background: "rgba(255,255,255,0.06)", border: "0.5px solid rgba(255,255,255,0.08)", textDecoration: "none",
                padding: region.size === "large" ? "6px 14px" : region.size === "medium" ? "5px 11px" : "4px 9px",
              }}>
                <span style={{ fontFamily: SANS, fontSize: region.size === "large" ? 11 : region.size === "medium" ? 10 : 9, color: region.size === "large" ? "rgba(245,237,214,0.8)" : "rgba(245,237,214,0.5)", fontWeight: region.size === "large" ? 500 : 400 }}>{region.name}</span>
              </Link>
            ))}
          </div>
        </Section>
      ) : null}

      {/* Styles & Expressions */}
      {stylesExpressions.length > 0 ? (
        <Section bg={nextBg()}>
          <SectionLabel>STYLES + EXPRESSIONS</SectionLabel>
          {stylesExpressions.map((expr) => (
            <div key={expr.style} style={{ background: "rgba(255,255,255,0.04)", borderRadius: 8, padding: "10px 12px", marginBottom: 6 }}>
              <p style={{ fontFamily: SERIF, fontSize: 13, color: CHAMPAGNE, marginBottom: 3 }}>{expr.style}</p>
              <p style={{ fontFamily: SANS, fontSize: 9, color: "rgba(245,237,214,0.45)", lineHeight: 1.45, marginBottom: 3 }}>{expr.desc}</p>
              <p style={{ fontFamily: SANS, fontSize: 8, color: "rgba(245,237,214,0.55)" }}>{expr.example}</p>
            </div>
          ))}
        </Section>
      ) : null}

      {/* Notable Producers */}
      {notableProducers.length > 0 ? (
        <Section bg={nextBg()}>
          <SectionLabel>NOTABLE PRODUCERS</SectionLabel>
          {notableProducers.map((prod) => (
            <Link key={prod.name} href={exploreHref("producer", prod.name)} style={{ display: "flex", gap: 8, marginBottom: 8, alignItems: "flex-start", textDecoration: "none" }}>
              <div style={{ width: 6, height: 6, borderRadius: 3, background: accent, marginTop: 5, flexShrink: 0 }} />
              <div>
                <p style={{ fontFamily: SERIF, fontSize: 12, color: CHAMPAGNE }}>{prod.name}</p>
                <p style={{ fontFamily: SANS, fontSize: 9, color: "rgba(245,237,214,0.4)", lineHeight: 1.4 }}>{prod.note}</p>
              </div>
            </Link>
          ))}
        </Section>
      ) : null}

      <CommunityPulse c={c} qpr={community_qpr} bg={nextBg()} displayName={profile.display_name} />
      {c.recommendation_picks ? <Recommendations picks={c.recommendation_picks} bg={nextBg()} /> : null}
      {c.food_pairings ? <FoodPairings items={c.food_pairings} bg={nextBg()} /> : null}
      {funFacts.length > 1 ? <MoreToKnow facts={funFacts.slice(1)} accentColor={accent} bg={nextBg()} noBorder /> : null}
    </>
  );
}

// ─── Producer Page ─────────────────────────────────────────

function ProducerPage({ data, heroFailed, onHeroFail }: { data: ProfileResponse; heroFailed: boolean; onHeroFail: () => void }) {
  const { profile, personal_stats } = data;
  const c = profile.content;
  const accent = ROSE;
  const hasLogs = personal_stats.entry_count > 0;

  const storyText = typeof c.story === "string" ? c.story : [c.origin, c.characteristics, c.style].filter(Boolean).join(" ");
  const funFacts: string[] = Array.isArray(c.fun_facts) ? c.fun_facts : c.fun_fact ? [c.fun_fact] : [];
  const philosophyTags = Array.isArray(c.philosophy_tags) ? c.philosophy_tags : [];
  const keyWines = Array.isArray(c.key_wines) ? c.key_wines.map((w) => typeof w === "string" ? { name: w, desc: "", rating: "" } : w) : [];
  const regionGrapes: string[] = Array.isArray(c.region_grapes) ? c.region_grapes : [...(c.grapes ?? []), ...((c.key_regions ?? []) as string[])];
  const similarProducers = Array.isArray(c.similar_producers) ? c.similar_producers : [];

  let bgIdx = 0;
  const nextBg = () => (bgIdx++ % 2 === 0 ? BG_ODD : BG_EVEN);

  return (
    <>
      <Hero profile={profile} accentColor={accent} badge="PRODUCER" heroFailed={heroFailed} onHeroFail={onHeroFail} />

      {/* Personal Layer */}
      <Section bg={nextBg()}>
        <SectionLabel color={ROSE}>YOUR {profile.display_name.toUpperCase()}</SectionLabel>
        {hasLogs ? (
          <p style={{ fontFamily: SANS, fontSize: 10, color: "rgba(245,237,214,0.55)", lineHeight: 1.6 }}>
            You&apos;ve opened <span style={{ color: CHAMPAGNE, fontWeight: 600 }}>{personal_stats.entry_count} {personal_stats.entry_count === 1 ? "bottle" : "bottles"}</span>
            {personal_stats.avg_rating > 0 ? <>. Your average rating: <span style={{ color: VIOGNIER, fontWeight: 600 }}>{personal_stats.avg_rating.toFixed(1)}</span></> : null}.
          </p>
        ) : (
          <div style={{ background: "rgba(196,96,122,0.1)", borderRadius: 8, padding: "9px 12px", borderLeft: "2px solid rgba(196,96,122,0.5)" }}>
            <p style={{ fontFamily: SANS, fontSize: 11, color: "rgba(245,237,214,0.85)", lineHeight: 1.55 }}>You haven&apos;t logged any {profile.display_name} wines yet. Open your first bottle to start tracking.</p>
          </div>
        )}
      </Section>

      {/* The Story */}
      {storyText ? (
        <Section bg={nextBg()}>
          <p style={{ fontFamily: SERIF, fontSize: 16, color: CHAMPAGNE, lineHeight: 1.5, marginBottom: 8 }}>{storyText}</p>
          {funFacts.length > 0 ? (
            <div style={{ display: "flex", gap: 8, alignItems: "flex-start", marginTop: 8 }}>
              <span style={{ color: accent, fontFamily: SANS, fontSize: 9, flexShrink: 0, marginTop: 1 }}>✦</span>
              <span style={{ fontFamily: SANS, fontSize: 10, color: "rgba(245,237,214,0.5)", lineHeight: 1.5 }}>{funFacts[0]}</span>
            </div>
          ) : null}
        </Section>
      ) : null}

      {/* Philosophy & Approach */}
      {philosophyTags.length > 0 ? (
        <Section bg={nextBg()}>
          <SectionLabel>PHILOSOPHY + APPROACH</SectionLabel>
          {philosophyTags.map((item) => (
            <div key={item.tag} style={{ marginBottom: 8 }}>
              <p style={{ fontFamily: SANS, fontSize: 10, color: CHAMPAGNE, fontWeight: 500, marginBottom: 2 }}>{item.tag}</p>
              <p style={{ fontFamily: SANS, fontSize: 9, color: "rgba(245,237,214,0.4)", lineHeight: 1.45 }}>{item.note}</p>
            </div>
          ))}
        </Section>
      ) : null}

      {/* Key Wines */}
      {keyWines.length > 0 ? (
        <Section bg={nextBg()}>
          <SectionLabel>KEY WINES</SectionLabel>
          {keyWines.map((wine) => (
            <div key={wine.name} style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", background: "rgba(255,255,255,0.04)", borderRadius: 8, padding: "10px 12px", marginBottom: 6 }}>
              <div>
                <p style={{ fontFamily: SERIF, fontSize: 13, color: CHAMPAGNE, marginBottom: 3 }}>{wine.name}</p>
                {wine.desc ? <p style={{ fontFamily: SANS, fontSize: 9, color: "rgba(245,237,214,0.4)", lineHeight: 1.4 }}>{wine.desc}</p> : null}
              </div>
              {wine.rating ? <span style={{ fontFamily: SANS, fontSize: 10, color: VIOGNIER, flexShrink: 0, marginLeft: 8 }}>{wine.rating}</span> : null}
            </div>
          ))}
        </Section>
      ) : null}

      {/* Region + Grapes */}
      {regionGrapes.length > 0 ? (
        <Section bg={nextBg()}>
          <SectionLabel>REGION + GRAPES</SectionLabel>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
            {regionGrapes.map((name) => (
              <Link key={name} href={exploreHref(name.includes("-") || (name.includes(" ") && name.length > 12) ? "region" : "grape", name)} style={{ borderRadius: 20, padding: "5px 11px", background: "rgba(255,255,255,0.06)", border: "0.5px solid rgba(255,255,255,0.08)", textDecoration: "none" }}>
                <span style={{ fontFamily: SANS, fontSize: 10, color: "rgba(245,237,214,0.6)" }}>{name}</span>
              </Link>
            ))}
          </div>
        </Section>
      ) : null}

      {/* Similar Producers */}
      {similarProducers.length > 0 ? (
        <Section bg={nextBg()}>
          <SectionLabel>SIMILAR PRODUCERS</SectionLabel>
          <div style={{ display: "flex", gap: 6 }}>
            {similarProducers.map((prod) => (
              <Link key={prod.name} href={exploreHref("producer", prod.name)} style={{ flex: 1, background: "rgba(255,255,255,0.04)", borderRadius: 8, padding: "9px 8px", border: "0.5px solid rgba(255,255,255,0.06)", textDecoration: "none" }}>
                <p style={{ fontFamily: SERIF, fontSize: 12, color: CHAMPAGNE, marginBottom: 3 }}>{prod.name}</p>
                <p style={{ fontFamily: SANS, fontSize: 9, color: "rgba(245,237,214,0.42)", lineHeight: 1.4 }}>{prod.why}</p>
              </Link>
            ))}
          </div>
        </Section>
      ) : null}

      {c.food_pairings ? <FoodPairings items={c.food_pairings} bg={nextBg()} /> : null}
      {funFacts.length > 1 ? <MoreToKnow facts={funFacts.slice(1)} accentColor={accent} bg={nextBg()} noBorder /> : null}
    </>
  );
}

// ─── Main Page ─────────────────────────────────────────────

export default function ExploreProfilePage() {
  const params = useParams();
  const router = useRouter();
  const rawType = typeof params.type === "string" ? params.type : "";
  const rawSlug = typeof params.slug === "string" ? params.slug : "";

  const [data, setData] = useState<ProfileResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [heroFailed, setHeroFailed] = useState(false);

  useEffect(() => {
    if (!rawType || !rawSlug) return;
    let cancelled = false;
    const pollTimeouts: number[] = [];

    const fetchProfile = async () =>
      fetch(`/api/explore/${encodeURIComponent(rawType)}/${encodeURIComponent(rawSlug)}`);

    // Once the page has *any* content — even a "generating" placeholder —
    // poll for the finished narrative content in the background rather than
    // re-showing the full-page spinner. Uncached profiles used to block the
    // whole request for 20+ seconds on OpenAI content + image generation;
    // now the first response returns almost immediately and this poll picks
    // up the real content once it's ready.
    const pollForContent = (attempt: number) => {
      if (cancelled || attempt > 20) return; // ~60s cap
      const timeoutId = window.setTimeout(async () => {
        if (cancelled) return;
        try {
          const res = await fetchProfile();
          if (!res.ok || cancelled) return;
          const json = (await res.json()) as ProfileResponse;
          if (cancelled) return;
          setData(json);
          if (json.generating) {
            pollForContent(attempt + 1);
          }
        } catch {
          // Best-effort — try again on the next tick rather than failing hard.
          pollForContent(attempt + 1);
        }
      }, 3000);
      pollTimeouts.push(timeoutId);
    };

    const loadProfile = async () => {
      setLoading(true);
      setError(null);
      setData(null);
      setHeroFailed(false);

      try {
        const res = await fetchProfile();
        if (!res.ok) {
          const payload = await res.json().catch(() => ({}));
          throw new Error(payload.error ?? "Failed to load profile");
        }
        const json = (await res.json()) as ProfileResponse;
        if (cancelled) return;
        setData(json);
        // Stop the full-page spinner as soon as we have anything to show —
        // the hero/title render immediately even while narrative content is
        // still generating (see pollForContent + the "generating" banner
        // below), instead of the page being blank for 20+ seconds.
        setLoading(false);

        if (json.generating) {
          pollForContent(1);
        } else if (!json.profile.hero_image_url) {
          // Narrative content is ready but the hero image is still being
          // generated in the background — poll once for it too.
          pollForContent(1);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Something went wrong");
          setLoading(false);
        }
      }
    };

    void loadProfile();
    return () => {
      cancelled = true;
      pollTimeouts.forEach((id) => window.clearTimeout(id));
    };
  }, [rawType, rawSlug]);

  if (loading) {
    return (
      <div style={{ background: DEVICE_BG, minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-[rgba(245,237,214,0.2)] border-t-[#C4607A]" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div style={{ background: DEVICE_BG, minHeight: "100vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 12, padding: 24 }}>
        <p style={{ fontFamily: SERIF, fontSize: 20, color: CHAMPAGNE, textAlign: "center" }}>Unable to load profile</p>
        <p style={{ fontSize: 13, color: "rgba(245,237,214,0.6)", textAlign: "center" }}>{error ?? "Something went wrong."}</p>
        <button onClick={() => router.back()} style={{ fontFamily: SANS, fontSize: 13, color: "rgba(245,237,214,0.5)", fontWeight: 600, background: "none", border: "none", cursor: "pointer", padding: 8 }}>Go back</button>
      </div>
    );
  }

  const profileType = data.profile.type as ProfileType;

  return (
    <div style={{ background: DEVICE_BG, minHeight: "100vh", maxWidth: 600, margin: "0 auto" }}>
      {data.generating ? <GeneratingBanner /> : null}
      {profileType === "region" ? (
        <RegionPage data={data} heroFailed={heroFailed} onHeroFail={() => setHeroFailed(true)} />
      ) : profileType === "grape" ? (
        <VarietalPage data={data} heroFailed={heroFailed} onHeroFail={() => setHeroFailed(true)} />
      ) : profileType === "producer" ? (
        <ProducerPage data={data} heroFailed={heroFailed} onHeroFail={() => setHeroFailed(true)} />
      ) : null}

      {/* Attribution */}
      {data.profile.hero_image_attribution ? (
        <p style={{ fontSize: 10, color: "rgba(245,237,214,0.2)", textAlign: "center", padding: "16px 18px 32px" }}>
          Photo by {data.profile.hero_image_attribution.photographer}
        </p>
      ) : null}
    </div>
  );
}

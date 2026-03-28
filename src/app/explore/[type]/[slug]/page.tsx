"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";

// ─── Types ──────────────────────────────────────────────────

type ProfileType = "grape" | "region" | "producer";

type HeroImageAttribution = {
  photographer: string;
  url: string;
};

type ProfileContent = {
  tagline?: string;
  origin?: string;
  characteristics?: string;
  body?: string;
  acidity?: string;
  tannin?: string;
  key_regions?: string[];
  key_grapes?: string[];
  appellations?: string[];
  climate?: string;
  key_wines?: string[];
  founded?: string;
  grapes?: string[];
  food_pairings?: string[];
  fun_fact?: string;
  aging_potential?: string;
  related_grapes?: string[];
  related_regions?: string[];
  related_producers?: string[];
  classification?: string;
  region?: string;
  style?: string;
};

type SensoryData = Record<string, number>;

type Profile = {
  type: ProfileType;
  slug: string;
  display_name: string;
  content: ProfileContent;
  hero_image_url?: string | null;
  hero_image_attribution?: HeroImageAttribution | null;
  sensory_data?: SensoryData | null;
};

type PersonalStats = {
  entry_count: number;
  avg_rating?: number | null;
  label_photos?: string[];
};

type ProfileResponse = {
  profile: Profile;
  personal_stats?: PersonalStats | null;
};

// ─── Helpers ────────────────────────────────────────────────

const TYPE_LABELS: Record<ProfileType, string> = {
  grape: "GRAPE VARIETY",
  region: "WINE REGION",
  producer: "PRODUCER",
};

const TYPE_PLURAL: Record<ProfileType, string> = {
  grape: "grapes",
  region: "regions",
  producer: "producers",
};

const SENSORY_AXIS_LABELS: Record<string, string> = {
  body: "Body",
  acidity: "Acidity",
  tannin: "Tannin",
  alcohol_perception: "Alcohol",
  fruit_ripeness: "Fruit Ripeness",
  oak_presence: "Oak",
  sweetness_perception: "Sweetness",
  aromatic_intensity: "Aromatics",
  earthy: "Earthiness",
  mineral: "Minerality",
  savory: "Savory",
  finish_length: "Finish",
  concentration: "Concentration",
  complexity: "Complexity",
  freshness: "Freshness",
  bitterness_phenolic_grip: "Bitterness",
};

function isValidProfileType(value: string): value is ProfileType {
  return value === "grape" || value === "region" || value === "producer";
}

// ─── Components ─────────────────────────────────────────────

function SensoryBar({ label, value, max = 5 }: { label: string; value: number; max?: number }) {
  const pct = Math.max(0, Math.min(100, (value / max) * 100));
  const isHigh = value >= 3.8;
  const isLow = value <= 2.2;
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-xs">
        <span className="text-[var(--color-text-secondary)]">{label}</span>
        <span
          className={`font-semibold ${
            isHigh
              ? "text-[var(--color-accent-secondary)]"
              : isLow
                ? "text-[var(--color-text-tertiary)]"
                : "text-[var(--color-text-primary)]"
          }`}
        >
          {value.toFixed(1)}
        </span>
      </div>
      <div className="h-1.5 rounded-full bg-[var(--color-surface-hover)]">
        <div
          className={`h-full rounded-full transition-all ${
            isHigh ? "bg-[var(--color-accent-secondary)]" : "bg-[var(--color-accent-primary)]"
          }`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

function Spinner() {
  return (
    <div className="flex min-h-[60vh] items-center justify-center">
      <div className="h-8 w-8 animate-spin rounded-full border-2 border-[var(--color-border-strong)] border-t-[var(--color-accent-secondary)]" />
    </div>
  );
}

function ErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 px-6 text-center">
      <p className="text-sm text-[var(--color-text-secondary)]">{message}</p>
      <button
        onClick={onRetry}
        className="rounded-xl bg-[var(--color-accent-primary)] px-6 py-3 text-sm font-semibold text-[var(--color-text-on-accent)] transition hover:bg-[var(--color-accent-hover)]"
      >
        Try again
      </button>
    </div>
  );
}

function Chip({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded-full border border-[var(--color-border)] bg-[var(--color-surface-muted)] px-3 py-1 text-xs font-medium text-[var(--color-text-secondary)]">
      {children}
    </span>
  );
}

// ─── At-a-Glance card builders ──────────────────────────────

type GlanceItem = { label: string; value: string };

function getGlanceItems(profile: Profile): GlanceItem[] {
  const { content, type } = profile;
  const items: GlanceItem[] = [];

  if (type === "grape") {
    if (content.body) items.push({ label: "Body", value: content.body });
    if (content.acidity) items.push({ label: "Acidity", value: content.acidity });
    if (content.tannin) items.push({ label: "Tannin", value: content.tannin });
    if (content.key_regions && content.key_regions.length > 0) {
      items.push({ label: "Key Regions", value: content.key_regions.slice(0, 3).join(", ") });
    }
  } else if (type === "region") {
    if (content.climate) items.push({ label: "Climate", value: content.climate });
    if (content.key_grapes && content.key_grapes.length > 0) {
      items.push({ label: "Key Grapes", value: content.key_grapes.slice(0, 3).join(", ") });
    }
    if (content.classification) items.push({ label: "Classification", value: content.classification });
  } else if (type === "producer") {
    if (content.region) items.push({ label: "Region", value: content.region });
    if (content.founded) items.push({ label: "Founded", value: content.founded });
    if (content.classification) items.push({ label: "Classification", value: content.classification });
  }

  return items;
}

function getRelatedItems(profile: Profile): { name: string; slug: string; type: ProfileType }[] {
  const { content, type } = profile;
  const items: { name: string; slug: string; type: ProfileType }[] = [];

  const relatedGrapes = content.related_grapes ?? [];
  const relatedRegions = content.related_regions ?? [];
  const relatedProducers = content.related_producers ?? [];

  for (const name of relatedGrapes) {
    items.push({ name, slug: name.toLowerCase().replace(/\s+/g, "-"), type: "grape" });
  }
  for (const name of relatedRegions) {
    items.push({ name, slug: name.toLowerCase().replace(/\s+/g, "-"), type: "region" });
  }
  for (const name of relatedProducers) {
    items.push({ name, slug: name.toLowerCase().replace(/\s+/g, "-"), type: "producer" });
  }

  // If no explicit related items, fall back to key_grapes / key_wines as cross-links
  if (items.length === 0) {
    if (type === "region" && content.key_grapes) {
      for (const name of content.key_grapes.slice(0, 4)) {
        items.push({ name, slug: name.toLowerCase().replace(/\s+/g, "-"), type: "grape" });
      }
    }
    if (type === "producer" && content.grapes) {
      for (const name of content.grapes.slice(0, 4)) {
        items.push({ name, slug: name.toLowerCase().replace(/\s+/g, "-"), type: "grape" });
      }
    }
  }

  return items;
}

// ─── Main page ──────────────────────────────────────────────

export default function ExploreProfilePage() {
  const params = useParams<{ type: string; slug: string }>();
  const router = useRouter();
  const [data, setData] = useState<ProfileResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchProfile = useCallback(async () => {
    const type = params?.type;
    const slug = params?.slug;

    if (!type || !slug || !isValidProfileType(type)) {
      setError("Invalid profile type.");
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const supabase = createSupabaseBrowserClient();
      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData.session?.access_token;

      const headers: Record<string, string> = {
        "Content-Type": "application/json",
      };
      if (accessToken) {
        headers.Authorization = `Bearer ${accessToken}`;
      }

      const response = await fetch(`/api/explore/${type}/${slug}`, { headers });

      if (!response.ok) {
        if (response.status === 404) {
          setError("Profile not found.");
        } else {
          setError("Unable to load profile.");
        }
        setLoading(false);
        return;
      }

      const json = await response.json();
      setData(json);
    } catch {
      setError("Unable to load profile.");
    } finally {
      setLoading(false);
    }
  }, [params?.type, params?.slug]);

  useEffect(() => {
    fetchProfile();
  }, [fetchProfile]);

  if (loading) return <Spinner />;
  if (error || !data) return <ErrorState message={error ?? "Unable to load profile."} onRetry={fetchProfile} />;

  const { profile, personal_stats } = data;
  const glanceItems = getGlanceItems(profile);
  const relatedItems = getRelatedItems(profile);
  const hasSensory = profile.sensory_data && Object.keys(profile.sensory_data).length > 0;
  const hasPersonalStats = personal_stats && personal_stats.entry_count > 0;
  const foodPairings = profile.content.food_pairings ?? [];

  return (
    <div className="min-h-screen bg-[var(--color-surface-primary)] text-[var(--color-text-primary)]">
      {/* ── Hero Section ── */}
      <section className="relative w-full" style={{ aspectRatio: "16 / 9", maxHeight: 420 }}>
        {profile.hero_image_url ? (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={profile.hero_image_url}
              alt={profile.display_name}
              className="absolute inset-0 h-full w-full object-cover"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-[var(--color-surface-primary)] via-[var(--color-surface-primary)]/60 to-transparent" />
          </>
        ) : (
          <div className="absolute inset-0 bg-[var(--color-surface-raised)]" />
        )}

        {/* Back link */}
        <div className="absolute left-4 top-4 z-10">
          <button
            onClick={() => router.back()}
            className="flex items-center gap-1 rounded-full bg-black/30 px-3 py-1.5 text-xs font-medium text-[var(--color-text-primary)] backdrop-blur-sm transition hover:bg-black/50"
          >
            <span aria-hidden="true">&larr;</span> Back
          </button>
        </div>

        {/* Hero text */}
        <div className="absolute bottom-0 left-0 right-0 z-10 px-5 pb-6">
          <div className="mx-auto w-full max-w-[800px]">
            <span className="mb-2 block text-[9px] font-bold uppercase tracking-[3px] text-[var(--color-accent-secondary)]">
              {TYPE_LABELS[profile.type]}
            </span>
            <h1
              className="text-[40px] leading-[46px] font-light text-[var(--color-text-primary)]"
              style={{ fontFamily: "var(--font-serif)" }}
            >
              {profile.display_name}
            </h1>
            {profile.content.tagline && (
              <p className="mt-2 max-w-2xl text-sm leading-relaxed text-[var(--color-text-secondary)]">
                {profile.content.tagline}
              </p>
            )}
          </div>
        </div>

        {/* Photo attribution */}
        {profile.hero_image_attribution && (
          <div className="absolute bottom-2 right-4 z-10">
            <a
              href={profile.hero_image_attribution.url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[10px] text-[var(--color-text-tertiary)] hover:text-[var(--color-text-secondary)] transition"
            >
              Photo by {profile.hero_image_attribution.photographer}
            </a>
          </div>
        )}
      </section>

      {/* ── Content ── */}
      <div className="px-5 py-6">
        <div className="mx-auto w-full max-w-[800px] space-y-6">

          {/* ── At a Glance ── */}
          {glanceItems.length > 0 && (
            <section className="flex flex-col gap-3">
              {glanceItems.map((item) => (
                <div
                  key={item.label}
                  className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface-primary)]/10 p-4 space-y-1"
                >
                  <p className="text-[9px] font-bold uppercase tracking-[2px] text-[var(--color-text-tertiary)]">
                    {item.label}
                  </p>
                  <p className="text-sm font-semibold text-[var(--color-text-primary)]">{item.value}</p>
                </div>
              ))}
            </section>
          )}

          {/* ── Your History ── */}
          {hasPersonalStats && (
            <section className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface-primary)]/10 p-5 space-y-3">
              <p className="text-[9px] font-bold uppercase tracking-[2px] text-[var(--color-text-tertiary)]">
                Your history
              </p>
              <p className="text-sm text-[var(--color-text-secondary)]">
                You&apos;ve logged{" "}
                <span className="font-semibold text-[var(--color-text-primary)]">
                  {personal_stats.entry_count}
                </span>{" "}
                {profile.type === "grape"
                  ? `${profile.display_name} wine${personal_stats.entry_count !== 1 ? "s" : ""}`
                  : profile.type === "region"
                    ? `wine${personal_stats.entry_count !== 1 ? "s" : ""} from ${profile.display_name}`
                    : `wine${personal_stats.entry_count !== 1 ? "s" : ""} by ${profile.display_name}`}
              </p>
              {personal_stats.avg_rating != null && (
                <p className="text-sm text-[var(--color-text-secondary)]">
                  Average rating:{" "}
                  <span className="font-semibold text-[var(--color-accent-secondary)]">
                    {personal_stats.avg_rating.toFixed(1)}
                  </span>
                </p>
              )}
              {personal_stats.label_photos && personal_stats.label_photos.length > 0 && (
                <div className="flex gap-2 overflow-x-auto pt-1">
                  {personal_stats.label_photos.slice(0, 6).map((url, i) => (
                    <div
                      key={i}
                      className="h-14 w-14 flex-shrink-0 overflow-hidden rounded-lg border border-[var(--color-border)]"
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={url}
                        alt={`Label photo ${i + 1}`}
                        className="h-full w-full object-cover"
                      />
                    </div>
                  ))}
                </div>
              )}
            </section>
          )}

          {/* ── The Story ── */}
          {(profile.content.origin || profile.content.characteristics || profile.content.style) && (
            <section className="space-y-4">
              <h2
                className="text-[24px] font-light text-[var(--color-text-primary)]"
                style={{ fontFamily: "var(--font-serif)" }}
              >
                The Story
              </h2>
              {profile.content.origin && (
                <p className="text-sm leading-relaxed text-[var(--color-text-secondary)]">
                  {profile.content.origin}
                </p>
              )}
              {profile.content.characteristics && (
                <p className="text-sm leading-relaxed text-[var(--color-text-secondary)]">
                  {profile.content.characteristics}
                </p>
              )}
              {profile.content.style && (
                <p className="text-sm leading-relaxed text-[var(--color-text-secondary)]">
                  {profile.content.style}
                </p>
              )}
              {profile.content.aging_potential && (
                <p className="text-sm leading-relaxed text-[var(--color-text-secondary)]">
                  <span className="font-semibold text-[var(--color-text-primary)]">Aging potential:</span>{" "}
                  {profile.content.aging_potential}
                </p>
              )}
              {profile.content.fun_fact && (
                <div className="rounded-2xl border border-[var(--color-accent-rose)] bg-[var(--color-accent-soft)] p-5">
                  <p className="text-[9px] font-bold uppercase tracking-[2px] text-[var(--color-accent-secondary)] mb-2">
                    Did you know?
                  </p>
                  <p className="text-sm leading-relaxed text-[var(--color-text-primary)]">
                    {profile.content.fun_fact}
                  </p>
                </div>
              )}
            </section>
          )}

          {/* ── Sensory Profile ── */}
          {hasSensory && profile.sensory_data && (
            <section className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface-primary)]/10 p-5 space-y-4">
              <div>
                <p className="text-[9px] font-bold uppercase tracking-[2px] text-[var(--color-text-tertiary)]">
                  Sensory profile
                </p>
                <p className="mt-1 text-xs text-[var(--color-text-tertiary)]">
                  Typical sensory profile for {profile.display_name}
                </p>
              </div>
              <div className="space-y-3">
                {Object.entries(profile.sensory_data)
                  .filter(([, val]) => typeof val === "number")
                  .sort(([, a], [, b]) => b - a)
                  .map(([axis, value]) => (
                    <SensoryBar
                      key={axis}
                      label={SENSORY_AXIS_LABELS[axis] ?? axis}
                      value={value}
                    />
                  ))}
              </div>
            </section>
          )}

          {/* ── Food Pairings ── */}
          {foodPairings.length > 0 && (
            <section className="space-y-3">
              <h2
                className="text-[24px] font-light text-[var(--color-text-primary)]"
                style={{ fontFamily: "var(--font-serif)" }}
              >
                Food Pairings
              </h2>
              <div className="flex flex-wrap gap-2">
                {foodPairings.map((pairing) => (
                  <Chip key={pairing}>{pairing}</Chip>
                ))}
              </div>
            </section>
          )}

          {/* ── Related ── */}
          {relatedItems.length > 0 && (
            <section className="space-y-3">
              <h2
                className="text-[24px] font-light text-[var(--color-text-primary)]"
                style={{ fontFamily: "var(--font-serif)" }}
              >
                Related
              </h2>
              <div className="flex flex-wrap gap-2">
                {relatedItems.map((item) => (
                  <Link
                    key={`${item.type}-${item.slug}`}
                    href={`/explore/${item.type}/${item.slug}`}
                    className="rounded-full border border-[var(--color-border-strong)] bg-[var(--color-surface-muted)] px-4 py-2 text-sm font-medium text-[var(--color-text-primary)] transition hover:border-[var(--color-accent-secondary)] hover:text-[var(--color-accent-secondary)]"
                  >
                    {item.name}
                  </Link>
                ))}
              </div>
            </section>
          )}

          {/* ── Explore More ── */}
          <section className="pt-2 pb-8">
            <Link
              href={`/explore`}
              className="text-sm font-semibold text-[var(--color-text-tertiary)] hover:text-[var(--color-accent-secondary)] transition"
            >
              Explore other {TYPE_PLURAL[profile.type]} &rarr;
            </Link>
          </section>
        </div>
      </div>
    </div>
  );
}

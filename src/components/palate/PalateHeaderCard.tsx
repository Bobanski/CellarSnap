"use client";

import { getBadgeById } from "@shared";
import BadgeIcon from "@/features/badges/BadgeIcon";
import AppImage from "@/components/AppImage";

// This whole card is a deliberate dark Barolo hero moment (matches the profile-page gradient
// banner pattern) — every color below is unchanged from the dark theme on purpose, because all
// text here sits on the dark gradient, not on the page's light Champagne Daylight background.
const GRENACHE = "#7B1D3A";
const NEBBIOLO = "#4A3060";
const BAROLO = "#4A0E1F"; // was a raw near-black "#220E14"; same dark hero moment, now the on-brand hex
const ROSE = "#C4607A";
const CHAMPAGNE = "#F5EDD6";
const FOG = "#A08878";
export type PalateProfile = {
  display_name: string | null;
  avatar_url: string | null;
  featured_badge_id: string | null;
  created_at: string | null;
};

export type PalateStats = {
  wines: number;
  friends: number;
  badges: number;
  countries: number;
};

function getInitial(name: string | null | undefined) {
  return (name?.trim()?.[0] ?? "?").toUpperCase();
}

export function PalateHeaderCard({
  profile,
  stats,
  loading,
  onSettingsOpen,
}: {
  profile: PalateProfile | null;
  stats: PalateStats;
  loading: boolean;
  onSettingsOpen: () => void;
}) {
  const badge = profile?.featured_badge_id
    ? getBadgeById(profile.featured_badge_id)
    : null;

  if (loading) {
    return (
      <div
        className="rounded-2xl p-6 animate-pulse"
        style={{
          background: `linear-gradient(135deg, ${GRENACHE}30 0%, ${NEBBIOLO}18 50%, ${BAROLO} 100%)`,
          border: `1px solid ${GRENACHE}20`,
        }}
      >
        <div className="flex items-center gap-4">
          <div className="h-20 w-20 rounded-full bg-[var(--color-surface-raised)]" />
          <div className="flex-1 space-y-2">
            <div className="h-5 w-32 rounded bg-[var(--color-surface-raised)]" />
            <div className="h-3 w-20 rounded bg-[var(--color-surface-raised)]" />
          </div>
        </div>
        <div className="mt-5 flex gap-6">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="h-3 w-12 rounded bg-[var(--color-surface-raised)]" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div
      className="relative rounded-2xl p-6"
      style={{
        background: `linear-gradient(135deg, ${GRENACHE}30 0%, ${NEBBIOLO}18 50%, ${BAROLO} 100%)`,
        border: `1px solid ${GRENACHE}20`,
      }}
    >
      {/* Settings gear */}
      <button
        type="button"
        onClick={onSettingsOpen}
        className="absolute right-4 top-4 flex h-8 w-8 items-center justify-center rounded-full transition hover:bg-[var(--color-surface-raised)]"
        style={{ border: `1px solid ${GRENACHE}25` }}
        aria-label="Settings"
      >
        <svg width="14" height="14" viewBox="0 0 20 20" fill={FOG}>
          <circle cx="10" cy="10" r="2.5" />
          <circle cx="10" cy="3" r="1.5" opacity="0.7" />
          <circle cx="10" cy="17" r="1.5" opacity="0.7" />
          <circle cx="3" cy="10" r="1.5" opacity="0.7" />
          <circle cx="17" cy="10" r="1.5" opacity="0.7" />
          <circle cx="5" cy="5" r="1.2" opacity="0.5" />
          <circle cx="15" cy="5" r="1.2" opacity="0.5" />
          <circle cx="5" cy="15" r="1.2" opacity="0.5" />
          <circle cx="15" cy="15" r="1.2" opacity="0.5" />
        </svg>
      </button>

      {/* Avatar + Name */}
      <div className="flex items-center gap-4">
        <div
          className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-full text-2xl font-light"
          style={{
            fontFamily: "var(--font-serif)",
            color: CHAMPAGNE,
            background: `${GRENACHE}30`,
            border: `2px solid ${GRENACHE}50`,
          }}
        >
          {profile?.avatar_url ? (
            <AppImage
              src={profile.avatar_url}
              alt=""
              className="h-full w-full object-cover"
              width={80}
              height={80}
            />
          ) : (
            <span>{getInitial(profile?.display_name)}</span>
          )}
        </div>

        <div className="min-w-0 flex-1">
          <h1
            className="truncate text-2xl font-light"
            style={{ fontFamily: "var(--font-serif)", color: CHAMPAGNE }}
          >
            {profile?.display_name ?? "Wine Lover"}
          </h1>
          {badge && (
            <div className="mt-1 flex items-center gap-1.5">
              <BadgeIcon
                shape={badge.shape}
                color={badge.color}
                accent={badge.accent}
                tier={badge.tier}
                size={16}
              />
              <span className="text-[10px]" style={{ color: ROSE }}>
                {badge.name}
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Stats row */}
      <div className="mt-5 flex flex-wrap gap-x-5 gap-y-1">
        {[
          { value: stats.wines, label: "wines" },
          { value: stats.friends, label: "friends" },
          { value: stats.badges, label: "badges" },
          { value: stats.countries, label: "countries" },
        ].map((stat) => (
          <div key={stat.label} className="flex items-baseline gap-1">
            <span className="text-sm font-semibold" style={{ color: CHAMPAGNE }}>
              {stat.value}
            </span>
            <span className="text-[10px]" style={{ color: FOG }}>
              {stat.label}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

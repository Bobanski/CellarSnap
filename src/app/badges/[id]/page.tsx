"use client";

import { useParams, useRouter } from "next/navigation";
import AppShell from "@/components/AppShell";
import BadgeIcon from "@/features/badges/BadgeIcon";
import { getBadgeById, BADGE_TIER_COLORS } from "@shared";
import type { BadgeShape, BadgeColor, BadgeAccentColor, BadgeTier } from "@shared";

const TIER_LABEL: Record<string, string> = {
  nouveau: "Nouveau",
  vieilles_vignes: "Vieilles Vignes",
  reserve: "Réserve",
  mise_en_cave: "Mise en Cave",
};

export default function BadgeDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const badge = getBadgeById(params.id);

  if (!badge) {
    return (
      <AppShell>
        <div className="flex min-h-[60vh] items-center justify-center">
          <p className="text-sm text-[var(--color-text-tertiary)]">Badge not found.</p>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="mx-auto max-w-md px-6 pb-12 pt-8">
        {/* Back link */}
        <button
          type="button"
          onClick={() => router.back()}
          className="mb-8 text-xs font-medium uppercase tracking-[0.15em] text-[var(--color-accent-secondary)] transition hover:text-[var(--color-accent-primary)]"
        >
          &larr; All Badges
        </button>

        {/* Badge icon */}
        <div className="flex flex-col items-center gap-5">
          <BadgeIcon
            shape={badge.shape as BadgeShape}
            color={badge.color as BadgeColor}
            accent={badge.accent as BadgeAccentColor}
            tier={badge.tier as BadgeTier}
            size={120}
          />

          {/* Name */}
          <h1
            className="text-center text-2xl font-semibold text-[var(--color-text-primary)]"
            style={{ fontFamily: "var(--font-serif)" }}
          >
            {badge.name}
          </h1>

          {/* Tier label */}
          <span
            className="rounded-full px-4 py-1 text-[10px] font-semibold uppercase tracking-[0.2em]"
            style={{
              backgroundColor: BADGE_TIER_COLORS[badge.tier] + "22",
              color: BADGE_TIER_COLORS[badge.tier],
            }}
          >
            {TIER_LABEL[badge.tier] ?? badge.tier}
          </span>

          {/* Description */}
          <p
            className="mt-2 text-center text-sm leading-relaxed text-[var(--color-text-secondary)]"
            style={{ maxWidth: 320 }}
          >
            {badge.description}
          </p>
        </div>
      </div>
    </AppShell>
  );
}

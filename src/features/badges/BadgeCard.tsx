"use client";

import React from "react";
import Link from "next/link";
import BadgeIcon from "./BadgeIcon";
import { describeBadgeTrigger } from "./badgeTriggerCopy";
import type {
  BadgeDefinition,
  BadgeCategory,
  BadgeTier,
  BadgeColor,
  BadgeAccentColor,
  BadgeShape,
} from "@shared";

interface BadgeCardProps {
  badge: BadgeDefinition;
  isEarned: boolean;
  isSelected: boolean;
  isFeatured: boolean;
  /** ISO timestamp the viewer earned this badge, if earned. */
  earnedAt?: string | null;
  onSelect: (id: string) => void;
  onFeature: (id: string) => void;
}

const TIER_DOT_COLOR: Record<BadgeTier, string> = {
  nouveau: "#C4607A",
  vieilles_vignes: "#7B1D3A",
  reserve: "#C9A84C",
  mise_en_cave: "#2C1A0E",
};

const CATEGORY_DOT_COLOR: Record<BadgeCategory, string> = {
  taste: "#C4607A",
  region: "#4A3060",
  milestone: "#C9A84C",
  social: "#7B1D3A",
};

function formatEarnedDate(iso: string): string | null {
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export default function BadgeCard({
  badge,
  isEarned,
  isSelected,
  isFeatured,
  earnedAt,
  onSelect,
  onFeature,
}: BadgeCardProps) {
  const earnedDateLabel = earnedAt ? formatEarnedDate(earnedAt) : null;
  const requirement = describeBadgeTrigger(badge.trigger);

  return (
    // div with button semantics: a real <button> here would nest the
    // "Feature"/"More" affordances inside it, which is invalid HTML and
    // breaks hydration. Tapping flips the tile in place (CSS 3D flip) instead
    // of navigating away — the back face carries name/how-earned/progress,
    // with a "More" link for anyone who wants the full detail page.
    <div
      role="button"
      tabIndex={0}
      className={`relative cursor-pointer overflow-hidden rounded-xl bg-[var(--color-surface-raised)] p-3 transition-shadow focus:outline-none focus:ring-2 focus:ring-[var(--color-accent-primary)]/30 [perspective:900px] ${
        isFeatured
          ? "ring-2 ring-[var(--color-accent-gold)] shadow-[0_0_12px_rgba(201,168,76,0.3)]"
          : ""
      }`}
      style={{ minHeight: 132 }}
      onClick={() => onSelect(badge.id)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onSelect(badge.id);
        }
      }}
      aria-pressed={isSelected}
      aria-label={`${isSelected ? "Hide" : "Show"} details for ${isEarned ? badge.name : "a locked badge"}`}
    >
      <div
        className={`relative h-full w-full transition-transform duration-500 motion-reduce:transition-none [transform-style:preserve-3d] ${
          isSelected ? "[transform:rotateY(180deg)]" : ""
        }`}
      >
        {/* Front face */}
        <div className="flex flex-col items-center gap-1.5 [backface-visibility:hidden]">
          <BadgeIcon
            shape={badge.shape as BadgeShape}
            color={badge.color as BadgeColor}
            accent={badge.accent as BadgeAccentColor}
            tier={badge.tier as BadgeTier}
            size={56}
            locked={!isEarned}
          />
          <span
            className={`line-clamp-2 text-center text-xs font-semibold leading-snug ${
              isEarned
                ? "text-[var(--color-text-primary)]"
                : "text-[var(--color-text-tertiary)]"
            }`}
          >
            {isEarned ? badge.name : "???"}
          </span>
          <span
            className="inline-block h-2 w-2 rounded-full"
            style={{
              backgroundColor: isEarned
                ? TIER_DOT_COLOR[badge.tier]
                : (CATEGORY_DOT_COLOR[badge.category] ?? "#5D5570"),
            }}
          />
        </div>

        {/* Back face — name, how it's earned / progress, and a "More" link
            for the full detail page rather than forcing navigation just to
            read what a badge is. Badge copy length varies a lot (12-93
            chars for names+descriptions across the 85 definitions), so the
            middle section scrolls independently instead of letting long
            copy overflow the fixed-height tile and collide with the
            actions row below — the name/label header and the actions
            footer are always fully visible; only the description area
            ever needs a scroll for the longest outliers. */}
        <div className="absolute inset-0 flex flex-col items-center gap-1 px-2 py-2 text-center [transform:rotateY(180deg)] [backface-visibility:hidden]">
          <span className="line-clamp-2 shrink-0 text-[11px] font-semibold leading-snug text-[var(--color-text-primary)]">
            {badge.name}
          </span>
          <p
            className={`shrink-0 text-[9px] font-semibold uppercase tracking-wide ${
              isEarned ? "text-[var(--color-accent-secondary)]" : "text-[var(--color-text-tertiary)]"
            }`}
          >
            {isEarned ? (earnedDateLabel ? `Earned ${earnedDateLabel}` : "Earned") : "Not yet earned"}
          </p>
          <div className="min-h-0 flex-1 overflow-y-auto">
            <p className="text-[10px] leading-snug text-[var(--color-text-secondary)]">
              {isEarned ? badge.description : requirement}
            </p>
          </div>
          <div className="mt-1 flex shrink-0 items-center gap-1.5">
            {isEarned ? (
              <button
                type="button"
                className="rounded-full bg-[var(--color-accent-gold)] px-2.5 py-1 text-[9px] font-semibold uppercase tracking-wider text-[var(--color-surface-primary)]"
                onClick={(e) => {
                  e.stopPropagation();
                  onFeature(badge.id);
                }}
              >
                Feature
              </button>
            ) : null}
            <Link
              href={`/badges/${badge.id}`}
              onClick={(e) => e.stopPropagation()}
              className="rounded-full border border-[var(--color-border)] px-2.5 py-1 text-[9px] font-semibold uppercase tracking-wider text-[var(--color-text-secondary)] transition hover:border-[var(--color-border-strong)]"
            >
              More
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

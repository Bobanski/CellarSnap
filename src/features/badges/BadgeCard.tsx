"use client";

import React from "react";
import BadgeIcon from "./BadgeIcon";
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

export default function BadgeCard({
  badge,
  isEarned,
  isSelected,
  isFeatured,
  onSelect,
  onFeature,
}: BadgeCardProps) {
  if (!isEarned) {
    return (
      <div className="flex flex-col items-center gap-1.5 rounded-xl bg-[var(--color-surface-raised)] p-3">
        <BadgeIcon
          shape={badge.shape as BadgeShape}
          color={badge.color as BadgeColor}
          accent={badge.accent as BadgeAccentColor}
          tier={badge.tier as BadgeTier}
          size={56}
          locked
        />
        <span className="text-xs font-medium text-[var(--color-text-tertiary)]">
          ???
        </span>
        <span
          className="inline-block h-2 w-2 rounded-full"
          style={{ backgroundColor: CATEGORY_DOT_COLOR[badge.category] ?? "#5D5570" }}
        />
      </div>
    );
  }

  return (
    <button
      type="button"
      className={`relative cursor-pointer rounded-xl bg-[var(--color-surface-raised)] p-3 transition-shadow focus:outline-none focus:ring-2 focus:ring-[var(--color-accent-primary)]/30 [perspective:900px] ${
        isFeatured
          ? "ring-2 ring-[var(--color-accent-gold)] shadow-[0_0_12px_rgba(201,168,76,0.3)]"
          : ""
      }`}
      onClick={() => onSelect(badge.id)}
      aria-pressed={isSelected}
      aria-label={`${isSelected ? "Hide" : "Show"} details for ${badge.name} badge`}
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
          />
          <span className="text-xs font-semibold text-[var(--color-text-primary)]">
            {badge.name}
          </span>
          <span
            className="inline-block h-2 w-2 rounded-full"
            style={{ backgroundColor: TIER_DOT_COLOR[badge.tier] }}
          />
        </div>

        {/* Back face */}
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 px-2 text-center [transform:rotateY(180deg)] [backface-visibility:hidden]">
          <p className="text-xs leading-snug text-[var(--color-text-secondary)]">
            {badge.description}
          </p>
          <button
            type="button"
            className="mt-1 rounded-full bg-[var(--color-accent-gold)] px-3 py-1 text-[10px] font-semibold uppercase tracking-wider text-[var(--color-surface-primary)]"
            onClick={(e) => {
              e.stopPropagation();
              onFeature(badge.id);
            }}
          >
            Feature
          </button>
        </div>
      </div>
    </button>
  );
}

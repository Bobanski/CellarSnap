"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import BadgeCard from "./BadgeCard";
import { useBadges } from "./useBadges";
import {
  BADGE_DEFINITIONS,
  type BadgeCategory,
  type BadgeDefinition,
} from "@shared";

const CATEGORY_COLOR: Record<BadgeCategory | "all", string> = {
  all: "#7B1D3A",
  taste: "#C4607A",
  region: "#4A3060",
  milestone: "#C9A84C",
  social: "#7B1D3A",
};

const CATEGORY_TABS: Array<{ label: string; value: BadgeCategory | "all" }> = [
  { label: "All", value: "all" },
  { label: "Taste", value: "taste" },
  { label: "Region", value: "region" },
  { label: "Milestone", value: "milestone" },
  { label: "Social", value: "social" },
];

export function BadgesPage() {
  const router = useRouter();
  const { badges: earnedBadges, featuredBadgeId, isLoading, error } = useBadges();
  const [activeCategory, setActiveCategory] = useState<BadgeCategory | "all">("all");

  const earnedSet = new Set(earnedBadges.map((b) => b.id));

  const filteredBadges = (
    activeCategory === "all"
      ? [...BADGE_DEFINITIONS]
      : BADGE_DEFINITIONS.filter((b) => b.category === activeCategory)
  ).sort((a, b) => {
    const aEarned = earnedSet.has(a.id) ? 0 : 1;
    const bEarned = earnedSet.has(b.id) ? 0 : 1;
    return aEarned - bEarned;
  });

  return (
    <div className="mx-auto max-w-2xl px-4 pb-8 pt-6">
      <h1
        className="mb-1 text-2xl font-semibold text-[var(--color-text-primary)]"
        style={{ fontFamily: "var(--font-serif)" }}
      >
        Badges
      </h1>
      <p className="mb-5 text-sm text-[var(--color-text-secondary)]">
        {earnedSet.size} of {BADGE_DEFINITIONS.length} earned
      </p>

      {/* Category filter tabs */}
      <div className="mb-5 flex gap-2 overflow-x-auto">
        {CATEGORY_TABS.map((tab) => (
          <button
            key={tab.value}
            type="button"
            onClick={() => setActiveCategory(tab.value)}
            style={activeCategory === tab.value ? { backgroundColor: CATEGORY_COLOR[tab.value] } : undefined}
            className={`shrink-0 rounded-full px-4 py-1.5 text-xs font-medium tracking-wide transition-colors ${
              activeCategory === tab.value
                ? "text-[var(--color-text-on-accent)]"
                : "bg-[var(--color-surface-raised)] text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-hover)]"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Loading / Error */}
      {isLoading && (
        <p className="py-8 text-center text-sm text-[var(--color-text-tertiary)]">
          Loading badges...
        </p>
      )}
      {error && (
        <p className="py-8 text-center text-sm text-[var(--color-error)]">
          {error}
        </p>
      )}

      {/* Badge grid */}
      {!isLoading && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
          {filteredBadges.map((badge) => (
            <BadgeCard
              key={badge.id}
              badge={badge}
              isEarned={earnedSet.has(badge.id)}
              isSelected={false}
              isFeatured={featuredBadgeId === badge.id}
              onSelect={(id) => router.push(`/badges/${id}`)}
              onFeature={() => {}}
            />
          ))}
        </div>
      )}
    </div>
  );
}

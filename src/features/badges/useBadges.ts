"use client";

import { useCallback, useEffect, useState } from "react";

export interface EarnedBadge {
  id: string;
  name: string;
  category: string;
  tier: string;
  color: string;
  accent: string;
  shape: string;
  description: string;
  earned_at: string;
}

interface BadgesResponse {
  badges: EarnedBadge[];
  featured_badge_id: string | null;
  featured_badge_ids?: string[];
  total_earned: number;
}

interface SetFeaturedBadgesResult {
  /** True if the DB doesn't have the featured_badge_ids column yet
   *  (097_featured_badges.sql not applied) — only the first pick persisted. */
  migrationPending: boolean;
}

interface UseBadgesReturn {
  badges: EarnedBadge[];
  featuredBadgeId: string | null;
  /** Up to 5, ordered. Falls back to `[featuredBadgeId]` on an unmigrated DB. */
  featuredBadgeIds: string[];
  totalEarned: number;
  isLoading: boolean;
  error: string | null;
  refetch: () => void;
  setFeaturedBadge: (badgeId: string) => Promise<void>;
  /** Ordered list of up to 5 earned badge ids; replaces the whole selection. */
  setFeaturedBadges: (badgeIds: string[]) => Promise<SetFeaturedBadgesResult>;
}

export function useBadges(userId?: string): UseBadgesReturn {
  const [badges, setBadges] = useState<EarnedBadge[]>([]);
  const [featuredBadgeId, setFeaturedBadgeId] = useState<string | null>(null);
  const [featuredBadgeIds, setFeaturedBadgeIdsState] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchBadges = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const url = userId ? `/api/badges?user_id=${userId}` : "/api/badges";
      const res = await fetch(url);
      if (!res.ok) throw new Error("Failed to fetch badges");
      const data: BadgesResponse = await res.json();
      setBadges(data.badges);
      setFeaturedBadgeId(data.featured_badge_id);
      setFeaturedBadgeIdsState(
        data.featured_badge_ids && data.featured_badge_ids.length > 0
          ? data.featured_badge_ids
          : data.featured_badge_id
            ? [data.featured_badge_id]
            : []
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setIsLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    fetchBadges();
  }, [fetchBadges]);

  const setFeaturedBadge = useCallback(
    async (badgeId: string) => {
      const prevFeatured = featuredBadgeId;
      const prevFeaturedList = featuredBadgeIds;
      setFeaturedBadgeId(badgeId);
      setFeaturedBadgeIdsState([badgeId]);
      try {
        const res = await fetch("/api/badges/featured", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ badge_id: badgeId }),
        });
        if (!res.ok) throw new Error("Failed to set featured badge");
      } catch (err) {
        setFeaturedBadgeId(prevFeatured);
        setFeaturedBadgeIdsState(prevFeaturedList);
        setError(err instanceof Error ? err.message : "Unknown error");
      }
    },
    [featuredBadgeId, featuredBadgeIds],
  );

  const setFeaturedBadges = useCallback(
    async (badgeIds: string[]) => {
      const prevFeatured = featuredBadgeId;
      const prevFeaturedList = featuredBadgeIds;
      const nextIds = badgeIds.slice(0, 5);
      setFeaturedBadgeIdsState(nextIds);
      setFeaturedBadgeId(nextIds[0] ?? null);
      try {
        const res = await fetch("/api/badges/featured", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ badge_ids: nextIds }),
        });
        if (!res.ok) throw new Error("Failed to set featured badges");
        const data = await res.json().catch(() => null);
        if (data) {
          // The server echoes back what was actually persisted (which can
          // be a truncated single-badge list if featured_badge_ids doesn't
          // exist on this DB yet) — trust that over our optimistic guess.
          setFeaturedBadgeId(data.featured_badge_id ?? nextIds[0] ?? null);
          setFeaturedBadgeIdsState(
            data.featured_badge_ids && data.featured_badge_ids.length > 0
              ? data.featured_badge_ids
              : nextIds
          );
          return { migrationPending: Boolean(data.migration_pending) };
        }
        return { migrationPending: false };
      } catch (err) {
        setFeaturedBadgeId(prevFeatured);
        setFeaturedBadgeIdsState(prevFeaturedList);
        setError(err instanceof Error ? err.message : "Unknown error");
        throw err;
      }
    },
    [featuredBadgeId, featuredBadgeIds],
  );

  return {
    badges,
    featuredBadgeId,
    featuredBadgeIds,
    totalEarned: badges.length,
    isLoading,
    error,
    refetch: fetchBadges,
    setFeaturedBadge,
    setFeaturedBadges,
  };
}

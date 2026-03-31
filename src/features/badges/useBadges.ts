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
  total_earned: number;
}

interface UseBadgesReturn {
  badges: EarnedBadge[];
  featuredBadgeId: string | null;
  totalEarned: number;
  isLoading: boolean;
  error: string | null;
  refetch: () => void;
  setFeaturedBadge: (badgeId: string) => Promise<void>;
}

export function useBadges(userId?: string): UseBadgesReturn {
  const [badges, setBadges] = useState<EarnedBadge[]>([]);
  const [featuredBadgeId, setFeaturedBadgeId] = useState<string | null>(null);
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
      setFeaturedBadgeId(badgeId);
      try {
        const res = await fetch("/api/badges/featured", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ badge_id: badgeId }),
        });
        if (!res.ok) throw new Error("Failed to set featured badge");
      } catch (err) {
        setFeaturedBadgeId(prevFeatured);
        setError(err instanceof Error ? err.message : "Unknown error");
      }
    },
    [featuredBadgeId],
  );

  return {
    badges,
    featuredBadgeId,
    totalEarned: badges.length,
    isLoading,
    error,
    refetch: fetchBadges,
    setFeaturedBadge,
  };
}

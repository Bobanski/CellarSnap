"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import AppShell from "@/components/AppShell";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import { useBadges } from "@/features/badges/useBadges";
import {
  PalateHeaderCard,
  type PalateProfile,
  type PalateStats,
} from "@/components/palate/PalateHeaderCard";
import {
  PalateSubTabs,
  type PalateSubTab,
} from "@/components/palate/PalateSubTabs";
import PalateProfileTab from "@/features/palate/PalateProfile";
import { LibraryTab } from "@/components/palate/LibraryTab";
import { CellarTab } from "@/components/palate/CellarTab";
import { BadgesTab } from "@/components/palate/BadgesTab";
import { FriendsTab } from "@/components/palate/FriendsTab";

const VALID_TABS: PalateSubTab[] = ["palate", "library", "cellar", "badges", "friends"];

function parseTab(raw: string | null): PalateSubTab {
  if (raw && VALID_TABS.includes(raw as PalateSubTab)) return raw as PalateSubTab;
  return "palate";
}

function PalatePageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);

  const [activeTab, setActiveTab] = useState<PalateSubTab>(() =>
    parseTab(searchParams.get("tab"))
  );
  const [profile, setProfile] = useState<PalateProfile | null>(null);
  const [stats, setStats] = useState<PalateStats>({ wines: 0, friends: 0, badges: 0, countries: 0 });
  const [loading, setLoading] = useState(true);
  // Track which tabs have been activated (for lazy mounting)
  const [mountedTabs, setMountedTabs] = useState<Set<PalateSubTab>>(
    () => new Set([parseTab(searchParams.get("tab"))])
  );

  const { badges: earnedBadges } = useBadges();

  const handleTabChange = (tab: PalateSubTab) => {
    setActiveTab(tab);
    setMountedTabs((prev) => new Set([...prev, tab]));
    router.replace(`/palate${tab === "palate" ? "" : `?tab=${tab}`}`, { scroll: false });
  };

  // Load profile + stats on mount
  useEffect(() => {
    let mounted = true;

    const load = async () => {
      const [profileRes, friendsRes] = await Promise.all([
        fetch("/api/profile", { cache: "no-store" }),
        fetch("/api/friends", { cache: "no-store" }),
      ]);

      let profileData: PalateProfile | null = null;
      if (profileRes.ok) {
        const data = await profileRes.json();
        const p = data.profile ?? data;
        profileData = {
          display_name: p.display_name ?? null,
          avatar_url: p.avatar_url ?? null,
          featured_badge_id: p.featured_badge_id ?? null,
          created_at: p.created_at ?? null,
        };
      }

      let friendCount = 0;
      if (friendsRes.ok) {
        const data = await friendsRes.json();
        friendCount = Array.isArray(data.friends) ? data.friends.length : 0;
      }

      // Get wine + country counts
      const { data: { user } } = await supabase.auth.getUser();
      let wineCount = 0;
      let countryCount = 0;
      if (user) {
        const { count } = await supabase
          .from("wine_entries")
          .select("id", { count: "exact", head: true })
          .eq("user_id", user.id);
        wineCount = count ?? 0;

        const { data: countryData } = await supabase
          .from("wine_entries")
          .select("canonical_country")
          .eq("user_id", user.id)
          .not("canonical_country", "is", null);
        if (countryData) {
          countryCount = new Set(
            countryData.map((r: { canonical_country: string | null }) => r.canonical_country?.trim()).filter(Boolean)
          ).size;
        }
      }

      if (mounted) {
        setProfile(profileData);
        setStats({
          wines: wineCount,
          friends: friendCount,
          badges: earnedBadges.length,
          countries: countryCount,
        });
        setLoading(false);
      }
    };

    load();
    return () => { mounted = false; };
  }, [supabase, earnedBadges.length]);

  return (
    <AppShell>
      <div className="mx-auto max-w-2xl px-4 pb-20 pt-6">
        <PalateHeaderCard
          profile={profile}
          stats={stats}
          loading={loading}
          onSettingsOpen={() => {
            router.push("/profile");
          }}
        />

        <div className="mt-5">
          <PalateSubTabs active={activeTab} onChange={handleTabChange} />
        </div>

        <div className="mt-6">
          {activeTab === "palate" && mountedTabs.has("palate") && <PalateProfileTab />}
          {activeTab === "library" && mountedTabs.has("library") && <LibraryTab />}
          {activeTab === "cellar" && mountedTabs.has("cellar") && <CellarTab />}
          {activeTab === "badges" && mountedTabs.has("badges") && <BadgesTab />}
          {activeTab === "friends" && mountedTabs.has("friends") && <FriendsTab />}
        </div>
      </div>
    </AppShell>
  );
}

export default function PalatePage() {
  return (
    <Suspense>
      <PalatePageContent />
    </Suspense>
  );
}

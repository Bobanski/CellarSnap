"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import AppShell from "@/components/AppShell";
import { fetchActivitySummary } from "@/features/profile/activitySummary";
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

  const [activeTab, setActiveTab] = useState<PalateSubTab>(() =>
    parseTab(searchParams.get("tab"))
  );
  const [profile, setProfile] = useState<PalateProfile | null>(null);
  const [stats, setStats] = useState<PalateStats>({ wines: null, friends: null, badges: null, countries: null });
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
      const [profileRes, summary] = await Promise.all([
        fetch("/api/profile", { cache: "no-store" }),
        fetchActivitySummary(),
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

      if (mounted) {
        setProfile(profileData);
        setStats({
          wines: summary.entryCount,
          friends: summary.friendCount,
          badges: summary.badgeCount,
          countries: summary.countryCount,
        });
        setLoading(false);
      }
    };

    load().catch(() => {
      if (mounted) { setStats({wines:null,friends:null,badges:null,countries:null}); setLoading(false); }
    });
    return () => { mounted = false; };
  }, [earnedBadges.length]);

  return (
    <AppShell>
      <div className="mx-auto max-w-2xl px-4 pt-6 pb-[var(--app-bottom-nav-height)]">
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

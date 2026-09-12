import { NextResponse } from "next/server";
import { RequestAuthError, requireRequestAuth } from "@/server/auth/requestAuth";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

type TrendingItem = {
  rank: number;
  name: string;
  type: "region" | "grape";
  slug: string;
  href: string;
  hero_image_url: string | null;
};

type FeaturedCard = {
  slug: string;
  display_name: string;
  tagline: string;
  hero_image_url: string | null;
  characteristics: string[];
  href: string;
};

// Deterministic ISO-8601 week number (Monday-start week, week 1 contains the
// year's first Thursday), combined with the ISO year into a single
// monotonic-enough integer so the "of the week" rotation is stable for all
// visitors within the same calendar week and advances predictably across
// year boundaries (53 is the ISO max week count in a year).
function getIsoWeekKey(date: Date): number {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const dayNum = d.getUTCDay() || 7; // Mon=1 .. Sun=7
  d.setUTCDate(d.getUTCDate() + 4 - dayNum); // shift to this week's Thursday
  const isoYear = d.getUTCFullYear();
  const yearStart = new Date(Date.UTC(isoYear, 0, 1));
  const isoWeek = Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
  return isoYear * 53 + isoWeek;
}

function normalizeSlug(raw: string): string {
  return raw
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

// Trending mirrors the feed: the grapes and regions of the most recently
// logged public wines, newest first, deduped. No counting windows — with a
// small community, recency is the honest signal.
const RECENT_ENTRY_SCAN_LIMIT = 60;

async function queryRecentTrending(
  admin: ReturnType<typeof createSupabaseAdminClient>
): Promise<Array<{ name: string; type: "region" | "grape" }>> {
  const { data: recentEntries } = await admin
    .from("wine_entries")
    .select("id, canonical_region, created_at")
    .or("entry_privacy.eq.public,entry_privacy.is.null")
    .order("created_at", { ascending: false })
    .limit(RECENT_ENTRY_SCAN_LIMIT);

  if (!recentEntries || recentEntries.length === 0) {
    return [];
  }

  const { data: grapeRows } = await admin
    .from("entry_primary_grapes")
    .select("entry_id, position, grape_varieties(name)")
    .in(
      "entry_id",
      recentEntries.map((entry) => entry.id)
    )
    .order("position", { ascending: true });

  const grapesByEntryId = new Map<string, string[]>();
  for (const row of grapeRows ?? []) {
    const variety = row.grape_varieties as unknown as { name: string } | null;
    const name = variety?.name?.trim();
    if (!name) continue;
    const list = grapesByEntryId.get(row.entry_id as string) ?? [];
    list.push(name);
    grapesByEntryId.set(row.entry_id as string, list);
  }

  // Walk entries newest-first; each contributes its grape(s) then its region.
  const seen = new Set<string>();
  const items: Array<{ name: string; type: "region" | "grape" }> = [];
  for (const entry of recentEntries) {
    for (const grape of grapesByEntryId.get(entry.id as string) ?? []) {
      const key = `grape:${grape}`;
      if (!seen.has(key)) {
        seen.add(key);
        items.push({ name: grape, type: "grape" });
      }
    }
    const region = (entry.canonical_region as string | null)?.trim();
    if (region) {
      const key = `region:${region}`;
      if (!seen.has(key)) {
        seen.add(key);
        items.push({ name: region, type: "region" });
      }
    }
  }

  return items;
}

function extractCharacteristics(
  content: Record<string, unknown>,
  profileType: "region" | "grape"
): string[] {
  if (profileType === "region") {
    const grapes = content.key_grapes as Array<{ name: string }> | undefined;
    if (Array.isArray(grapes)) {
      return grapes.slice(0, 4).map((g) => g.name);
    }
  }

  if (profileType === "grape") {
    const profile = content.flavor_profile as Record<string, number> | undefined;
    if (profile && typeof profile === "object") {
      return Object.entries(profile)
        .filter(([, val]) => typeof val === "number" && val >= 60)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 4)
        .map(([key]) => `${key.replace(/_/g, " ")}`);
    }
  }

  const funFacts = content.fun_facts as string[] | undefined;
  if (Array.isArray(funFacts) && funFacts.length > 0) {
    return [funFacts[0].slice(0, 60)];
  }

  return [];
}

export async function GET(request: Request) {
  try {
    await requireRequestAuth(request);
  } catch (error) {
    if (error instanceof RequestAuthError) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    throw error;
  }

  const admin = createSupabaseAdminClient();

  // Run trending query and profile lookups in parallel
  const now = new Date();

  const [recentTrending, regionProfiles, grapeProfiles] =
    await Promise.all([
      queryRecentTrending(admin),
      admin
        .from("wine_profiles")
        .select("slug, display_name, content, hero_image_url")
        .eq("profile_type", "region")
        .not("content", "is", null)
        .order("created_at", { ascending: true }),
      admin
        .from("wine_profiles")
        .select("slug, display_name, content, hero_image_url")
        .eq("profile_type", "grape")
        .not("content", "is", null)
        .order("created_at", { ascending: true }),
    ]);

  // Cached hero images for trending items — cached-only (never triggers
  // generation from this surface), looked up from the profile rows already
  // fetched above for the featured-region/grape-spotlight rotation.
  const imageBySlug = new Map<string, string | null>();
  for (const row of regionProfiles.data ?? []) {
    imageBySlug.set(`region:${row.slug}`, row.hero_image_url ?? null);
  }
  for (const row of grapeProfiles.data ?? []) {
    imageBySlug.set(`grape:${row.slug}`, row.hero_image_url ?? null);
  }

  const trending: TrendingItem[] = recentTrending.slice(0, 3).map((item, i) => {
    const slug = normalizeSlug(item.name);
    return {
      rank: i + 1,
      name: item.name,
      type: item.type,
      slug,
      href: `/explore/${item.type}/${slug}`,
      hero_image_url: imageBySlug.get(`${item.type}:${slug}`) ?? null,
    };
  });

  // Featured region — deterministic weekly rotation (ISO week)
  let featured_region: FeaturedCard | null = null;
  const rProfiles = regionProfiles.data;
  if (rProfiles && rProfiles.length > 0) {
    const weekKey = getIsoWeekKey(now);
    const pick = rProfiles[weekKey % rProfiles.length];
    const content = pick.content as Record<string, unknown>;
    featured_region = {
      slug: pick.slug,
      display_name: pick.display_name,
      tagline: (content.tagline as string) ?? "",
      hero_image_url: pick.hero_image_url,
      characteristics: extractCharacteristics(content, "region"),
      href: `/explore/region/${pick.slug}`,
    };
  }

  // Grape spotlight — deterministic weekly rotation (offset by half so it doesn't match region)
  let grape_spotlight: FeaturedCard | null = null;
  const gProfiles = grapeProfiles.data;
  if (gProfiles && gProfiles.length > 0) {
    const weekKey = getIsoWeekKey(now);
    const pick = gProfiles[(weekKey + Math.floor(gProfiles.length / 2)) % gProfiles.length];
    const content = pick.content as Record<string, unknown>;
    const story = content.story as string | undefined;
    grape_spotlight = {
      slug: pick.slug,
      display_name: pick.display_name,
      tagline: (content.tagline as string) ?? "",
      hero_image_url: pick.hero_image_url,
      characteristics: extractCharacteristics(content, "grape"),
      href: `/explore/grape/${pick.slug}`,
    };
    if (story) {
      grape_spotlight.tagline = story.split(".").slice(0, 2).join(".") + ".";
    }
  }

  return NextResponse.json(
    { trending, featured_region, grape_spotlight },
    {
      headers: {
        // Short cache so trending tracks the feed; featured cards rotate weekly anyway
        "Cache-Control": "s-maxage=300, stale-while-revalidate=600",
      },
    }
  );
}

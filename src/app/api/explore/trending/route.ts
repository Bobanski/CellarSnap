import { NextResponse } from "next/server";
import { RequestAuthError, requireRequestAuth } from "@/server/auth/requestAuth";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

type TrendingItem = {
  rank: number;
  name: string;
  type: "region" | "grape" | "producer";
  slug: string;
  href: string;
  subtitle: string;
};

type FeaturedCard = {
  slug: string;
  display_name: string;
  tagline: string;
  hero_image_url: string | null;
  characteristics: string[];
  href: string;
};

function normalizeSlug(raw: string): string {
  return raw
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

async function queryTrending(
  admin: ReturnType<typeof createSupabaseAdminClient>,
  cutoff: string | null
): Promise<Array<{ name: string; type: "region" | "grape" | "producer"; count: number }>> {
  const counts = new Map<string, { type: "region" | "grape" | "producer"; count: number }>();

  // --- Regions ---
  let regionQuery = admin
    .from("wine_entries")
    .select("canonical_region")
    .not("canonical_region", "is", null);
  if (cutoff) regionQuery = regionQuery.gte("created_at", cutoff);
  const { data: regionRows } = await regionQuery.limit(5000);

  if (regionRows) {
    for (const row of regionRows) {
      const name = (row.canonical_region as string)?.trim();
      if (!name) continue;
      const key = `region:${name}`;
      const existing = counts.get(key);
      counts.set(key, { type: "region", count: (existing?.count ?? 0) + 1 });
    }
  }

  // --- Producers ---
  let producerQuery = admin
    .from("wine_entries")
    .select("producer")
    .not("producer", "is", null);
  if (cutoff) producerQuery = producerQuery.gte("created_at", cutoff);
  const { data: producerRows } = await producerQuery.limit(5000);

  if (producerRows) {
    for (const row of producerRows) {
      const name = (row.producer as string)?.trim();
      if (!name) continue;
      const key = `producer:${name}`;
      const existing = counts.get(key);
      counts.set(key, { type: "producer", count: (existing?.count ?? 0) + 1 });
    }
  }

  // --- Grapes ---
  let grapeQuery = admin
    .from("entry_primary_grapes")
    .select("grape_varieties(name)");
  if (cutoff) grapeQuery = grapeQuery.gte("created_at", cutoff);
  const { data: grapeRows } = await grapeQuery.limit(5000);

  if (grapeRows) {
    for (const row of grapeRows) {
      const variety = row.grape_varieties as unknown as { name: string } | null;
      const name = variety?.name?.trim();
      if (!name) continue;
      const key = `grape:${name}`;
      const existing = counts.get(key);
      counts.set(key, { type: "grape", count: (existing?.count ?? 0) + 1 });
    }
  }

  return [...counts.entries()]
    .map(([key, val]) => ({ name: key.split(":").slice(1).join(":"), ...val }))
    .sort((a, b) => b.count - a.count);
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
  const cutoff7d = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const cutoff30d = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();

  const [allTrending7d, regionProfiles, grapeProfiles] = await Promise.all([
    queryTrending(admin, cutoff7d),
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

  // Cascade trending windows if needed
  let trendingItems = allTrending7d;
  let subtitle = "logged this week";
  if (trendingItems.length < 3) {
    trendingItems = await queryTrending(admin, cutoff30d);
    subtitle = "logged this month";
  }
  if (trendingItems.length < 3) {
    trendingItems = await queryTrending(admin, null);
    subtitle = "total logs";
  }

  const trending: TrendingItem[] = trendingItems.slice(0, 3).map((item, i) => ({
    rank: i + 1,
    name: item.name,
    type: item.type,
    slug: normalizeSlug(item.name),
    href: `/explore/${item.type}/${normalizeSlug(item.name)}`,
    subtitle: `${item.count} ${subtitle}`,
  }));

  // Featured region — deterministic daily rotation
  let featured_region: FeaturedCard | null = null;
  const rProfiles = regionProfiles.data;
  if (rProfiles && rProfiles.length > 0) {
    const dayOfYear = Math.floor(
      (now.getTime() - new Date(now.getFullYear(), 0, 0).getTime()) / 86400000
    );
    const pick = rProfiles[dayOfYear % rProfiles.length];
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

  // Grape spotlight — deterministic daily rotation (offset by half so it doesn't match region)
  let grape_spotlight: FeaturedCard | null = null;
  const gProfiles = grapeProfiles.data;
  if (gProfiles && gProfiles.length > 0) {
    const dayOfYear = Math.floor(
      (now.getTime() - new Date(now.getFullYear(), 0, 0).getTime()) / 86400000
    );
    const pick = gProfiles[(dayOfYear + Math.floor(gProfiles.length / 2)) % gProfiles.length];
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
        "Cache-Control": "s-maxage=3600, stale-while-revalidate=7200",
      },
    }
  );
}

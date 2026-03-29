import { NextResponse } from "next/server";
import OpenAI from "openai";
import { RequestAuthError, requireRequestAuth } from "@/server/auth/requestAuth";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { signPhotoUrl } from "@/server/storage/signedUrls";

export const maxDuration = 60;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

const VALID_PROFILE_TYPES = ["grape", "region", "producer"] as const;
type ProfileType = (typeof VALID_PROFILE_TYPES)[number];

const CACHE_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

// ---------------------------------------------------------------------------
// Slug helpers
// ---------------------------------------------------------------------------

function normalizeSlug(raw: string): string {
  return raw.toLowerCase().trim().replace(/\s+/g, "-");
}

function slugToDisplayName(slug: string): string {
  return slug
    .split("-")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

// ---------------------------------------------------------------------------
// GPT prompt builders
// ---------------------------------------------------------------------------

function buildGrapePrompt(displayName: string): string {
  return `You are a wine expert writing educational content about the ${displayName} grape variety.

Write a JSON object with these fields:
- tagline: one-sentence description (max 15 words)
- origin: where this grape originated (1-2 sentences)
- characteristics: flavor/aroma profile (2-3 sentences)
- body: typical body level ("Light", "Medium", "Full")
- acidity: typical acidity ("Low", "Medium", "High")
- tannin: typical tannin ("Low", "Medium", "High") — null for whites
- key_regions: array of 3-5 regions known for this grape
- food_pairings: array of 4-6 food pairings
- fun_fact: one interesting fact most people don't know
- aging_potential: brief note on aging (1 sentence)
- related_grapes: array of 3-4 similar/related grapes

Return ONLY valid JSON.`;
}

function buildRegionPrompt(displayName: string): string {
  return `You are a wine storyteller writing for the Cluster wine app. Write about the ${displayName} wine region.

Your voice: sensory-first, personal, never textbook. You don't lecture — you make people feel what it's like to drink from this place.

Write a JSON object with these fields:
- tagline: one evocative sentence, max 15 words, taste-led (e.g. "Where Grenache burns slow and wild rosemary finds its way into every glass")
- country: country name
- climate: 1-2 sentences about climate, focused on how it shapes the wine in the glass
- story: exactly 3 sentences. First: what makes this region's wines distinctive in the glass. Second: the land/terroir that creates it. Third: why it matters to someone building their palate. Sensory and personal, never encyclopedic.
- key_grapes: array of objects with { name: string, context: string } — 4-6 grapes with a short phrase about what they do HERE specifically (not generic descriptions)
- notable_winemakers: array of objects with { name: string, why: string } — 3-5 producers with "why they matter" in one sentence
- appellations: array of objects with { name: string, character: string } — 3-5 sub-zones with a short sensory character note
- food_pairings: array of 4-6 specific regional food pairings (not generic — tied to the place)
- fun_facts: array of exactly 3 surprising "did you know" strings that would make someone stop mid-sip
- related_regions: array of 3-4 similar region names (strings)
- flavor_profile: object with { Tannin: number, Acidity: number, Body: number, Oak: number, Fruit: number } — each 0-100 scale representing the region's TYPICAL wine style
- classification: classification system if applicable (string or null)
- style: 2-3 sentences about typical wine styles from here
- most_loved_producer: object with { name: string, avg_rating: number } — the most celebrated producer from this region
- best_qpr_producer: object with { name: string, avg_rating: number } — the producer known for best quality-to-price ratio
- recommendation_picks: array of exactly 3 objects with { name: string, type: "grape"|"region"|"producer", why: string } — "if you like this, you may also enjoy" suggestions. IMPORTANT: Mix obvious and non-obvious picks. One can be directly related (e.g. the region's main grape). One should be a step removed — a region that profiles similarly but uses DIFFERENT grapes, or shares sensory components from a different part of the world (e.g. for CDP: Priorat because Grenache travels there but slate changes everything). The third should be a genuine surprise — something that shares a sensory thread but wouldn't be the first association (e.g. for CDP: a Barossa Grenache or a Bandol Mourvèdre). Avoid all three being from the same country or grape. The "why" should be one evocative sentence.
- zone_descriptions: array of 2-3 objects with { name: string, note: string } — key sub-zones/lieu-dits within this region with a sensory/terroir description of what makes each distinct
- personal_insight: string — a short, punchy insight sentence about this region's wines that could feel personal (e.g. "You always rate the Grenache-heavy ones higher. That's the garrigue talking.")

Return ONLY valid JSON. No markdown, no explanation.`;
}

function buildProducerPrompt(displayName: string): string {
  return `You are a wine expert writing educational content about ${displayName} (wine producer).

Write a JSON object with these fields:
- tagline: one-sentence description (max 15 words)
- region: primary region
- country: country
- founded: year founded or "Unknown"
- style: winemaking style description (2-3 sentences)
- key_wines: array of 3-5 notable wines/labels
- grapes: array of primary grapes used
- classification: quality tier if applicable (e.g., "Grand Cru Classé") or null
- fun_fact: one interesting fact
- related_producers: array of 3-4 similar producers

Return ONLY valid JSON.`;
}

function getPromptForType(type: ProfileType, displayName: string): string {
  switch (type) {
    case "grape":
      return buildGrapePrompt(displayName);
    case "region":
      return buildRegionPrompt(displayName);
    case "producer":
      return buildProducerPrompt(displayName);
  }
}

// ---------------------------------------------------------------------------
// GPT response parser (handles code fences)
// ---------------------------------------------------------------------------

function parseGptJson(responseText: string): Record<string, unknown> | null {
  let cleaned = responseText.trim();

  // Strip markdown code fences if present
  const fenceMatch = cleaned.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (fenceMatch) {
    cleaned = fenceMatch[1].trim();
  } else {
    cleaned = cleaned
      .replace(/^```(?:json)?\s*/i, "")
      .replace(/\s*```\s*$/, "")
      .trim();
  }

  try {
    const parsed = JSON.parse(cleaned);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed;
    }
  } catch {
    // Try extracting JSON from freeform text
    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      try {
        const extracted = JSON.parse(jsonMatch[0]);
        if (extracted && typeof extracted === "object" && !Array.isArray(extracted)) {
          return extracted;
        }
      } catch {
        // Give up
      }
    }
  }

  return null;
}

// ---------------------------------------------------------------------------
// Related slugs extraction
// ---------------------------------------------------------------------------

function extractRelatedSlugs(
  type: ProfileType,
  content: Record<string, unknown>
): string[] {
  let rawRelated: unknown[] = [];
  switch (type) {
    case "grape":
      rawRelated = Array.isArray(content.related_grapes) ? content.related_grapes : [];
      break;
    case "region":
      rawRelated = Array.isArray(content.related_regions) ? content.related_regions : [];
      break;
    case "producer":
      rawRelated = Array.isArray(content.related_producers)
        ? content.related_producers
        : [];
      break;
  }
  return rawRelated
    .filter((v): v is string => typeof v === "string")
    .map(normalizeSlug);
}

// ---------------------------------------------------------------------------
// Hero image fetching — Unsplash first, GPT Image fallback
// ---------------------------------------------------------------------------

type ImageResult = {
  hero_image_url: string | null;
  hero_image_attribution: { photographer: string; url: string } | null;
};

async function fetchUnsplashImage(
  type: ProfileType,
  displayName: string
): Promise<ImageResult> {
  const accessKey = process.env.UNSPLASH_ACCESS_KEY;
  if (!accessKey) {
    return { hero_image_url: null, hero_image_attribution: null };
  }

  let searchTerm: string;
  switch (type) {
    case "grape":
      searchTerm = `${displayName} grapes vineyard`;
      break;
    case "region":
      searchTerm = `${displayName} vineyard landscape`;
      break;
    case "producer":
      searchTerm = `${displayName} winery`;
      break;
  }

  try {
    const url = new URL("https://api.unsplash.com/search/photos");
    url.searchParams.set("query", searchTerm);
    url.searchParams.set("per_page", "1");
    url.searchParams.set("orientation", "landscape");

    const response = await fetch(url.toString(), {
      headers: { Authorization: `Client-ID ${accessKey}` },
    });

    if (!response.ok) {
      return { hero_image_url: null, hero_image_attribution: null };
    }

    const data = await response.json();
    const photo = data?.results?.[0];

    if (!photo) {
      return { hero_image_url: null, hero_image_attribution: null };
    }

    return {
      hero_image_url: photo.urls?.regular ?? null,
      hero_image_attribution: {
        photographer: photo.user?.name ?? "Unknown",
        url: photo.user?.links?.html ?? "",
      },
    };
  } catch {
    return { hero_image_url: null, hero_image_attribution: null };
  }
}

async function generateHeroImage(
  type: ProfileType,
  displayName: string,
  slug: string
): Promise<ImageResult> {
  try {
    const openai = new OpenAI();

    let subject: string;
    switch (type) {
      case "grape":
        subject = `a close-up of ${displayName} grapes on the vine at golden hour, with a moody vineyard landscape softly blurred in the background`;
        break;
      case "region":
        subject = `a breathtaking panoramic view of the ${displayName} wine region, rolling vineyard hills at dawn with mist in the valleys, warm golden light`;
        break;
      case "producer":
        subject = `an elegant wine estate in a prestigious wine region, stone building with aged wooden doors, vineyard rows leading to the horizon at sunset`;
        break;
    }

    const prompt = `Editorial wine photography, ultra high quality. ${subject}. Style: moody, cinematic, magazine-editorial feel with rich deep tones, warm highlights, and subtle purple-wine undertones in the shadows. Premium and sophisticated but inviting. Shot on medium format film. Landscape orientation, 16:9 aspect ratio.`;

    const response = await openai.images.generate({
      model: "gpt-image-1",
      prompt,
      n: 1,
      size: "1536x1024",
      quality: "medium",
    });

    // GPT Image returns base64 data or a temporary URL — we need to persist it
    const imageData = response.data?.[0];
    if (!imageData) {
      return { hero_image_url: null, hero_image_attribution: null };
    }

    // Upload to Supabase storage for permanent access
    const adminSupabase = createSupabaseAdminClient();
    const storagePath = `profile-heroes/${type}/${slug}.png`;

    let imageBuffer: Buffer;
    if (imageData.b64_json) {
      imageBuffer = Buffer.from(imageData.b64_json, "base64");
    } else if (imageData.url) {
      // Download the temporary URL
      const downloadRes = await fetch(imageData.url);
      if (!downloadRes.ok) {
        return { hero_image_url: null, hero_image_attribution: null };
      }
      imageBuffer = Buffer.from(await downloadRes.arrayBuffer());
    } else {
      return { hero_image_url: null, hero_image_attribution: null };
    }

    const { error: uploadError } = await adminSupabase.storage
      .from("public-assets")
      .upload(storagePath, imageBuffer, {
        contentType: "image/png",
        upsert: true,
      });

    if (uploadError) {
      // If bucket doesn't exist, try the entry-photos bucket as fallback
      const { error: fallbackError } = await adminSupabase.storage
        .from("entry-photos")
        .upload(storagePath, imageBuffer, {
          contentType: "image/png",
          upsert: true,
        });

      if (fallbackError) {
        // Last resort: return the temporary URL (will expire)
        return {
          hero_image_url: imageData.url ?? null,
          hero_image_attribution: { photographer: "AI Generated", url: "" },
        };
      }

      const { data: publicUrl } = adminSupabase.storage
        .from("entry-photos")
        .getPublicUrl(storagePath);

      return {
        hero_image_url: publicUrl?.publicUrl ?? null,
        hero_image_attribution: { photographer: "AI Generated", url: "" },
      };
    }

    const { data: publicUrl } = adminSupabase.storage
      .from("public-assets")
      .getPublicUrl(storagePath);

    return {
      hero_image_url: publicUrl?.publicUrl ?? null,
      hero_image_attribution: { photographer: "AI Generated", url: "" },
    };
  } catch {
    return { hero_image_url: null, hero_image_attribution: null };
  }
}

async function fetchHeroImage(
  type: ProfileType,
  displayName: string,
  slug: string
): Promise<ImageResult> {
  // Try Unsplash first
  const unsplashResult = await fetchUnsplashImage(type, displayName);
  if (unsplashResult.hero_image_url) {
    return unsplashResult;
  }

  // Fall back to GPT Image generation
  return generateHeroImage(type, displayName, slug);
}

// ---------------------------------------------------------------------------
// Sensory data from base_profiles
// ---------------------------------------------------------------------------

const SENSORY_FIELDS = [
  "body",
  "acidity",
  "tannin",
  "fruit_ripeness",
  "oak_presence",
  "earthy",
  "mineral",
] as const;

type SensoryData = Record<(typeof SENSORY_FIELDS)[number], number | null>;

async function fetchSensoryData(
  type: ProfileType,
  displayName: string
): Promise<SensoryData | null> {
  if (type === "producer") {
    return null;
  }

  const admin = createSupabaseAdminClient();
  const selectCols = SENSORY_FIELDS.join(", ");

  let query;
  if (type === "grape") {
    query = admin
      .from("base_profiles")
      .select(selectCols)
      .ilike("primary_grapes", `%${displayName}%`)
      .limit(3);
  } else {
    // region
    query = admin
      .from("base_profiles")
      .select(selectCols)
      .or(`region.ilike.%${displayName}%,sub_region.ilike.%${displayName}%`)
      .limit(5);
  }

  const { data, error } = await query;
  if (error || !data || data.length === 0) {
    return null;
  }

  const rows = data as unknown as Record<string, unknown>[];

  // Average sensory values across matching rows
  const result: Record<string, number | null> = {};
  for (const field of SENSORY_FIELDS) {
    const values = rows
      .map((row) => row[field])
      .filter((v): v is number => typeof v === "number");
    result[field] = values.length > 0
      ? Math.round((values.reduce((a, b) => a + b, 0) / values.length) * 10) / 10
      : null;
  }

  return result as SensoryData;
}

// ---------------------------------------------------------------------------
// Personal stats
// ---------------------------------------------------------------------------

type PersonalStats = {
  entry_count: number;
  avg_rating: number | null;
  avg_delta?: number | null;
  label_photos: (string | null)[];
};

async function fetchPersonalStats(
  type: ProfileType,
  displayName: string,
  userId: string,
  supabase: Awaited<ReturnType<typeof requireRequestAuth>>["supabase"]
): Promise<PersonalStats> {
  const stats: PersonalStats = {
    entry_count: 0,
    avg_rating: null,
    label_photos: [],
  };

  if (type === "grape") {
    // Count entries with this grape in entry_primary_grapes
    const { data: grapeEntries } = await supabase
      .from("entry_primary_grapes")
      .select("entry_id")
      .ilike("grape", `%${displayName}%`);

    const entryIds = (grapeEntries ?? []).map(
      (row: { entry_id: string }) => row.entry_id
    );

    if (entryIds.length > 0) {
      const { data: entries } = await supabase
        .from("wine_entries")
        .select("rating")
        .eq("user_id", userId)
        .in("id", entryIds);

      const ratings = (entries ?? [])
        .map((e: { rating: unknown }) => e.rating)
        .filter((r): r is number => typeof r === "number");

      stats.entry_count = entries?.length ?? 0;
      stats.avg_rating =
        ratings.length > 0
          ? Math.round((ratings.reduce((a, b) => a + b, 0) / ratings.length) * 10) / 10
          : null;
    }
  } else if (type === "region") {
    const { data: entries } = await supabase
      .from("wine_entries")
      .select("rating")
      .eq("user_id", userId)
      .or(
        `canonical_region.ilike.%${displayName}%,region.ilike.%${displayName}%`
      );

    const ratings = (entries ?? [])
      .map((e: { rating: unknown }) => e.rating)
      .filter((r): r is number => typeof r === "number");

    stats.entry_count = entries?.length ?? 0;
    stats.avg_rating =
      ratings.length > 0
        ? Math.round((ratings.reduce((a, b) => a + b, 0) / ratings.length) * 10) / 10
        : null;

    // Compute delta from overall average
    if (ratings.length > 0) {
      const { data: allEntries } = await supabase
        .from("wine_entries")
        .select("rating")
        .eq("user_id", userId);

      const allRatings = (allEntries ?? [])
        .map((e: { rating: unknown }) => e.rating)
        .filter((r): r is number => typeof r === "number");

      if (allRatings.length > 0) {
        const overallAvg =
          allRatings.reduce((a, b) => a + b, 0) / allRatings.length;
        stats.avg_delta =
          Math.round((stats.avg_rating! - overallAvg) * 10) / 10;
      }
    }
  } else {
    // producer
    const { data: entries } = await supabase
      .from("wine_entries")
      .select("id, rating")
      .eq("user_id", userId)
      .ilike("producer", `%${displayName}%`);

    const ratings = (entries ?? [])
      .map((e: { rating: unknown }) => e.rating)
      .filter((r): r is number => typeof r === "number");

    stats.entry_count = entries?.length ?? 0;
    stats.avg_rating =
      ratings.length > 0
        ? Math.round((ratings.reduce((a, b) => a + b, 0) / ratings.length) * 10) / 10
        : null;

    // Label photos for producer profiles
    const entryIds = (entries ?? []).map((e: { id: string }) => e.id);
    if (entryIds.length > 0) {
      const { data: photos } = await supabase
        .from("entry_photos")
        .select("path")
        .eq("type", "label")
        .in("entry_id", entryIds)
        .limit(4);

      const signedUrls = await Promise.all(
        (photos ?? []).map((p: { path: string }) =>
          signPhotoUrl(p.path, supabase)
        )
      );

      stats.label_photos = signedUrls;
    }
  }

  return stats;
}

// ---------------------------------------------------------------------------
// Content generation via GPT
// ---------------------------------------------------------------------------

async function generateContent(
  type: ProfileType,
  displayName: string
): Promise<Record<string, unknown> | null> {
  const openai = new OpenAI();
  const prompt = getPromptForType(type, displayName);

  const response = await openai.chat.completions.create({
    model: "gpt-4.1-mini",
    max_tokens: 2000,
    temperature: 0.3,
    messages: [{ role: "user", content: prompt }],
  });

  const responseText = response.choices[0]?.message?.content ?? "";
  return parseGptJson(responseText);
}

// ---------------------------------------------------------------------------
// Route handler
// ---------------------------------------------------------------------------

export async function GET(
  request: Request,
  { params }: { params: Promise<{ type: string; slug: string }> }
) {
  // Auth
  let auth;
  try {
    auth = await requireRequestAuth(request);
  } catch (error) {
    if (error instanceof RequestAuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    throw error;
  }

  const { supabase, user } = auth;
  const { type: rawType, slug: rawSlug } = await params;

  // 1. Validate type
  if (!VALID_PROFILE_TYPES.includes(rawType as ProfileType)) {
    return NextResponse.json(
      { error: `Invalid profile type: ${rawType}. Must be one of: ${VALID_PROFILE_TYPES.join(", ")}` },
      { status: 400 }
    );
  }
  const type = rawType as ProfileType;

  // 2. Normalize slug
  const slug = normalizeSlug(rawSlug);
  const displayName = slugToDisplayName(slug);

  const admin = createSupabaseAdminClient();

  // 3. Check cache
  const { data: cached } = await admin
    .from("wine_profiles")
    .select("*")
    .eq("profile_type", type)
    .eq("slug", slug)
    .maybeSingle();

  const isFresh =
    cached?.last_refreshed &&
    Date.now() - new Date(cached.last_refreshed).getTime() < CACHE_MAX_AGE_MS;

  let profile: {
    type: ProfileType;
    slug: string;
    display_name: string;
    content: Record<string, unknown>;
    hero_image_url: string | null;
    hero_image_attribution: { photographer: string; url: string } | null;
    sensory_data: SensoryData | null;
    related_slugs: string[];
  };

  if (cached && isFresh) {
    // 4. Return cached content
    profile = {
      type,
      slug,
      display_name: cached.display_name ?? displayName,
      content: (cached.content ?? {}) as Record<string, unknown>,
      hero_image_url: cached.hero_image_url ?? null,
      hero_image_attribution: (cached.hero_image_attribution ?? null) as {
        photographer: string;
        url: string;
      } | null,
      sensory_data: (cached.sensory_data ?? null) as SensoryData | null,
      related_slugs: (cached.related_slugs ?? []) as string[],
    };
  } else {
    // 5. Generate fresh content + fetch image + sensory data in parallel
    const [content, imageResult, sensoryData] = await Promise.all([
      generateContent(type, displayName),
      fetchHeroImage(type, displayName, slug),
      fetchSensoryData(type, displayName),
    ]);

    if (!content) {
      return NextResponse.json(
        { error: "Failed to generate profile content" },
        { status: 502 }
      );
    }

    const relatedSlugs = extractRelatedSlugs(type, content);

    // Upsert into wine_profiles
    const upsertPayload = {
      profile_type: type,
      slug,
      display_name: displayName,
      content,
      hero_image_url: imageResult.hero_image_url,
      hero_image_attribution: imageResult.hero_image_attribution,
      sensory_data: sensoryData,
      related_slugs: relatedSlugs,
      last_refreshed: new Date().toISOString(),
    };

    await admin.from("wine_profiles").upsert(upsertPayload, {
      onConflict: "profile_type,slug",
    });

    profile = {
      type,
      slug,
      display_name: displayName,
      content,
      hero_image_url: imageResult.hero_image_url,
      hero_image_attribution: imageResult.hero_image_attribution,
      sensory_data: sensoryData,
      related_slugs: relatedSlugs,
    };
  }

  // 6. Personal stats (always fresh, user-specific)
  const personalStats = await fetchPersonalStats(type, displayName, user.id, supabase);

  // 7. Community QPR data (for regions)
  let community_qpr: { extortion: number; pricey: number; spot_on: number; good_value: number; absolute_steal: number; total: number } | null = null;
  if (type === "region") {
    const adminClient = createSupabaseAdminClient();
    const { data: qprRows } = await adminClient
      .from("wine_entries")
      .select("qpr_level")
      .or(`canonical_region.ilike.%${displayName}%,region.ilike.%${displayName}%`)
      .not("qpr_level", "is", null);

    if (qprRows && qprRows.length >= 3) {
      const counts = { extortion: 0, pricey: 0, spot_on: 0, good_value: 0, absolute_steal: 0 };
      for (const row of qprRows as Array<{ qpr_level: string }>) {
        const level = row.qpr_level;
        if (level === "extortion") counts.extortion++;
        else if (level === "pricey") counts.pricey++;
        else if (level === "mid") counts.spot_on++;
        else if (level === "good_value") counts.good_value++;
        else if (level === "absolute_steal") counts.absolute_steal++;
      }
      community_qpr = { ...counts, total: qprRows.length };
    }
  }

  return NextResponse.json({
    profile,
    personal_stats: personalStats,
    community_qpr,
  });
}

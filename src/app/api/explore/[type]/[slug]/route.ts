import { NextResponse, after } from "next/server";
import OpenAI from "openai";
import { RequestAuthError, requireRequestAuth } from "@/server/auth/requestAuth";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { signPhotoUrl } from "@/server/storage/signedUrls";
import { AUDIENCE_MODES, type AudienceMode, VOICE_PROFILES } from "@shared";
import { applyRateLimit, rateLimitHeaders } from "@/lib/rateLimit";

export const maxDuration = 60;

// Strictest limit of the AI-cost routes — this is the one that can call
// openai.images.generate on a cache miss, the most expensive OpenAI call type.
const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000;
const RATE_LIMIT_MAX_REQUESTS = 10;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

const VALID_PROFILE_TYPES = ["grape", "region", "producer"] as const;
type ProfileType = (typeof VALID_PROFILE_TYPES)[number];

const CACHE_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
// How long a "generating" placeholder row is trusted before a new request
// gives up waiting on the original background job and retries generation.
const PLACEHOLDER_STALE_MS = 45 * 1000;

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
// Producer curation — grounds GPT's producer name-drops (notable_producers,
// similar_producers, notable_winemakers, recommendation_picks) in the
// producer_modifiers reference table instead of letting the model invent
// producers freely, which was mixing mass-market brands (Meiomi) with
// unattainable trophy bottlings (DRC) with no consistency. producer_modifiers
// has a price_tier_numeric (roughly 1=Entry/mass-market through 5=Ultra-
// luxury) — the roster below excludes tier 1 entirely (mass market) and
// biases the mix toward accessible-but-high-quality (tier 2-3) with a
// minority of aspirational (tier 4-5) picks, per feedback from the team.
// ---------------------------------------------------------------------------

const MASS_MARKET_MAX_TIER = 1;
const ASPIRATIONAL_MIN_TIER = 4;
const ROSTER_ACCESSIBLE_COUNT = 6;
const ROSTER_ASPIRATIONAL_COUNT = 3;

type ProducerCandidateRow = {
  producer_name: string | null;
  region: string | null;
  appellation: string | null;
  grapes: string | null;
  price_tier_numeric: number | null;
  price_tier_label: string | null;
  house_style_descriptors: string | null;
  confidence: number | null;
};

async function fetchProducerRoster(
  admin: ReturnType<typeof createSupabaseAdminClient>,
  type: ProfileType,
  displayName: string
): Promise<string> {
  if (type === "producer") {
    // For a producer page itself, "similar producers" should be peers in the
    // same region rather than the producer's own row — look that up first.
    const { data: ownRows } = await admin
      .from("producer_modifiers")
      .select("producer_name, region, appellation, grapes, price_tier_numeric, price_tier_label, house_style_descriptors, confidence")
      .ilike("producer_name", `%${displayName}%`)
      .limit(1);
    const own = (ownRows as ProducerCandidateRow[] | null)?.[0];
    if (!own?.region) {
      return "";
    }
    const { data: peerRows } = await admin
      .from("producer_modifiers")
      .select("producer_name, region, appellation, grapes, price_tier_numeric, price_tier_label, house_style_descriptors, confidence")
      .ilike("region", `%${own.region}%`)
      .not("producer_name", "ilike", `%${displayName}%`)
      .gt("price_tier_numeric", MASS_MARKET_MAX_TIER)
      .order("confidence", { ascending: false })
      .limit(30);
    return formatProducerRoster((peerRows as ProducerCandidateRow[] | null) ?? []);
  }

  // Grape or region page — candidates are producers whose grapes/region
  // column mentions this entity.
  const column = type === "grape" ? "grapes" : "region";
  const { data } = await admin
    .from("producer_modifiers")
    .select("producer_name, region, appellation, grapes, price_tier_numeric, price_tier_label, house_style_descriptors, confidence")
    .ilike(column, `%${displayName}%`)
    .gt("price_tier_numeric", MASS_MARKET_MAX_TIER)
    .order("confidence", { ascending: false })
    .limit(40);

  return formatProducerRoster((data as ProducerCandidateRow[] | null) ?? []);
}

function formatProducerRoster(rows: ProducerCandidateRow[]): string {
  if (rows.length === 0) {
    return "";
  }

  const accessible = rows.filter((r) => (r.price_tier_numeric ?? 0) < ASPIRATIONAL_MIN_TIER);
  const aspirational = rows.filter((r) => (r.price_tier_numeric ?? 0) >= ASPIRATIONAL_MIN_TIER);

  const describe = (r: ProducerCandidateRow) =>
    `${r.producer_name} (${r.price_tier_label ?? "unrated"}${r.appellation ? `, ${r.appellation}` : r.region ? `, ${r.region}` : ""})`;

  const accessibleList = accessible.slice(0, ROSTER_ACCESSIBLE_COUNT).map(describe);
  const aspirationalList = aspirational.slice(0, ROSTER_ASPIRATIONAL_COUNT).map(describe);

  if (accessibleList.length === 0 && aspirationalList.length === 0) {
    return "";
  }

  return `

CURATED PRODUCER ROSTER — use this when naming notable/similar/reference producers (notable_producers, similar_producers, notable_winemakers, recommendation_picks, most_loved_producer, best_qpr_producer). Favor the "Accessible" set for most picks; include at most one "Aspirational" pick if the field calls for a stretch/trophy option. Never invent mass-market/supermarket-tier producers, and don't reach for ultra-rare trophy bottlings outside this list:
${accessibleList.length > 0 ? `Accessible, high-quality: ${accessibleList.join("; ")}` : ""}
${aspirationalList.length > 0 ? `Aspirational: ${aspirationalList.join("; ")}` : ""}
If a field needs a producer not covered above, use your own knowledge but keep the same bias: real, high-quality, reasonably attainable producers over trophy bottlings, and never mass-market supermarket brands.`;
}

// ---------------------------------------------------------------------------
// GPT prompt builders
// ---------------------------------------------------------------------------

function voiceBlock(mode: AudienceMode): string {
  const profile = VOICE_PROFILES[mode];
  const directives = profile.systemPromptDirectives.map((d) => `- ${d}`).join("\n");
  return `Audience register: ${profile.label} mode. Write so the content feels native to this register:
${directives}`;
}

function buildGrapePrompt(displayName: string, mode: AudienceMode, producerRosterBlock: string): string {
  return `You are a wine storyteller writing for the Cluster wine app. Write about the ${displayName} grape variety.

${voiceBlock(mode)}${producerRosterBlock}

Write a JSON object with these fields:
- tagline: one evocative sentence, max 15 words, taste-led (e.g. "The grape that tastes like warm earth and ripe fruit — then surprises you with how long it lingers.")
- story: exactly 3 sentences in one paragraph. What this grape does to a glass, where it thrives, why someone building their palate should care. Sensory and personal, never encyclopedic.
- where_it_grows: array of objects with { name: string, size: "large"|"medium"|"small" } — 6-8 regions where this grape is most important. Top 2 should be "large", next 2 "medium", rest "small". These should be tappable wine regions.
- styles_expressions: array of exactly 3 objects with { style: string, desc: string, example: string } — different faces this grape can wear. Each style has a name, a 1-2 sentence sensory description, and an example producer/wine.
- notable_producers: array of 3-5 objects with { name: string, note: string } — producers known for exceptional work with this grape. The note should be one punchy sentence about what makes them special WITH this grape specifically.
- flavor_profile: object with { Tannin: number, Acidity: number, Body: number, Oak: number, Fruit: number } — each 0-100 scale representing this grape's TYPICAL profile
- food_pairings: array of 4-6 specific food pairings (grape-specific, not generic)
- fun_facts: array of exactly 3 surprising "did you know" strings. The first one should work as a standalone factoid beneath the story.
- related_grapes: array of 3-4 similar/related grape names (strings)
- most_loved_producer: object with { name: string, avg_rating: number } — most celebrated producer for this grape
- best_qpr_producer: object with { name: string, avg_rating: number } — best QPR producer for this grape
- recommendation_picks: array of exactly 3 objects with { name: string, type: "grape"|"region"|"producer", why: string } — "if you like this grape, you may also enjoy" suggestions. One obvious, one step-removed (different grape with similar sensory profile), one genuine surprise. Avoid all three being the same type. The "why" should be one evocative sentence.
- personal_insight: string — a punchy insight about this grape's character that could feel personal (e.g. "You rate fuller, more tannic Grenache higher than average. Old-vine territory.")
- body: typical body level ("Light", "Medium", "Full")
- acidity: typical acidity ("Low", "Medium", "High")
- tannin: typical tannin ("Low", "Medium", "High") — null for whites

Return ONLY valid JSON. No markdown, no explanation.`;
}

function buildRegionPrompt(displayName: string, mode: AudienceMode, producerRosterBlock: string): string {
  return `You are a wine storyteller writing for the Cluster wine app. Write about the ${displayName} wine region.

${voiceBlock(mode)}${producerRosterBlock}

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

function buildProducerPrompt(displayName: string, mode: AudienceMode, producerRosterBlock: string): string {
  return `You are a wine storyteller writing for the Cluster wine app. Write about ${displayName} (wine producer).

${voiceBlock(mode)}${producerRosterBlock}

You're writing a character sketch, not a biography.

Write a JSON object with these fields:
- tagline: one evocative ethos sentence, max 15 words — what makes them worth knowing, not when they were founded (e.g. "The man who proved Grenache doesn't need Syrah.")
- region: primary region name
- country: country name
- story: exactly 3-4 sentences. Who they are, what they believe, why they matter to wine. Character sketch, not biography.
- philosophy_tags: array of 2-4 objects with { tag: string, note: string } — winemaking philosophy/approach tags. Each tag is a short label (e.g. "100% Grenache", "Sand soils", "No technology") and note is one sentence explaining what it means for the wine.
- key_wines: array of 2-4 objects with { name: string, desc: string, rating: string } — flagship and notable wines. Name is the wine, desc is one evocative sentence, rating is like "96 avg" or "94 avg".
- region_grapes: array of strings — region(s) and grape(s) as chip labels for cross-linking (e.g. ["Châteauneuf-du-Pape", "Grenache", "Grenache Blanc", "Clairette"])
- similar_producers: array of exactly 3 objects with { name: string, why: string } — similar producers. One from the same region, one from a different region with similar philosophy, one genuine surprise. The "why" should be one punchy sentence.
- fun_facts: array of exactly 3 surprising facts about this producer that would make someone stop mid-sip.
- food_pairings: array of 4-6 food pairings that specifically match this producer's style
- founded: year founded as string, or "Unknown"
- classification: quality tier if applicable (string or null)
- related_producers: array of 3-4 similar producer names (strings, for slug generation)
- grapes: array of primary grape names used

Return ONLY valid JSON. No markdown, no explanation.`;
}

function getPromptForType(
  type: ProfileType,
  displayName: string,
  mode: AudienceMode,
  producerRosterBlock: string
): string {
  switch (type) {
    case "grape":
      return buildGrapePrompt(displayName, mode, producerRosterBlock);
    case "region":
      return buildRegionPrompt(displayName, mode, producerRosterBlock);
    case "producer":
      return buildProducerPrompt(displayName, mode, producerRosterBlock);
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
  displayName: string,
  mode: AudienceMode,
  admin: ReturnType<typeof createSupabaseAdminClient>
): Promise<Record<string, unknown> | null> {
  const openai = new OpenAI();
  const producerRosterBlock = await fetchProducerRoster(admin, type, displayName).catch(() => "");
  const prompt = getPromptForType(type, displayName, mode, producerRosterBlock);

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
// In-process fallback cache for background generation
// ---------------------------------------------------------------------------
//
// The `wine_profiles` DB cache is keyed by (profile_type, slug, audience_mode)
// — but if that column's migration hasn't been applied in a given
// environment, every read/write against `audience_mode` fails silently
// (Supabase JS returns an error object rather than throwing, and callers
// here only destructure `data`), which would make every request look like a
// cache miss forever and leave the polling client waiting on a background
// job whose result can never be persisted. This lightweight in-memory map is
// a safety net so the deferred-generation flow still completes correctly
// within a single server process even when the DB cache is unavailable, in
// addition to being a simple perf win (avoids re-hitting OpenAI for
// concurrent/rapid polls of the same profile within one process).
type GeneratedProfileResult = {
  display_name: string;
  content: Record<string, unknown>;
  hero_image_url: string | null;
  hero_image_attribution: { photographer: string; url: string } | null;
  sensory_data: SensoryData | null;
  related_slugs: string[];
  completedAt: number;
};

const IN_MEMORY_RESULT_TTL_MS = 10 * 60 * 1000; // 10 minutes
const inMemoryProfileResults = new Map<string, GeneratedProfileResult>();
const inFlightGenerations = new Map<string, Promise<void>>();

function profileCacheKey(type: ProfileType, slug: string, audienceMode: AudienceMode) {
  return `${type}:${slug}:${audienceMode}`;
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

  // 2b. Resolve the viewer's audience mode (falls back to 'explorer' if the
  //     column is missing or unset). Cache key includes mode so Explorer,
  //     Enthusiast, and Connoisseur each get content written in their register.
  let audienceMode: AudienceMode = "explorer";
  try {
    const { data: modeRow } = await supabase
      .from("profiles")
      .select("audience_mode")
      .eq("id", user.id)
      .maybeSingle();
    if (
      typeof modeRow?.audience_mode === "string" &&
      (AUDIENCE_MODES as readonly string[]).includes(modeRow.audience_mode)
    ) {
      audienceMode = modeRow.audience_mode as AudienceMode;
    }
  } catch {
    // Fall back to explorer.
  }

  const admin = createSupabaseAdminClient();
  const memoryKey = profileCacheKey(type, slug, audienceMode);

  // 3. Check cache (mode-aware). Prefer the in-memory result if we have a
  // fresh one — it's cheaper, and it's the only cache that's guaranteed to
  // work if the `wine_profiles.audience_mode` DB migration hasn't landed in
  // this environment (see the comment on inMemoryProfileResults above).
  const memoryHit = inMemoryProfileResults.get(memoryKey);
  const memoryHitFresh =
    memoryHit && Date.now() - memoryHit.completedAt < IN_MEMORY_RESULT_TTL_MS;

  const { data: cached } = memoryHitFresh
    ? { data: null }
    : await admin
        .from("wine_profiles")
        .select("*")
        .eq("profile_type", type)
        .eq("slug", slug)
        .eq("audience_mode", audienceMode)
        .maybeSingle();

  const isFresh =
    cached?.last_refreshed &&
    Date.now() - new Date(cached.last_refreshed).getTime() < CACHE_MAX_AGE_MS;

  // A cache row with empty `content` is a placeholder written while
  // narrative generation is running in the background (see below) — it's
  // not real cached content yet.
  const cachedContent = (cached?.content ?? null) as Record<string, unknown> | null;
  const isPlaceholder = Boolean(cached) && (!cachedContent || Object.keys(cachedContent).length === 0);
  // Self-heal: if the background job that wrote the placeholder died or
  // never ran, don't wait forever — retry generation once the placeholder
  // is stale enough that any legitimate in-flight job should have finished.
  const placeholderIsStale =
    isPlaceholder &&
    (!cached?.last_refreshed ||
      Date.now() - new Date(cached.last_refreshed).getTime() > PLACEHOLDER_STALE_MS);

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
  // True while the narrative content (and possibly the hero image) is still
  // being generated in the background — the client should show a loading
  // state for those specific sections and poll this endpoint again.
  let generating = false;

  if (memoryHitFresh && memoryHit) {
    // 4a. Return the in-memory fallback result (see comment above).
    profile = {
      type,
      slug,
      display_name: memoryHit.display_name,
      content: memoryHit.content,
      hero_image_url: memoryHit.hero_image_url,
      hero_image_attribution: memoryHit.hero_image_attribution,
      sensory_data: memoryHit.sensory_data,
      related_slugs: memoryHit.related_slugs,
    };
  } else if (cached && isFresh && !isPlaceholder) {
    // 4b. Return cached content
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
  } else if (cached && isFresh && isPlaceholder && !placeholderIsStale) {
    // A generation job is already in flight for this profile (kicked off by
    // an earlier request) — report "still generating" without starting a
    // second, redundant OpenAI call. No rate-limit check here: this request
    // isn't triggering any new OpenAI usage.
    profile = {
      type,
      slug,
      display_name: cached.display_name ?? displayName,
      content: {},
      hero_image_url: cached.hero_image_url ?? null,
      hero_image_attribution: (cached.hero_image_attribution ?? null) as {
        photographer: string;
        url: string;
      } | null,
      sensory_data: (cached.sensory_data ?? null) as SensoryData | null,
      related_slugs: [],
    };
    generating = true;
  } else if (inFlightGenerations.has(memoryKey)) {
    // 5. Another request already kicked off generation for this exact
    //    profile within this process (this is the DB-cache-unavailable
    //    equivalent of the isPlaceholder branch above — reachable because
    //    every DB read/write against `audience_mode` fails in this
    //    environment, so `cached` is always null and every poll would
    //    otherwise fall through to the cache-miss branch below). Report
    //    "still generating" without touching the rate limiter or refetching
    //    anything — this request isn't triggering any new OpenAI usage.
    profile = {
      type,
      slug,
      display_name: displayName,
      content: {},
      hero_image_url: null,
      hero_image_attribution: null,
      sensory_data: null,
      related_slugs: [],
    };
    generating = true;
  } else {
    // 6. Cache miss (or a stale/abandoned placeholder) — we're about to
    //    start real OpenAI generation, so this is the only branch that
    //    consumes rate-limit budget. Polls that land in the branches above
    //    (real cache hit, in-memory hit, or "already generating") never
    //    reach here and are free, which matters because the client polls
    //    this same endpoint every few seconds while content is generating.
    const rateLimit = await applyRateLimit({
      request,
      routeKey: "explore-profile",
      windowMs: RATE_LIMIT_WINDOW_MS,
      maxRequests: RATE_LIMIT_MAX_REQUESTS,
      userId: user.id,
    });
    if (!rateLimit.allowed) {
      return NextResponse.json(
        { error: "Too many explore requests. Please wait a bit and try again." },
        { status: 429, headers: rateLimitHeaders(rateLimit) }
      );
    }

    // The narrative content generation (`generateContent`, a single OpenAI
    // chat completion asking for ~2000 tokens of structured JSON) routinely
    // takes 15-25s on its own — independent of, and often larger than, the
    // hero image generation. Blocking the response on it was the root cause
    // of the 20-23s uncached page loads (on top of the hero image problem
    // handled below). The pragmatic fix: return immediately with
    // `generating: true` and no narrative content, doing the slow OpenAI
    // work in the background via `after()` and persisting it to the cache
    // once ready. The client polls this same endpoint (with a short
    // interval) until `generating` is false.
    //
    // Sensory data and the Unsplash lookup are cheap (plain DB/HTTP calls,
    // not LLM calls) so they're still awaited inline — no reason to defer
    // fast, non-AI work.
    const [sensoryData, unsplashImage] = await Promise.all([
      fetchSensoryData(type, displayName),
      fetchUnsplashImage(type, displayName),
    ]);

    profile = {
      type,
      slug,
      display_name: displayName,
      content: {},
      hero_image_url: unsplashImage.hero_image_url,
      hero_image_attribution: unsplashImage.hero_image_attribution,
      sensory_data: sensoryData,
      related_slugs: [],
    };
    generating = true;

    // Write a placeholder row immediately (fast, no LLM calls) so concurrent
    // or rapid-poll requests for the same profile see "generating" instead
    // of each kicking off their own redundant OpenAI generation. Best-effort
    // — if this fails (e.g. the audience_mode migration is missing in this
    // environment), the inFlightGenerations dedupe above/below still
    // prevents redundant OpenAI calls and redundant rate-limit consumption
    // within this process.
    void admin.from("wine_profiles").upsert(
      {
        profile_type: type,
        slug,
        audience_mode: audienceMode,
        display_name: displayName,
        content: {},
        hero_image_url: unsplashImage.hero_image_url,
        hero_image_attribution: unsplashImage.hero_image_attribution,
        sensory_data: sensoryData,
        related_slugs: [],
        last_refreshed: new Date().toISOString(),
      },
      { onConflict: "profile_type,slug,audience_mode" }
    );

    {
      const job = (async () => {
        const backfillAdmin = createSupabaseAdminClient();
        try {
          // Step 1: narrative content. Persist and unblock the client (flips
          // `generating` to false on the next poll) as soon as this
          // resolves — don't make the client wait on hero image generation
          // too, since that's a second, independently slow OpenAI call (see
          // step 2).
          const content = await generateContent(type, displayName, audienceMode, backfillAdmin);
          if (!content) {
            // Best-effort background job — leave the placeholder in place;
            // once it goes stale, the next request retries generation.
            return;
          }

          const relatedSlugs = extractRelatedSlugs(type, content);

          // Populate the in-memory fallback immediately so polling requests
          // pick it up even if the DB write below fails.
          inMemoryProfileResults.set(memoryKey, {
            display_name: displayName,
            content,
            hero_image_url: unsplashImage.hero_image_url,
            hero_image_attribution: unsplashImage.hero_image_attribution,
            sensory_data: sensoryData,
            related_slugs: relatedSlugs,
            completedAt: Date.now(),
          });

          await backfillAdmin.from("wine_profiles").upsert(
            {
              profile_type: type,
              slug,
              audience_mode: audienceMode,
              display_name: displayName,
              content,
              hero_image_url: unsplashImage.hero_image_url,
              hero_image_attribution: unsplashImage.hero_image_attribution,
              sensory_data: sensoryData,
              related_slugs: relatedSlugs,
              last_refreshed: new Date().toISOString(),
            },
            { onConflict: "profile_type,slug,audience_mode" }
          );

          // Step 2: hero image fallback, only if Unsplash had nothing. This
          // is a separate, independent backfill — it doesn't block
          // "generating" from clearing, since the client already has real
          // narrative content to show and only needs to pick up the image
          // whenever it lands.
          if (!unsplashImage.hero_image_url) {
            const generatedImage = await generateHeroImage(type, displayName, slug);
            if (generatedImage.hero_image_url) {
              const memoryEntry = inMemoryProfileResults.get(memoryKey);
              if (memoryEntry) {
                memoryEntry.hero_image_url = generatedImage.hero_image_url;
                memoryEntry.hero_image_attribution = generatedImage.hero_image_attribution;
              }
              await backfillAdmin
                .from("wine_profiles")
                .update({
                  hero_image_url: generatedImage.hero_image_url,
                  hero_image_attribution: generatedImage.hero_image_attribution,
                })
                .eq("profile_type", type)
                .eq("slug", slug)
                .eq("audience_mode", audienceMode);
            }
          }
        } catch {
          // Best-effort background job — swallow failures.
        } finally {
          inFlightGenerations.delete(memoryKey);
        }
      })();

      inFlightGenerations.set(memoryKey, job);
      after(async () => {
        await job;
      });
    }
  }

  // 6. Personal stats (always fresh, user-specific)
  const personalStats = await fetchPersonalStats(type, displayName, user.id, supabase);

  // 7. Community QPR data (for regions and grapes)
  let community_qpr: { extortion: number; pricey: number; spot_on: number; good_value: number; absolute_steal: number; total: number } | null = null;
  if (type === "region" || type === "grape") {
    const adminClient = createSupabaseAdminClient();
    let qprRows: Array<{ qpr_level: string }> | null = null;

    if (type === "region") {
      const { data } = await adminClient
        .from("wine_entries")
        .select("qpr_level")
        .or(`canonical_region.ilike.%${displayName}%,region.ilike.%${displayName}%`)
        .not("qpr_level", "is", null);
      qprRows = data as Array<{ qpr_level: string }> | null;
    } else {
      // For grapes, join through entry_primary_grapes
      const { data: grapeEntries } = await adminClient
        .from("entry_primary_grapes")
        .select("entry_id")
        .ilike("grape", `%${displayName}%`);
      const entryIds = (grapeEntries ?? []).map((r: { entry_id: string }) => r.entry_id);
      if (entryIds.length > 0) {
        const { data } = await adminClient
          .from("wine_entries")
          .select("qpr_level")
          .in("id", entryIds)
          .not("qpr_level", "is", null);
        qprRows = data as Array<{ qpr_level: string }> | null;
      }
    }

    if (qprRows && qprRows.length >= 3) {
      const counts = { extortion: 0, pricey: 0, spot_on: 0, good_value: 0, absolute_steal: 0 };
      for (const row of qprRows) {
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
    generating,
  });
}

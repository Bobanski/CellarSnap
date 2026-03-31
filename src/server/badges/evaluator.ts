import type { SupabaseClient } from "@supabase/supabase-js";

import {
  countEntriesForUser,
  countRegionMatches,
  countCountryMatches,
  countGrapeMatches,
  countWineTypeMatches,
  computeHighRatingRatio,
} from "./queries";

// ---------------------------------------------------------------------------
// Types — local stubs until shared import is wired up
// ---------------------------------------------------------------------------

// TODO: Replace with import from @cellarsnap/shared
type BadgeTriggerSpec = { type: string; [key: string]: unknown };
type BadgeDefinition = {
  id: string;
  name: string;
  category: string;
  tier: string;
  color: string;
  accent: string;
  shape: string;
  trigger: BadgeTriggerSpec;
  toastText: string;
  description: string;
};

/** Badge info returned to the caller for toast display. */
export type EarnedBadge = {
  id: string;
  name: string;
  tier: string;
  color: string;
  accent: string;
  shape: string;
  toastText: string;
};

/** The entry data passed in when a wine entry is created/updated. */
type EntryData = {
  wine_type?: string | null;
  country?: string | null;
  region?: string | null;
  appellation?: string | null;
  grapes?: string[] | null;
  rating?: number | null;
};

// ---------------------------------------------------------------------------
// Badge definitions — dynamic require with fallback
// ---------------------------------------------------------------------------

function loadBadgeDefinitions(): readonly BadgeDefinition[] {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const shared = require("@shared");
    return (shared.BADGE_DEFINITIONS ?? []) as readonly BadgeDefinition[];
  } catch {
    return [];
  }
}

// ---------------------------------------------------------------------------
// Trigger types we skip (social / manual — not evaluable from entry data)
// ---------------------------------------------------------------------------

const SKIPPED_TRIGGER_TYPES = new Set([
  "founding_member",
  "social_compatibility",
  "social_tag_count",
  "sommelier_group_count",
  "manual",
  "compatibility",
  "social_action",
  "somm_usage",
]);

// ---------------------------------------------------------------------------
// Pre-filter: cheap string matching to decide whether a badge is *potentially*
// relevant for the entry just logged, before hitting the database.
// ---------------------------------------------------------------------------

/**
 * Extract ilike-style patterns from the trigger's filter string.
 * Filter strings look like "grape:pinot_noir,regions:3+,rating:positive"
 * — we extract the values that can be matched against entry fields.
 */
function extractFilterSegments(filter: string): Map<string, string> {
  const segments = new Map<string, string>();
  for (const segment of filter.split(",")) {
    const colonIdx = segment.indexOf(":");
    if (colonIdx === -1) continue;
    const key = segment.slice(0, colonIdx).trim();
    const value = segment.slice(colonIdx + 1).trim();
    segments.set(key, value);
  }
  return segments;
}

/**
 * Quick relevance check — does the entry data plausibly match the badge
 * trigger? This avoids unnecessary database queries for completely
 * unrelated badges (e.g. a Nebbiolo badge when the user just logged Riesling).
 *
 * Returns `true` (candidate) when we can't rule it out cheaply.
 */
function isRelevantToEntry(
  badge: BadgeDefinition,
  entry: EntryData,
): boolean {
  const trigger = badge.trigger;
  const triggerType = trigger.type;

  // count_logs badges are always relevant — they just need N total entries.
  if (triggerType === "count_logs") return true;

  // qpr badges are always relevant (price data not in entry pre-filter).
  if (triggerType === "qpr") return true;

  // percentage badges are always relevant — they look at ratios across all entries.
  if (triggerType === "percentage") return true;

  const filterStr = (trigger as { filter?: string }).filter;
  if (!filterStr) return true;

  const segments = extractFilterSegments(filterStr);

  // Region filter — check if entry region/appellation loosely matches
  const regionFilter = segments.get("region");
  if (regionFilter) {
    const normalized = regionFilter.toLowerCase().replace(/_/g, " ");
    const fields = [entry.region, entry.appellation, entry.country].filter(Boolean);
    if (fields.some((f) => f!.toLowerCase().includes(normalized))) return true;
    // Region doesn't match — but other filters might, so don't return false yet
  }

  // Country filter
  const countryFilter = segments.get("country");
  if (countryFilter) {
    const normalized = countryFilter.toLowerCase().replace(/_/g, " ");
    if (entry.country?.toLowerCase().includes(normalized)) return true;
  }

  // Grape filter — check if any entry grape loosely matches
  const grapeFilter = segments.get("grape");
  if (grapeFilter && entry.grapes && entry.grapes.length > 0) {
    const normalized = grapeFilter.toLowerCase().replace(/_/g, " ");
    const grapeMatch = entry.grapes.some((g) =>
      g.toLowerCase().includes(normalized),
    );
    if (grapeMatch) return true;
  } else if (grapeFilter && (!entry.grapes || entry.grapes.length === 0)) {
    // No grape data on entry — can't match a grape badge
    return false;
  }

  // Style / terroir / structure / body / sweetness filters — we don't have
  // these fields on the entry object yet, so we can't rule them out.
  // Return true (candidate).
  const passThrough = [
    "style",
    "terroir",
    "structure",
    "body",
    "sweetness",
    "terroir_types",
    "origin",
  ];
  for (const key of passThrough) {
    if (segments.has(key)) return true;
  }

  // If we have a grape filter but didn't match above, not relevant
  if (grapeFilter) return false;

  // Default: can't rule it out
  return true;
}

// ---------------------------------------------------------------------------
// Trigger evaluation — hits the database via query functions
// ---------------------------------------------------------------------------

async function evaluateTrigger(
  supabase: SupabaseClient,
  userId: string,
  badge: BadgeDefinition,
): Promise<boolean> {
  const trigger = badge.trigger;
  const triggerType = trigger.type;
  const count = (trigger as { count?: number }).count ?? 0;
  const filterStr = (trigger as { filter?: string }).filter;
  const threshold = (trigger as { threshold?: number }).threshold ?? 0;

  switch (triggerType) {
    case "count_logs": {
      const total = await countEntriesForUser(supabase, userId);
      return total >= count;
    }

    case "count_filtered": {
      if (!filterStr) return false;
      const segments = extractFilterSegments(filterStr);

      // Grape-based filter
      const grapeFilter = segments.get("grape");
      if (grapeFilter) {
        const normalized = grapeFilter.replace(/_/g, " ");
        const matched = await countGrapeMatches(supabase, userId, [
          `%${normalized}%`,
        ]);
        return matched >= count;
      }

      // Region-based filter
      const regionFilter = segments.get("region");
      if (regionFilter) {
        const normalized = regionFilter.replace(/_/g, " ");
        const matched = await countRegionMatches(supabase, userId, [
          `%${normalized}%`,
        ]);
        return matched >= count;
      }

      // Country-based filter
      const countryFilter = segments.get("country");
      if (countryFilter) {
        const normalized = countryFilter.replace(/_/g, " ");
        const matched = await countCountryMatches(supabase, userId, [
          `%${normalized}%`,
        ]);
        return matched >= count;
      }

      // Wine-type filter
      const wineTypeFilter = segments.get("wine_type");
      if (wineTypeFilter) {
        const matched = await countWineTypeMatches(supabase, userId, [
          wineTypeFilter.replace(/_/g, " "),
        ]);
        return matched >= count;
      }

      // Style/structure/body/terroir badges need sensory data — skip for now
      return false;
    }

    case "percentage": {
      if (!filterStr) return false;
      const ratio = await computeHighRatingRatio(supabase, userId);
      return ratio * 100 >= threshold;
    }

    case "qpr": {
      // QPR badges need price data — not yet implemented
      return false;
    }

    default:
      return false;
  }
}

// ---------------------------------------------------------------------------
// Main evaluation function
// ---------------------------------------------------------------------------

export async function evaluateAndAwardBadges({
  supabase,
  userId,
  entryData,
}: {
  supabase: SupabaseClient;
  userId: string;
  entryData: EntryData;
}): Promise<{ newlyEarned: EarnedBadge[] }> {
  const definitions = loadBadgeDefinitions();

  if (definitions.length === 0) {
    return { newlyEarned: [] };
  }

  // 1. Fetch already-earned badge IDs
  const { data: earnedRows } = await supabase
    .from("user_badges")
    .select("badge_id")
    .eq("user_id", userId);

  const earnedIds = new Set(
    (earnedRows as Array<{ badge_id: string }> | null)?.map(
      (r) => r.badge_id,
    ) ?? [],
  );

  // 2. Pre-filter: skip earned, skip irrelevant triggers, skip social/manual
  const candidates = definitions.filter((badge) => {
    if (earnedIds.has(badge.id)) return false;
    if (SKIPPED_TRIGGER_TYPES.has(badge.trigger.type)) return false;
    return isRelevantToEntry(badge, entryData);
  });

  if (candidates.length === 0) {
    return { newlyEarned: [] };
  }

  // 3. Evaluate candidates via query functions
  const results = await Promise.all(
    candidates.map(async (badge) => {
      const earned = await evaluateTrigger(supabase, userId, badge);
      return earned ? badge : null;
    }),
  );

  const newlyEarnedBadges = results.filter(
    (b): b is BadgeDefinition => b !== null,
  );

  if (newlyEarnedBadges.length === 0) {
    return { newlyEarned: [] };
  }

  // 4. Batch insert newly earned badges (ON CONFLICT DO NOTHING via unique constraint)
  const insertRows = newlyEarnedBadges.map((badge) => ({
    user_id: userId,
    badge_id: badge.id,
    earned_at: new Date().toISOString(),
  }));

  // Supabase upsert with ignoreDuplicates acts as ON CONFLICT DO NOTHING
  await supabase
    .from("user_badges")
    .upsert(insertRows, { onConflict: "user_id,badge_id", ignoreDuplicates: true });

  // 5. Return badge info for toast
  const newlyEarned: EarnedBadge[] = newlyEarnedBadges.map((badge) => ({
    id: badge.id,
    name: badge.name,
    tier: badge.tier,
    color: badge.color,
    accent: badge.accent,
    shape: badge.shape,
    toastText: badge.toastText,
  }));

  return { newlyEarned };
}

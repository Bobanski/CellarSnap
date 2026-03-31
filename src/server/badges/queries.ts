import type { SupabaseClient } from "@supabase/supabase-js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Build a Supabase `.or()` clause from an array of patterns applied via ilike
 * to one or more columns.
 *
 * Example: buildIlikeOr(["region", "appellation"], ["%Burgundy%", "%Rhône%"])
 *   => "region.ilike.%Burgundy%,region.ilike.%Rhône%,appellation.ilike.%Burgundy%,appellation.ilike.%Rhône%"
 */
function buildIlikeOr(columns: string[], patterns: string[]): string {
  return columns
    .flatMap((col) => patterns.map((p) => `${col}.ilike.${p}`))
    .join(",");
}

// ---------------------------------------------------------------------------
// Query functions — each returns a number
// ---------------------------------------------------------------------------

/**
 * Total wine_entries for a user.
 */
export async function countEntriesForUser(
  supabase: SupabaseClient,
  userId: string,
): Promise<number> {
  const { count } = await supabase
    .from("wine_entries")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId);

  return count ?? 0;
}

/**
 * Entries where `region` or `appellation` ilike any of the given patterns.
 */
export async function countRegionMatches(
  supabase: SupabaseClient,
  userId: string,
  patterns: string[],
): Promise<number> {
  if (patterns.length === 0) return 0;

  const orClause = buildIlikeOr(["region", "appellation"], patterns);

  const { count } = await supabase
    .from("wine_entries")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .or(orClause);

  return count ?? 0;
}

/**
 * Entries where `country` ilike any of the given patterns.
 */
export async function countCountryMatches(
  supabase: SupabaseClient,
  userId: string,
  patterns: string[],
): Promise<number> {
  if (patterns.length === 0) return 0;

  const orClause = buildIlikeOr(["country"], patterns);

  const { count } = await supabase
    .from("wine_entries")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .or(orClause);

  return count ?? 0;
}

/**
 * Count entries that have at least one primary grape whose canonical name
 * ilike-matches any of the supplied grape patterns.
 *
 * Queries `entry_primary_grapes` joined back to `wine_entries` for the
 * user_id filter, and to `grape_varieties` for the name match.
 */
export async function countGrapeMatches(
  supabase: SupabaseClient,
  userId: string,
  grapes: string[],
): Promise<number> {
  if (grapes.length === 0) return 0;

  const grapeOr = buildIlikeOr(["grape_varieties.name"], grapes);

  const { count } = await supabase
    .from("entry_primary_grapes")
    .select("id, wine_entries!inner(id), grape_varieties!inner(id)", {
      count: "exact",
      head: true,
    })
    .eq("wine_entries.user_id", userId)
    .or(grapeOr, { referencedTable: "grape_varieties" });

  return count ?? 0;
}

/**
 * Entries where `wine_type` is one of the supplied values.
 */
export async function countWineTypeMatches(
  supabase: SupabaseClient,
  userId: string,
  wineTypes: string[],
): Promise<number> {
  if (wineTypes.length === 0) return 0;

  const { count } = await supabase
    .from("wine_entries")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .in("wine_type", wineTypes);

  return count ?? 0;
}

/**
 * Compute the ratio of entries with `rating >= 4` to total entries.
 *
 * An optional `filter` object can narrow the denominator/numerator to a
 * subset — for example only entries matching a specific wine_type.
 */
export async function computeHighRatingRatio(
  supabase: SupabaseClient,
  userId: string,
  filter?: { column: string; value: string },
): Promise<number> {
  let totalQuery = supabase
    .from("wine_entries")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .not("rating", "is", null);

  let highQuery = supabase
    .from("wine_entries")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .gte("rating", 4);

  if (filter) {
    totalQuery = totalQuery.ilike(filter.column, filter.value);
    highQuery = highQuery.ilike(filter.column, filter.value);
  }

  const [totalResult, highResult] = await Promise.all([totalQuery, highQuery]);

  const total = totalResult.count ?? 0;
  const high = highResult.count ?? 0;

  if (total === 0) return 0;
  return high / total;
}

/**
 * Count distinct regions (from `region` column) matching the supplied
 * ilike patterns.
 */
export async function countDistinctRegions(
  supabase: SupabaseClient,
  userId: string,
  patterns: string[],
): Promise<number> {
  if (patterns.length === 0) return 0;

  const orClause = buildIlikeOr(["region"], patterns);

  // We need distinct region values — Supabase doesn't support
  // count(distinct ...) via the JS client, so we fetch the region column
  // and deduplicate in JS. We limit to 1000 rows which is more than enough
  // for per-user region counts.
  const { data } = await supabase
    .from("wine_entries")
    .select("region")
    .eq("user_id", userId)
    .or(orClause)
    .not("region", "is", null)
    .limit(1000);

  if (!data) return 0;

  const unique = new Set(
    (data as Array<{ region: string }>).map((row) =>
      row.region.toLowerCase().trim(),
    ),
  );

  return unique.size;
}

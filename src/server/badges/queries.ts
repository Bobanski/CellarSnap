import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@shared";

export type BadgeEntryFact = {
  id: string;
  region: string | null;
  appellation: string | null;
  country: string | null;
  producer: string | null;
  wine_type: string | null;
  grapes: string[];
};

/** One owner-scoped, paginated fact load; never count cellar stock as tastings.
 * Keyset pagination avoids the default Data API row cap and offset shifts.
 * Separate owned tasting rows (including shared copies) count separately.
 */
export async function loadBadgeEntryFacts(supabase: SupabaseClient<Database>, userId: string) {
  const facts: BadgeEntryFact[] = [];
  let after: string | undefined;
  for (;;) {
    let query = supabase.from("wine_entries")
      .select("id,region,appellation,country,producer,wine_type,entry_primary_grapes(grape_varieties(name))")
      .eq("user_id", userId).eq("entry_status", "consumed")
      .order("id").limit(500);
    if (after) query = query.gt("id", after);
    const { data, error } = await query;
    if (error || !data) throw new Error("Unable to load badge tasting facts.");
    for (const row of data) {
      facts.push({ ...row, grapes: row.entry_primary_grapes.flatMap(link =>
        link.grape_varieties ? [link.grape_varieties.name] : []) });
    }
    // Continue even after a short page: hosted max_rows can be below our limit.
    if (data.length === 0) return facts;
    after = data[data.length - 1].id;
  }
}

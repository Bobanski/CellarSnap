import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { bulkResolveEntrySensoryProfiles } from "@/server/algorithm/resolveEntrySensory";

/**
 * POST /api/algorithm/backfill-sensory
 *
 * Backfills assembled_sensory for all entries that don't have one yet.
 * Processes in batches of 50.
 *
 * Query params:
 *   limit — max entries to process (default 200)
 *   force — if "true", recompute even entries that already have a profile
 */
export async function POST(request: Request) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(request.url);
  const limit = Math.min(500, Number(url.searchParams.get("limit") ?? "200"));
  const force = url.searchParams.get("force") === "true";

  let query = supabase
    .from("wine_entries")
    .select("id, wine_type, canonical_region, canonical_sub_region, canonical_country, region, appellation, country, vintage, producer, classification")
    .not("wine_type", "is", null)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (!force) {
    query = query.is("assembled_sensory", null);
  }

  const { data: entries, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (!entries || entries.length === 0) {
    return NextResponse.json({ message: "No entries to process", resolved: 0, failed: 0 });
  }

  // Load grapes for all entries
  const entryIds = entries.map((e) => e.id);
  const { data: grapeRows } = await supabase
    .from("entry_primary_grapes")
    .select("entry_id, grape_varieties(name)")
    .in("entry_id", entryIds);

  const grapeMap = new Map<string, string>();
  if (grapeRows) {
    for (const row of grapeRows) {
      const gv = (row as unknown as { entry_id: string; grape_varieties: { name: string } | { name: string }[] | null }).grape_varieties;
      const name = Array.isArray(gv) ? gv[0]?.name : gv?.name;
      if (name) {
        const existing = grapeMap.get(row.entry_id);
        grapeMap.set(row.entry_id, existing ? `${existing}, ${name}` : name);
      }
    }
  }

  const entriesWithGrapes = entries.map((e) => ({
    ...e,
    primary_grapes: grapeMap.get(e.id) ?? null,
  }));

  const result = await bulkResolveEntrySensoryProfiles(supabase, entriesWithGrapes);

  return NextResponse.json({
    message: `Processed ${entries.length} entries`,
    ...result,
  });
}

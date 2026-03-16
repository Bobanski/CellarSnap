import type { createSupabaseServerClient } from "@/lib/supabase/server";
import type { PrimaryGrape } from "@/types/wine";

type SupabaseClient = Awaited<ReturnType<typeof createSupabaseServerClient>>;

type EntryPrimaryGrapeRow = {
  entry_id: string;
  position: number;
  grape_varieties:
    | {
        id: string;
        name: string;
      }
    | {
        id: string;
        name: string;
      }[]
    | null;
};

function normalizeVariety(
  variety: EntryPrimaryGrapeRow["grape_varieties"]
): { id: string; name: string } | null {
  if (!variety) {
    return null;
  }

  if (Array.isArray(variety)) {
    return variety[0] ?? null;
  }

  return variety;
}

export function normalizePrimaryGrapeIds(
  primaryGrapeIds: string[] | undefined
): string[] {
  if (!Array.isArray(primaryGrapeIds) || primaryGrapeIds.length === 0) {
    return [];
  }

  return Array.from(new Set(primaryGrapeIds)).slice(0, 3);
}

export async function fetchPrimaryGrapesByEntryId(
  supabase: SupabaseClient,
  entryIds: string[]
): Promise<Map<string, PrimaryGrape[]>> {
  const map = new Map<string, PrimaryGrape[]>();

  if (entryIds.length === 0) {
    return map;
  }

  const { data, error } = await supabase
    .from("entry_primary_grapes")
    .select("entry_id, position, grape_varieties(id, name)")
    .in("entry_id", entryIds)
    .order("position", { ascending: true });

  if (error || !data) {
    return map;
  }

  (data as EntryPrimaryGrapeRow[]).forEach((row) => {
    const variety = normalizeVariety(row.grape_varieties);
    if (!variety) {
      return;
    }

    const current = map.get(row.entry_id) ?? [];
    current.push({
      id: variety.id,
      name: variety.name,
      position: row.position,
    });
    map.set(row.entry_id, current);
  });

  return map;
}

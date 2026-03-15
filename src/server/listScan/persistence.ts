import { listScanResultSchema, type ListScanResult } from "@shared";
import type { SupabaseClient } from "@supabase/supabase-js";

export type SavedListScanSummary = {
  scan_id: string;
  source_type: ListScanResult["source_type"];
  source_label: string | null;
  venue_name: string | null;
  list_title: string | null;
  overall_confidence: number | null;
  scanned_at: string;
  wine_count: number;
};

type SavedListScanRow = {
  raw_result: unknown;
  scan_id: string;
  source_type: ListScanResult["source_type"];
  source_label: string | null;
  venue_name: string | null;
  list_title: string | null;
  overall_confidence: number | null;
  scanned_at: string;
};

export async function saveListScanResult(
  supabase: SupabaseClient,
  userId: string,
  result: ListScanResult
) {
  const summaryRow = {
    scan_id: result.scan_id,
    user_id: userId,
    source_type: result.source_type,
    source_label: result.source_label,
    venue_name: result.venue_name,
    list_title: result.list_title,
    overall_confidence: result.overall_confidence,
    scanned_at: result.scanned_at,
    raw_result: result,
  };

  const { error: summaryError } = await supabase
    .from("list_scan_results")
    .insert(summaryRow);
  if (summaryError) {
    throw summaryError;
  }

  const { error: deleteError } = await supabase
    .from("list_scan_wines")
    .delete()
    .eq("scan_id", result.scan_id)
    .eq("user_id", userId);
  if (deleteError) {
    throw deleteError;
  }

  if (result.wines.length === 0) {
    return;
  }

  const wineRows = result.wines.map((wine) => ({
    id: wine.id,
    scan_id: result.scan_id,
    user_id: userId,
    source_order: wine.source_order,
    menu_label: wine.menu_label,
    producer: wine.producer,
    wine_name: wine.wine_name,
    vintage: wine.vintage,
    wine_type: wine.wine_type,
    price_display: wine.price_display,
    price_value: wine.price_value,
    varietals: wine.varietals,
    regions: wine.regions,
    match_percent: wine.match_percent,
    parse_confidence: wine.parse_confidence,
    rationale: wine.rationale,
  }));

  const { error: winesError } = await supabase
    .from("list_scan_wines")
    .insert(wineRows);
  if (winesError) {
    throw winesError;
  }
}

export async function getSavedListScanResult(
  supabase: SupabaseClient,
  userId: string,
  scanId: string
): Promise<ListScanResult | null> {
  const { data, error } = await supabase
    .from("list_scan_results")
    .select("raw_result")
    .eq("user_id", userId)
    .eq("scan_id", scanId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  const parsed = listScanResultSchema.safeParse(data?.raw_result);
  return parsed.success ? parsed.data : null;
}

export async function listSavedListScans(
  supabase: SupabaseClient,
  userId: string
): Promise<SavedListScanSummary[]> {
  const { data, error } = await supabase
    .from("list_scan_results")
    .select(
      "scan_id, source_type, source_label, venue_name, list_title, overall_confidence, scanned_at, raw_result"
    )
    .eq("user_id", userId)
    .order("scanned_at", { ascending: false })
    .limit(50);

  if (error) {
    throw error;
  }

  return ((data ?? []) as SavedListScanRow[])
    .map((row) => {
      const parsed = listScanResultSchema.safeParse(row.raw_result);
      if (!parsed.success) {
        // Log for ops/debugging
        console.warn(`Failed to parse list scan ${row.scan_id}:`, parsed.error);
        return null;
      }
      return {
        scan_id: row.scan_id,
        source_type: row.source_type,
        source_label: row.source_label,
        venue_name: row.venue_name,
        list_title: row.list_title,
        overall_confidence: row.overall_confidence,
        scanned_at: row.scanned_at,
        wine_count: parsed.data.wines.length,
      } satisfies SavedListScanSummary;
    })
    .filter((row): row is SavedListScanSummary => row !== null);
}

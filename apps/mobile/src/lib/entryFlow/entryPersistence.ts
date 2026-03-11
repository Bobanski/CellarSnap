import { signPhotoUrl } from "@/src/lib/storage/signedUrls";

type MobileSupabaseClient = typeof import("@/src/lib/supabase").supabase;

export type InsertEntryFallbackResult = {
  error: { message: string } | null;
  entryId: string | null;
};

export type SurveyComparisonCandidate = {
  id: string;
  wine_name: string | null;
  producer: string | null;
  vintage: string | null;
  consumed_at: string;
  label_image_url: string | null;
};

export async function insertEntryWithFallback({
  supabase,
  initialPayload,
}: {
  supabase: MobileSupabaseClient;
  initialPayload: Record<string, unknown>;
}): Promise<InsertEntryFallbackResult> {
  const payload = { ...initialPayload };

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const insertAttempt = await supabase
      .from("wine_entries")
      .insert(payload)
      .select("id")
      .single();
    if (!insertAttempt.error) {
      return {
        error: null,
        entryId: insertAttempt.data?.id ?? null,
      };
    }

    const message = insertAttempt.error.message;
    let removed = false;
    const removeIfPresent = (column: string) => {
      if (message.includes(column) && column in payload) {
        delete payload[column];
        removed = true;
      }
    };

    removeIfPresent("classification");
    removeIfPresent("location_place_id");
    removeIfPresent("entry_privacy");
    removeIfPresent("reaction_privacy");
    removeIfPresent("comments_privacy");
    removeIfPresent("comments_scope");
    removeIfPresent("price_paid");
    removeIfPresent("price_paid_currency");
    removeIfPresent("price_paid_source");
    removeIfPresent("qpr_level");
    removeIfPresent("advanced_notes");
    removeIfPresent("drinking_now");

    if (!removed) {
      return { error: { message }, entryId: null };
    }
  }

  return { error: { message: "Unable to create entry." }, entryId: null };
}

export async function persistPrimaryGrapesByIds({
  supabase,
  entryId,
  grapeIds,
}: {
  supabase: MobileSupabaseClient;
  entryId: string;
  grapeIds: string[];
}) {
  if (grapeIds.length === 0) {
    return;
  }

  const primaryGrapeRows = grapeIds.slice(0, 3).map((grapeId, index) => ({
    entry_id: entryId,
    variety_id: grapeId,
    position: index + 1,
  }));

  const { error } = await supabase.from("entry_primary_grapes").insert(primaryGrapeRows);
  if (error) {
    const message = error.message ?? "";
    if (
      message.includes("entry_primary_grapes") ||
      message.includes("grape_varieties")
    ) {
      return;
    }
  }
}

export async function fetchComparisonCandidateForEntry({
  supabase,
  currentEntryId,
  ownerUserId,
}: {
  supabase: MobileSupabaseClient;
  currentEntryId: string;
  ownerUserId: string;
}): Promise<SurveyComparisonCandidate | null> {
  const { count, error: countError } = await supabase
    .from("wine_entries")
    .select("id", { count: "exact", head: true })
    .eq("user_id", ownerUserId)
    .neq("id", currentEntryId);

  if (countError || !count || count <= 0) {
    return null;
  }

  const randomOffset = Math.floor(Math.random() * count);

  const { data: candidate, error: candidateError } = await supabase
    .from("wine_entries")
    .select("id, wine_name, producer, vintage, consumed_at, label_image_path")
    .eq("user_id", ownerUserId)
    .neq("id", currentEntryId)
    .order("created_at", { ascending: false })
    .range(randomOffset, randomOffset)
    .maybeSingle();

  if (candidateError || !candidate) {
    return null;
  }

  const { data: labelPhoto } = await supabase
    .from("entry_photos")
    .select("path")
    .eq("entry_id", candidate.id)
    .eq("type", "label")
    .order("position", { ascending: true })
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  const labelPath = labelPhoto?.path ?? candidate.label_image_path ?? null;
  const labelImageUrl = await signPhotoUrl(labelPath, { supabaseClient: supabase });

  return {
    id: candidate.id,
    wine_name: candidate.wine_name,
    producer: candidate.producer,
    vintage: candidate.vintage,
    consumed_at: candidate.consumed_at,
    label_image_url: labelImageUrl,
  };
}

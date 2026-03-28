import { NextResponse } from "next/server";
import { z } from "zod";
import { RequestAuthError, requireRequestAuth } from "@/server/auth/requestAuth";

const drinkRequestSchema = z.object({
  cellar_entry_id: z.string().uuid(),
});

export async function POST(request: Request) {
  let auth;
  try {
    auth = await requireRequestAuth(request);
  } catch (error) {
    if (error instanceof RequestAuthError) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    throw error;
  }

  const { supabase, user } = auth;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = drinkRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const { cellar_entry_id } = parsed.data;

  // Load the cellar entry and verify ownership + status
  const { data: cellarEntry, error: fetchError } = await supabase
    .from("wine_entries")
    .select("*")
    .eq("id", cellar_entry_id)
    .eq("user_id", user.id)
    .eq("entry_status", "cellaring")
    .maybeSingle();

  if (fetchError) {
    return NextResponse.json({ error: fetchError.message }, { status: 500 });
  }

  if (!cellarEntry) {
    return NextResponse.json(
      { error: "Cellar entry not found or not accessible." },
      { status: 404 }
    );
  }

  const currentQuantity =
    typeof cellarEntry.cellar_quantity === "number"
      ? cellarEntry.cellar_quantity
      : 0;

  if (currentQuantity <= 0) {
    return NextResponse.json(
      { error: "No bottles remaining in this cellar entry." },
      { status: 400 }
    );
  }

  // Decrement cellar_quantity
  const { error: updateError } = await supabase
    .from("wine_entries")
    .update({ cellar_quantity: currentQuantity - 1 })
    .eq("id", cellar_entry_id)
    .eq("user_id", user.id);

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  // Clone wine data into a new consumed entry
  const now = new Date().toISOString();
  const consumedAt = now.slice(0, 10);

  const { data: newEntry, error: insertError } = await supabase
    .from("wine_entries")
    .insert({
      user_id: user.id,
      wine_name: cellarEntry.wine_name ?? null,
      producer: cellarEntry.producer ?? null,
      vintage: cellarEntry.vintage ?? null,
      country: cellarEntry.country ?? null,
      region: cellarEntry.region ?? null,
      appellation: cellarEntry.appellation ?? null,
      classification: cellarEntry.classification ?? null,
      wine_type: cellarEntry.wine_type ?? null,
      label_image_path: cellarEntry.label_image_path ?? null,
      place_image_path: null,
      pairing_image_path: null,
      canonical_country: cellarEntry.canonical_country ?? null,
      canonical_region: cellarEntry.canonical_region ?? null,
      canonical_sub_region: cellarEntry.canonical_sub_region ?? null,
      entry_status: "consumed",
      cellared_from_id: cellar_entry_id,
      consumed_at: consumedAt,
      rating: null,
      notes: null,
      advanced_notes: null,
      entry_privacy: cellarEntry.entry_privacy ?? "public",
      tasted_with_user_ids: [],
    })
    .select("id")
    .single();

  if (insertError) {
    // Roll back the quantity decrement on failure
    await supabase
      .from("wine_entries")
      .update({ cellar_quantity: currentQuantity })
      .eq("id", cellar_entry_id)
      .eq("user_id", user.id);

    return NextResponse.json({ error: insertError.message }, { status: 500 });
  }

  // Clone entry_primary_grapes rows
  const { data: grapeRows } = await supabase
    .from("entry_primary_grapes")
    .select("variety_id, position")
    .eq("entry_id", cellar_entry_id)
    .order("position", { ascending: true });

  if (grapeRows && grapeRows.length > 0) {
    const { error: grapeInsertError } = await supabase
      .from("entry_primary_grapes")
      .insert(
        grapeRows.map((row) => ({
          entry_id: newEntry.id,
          variety_id: row.variety_id,
          position: row.position,
        }))
      );

    if (grapeInsertError) {
      // Best-effort: log but don't fail the request
      console.warn(
        `[cellar/drink] Failed to clone grapes for entry ${newEntry.id}:`,
        grapeInsertError.message
      );
    }
  }

  return NextResponse.json({ consumed_entry_id: newEntry.id });
}

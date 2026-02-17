import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { canUserViewEntry } from "@/lib/access/entryVisibility";

type WineEntryRow = {
  id: string;
  user_id: string;
  root_entry_id?: string | null;
  wine_name?: string | null;
  producer?: string | null;
  vintage?: string | null;
  country?: string | null;
  region?: string | null;
  appellation?: string | null;
  classification?: string | null;
  rating?: number | null;
  price_paid?: number | null;
  price_paid_currency?: string | null;
  price_paid_source?: string | null;
  qpr_level?: string | null;
  notes?: string | null;
  ai_notes_summary?: string | null;
  advanced_notes?: unknown;
  location_text?: string | null;
  location_place_id?: string | null;
  consumed_at?: string | null;
  tasted_with_user_ids?: string[] | null;
  label_image_path?: string | null;
  place_image_path?: string | null;
  pairing_image_path?: string | null;
  entry_privacy?: string;
  label_photo_privacy?: string | null;
  place_photo_privacy?: string | null;
};

function isMissingTastingColumns(error: string) {
  return (
    error.includes("root_entry_id") ||
    error.includes("is_feed_visible") ||
    error.includes("column") ||
    error.includes("schema")
  );
}

function isLegacyPendingPath(path: string | null | undefined) {
  return !path || path === "pending";
}

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!id) {
    return NextResponse.json({ error: "Entry ID required." }, { status: 400 });
  }

  const { data: entry, error: entryError } = await supabase
    .from("wine_entries")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (entryError || !entry) {
    return NextResponse.json({ error: "Entry not found." }, { status: 404 });
  }

  const baseEntry = entry as unknown as WineEntryRow;

  try {
    const entryPrivacy =
      baseEntry.entry_privacy === "friends" ||
      baseEntry.entry_privacy === "private" ||
      baseEntry.entry_privacy === "public"
        ? baseEntry.entry_privacy
        : "public";
    const canView = await canUserViewEntry({
      supabase,
      viewerUserId: user.id,
      ownerUserId: baseEntry.user_id,
      entryPrivacy,
    });
    if (!canView) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  } catch (visibilityError) {
    const message =
      visibilityError instanceof Error
        ? visibilityError.message
        : "Unable to verify entry visibility.";
    return NextResponse.json({ error: message }, { status: 500 });
  }

  let rootEntry: WineEntryRow = baseEntry;
  const rootEntryId = baseEntry.root_entry_id ?? null;
  if (rootEntryId) {
    const { data: rootRow } = await supabase
      .from("wine_entries")
      .select("*")
      .eq("id", rootEntryId)
      .maybeSingle();
    if (rootRow) {
      rootEntry = rootRow as unknown as WineEntryRow;
    }
  }

  const taggedIdsOnViewedEntry = Array.isArray(baseEntry.tasted_with_user_ids)
    ? baseEntry.tasted_with_user_ids
    : [];
  const taggedIdsOnRootEntry = Array.isArray(rootEntry.tasted_with_user_ids)
    ? rootEntry.tasted_with_user_ids
    : [];
  const isTaggedOnViewedEntry = taggedIdsOnViewedEntry.includes(user.id);
  const isTaggedOnRootEntry = taggedIdsOnRootEntry.includes(user.id);

  // Shared tasting copies can introduce tags that do not exist on the canonical root
  // entry. Accept either path so tagged users can still add the tasting to their log.
  if (!isTaggedOnViewedEntry && !isTaggedOnRootEntry) {
    return NextResponse.json(
      { error: "You can only add entries where you were tagged." },
      { status: 403 }
    );
  }

  if (rootEntry.user_id === user.id) {
    return NextResponse.json(
      { error: "This is already your entry." },
      { status: 400 }
    );
  }

  // If this entry was already added to the user's log, return it.
  const existing = await supabase
    .from("wine_entries")
    .select("id, location_text")
    .eq("user_id", user.id)
    .eq("root_entry_id", rootEntry.id)
    .maybeSingle();

  if (existing.error) {
    if (isMissingTastingColumns(existing.error.message)) {
      return NextResponse.json(
        {
          error:
            "Shared tastings are temporarily unavailable. Please try again later. (SHARED_TASTINGS_UNAVAILABLE)",
          code: "SHARED_TASTINGS_UNAVAILABLE",
        },
        { status: 503 }
      );
    }
    return NextResponse.json({ error: existing.error.message }, { status: 500 });
  }

  if (existing.data?.id) {
    // Backfill location if this copy was created before we started copying it over.
    try {
      const existingLocation =
        typeof (existing.data as { location_text?: unknown }).location_text ===
        "string"
          ? ((existing.data as { location_text: string }).location_text ?? "")
          : "";
      const rootLocation =
        typeof rootEntry.location_text === "string"
          ? rootEntry.location_text.trim()
          : "";

      if (!existingLocation && rootLocation) {
        await supabase
          .from("wine_entries")
          .update({ location_text: rootLocation })
          .eq("id", existing.data.id);
      }
    } catch {
      // Ignore copy backfill failures.
    }

    // Best-effort: mark the tag notification as handled so it doesn't keep showing.
    try {
      await supabase
        .from("wine_notifications")
        .update({ seen_at: new Date().toISOString() })
        .eq("user_id", user.id)
        .eq("entry_id", rootEntry.id)
        .eq("type", "tagged")
        .is("seen_at", null);
    } catch {
      // Ignore notification update failures.
    }
    return NextResponse.json({ entry_id: existing.data.id, already_exists: true });
  }

  // Create a friends-visible copy for the tagged user.
  const insertPayload: Record<string, unknown> = {
    user_id: user.id,
    root_entry_id: rootEntry.id,
    is_feed_visible: true,
    wine_name: rootEntry.wine_name ?? null,
    producer: rootEntry.producer ?? null,
    vintage: rootEntry.vintage ?? null,
    country: rootEntry.country ?? null,
    region: rootEntry.region ?? null,
    appellation: rootEntry.appellation ?? null,
    classification: rootEntry.classification ?? null,
    // Personal fields should be set by the tagged user, not copied from the original author.
    rating: null,
    price_paid: rootEntry.price_paid ?? null,
    price_paid_currency: rootEntry.price_paid_currency ?? null,
    price_paid_source: rootEntry.price_paid_source ?? null,
    qpr_level: null,
    notes: null,
    ai_notes_summary: null,
    advanced_notes: null,
    location_text: rootEntry.location_text ?? null,
    location_place_id: rootEntry.location_place_id ?? null,
    consumed_at: rootEntry.consumed_at ?? null,
    // Pre-check the friend who tagged the user (the original author).
    // The tagged user can remove/add people when editing their copy.
    tasted_with_user_ids:
      rootEntry.user_id && rootEntry.user_id !== user.id ? [rootEntry.user_id] : [],
    // We'll copy photos into this user's storage namespace after insert.
    label_image_path: null,
    place_image_path: null,
    pairing_image_path: null,
    // Friends by default so the tagged user's circle can see their version.
    entry_privacy: "friends",
    label_photo_privacy: null,
    place_photo_privacy: null,
  };

  const requiredColumns = ["root_entry_id", "is_feed_visible"];
  const optionalColumns = [
    "classification",
    "price_paid",
    "price_paid_currency",
    "price_paid_source",
    "qpr_level",
    "ai_notes_summary",
    "advanced_notes",
    "location_text",
    "location_place_id",
    "label_photo_privacy",
    "place_photo_privacy",
    "place_image_path",
    "pairing_image_path",
    "country",
    "region",
    "appellation",
  ];

  const insertAttemptPayload: Record<string, unknown> = { ...insertPayload };
  let insertedId: string | null = null;

  for (let attempt = 0; attempt < 6; attempt += 1) {
    const insertAttempt = await supabase
      .from("wine_entries")
      .insert(insertAttemptPayload)
      .select("id")
      .single();

    if (!insertAttempt.error) {
      insertedId = insertAttempt.data?.id ?? null;
      break;
    }

    const message = insertAttempt.error.message ?? "";
    const missingRequired = requiredColumns.find((col) => message.includes(col));
    if (missingRequired) {
      return NextResponse.json(
        {
          error:
            "Shared tastings are temporarily unavailable. Please try again later. (SHARED_TASTINGS_UNAVAILABLE)",
          code: "SHARED_TASTINGS_UNAVAILABLE",
        },
        { status: 503 }
      );
    }

    const missingOptional = optionalColumns.find((col) => message.includes(col));
    if (missingOptional && missingOptional in insertAttemptPayload) {
      delete insertAttemptPayload[missingOptional];
      continue;
    }

    return NextResponse.json({ error: message }, { status: 500 });
  }

  if (!insertedId) {
    return NextResponse.json(
      { error: "Unable to add this tasting to your log." },
      { status: 500 }
    );
  }

  // Mark the tag notification as handled for this user (best-effort).
  try {
    await supabase
      .from("wine_notifications")
      .update({ seen_at: new Date().toISOString() })
      .eq("user_id", user.id)
      .eq("entry_id", rootEntry.id)
      .eq("type", "tagged")
      .is("seen_at", null);
  } catch {
    // Ignore notification update failures.
  }

  // Copy entry photos into the new entry's namespace so the user's friends can view them.
  try {
    type PhotoType = "label" | "place" | "pairing";
    type SourcePhoto = { type: PhotoType; path: string; position: number };
    const sourcePhotos: SourcePhoto[] = [];

    // Prefer the modern entry_photos table, but fall back to legacy photo paths if needed.
    const { data: photoRows } = await supabase
      .from("entry_photos")
      .select("type, path, position")
      .eq("entry_id", rootEntry.id)
      .order("position", { ascending: true })
      .order("created_at", { ascending: true });

    (photoRows ?? []).forEach((row) => {
      if (row.type !== "label" && row.type !== "place" && row.type !== "pairing") {
        return;
      }
      const path = row.path;
      if (isLegacyPendingPath(path)) return;
      sourcePhotos.push({
        type: row.type,
        path,
        position: row.position ?? 0,
      });
    });

    const hasType = (type: PhotoType) =>
      sourcePhotos.some((photo) => photo.type === type);

    if (!hasType("label") && !isLegacyPendingPath(rootEntry.label_image_path)) {
      sourcePhotos.push({
        type: "label",
        path: rootEntry.label_image_path as string,
        position: 0,
      });
    }
    if (!hasType("place") && !isLegacyPendingPath(rootEntry.place_image_path)) {
      sourcePhotos.push({
        type: "place",
        path: rootEntry.place_image_path as string,
        position: 0,
      });
    }
    if (!hasType("pairing") && !isLegacyPendingPath(rootEntry.pairing_image_path)) {
      sourcePhotos.push({
        type: "pairing",
        path: rootEntry.pairing_image_path as string,
        position: 0,
      });
    }

    const copiedPhotos: { id: string; type: PhotoType; path: string; position: number }[] = [];

    for (const sourcePhoto of sourcePhotos) {
      const newPhotoId = randomUUID();
      const newPath = `${user.id}/${insertedId}/${sourcePhoto.type}/${newPhotoId}.jpg`;

      const { error: copyError } = await supabase.storage
        .from("wine-photos")
        .copy(sourcePhoto.path, newPath);

      if (copyError) {
        // Skip photos we can't copy (e.g., missing object).
        continue;
      }

      copiedPhotos.push({
        id: newPhotoId,
        type: sourcePhoto.type,
        path: newPath,
        position: sourcePhoto.position ?? 0,
      });
    }

    if (copiedPhotos.length > 0) {
      await supabase.from("entry_photos").insert(
        copiedPhotos.map((photo) => ({
          id: photo.id,
          entry_id: insertedId,
          type: photo.type,
          path: photo.path,
          position: photo.position,
        }))
      );

      // Best-effort legacy field hydration for pages that still rely on *_image_path.
      const firstByType = (type: PhotoType) =>
        copiedPhotos
          .filter((photo) => photo.type === type)
          .sort((a, b) => a.position - b.position)[0]?.path ?? null;

      const labelPath = firstByType("label");
      const placePath = firstByType("place");
      const pairingPath = firstByType("pairing");

      const legacyUpdates: Record<string, string | null> = {};
      if (labelPath) legacyUpdates.label_image_path = labelPath;
      if (placePath) legacyUpdates.place_image_path = placePath;
      if (pairingPath) legacyUpdates.pairing_image_path = pairingPath;

      if (Object.keys(legacyUpdates).length > 0) {
        await supabase.from("wine_entries").update(legacyUpdates).eq("id", insertedId);
      }
    }

  } catch {
    // Ignore photo copy failures (non-critical for log ownership).
  }

  // Copy primary grapes (if the schema exists).
  try {
    const { data: grapeRows } = await supabase
      .from("entry_primary_grapes")
      .select("variety_id, position")
      .eq("entry_id", rootEntry.id)
      .order("position", { ascending: true });

    const grapesToInsert = (grapeRows ?? [])
      .filter((row) => row.variety_id && row.position)
      .map((row) => ({
        entry_id: insertedId,
        variety_id: row.variety_id,
        position: row.position,
      }));

    if (grapesToInsert.length > 0) {
      await supabase.from("entry_primary_grapes").insert(grapesToInsert);
    }
  } catch {
    // Ignore primary grape copy failures.
  }

  return NextResponse.json({ entry_id: insertedId, already_exists: false });
}

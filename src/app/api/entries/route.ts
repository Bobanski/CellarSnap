import { NextResponse } from "next/server";
import { isMissingDbColumnError } from "@/lib/supabase/errors";
import { normalizeProducerText, normalizeWineNameText } from "@/lib/wineText";
import { normalizeAdvancedNotes } from "@/lib/advancedNotes";
import {
  fetchPrimaryGrapesByEntryId,
  normalizePrimaryGrapeIds,
} from "@/lib/primaryGrapes";
import { requireRequestAuth, RequestAuthError } from "@/server/auth/requestAuth";
import { createEntrySchema } from "@/server/entries/schema";
import {
  executeSelectWithFallback,
  executeWithColumnFallback,
} from "@/server/db/compat";
import { signPhotoUrl, signPhotoUrls } from "@/server/storage/signedUrls";
import { resolveEntryFields } from "@/server/algorithm/resolver";

type RequestSupabaseClient = Awaited<ReturnType<typeof requireRequestAuth>>["supabase"];

type ComparisonCandidate = {
  id: string;
  wine_name: string | null;
  producer: string | null;
  vintage: string | null;
  consumed_at: string;
  label_image_url: string | null;
};

type EntryListRow = {
  id: string;
  user_id: string;
  wine_name: string | null;
  producer: string | null;
  vintage: string | null;
  country: string | null;
  region: string | null;
  appellation: string | null;
  classification: string | null;
  rating: number | null;
  price_paid: number | null;
  price_paid_currency: string | null;
  price_paid_source: string | null;
  qpr_level: string | null;
  consumed_at: string;
  tasted_with_user_ids: string[] | null;
  label_image_path: string | null;
  created_at: string;
};

function isPrimaryGrapeSchemaMissing(message: string) {
  return (
    message.includes("grape_varieties") ||
    message.includes("grape_aliases") ||
    message.includes("entry_primary_grapes")
  );
}

const ENTRY_OPTIONAL_INSERT_COLUMNS = [
  "classification",
  "wine_type",
  "is_feed_visible",
  "drinking_now",
  "location_place_id",
  "comments_scope",
  "reaction_privacy",
  "comments_privacy",
] as const;

async function getRandomComparisonCandidate({
  userId,
  newEntryId,
  supabase,
}: {
  userId: string;
  newEntryId: string;
  supabase: RequestSupabaseClient;
}): Promise<ComparisonCandidate | null> {
  const { count, error: countError } = await supabase
    .from("wine_entries")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .neq("id", newEntryId);

  if (countError || !count || count <= 0) {
    return null;
  }

  const randomOffset = Math.floor(Math.random() * count);

  const { data: candidate, error: candidateError } = await supabase
    .from("wine_entries")
    .select("id, wine_name, producer, vintage, consumed_at, label_image_path")
    .eq("user_id", userId)
    .neq("id", newEntryId)
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

  return {
    id: candidate.id,
    wine_name: candidate.wine_name,
    producer: candidate.producer,
    vintage: candidate.vintage,
    consumed_at: candidate.consumed_at,
    label_image_url: await signPhotoUrl(labelPath, supabase),
  };
}

export async function GET(request: Request) {
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

  const url = new URL(request.url);
  const cursor = url.searchParams.get("cursor"); // created_at or consumed_at (ISO)
  const rawLimit = Number(url.searchParams.get("limit") ?? "");
  const limit = Number.isFinite(rawLimit) && rawLimit > 0 ? Math.min(100, Math.max(1, rawLimit)) : 50;
  const sortBy = url.searchParams.get("sort") === "consumed_at" ? "consumed_at" : "created_at";

  const selectFields =
    "id, user_id, wine_name, producer, vintage, country, region, appellation, classification, rating, price_paid, price_paid_currency, price_paid_source, qpr_level, consumed_at, tasted_with_user_ids, label_image_path, created_at";
  const fallbackSelectFields =
    "id, user_id, wine_name, producer, vintage, country, region, appellation, rating, price_paid, price_paid_currency, price_paid_source, qpr_level, consumed_at, tasted_with_user_ids, label_image_path, created_at";

  type EntryListSelectAttempt = {
    fields: string;
    missingColumns: readonly string[];
    includesClassification: boolean;
  };
  const listSelectAttempts: EntryListSelectAttempt[] = [
    {
      fields: selectFields,
      missingColumns: ["classification"],
      includesClassification: true,
    },
    {
      fields: fallbackSelectFields,
      missingColumns: [],
      includesClassification: false,
    },
  ];

  const buildQuery = (fields: string) => {
    let query = supabase
      .from("wine_entries")
      .select(fields)
      .eq("user_id", user.id)
      .order(sortBy, { ascending: false });

    if (cursor) {
      query = query.lt(sortBy, cursor);
    }

    return query;
  };

  const listSelectResult = await executeSelectWithFallback({
    attempts: listSelectAttempts,
    getFallbackColumns: (attempt) => attempt.missingColumns,
    attempt: async (attempt) => {
      const result = await buildQuery(attempt.fields).limit(limit + 1);
      return {
        data: result.data,
        error: result.error,
      };
    },
  });

  const rows = listSelectResult.usedAttempt?.includesClassification
    ? (((listSelectResult.data ?? []) as unknown as EntryListRow[]).map((entry) => ({
        ...entry,
        classification: entry.classification ?? null,
      })) as EntryListRow[])
    : (((listSelectResult.data ?? []) as unknown as Omit<
        EntryListRow,
        "classification"
      >[]).map((entry) => ({
        ...entry,
        classification: null,
      })) as EntryListRow[]);

  if (listSelectResult.error) {
    return NextResponse.json(
      { error: listSelectResult.error.message },
      { status: 500 }
    );
  }

  const pageRows = rows.length > limit ? rows.slice(0, limit) : rows;
  const has_more = rows.length > limit;
  const lastRow = pageRows[pageRows.length - 1];
  const next_cursor = has_more
    ? (sortBy === "consumed_at" ? lastRow?.consumed_at : lastRow?.created_at) ?? null
    : null;

  const entryIds = pageRows.map((entry) => entry.id);
  const primaryGrapeMap = await fetchPrimaryGrapesByEntryId(supabase, entryIds);
  const { data: labelPhotos } =
    entryIds.length > 0
      ? await supabase
          .from("entry_photos")
          .select("entry_id, path, position, created_at")
          .eq("type", "label")
          .in("entry_id", entryIds)
          .order("position", { ascending: true })
          .order("created_at", { ascending: true })
      : { data: [] };

  const labelMap = new Map<string, string>();
  (labelPhotos ?? []).forEach((photo) => {
    if (!labelMap.has(photo.entry_id)) {
      labelMap.set(photo.entry_id, photo.path);
    }
  });

  const labelPathsToSign = new Set<string>();
  const labelPathByEntryId = new Map<string, string>();
  pageRows.forEach((entry) => {
    const labelPath = labelMap.get(entry.id) ?? entry.label_image_path ?? null;
    if (labelPath) {
      labelPathsToSign.add(labelPath);
      labelPathByEntryId.set(entry.id, labelPath);
    }
  });

  const signedUrlByPath = await signPhotoUrls(labelPathsToSign, supabase);

  // Comment counts per entry (batch query).
  const commentCountMap = new Map<string, number>();
  if (entryIds.length > 0) {
    const { data: commentRows } = await supabase
      .from("entry_comments")
      .select("entry_id")
      .in("entry_id", entryIds);
    (commentRows ?? []).forEach((row: { entry_id: string }) => {
      commentCountMap.set(row.entry_id, (commentCountMap.get(row.entry_id) ?? 0) + 1);
    });
  }

  const entries = pageRows.map((entry) => {
    const labelPath = labelPathByEntryId.get(entry.id) ?? null;
    return {
      ...entry,
      primary_grapes: primaryGrapeMap.get(entry.id) ?? [],
      label_image_url: labelPath ? signedUrlByPath.get(labelPath) ?? null : null,
      // Not used by /entries list UI; avoid extra signing work
      place_image_url: null,
      pairing_image_url: null,
      comment_count: commentCountMap.get(entry.id) ?? 0,
    };
  });

  // Lightweight total count (uses index on user_id)
  const { count: totalCount } = await supabase
    .from("wine_entries")
    .select("id", { count: "exact", head: true })
    .eq("user_id", user.id);

  return NextResponse.json({ entries, next_cursor, has_more, total_count: totalCount ?? 0 });
}

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

  const payload = createEntrySchema.safeParse(body);
  if (!payload.success) {
    return NextResponse.json(
      { error: payload.error.flatten() },
      { status: 400 }
    );
  }

  const consumedAt =
    payload.data.consumed_at ?? new Date().toISOString().slice(0, 10);

  const profileWithInteractionDefaults = await supabase
    .from("profiles")
    .select(
      "default_entry_privacy, default_reaction_privacy, default_comments_privacy"
    )
    .eq("id", user.id)
    .maybeSingle();
  const profile =
    profileWithInteractionDefaults.error &&
    (profileWithInteractionDefaults.error.message.includes(
      "default_reaction_privacy"
    ) ||
      profileWithInteractionDefaults.error.message.includes(
        "default_comments_privacy"
      ))
      ? await supabase
          .from("profiles")
          .select("default_entry_privacy")
          .eq("id", user.id)
          .maybeSingle()
      : profileWithInteractionDefaults;

  const profileEntryPrivacy = (
    profile.data as { default_entry_privacy?: string | null } | null
  )?.default_entry_privacy;
  const profileReactionPrivacy = (
    profile.data as { default_reaction_privacy?: string | null } | null
  )?.default_reaction_privacy;
  const profileCommentsPrivacy = (
    profile.data as { default_comments_privacy?: string | null } | null
  )?.default_comments_privacy;

  const entryPrivacy = payload.data.entry_privacy ??
    (profileEntryPrivacy === "public" ||
    profileEntryPrivacy === "friends_of_friends" ||
    profileEntryPrivacy === "friends" ||
    profileEntryPrivacy === "private"
      ? profileEntryPrivacy
      : "public");
  const profileReactionDefault =
    profileReactionPrivacy === "public" ||
    profileReactionPrivacy === "friends_of_friends" ||
    profileReactionPrivacy === "friends" ||
    profileReactionPrivacy === "private"
      ? profileReactionPrivacy
      : "public";
  const profileCommentsDefault =
    profileCommentsPrivacy === "public" ||
    profileCommentsPrivacy === "friends_of_friends" ||
    profileCommentsPrivacy === "friends" ||
    profileCommentsPrivacy === "private"
      ? profileCommentsPrivacy
      : "friends_of_friends";
  const labelPhotoPrivacy =
    payload.data.label_photo_privacy ?? null;
  const placePhotoPrivacy =
    payload.data.place_photo_privacy ?? null;
  const commentsScope = payload.data.comments_scope ?? "viewers";
  const reactionPrivacy = payload.data.reaction_privacy ?? profileReactionDefault;
  const commentsPrivacyFromScope =
    commentsScope === "friends" && entryPrivacy !== "private"
      ? "friends"
      : entryPrivacy;
  const commentsPrivacy =
    payload.data.comments_privacy ??
    (payload.data.comments_scope !== undefined
      ? commentsPrivacyFromScope
      : profileCommentsDefault);
  const advancedNotes = normalizeAdvancedNotes(payload.data.advanced_notes);
  const primaryGrapeIds = normalizePrimaryGrapeIds(payload.data.primary_grape_ids);
  let primaryGrapeIdsToPersist = primaryGrapeIds;

  if (primaryGrapeIds.length > 0) {
    const { data: grapeRows, error: grapeLookupError } = await supabase
      .from("grape_varieties")
      .select("id")
      .in("id", primaryGrapeIds);

    if (grapeLookupError) {
      if (isPrimaryGrapeSchemaMissing(grapeLookupError.message)) {
        primaryGrapeIdsToPersist = [];
      } else {
        return NextResponse.json(
          { error: grapeLookupError.message },
          { status: 500 }
        );
      }
    } else {
      const validGrapeIds = new Set((grapeRows ?? []).map((row) => row.id));
      if (validGrapeIds.size !== primaryGrapeIds.length) {
        return NextResponse.json(
          { error: "One or more selected primary grapes are invalid." },
          { status: 400 }
        );
      }
    }
  }

  const insertPayload: Record<string, unknown> = {
    user_id: user.id,
    wine_name:
      normalizeWineNameText(payload.data.wine_name) ??
      payload.data.wine_name?.trim() ??
      null,
    producer: normalizeProducerText(payload.data.producer) ?? null,
    vintage: payload.data.vintage ?? null,
    country: payload.data.country ?? null,
    region: payload.data.region ?? null,
    appellation: payload.data.appellation ?? null,
    classification: payload.data.classification ?? null,
    wine_type: payload.data.wine_type ?? null,
    rating: payload.data.rating ?? null,
    price_paid: payload.data.price_paid ?? null,
    price_paid_currency: payload.data.price_paid_currency ?? null,
    price_paid_source: payload.data.price_paid_source ?? null,
    qpr_level: payload.data.qpr_level ?? null,
    notes: payload.data.notes ?? null,
    advanced_notes: advancedNotes,
    location_text: payload.data.location_text ?? null,
    location_place_id: payload.data.location_place_id ?? null,
    consumed_at: consumedAt,
    drinking_now: payload.data.drinking_now ?? false,
    tasted_with_user_ids: payload.data.tasted_with_user_ids ?? [],
    label_image_path: null,
    place_image_path: null,
    pairing_image_path: null,
    entry_privacy: entryPrivacy,
    reaction_privacy: reactionPrivacy,
    comments_privacy: commentsPrivacy,
    comments_scope: commentsScope,
    label_photo_privacy: labelPhotoPrivacy,
    place_photo_privacy: placePhotoPrivacy,
  };

  if (payload.data.is_feed_visible !== undefined) {
    insertPayload.is_feed_visible = payload.data.is_feed_visible;
  }

  const insertResult = await executeWithColumnFallback({
    initialPayload: insertPayload,
    removableColumns: ENTRY_OPTIONAL_INSERT_COLUMNS,
    maxAttempts: 3,
    attempt: async (payloadToApply) => {
      const insertAttempt = await supabase
        .from("wine_entries")
        .insert(payloadToApply)
        .select("*")
        .single();
      return {
        data: insertAttempt.data,
        error: insertAttempt.error,
      };
    },
  });
  const data = insertResult.data;
  const error = insertResult.error;

  if (error) {
    if (isMissingDbColumnError(error, "advanced_notes")) {
      return NextResponse.json(
        {
          error:
            "Advanced notes are temporarily unavailable. Please try again later. (ADVANCED_NOTES_UNAVAILABLE)",
          code: "ADVANCED_NOTES_UNAVAILABLE",
        },
        { status: 503 }
      );
    }
    if (error.message.includes("wine_entries_price_source_requires_price_check")) {
      return NextResponse.json(
        {
          error:
            "Price paid, currency, and source must be set together. Select a currency and retail/restaurant when entering a price.",
        },
        { status: 400 }
      );
    }
    if (
      isMissingDbColumnError(error, "price_paid") ||
      isMissingDbColumnError(error, "price_paid_currency") ||
      isMissingDbColumnError(error, "price_paid_source") ||
      isMissingDbColumnError(error, "qpr_level")
    ) {
      return NextResponse.json(
        {
          error:
            "Entry pricing and QPR are temporarily unavailable. Please try again later. (ENTRY_PRICING_UNAVAILABLE)",
          code: "ENTRY_PRICING_UNAVAILABLE",
        },
        { status: 503 }
      );
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (!data) {
    return NextResponse.json({ error: "Unable to create entry" }, { status: 500 });
  }

  if (primaryGrapeIdsToPersist.length > 0) {
    const { error: grapeInsertError } = await supabase
      .from("entry_primary_grapes")
      .insert(
        primaryGrapeIdsToPersist.map((varietyId, index) => ({
          entry_id: data.id,
          variety_id: varietyId,
          position: index + 1,
        }))
      );

    if (grapeInsertError) {
      if (isPrimaryGrapeSchemaMissing(grapeInsertError.message)) {
        primaryGrapeIdsToPersist = [];
      } else {
      await supabase
        .from("wine_entries")
        .delete()
        .eq("id", data.id)
        .eq("user_id", user.id);
        return NextResponse.json(
          { error: grapeInsertError.message },
          { status: 500 }
        );
      }
    }
  }

  // Resolution middleware: fire-and-forget (non-blocking).
  // Captures raw values and resolves to canonical fields.
  // Fully functional once WS1 alias tables are populated (migration 046+).
  {
    const rawRegion = payload.data.region ?? null;
    const rawProducer = payload.data.producer ?? null;
    const rawClassification = payload.data.classification ?? null;
    const rawWineType = payload.data.wine_type ?? null;

    const resolution = resolveEntryFields({
      region: rawRegion,
      producer: rawProducer,
      classification: rawClassification,
      wine_type: rawWineType,
    });

    // Update canonical fields (silent on column-not-found errors — migration may not be applied)
    void supabase
      .from("wine_entries")
      .update({
        raw_region: rawRegion,
        raw_producer: rawProducer,
        raw_classification: rawClassification,
        raw_wine_type: rawWineType ? String(rawWineType) : null,
        canonical_region: resolution.canonical_region,
        canonical_producer: resolution.canonical_producer,
        canonical_classification: resolution.canonical_classification,
        resolution_confidence: resolution.resolution_confidence,
        fallback_level: resolution.fallback_level,
      })
      .eq("id", data.id)
      .eq("user_id", user.id);

    // Log resolution outcome (silent on table-not-found errors)
    void supabase.from("scan_resolution_log").insert({
      entry_id: data.id,
      user_id: user.id,
      raw_region: rawRegion,
      raw_producer: rawProducer,
      raw_classification: rawClassification,
      raw_wine_type: rawWineType ? String(rawWineType) : null,
      canonical_region: resolution.canonical_region,
      canonical_producer: resolution.canonical_producer,
      canonical_classification: resolution.canonical_classification,
      resolution_confidence: resolution.resolution_confidence,
      fallback_level: resolution.fallback_level,
      region_alias_matched: resolution.region_alias_matched,
      producer_alias_matched: resolution.producer_alias_matched,
      resolution_source: resolution.resolution_source,
    });
  }

  const createdEntryPrimaryGrapes = await fetchPrimaryGrapesByEntryId(supabase, [
    data.id,
  ]);
  const entryWithPrimaryGrapes = {
    ...data,
    primary_grapes: createdEntryPrimaryGrapes.get(data.id) ?? [],
  };

  let comparisonCandidate: ComparisonCandidate | null = null;
  if (!payload.data.skip_comparison_candidate) {
    try {
      comparisonCandidate = await getRandomComparisonCandidate({
        userId: user.id,
        newEntryId: data.id,
        supabase,
      });
    } catch {
      comparisonCandidate = null;
    }
  }

  return NextResponse.json({
    entry: entryWithPrimaryGrapes,
    comparison_candidate: comparisonCandidate,
  });
}

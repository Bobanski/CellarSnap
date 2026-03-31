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
import { resolveGroupedPostData } from "@/server/entries/groupPosts";
import { signPhotoUrl, signPhotoUrls } from "@/server/storage/signedUrls";
import { persistEntryResolution } from "@/server/algorithm/persistEntryResolution";
import { invalidateUserScoreCache } from "@/server/algorithm/scoreCache";
import { refreshRecentUserScoreCache } from "@/server/algorithm/cacheRefresh";
import { resolveEntrySensoryProfile } from "@/server/algorithm/resolveEntrySensory";
import { evaluateAndAwardBadges } from "@/server/badges/evaluator";

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
  entry_group_id: string | null;
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
  "entry_status",
  "cellar_quantity",
  "bottle_format",
] as const;

type EntryPostHandlerDependencies = {
  requireRequestAuth: typeof requireRequestAuth;
  executeWithColumnFallback: typeof executeWithColumnFallback;
  fetchPrimaryGrapesByEntryId: typeof fetchPrimaryGrapesByEntryId;
  persistEntryResolution: typeof persistEntryResolution;
  getRandomComparisonCandidate: typeof getRandomComparisonCandidate;
};

const defaultEntryPostHandlerDependencies: EntryPostHandlerDependencies = {
  requireRequestAuth,
  executeWithColumnFallback,
  fetchPrimaryGrapesByEntryId,
  persistEntryResolution,
  getRandomComparisonCandidate,
};

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
    .eq("entry_status", "consumed")
    .neq("id", newEntryId);

  if (countError || !count || count <= 0) {
    return null;
  }

  const randomOffset = Math.floor(Math.random() * count);

  const { data: candidate, error: candidateError } = await supabase
    .from("wine_entries")
    .select("id, wine_name, producer, vintage, consumed_at, label_image_path")
    .eq("user_id", userId)
    .eq("entry_status", "consumed")
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
  const cursor = url.searchParams.get("cursor");
  const rawLimit = Number(url.searchParams.get("limit") ?? "");
  const limit = Number.isFinite(rawLimit) && rawLimit > 0 ? Math.min(100, Math.max(1, rawLimit)) : 50;
  const sortBy = url.searchParams.get("sort") === "consumed_at" ? "consumed_at" : "created_at";

  const selectFields =
    "id, user_id, wine_name, producer, vintage, country, region, appellation, classification, rating, price_paid, price_paid_currency, price_paid_source, qpr_level, consumed_at, tasted_with_user_ids, label_image_path, entry_group_id, created_at";
  const fallbackSelectFields =
    "id, user_id, wine_name, producer, vintage, country, region, appellation, rating, price_paid, price_paid_currency, price_paid_source, qpr_level, consumed_at, tasted_with_user_ids, label_image_path, entry_group_id, created_at";
  const selectFieldsWithoutGroupId =
    "id, user_id, wine_name, producer, vintage, country, region, appellation, classification, rating, price_paid, price_paid_currency, price_paid_source, qpr_level, consumed_at, tasted_with_user_ids, label_image_path, created_at";
  const fallbackSelectFieldsWithoutGroupId =
    "id, user_id, wine_name, producer, vintage, country, region, appellation, rating, price_paid, price_paid_currency, price_paid_source, qpr_level, consumed_at, tasted_with_user_ids, label_image_path, created_at";

  type EntryListSelectAttempt = {
    fields: string;
    missingColumns: readonly string[];
    includesClassification: boolean;
    includesGroupId: boolean;
  };
  const listSelectAttempts: EntryListSelectAttempt[] = [
    {
      fields: selectFields,
      missingColumns: ["classification", "entry_group_id"],
      includesClassification: true,
      includesGroupId: true,
    },
    {
      fields: fallbackSelectFields,
      missingColumns: ["entry_group_id"],
      includesClassification: false,
      includesGroupId: true,
    },
    {
      fields: selectFieldsWithoutGroupId,
      missingColumns: ["classification"],
      includesClassification: true,
      includesGroupId: false,
    },
    {
      fields: fallbackSelectFieldsWithoutGroupId,
      missingColumns: [],
      includesClassification: false,
      includesGroupId: false,
    },
  ];

  const buildQuery = (fields: string) => {
    let query = supabase
      .from("wine_entries")
      .select(fields)
      .eq("user_id", user.id)
      .eq("entry_status", "consumed")
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

  if (listSelectResult.error) {
    return NextResponse.json(
      { error: listSelectResult.error.message },
      { status: 500 }
    );
  }

  const rows = (((listSelectResult.data ?? []) as unknown) as Array<
    Partial<EntryListRow> & Omit<EntryListRow, "classification" | "entry_group_id">
  >).map((entry) => ({
    ...entry,
    classification: listSelectResult.usedAttempt?.includesClassification
      ? entry.classification ?? null
      : null,
    entry_group_id: listSelectResult.usedAttempt?.includesGroupId
      ? entry.entry_group_id ?? null
      : null,
  })) as EntryListRow[];

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
  const groupedPostByEntryId = listSelectResult.usedAttempt?.includesGroupId
    ? await resolveGroupedPostData(
        supabase,
        pageRows.map((entry) => ({
          id: entry.id,
          entry_group_id: entry.entry_group_id ?? null,
        }))
      )
    : new Map();

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
    const groupedPost = groupedPostByEntryId.get(entry.id);
    return {
      ...entry,
      primary_grapes: primaryGrapeMap.get(entry.id) ?? [],
      label_image_url: labelPath ? signedUrlByPath.get(labelPath) ?? null : null,
      place_image_url: null,
      pairing_image_url: null,
      comment_count: commentCountMap.get(entry.id) ?? 0,
      entry_group: groupedPost?.entry_group ?? null,
      group_slides: groupedPost?.group_slides ?? [],
    };
  });

  const { count: totalCount } = await supabase
    .from("wine_entries")
    .select("id", { count: "exact", head: true })
    .eq("user_id", user.id)
    .eq("entry_status", "consumed");

  return NextResponse.json({ entries, next_cursor, has_more, total_count: totalCount ?? 0 });
}

export function createEntryPostHandler(
  dependencies: Partial<EntryPostHandlerDependencies> = {}
) {
  const resolvedDependencies = {
    ...defaultEntryPostHandlerDependencies,
    ...dependencies,
  };

  return async function POST(request: Request) {
    let auth;
    try {
      auth = await resolvedDependencies.requireRequestAuth(request);
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
  const labelPhotoPrivacy = payload.data.label_photo_privacy ?? null;
  const placePhotoPrivacy = payload.data.place_photo_privacy ?? null;
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
  let primaryVarietalName: string | null = null;
  let primaryGrapeNames: string[] = [];

  if (primaryGrapeIds.length > 0) {
    const { data: grapeRows, error: grapeLookupError } = await supabase
      .from("grape_varieties")
      .select("id, name")
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

      const grapeNameById = new Map(
        ((grapeRows ?? []) as { id: string; name: string | null }[]).map((row) => [
          row.id,
          row.name,
        ])
      );
      primaryVarietalName = grapeNameById.get(primaryGrapeIds[0]) ?? null;
      primaryGrapeNames = primaryGrapeIds
        .map((grapeId) => grapeNameById.get(grapeId) ?? null)
        .filter((name): name is string => typeof name === "string" && name.trim().length > 0);
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

  if (payload.data.entry_status !== undefined) {
    insertPayload.entry_status = payload.data.entry_status;
  }

  if (payload.data.cellar_quantity !== undefined) {
    insertPayload.cellar_quantity = payload.data.cellar_quantity;
  }

  if (payload.data.bottle_format !== undefined) {
    insertPayload.bottle_format = payload.data.bottle_format;
  }

    const insertResult = await resolvedDependencies.executeWithColumnFallback({
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

  let createdEntry = data as { id: string } & Record<string, unknown>;

  try {
    const persistedResolution = await resolvedDependencies.persistEntryResolution({
      supabase,
      entryId: data.id,
      userId: user.id,
      input: {
        region: payload.data.region ?? null,
        producer: payload.data.producer ?? null,
        classification: payload.data.classification ?? null,
        wine_type: payload.data.wine_type ?? null,
        country: payload.data.country ?? null,
        primary_grapes: primaryGrapeNames,
        varietal: primaryVarietalName,
      },
    });

    if (persistedResolution.entry) {
      createdEntry = persistedResolution.entry;
    }
  } catch {
    // Resolution is best-effort and should not block entry creation.
  }

  // Materialize the 16-axis sensory profile from base_profiles + modifiers.
  // Best-effort — entry creation continues even if assembly fails.
  try {
    await resolveEntrySensoryProfile(supabase, data.id, {
      id: data.id,
      wine_type: createdEntry.wine_type as string | null ?? null,
      canonical_region: createdEntry.canonical_region as string | null ?? null,
      canonical_sub_region: createdEntry.canonical_sub_region as string | null ?? null,
      canonical_country: createdEntry.canonical_country as string | null ?? null,
      region: createdEntry.region as string | null ?? null,
      appellation: createdEntry.appellation as string | null ?? null,
      country: createdEntry.country as string | null ?? null,
      vintage: createdEntry.vintage as string | null ?? null,
      producer: createdEntry.producer as string | null ?? null,
      classification: createdEntry.classification as string | null ?? null,
      primary_grapes: primaryGrapeNames.join(", ") || null,
    });
  } catch {
    // Sensory resolution is best-effort.
  }

  try {
    await invalidateUserScoreCache(supabase, user.id);
    await refreshRecentUserScoreCache(supabase, user.id);
  } catch {
    // Cache refresh is best-effort and should not block entry creation.
  }

    const createdEntryPrimaryGrapes = await resolvedDependencies.fetchPrimaryGrapesByEntryId(supabase, [
    data.id,
    ]);
    const entryWithPrimaryGrapes = {
      ...createdEntry,
      primary_grapes: createdEntryPrimaryGrapes.get(data.id) ?? [],
    };

  // Badge evaluation — best-effort, non-blocking.
  let newlyEarnedBadges: Array<{ id: string; name: string; toastText: string; tier: string; color: string; accent: string; shape: string }> = [];
  try {
    const grapes = (entryWithPrimaryGrapes.primary_grapes as Array<{ variety?: string; name?: string }>)
      .map((g) => g.variety ?? g.name ?? "")
      .filter(Boolean);
    const result = await evaluateAndAwardBadges({
      supabase,
      userId: user.id,
      entryData: {
        wine_type: createdEntry.wine_type as string | undefined,
        country: createdEntry.country as string | undefined,
        region: createdEntry.region as string | undefined,
        appellation: createdEntry.appellation as string | undefined,
        grapes,
        rating: createdEntry.rating as number | undefined,
      },
    });
    newlyEarnedBadges = result.newlyEarned;
  } catch {
    // Badge evaluation is best-effort.
  }

    let comparisonCandidate: ComparisonCandidate | null = null;
    if (!payload.data.skip_comparison_candidate) {
      try {
        comparisonCandidate = await resolvedDependencies.getRandomComparisonCandidate({
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
      newly_earned_badges: newlyEarnedBadges,
    });
  };
}

export const POST = createEntryPostHandler();

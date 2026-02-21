import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient, type User } from "@supabase/supabase-js";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { isMissingDbColumnError } from "@/lib/supabase/errors";
import {
  ACIDITY_LEVELS,
  ALCOHOL_LEVELS,
  BODY_LEVELS,
  SWEETNESS_LEVELS,
  TANNIN_LEVELS,
  normalizeAdvancedNotes,
} from "@/lib/advancedNotes";
import {
  PRICE_PAID_CURRENCY_VALUES,
  PRICE_PAID_SOURCE_VALUES,
  QPR_LEVEL_VALUES,
} from "@/lib/entryMeta";
import {
  fetchPrimaryGrapesByEntryId,
  normalizePrimaryGrapeIds,
} from "@/lib/primaryGrapes";

const privacyLevelSchema = z.enum(["public", "friends_of_friends", "friends", "private"]);
const commentScopeSchema = z.enum(["viewers", "friends"]);
const pricePaidCurrencySchema = z.enum(PRICE_PAID_CURRENCY_VALUES);
const pricePaidSourceSchema = z.enum(PRICE_PAID_SOURCE_VALUES);
const qprLevelSchema = z.enum(QPR_LEVEL_VALUES);

const nullableString = z.preprocess(
  (value) => {
    if (typeof value === "string" && value.trim() === "") {
      return null;
    }
    return value;
  },
  z.string().nullable().optional()
);

const nullableEnum = <T extends readonly [string, ...string[]]>(values: T) =>
  z.preprocess(
    (value) => (value === "" ? null : value),
    z.enum(values).nullable().optional()
  );

const optionalPricePaidSchema = z.preprocess(
  (value) => {
    if (value === null || value === undefined || value === "") {
      return undefined;
    }
    if (typeof value === "string") {
      const trimmed = value.trim();
      if (trimmed === "") {
        return undefined;
      }
      const parsed = Number(trimmed);
      return Number.isFinite(parsed) ? parsed : value;
    }
    return value;
  },
  z
    .number({ error: "Price paid must be numbers only (no $ or symbols)." })
    .min(0, "Price paid must be a valid number.")
    .max(100000, "Price paid must be a valid number.")
    .optional()
);

const optionalRatingSchema = z.preprocess(
  (value) => {
    if (value === null || value === undefined || value === "") {
      return null;
    }
    if (typeof value === "string") {
      const trimmed = value.trim();
      if (trimmed === "") {
        return null;
      }
      const parsed = Number(trimmed);
      return Number.isFinite(parsed) ? parsed : value;
    }
    return value;
  },
  z
    .number({ error: "Rating required." })
    .int("Rating must be a whole number (integer).")
    .min(1, "Rating must be between 1 and 100.")
    .max(100, "Rating must be between 1 and 100.")
    .nullable()
);

const primaryGrapeIdsSchema = z.preprocess(
  (value) => {
    if (!Array.isArray(value)) {
      return value;
    }
    return value.filter((item): item is string => typeof item === "string");
  },
  z.array(z.string().uuid()).max(3).optional()
);

const advancedNotesSchema = z
  .object({
    acidity: nullableEnum(ACIDITY_LEVELS),
    tannin: nullableEnum(TANNIN_LEVELS),
    alcohol: nullableEnum(ALCOHOL_LEVELS),
    sweetness: nullableEnum(SWEETNESS_LEVELS),
    body: nullableEnum(BODY_LEVELS),
  })
  .nullable()
  .optional();

const createEntrySchema = z.object({
  wine_name: z.string().min(1, "Wine name is required"),
  producer: nullableString,
  vintage: nullableString,
  country: nullableString,
  region: nullableString,
  appellation: nullableString,
  classification: nullableString,
  primary_grape_ids: primaryGrapeIdsSchema,
  rating: optionalRatingSchema,
  price_paid: optionalPricePaidSchema,
  price_paid_currency: z.preprocess(
    (value) => (value === "" ? null : value),
    pricePaidCurrencySchema.nullable().optional()
  ),
  price_paid_source: z
    .preprocess((value) => (value === "" ? null : value), pricePaidSourceSchema.nullable().optional()),
  qpr_level: z.preprocess((value) => (value === "" ? null : value), qprLevelSchema.nullable().optional()),
  notes: nullableString,
  advanced_notes: advancedNotesSchema,
  location_text: nullableString,
  location_place_id: nullableString,
  consumed_at: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  tasted_with_user_ids: z.array(z.string().uuid()).optional(),
  entry_privacy: privacyLevelSchema.optional(),
  reaction_privacy: privacyLevelSchema.optional(),
  comments_privacy: privacyLevelSchema.optional(),
  comments_scope: commentScopeSchema.optional(),
  label_photo_privacy: privacyLevelSchema.nullable().optional(),
  place_photo_privacy: privacyLevelSchema.nullable().optional(),
  is_feed_visible: z.boolean().optional(),
  skip_comparison_candidate: z.boolean().optional(),
}).superRefine((data, ctx) => {
  const hasPrice = data.price_paid !== undefined;
  const hasPriceCurrency =
    data.price_paid_currency !== undefined && data.price_paid_currency !== null;
  const hasPriceSource =
    data.price_paid_source !== undefined && data.price_paid_source !== null;

  if (hasPrice && !hasPriceCurrency) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Select a currency when entering price paid.",
      path: ["price_paid_currency"],
    });
  }

  if (hasPrice && !hasPriceSource) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Select retail or restaurant when entering price paid.",
      path: ["price_paid_source"],
    });
  }

  if (!hasPrice && hasPriceCurrency) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Enter a price paid amount when selecting a currency.",
      path: ["price_paid"],
    });
  }

  if (!hasPrice && hasPriceSource) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Enter a price paid amount when selecting retail or restaurant.",
      path: ["price_paid"],
    });
  }
});

type SupabaseClient = Awaited<ReturnType<typeof createSupabaseServerClient>>;

async function createRequestSupabaseClient(
  request: Request
): Promise<{ supabase: SupabaseClient; user: User | null }> {
  const authHeader = request.headers.get("authorization");
  const bearerMatch = /^Bearer\s+(.+)$/i.exec(authHeader ?? "");
  const bearerToken = bearerMatch?.[1]?.trim();
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (bearerToken && supabaseUrl && supabaseAnonKey) {
    const bearerClient = createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
      global: {
        headers: {
          Authorization: `Bearer ${bearerToken}`,
        },
      },
    });
    const {
      data: { user },
    } = await bearerClient.auth.getUser();
    if (user) {
      return {
        supabase: bearerClient as unknown as SupabaseClient,
        user,
      };
    }
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return { supabase, user };
}

async function createSignedUrl(path: string | null, supabase: SupabaseClient) {
  if (!path || path === "pending") {
    return null;
  }

  const { data, error } = await supabase.storage
    .from("wine-photos")
    .createSignedUrl(path, 60 * 60);

  if (error) {
    return null;
  }

  return data.signedUrl;
}

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

function isClassificationColumnMissing(message: string) {
  return message.includes("classification");
}

function isFeedVisibleColumnMissing(message: string) {
  return message.includes("is_feed_visible");
}

function isLocationPlaceIdColumnMissing(message: string) {
  return message.includes("location_place_id");
}

function isCommentsScopeColumnMissing(message: string) {
  return message.includes("comments_scope");
}

function isReactionPrivacyColumnMissing(message: string) {
  return message.includes("reaction_privacy");
}

function isCommentsPrivacyColumnMissing(message: string) {
  return message.includes("comments_privacy");
}

async function getRandomComparisonCandidate({
  userId,
  newEntryId,
  supabase,
}: {
  userId: string;
  newEntryId: string;
  supabase: SupabaseClient;
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
    label_image_url: await createSignedUrl(labelPath, supabase),
  };
}

export async function GET(request: Request) {
  const { supabase, user } = await createRequestSupabaseClient(request);

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(request.url);
  const cursor = url.searchParams.get("cursor"); // created_at or consumed_at (ISO)
  const rawLimit = Number(url.searchParams.get("limit") ?? "");
  const limit = Number.isFinite(rawLimit) && rawLimit > 0 ? Math.min(100, Math.max(1, rawLimit)) : 50;
  const sortBy = url.searchParams.get("sort") === "consumed_at" ? "consumed_at" : "created_at";

  const selectFields =
    "id, user_id, wine_name, producer, vintage, country, region, appellation, classification, rating, price_paid, price_paid_currency, price_paid_source, qpr_level, consumed_at, tasted_with_user_ids, label_image_path, created_at";
  const fallbackSelectFields =
    "id, user_id, wine_name, producer, vintage, country, region, appellation, rating, price_paid, price_paid_currency, price_paid_source, qpr_level, consumed_at, tasted_with_user_ids, label_image_path, created_at";
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

  const initialQuery = await buildQuery(selectFields).limit(limit + 1);
  let error = initialQuery.error;
  let rows = (initialQuery.data ?? []) as unknown as EntryListRow[];

  if (error?.message.includes("classification")) {
    const fallback = await buildQuery(fallbackSelectFields).limit(limit + 1);
    rows = (
      (fallback.data ?? []) as unknown as Omit<EntryListRow, "classification">[]
    ).map(
      (entry) => ({ ...entry, classification: null })
    );
    error = fallback.error;
  }

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
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

  const signedUrlByPath = new Map<string, string | null>();
  await Promise.all(
    Array.from(labelPathsToSign).map(async (path) => {
      signedUrlByPath.set(path, await createSignedUrl(path, supabase));
    })
  );

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
  const { supabase, user } = await createRequestSupabaseClient(request);

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

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
    wine_name: payload.data.wine_name ?? null,
    producer: payload.data.producer ?? null,
    vintage: payload.data.vintage ?? null,
    country: payload.data.country ?? null,
    region: payload.data.region ?? null,
    appellation: payload.data.appellation ?? null,
    classification: payload.data.classification ?? null,
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

  const insertPayloadToApply: Record<string, unknown> = { ...insertPayload };
  let data: ({ id: string } & Record<string, unknown>) | null = null;
  let error: { message: string; code?: string | null } | null = null;

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const insertAttempt = await supabase
      .from("wine_entries")
      .insert(insertPayloadToApply)
      .select("*")
      .single();

    data = insertAttempt.data;
    error = insertAttempt.error;
    if (!error) {
      break;
    }

    let removedUnsupportedColumn = false;
    if (
      isClassificationColumnMissing(error.message) &&
      "classification" in insertPayloadToApply
    ) {
      delete insertPayloadToApply.classification;
      removedUnsupportedColumn = true;
    }
    if (
      isFeedVisibleColumnMissing(error.message) &&
      "is_feed_visible" in insertPayloadToApply
    ) {
      delete insertPayloadToApply.is_feed_visible;
      removedUnsupportedColumn = true;
    }
    if (
      isLocationPlaceIdColumnMissing(error.message) &&
      "location_place_id" in insertPayloadToApply
    ) {
      delete insertPayloadToApply.location_place_id;
      removedUnsupportedColumn = true;
    }
    if (
      isCommentsScopeColumnMissing(error.message) &&
      "comments_scope" in insertPayloadToApply
    ) {
      delete insertPayloadToApply.comments_scope;
      removedUnsupportedColumn = true;
    }
    if (
      isReactionPrivacyColumnMissing(error.message) &&
      "reaction_privacy" in insertPayloadToApply
    ) {
      delete insertPayloadToApply.reaction_privacy;
      removedUnsupportedColumn = true;
    }
    if (
      isCommentsPrivacyColumnMissing(error.message) &&
      "comments_privacy" in insertPayloadToApply
    ) {
      delete insertPayloadToApply.comments_privacy;
      removedUnsupportedColumn = true;
    }

    if (!removedUnsupportedColumn) {
      break;
    }
  }

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

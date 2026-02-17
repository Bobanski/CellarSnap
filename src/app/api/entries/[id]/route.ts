import { NextResponse } from "next/server";
import { z } from "zod";
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
import { canUserViewEntry } from "@/lib/access/entryVisibility";

const privacyLevelSchema = z.enum(["public", "friends_of_friends", "friends", "private"]);
const commentScopeSchema = z.enum(["viewers", "friends"]);
const pricePaidCurrencySchema = z.enum(PRICE_PAID_CURRENCY_VALUES);
const pricePaidSourceSchema = z.enum(PRICE_PAID_SOURCE_VALUES);
const qprLevelSchema = z.enum(QPR_LEVEL_VALUES);

const nullableString = z.preprocess(
  (value) => {
    if (typeof value === "string" && value.trim() === "") return null;
    return value;
  },
  z.string().nullable().optional()
);

const nullableEnum = <T extends readonly [string, ...string[]]>(values: T) =>
  z.preprocess(
    (value) => (value === "" ? null : value),
    z.enum(values).nullable().optional()
  );

const nullablePricePaidSchema = z.preprocess(
  (value) => {
    if (value === undefined || value === "") {
      return undefined;
    }
    if (value === null) {
      return null;
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
    .nullable()
    .optional()
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

const updateEntrySchema = z.object({
  wine_name: nullableString,
  producer: nullableString,
  vintage: nullableString,
  country: nullableString,
  region: nullableString,
  appellation: nullableString,
  classification: nullableString,
  primary_grape_ids: primaryGrapeIdsSchema,
  rating: z
    .number()
    .int("Rating must be a whole number (integer).")
    .min(1, "Rating must be between 1 and 100.")
    .max(100, "Rating must be between 1 and 100.")
    .optional(),
  price_paid: nullablePricePaidSchema,
  price_paid_currency: z.preprocess(
    (value) => (value === "" ? null : value),
    pricePaidCurrencySchema.nullable().optional()
  ),
  price_paid_source: z.preprocess(
    (value) => (value === "" ? null : value),
    pricePaidSourceSchema.nullable().optional()
  ),
  qpr_level: z.preprocess(
    (value) => (value === "" ? null : value),
    qprLevelSchema.nullable().optional()
  ),
  notes: nullableString,
  advanced_notes: advancedNotesSchema,
  location_text: nullableString,
  location_place_id: nullableString,
  consumed_at: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  tasted_with_user_ids: z.array(z.string().uuid()).optional(),
  label_image_path: nullableString,
  place_image_path: nullableString,
  pairing_image_path: nullableString,
  entry_privacy: privacyLevelSchema.optional(),
  reaction_privacy: privacyLevelSchema.optional(),
  comments_privacy: privacyLevelSchema.optional(),
  comments_scope: commentScopeSchema.optional(),
  label_photo_privacy: privacyLevelSchema.nullable().optional(),
  place_photo_privacy: privacyLevelSchema.nullable().optional(),
  is_feed_visible: z.boolean().optional(),
}).superRefine((data, ctx) => {
  const providedPrice = data.price_paid !== undefined;
  const providedPriceCurrency = data.price_paid_currency !== undefined;
  const providedPriceSource = data.price_paid_source !== undefined;
  const hasAnyPriceField =
    providedPrice || providedPriceCurrency || providedPriceSource;

  if (!hasAnyPriceField) {
    return;
  }

  if (!providedPrice) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Provide price paid when updating currency or source.",
      path: ["price_paid"],
    });
  }

  if (!providedPriceCurrency) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Provide currency when updating price paid.",
      path: ["price_paid_currency"],
    });
  }

  if (!providedPriceSource) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Provide retail or restaurant when updating price paid.",
      path: ["price_paid_source"],
    });
  }

  if (!providedPrice || !providedPriceCurrency || !providedPriceSource) {
    return;
  }

  const hasPrice = data.price_paid !== null;
  const hasPriceCurrency = data.price_paid_currency !== null;
  const hasPriceSource = data.price_paid_source !== null;

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

async function createSignedUrl(path: string | null, supabase: SupabaseClient) {
  if (!path || path === "pending") return null;

  const { data, error } = await supabase.storage
    .from("wine-photos")
    .createSignedUrl(path, 60 * 60);

  if (error) return null;
  return data.signedUrl;
}

export async function GET(
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

  const { data, error } = await supabase
    .from("wine_entries")
    .select("*")
    .eq("id", id)
    .single();

  if (error || !data) {
    return NextResponse.json({ error: "Entry not found" }, { status: 404 });
  }

  try {
    const canView = await canUserViewEntry({
      supabase,
      viewerUserId: user.id,
      ownerUserId: data.user_id,
      entryPrivacy: data.entry_privacy,
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

  const tastedWithIds = Array.isArray(data.tasted_with_user_ids)
    ? data.tasted_with_user_ids
    : [];
  let tastedWithUsers: { id: string; display_name: string | null; email: string | null }[] = [];

  if (tastedWithIds.length > 0) {
    const { data: profiles } = await supabase
      .from("profiles")
      .select("id, display_name, email")
      .in("id", tastedWithIds);

    const nameMap = new Map(
      (profiles ?? []).map((profile) => [
        profile.id,
        {
          display_name: profile.display_name ?? null,
          email: profile.email ?? null,
        },
      ])
    );

    tastedWithUsers = tastedWithIds.map((userId: string) => ({
      id: userId,
      display_name: nameMap.get(userId)?.display_name ?? null,
      email: nameMap.get(userId)?.email ?? null,
    }));
  }

  // If the viewer was tagged, check if they've already added this tasting to their cellar.
  let viewer_log_entry_id: string | null = null;
  const rootEntryIdFromRow =
    typeof (data as { root_entry_id?: unknown }).root_entry_id === "string"
      ? (data as { root_entry_id: string }).root_entry_id
      : null;
  const canonicalEntryId = rootEntryIdFromRow ?? data.id;
  const viewerIsTagged =
    data.user_id !== user.id && tastedWithIds.includes(user.id);

  if (viewerIsTagged && canonicalEntryId) {
    const { data: existingCopy, error: existingError } = await supabase
      .from("wine_entries")
      .select("id")
      .eq("user_id", user.id)
      .eq("root_entry_id", canonicalEntryId)
      .maybeSingle();

    if (!existingError && existingCopy?.id) {
      viewer_log_entry_id = existingCopy.id;
    }
  }

  const entry = {
    ...data,
    primary_grapes:
      (await fetchPrimaryGrapesByEntryId(supabase, [data.id])).get(data.id) ?? [],
    label_image_url: await createSignedUrl(data.label_image_path, supabase),
    place_image_url: await createSignedUrl(data.place_image_path, supabase),
    pairing_image_url: await createSignedUrl(data.pairing_image_path, supabase),
    tasted_with_users: tastedWithUsers,
    viewer_log_entry_id,
  };

  return NextResponse.json({ entry });
}

export async function PUT(
  request: Request,
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

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const payload = updateEntrySchema.safeParse(body);
  if (!payload.success) {
    return NextResponse.json(
      { error: payload.error.flatten() },
      { status: 400 }
    );
  }

  const normalizedData = {
    ...payload.data,
    advanced_notes:
      payload.data.advanced_notes === undefined
        ? undefined
        : normalizeAdvancedNotes(payload.data.advanced_notes),
  };

  const primaryGrapeIds =
    normalizedData.primary_grape_ids === undefined
      ? undefined
      : normalizePrimaryGrapeIds(normalizedData.primary_grape_ids);
  const entryFieldUpdates = { ...normalizedData };
  delete entryFieldUpdates.primary_grape_ids;

  const updates = Object.fromEntries(
    Object.entries(entryFieldUpdates).filter(([, value]) => value !== undefined)
  );

  if (Object.keys(updates).length === 0 && primaryGrapeIds === undefined) {
    return NextResponse.json({ error: "No updates provided" }, { status: 400 });
  }

  const { data: targetEntry, error: targetEntryError } = await supabase
    .from("wine_entries")
    .select("id, user_id")
    .eq("id", id)
    .maybeSingle();

  if (targetEntryError) {
    return NextResponse.json({ error: targetEntryError.message }, { status: 500 });
  }

  if (!targetEntry) {
    return NextResponse.json({ error: "Entry not found" }, { status: 404 });
  }

  if (targetEntry.user_id !== user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let updatedEntry: ({ id: string } & Record<string, unknown>) | null = null;

  if (Object.keys(updates).length > 0) {
    const updatesToApply: Record<string, unknown> = { ...updates };
    let data: ({ id: string } & Record<string, unknown>) | null = null;
    let error: { message: string; code?: string | null } | null = null;

    for (let attempt = 0; attempt < 3; attempt += 1) {
      if (Object.keys(updatesToApply).length === 0) {
        const existingEntry = await supabase
          .from("wine_entries")
          .select("*")
          .eq("id", id)
          .eq("user_id", user.id)
          .maybeSingle();

        data = existingEntry.data;
        error = existingEntry.error;
        break;
      }

      const updateAttempt = await supabase
        .from("wine_entries")
        .update(updatesToApply)
        .eq("id", id)
        .eq("user_id", user.id)
        .select("*")
        .maybeSingle();

      data = updateAttempt.data;
      error = updateAttempt.error;
      if (!error) {
        break;
      }

      let removedUnsupportedColumn = false;
      if (
        isClassificationColumnMissing(error.message) &&
        "classification" in updatesToApply
      ) {
        delete updatesToApply.classification;
        removedUnsupportedColumn = true;
      }
      if (
        isFeedVisibleColumnMissing(error.message) &&
        "is_feed_visible" in updatesToApply
      ) {
        delete updatesToApply.is_feed_visible;
        removedUnsupportedColumn = true;
      }
      if (
        isLocationPlaceIdColumnMissing(error.message) &&
        "location_place_id" in updatesToApply
      ) {
        delete updatesToApply.location_place_id;
        removedUnsupportedColumn = true;
      }
      if (
        isCommentsScopeColumnMissing(error.message) &&
        "comments_scope" in updatesToApply
      ) {
        delete updatesToApply.comments_scope;
        removedUnsupportedColumn = true;
      }
      if (
        isReactionPrivacyColumnMissing(error.message) &&
        "reaction_privacy" in updatesToApply
      ) {
        delete updatesToApply.reaction_privacy;
        removedUnsupportedColumn = true;
      }
      if (
        isCommentsPrivacyColumnMissing(error.message) &&
        "comments_privacy" in updatesToApply
      ) {
        delete updatesToApply.comments_privacy;
        removedUnsupportedColumn = true;
      }

      if (!removedUnsupportedColumn) {
        break;
      }
    }

    if (!error && !data) {
      return NextResponse.json({ error: "Entry not found" }, { status: 404 });
    }

    if (error || !data) {
      if (error && isMissingDbColumnError(error, "advanced_notes")) {
        return NextResponse.json(
          {
            error:
              "Advanced notes are temporarily unavailable. Please try again later. (ADVANCED_NOTES_UNAVAILABLE)",
            code: "ADVANCED_NOTES_UNAVAILABLE",
          },
          { status: 503 }
        );
      }
      if (
        error?.message.includes("wine_entries_price_source_requires_price_check")
      ) {
        return NextResponse.json(
          {
            error:
              "Price paid, currency, and source must be set together. Select a currency and retail/restaurant when entering a price.",
          },
          { status: 400 }
        );
      }
      if (
        (error && isMissingDbColumnError(error, "price_paid")) ||
        (error && isMissingDbColumnError(error, "price_paid_currency")) ||
        (error && isMissingDbColumnError(error, "price_paid_source")) ||
        (error && isMissingDbColumnError(error, "qpr_level"))
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
      return NextResponse.json(
        { error: error?.message ?? "Update failed" },
        { status: 500 }
      );
    }

    updatedEntry = data;
  } else {
    const { data, error } = await supabase
      .from("wine_entries")
      .select("*")
      .eq("id", id)
      .eq("user_id", user.id)
      .single();

    if (error || !data) {
      return NextResponse.json({ error: "Entry not found" }, { status: 404 });
    }

    updatedEntry = data;
  }

  if (primaryGrapeIds !== undefined) {
    let primaryGrapeSchemaAvailable = true;

    if (primaryGrapeIds.length > 0) {
      const { data: grapeRows, error: grapeLookupError } = await supabase
        .from("grape_varieties")
        .select("id")
        .in("id", primaryGrapeIds);

      if (grapeLookupError) {
        if (isPrimaryGrapeSchemaMissing(grapeLookupError.message)) {
          primaryGrapeSchemaAvailable = false;
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

    if (primaryGrapeSchemaAvailable) {
      const { error: deletePrimaryGrapesError } = await supabase
        .from("entry_primary_grapes")
        .delete()
        .eq("entry_id", id);

      if (deletePrimaryGrapesError) {
        if (isPrimaryGrapeSchemaMissing(deletePrimaryGrapesError.message)) {
          primaryGrapeSchemaAvailable = false;
        } else {
          return NextResponse.json(
            { error: deletePrimaryGrapesError.message },
            { status: 500 }
          );
        }
      }
    }

    if (primaryGrapeSchemaAvailable && primaryGrapeIds.length > 0) {
      const { error: insertPrimaryGrapesError } = await supabase
        .from("entry_primary_grapes")
        .insert(
          primaryGrapeIds.map((varietyId, index) => ({
            entry_id: id,
            variety_id: varietyId,
            position: index + 1,
          }))
        );

      if (insertPrimaryGrapesError) {
        if (isPrimaryGrapeSchemaMissing(insertPrimaryGrapesError.message)) {
          // Ignore if migration is not installed yet; entry updates should still succeed.
        } else {
        return NextResponse.json(
          { error: insertPrimaryGrapesError.message },
          { status: 500 }
        );
        }
      }
    }
  }

  const primaryGrapesByEntryId = await fetchPrimaryGrapesByEntryId(supabase, [
    id,
  ]);

  if (!updatedEntry) {
    return NextResponse.json({ error: "Entry not found" }, { status: 404 });
  }

  return NextResponse.json({
    entry: {
      ...updatedEntry,
      primary_grapes: primaryGrapesByEntryId.get(id) ?? [],
    },
  });
}

export async function DELETE(
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

  const { data: existing, error: fetchError } = await supabase
    .from("wine_entries")
    .select("label_image_path, place_image_path, pairing_image_path")
    .eq("id", id)
    .eq("user_id", user.id)
    .single();

  if (fetchError || !existing) {
    return NextResponse.json({ error: "Entry not found" }, { status: 404 });
  }

  const { data: photoRows, error: photoFetchError } = await supabase
    .from("entry_photos")
    .select("path")
    .eq("entry_id", id);

  if (photoFetchError) {
    return NextResponse.json({ error: photoFetchError.message }, { status: 500 });
  }

  const paths = Array.from(
    new Set([
      existing.label_image_path,
      existing.place_image_path,
      existing.pairing_image_path,
      ...(photoRows ?? []).map((photo) => photo.path),
    ].filter((p): p is string => Boolean(p && p !== "pending")))
  );

  const { error } = await supabase
    .from("wine_entries")
    .delete()
    .eq("id", id)
    .eq("user_id", user.id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (paths.length > 0) {
    await supabase.storage.from("wine-photos").remove(paths);
  }

  return NextResponse.json({ success: true });
}

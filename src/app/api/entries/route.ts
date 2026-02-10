import { NextResponse } from "next/server";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  ACIDITY_LEVELS,
  ALCOHOL_LEVELS,
  BODY_LEVELS,
  SWEETNESS_LEVELS,
  TANNIN_LEVELS,
  normalizeAdvancedNotes,
} from "@/lib/advancedNotes";
import {
  PRICE_PAID_SOURCE_VALUES,
  QPR_LEVEL_VALUES,
} from "@/lib/entryMeta";

const privacyLevelSchema = z.enum(["public", "friends", "private"]);
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
  z.number().min(0).max(100000).optional()
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
  rating: z.number().int().min(1).max(100).optional(),
  price_paid: optionalPricePaidSchema,
  price_paid_source: z
    .preprocess((value) => (value === "" ? null : value), pricePaidSourceSchema.nullable().optional()),
  qpr_level: z.preprocess((value) => (value === "" ? null : value), qprLevelSchema.nullable().optional()),
  notes: nullableString,
  advanced_notes: advancedNotesSchema,
  location_text: nullableString,
  consumed_at: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  tasted_with_user_ids: z.array(z.string().uuid()).optional(),
  entry_privacy: privacyLevelSchema.optional(),
  label_photo_privacy: privacyLevelSchema.nullable().optional(),
  place_photo_privacy: privacyLevelSchema.nullable().optional(),
}).superRefine((data, ctx) => {
  const hasPrice = data.price_paid !== undefined;
  const hasPriceSource =
    data.price_paid_source !== undefined && data.price_paid_source !== null;

  if (hasPrice && !hasPriceSource) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Select retail or restaurant when entering price paid.",
      path: ["price_paid_source"],
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

export async function GET(request: Request) {
  const supabase = await createSupabaseServerClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(request.url);
  const cursor = url.searchParams.get("cursor"); // created_at (ISO)
  const rawLimit = Number(url.searchParams.get("limit") ?? "");
  const limit = Number.isFinite(rawLimit) && rawLimit > 0 ? Math.min(100, Math.max(1, rawLimit)) : 50;

  const selectFields =
    "id, user_id, wine_name, producer, vintage, country, region, appellation, rating, price_paid, price_paid_source, qpr_level, consumed_at, tasted_with_user_ids, label_image_path, created_at";

  let query = supabase
    .from("wine_entries")
    .select(selectFields)
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  if (cursor) {
    query = query.lt("created_at", cursor);
  }

  const { data, error } = await query.limit(limit + 1);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const pageRows = data && data.length > limit ? data.slice(0, limit) : (data ?? []);
  const has_more = (data?.length ?? 0) > limit;
  const next_cursor = has_more ? pageRows[pageRows.length - 1]?.created_at ?? null : null;

  const entryIds = pageRows.map((entry) => entry.id);
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

  const entries = pageRows.map((entry) => {
    const labelPath = labelPathByEntryId.get(entry.id) ?? null;
    return {
      ...entry,
      label_image_url: labelPath ? signedUrlByPath.get(labelPath) ?? null : null,
      // Not used by /entries list UI; avoid extra signing work
      place_image_url: null,
      pairing_image_url: null,
    };
  });

  return NextResponse.json({ entries, next_cursor, has_more });
}

export async function POST(request: Request) {
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

  const payload = createEntrySchema.safeParse(body);
  if (!payload.success) {
    return NextResponse.json(
      { error: payload.error.flatten() },
      { status: 400 }
    );
  }

  const consumedAt =
    payload.data.consumed_at ?? new Date().toISOString().slice(0, 10);

  const { data: profile } = await supabase
    .from("profiles")
    .select("default_entry_privacy")
    .eq("id", user.id)
    .maybeSingle();

  const entryPrivacy = payload.data.entry_privacy ??
    profile?.default_entry_privacy ??
    "public";
  const labelPhotoPrivacy =
    payload.data.label_photo_privacy ?? null;
  const placePhotoPrivacy =
    payload.data.place_photo_privacy ?? null;
  const advancedNotes = normalizeAdvancedNotes(payload.data.advanced_notes);

  const { data, error } = await supabase
    .from("wine_entries")
    .insert({
      user_id: user.id,
      wine_name: payload.data.wine_name ?? null,
      producer: payload.data.producer ?? null,
      vintage: payload.data.vintage ?? null,
      country: payload.data.country ?? null,
      region: payload.data.region ?? null,
      appellation: payload.data.appellation ?? null,
      rating: payload.data.rating ?? null,
      price_paid: payload.data.price_paid ?? null,
      price_paid_source: payload.data.price_paid_source ?? null,
      qpr_level: payload.data.qpr_level ?? null,
      notes: payload.data.notes ?? null,
      advanced_notes: advancedNotes,
      location_text: payload.data.location_text ?? null,
      consumed_at: consumedAt,
      tasted_with_user_ids: payload.data.tasted_with_user_ids ?? [],
      label_image_path: null,
      place_image_path: null,
      pairing_image_path: null,
      entry_privacy: entryPrivacy,
      label_photo_privacy: labelPhotoPrivacy,
      place_photo_privacy: placePhotoPrivacy,
    })
    .select("*")
    .single();

  if (error) {
    if (error.message.includes("advanced_notes")) {
      return NextResponse.json(
        {
          error:
            "Advanced notes are not available yet. Run supabase/sql/013_advanced_notes.sql and try again.",
        },
        { status: 500 }
      );
    }
    if (error.message.includes("wine_entries_price_source_requires_price_check")) {
      return NextResponse.json(
        {
          error:
            "Price paid and source must be set together. Select retail or restaurant when entering a price.",
        },
        { status: 400 }
      );
    }
    if (
      error.message.includes("price_paid") ||
      error.message.includes("price_paid_source") ||
      error.message.includes("qpr_level")
    ) {
      return NextResponse.json(
        {
          error:
            "Entry pricing and QPR fields are not available yet. Run supabase/sql/016_entry_pricing_qpr.sql and try again.",
        },
        { status: 500 }
      );
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ entry: data });
}

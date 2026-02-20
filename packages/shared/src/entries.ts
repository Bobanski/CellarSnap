import { z } from "zod";

export type PrivacyLevel = "public" | "friends_of_friends" | "friends" | "private";
export const PRIVACY_LEVEL_VALUES = [
  "public",
  "friends_of_friends",
  "friends",
  "private",
] as const;
export const PRIVACY_LEVEL_LABELS: Record<PrivacyLevel, string> = {
  public: "Public",
  friends_of_friends: "Friends of friends",
  friends: "Friends only",
  private: "Private",
};

export type PricePaidSource = "retail" | "restaurant";
export const PRICE_PAID_SOURCE_VALUES = ["retail", "restaurant"] as const;
export const PRICE_PAID_SOURCE_LABELS: Record<PricePaidSource, string> = {
  retail: "Retail",
  restaurant: "Restaurant",
};

export type PricePaidCurrency = "usd" | "eur" | "gbp" | "chf" | "aud" | "mxn";
export const PRICE_PAID_CURRENCY_VALUES = [
  "usd",
  "eur",
  "gbp",
  "chf",
  "aud",
  "mxn",
] as const;
export const PRICE_PAID_CURRENCY_LABELS: Record<PricePaidCurrency, string> = {
  usd: "USD",
  eur: "EUR",
  gbp: "GBP",
  chf: "CHF",
  aud: "AUD",
  mxn: "MXN",
};

export type QprLevel =
  | "extortion"
  | "pricey"
  | "mid"
  | "good_value"
  | "absolute_steal";
export const QPR_LEVEL_VALUES = [
  "extortion",
  "pricey",
  "mid",
  "good_value",
  "absolute_steal",
] as const;
export const QPR_LEVEL_LABELS: Record<QprLevel, string> = {
  extortion: "Extortion",
  pricey: "Pricey",
  mid: "Spot on",
  good_value: "Good Value",
  absolute_steal: "Absolute Steal",
};

export type WineEntrySummary = {
  id: string;
  user_id: string;
  wine_name: string | null;
  producer: string | null;
  vintage: string | null;
  rating: number | null;
  consumed_at: string;
  created_at: string;
};

function toNullableString(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function getTodayLocalYmd(now = new Date()): string {
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function normalizePrivacyLevel(
  value: unknown,
  fallback: PrivacyLevel
): PrivacyLevel {
  return value === "public" ||
    value === "friends_of_friends" ||
    value === "friends" ||
    value === "private"
    ? value
    : fallback;
}

const nullableEnum = <T extends readonly [string, ...string[]]>(values: T) =>
  z.preprocess(
    (value) => {
      if (value === "" || value === undefined) {
        return null;
      }
      return value;
    },
    z.enum(values).nullable().optional()
  );

const requiredRatingSchema = z.preprocess(
  (value) => {
    if (value === null || value === undefined) {
      return value;
    }
    if (typeof value === "string") {
      const trimmed = value.trim();
      if (!trimmed) {
        return undefined;
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
);

const optionalPricePaidSchema = z.preprocess(
  (value) => {
    if (value === null || value === undefined || value === "") {
      return undefined;
    }
    if (typeof value === "string") {
      const trimmed = value.trim();
      if (!trimmed) {
        return undefined;
      }
      const parsed = Number(trimmed);
      return Number.isFinite(parsed) ? parsed : value;
    }
    return value;
  },
  z
    .number({ error: "Price paid must be numbers only (no symbols)." })
    .min(0, "Price paid must be a valid number.")
    .max(100000, "Price paid must be a valid number.")
    .optional()
);

export const createEntryInputSchema = z.object({
  wine_name: z.string().trim().min(1, "Wine name is required."),
  producer: z.string().optional().transform((value) => toNullableString(value)),
  vintage: z.string().optional().transform((value) => toNullableString(value)),
  country: z.string().optional().transform((value) => toNullableString(value)),
  region: z.string().optional().transform((value) => toNullableString(value)),
  appellation: z.string().optional().transform((value) => toNullableString(value)),
  classification: z.string().optional().transform((value) => toNullableString(value)),
  rating: requiredRatingSchema,
  price_paid: optionalPricePaidSchema,
  price_paid_currency: nullableEnum(PRICE_PAID_CURRENCY_VALUES),
  price_paid_source: nullableEnum(PRICE_PAID_SOURCE_VALUES),
  qpr_level: nullableEnum(QPR_LEVEL_VALUES),
  notes: z.string().optional().transform((value) => toNullableString(value)),
  location_text: z.string().optional().transform((value) => toNullableString(value)),
  location_place_id: z
    .string()
    .optional()
    .transform((value) => toNullableString(value)),
  consumed_at: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Consumed date must be YYYY-MM-DD.")
    .optional(),
  entry_privacy: z
    .preprocess(
      (value) => (value === "" ? undefined : value),
      z.enum(PRIVACY_LEVEL_VALUES).optional()
    )
    .optional(),
  reaction_privacy: z
    .preprocess(
      (value) => (value === "" ? undefined : value),
      z.enum(PRIVACY_LEVEL_VALUES).optional()
    )
    .optional(),
  comments_privacy: z
    .preprocess(
      (value) => (value === "" ? undefined : value),
      z.enum(PRIVACY_LEVEL_VALUES).optional()
    )
    .optional(),
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

export type CreateEntryInput = z.infer<typeof createEntryInputSchema>;

export function toWineEntryInsertPayload(
  input: CreateEntryInput,
  userId: string,
  defaults?: {
    entry_privacy?: PrivacyLevel;
    reaction_privacy?: PrivacyLevel;
    comments_privacy?: PrivacyLevel;
  }
): Record<string, unknown> {
  const entryPrivacy = normalizePrivacyLevel(
    input.entry_privacy,
    normalizePrivacyLevel(defaults?.entry_privacy, "public")
  );
  const reactionPrivacy = normalizePrivacyLevel(
    input.reaction_privacy,
    normalizePrivacyLevel(defaults?.reaction_privacy, "public")
  );
  const commentsPrivacy = normalizePrivacyLevel(
    input.comments_privacy,
    normalizePrivacyLevel(defaults?.comments_privacy, "friends_of_friends")
  );
  const normalizedPricePaid =
    typeof input.price_paid === "number"
      ? Number(input.price_paid.toFixed(2))
      : null;
  const hasPricePaid = normalizedPricePaid !== null;

  return {
    user_id: userId,
    wine_name: input.wine_name.trim(),
    producer: input.producer ?? null,
    vintage: input.vintage ?? null,
    country: input.country ?? null,
    region: input.region ?? null,
    appellation: input.appellation ?? null,
    classification: input.classification ?? null,
    rating: input.rating,
    price_paid: normalizedPricePaid,
    price_paid_currency: hasPricePaid ? input.price_paid_currency ?? null : null,
    price_paid_source: hasPricePaid ? input.price_paid_source ?? null : null,
    qpr_level: input.qpr_level ?? null,
    notes: input.notes ?? null,
    location_text: input.location_text ?? null,
    location_place_id: input.location_place_id ?? null,
    consumed_at: input.consumed_at ?? getTodayLocalYmd(),
    tasted_with_user_ids: [],
    entry_privacy: entryPrivacy,
    reaction_privacy: reactionPrivacy,
    comments_privacy: commentsPrivacy,
    comments_scope: "viewers",
    label_image_path: null,
    place_image_path: null,
    pairing_image_path: null,
  };
}

import { z } from "zod";
import {
  ACIDITY_LEVELS,
  ALCOHOL_LEVELS,
  BODY_LEVELS,
  SWEETNESS_LEVELS,
  TANNIN_LEVELS,
} from "@/lib/advancedNotes";
import {
  PRICE_PAID_CURRENCY_VALUES,
  PRICE_PAID_SOURCE_VALUES,
  QPR_LEVEL_VALUES,
} from "@/lib/entryMeta";

export const privacyLevelSchema = z.enum([
  "public",
  "friends_of_friends",
  "friends",
  "private",
]);

export const commentScopeSchema = z.enum(["viewers", "friends"]);

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

const requiredRatingSchema = z
  .number({ error: "Rating required." })
  .int("Rating must be a whole number (integer).")
  .min(1, "Rating must be between 1 and 100.")
  .max(100, "Rating must be between 1 and 100.");

const optionalRequiredRatingSchema = z.preprocess(
  (value) => {
    if (value === undefined || value === "") {
      return undefined;
    }
    return value;
  },
  requiredRatingSchema.optional()
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

export const createEntrySchema = z
  .object({
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
    price_paid_currency: nullableEnum(PRICE_PAID_CURRENCY_VALUES),
    price_paid_source: nullableEnum(PRICE_PAID_SOURCE_VALUES),
    qpr_level: nullableEnum(QPR_LEVEL_VALUES),
    notes: nullableString,
    advanced_notes: advancedNotesSchema,
    location_text: nullableString,
    location_place_id: nullableString,
    consumed_at: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    tasted_with_user_ids: z.array(z.string().uuid()).optional(),
    entry_privacy: privacyLevelSchema.optional(),
    reaction_privacy: privacyLevelSchema.optional(),
    comments_privacy: privacyLevelSchema.optional(),
    comments_scope: commentScopeSchema.optional(),
    label_photo_privacy: privacyLevelSchema.nullable().optional(),
    place_photo_privacy: privacyLevelSchema.nullable().optional(),
    is_feed_visible: z.boolean().optional(),
    skip_comparison_candidate: z.boolean().optional(),
  })
  .superRefine((data, ctx) => {
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

export const updateEntrySchema = z
  .object({
    wine_name: nullableString,
    producer: nullableString,
    vintage: nullableString,
    country: nullableString,
    region: nullableString,
    appellation: nullableString,
    classification: nullableString,
    primary_grape_ids: primaryGrapeIdsSchema,
    rating: optionalRequiredRatingSchema,
    price_paid: nullablePricePaidSchema,
    price_paid_currency: nullableEnum(PRICE_PAID_CURRENCY_VALUES),
    price_paid_source: nullableEnum(PRICE_PAID_SOURCE_VALUES),
    qpr_level: nullableEnum(QPR_LEVEL_VALUES),
    notes: nullableString,
    advanced_notes: advancedNotesSchema,
    location_text: nullableString,
    location_place_id: nullableString,
    consumed_at: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
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
  })
  .superRefine((data, ctx) => {
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

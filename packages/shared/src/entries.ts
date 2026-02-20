import { z } from "zod";

export type PrivacyLevel = "public" | "friends_of_friends" | "friends" | "private";

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

const ratingSchema = z.preprocess(
  (value) => {
    if (value === null || value === undefined || value === "") {
      return null;
    }
    if (typeof value === "string") {
      const trimmed = value.trim();
      if (!trimmed) {
        return null;
      }
      const parsed = Number(trimmed);
      return Number.isFinite(parsed) ? parsed : value;
    }
    return value;
  },
  z
    .number({ error: "Rating must be a number." })
    .int("Rating must be a whole number.")
    .min(1, "Rating must be between 1 and 100.")
    .max(100, "Rating must be between 1 and 100.")
    .nullable()
);

export const createEntryInputSchema = z.object({
  wine_name: z.string().trim().min(1, "Wine name is required."),
  producer: z.string().optional().transform((value) => toNullableString(value)),
  vintage: z.string().optional().transform((value) => toNullableString(value)),
  rating: ratingSchema.optional(),
  notes: z.string().optional().transform((value) => toNullableString(value)),
  consumed_at: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Consumed date must be YYYY-MM-DD.")
    .optional(),
});

export type CreateEntryInput = z.infer<typeof createEntryInputSchema>;

export function toWineEntryInsertPayload(
  input: CreateEntryInput,
  userId: string
): Record<string, unknown> {
  return {
    user_id: userId,
    wine_name: input.wine_name.trim(),
    producer: input.producer ?? null,
    vintage: input.vintage ?? null,
    rating: input.rating ?? null,
    notes: input.notes ?? null,
    consumed_at: input.consumed_at ?? getTodayLocalYmd(),
    tasted_with_user_ids: [],
  };
}

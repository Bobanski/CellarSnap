import { z } from 'zod';

// Raw expected values must survive unchanged: normalization breaks conflict checks.
const text = z.string().nullable();
const privacy = z.enum(['public', 'friends_of_friends', 'friends', 'private']);
const fields = z.object({
  wine_name: text, producer: text, vintage: text, country: text, region: text,
  appellation: text, classification: text,
  rating: z.number().int().min(1).max(100).nullable(),
  price_paid: z.number().min(0).max(100000).nullable(),
  price_paid_currency: text, price_paid_source: z.enum(['retail', 'restaurant']).nullable(),
  qpr_level: text, location_text: text, location_place_id: text,
  consumed_at: z.iso.date(), notes: text,
  tasted_with_user_ids: z.array(z.string().uuid()).nullable(),
  advanced_notes: z.record(z.string(), z.json()).nullable(), is_feed_visible: z.boolean(),
  wine_type: z.enum(['red', 'white', 'rose', 'sparkling', 'sweet', 'orange']).nullable(),
  entry_privacy: privacy, reaction_privacy: privacy, comments_privacy: privacy,
}).partial().strict();
const grapes = z.array(z.string().uuid()).max(3).refine(ids => new Set(ids).size === ids.length);
export const ownerEntryEditSchema = z.object({
  updates: fields,
  expected: z.record(z.string(), z.json()),
  grape_ids: grapes.optional(), expected_grape_ids: grapes.optional(),
}).strict().superRefine((value, ctx) => {
  if (JSON.stringify(Object.keys(value.updates).sort()) !== JSON.stringify(Object.keys(value.expected).sort()) ||
      (value.grape_ids === undefined) !== (value.expected_grape_ids === undefined)) {
    ctx.addIssue({ code: 'custom', message: 'Incomplete edit snapshot' });
  }
});
export type OwnerEntryEdit = z.infer<typeof ownerEntryEditSchema>;
export const ownerEntryEditReceiptSchema = z.object({
  entry_id: z.string().uuid(), viewer_user_id: z.string().uuid(), replayed: z.boolean(),
}).strict();

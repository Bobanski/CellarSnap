import { z } from 'zod';
import { QPR_LEVEL_VALUES } from './entries';

const nullableText = z.string().nullable();
const publicBand = z.enum(['Loved it', 'Really liked it', 'Liked it', 'Tried it']).nullable();
export const OWNER_LIBRARY_PAGE_SIZE = 100;
export const ownerLibraryEntrySchema = z.object({
  id: z.string().uuid(), user_id: z.string().uuid(),
  wine_name: nullableText, producer: nullableText, vintage: nullableText,
  country: nullableText, region: nullableText, appellation: nullableText,
  classification: nullableText, rating: z.number().int().min(1).max(100).nullable(),
  qpr_level: z.enum(QPR_LEVEL_VALUES).nullable(),
  consumed_at: z.string().date(), created_at: z.string().datetime({ offset: true }),
  label_image_path: nullableText, label_image_url: nullableText,
  primary_grapes: z.array(z.object({ id: z.string().uuid(), name: z.string(), position: z.number().int() })),
  entry_group_id: z.string().uuid().nullable(),
  entry_group: z.object({
    id: z.string().uuid(), mode: z.enum(['event', 'catch_up']), title: z.string(),
    event_type: nullableText, anchor_entry_id: z.string().uuid().nullable(),
  }).nullable(),
  group_slides: z.array(z.object({
    id: z.string().uuid(), type: z.string(), url: z.string(), entry_id: z.string().uuid().nullable(),
    label: z.string(), wine_name: nullableText, producer: nullableText, vintage: nullableText,
    country: nullableText, region: nullableText, appellation: nullableText,
    consumed_at: nullableText, created_at: nullableText, notes: nullableText,
    rating: z.null(), public_rating_label: publicBand, qpr_level: nullableText,
  })),
});
export const ownerLibraryPageSchema = z.object({
  viewer_user_id: z.string().uuid(),
  entries: z.array(ownerLibraryEntrySchema).max(OWNER_LIBRARY_PAGE_SIZE),
  next_cursor: z.string().min(1).max(512).nullable(),
  has_more: z.boolean(),
}).superRefine((page, ctx) => {
  if (page.has_more !== (page.next_cursor !== null) || (page.has_more && !page.entries.length)) {
    ctx.addIssue({ code: 'custom', message: 'Invalid pagination' });
  }
  if (page.entries.some(entry => entry.user_id !== page.viewer_user_id) ||
      new Set(page.entries.map(entry => entry.id)).size !== page.entries.length) {
    ctx.addIssue({ code: 'custom', message: 'Invalid owner library' });
  }
});
export type OwnerLibraryEntry = z.infer<typeof ownerLibraryEntrySchema>;
export type OwnerLibraryPage = z.infer<typeof ownerLibraryPageSchema>;

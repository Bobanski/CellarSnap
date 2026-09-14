import { getPublicRatingBandLabel } from '@shared';

/** The public feed transports enjoyment bands, never the private input score. */
export function projectPublicFeedRating<T extends { rating: number | null; public_rating_label?: string | null }>(entry: T) {
  return {
    ...entry,
    rating: null,
    public_rating_label: entry.public_rating_label ?? getPublicRatingBandLabel(entry.rating),
  };
}

/** Ownership is the authenticated viewer's, including entries on tagged profiles. */
export function projectEntryRatingForViewer<
  T extends { user_id: string; rating: number | null; public_rating_label?: string | null },
>(entry: T, viewerUserId: string) {
  return {
    ...projectPublicFeedRating(entry),
    rating: entry.user_id === viewerUserId ? entry.rating : null,
  };
}

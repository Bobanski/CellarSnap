import { getPublicRatingBandLabel } from '@shared';

/** The public feed transports enjoyment bands, never the private input score. */
export function projectPublicFeedRating<T extends { rating: number | null }>(entry: T) {
  return {
    ...entry,
    rating: null,
    public_rating_label: getPublicRatingBandLabel(entry.rating),
  };
}

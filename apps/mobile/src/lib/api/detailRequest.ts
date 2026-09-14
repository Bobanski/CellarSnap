import type { PrivacyLevel, QprLevel } from '../../../../../packages/shared/src/entries';
import { hasProjectedSlides, isOwnerRating, isPublicRatingLabel, isRecord, readProjected, type ProjectedReadDependencies } from './projectedRead';

export type MobileEntryDetail = {
  id: string;
  user_id: string;
  root_entry_id?: string | null;
  wine_name: string | null;
  producer: string | null;
  vintage: string | null;
  wine_type?: string | null;
  country: string | null;
  region: string | null;
  appellation: string | null;
  classification: string | null;
  canonical_region?: string | null;
  canonical_sub_region?: string | null;
  canonical_country?: string | null;
  rating: number | null;
  public_rating_label: string | null;
  price_paid: number | null;
  price_paid_currency: string | null;
  price_paid_source: "retail" | "restaurant" | null;
  qpr_level: QprLevel | null;
  notes: string | null;
  advanced_notes: Record<string, unknown> | null;
  location_text: string | null;
  location_place_id: string | null;
  consumed_at: string;
  tasted_with_user_ids: string[] | null;
  label_image_path: string | null;
  place_image_path: string | null;
  pairing_image_path: string | null;
  created_at: string;
  is_feed_visible: boolean;
  entry_group_id?: string | null;
  entry_privacy: PrivacyLevel;
  reaction_privacy?: PrivacyLevel | null;
  viewer_log_entry_id?: string | null;
  reaction_counts?: Record<string, number>;
  my_reactions?: string[];
  reaction_users?: Record<string, string[]>;
  comment_count?: number;
  can_react?: boolean;
  can_comment?: boolean;
};

type DetailPayload = { viewer_user_id: string; entry: MobileEntryDetail };
export function createDetailFetcher(dependencies: ProjectedReadDependencies) {
  return (entryId: string, viewerUserId: string) => readProjected(dependencies,
    `/api/entries/${encodeURIComponent(entryId)}`, (body): body is DetailPayload => {
      if (!isRecord(body) || body.viewer_user_id !== viewerUserId || !isRecord(body.entry)) return false;
      const entry = body.entry;
      return entry.id === entryId && typeof entry.user_id === 'string' &&
        isPublicRatingLabel(entry.public_rating_label) && hasProjectedSlides(entry) &&
        (entry.user_id === viewerUserId ? isOwnerRating(entry.rating) : entry.rating === null);
    });
}

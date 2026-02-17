import type { AdvancedNotes } from "@/lib/advancedNotes";
import type {
  PricePaidCurrency,
  PricePaidSource,
  QprLevel,
} from "@/lib/entryMeta";

export type PrivacyLevel = "public" | "friends_of_friends" | "friends" | "private";

export type UserSummary = {
  id: string;
  display_name: string | null;
  email: string | null;
};

export type EntryPhotoType =
  | "label"
  | "place"
  | "people"
  | "pairing"
  | "lineup"
  | "other_bottles";

export type EntryPhoto = {
  id: string;
  entry_id: string;
  type: EntryPhotoType;
  path: string;
  position: number;
  created_at: string;
  signed_url?: string | null;
};

export type PrimaryGrape = {
  id: string;
  name: string;
  position: number;
};

export type WineEntry = {
  id: string;
  user_id: string;
  wine_name: string | null;
  producer: string | null;
  vintage: string | null;
  country: string | null;
  region: string | null;
  appellation: string | null;
  classification: string | null;
  primary_grapes?: PrimaryGrape[];
  rating: number | null;
  price_paid: number | null;
  price_paid_currency: PricePaidCurrency | null;
  price_paid_source: PricePaidSource | null;
  qpr_level: QprLevel | null;
  notes: string | null;
  ai_notes_summary: string | null;
  advanced_notes: AdvancedNotes | null;
  location_text: string | null;
  location_place_id: string | null;
  consumed_at: string;
  tasted_with_user_ids: string[] | null;
  label_image_path: string | null;
  place_image_path: string | null;
  pairing_image_path: string | null;
  entry_privacy: PrivacyLevel;
  reaction_privacy: PrivacyLevel;
  comments_privacy: PrivacyLevel;
  label_photo_privacy: PrivacyLevel | null;
  place_photo_privacy: PrivacyLevel | null;
  created_at: string;
};

export type WineEntryWithUrls = WineEntry & {
  label_image_url: string | null;
  place_image_url: string | null;
  pairing_image_url: string | null;
  tasted_with_users?: UserSummary[];
};

export type WineEntryCreatePayload = {
  wine_name?: string | null;
  producer?: string | null;
  vintage?: string | null;
  country?: string | null;
  region?: string | null;
  appellation?: string | null;
  classification?: string | null;
  primary_grape_ids?: string[];
  rating?: number | null;
  price_paid?: number | null;
  price_paid_currency?: PricePaidCurrency | null;
  price_paid_source?: PricePaidSource | null;
  qpr_level?: QprLevel | null;
  notes?: string | null;
  advanced_notes?: AdvancedNotes | null;
  location_text?: string | null;
  location_place_id?: string | null;
  consumed_at?: string;
  tasted_with_user_ids?: string[];
  entry_privacy?: PrivacyLevel;
  reaction_privacy?: PrivacyLevel;
  comments_privacy?: PrivacyLevel;
  label_photo_privacy?: PrivacyLevel | null;
  place_photo_privacy?: PrivacyLevel | null;
};

export type WineEntryUpdatePayload = Partial<{
  wine_name: string | null;
  producer: string | null;
  vintage: string | null;
  country: string | null;
  region: string | null;
  appellation: string | null;
  classification: string | null;
  primary_grape_ids: string[];
  rating: number | null;
  price_paid: number | null;
  price_paid_currency: PricePaidCurrency | null;
  price_paid_source: PricePaidSource | null;
  qpr_level: QprLevel | null;
  notes: string | null;
  advanced_notes: AdvancedNotes | null;
  location_text: string | null;
  location_place_id: string | null;
  consumed_at: string;
  tasted_with_user_ids: string[];
  label_image_path: string | null;
  place_image_path: string | null;
  pairing_image_path: string | null;
  entry_privacy: PrivacyLevel;
  reaction_privacy: PrivacyLevel;
  comments_privacy: PrivacyLevel;
  label_photo_privacy: PrivacyLevel | null;
  place_photo_privacy: PrivacyLevel | null;
}>;

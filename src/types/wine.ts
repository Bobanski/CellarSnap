import type { AdvancedNotes } from "@/lib/advancedNotes";
import type {
  PricePaidCurrency,
  PricePaidSource,
  QprLevel,
} from "@/lib/entryMeta";
import type { PrivacyLevel } from "@shared";

export const WINE_TYPE_VALUES = [
  "red",
  "white",
  "rose",
  "sparkling",
  "sweet",
  "orange",
] as const;

export type WineType = (typeof WINE_TYPE_VALUES)[number];

export const WINE_TYPE_LABELS: Record<WineType, string> = {
  red: "Red",
  white: "White",
  rose: "Rosé",
  sparkling: "Sparkling",
  sweet: "Sweet",
  orange: "Orange",
};

export type { PrivacyLevel };

export type UserSummary = {
  id: string;
  display_name: string | null;
  email: string | null;
  avatar_url?: string | null;
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

export type EntryGroupMode = "event" | "catch_up";

export type EntryGroup = {
  id: string;
  mode: EntryGroupMode;
  title: string;
  event_type: string | null;
  anchor_entry_id: string | null;
};

export type GroupedEntrySlide = {
  id: string;
  type: EntryPhotoType;
  url: string;
  entry_id: string | null;
  label: string;
  wine_name: string | null;
  producer: string | null;
  vintage: string | null;
  country: string | null;
  region: string | null;
  appellation: string | null;
  consumed_at: string | null;
  created_at: string | null;
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
  wine_type: WineType | null;
  canonical_country?: string | null;
  canonical_region?: string | null;
  canonical_sub_region?: string | null;
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
  root_entry_id?: string | null;
  is_feed_visible?: boolean | null;
  entry_group_id?: string | null;
  created_at: string;
};

export type WineEntryWithUrls = WineEntry & {
  label_image_url: string | null;
  place_image_url: string | null;
  pairing_image_url: string | null;
  tasted_with_users?: UserSummary[];
  entry_group?: EntryGroup | null;
  group_slides?: GroupedEntrySlide[];
};

export type WineEntryCreatePayload = {
  wine_name?: string | null;
  producer?: string | null;
  vintage?: string | null;
  country?: string | null;
  region?: string | null;
  appellation?: string | null;
  classification?: string | null;
  wine_type?: WineType | null;
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
  entry_group_mode?: EntryGroupMode;
  entry_group_title?: string | null;
};

export type WineEntryUpdatePayload = Partial<{
  wine_name: string | null;
  producer: string | null;
  vintage: string | null;
  country: string | null;
  region: string | null;
  appellation: string | null;
  classification: string | null;
  wine_type: WineType | null;
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
  entry_group_mode: EntryGroupMode;
  entry_group_title: string | null;
  sync_group_consumed_at: boolean;
}>;

import type { AdvancedNotes } from "@/lib/advancedNotes";

export type PrivacyLevel = "public" | "friends" | "private";

export type UserSummary = {
  id: string;
  display_name: string | null;
  email: string | null;
};

export type EntryPhotoType = "label" | "place" | "pairing";

export type EntryPhoto = {
  id: string;
  entry_id: string;
  type: EntryPhotoType;
  path: string;
  position: number;
  created_at: string;
  signed_url?: string | null;
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
  rating: number | null;
  notes: string | null;
  advanced_notes: AdvancedNotes | null;
  location_text: string | null;
  consumed_at: string;
  tasted_with_user_ids: string[] | null;
  label_image_path: string | null;
  place_image_path: string | null;
  pairing_image_path: string | null;
  entry_privacy: PrivacyLevel;
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
  rating?: number | null;
  notes?: string | null;
  advanced_notes?: AdvancedNotes | null;
  location_text?: string | null;
  consumed_at?: string;
  tasted_with_user_ids?: string[];
  entry_privacy?: PrivacyLevel;
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
  rating: number | null;
  notes: string | null;
  advanced_notes: AdvancedNotes | null;
  location_text: string | null;
  consumed_at: string;
  tasted_with_user_ids: string[];
  label_image_path: string | null;
  place_image_path: string | null;
  pairing_image_path: string | null;
  entry_privacy: PrivacyLevel;
  label_photo_privacy: PrivacyLevel | null;
  place_photo_privacy: PrivacyLevel | null;
}>;

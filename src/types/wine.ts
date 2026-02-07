export type WineEntry = {
  id: string;
  user_id: string;
  wine_name: string | null;
  producer: string | null;
  vintage: string | null;
  region: string | null;
  rating: number;
  notes: string | null;
  location_text: string | null;
  consumed_at: string;
  label_image_path: string | null;
  place_image_path: string | null;
  created_at: string;
};

export type WineEntryWithUrls = WineEntry & {
  label_image_url: string | null;
  place_image_url: string | null;
};

export type WineEntryCreatePayload = {
  wine_name?: string | null;
  producer?: string | null;
  vintage?: string | null;
  region?: string | null;
  rating: number;
  notes?: string | null;
  location_text?: string | null;
  consumed_at?: string;
};

export type WineEntryUpdatePayload = Partial<{
  wine_name: string | null;
  producer: string | null;
  vintage: string | null;
  region: string | null;
  rating: number;
  notes: string | null;
  location_text: string | null;
  consumed_at: string;
  label_image_path: string | null;
  place_image_path: string | null;
}>;

export type FeedScope = "public" | "friends";
export type EntryPrivacy = "public" | "friends_of_friends" | "friends" | "private";
export type QprLevel = "extortion" | "pricey" | "mid" | "good_value" | "absolute_steal";
export type FeedPhotoType =
  | "label"
  | "place"
  | "people"
  | "pairing"
  | "lineup"
  | "other_bottles";

export type FeedEntryRow = {
  id: string;
  user_id: string;
  root_entry_id?: string | null;
  is_feed_visible?: boolean | null;
  drinking_now?: boolean | null;
  entry_group_id?: string | null;
  wine_name: string | null;
  producer: string | null;
  vintage: string | null;
  country: string | null;
  region: string | null;
  appellation: string | null;
  notes: string | null;
  consumed_at: string;
  rating: null;
  public_rating_label: string | null;
  qpr_level: QprLevel | null;
  tasted_with_user_ids: string[] | null;
  label_image_path: string | null;
  place_image_path: string | null;
  pairing_image_path: string | null;
  entry_privacy: EntryPrivacy;
  created_at: string;
};

export type EntryGroupMode = "event" | "catch_up";

export type FeedEntryGroup = {
  id: string;
  mode: EntryGroupMode;
  title: string;
  event_type: string | null;
};

export type FeedGroupSlide = {
  id: string;
  type: string;
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
  notes: string | null;
  rating: null;
  public_rating_label: string | null;
  qpr_level: string | null;
};

export type PrimaryGrape = {
  id: string;
  name: string;
  position: number;
};

export type FeedPhoto = {
  type: FeedPhotoType;
  url: string;
};

export type MobileFeedEntry = FeedEntryRow & {
  author_name: string;
  author_avatar_url: string | null;
  viewer_is_direct_friend: boolean;
  primary_grapes: PrimaryGrape[];
  photo_gallery: FeedPhoto[];
  tasted_with_users: Array<{
    id: string;
    display_name: string | null;
    email: string | null;
  }>;
  can_react: boolean;
  can_comment: boolean;
  comments_privacy: EntryPrivacy;
  my_reactions: string[];
  reaction_counts: Record<string, number>;
  reaction_users: Record<string, string[]>;
  comment_count: number;
  entry_group?: FeedEntryGroup | null;
  group_slides?: FeedGroupSlide[] | null;
};


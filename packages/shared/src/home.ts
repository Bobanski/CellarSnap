import type { PrivacyLevel, QprLevel } from "./entries";

export const HOME_RECENT_ENTRIES_LIMIT = 3;
export const HOME_CIRCLE_ENTRIES_LIMIT = 6;
export const HOME_PRIVACY_OPTION_VALUES = [
  "public",
  "friends_of_friends",
  "friends",
  "private",
] as const;

export const HOME_PRIVACY_OPTION_DESCRIPTIONS: Record<PrivacyLevel, string> = {
  public: "Visible to everyone",
  friends_of_friends: "Visible to friends and their friends",
  friends: "Visible only to accepted friends",
  private: "Visible only to you",
};

export const HOME_HEADER_COPY = {
  eyebrow: "FEED",
  firstTimeTitle: "Welcome to Cluster.",
  firstTimeSubtitle:
    "Your personal wine journal. Snap a label, log the moment, share with friends.",
  returningTitle: "What your people are drinking.",
  returningSubtitle: "What's happening in your wine world right now?",
} as const;

export const HOME_PRIVACY_ONBOARDING_COPY = {
  eyebrow: "Onboarding privacy check",
  title: "Confirm who should see new entries by default",
  subtitle: "You can still override visibility per entry at any time.",
  confirmLabel: "Confirm default privacy",
  savingLabel: "Saving...",
} as const;

export const HOME_ACTION_LABELS = {
  recordNewPour: "+ Record a new pour",
  scanUploadList: "Scan/Upload a list",
  viewMyLibrary: "View my library \u2192",
  viewFullFeed: "View full feed \u2192",
  findFriends: "Find friends",
  browsePublicFeed: "Browse the public feed ->",
} as const;

export const HOME_SECTION_LABELS = {
  recentFromYou: "Recent from you",
  fromYourCircle: "From your circle",
} as const;

export const HOME_EMPTY_STATE_COPY = {
  noRecentEntries: "No recent entries yet.",
  noFriendsFirstTime:
    "Cluster is better with friends. Add the people you drink with and see what they're enjoying.",
  noFriendsReturning: "You haven't added any friends yet.",
  noCirclePosts: "Your friends haven't posted anything yet. Check back soon!",
} as const;

export type HomeApiReactionCounts = Record<string, number>;
export type HomeApiReactionUsers = Record<string, string[]>;

export type HomeApiRecentEntry = {
  id: string;
  wine_name: string | null;
  producer: string | null;
  vintage: string | null;
  rating: number | null;
  qpr_level: QprLevel | null;
  consumed_at: string;
  created_at: string;
  drinking_now: boolean;
  tasted_with_names: string[];
  label_image_url: string | null;
  can_react: boolean;
  my_reactions: string[];
  reaction_counts: HomeApiReactionCounts;
  reaction_users: HomeApiReactionUsers;
};

export type HomeApiCircleEntry = HomeApiRecentEntry & {
  user_id: string;
  author_name: string;
  author_avatar_url: string | null;
};

export type HomeApiResponse = {
  firstName: string | null;
  displayName: string | null;
  defaultEntryPrivacy: PrivacyLevel;
  privacyConfirmedAt: string | null;
  totalEntryCount: number;
  friendCount: number;
  recentEntries: HomeApiRecentEntry[];
  circleEntries: HomeApiCircleEntry[];
  error?: string;
};

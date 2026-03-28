import { PRIVACY_LEVEL_LABELS, type PrivacyLevel } from "./entries";

export type ProfileNameDisplayPreference = "real_name" | "username";
export type ProfileFriendStatus =
  | "none"
  | "request_sent"
  | "request_received"
  | "friends";

export type ProfileBadgeDefinition = {
  id: string;
  name: string;
  symbol: string;
  threshold: number;
  orFilter?: string;
  ilike?: [string, string];
};

export const PROFILE_BADGE_DEFINITIONS: readonly ProfileBadgeDefinition[] = [
  {
    id: "burgundy_bitch",
    name: "Burgundy Bitch",
    symbol: "\u{1F451}",
    threshold: 10,
    orFilter: "region.ilike.%burgundy%,region.ilike.%bourgogne%",
  },
  {
    id: "california_king",
    name: "California King",
    symbol: "\u2600\uFE0F",
    threshold: 10,
    ilike: ["region", "%california%"],
  },
  {
    id: "bordeaux_hoe",
    name: "Bordeaux Hoe",
    symbol: "\u{1F3F0}",
    threshold: 10,
    ilike: ["region", "%bordeaux%"],
  },
  {
    id: "rioja_renegade",
    name: "Rioja Renegade",
    symbol: "\u{1F920}",
    threshold: 10,
    orFilter: "region.ilike.%rioja%,appellation.ilike.%rioja%",
  },
  {
    id: "sangiovese_savage",
    name: "Sangiovese Savage",
    symbol: "\u{1F43A}",
    threshold: 10,
    orFilter: "region.ilike.%chianti%,appellation.ilike.%chianti%",
  },
  {
    id: "rhone_rider",
    name: "Rhone Rider",
    symbol: "\u{1F3C7}",
    threshold: 10,
    orFilter: "region.ilike.%rhone%,region.ilike.%rh\u00F4ne%",
  },
  {
    id: "margaux_monarch",
    name: "Margaux Monarch",
    symbol: "\u{1F478}",
    threshold: 10,
    ilike: ["appellation", "%margaux%"],
  },
  {
    id: "chianti_connoisseur",
    name: "Chianti Connoisseur",
    symbol: "\u{1F377}",
    threshold: 10,
    orFilter: "region.ilike.%chianti%,appellation.ilike.%chianti%",
  },
  {
    id: "mosel_maniac",
    name: "Mosel Maniac",
    symbol: "\u{1F30A}",
    threshold: 10,
    ilike: ["region", "%mosel%"],
  },
  {
    id: "champagne_champion",
    name: "Champagne Champion",
    symbol: "\u{1F942}",
    threshold: 10,
    ilike: ["region", "%champagne%"],
  },
] as const;

export const PROFILE_PRIVACY_OPTIONS: ReadonlyArray<{
  value: PrivacyLevel;
  label: string;
}> = [
  { value: "public", label: PRIVACY_LEVEL_LABELS.public },
  {
    value: "friends_of_friends",
    label: PRIVACY_LEVEL_LABELS.friends_of_friends,
  },
  { value: "friends", label: PRIVACY_LEVEL_LABELS.friends },
  { value: "private", label: PRIVACY_LEVEL_LABELS.private },
];

export const PROFILE_NAME_DISPLAY_OPTIONS: ReadonlyArray<{
  value: ProfileNameDisplayPreference;
  label: string;
}> = [
  { value: "real_name", label: "Real name" },
  { value: "username", label: "Username" },
];

export const PROFILE_GALLERY_TAB_LABELS = {
  mine: "My wines",
  tagged: "Tagged",
  friends: "Friends",
} as const;

export const PROFILE_GALLERY_MESSAGES = {
  emptyEntries: "No entries yet.",
  emptyTagged: "No tagged entries yet.",
  loadingEntries: "Loading entries...",
  loadingTagged: "Loading tagged entries...",
  loadingFriends: "Loading friends...",
  searchingFriends: "Searching...",
  searchPlaceholder: "Search by username or name",
} as const;

export const PROFILE_SETTINGS_COPY = {
  title: "Settings",
  editProfileTitle: "Edit profile",
  memberSinceLabel: "Member since",
  saveProfileLabel: "Save profile",
  badgesTitle: "Badges",
  badgesDescription:
    "Earn badges by logging 10 wines from a specific region or style.",
  privacyTitle: "Privacy settings",
  privacyDescription:
    "Choose how your name appears across the app and set defaults for new posts, reactions, and comments.",
  nameUsedAcrossAppLabel: "Name used across app",
  nameUsedAcrossAppHint:
    "Real name uses your first name and last initial when available. Otherwise your username is shown.",
  postVisibilityLabel: "Post visibility",
  reactionsLabel: "Reactions",
  commentsLabel: "Comments",
  reactionsHint: "Reactions privacy controls who can see and react.",
  commentsHint: "Comments privacy controls who can see comments and comment.",
  passwordTitle: "Password",
  passwordDescription: "Update your account password.",
  changePasswordLabel: "Change password",
  updatePasswordLabel: "Update password",
  currentPasswordLabel: "Current password",
  currentPasswordPlaceholder: "Enter your current password",
  newPasswordLabel: "New password",
  newPasswordPlaceholder: "Minimum 8 characters",
  confirmPasswordLabel: "Confirm new password",
  confirmPasswordPlaceholder: "Re-enter new password",
  cancelLabel: "Cancel",
  deleteAccountTitle: "Delete account",
  deleteAccountLabel: "Delete account",
  friendsSectionTitle: "Your friends",
} as const;

export const PUBLIC_PROFILE_ENTRY_LIMIT = 10;

export const PUBLIC_PROFILE_COPY = {
  loadingProfile: "Loading profile...",
  profileNotFound: "Profile not found.",
  blockingUnavailable: "Blocking unavailable",
  blockedLabel: "Blocked",
  updatingLabel: "Updating...",
  unblockLabel: "Unblock",
  blockUserLabel: "Block user",
  removeFriendPrompt: "Remove friend?",
  removeFriendConfirmLabel: "Yes, remove",
  cancelLabel: "Cancel",
  friendsLabel: "Friends",
  removeLabel: "Remove",
  requestSentLabel: "Request sent",
  cancellingLabel: "Cancelling...",
  acceptFriendRequestLabel: "Accept friend request",
  acceptingLabel: "Accepting...",
  sendingLabel: "Sending...",
  addFriendLabel: "Add friend",
  blockedContentMessage: "This user's content is hidden while blocked.",
  noPhotoLabel: "No photo",
  untitledWineLabel: "Untitled wine",
  unknownProducerLabel: "Unknown producer",
  loggedByPrefix: "Logged by",
  seeAllEntriesLabel: "See all entries",
  showFewerEntriesLabel: "Show fewer entries",
  seeAllTaggedEntriesLabel: "See all entries tagged in",
  showFewerTaggedEntriesLabel: "Show fewer tagged entries",
} as const;

export function getPublicProfileEyebrow(isOwnProfile: boolean): string {
  return isOwnProfile ? "Your profile" : "Profile";
}

export function getPublicProfileSubtitle(isOwnProfile: boolean): string {
  return isOwnProfile
    ? "Wines you've logged and wines you've been tagged in."
    : "Wines they've logged and wines they've been tagged in.";
}

export function getPublicProfileUploadedTitle(isOwnProfile: boolean): string {
  return isOwnProfile ? "Wines you've uploaded" : "Wines they've uploaded";
}

export function getPublicProfileUploadedEmpty(isOwnProfile: boolean): string {
  return isOwnProfile
    ? "You haven't uploaded any wines yet."
    : "No wines uploaded yet.";
}

export function getPublicProfileTaggedTitle(isOwnProfile: boolean): string {
  return isOwnProfile ? "Tagged entries" : "Tagged in by others";
}

export function getPublicProfileTaggedEmpty(isOwnProfile: boolean): string {
  return isOwnProfile
    ? "You are not tagged in any entries yet."
    : "Not tagged in any entries yet.";
}

export function formatProfileMemberSince(dateString: string | null): string {
  if (!dateString) {
    return "Unknown";
  }

  const date = new Date(dateString);
  if (Number.isNaN(date.getTime())) {
    return "Unknown";
  }

  return date.toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
  });
}

export function getProfileBadgeRequirementText(badge: {
  id: string;
  threshold: number;
}) {
  const n = badge.threshold;
  switch (badge.id) {
    case "burgundy_bitch":
      return `Log ${n} wines from Burgundy (Bourgogne counts).`;
    case "california_king":
      return `Log ${n} wines from California.`;
    case "bordeaux_hoe":
      return `Log ${n} wines from Bordeaux.`;
    case "rioja_renegade":
      return `Log ${n} wines from Rioja.`;
    case "sangiovese_savage":
      return `Log ${n} wines from Chianti.`;
    case "rhone_rider":
      return `Log ${n} wines from the Rh\u00F4ne.`;
    case "margaux_monarch":
      return `Log ${n} wines from Margaux.`;
    case "chianti_connoisseur":
      return `Log ${n} wines from Chianti.`;
    case "mosel_maniac":
      return `Log ${n} wines from the Mosel.`;
    case "champagne_champion":
      return `Log ${n} wines from Champagne.`;
    default:
      return `Log ${n} qualifying wines to earn this badge.`;
  }
}

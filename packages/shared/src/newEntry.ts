import {
  PRIVACY_LEVEL_LABELS,
  PRIVACY_LEVEL_VALUES,
  type PrivacyLevel,
} from "./entries";
import { COLLECTIONS_COPY } from "./collections";

export type NewEntryUploadPhotoType =
  | "label"
  | "pairing"
  | "people"
  | "other_bottles"
  | "lineup"
  | "place";

export const NEW_ENTRY_HEADER_COPY = {
  eyebrow: "New entry",
  title: "Record a new pour.",
  subtitle: "Capture the bottle, the moment, the people.",
} as const;

export const NEW_ENTRY_UPLOAD_COPY = {
  label: "Upload images",
  hint: "upload photos of the wine and anything else from the night - pairing, people, place. we'll tag them",
  uploadImagesLabel: "Upload images",
  addImagesLabel: "Add images",
  currentPhotosLabel: "Current photos",
  waitingLabel: "Photos uploaded. Waiting for AI processing to complete...",
  rescanLabel: "Re-scan",
} as const;

export const NEW_ENTRY_DRINKING_NOW_COPY = {
  title: "Drinking Now",
  description:
    "Friends see a light blue glow on Home and Feed for 2.5 hours after you post this pour.",
} as const;

export const NEW_ENTRY_SINGLE_BOTTLE_COPY = {
  manualEntryCta: "Don't have a pic? Manually enter details",
  wineDetailsTitle: "Wine details",
  wineDetailsDescription: "Optional identity details for this bottle.",
  locationDateTitle: "Location & date",
  locationDateDescription: "Where and when this bottle was consumed.",
  tastedWithTitle: "Tasted with",
  tastedWithDescription: "Tag friends who were with you.",
  searchFriendsLabel: "Search friends",
  searchFriendsPlaceholder: "Search friends...",
  collectionsTitle: COLLECTIONS_COPY.sectionTitle,
  collectionsDescription: COLLECTIONS_COPY.fieldDescription,
  advancedNotesTitle: "Advanced notes",
  advancedNotesDescription: "Optional structure for deeper tasting notes.",
  visibilityTitle: "Visibility & interaction",
  visibilityDescription:
    "Set who can view the post, view/react to reactions, and view/comment on comments.",
  visibilityFootnote:
    "Privacy on reactions/comments controls both visibility and participation.",
  postVisibilityLabel: "Post visibility",
  reactionsLabel: "Reactions",
  commentsLabel: "Comments",
  saveEntryLabel: "Save entry",
  cancelLabel: "Cancel",
  qprLabel: "QPR (Quality : Price Ratio)",
} as const;

export const NEW_ENTRY_BULK_COPY = {
  lineupPreviewTitle: "Lineup preview",
  eventDetailsTitle: "Event details",
  groupThisBulkUploadTitle: "Group this bulk upload",
  eventNameLabel: "Event name",
  eventLocationLabel: "Event location",
  tastedWithLabel: "Tasted with",
  groupTitleLabel: "Group title",
  searchFriendsPlaceholder: "Search friends",
} as const;

export const NEW_ENTRY_PHOTO_TYPE_OPTIONS: ReadonlyArray<{
  value: NewEntryUploadPhotoType;
  label: string;
}> = [
  { value: "label", label: "Label" },
  { value: "pairing", label: "Pairing" },
  { value: "people", label: "People" },
  { value: "other_bottles", label: "Other bottles" },
  { value: "lineup", label: "Lineup" },
  { value: "place", label: "Place" },
];

export const NEW_ENTRY_PRIVACY_OPTIONS: ReadonlyArray<{
  value: PrivacyLevel;
  label: string;
}> = PRIVACY_LEVEL_VALUES.map((value) => ({
  value,
  label: PRIVACY_LEVEL_LABELS[value],
}));

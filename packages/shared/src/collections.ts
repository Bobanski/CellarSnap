export const MAX_COLLECTION_NAME_LENGTH = 80;

export type CollectionOption = {
  id: string;
  name: string;
};

export type EntryCollectionSummary = CollectionOption & {
  added_at: string;
};

export type UserCollectionSummary = CollectionOption & {
  created_at: string;
  updated_at: string;
  item_count: number;
  cover_image_url: string | null;
};

export type UserCollectionItemSummary = {
  id: string;
  entry_id: string;
  wine_name: string | null;
  producer: string | null;
  vintage: string | null;
  consumed_at: string | null;
  preview_image_url: string | null;
  label_image_url: string | null;
  added_at: string;
};

export const COLLECTIONS_COPY = {
  tabLabel: "My Collections",
  sectionTitle: "Collections",
  fieldDescription: "Save this wine to one or more personal collections.",
  fieldPlaceholder: "No collections selected",
  pickerTitle: "Collections",
  addNewLabel: "Add new collection",
  createActionLabel: "Create collection",
  saveActionLabel: "Save to collections",
  doneActionLabel: "Done",
  renameActionLabel: "Edit title",
  renameSaveActionLabel: "Save title",
  renameCancelActionLabel: "Cancel",
  changeCoverActionLabel: "Change thumbnail",
  choosePhotoActionLabel: "Choose photo",
  takePhotoActionLabel: "Take photo",
  deleteActionLabel: "Delete collection",
  deleteConfirmTitle: "Delete collection?",
  deleteConfirmBody:
    "This removes the collection and its saved references, but it will not delete any wine entries.",
  emptyTitle: "No collections yet",
  emptySubtitle: "Save wines from Feed or while logging a pour and they will show up here.",
  detailEmptyTitle: "Nothing saved yet",
  detailEmptySubtitle: "Add wines to this collection from Feed or the new-pour flow.",
} as const;

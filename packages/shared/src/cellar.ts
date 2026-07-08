/* ─── Cellar — shared types & constants ─── */

export type EntryStatus = "consumed" | "cellaring" | "events" | "collections";

export type BottleFormat = "375ml" | "750ml" | "1.5L" | "3L" | "5L" | "6L" | "other";

export const BOTTLE_FORMAT_OPTIONS: { value: BottleFormat; label: string }[] = [
  { value: "375ml", label: "Half (375ml)" },
  { value: "750ml", label: "Standard (750ml)" },
  { value: "1.5L", label: "Magnum (1.5L)" },
  { value: "3L", label: "Double Magnum (3L)" },
  { value: "5L", label: "Jeroboam (5L)" },
  { value: "6L", label: "Imperial (6L)" },
  { value: "other", label: "Other" },
];

export const CELLAR_TAB_LABELS = {
  // Brand guide: "You don't consume wine. You open it." — display label only,
  // the underlying data value/enum stays "consumed".
  consumed: "Opened",
  cellaring: "In My Cellar",
  events: "My Events",
  collections: "My Collections",
} as const;

export const CELLAR_COPY = {
  emptyTitle: "Your cellar is empty",
  emptySubtitle: "Add wines you're holding to track your collection.",
  addButton: "Add to cellar",
  drinkButton: "Drink this",
  allConsumed: "All consumed",
  eventsEmptyTitle: "No grouped events yet",
  eventsEmptySubtitle: "Create a grouped event post and it will show up here.",
  collectionsEmptyTitle: "No collections yet",
  collectionsEmptySubtitle:
    "Save wines from Feed or while logging a pour and they will show up here.",
  bottlesRemaining: (n: number) => `${n} bottle${n === 1 ? "" : "s"}`,
  addPhotosPrompt: "Add photos from the night to capture the moment",
} as const;

export type CellarEntry = {
  id: string;
  wine_name: string | null;
  producer: string | null;
  vintage: string | null;
  country: string | null;
  region: string | null;
  appellation: string | null;
  wine_type: string | null;
  cellar_quantity: number;
  bottle_format: BottleFormat | null;
  label_image_url: string | null;
  created_at: string;
  collections?: import("./collections").EntryCollectionSummary[];
};

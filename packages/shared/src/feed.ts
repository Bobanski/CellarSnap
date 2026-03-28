export const FEED_EYEBROW = "Feed";
export const FEED_TITLE = "What your people are drinking.";
export const FEED_SUBTITLE = "Discover what the community is enjoying.";
export const FEED_SCOPE_LABELS = {
  public: "Public feed",
  friends: "Friends only",
} as const;
export const FEED_EMPTY_STATE_MESSAGE = "No entries yet.";
export const FEED_LOAD_MORE_LABEL = "Load more";
export const FEED_REACTION_EMOJIS = [
  "\u{1F377}",
  "\u{1F525}",
  "\u2764\uFE0F",
  "\u{1F440}",
  "\u{1F91D}",
] as const;
export const FEED_PHOTO_TYPE_LABELS = {
  label: "Label",
  place: "Place",
  people: "People",
  pairing: "Pairing",
  lineup: "Lineup",
  other_bottles: "Other bottle",
} as const;
export const FEED_REPORT_REASON_OPTIONS = [
  { value: "spam", label: "Spam" },
  { value: "harassment", label: "Harassment" },
  { value: "hate", label: "Hate speech" },
  { value: "nudity", label: "Nudity" },
  { value: "misinfo", label: "False info" },
  { value: "other", label: "Other" },
] as const;

export type FeedReportReason = (typeof FEED_REPORT_REASON_OPTIONS)[number]["value"];

export const DEFAULT_FEED_REPORT_REASON: FeedReportReason =
  FEED_REPORT_REASON_OPTIONS[0].value;

type FeedPrimaryGrapeLike = {
  name: string;
  position: number;
};

type FeedMetaEntryLike = {
  wine_name?: string | null;
  producer?: string | null;
  vintage?: string | null;
  region?: string | null;
  country?: string | null;
  appellation?: string | null;
  primary_grapes?: readonly FeedPrimaryGrapeLike[] | FeedPrimaryGrapeLike[] | null;
};

function normalizeFeedMetaValue(value: string | null | undefined) {
  const trimmed = value?.trim() ?? "";
  return trimmed.length > 0 ? trimmed : null;
}

function toWordSet(value: string | null | undefined): Set<string> {
  const normalized = value?.toLowerCase() ?? "";
  const words = normalized.match(/[a-z0-9]+/g) ?? [];
  return new Set(words.filter((word) => word.length >= 2));
}

function shouldHideProducerInFeedTile(
  wineName: string | null | undefined,
  producer: string | null | undefined
) {
  const wineWords = toWordSet(wineName);
  const producerWords = toWordSet(producer);

  if (wineWords.size === 0 || producerWords.size === 0) {
    return false;
  }

  let sharedWordCount = 0;
  for (const word of producerWords) {
    if (!wineWords.has(word)) {
      continue;
    }
    sharedWordCount += 1;
    if (sharedWordCount >= 3) {
      return true;
    }
  }

  return false;
}

function getPrimaryVarietal(entry: FeedMetaEntryLike) {
  const grapes = Array.isArray(entry.primary_grapes) ? entry.primary_grapes : [];
  if (grapes.length === 0) {
    return null;
  }

  const sorted = [...grapes].sort((a, b) => a.position - b.position);
  for (const grape of sorted) {
    const value = normalizeFeedMetaValue(grape.name);
    if (value) {
      return value;
    }
  }

  return null;
}

export function buildFeedEntryMetaFields(entry: FeedMetaEntryLike) {
  const wineName = normalizeFeedMetaValue(entry.wine_name) ?? "";
  const producer = normalizeFeedMetaValue(entry.producer);
  const vintage = normalizeFeedMetaValue(entry.vintage);
  const region = normalizeFeedMetaValue(entry.region);
  const country = normalizeFeedMetaValue(entry.country);
  const appellation = normalizeFeedMetaValue(entry.appellation);
  const varietal = getPrimaryVarietal(entry);

  const hideProducer = shouldHideProducerInFeedTile(wineName, producer);
  const nonVintagePriority = [
    hideProducer ? null : producer,
    region,
    country,
    appellation,
    varietal,
  ];

  const fields: string[] = [];
  const firstField = nonVintagePriority.find((value): value is string => Boolean(value));
  if (firstField) {
    fields.push(firstField);
  }

  if (vintage && fields.length > 0) {
    fields.push(vintage);
  }

  if (fields.length < 2) {
    for (const value of nonVintagePriority) {
      if (!value || fields.includes(value)) {
        continue;
      }
      fields.push(value);
      if (fields.length >= 2) {
        break;
      }
    }
  }

  return fields.slice(0, 2);
}

export function getFeedDisplayRatingLabel(rating: number | null | undefined): string | null {
  if (typeof rating !== "number" || Number.isNaN(rating)) {
    return null;
  }

  const normalized = Math.max(0, Math.min(100, Math.round(rating)));
  return `${normalized}/100`;
}

export function getFeedEmptyStateMessage(
  selectedFriendName?: string | null,
  hasFriendFilter = false
) {
  if (!hasFriendFilter) {
    return FEED_EMPTY_STATE_MESSAGE;
  }

  const normalizedFriendName = selectedFriendName?.trim();
  return `No posts from ${normalizedFriendName || "this friend"} in this feed yet.`;
}

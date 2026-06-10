import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  View
} from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { Feather } from "@expo/vector-icons";
import {
  compareEntryChronology,
  createEntryLibraryGroupId,
  entryMatchesLibrarySearch,
  ENTRY_LIBRARY_GROUP_PREVIEW_COUNT,
  ENTRIES_LIBRARY_ACTION_LABELS,
  ENTRIES_LIBRARY_CONTROL_BUTTON_LABELS,
  ENTRIES_LIBRARY_FILTER_OPTIONS,
  ENTRIES_LIBRARY_GROUP_OPTIONS,
  ENTRIES_LIBRARY_HEADER,
  ENTRIES_LIBRARY_INPUT_PLACEHOLDERS,
  ENTRIES_LIBRARY_PANEL_LABELS,
  ENTRIES_LIBRARY_SORT_OPTIONS,
  ENTRIES_LIBRARY_STATS_LABELS,
  ENTRIES_LIBRARY_VIEW_OPTIONS,
  EVENT_TYPE_LABELS,
  getEntriesCollectionStats,
  getEntriesCountLabel,
  getEntriesEmptyStateMessage,
  getEntriesSortOrderOptions,
  getEntryLibraryGroupLabel,
  getEntryListDisplayRating,
  QPR_LEVEL_LABELS,
  shouldHideProducerInEntryTile,
  toEntryVintageNumber,
  CELLAR_TAB_LABELS,
  CELLAR_COPY,
  BOTTLE_FORMAT_OPTIONS,
  type CellarEntry,
  type EntryStatus,
  type EntryLibraryControlPanel as ControlPanel,
  type EntryLibraryFilterType as FilterType,
  type EntryLibraryGroupScheme as GroupScheme,
  type EntryLibrarySortBy as SortBy,
  type EntryLibrarySortOrder as SortOrder,
  type EntryLibraryViewMode as LibraryViewMode,
  type EventTypeValue,
  type EntryCollectionSummary,
  type QprLevel,
  type UserCollectionSummary,
  type WineEntrySummary,
} from "@cellarsnap/shared";
import {
  fetchEntryCollections,
  fetchUserCollections,
} from "@/src/lib/api/collections";
import { fetchCellarEntries, drinkFromCellar } from "@/src/lib/api/cellar";
import { AppTopBar } from "@/src/components/AppTopBar";
import { DoneTextInput } from "@/src/components/DoneTextInput";
import {
  resolveMobileGroupedPostData,
  type MobileEntryGroup,
  type MobileGroupedEntrySlide,
} from "@/src/lib/entries/groupedPosts";
import { resolveEntryLabelPhotos } from "@/src/lib/storage/entryLabels";
import { supabase } from "@/src/lib/supabase";
import { useAuth } from "@/src/providers/AuthProvider";
import { AppText } from "@/src/components/AppText";
import { colors } from "@/src/lib/theme";
import { fonts } from "@/src/lib/typography";

type PrimaryGrape = {
  id: string;
  name: string;
  position: number;
};

const VISIBLE_CELLAR_TABS: EntryStatus[] = ["consumed", "cellaring", "events"];
const COLLECTIONS_HEADER = {
  eyebrow: "Collections",
  title: "Your collections.",
} as const;

function normalizeRequestedEntryTab(
  value: string | string[] | undefined
): EntryStatus {
  const candidate = Array.isArray(value) ? value[0] : value;
  return candidate === "cellaring" ||
    candidate === "events" ||
    candidate === "collections"
    ? candidate
    : "consumed";
}
type EntryPrimaryGrapeRow = {
  entry_id: string;
  position: number;
  grape_varieties:
    | {
        id: string;
        name: string;
      }
    | {
        id: string;
        name: string;
      }[]
    | null;
};
type MobileEntryRow = WineEntrySummary & {
  label_image_path: string | null;
  country: string | null;
  region: string | null;
  appellation: string | null;
  classification: string | null;
  qpr_level: QprLevel | null;
  entry_group_id?: string | null;
};
type MobileEntry = WineEntrySummary & {
  label_image_path: string | null;
  label_image_url?: string | null;
  country: string | null;
  region: string | null;
  appellation: string | null;
  classification: string | null;
  primary_grapes?: PrimaryGrape[];
  qpr_level: QprLevel | null;
  entry_group_id?: string | null;
  entry_group?: MobileEntryGroup | null;
  group_slides?: MobileGroupedEntrySlide[] | null;
  collections?: EntryCollectionSummary[];
};

type EntryGroup = {
  id: string;
  label: string;
  entries: MobileEntry[];
};

type EventHistoryEntry = {
  id: string;
  wine_name: string | null;
  producer: string | null;
  vintage: string | null;
  country: string | null;
  region: string | null;
  appellation: string | null;
  label_image_url: string | null;
  consumed_at: string;
  created_at: string;
  entry_group_id: string;
  entry_group: MobileEntryGroup | null;
  group_slides: MobileGroupedEntrySlide[];
};

function CollectionListCard({ item }: { item: UserCollectionSummary }) {
  return (
    <Pressable
      style={styles.collectionCard}
      onPress={() => router.push(`/(app)/entries/collections/${item.id}`)}
    >
      <View style={styles.collectionCover}>
        {item.cover_image_url ? (
          <Image
            source={{ uri: item.cover_image_url }}
            style={styles.collectionCoverImage}
            resizeMode="cover"
          />
        ) : (
          <AppText style={styles.collectionCoverPlaceholder}>No cover</AppText>
        )}
      </View>

      <View style={styles.collectionCardCopy}>
        <AppText style={styles.collectionCardTitle}>{item.name}</AppText>
        <AppText style={styles.collectionCardSubtitle}>
          {item.item_count} wine{item.item_count === 1 ? "" : "s"}
        </AppText>
      </View>

      <Feather name="chevron-right" size={18} color={colors.textSecondary} />
    </Pressable>
  );
}

function formatConsumedDate(raw: string) {
  const date = new Date(`${raw}T00:00:00`);
  if (Number.isNaN(date.getTime())) return raw;
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function normalizeVariety(
  variety: EntryPrimaryGrapeRow["grape_varieties"]
): { id: string; name: string } | null {
  if (!variety) {
    return null;
  }
  if (Array.isArray(variety)) {
    return variety[0] ?? null;
  }
  return variety;
}

function getPrimaryCollectionLabel(collections?: EntryCollectionSummary[]) {
  if (!collections || collections.length === 0) {
    return null;
  }
  return collections.length > 1 ? `${collections[0]?.name ?? ""}...` : collections[0]?.name ?? null;
}

function Pill({
  label,
  active,
  onPress,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable onPress={onPress} style={[styles.pill, active ? styles.pillActive : null]}>
      <AppText style={[styles.pillText, active ? styles.pillTextActive : null]}>{label}</AppText>
    </Pressable>
  );
}

// Memoized row component — stable identity via id-based callbacks passed from parent
function EntryCard({ item, onPress }: { item: MobileEntry; onPress: (id: string) => void }) {
  const hideProducer = shouldHideProducerInEntryTile(item.wine_name, item.producer);
  const producer = hideProducer ? null : (item.producer?.trim() ?? null);
  const vintage = item.vintage?.trim() ?? null;
  const displayRating = getEntryListDisplayRating(item.rating);
  const collectionLabel = getPrimaryCollectionLabel(item.collections);
  return (
    <Pressable
      style={styles.entryCard}
      onPress={() => onPress(item.id)}
    >
      <View style={styles.photoBox}>
        {item.label_image_url ? (
          <Image source={{ uri: item.label_image_url }} style={styles.photoImage} resizeMode="cover" />
        ) : (
          <AppText style={styles.photoText}>No photo</AppText>
        )}
      </View>
      <View style={styles.entryMain}>
        <View style={styles.entryCopy}>
          <AppText style={styles.entryTitle}>{item.wine_name?.trim() || "Untitled wine"}</AppText>
          {producer || vintage ? (
            <AppText style={styles.entrySubtitle}>
              {producer ?? ""}
              {producer && vintage ? ` · ${vintage}` : vintage ?? ""}
            </AppText>
          ) : null}
          {collectionLabel ? (
            <AppText style={styles.collectionTag}>{collectionLabel}</AppText>
          ) : null}
        </View>
        <View style={styles.entryMeta}>
          <View style={styles.ratingStack}>
            {displayRating ? (
              <View style={styles.ratingWrap}>
                <AppText style={styles.ratingText}>{displayRating}</AppText>
              </View>
            ) : null}
            {item.qpr_level ? (
              <AppText style={[styles.qprTag, styles[`qpr_${item.qpr_level}` as keyof typeof styles]]}>
                {QPR_LEVEL_LABELS[item.qpr_level]}
              </AppText>
            ) : null}
          </View>
          <AppText style={styles.entryDate}>{formatConsumedDate(item.consumed_at)}</AppText>
        </View>
      </View>
    </Pressable>
  );
}
const MemoEntryCard = React.memo(EntryCard);

function getBottleFormatLabel(format: string | null): string | null {
  if (!format || format === "750ml") return null;
  const option = BOTTLE_FORMAT_OPTIONS.find((o) => o.value === format);
  return option ? option.label : format;
}

function CellarEntryCard({
  item,
  onDrink,
}: {
  item: CellarEntry;
  onDrink: (entry: CellarEntry) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const producer = item.producer?.trim() ?? null;
  const vintage = item.vintage?.trim() ?? null;
  const formatLabel = getBottleFormatLabel(item.bottle_format);
  const collectionLabel = getPrimaryCollectionLabel(item.collections);

  return (
    <Pressable
      style={styles.entryCard}
      onPress={() => setExpanded((prev) => !prev)}
    >
      <View style={styles.photoBox}>
        {item.label_image_url ? (
          <Image source={{ uri: item.label_image_url }} style={styles.photoImage} resizeMode="cover" />
        ) : (
          <AppText style={styles.photoText}>No photo</AppText>
        )}
      </View>
      <View style={styles.entryMain}>
        <View style={styles.entryCopy}>
          <AppText style={styles.entryTitle}>{item.wine_name?.trim() || "Untitled wine"}</AppText>
          {producer || vintage ? (
            <AppText style={styles.entrySubtitle}>
              {producer ?? ""}
              {producer && vintage ? ` · ${vintage}` : vintage ?? ""}
            </AppText>
          ) : null}
          {collectionLabel ? (
            <AppText style={styles.collectionTag}>{collectionLabel}</AppText>
          ) : null}
          <View style={styles.cellarMetaRow}>
            <View style={styles.quantityBadge}>
              <AppText style={styles.quantityBadgeText}>
                {CELLAR_COPY.bottlesRemaining(item.cellar_quantity)}
              </AppText>
            </View>
            {formatLabel ? (
              <AppText style={styles.cellarFormatText}>{formatLabel}</AppText>
            ) : null}
          </View>
          {expanded ? (
            <Pressable
              style={styles.drinkButton}
              onPress={() => onDrink(item)}
            >
              <AppText style={styles.drinkButtonText}>{CELLAR_COPY.drinkButton}</AppText>
            </Pressable>
          ) : null}
        </View>
      </View>
    </Pressable>
  );
}

function getGroupedModeLabel(group: MobileEntryGroup | null) {
  if (group?.event_type) {
    return EVENT_TYPE_LABELS[group.event_type as EventTypeValue] ?? "Event";
  }
  return group?.mode === "catch_up" ? "Catch-up" : "Event";
}

function getGroupedTitle(item: EventHistoryEntry) {
  const title = item.entry_group?.title?.trim() ?? "";
  if (title) {
    return title;
  }
  return getGroupedModeLabel(item.entry_group);
}

function buildGroupedSlideMeta(slide: MobileGroupedEntrySlide | null) {
  if (!slide) {
    return "";
  }

  return [
    slide.producer && slide.producer !== slide.wine_name ? slide.producer : null,
    slide.vintage,
    slide.appellation || slide.region,
    slide.country,
  ]
    .filter(Boolean)
    .slice(0, 3)
    .join(" · ");
}

function EventHistoryCard({ item }: { item: EventHistoryEntry }) {
  const [activeIndex, setActiveIndex] = useState(0);
  const [frameWidth, setFrameWidth] = useState(0);
  const slides = item.group_slides;
  const hasSlides = slides.length > 0;
  const hasMultipleSlides = slides.length > 1;
  const clampedIndex = hasSlides
    ? Math.max(0, Math.min(slides.length - 1, activeIndex))
    : 0;
  const activeSlide = hasSlides ? slides[clampedIndex] ?? slides[0] ?? null : null;
  const previewImageUrl = activeSlide?.url ?? item.label_image_url ?? null;
  const headline = activeSlide?.wine_name ?? activeSlide?.producer ?? item.wine_name ?? null;
  const headlineMeta = buildGroupedSlideMeta(activeSlide);
  const modeLabel = getGroupedModeLabel(item.entry_group);
  const title = getGroupedTitle(item);

  return (
    <View style={styles.eventCard}>
      <View style={styles.eventCardHeader}>
        <View style={styles.eventHeaderCopy}>
          <View style={styles.eventModeBadge}>
            <AppText style={styles.eventModeBadgeText}>{modeLabel}</AppText>
          </View>
          <AppText style={styles.eventCardTitle}>{title}</AppText>
          {item.entry_group?.event_type && item.entry_group.title?.trim() ? (
            <AppText style={styles.eventCardSubtitle}>
              {EVENT_TYPE_LABELS[item.entry_group.event_type as EventTypeValue] ?? "Event"}
            </AppText>
          ) : null}
        </View>
        <AppText style={styles.eventCardDate}>
          {formatConsumedDate(item.consumed_at)}
        </AppText>
      </View>

      <View
        style={styles.eventGalleryFrame}
        onLayout={(event) => {
          const nextWidth = event.nativeEvent.layout.width;
          if (nextWidth > 0 && Math.abs(nextWidth - frameWidth) > 0.5) {
            setFrameWidth(nextWidth);
          }
        }}
      >
        {previewImageUrl ? (
          hasMultipleSlides && frameWidth > 0 ? (
            <ScrollView
              horizontal
              snapToInterval={frameWidth}
              snapToAlignment="start"
              disableIntervalMomentum
              bounces={false}
              directionalLockEnabled
              nestedScrollEnabled
              overScrollMode="never"
              showsHorizontalScrollIndicator={false}
              decelerationRate="fast"
              scrollEventThrottle={16}
              contentContainerStyle={styles.eventGalleryTrack}
              onMomentumScrollEnd={(event) => {
                if (frameWidth <= 0) {
                  return;
                }
                const rawIndex = Math.round(event.nativeEvent.contentOffset.x / frameWidth);
                const nextIndex = Math.max(0, Math.min(slides.length - 1, rawIndex));
                setActiveIndex(nextIndex);
              }}
            >
              {slides.map((slide, slideIndex) => (
                <View
                  key={`${slide.id}-${slideIndex}`}
                  style={[styles.eventGallerySlide, { width: frameWidth }]}
                >
                  <Image
                    source={{ uri: slide.url }}
                    style={styles.eventGalleryImage}
                    resizeMode="cover"
                  />
                </View>
              ))}
            </ScrollView>
          ) : (
            <Image
              source={{ uri: previewImageUrl }}
              style={styles.eventGalleryImage}
              resizeMode="cover"
            />
          )
        ) : (
          <View style={styles.eventGalleryFallback}>
            <AppText style={styles.eventGalleryFallbackText}>No photos yet</AppText>
          </View>
        )}
      </View>

      {hasMultipleSlides ? (
        <View style={styles.eventDotRow}>
          {slides.map((_, dotIndex) => (
            <View
              key={`event-dot-${item.id}-${dotIndex}`}
              style={[
                styles.eventDot,
                dotIndex === clampedIndex ? styles.eventDotActive : null,
              ]}
            />
          ))}
        </View>
      ) : null}

      {headline ? (
        <View style={styles.eventPreviewCopy}>
          <AppText style={styles.eventPreviewTitle}>{headline}</AppText>
          {headlineMeta ? (
            <AppText style={styles.eventPreviewMeta}>{headlineMeta}</AppText>
          ) : null}
        </View>
      ) : null}

      <Pressable
        style={styles.eventOpenButton}
        onPress={() => router.push(`/(app)/entries/${item.id}`)}
      >
        <AppText style={styles.eventOpenButtonText}>Open details</AppText>
      </Pressable>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Helpers for enriching a batch of raw rows into MobileEntry[]
// ---------------------------------------------------------------------------

async function enrichPageRows(
  pageRows: MobileEntryRow[],
  existingGrapeMap: Map<string, PrimaryGrape[]>
): Promise<MobileEntry[]> {
  if (pageRows.length === 0) return [];

  const entryIds = pageRows.map((e) => e.id);

  // Fetch grapes for this page in parallel with label photos + grouped posts
  const [primaryGrapeRows, labelByEntryId, groupedPostByEntryId] = await Promise.all([
    supabase
      .from("entry_primary_grapes")
      .select("entry_id, position, grape_varieties(id, name)")
      .in("entry_id", entryIds)
      .order("position", { ascending: true })
      .then((res) => (res.error ? null : (res.data as EntryPrimaryGrapeRow[] | null))),
    resolveEntryLabelPhotos(pageRows, { supabaseClient: supabase }),
    resolveMobileGroupedPostData(pageRows, { supabaseClient: supabase }),
  ]);

  // Merge grapes from this page into the running map
  if (primaryGrapeRows) {
    primaryGrapeRows.forEach((row) => {
      const variety = normalizeVariety(row.grape_varieties);
      if (!variety) return;
      const current = existingGrapeMap.get(row.entry_id) ?? [];
      current.push({ id: variety.id, name: variety.name, position: row.position });
      existingGrapeMap.set(row.entry_id, current);
    });
  }

  return pageRows.map((entry) => {
    const groupedPost = groupedPostByEntryId.get(entry.id);
    return {
      ...entry,
      label_image_url: labelByEntryId.get(entry.id)?.signedUrl ?? null,
      primary_grapes: existingGrapeMap.get(entry.id) ?? [],
      entry_group_id: entry.entry_group_id ?? null,
      entry_group: groupedPost?.entry_group ?? null,
      group_slides: groupedPost?.group_slides ?? null,
    };
  });
}

async function attachCollectionMembershipsToItems<T extends { id: string }>(
  items: T[]
): Promise<Array<T & { collections?: EntryCollectionSummary[] }>> {
  if (items.length === 0) return items;
  const result = await fetchEntryCollections(items.map((item) => item.id));
  if (!result.ok) return items;
  return items.map((item) => ({
    ...item,
    collections: result.memberships[item.id] ?? [],
  }));
}

export default function EntriesScreen() {
  const { user } = useAuth();
  const params = useLocalSearchParams<{ tab?: string | string[] }>();
  const [activeTab, setActiveTab] = useState<EntryStatus>(() =>
    normalizeRequestedEntryTab(params.tab)
  );
  const [addMenuOpen, setAddMenuOpen] = useState(false);
  const [entries, setEntries] = useState<MobileEntry[]>([]);
  const [cellarEntries, setCellarEntries] = useState<CellarEntry[]>([]);
  const [collectionsList, setCollectionsList] = useState<UserCollectionSummary[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isCellarLoading, setIsCellarLoading] = useState(false);
  const [isCollectionsLoading, setIsCollectionsLoading] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isDrinking, setIsDrinking] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [sortBy, setSortBy] = useState<SortBy>("consumed_at");
  const [sortOrder, setSortOrder] = useState<SortOrder>("desc");
  const [filterType, setFilterType] = useState<FilterType>("");
  const [filterValue, setFilterValue] = useState("");
  const [filterMin, setFilterMin] = useState("");
  const [filterMax, setFilterMax] = useState("");
  const [libraryViewMode, setLibraryViewMode] = useState<LibraryViewMode>("all");
  const [groupScheme, setGroupScheme] = useState<GroupScheme>("region");
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({});
  const [activeControlPanel, setActiveControlPanel] = useState<ControlPanel>(null);
  const [isSearchOpen, setIsSearchOpen] = useState(false);

  // Generation counter — incremented on each fresh loadEntries call.
  // Background loops compare their captured generation against the ref; if
  // they differ the component has moved on and they bail out silently.
  const loadGenRef = useRef(0);

  const normalizedSearchQuery = searchQuery.trim().toLowerCase();
  const isCollectionsView = activeTab === "collections";
  const isSearchActive = normalizedSearchQuery.length > 0;
  const isRangeFilterActive =
    (filterType === "rating" || filterType === "vintage") && (filterMin !== "" || filterMax !== "");
  const isFilterActive = filterType === "country" ? filterValue !== "" : isRangeFilterActive;

  const uniqueCountries = useMemo(
    () => Array.from(new Set(entries.map((entry) => entry.country).filter((value): value is string => !!value))).sort(),
    [entries]
  );
  const stats = useMemo(() => getEntriesCollectionStats(entries), [entries]);

  const filteredEntries = useMemo(() => {
    if (!filterType) return entries;
    if (filterType === "country") {
      if (!filterValue) return entries;
      return entries.filter((entry) => entry.country === filterValue);
    }
    if (filterType === "rating" || filterType === "vintage") {
      if (!filterMin && !filterMax) return entries;
      const min = filterMin ? Number(filterMin) : -Infinity;
      const max = filterMax ? Number(filterMax) : Infinity;
      const rangeMin = Math.min(min, max);
      const rangeMax = Math.max(min, max);
      return entries.filter((entry) => {
        const value = filterType === "vintage" ? toEntryVintageNumber(entry.vintage) : entry.rating ?? null;
        if (value === null || Number.isNaN(value)) return false;
        return value >= rangeMin && value <= rangeMax;
      });
    }
    return entries;
  }, [entries, filterMax, filterMin, filterType, filterValue]);

  const searchedEntries = useMemo(
    () => (
      isSearchActive
        ? filteredEntries.filter((entry) => entryMatchesLibrarySearch(entry, normalizedSearchQuery))
        : filteredEntries
    ),
    [filteredEntries, isSearchActive, normalizedSearchQuery]
  );

  const sortedEntries = useMemo(() => {
    const copy = [...searchedEntries];
    const mult = sortOrder === "asc" ? 1 : -1;
    if (sortBy === "rating") {
      return copy.sort((left, right) => {
        const numericSort = (left.rating ?? -Infinity) - (right.rating ?? -Infinity);
        if (numericSort !== 0) {
          return mult * numericSort;
        }
        return mult * compareEntryChronology(left, right);
      });
    }
    if (sortBy === "vintage") {
      return copy.sort((left, right) => {
        const numericSort =
          (toEntryVintageNumber(left.vintage) ?? -Infinity) -
          (toEntryVintageNumber(right.vintage) ?? -Infinity);
        if (numericSort !== 0) {
          return mult * numericSort;
        }
        return mult * compareEntryChronology(left, right);
      });
    }
    return copy.sort((left, right) => mult * compareEntryChronology(left, right));
  }, [searchedEntries, sortBy, sortOrder]);

  const groupedEntries = useMemo<EntryGroup[]>(() => {
    if (libraryViewMode !== "grouped") return [];
    const groups = new Map<string, EntryGroup>();
    sortedEntries.forEach((entry) => {
      const label = getEntryLibraryGroupLabel(entry, groupScheme);
      const id = createEntryLibraryGroupId(groupScheme, label);
      const existing = groups.get(id);
      if (existing) existing.entries.push(entry);
      else groups.set(id, { id, label, entries: [entry] });
    });
    const sortedGroups = Array.from(groups.values());
    sortedGroups.sort((left, right) => {
      if (groupScheme === "vintage") {
        if (left.label === "Unknown vintage") return 1;
        if (right.label === "Unknown vintage") return -1;
        return right.label.localeCompare(left.label, undefined, { numeric: true });
      }
      const leftUnknown = left.label.startsWith("Unknown ");
      const rightUnknown = right.label.startsWith("Unknown ");
      if (leftUnknown !== rightUnknown) {
        return leftUnknown ? 1 : -1;
      }
      return left.label.localeCompare(right.label);
    });
    return sortedGroups;
  }, [groupScheme, libraryViewMode, sortedEntries]);

  const eventEntries = useMemo<EventHistoryEntry[]>(() => {
    const seenGroupIds = new Set<string>();

    return entries
      .filter((entry): entry is MobileEntry & { entry_group_id: string } => (
        typeof entry.entry_group_id === "string" && entry.entry_group_id.length > 0
      ))
      .filter((entry) => {
        if (seenGroupIds.has(entry.entry_group_id)) {
          return false;
        }
        seenGroupIds.add(entry.entry_group_id);
        return true;
      })
      .map((entry) => ({
        id: entry.id,
        wine_name: entry.wine_name,
        producer: entry.producer,
        vintage: entry.vintage,
        country: entry.country,
        region: entry.region,
        appellation: entry.appellation,
        label_image_url: entry.label_image_url ?? null,
        consumed_at: entry.consumed_at,
        created_at: entry.created_at,
        entry_group_id: entry.entry_group_id,
        entry_group: entry.entry_group ?? null,
        group_slides: entry.group_slides ?? [],
      }));
  }, [entries]);

  const attachCollectionMemberships = useCallback(
    async <T extends { id: string },>(
      items: T[]
    ): Promise<Array<T & { collections?: EntryCollectionSummary[] }>> => {
      return attachCollectionMembershipsToItems(items);
    },
    []
  );

  const loadCollections = useCallback(
    async (refresh = false) => {
      if (!user) {
        return;
      }

      if (refresh) {
        setIsRefreshing(true);
      } else {
        setIsCollectionsLoading(true);
      }
      setErrorMessage(null);

      const result = await fetchUserCollections();
      if (result.ok) {
        setCollectionsList(result.collections);
      } else {
        setErrorMessage(result.errorMessage);
      }

      setIsCollectionsLoading(false);
      if (refresh) {
        setIsRefreshing(false);
      }
    },
    [user]
  );

  const loadEntries = useCallback(
    async (refresh = false) => {
      if (!user) return;

      // Bump generation so any previous background loop knows to stop
      const gen = loadGenRef.current + 1;
      loadGenRef.current = gen;

      if (refresh) {
        setIsRefreshing(true);
        setEntries([]);
      } else {
        setIsLoading(true);
      }
      setErrorMessage(null);

      const grapeMap = new Map<string, PrimaryGrape[]>();
      const pageSize = 100;
      let start = 0;
      let firstPage = true;

      try {
        while (true) {
          // Bail if a newer load has started
          if (loadGenRef.current !== gen) return;

          const { data, error } = await supabase
            .from("wine_entries")
            .select("id, user_id, wine_name, producer, vintage, rating, consumed_at, created_at, label_image_path, country, region, appellation, classification, qpr_level, entry_group_id")
            .eq("user_id", user.id)
            .order("consumed_at", { ascending: false })
            .order("created_at", { ascending: false })
            .range(start, start + pageSize - 1);

          // Bail again after await
          if (loadGenRef.current !== gen) return;

          if (error) {
            setErrorMessage(error.message);
            break;
          }

          const pageRows = (data ?? []) as MobileEntryRow[];
          const isLastPage = pageRows.length < pageSize;

          if (pageRows.length > 0) {
            // Enrich this page (grapes + labels + grouped posts) in parallel
            const hydratedPage = await enrichPageRows(pageRows, grapeMap);

            // Bail after enrichment awaits
            if (loadGenRef.current !== gen) return;

            // Attach collection memberships per page
            const withCollections = await attachCollectionMembershipsToItems(hydratedPage);

            if (loadGenRef.current !== gen) return;

            if (firstPage) {
              // Replace spinner with real data
              setEntries(withCollections);
              setIsLoading(false);
              setIsRefreshing(false);
              firstPage = false;
            } else {
              // Append/merge subsequent pages — setEntries derives sortedEntries from
              // the full dataset so the sorted view recomputes correctly
              setEntries((prev) => {
                const existingIds = new Set(prev.map((e) => e.id));
                const newItems = withCollections.filter((e) => !existingIds.has(e.id));
                return newItems.length > 0 ? [...prev, ...newItems] : prev;
              });
            }
          } else if (firstPage) {
            // Empty dataset
            setEntries([]);
            setIsLoading(false);
            setIsRefreshing(false);
            firstPage = false;
          }

          if (isLastPage) break;
          start += pageSize;
        }
      } finally {
        // Ensure spinners always clear even if we returned early or threw
        if (loadGenRef.current === gen) {
          setIsLoading(false);
          setIsRefreshing(false);
        }
      }
    },
    [user]
  );

  const loadCellarEntries = useCallback(
    async (refresh = false) => {
      if (!user) return;
      if (!refresh) setIsCellarLoading(true);
      setErrorMessage(null);

      const result = await fetchCellarEntries();
      if (result.ok) {
        setCellarEntries(await attachCollectionMemberships(result.entries));
      } else {
        setErrorMessage(result.errorMessage);
      }
      setIsCellarLoading(false);
    },
    [attachCollectionMemberships, user]
  );

  const handleDrink = useCallback(
    async (entry: CellarEntry) => {
      if (isDrinking) return;
      Alert.alert(
        CELLAR_COPY.drinkButton,
        `Mark one bottle of ${entry.wine_name?.trim() || "this wine"} as consumed?`,
        [
          { text: "Cancel", style: "cancel" },
          {
            text: "Yes, drink it",
            onPress: async () => {
              setIsDrinking(true);
              const result = await drinkFromCellar(entry.id);
              setIsDrinking(false);
              if (result.ok) {
                void loadCellarEntries(true);
                router.push(`/(app)/entries/${result.consumedEntryId}`);
              } else {
                Alert.alert("Error", result.errorMessage);
              }
            },
          },
        ]
      );
    },
    [isDrinking, loadCellarEntries]
  );

  // Stable navigation callback passed to memoized row so the row prop never changes
  const handleEntryPress = useCallback((id: string) => {
    router.push(`/(app)/entries/${id}`);
  }, []);

  useEffect(() => {
    const timeoutId = setTimeout(() => {
      void loadEntries();
    }, 0);

    return () => clearTimeout(timeoutId);
  }, [loadEntries]);

  useEffect(() => {
    setActiveTab(normalizeRequestedEntryTab(params.tab));
  }, [params.tab]);

  useEffect(() => {
    if (activeTab === "cellaring") {
      void loadCellarEntries();
    } else if (activeTab === "collections") {
      void loadCollections();
    }
  }, [activeTab, loadCellarEntries, loadCollections]);

  const updateFilterType = (newFilterType: FilterType) => {
    setFilterType(newFilterType);
    setFilterValue("");
    setFilterMin("");
    setFilterMax("");
  };

  const clearSearch = () => {
    setSearchQuery("");
  };

  const toggleSearch = () => {
    setIsSearchOpen((current) => {
      const next = !current;
      if (!next) {
        clearSearch();
      }
      return next;
    });
  };
  const sortOrderOptions = getEntriesSortOrderOptions(sortBy);

  if (isLoading) {
    return (
      <View style={styles.loadingScreen}>
        <ActivityIndicator color={colors.grenache} />
      </View>
    );
  }

  // ---------------------------------------------------------------------------
  // Render helpers for FlatList
  // ---------------------------------------------------------------------------

  const renderConsumedListHeader = () => (
    <View style={styles.consumedHeaderWrap}>
      <AppTopBar />

      <View style={styles.header}>
        <AppText style={styles.eyebrow}>
          {ENTRIES_LIBRARY_HEADER.eyebrow}
        </AppText>
        <AppText style={styles.title}>
          {ENTRIES_LIBRARY_HEADER.title}
        </AppText>
      </View>

      <View style={styles.tabToggle}>
        {VISIBLE_CELLAR_TABS.map((tab) => (
          <Pressable
            key={tab}
            style={[
              styles.tabToggleBtn,
              activeTab === tab ? styles.tabToggleBtnActive : null,
            ]}
            onPress={() => setActiveTab(tab)}
          >
            <AppText
              style={[
                styles.tabToggleText,
                activeTab === tab ? styles.tabToggleTextActive : null,
              ]}
            >
              {CELLAR_TAB_LABELS[tab]}
            </AppText>
          </Pressable>
        ))}
      </View>

      <View style={styles.statsRow}>
        <View style={styles.statCard}>
          <AppText style={styles.statNumber}>{stats.totalEntries}</AppText>
          <AppText style={styles.statLabel}>{ENTRIES_LIBRARY_STATS_LABELS.totalEntries}</AppText>
        </View>
        <View style={styles.statCard}>
          <AppText style={styles.statNumber}>
            {stats.avgRating !== null ? stats.avgRating.toFixed(1) : "—"}
          </AppText>
          <AppText style={styles.statLabel}>{ENTRIES_LIBRARY_STATS_LABELS.avgRating}</AppText>
        </View>
        <View style={styles.statCard}>
          <AppText style={styles.statNumber}>{stats.uniqueCountries}</AppText>
          <AppText style={styles.statLabel}>{ENTRIES_LIBRARY_STATS_LABELS.countries}</AppText>
        </View>
      </View>

      <View style={styles.controls}>
        <View style={styles.controlButtons}>
          <Pressable onPress={() => setActiveControlPanel((v) => (v === "sort" ? null : "sort"))} style={[styles.controlBtn, activeControlPanel === "sort" && styles.controlBtnActive]}><AppText style={styles.controlBtnLabel}>{ENTRIES_LIBRARY_CONTROL_BUTTON_LABELS.sort}</AppText></Pressable>
          <Pressable onPress={() => setActiveControlPanel((v) => (v === "filter" ? null : "filter"))} style={[styles.controlBtn, activeControlPanel === "filter" && styles.controlBtnActive]}><AppText style={styles.controlBtnLabel}>{ENTRIES_LIBRARY_CONTROL_BUTTON_LABELS.filter}</AppText></Pressable>
          <Pressable onPress={() => setActiveControlPanel((v) => (v === "organize" ? null : "organize"))} style={[styles.controlBtn, activeControlPanel === "organize" && styles.controlBtnActive]}><AppText style={styles.controlBtnLabel}>{ENTRIES_LIBRARY_CONTROL_BUTTON_LABELS.organize}</AppText></Pressable>
          <Pressable
            style={[
              styles.searchToggleButton,
              isSearchOpen ? styles.searchToggleButtonActive : null,
            ]}
            onPress={toggleSearch}
            accessibilityRole="button"
            accessibilityLabel={isSearchOpen ? "Hide search" : "Show search"}
          >
            <Feather
              name="search"
              size={14}
              color={isSearchOpen ? colors.rose : colors.textSecondary}
            />
          </Pressable>
        </View>
        {isSearchOpen ? (
          <View style={styles.searchPanel}>
            <View style={styles.searchRow}>
              <DoneTextInput value={searchQuery} onChangeText={setSearchQuery} placeholder={ENTRIES_LIBRARY_INPUT_PLACEHOLDERS.search} placeholderTextColor={colors.textTertiary} style={styles.searchInput} autoCapitalize="none" autoCorrect={false} autoFocus />
              {isSearchActive ? <Pressable style={styles.secondaryBtn} onPress={clearSearch}><AppText style={styles.secondaryBtnText}>{ENTRIES_LIBRARY_ACTION_LABELS.clearSearch}</AppText></Pressable> : null}
            </View>
          </View>
        ) : null}

        {activeControlPanel === "sort" ? (
          <View style={styles.panel}>
            <AppText style={styles.panelLabel}>{ENTRIES_LIBRARY_PANEL_LABELS.sortBy}</AppText>
            <View style={styles.pills}>{ENTRIES_LIBRARY_SORT_OPTIONS.map((option) => <Pill key={option.value} label={option.label} active={sortBy === option.value} onPress={() => setSortBy(option.value)} />)}</View>
            <AppText style={styles.panelLabel}>{ENTRIES_LIBRARY_PANEL_LABELS.order}</AppText>
            <View style={styles.pills}>{sortOrderOptions.map((option) => <Pill key={option.value} label={option.label} active={sortOrder === option.value} onPress={() => setSortOrder(option.value)} />)}</View>
          </View>
        ) : null}

        {activeControlPanel === "filter" ? (
          <View style={styles.panel}>
            <AppText style={styles.panelLabel}>{ENTRIES_LIBRARY_PANEL_LABELS.filterBy}</AppText>
            <View style={styles.pills}>{ENTRIES_LIBRARY_FILTER_OPTIONS.map((option) => <Pill key={option.value || "none"} label={option.label} active={filterType === option.value} onPress={() => updateFilterType(option.value)} />)}</View>
            {filterType === "country" ? <View style={styles.pills}><Pill label={ENTRIES_LIBRARY_ACTION_LABELS.allCountries} active={filterValue === ""} onPress={() => setFilterValue("")} />{uniqueCountries.map((country) => <Pill key={country} label={country} active={filterValue === country} onPress={() => setFilterValue(country)} />)}</View> : null}
            {filterType === "rating" || filterType === "vintage" ? <View style={styles.rangeRow}><DoneTextInput value={filterMin} onChangeText={setFilterMin} placeholder={ENTRIES_LIBRARY_INPUT_PLACEHOLDERS.min} placeholderTextColor={colors.textTertiary} keyboardType="number-pad" style={styles.rangeInput} /><DoneTextInput value={filterMax} onChangeText={setFilterMax} placeholder={ENTRIES_LIBRARY_INPUT_PLACEHOLDERS.max} placeholderTextColor={colors.textTertiary} keyboardType="number-pad" style={styles.rangeInput} /></View> : null}
          </View>
        ) : null}

        {activeControlPanel === "organize" ? (
          <View style={styles.panel}>
            <AppText style={styles.panelLabel}>{ENTRIES_LIBRARY_PANEL_LABELS.libraryView}</AppText>
            <View style={styles.pills}>{ENTRIES_LIBRARY_VIEW_OPTIONS.map((option) => <Pill key={option.value} label={option.label} active={libraryViewMode === option.value} onPress={() => setLibraryViewMode(option.value)} />)}</View>
            {libraryViewMode === "grouped" ? <AppText style={styles.panelLabel}>{ENTRIES_LIBRARY_PANEL_LABELS.groupBy}</AppText> : null}
            {libraryViewMode === "grouped" ? <View style={styles.pills}>{ENTRIES_LIBRARY_GROUP_OPTIONS.map((option) => <Pill key={option.value} label={option.label} active={groupScheme === option.value} onPress={() => setGroupScheme(option.value)} />)}</View> : null}
          </View>
        ) : null}
        <AppText style={styles.countText}>{getEntriesCountLabel(sortedEntries.length)}</AppText>
      </View>

      {errorMessage ? <AppText style={styles.errorText}>{errorMessage}</AppText> : null}

      {/* Empty state or grouped view live in the header; flat-all mode is virtualized below */}
      {sortedEntries.length === 0 ? (
        <View style={styles.emptyCard}>
          <AppText style={styles.emptyText}>
            {getEntriesEmptyStateMessage({
              isSearchActive,
              isRangeFilterActive,
              isFilterActive,
            })}
          </AppText>
        </View>
      ) : libraryViewMode === "grouped" ? (
        <View style={styles.stack}>
          {groupedEntries.map((group) => {
            const expanded = Boolean(expandedGroups[group.id]);
            const visible = expanded ? group.entries : group.entries.slice(0, ENTRY_LIBRARY_GROUP_PREVIEW_COUNT);
            return (
              <View key={group.id} style={styles.groupCard}>
                <View style={styles.groupHeader}>
                  <View>
                    <AppText style={styles.groupTitle}>{group.label}</AppText>
                    <AppText style={styles.groupCount}>{getEntriesCountLabel(group.entries.length)}</AppText>
                  </View>
                  {group.entries.length > ENTRY_LIBRARY_GROUP_PREVIEW_COUNT ? <Pressable style={styles.secondaryBtn} onPress={() => setExpandedGroups((prev) => ({ ...prev, [group.id]: !prev[group.id] }))}><AppText style={styles.secondaryBtnText}>{expanded ? ENTRIES_LIBRARY_ACTION_LABELS.showLess : ENTRIES_LIBRARY_ACTION_LABELS.seeAll}</AppText></Pressable> : null}
                </View>
                <View style={styles.stack}>{visible.map((item) => <MemoEntryCard key={item.id} item={item} onPress={handleEntryPress} />)}</View>
              </View>
            );
          })}
        </View>
      ) : null /* flat-all rows rendered by FlatList below */}
    </View>
  );

  // ---------------------------------------------------------------------------
  // Non-consumed tabs and collections view rendered in a plain ScrollView
  // ---------------------------------------------------------------------------

  if (activeTab !== "consumed") {
    return (
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={styles.screen}
      >
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode={Platform.OS === "ios" ? "interactive" : "on-drag"}
          automaticallyAdjustKeyboardInsets
          refreshControl={
            <RefreshControl
              refreshing={isRefreshing}
              onRefresh={() => {
                if (activeTab === "cellaring") {
                  void loadCellarEntries(true);
                } else if (activeTab === "collections") {
                  void loadCollections(true);
                }
              }}
              tintColor={colors.grenache}
            />
          }
        >
          <AppTopBar />

          <View style={styles.header}>
            <AppText style={styles.eyebrow}>
              {isCollectionsView
                ? COLLECTIONS_HEADER.eyebrow
                : ENTRIES_LIBRARY_HEADER.eyebrow}
            </AppText>
            <AppText style={styles.title}>
              {isCollectionsView
                ? COLLECTIONS_HEADER.title
                : ENTRIES_LIBRARY_HEADER.title}
            </AppText>
          </View>

          {isCollectionsView ? null : (
            <View style={styles.tabToggle}>
              {VISIBLE_CELLAR_TABS.map((tab) => (
                <Pressable
                  key={tab}
                  style={[
                    styles.tabToggleBtn,
                    activeTab === tab ? styles.tabToggleBtnActive : null,
                  ]}
                  onPress={() => setActiveTab(tab)}
                >
                  <AppText
                    style={[
                      styles.tabToggleText,
                      activeTab === tab ? styles.tabToggleTextActive : null,
                    ]}
                  >
                    {CELLAR_TAB_LABELS[tab]}
                  </AppText>
                </Pressable>
              ))}
            </View>
          )}

          {activeTab === "cellaring" ? (
            isCellarLoading ? (
              <View style={styles.cellarLoadingWrap}>
                <ActivityIndicator color={colors.grenache} />
              </View>
            ) : errorMessage ? (
              <AppText style={styles.errorText}>{errorMessage}</AppText>
            ) : cellarEntries.length === 0 ? (
              <View style={styles.emptyCard}>
                <AppText style={styles.cellarEmptyTitle}>{CELLAR_COPY.emptyTitle}</AppText>
                <AppText style={styles.emptyText}>{CELLAR_COPY.emptySubtitle}</AppText>
                <Pressable
                  style={styles.addCellarButton}
                  onPress={() => setAddMenuOpen((v) => !v)}
                >
                  <AppText style={styles.addCellarButtonText}>{CELLAR_COPY.addButton}</AppText>
                </Pressable>
                {addMenuOpen && (
                  <View style={styles.addOptionsColumn}>
                    <Pressable
                      style={styles.addCellarSecondary}
                      onPress={() => router.push("/(app)/cellar-add")}
                    >
                      <Feather name="edit-3" size={13} color={colors.textPrimary} style={{ marginRight: 5 }} />
                      <AppText style={styles.addCellarSecondaryText}>Enter manually</AppText>
                    </Pressable>
                    <Pressable
                      style={styles.addCellarSecondary}
                      onPress={() => router.push("/(app)/entries/new")}
                    >
                      <Feather name="camera" size={13} color={colors.textPrimary} style={{ marginRight: 5 }} />
                      <AppText style={styles.addCellarSecondaryText}>Scan label(s)</AppText>
                    </Pressable>
                    <Pressable
                      style={styles.addCellarSecondary}
                      onPress={() => router.push("/(app)/cellar-import-ct")}
                    >
                      <Feather name="download" size={13} color={colors.textPrimary} style={{ marginRight: 5 }} />
                      <AppText style={styles.addCellarSecondaryText}>Import from CellarTracker</AppText>
                    </Pressable>
                    <Pressable style={styles.addCellarDisabled} disabled>
                      <AppText style={styles.addCellarDisabledText}>Upload CSV — use desktop</AppText>
                    </Pressable>
                  </View>
                )}
              </View>
            ) : (
              <View style={styles.stack}>
                <View style={styles.addOptionsColumn}>
                  <Pressable
                    style={styles.addCellarButton}
                    onPress={() => setAddMenuOpen((v) => !v)}
                  >
                    <Feather name="plus" size={14} color={colors.textOnAccent} style={{ marginRight: 5 }} />
                    <AppText style={styles.addCellarButtonText}>{CELLAR_COPY.addButton}</AppText>
                  </Pressable>
                  {addMenuOpen && (
                    <View style={styles.addOptionsRow}>
                      <Pressable
                        style={styles.addCellarSecondary}
                        onPress={() => router.push("/(app)/cellar-add")}
                      >
                        <Feather name="edit-3" size={13} color={colors.textPrimary} style={{ marginRight: 5 }} />
                        <AppText style={styles.addCellarSecondaryText}>Enter manually</AppText>
                      </Pressable>
                      <Pressable
                        style={styles.addCellarSecondary}
                        onPress={() => router.push("/(app)/entries/new")}
                      >
                        <Feather name="camera" size={13} color={colors.textPrimary} style={{ marginRight: 5 }} />
                        <AppText style={styles.addCellarSecondaryText}>Scan</AppText>
                      </Pressable>
                      <Pressable
                        style={styles.addCellarSecondary}
                        onPress={() => router.push("/(app)/cellar-import-ct")}
                      >
                        <Feather name="download" size={13} color={colors.textPrimary} style={{ marginRight: 5 }} />
                        <AppText style={styles.addCellarSecondaryText}>Import CT</AppText>
                      </Pressable>
                    </View>
                  )}
                </View>
                {cellarEntries.map((item) => (
                  <CellarEntryCard key={item.id} item={item} onDrink={handleDrink} />
                ))}
              </View>
            )
          ) : null}

          {activeTab === "events" ? (
            <>
              {errorMessage ? <AppText style={styles.errorText}>{errorMessage}</AppText> : null}

              {eventEntries.length === 0 ? (
                <View style={styles.emptyCard}>
                  <AppText style={styles.cellarEmptyTitle}>{CELLAR_COPY.eventsEmptyTitle}</AppText>
                  <AppText style={styles.emptyText}>{CELLAR_COPY.eventsEmptySubtitle}</AppText>
                </View>
              ) : (
                <View style={styles.stack}>
                  {eventEntries.map((item) => <EventHistoryCard key={item.entry_group_id} item={item} />)}
                </View>
              )}
            </>
          ) : null}

          {activeTab === "collections" ? (
            <>
              {isCollectionsLoading ? (
                <View style={styles.cellarLoadingWrap}>
                  <ActivityIndicator color={colors.grenache} />
                </View>
              ) : errorMessage ? (
                <AppText style={styles.errorText}>{errorMessage}</AppText>
              ) : collectionsList.length === 0 ? (
                <View style={styles.emptyCard}>
                  <AppText style={styles.cellarEmptyTitle}>{CELLAR_COPY.collectionsEmptyTitle}</AppText>
                  <AppText style={styles.emptyText}>{CELLAR_COPY.collectionsEmptySubtitle}</AppText>
                </View>
              ) : (
                <View style={styles.stack}>
                  {collectionsList.map((collection) => (
                    <CollectionListCard key={collection.id} item={collection} />
                  ))}
                </View>
              )}
            </>
          ) : null}
        </ScrollView>
      </KeyboardAvoidingView>
    );
  }

  // ---------------------------------------------------------------------------
  // Consumed tab — virtualized FlatList
  // ---------------------------------------------------------------------------

  // In grouped mode sortedEntries is rendered inside the header, so FlatList
  // data is empty (header does all the work). In flat-all mode the FlatList
  // renders the entries directly.
  const flatListData = libraryViewMode === "all" ? sortedEntries : [];

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      style={styles.screen}
    >
      <FlatList<MobileEntry>
        data={flatListData}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <MemoEntryCard item={item} onPress={handleEntryPress} />
        )}
        ListHeaderComponent={renderConsumedListHeader}
        contentContainerStyle={styles.flatListContent}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode={Platform.OS === "ios" ? "interactive" : "on-drag"}
        automaticallyAdjustKeyboardInsets
        ItemSeparatorComponent={() => <View style={styles.itemSeparator} />}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={() => void loadEntries(true)}
            tintColor={colors.grenache}
          />
        }
        removeClippedSubviews
        windowSize={5}
        maxToRenderPerBatch={10}
        initialNumToRender={8}
      />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.screenBg },
  loadingScreen: { flex: 1, backgroundColor: colors.screenBg, alignItems: "center", justifyContent: "center" },
  content: { paddingHorizontal: 18, paddingTop: 16, paddingBottom: 28, gap: 12 },
  flatListContent: { paddingHorizontal: 18, paddingBottom: 28 },
  consumedHeaderWrap: { gap: 12, paddingTop: 16, paddingBottom: 10 },
  itemSeparator: { height: 10 },
  secondaryBtn: { borderRadius: 999, borderWidth: 1, borderColor: colors.borderStrong, paddingHorizontal: 10, paddingVertical: 7 },
  secondaryBtnText: { color: colors.textPrimary, fontSize: 12, fontWeight: "700" },
  header: { gap: 6 },
  eyebrow: { color: colors.accentSecondary, fontSize: 9, fontWeight: "700", letterSpacing: 3, textTransform: "uppercase" },
  title: { color: colors.textPrimary, fontFamily: fonts.serif.light, fontSize: 28, lineHeight: 34 },
  subtitle: { color: colors.textSecondary, fontSize: 13, lineHeight: 18 },
  statsRow: { flexDirection: "row", gap: 10 },
  statCard: { flex: 1, backgroundColor: colors.surfacePrimary, borderRadius: 12, borderWidth: 1, borderColor: colors.border, paddingVertical: 12, alignItems: "center", gap: 4 },
  statNumber: { color: colors.textPrimary, fontFamily: fonts.serif.regular, fontSize: 24 },
  statLabel: { color: colors.textTertiary, fontSize: 8, fontWeight: "700", letterSpacing: 2, textTransform: "uppercase" },
  controls: { borderRadius: 16, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surfacePrimary, padding: 12, gap: 9 },
  controlButtons: { flexDirection: "row", gap: 8, flexWrap: "wrap", alignItems: "center" },
  controlBtn: { borderRadius: 999, borderWidth: 1, borderColor: colors.borderStrong, paddingHorizontal: 11, paddingVertical: 8 },
  controlBtnActive: { borderColor: "rgba(123,29,58,0.7)", backgroundColor: "rgba(123,29,58,0.15)" },
  controlBtnLabel: { color: colors.textPrimary, fontSize: 12, fontWeight: "700" },
  searchToggleButton: {
    width: 32,
    height: 32,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    backgroundColor: colors.surfacePrimary,
    alignItems: "center",
    justifyContent: "center",
  },
  searchToggleButtonActive: {
    borderColor: "rgba(123,29,58,0.7)",
    backgroundColor: "rgba(123,29,58,0.15)",
  },
  searchPanel: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfacePrimary,
    padding: 10,
    gap: 8,
  },
  searchRow: { flexDirection: "row", gap: 8, alignItems: "center" },
  searchInput: { flex: 1, minWidth: 0, borderRadius: 999, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.inputBg, color: colors.textPrimary, paddingHorizontal: 12, paddingVertical: 9, fontSize: 12 },
  panel: { borderRadius: 12, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surfacePrimary, padding: 10, gap: 8 },
  panelLabel: { color: colors.textSecondary, fontSize: 11, fontWeight: "700", letterSpacing: 1.3, textTransform: "uppercase" },
  pills: { flexDirection: "row", gap: 8, flexWrap: "wrap" },
  pill: { borderRadius: 999, borderWidth: 1, borderColor: colors.borderStrong, paddingHorizontal: 12, paddingVertical: 7 },
  pillActive: { borderColor: "rgba(123,29,58,0.7)", backgroundColor: "rgba(123,29,58,0.15)" },
  pillText: { color: colors.textSecondary, fontSize: 12, fontWeight: "700" },
  pillTextActive: { color: colors.rose },
  rangeRow: { flexDirection: "row", gap: 8 },
  rangeInput: { width: 96, borderRadius: 999, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.inputBg, color: colors.textPrimary, paddingHorizontal: 12, paddingVertical: 8, fontSize: 13 },
  countText: { color: colors.textSecondary, fontSize: 12 },
  errorText: { color: colors.error, fontSize: 13 },
  emptyCard: { borderRadius: 16, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surfacePrimary, paddingHorizontal: 16, paddingVertical: 14 },
  emptyText: { color: colors.textSecondary, fontSize: 14, lineHeight: 20 },
  stack: { gap: 10 },
  eventCard: {
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfacePrimary,
    padding: 14,
    gap: 12,
  },
  eventCardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 12,
  },
  eventHeaderCopy: {
    flex: 1,
    gap: 6,
  },
  eventModeBadge: {
    alignSelf: "flex-start",
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    backgroundColor: colors.surfaceTinted,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  eventModeBadgeText: {
    color: colors.textPrimary,
    fontSize: 10,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.6,
  },
  eventCardTitle: {
    color: colors.textPrimary,
    fontFamily: fonts.serif.light,
    fontSize: 22,
    lineHeight: 28,
  },
  eventCardSubtitle: {
    color: colors.textSecondary,
    fontSize: 12,
    lineHeight: 16,
  },
  eventCardDate: {
    color: colors.textSecondary,
    fontSize: 12,
    fontFamily: fonts.serif.italic,
    textAlign: "right",
  },
  eventGalleryFrame: {
    minHeight: 240,
    borderRadius: 16,
    overflow: "hidden",
    backgroundColor: colors.surfaceTinted,
  },
  eventGalleryTrack: {
    flexDirection: "row",
  },
  eventGallerySlide: {
    minHeight: 240,
  },
  eventGalleryImage: {
    width: "100%",
    height: 240,
  },
  eventGalleryFallback: {
    minHeight: 240,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 20,
  },
  eventGalleryFallbackText: {
    color: colors.textSecondary,
    fontSize: 13,
    textAlign: "center",
  },
  eventDotRow: {
    flexDirection: "row",
    justifyContent: "center",
    gap: 6,
    marginTop: -2,
  },
  eventDot: {
    width: 6,
    height: 6,
    borderRadius: 999,
    backgroundColor: colors.borderStrong,
  },
  eventDotActive: {
    backgroundColor: colors.accentSecondary,
  },
  eventPreviewCopy: {
    gap: 4,
  },
  eventPreviewTitle: {
    color: colors.textPrimary,
    fontSize: 17,
    fontWeight: "700",
    lineHeight: 22,
  },
  eventPreviewMeta: {
    color: colors.textSecondary,
    fontSize: 13,
    lineHeight: 18,
  },
  eventOpenButton: {
    alignSelf: "flex-start",
    borderRadius: 999,
    backgroundColor: colors.accentPrimary,
    paddingHorizontal: 16,
    paddingVertical: 9,
  },
  eventOpenButtonText: {
    color: colors.textOnAccent,
    fontSize: 12,
    fontWeight: "700",
  },
  groupCard: { borderRadius: 14, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surfacePrimary, padding: 10, gap: 8 },
  groupHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 },
  groupTitle: { color: colors.textPrimary, fontSize: 17, fontWeight: "700" },
  groupCount: { color: colors.textSecondary, fontSize: 11, marginTop: 2 },
  entryCard: { flexDirection: "row", gap: 16, borderRadius: 16, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surfacePrimary, padding: 16 },
  photoBox: { width: 108, height: 108, borderRadius: 16, backgroundColor: colors.surfacePrimary, alignItems: "center", justifyContent: "center", overflow: "hidden" },
  photoImage: { width: "100%", height: "100%" },
  photoText: { color: colors.textSecondary, fontSize: 11, textAlign: "center", paddingHorizontal: 6 },
  entryMain: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12, minWidth: 0 },
  entryCopy: { flex: 1, minWidth: 0, justifyContent: "center" },
  entryTitle: { color: colors.textPrimary, fontFamily: fonts.serif.light, fontSize: 19, lineHeight: 25 },
  entrySubtitle: { marginTop: 4, color: colors.textSecondary, fontSize: 12, lineHeight: 16 },
  collectionTag: {
    alignSelf: "flex-start",
    marginTop: 8,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    backgroundColor: colors.surfaceTinted,
    color: colors.accentSecondary,
    fontSize: 11,
    fontWeight: "700",
    overflow: "hidden",
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  ratingWrap: { flexDirection: "row", alignItems: "center", minWidth: 0 },
  ratingStack: { minWidth: 0, gap: 4, alignItems: "flex-end" },
  qprTag: { alignSelf: "flex-start", borderRadius: 999, borderWidth: 1, paddingHorizontal: 6, paddingVertical: 2, overflow: "hidden", fontSize: 8, fontWeight: "700", letterSpacing: 0.25, textTransform: "uppercase" },
  qpr_extortion: { borderColor: "rgba(192,57,43,0.4)", backgroundColor: "rgba(192,57,43,0.1)", color: colors.error },
  qpr_pricey: { borderColor: "rgba(192,57,43,0.4)", backgroundColor: "rgba(192,57,43,0.1)", color: colors.error },
  qpr_mid: { borderColor: "rgba(123,29,58,0.4)", backgroundColor: "rgba(123,29,58,0.1)", color: colors.rose },
  qpr_good_value: { borderColor: "rgba(45,125,70,0.4)", backgroundColor: "rgba(45,125,70,0.1)", color: colors.success },
  qpr_absolute_steal: { borderColor: "rgba(45,125,70,0.4)", backgroundColor: "rgba(45,125,70,0.1)", color: colors.success },
  entryMeta: { minWidth: 0, alignItems: "flex-end", justifyContent: "center", gap: 10 },
  ratingText: {
    color: colors.accentSecondary,
    fontSize: 14,
    fontWeight: "800",
    fontStyle: "italic",
    backgroundColor: colors.accentSoft,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    borderRadius: 6,
    overflow: "hidden",
    paddingHorizontal: 6,
    paddingVertical: 3,
  },
  entryDate: {
    color: colors.textSecondary,
    fontSize: 12,
    fontFamily: fonts.serif.italic,
    flexShrink: 0,
    textAlign: "right",
  },
  tabToggle: {
    flexDirection: "row",
    justifyContent: "center",
    gap: 8,
  },
  tabToggleBtn: {
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderWidth: 1,
    borderColor: "transparent",
  },
  tabToggleBtnActive: {
    backgroundColor: colors.surfacePrimary,
    borderColor: colors.borderStrong,
  },
  tabToggleText: {
    color: colors.textSecondary,
    fontSize: 13,
    fontWeight: "700",
  },
  tabToggleTextActive: {
    color: colors.textPrimary,
  },
  cellarLoadingWrap: {
    paddingVertical: 48,
    alignItems: "center",
    justifyContent: "center",
  },
  cellarEmptyTitle: {
    color: colors.textPrimary,
    fontFamily: fonts.serif.light,
    fontSize: 19,
    lineHeight: 25,
    marginBottom: 4,
  },
  cellarMetaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 6,
  },
  quantityBadge: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    backgroundColor: colors.accentSoft,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  quantityBadgeText: {
    color: colors.accentSecondary,
    fontSize: 11,
    fontWeight: "700",
  },
  cellarFormatText: {
    color: colors.textTertiary,
    fontSize: 11,
  },
  drinkButton: {
    marginTop: 10,
    borderRadius: 999,
    backgroundColor: colors.accentPrimary,
    paddingHorizontal: 16,
    paddingVertical: 9,
    alignSelf: "flex-start",
  },
  drinkButtonText: {
    color: colors.textOnAccent,
    fontSize: 13,
    fontWeight: "700",
  },
  addOptionsColumn: {
    alignItems: "center",
    gap: 8,
  },
  addOptionsRow: {
    flexDirection: "row",
    gap: 8,
    flexWrap: "wrap",
    justifyContent: "center",
  },
  addCellarButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 999,
    backgroundColor: colors.accentPrimary,
    paddingHorizontal: 14,
    paddingVertical: 9,
  },
  addCellarButtonText: {
    color: colors.textOnAccent,
    fontSize: 12,
    fontWeight: "700",
  },
  addCellarSecondary: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    backgroundColor: colors.surfaceTinted,
    paddingHorizontal: 14,
    paddingVertical: 9,
  },
  addCellarSecondaryText: {
    color: colors.textPrimary,
    fontSize: 12,
    fontWeight: "700",
  },
  addCellarDisabled: {
    alignSelf: "flex-start",
    marginTop: 4,
    opacity: 0.5,
  },
  addCellarDisabledText: {
    color: colors.textTertiary,
    fontSize: 11,
  },
  collectionCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfacePrimary,
    padding: 16,
  },
  collectionCover: {
    width: 88,
    height: 88,
    borderRadius: 16,
    overflow: "hidden",
    backgroundColor: colors.surfaceTinted,
    alignItems: "center",
    justifyContent: "center",
  },
  collectionCoverImage: {
    width: "100%",
    height: "100%",
  },
  collectionCoverPlaceholder: {
    color: colors.textSecondary,
    fontSize: 11,
    textAlign: "center",
    paddingHorizontal: 10,
  },
  collectionCardCopy: {
    flex: 1,
    gap: 4,
  },
  collectionCardTitle: {
    color: colors.textPrimary,
    fontFamily: fonts.serif.light,
    fontSize: 21,
    lineHeight: 27,
  },
  collectionCardSubtitle: {
    color: colors.textSecondary,
    fontSize: 13,
    lineHeight: 18,
  },
});

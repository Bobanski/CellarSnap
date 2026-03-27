import {
  useCallback,
  useEffect,
  useMemo,
  useState } from "react";
import {
  ActivityIndicator,
  Image,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  View
} from "react-native";
import { router } from "expo-router";
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
  getEntriesCollectionStats,
  getEntriesCountLabel,
  getEntriesEmptyStateMessage,
  getEntriesSortOrderOptions,
  getEntryLibraryGroupLabel,
  getEntryListDisplayRating,
  QPR_LEVEL_LABELS,
  shouldHideProducerInEntryTile,
  toEntryVintageNumber,
  type EntryLibraryControlPanel as ControlPanel,
  type EntryLibraryFilterType as FilterType,
  type EntryLibraryGroupScheme as GroupScheme,
  type EntryLibrarySortBy as SortBy,
  type EntryLibrarySortOrder as SortOrder,
  type EntryLibraryViewMode as LibraryViewMode,
  type QprLevel,
  type WineEntrySummary,
} from "@cellarsnap/shared";
import { AppTopBar } from "@/src/components/AppTopBar";
import { DoneTextInput } from "@/src/components/DoneTextInput";
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
type MobileEntry = WineEntrySummary & {
  label_image_path: string | null;
  label_image_url?: string | null;
  country: string | null;
  region: string | null;
  appellation: string | null;
  classification: string | null;
  primary_grapes?: PrimaryGrape[];
  qpr_level: QprLevel | null;
};

type EntryGroup = {
  id: string;
  label: string;
  entries: MobileEntry[];
};

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

function EntryCard({ item }: { item: MobileEntry }) {
  const hideProducer = shouldHideProducerInEntryTile(item.wine_name, item.producer);
  const producer = hideProducer ? null : (item.producer?.trim() ?? null);
  const vintage = item.vintage?.trim() ?? null;
  const displayRating = getEntryListDisplayRating(item.rating);
  return (
    <Pressable
      style={styles.entryCard}
      onPress={() => router.push(`/(app)/entries/${item.id}`)}
    >
      <View style={styles.photoBox}>
        {item.label_image_url ? (
          <Image source={{ uri: item.label_image_url }} style={styles.photoImage} resizeMode="cover" />
        ) : (
          <AppText style={styles.photoText}>No photo</AppText>
        )}
      </View>
      <View style={styles.entryMain}>
        <View>
          <AppText style={styles.entryTitle}>{item.wine_name?.trim() || "Untitled wine"}</AppText>
          {producer || vintage ? (
            <AppText style={styles.entrySubtitle}>
              {producer ?? ""}
              {producer && vintage ? ` · ${vintage}` : vintage ?? ""}
            </AppText>
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

export default function EntriesScreen() {
  const { user } = useAuth();
  const [entries, setEntries] = useState<MobileEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
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

  const normalizedSearchQuery = searchQuery.trim().toLowerCase();
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

  const loadEntries = useCallback(
    async (refresh = false) => {
      if (!user) return;
      if (refresh) {
        setIsRefreshing(true);
      } else {
        setIsLoading(true);
      }
      setErrorMessage(null);

      const { data, error } = await supabase
        .from("wine_entries")
        .select("id, user_id, wine_name, producer, vintage, rating, consumed_at, created_at, label_image_path, country, region, appellation, classification, qpr_level")
        .eq("user_id", user.id)
        .order("consumed_at", { ascending: false })
        .order("created_at", { ascending: false })
        .limit(100);

      if (error) {
        setErrorMessage(error.message);
      } else {
        const rows = (data ?? []) as MobileEntry[];
        const entryIds = rows.map((entry) => entry.id);
        const primaryGrapeMap = new Map<string, PrimaryGrape[]>();

        if (entryIds.length > 0) {
          const { data: primaryGrapeRows, error: primaryGrapeError } = await supabase
            .from("entry_primary_grapes")
            .select("entry_id, position, grape_varieties(id, name)")
            .in("entry_id", entryIds)
            .order("position", { ascending: true });

          if (!primaryGrapeError && primaryGrapeRows) {
            (primaryGrapeRows as EntryPrimaryGrapeRow[]).forEach((row) => {
              const variety = normalizeVariety(row.grape_varieties);
              if (!variety) {
                return;
              }
              const current = primaryGrapeMap.get(row.entry_id) ?? [];
              current.push({
                id: variety.id,
                name: variety.name,
                position: row.position,
              });
              primaryGrapeMap.set(row.entry_id, current);
            });
          }
        }

        const labelByEntryId = await resolveEntryLabelPhotos(rows, {
          supabaseClient: supabase,
        });

        setEntries(
          rows.map((entry) => {
            return {
              ...entry,
              label_image_url: labelByEntryId.get(entry.id)?.signedUrl ?? null,
              primary_grapes: primaryGrapeMap.get(entry.id) ?? [],
            };
          })
        );
      }

      setIsLoading(false);
      setIsRefreshing(false);
    },
    [user]
  );

  useEffect(() => {
    const timeoutId = setTimeout(() => {
      void loadEntries();
    }, 0);

    return () => clearTimeout(timeoutId);
  }, [loadEntries]);

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

  return (
    <View style={styles.screen}>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={() => void loadEntries(true)} tintColor={colors.grenache} />}
      >
        <AppTopBar />

        <View style={styles.header}>
          <AppText style={styles.eyebrow}>{ENTRIES_LIBRARY_HEADER.eyebrow}</AppText>
          <AppText style={styles.title}>{ENTRIES_LIBRARY_HEADER.title}</AppText>
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
                  <View style={styles.stack}>{visible.map((item) => <EntryCard key={item.id} item={item} />)}</View>
                </View>
              );
            })}
          </View>
        ) : (
          <View style={styles.stack}>{sortedEntries.map((item) => <EntryCard key={item.id} item={item} />)}</View>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.screenBg },
  loadingScreen: { flex: 1, backgroundColor: colors.screenBg, alignItems: "center", justifyContent: "center" },
  content: { paddingHorizontal: 18, paddingTop: 16, paddingBottom: 28, gap: 12 },
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
  groupCard: { borderRadius: 14, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surfacePrimary, padding: 10, gap: 8 },
  groupHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 },
  groupTitle: { color: colors.textPrimary, fontSize: 17, fontWeight: "700" },
  groupCount: { color: colors.textSecondary, fontSize: 11, marginTop: 2 },
  entryCard: { flexDirection: "row", gap: 16, borderRadius: 16, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surfacePrimary, padding: 16 },
  photoBox: { width: 108, height: 108, borderRadius: 16, backgroundColor: colors.surfacePrimary, alignItems: "center", justifyContent: "center", overflow: "hidden" },
  photoImage: { width: "100%", height: "100%" },
  photoText: { color: colors.textSecondary, fontSize: 11, textAlign: "center", paddingHorizontal: 6 },
  entryMain: { flex: 1, justifyContent: "space-between", gap: 10 },
  entryTitle: { color: colors.textPrimary, fontFamily: fonts.serif.light, fontSize: 17, lineHeight: 22 },
  entrySubtitle: { marginTop: 4, color: colors.textSecondary, fontSize: 11, lineHeight: 15 },
  ratingWrap: { flexDirection: "row", alignItems: "center", minWidth: 0 },
  ratingStack: { flex: 1, minWidth: 0, gap: 4 },
  qprTag: { alignSelf: "flex-start", borderRadius: 999, borderWidth: 1, paddingHorizontal: 6, paddingVertical: 2, overflow: "hidden", fontSize: 8, fontWeight: "700", letterSpacing: 0.25, textTransform: "uppercase" },
  qpr_extortion: { borderColor: "rgba(192,57,43,0.4)", backgroundColor: "rgba(192,57,43,0.1)", color: colors.error },
  qpr_pricey: { borderColor: "rgba(192,57,43,0.4)", backgroundColor: "rgba(192,57,43,0.1)", color: colors.error },
  qpr_mid: { borderColor: "rgba(123,29,58,0.4)", backgroundColor: "rgba(123,29,58,0.1)", color: colors.rose },
  qpr_good_value: { borderColor: "rgba(45,125,70,0.4)", backgroundColor: "rgba(45,125,70,0.1)", color: colors.success },
  qpr_absolute_steal: { borderColor: "rgba(45,125,70,0.4)", backgroundColor: "rgba(45,125,70,0.1)", color: colors.success },
  entryMeta: { marginTop: 8, flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between", gap: 10 },
  ratingText: { color: colors.accentGold, fontSize: 13, fontWeight: "800", backgroundColor: "rgba(201,168,76,0.1)", borderRadius: 6, overflow: "hidden", paddingHorizontal: 6, paddingVertical: 3 },
  entryDate: { color: colors.textSecondary, fontSize: 13, flexShrink: 0, textAlign: "right" },
});

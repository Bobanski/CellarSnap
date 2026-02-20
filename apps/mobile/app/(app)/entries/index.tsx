import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Image,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import type { WineEntrySummary } from "@cellarsnap/shared";
import { AppTopBar } from "@/src/components/AppTopBar";
import { DoneTextInput } from "@/src/components/DoneTextInput";
import { supabase } from "@/src/lib/supabase";
import { useAuth } from "@/src/providers/AuthProvider";

type SortBy = "consumed_at" | "rating" | "vintage";
type SortOrder = "asc" | "desc";
type FilterType = "vintage" | "country" | "rating" | "";
type GroupScheme = "region" | "vintage" | "varietal";
type LibraryViewMode = "grouped" | "all";
type ControlPanel = "sort" | "filter" | "organize" | null;
type QprLevel = "extortion" | "pricey" | "mid" | "good_value" | "absolute_steal";
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
type EntryPhotoRow = {
  entry_id: string;
  path: string;
  position: number;
  created_at: string;
};

const QPR_LEVEL_LABELS: Record<QprLevel, string> = {
  extortion: "Extortion",
  pricey: "Pricey",
  mid: "Spot on",
  good_value: "Good Value",
  absolute_steal: "Absolute Steal",
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

const GROUP_PREVIEW_COUNT = 4;

function toWordSet(value: string | null | undefined): Set<string> {
  const normalized = value?.toLowerCase() ?? "";
  const words = normalized.match(/[a-z0-9]+/g) ?? [];
  return new Set(words.filter((word) => word.length >= 2));
}

function shouldHideProducerInEntryTile(
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

function formatConsumedDate(raw: string) {
  const date = new Date(`${raw}T00:00:00`);
  if (Number.isNaN(date.getTime())) return raw;
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function includesSearchValue(value: string | number | null | undefined, query: string) {
  if (value === null || value === undefined) return false;
  return String(value).toLowerCase().includes(query);
}

function toVintageNumber(value: string | null | undefined): number | null {
  if (!value) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeLabel(value: string | null | undefined, fallback: string) {
  const trimmed = value?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : fallback;
}

function getGroupLabel(entry: MobileEntry, scheme: GroupScheme) {
  if (scheme === "region") {
    return (
      entry.region?.trim() ||
      entry.appellation?.trim() ||
      entry.country?.trim() ||
      "Unknown region"
    );
  }
  if (scheme === "vintage") {
    return normalizeLabel(entry.vintage, "Unknown vintage");
  }
  const primaryVarietal = entry.primary_grapes?.find(
    (grape) => grape.name.trim().length > 0
  )?.name.trim();
  if (primaryVarietal) {
    return primaryVarietal;
  }
  return entry.classification?.trim() || "Unknown varietal";
}

function createGroupId(scheme: GroupScheme, label: string) {
  return `${scheme}:${label.toLowerCase()}`;
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

function entryMatchesSearch(entry: MobileEntry, query: string) {
  if (!query) return true;
  const fields: Array<string | number | null | undefined> = [
    entry.wine_name,
    entry.producer,
    entry.vintage,
    entry.country,
    entry.region,
    entry.appellation,
    entry.classification,
    entry.rating,
    entry.qpr_level,
  ];
  if (fields.some((field) => includesSearchValue(field, query))) {
    return true;
  }
  return Boolean(
    entry.primary_grapes?.some((grape) => includesSearchValue(grape.name, query))
  );
}

function getDisplayRating(rating: number | null): string | null {
  if (typeof rating !== "number" || Number.isNaN(rating)) {
    return null;
  }
  const normalizedRating = Math.max(0, Math.min(100, Math.round(rating)));
  return `${normalizedRating}/100`;
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
      <Text style={[styles.pillText, active ? styles.pillTextActive : null]}>{label}</Text>
    </Pressable>
  );
}

function EntryCard({ item }: { item: MobileEntry }) {
  const hideProducer = shouldHideProducerInEntryTile(item.wine_name, item.producer);
  const producer = hideProducer ? null : (item.producer?.trim() ?? null);
  const vintage = item.vintage?.trim() ?? null;
  const displayRating = getDisplayRating(item.rating);
  return (
    <View style={styles.entryCard}>
      <View style={styles.photoBox}>
        {item.label_image_url ? (
          <Image source={{ uri: item.label_image_url }} style={styles.photoImage} resizeMode="cover" />
        ) : (
          <Text style={styles.photoText}>No photo</Text>
        )}
      </View>
      <View style={styles.entryMain}>
        <View>
          <Text style={styles.entryTitle}>{item.wine_name?.trim() || "Untitled wine"}</Text>
          {producer || vintage ? (
            <Text style={styles.entrySubtitle}>
              {producer ?? ""}
              {producer && vintage ? ` · ${vintage}` : vintage ?? ""}
            </Text>
          ) : null}
        </View>
        <View style={styles.entryMeta}>
          <View style={styles.ratingStack}>
            {displayRating ? (
              <View style={styles.ratingWrap}>
                <Text style={styles.ratingText}>{displayRating}</Text>
              </View>
            ) : null}
            {item.qpr_level ? (
              <Text style={[styles.qprTag, styles[`qpr_${item.qpr_level}` as keyof typeof styles]]}>
                {QPR_LEVEL_LABELS[item.qpr_level]}
              </Text>
            ) : null}
          </View>
          <Text style={styles.entryDate}>{formatConsumedDate(item.consumed_at)}</Text>
        </View>
      </View>
    </View>
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

  const normalizedSearchQuery = searchQuery.trim().toLowerCase();
  const isSearchActive = normalizedSearchQuery.length > 0;
  const isRangeFilterActive =
    (filterType === "rating" || filterType === "vintage") && (filterMin !== "" || filterMax !== "");
  const isFilterActive = filterType === "country" ? filterValue !== "" : isRangeFilterActive;

  const uniqueCountries = useMemo(
    () => Array.from(new Set(entries.map((entry) => entry.country).filter((value): value is string => !!value))).sort(),
    [entries]
  );

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
        const value = filterType === "vintage" ? toVintageNumber(entry.vintage) : entry.rating ?? null;
        if (value === null || Number.isNaN(value)) return false;
        return value >= rangeMin && value <= rangeMax;
      });
    }
    return entries;
  }, [entries, filterMax, filterMin, filterType, filterValue]);

  const searchedEntries = useMemo(
    () => (isSearchActive ? filteredEntries.filter((entry) => entryMatchesSearch(entry, normalizedSearchQuery)) : filteredEntries),
    [filteredEntries, isSearchActive, normalizedSearchQuery]
  );

  const sortedEntries = useMemo(() => {
    const copy = [...searchedEntries];
    const mult = sortOrder === "asc" ? 1 : -1;
    if (sortBy === "rating") {
      return copy.sort((left, right) => mult * ((left.rating ?? -Infinity) - (right.rating ?? -Infinity)));
    }
    if (sortBy === "vintage") {
      return copy.sort((left, right) => mult * ((toVintageNumber(left.vintage) ?? -Infinity) - (toVintageNumber(right.vintage) ?? -Infinity)));
    }
    return copy.sort((left, right) => mult * left.consumed_at.localeCompare(right.consumed_at));
  }, [searchedEntries, sortBy, sortOrder]);

  const groupedEntries = useMemo<EntryGroup[]>(() => {
    if (libraryViewMode !== "grouped") return [];
    const groups = new Map<string, EntryGroup>();
    sortedEntries.forEach((entry) => {
      const label = getGroupLabel(entry, groupScheme);
      const id = createGroupId(groupScheme, label);
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
      refresh ? setIsRefreshing(true) : setIsLoading(true);
      setErrorMessage(null);

      const { data, error } = await supabase
        .from("wine_entries")
        .select("id, user_id, wine_name, producer, vintage, rating, consumed_at, created_at, label_image_path, country, region, appellation, classification, qpr_level")
        .eq("user_id", user.id)
        .order("consumed_at", { ascending: false })
        .limit(100);

      if (error) {
        setErrorMessage(error.message);
      } else {
        const rows = (data ?? []) as MobileEntry[];
        const entryIds = rows.map((entry) => entry.id);
        const primaryGrapeMap = new Map<string, PrimaryGrape[]>();
        const labelPathByEntryId = new Map<string, string>();
        const signedUrlByPath = new Map<string, string | null>();

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

          const { data: labelPhotos, error: labelPhotoError } = await supabase
            .from("entry_photos")
            .select("entry_id, path, position, created_at")
            .eq("type", "label")
            .in("entry_id", entryIds)
            .order("position", { ascending: true })
            .order("created_at", { ascending: true });

          if (!labelPhotoError && labelPhotos) {
            (labelPhotos as EntryPhotoRow[]).forEach((photo) => {
              if (!labelPathByEntryId.has(photo.entry_id)) {
                labelPathByEntryId.set(photo.entry_id, photo.path);
              }
            });
          }
        }

        const labelPathsToSign = Array.from(
          new Set(
            rows
              .map((entry) => labelPathByEntryId.get(entry.id) ?? entry.label_image_path ?? null)
              .filter((path): path is string => Boolean(path && path !== "pending"))
          )
        );

        await Promise.all(
          labelPathsToSign.map(async (path) => {
            const { data: signedUrl, error: signedUrlError } = await supabase.storage
              .from("wine-photos")
              .createSignedUrl(path, 60 * 60);
            signedUrlByPath.set(path, signedUrlError ? null : signedUrl.signedUrl);
          })
        );

        setEntries(
          rows.map((entry) => {
            const labelPath = labelPathByEntryId.get(entry.id) ?? entry.label_image_path ?? null;
            return {
              ...entry,
              label_image_url: labelPath ? signedUrlByPath.get(labelPath) ?? null : null,
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
    void loadEntries();
  }, [loadEntries]);

  const updateFilterType = (newFilterType: FilterType) => {
    setFilterType(newFilterType);
    setFilterValue("");
    setFilterMin("");
    setFilterMax("");
  };

  if (isLoading) {
    return (
      <View style={styles.loadingScreen}>
        <ActivityIndicator color="#fbbf24" />
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={() => void loadEntries(true)} tintColor="#fbbf24" />}
      >
        <AppTopBar activeHref="/(app)/entries" />

        <View style={styles.header}>
          <Text style={styles.eyebrow}>My library</Text>
          <Text style={styles.title}>Curate your cellar library.</Text>
          <Text style={styles.subtitle}>Organize bottles by region, vintage, or varietal while keeping your filters.</Text>
        </View>

        <View style={styles.controls}>
          <View style={styles.controlButtons}>
            <Pressable onPress={() => setActiveControlPanel((v) => (v === "sort" ? null : "sort"))} style={[styles.controlBtn, activeControlPanel === "sort" && styles.controlBtnActive]}><Text style={styles.controlBtnLabel}>Sort</Text></Pressable>
            <Pressable onPress={() => setActiveControlPanel((v) => (v === "filter" ? null : "filter"))} style={[styles.controlBtn, activeControlPanel === "filter" && styles.controlBtnActive]}><Text style={styles.controlBtnLabel}>Filter</Text></Pressable>
            <Pressable onPress={() => setActiveControlPanel((v) => (v === "organize" ? null : "organize"))} style={[styles.controlBtn, activeControlPanel === "organize" && styles.controlBtnActive]}><Text style={styles.controlBtnLabel}>Organize</Text></Pressable>
          </View>
          <View style={styles.searchRow}>
            <DoneTextInput value={searchQuery} onChangeText={setSearchQuery} placeholder="Search wine, producer, region, or varietal" placeholderTextColor="#71717a" style={styles.searchInput} autoCapitalize="none" autoCorrect={false} />
            {isSearchActive ? <Pressable style={styles.secondaryBtn} onPress={() => setSearchQuery("")}><Text style={styles.secondaryBtnText}>Clear</Text></Pressable> : null}
          </View>

          {activeControlPanel === "sort" ? (
            <View style={styles.panel}>
              <Text style={styles.panelLabel}>Sort by</Text>
              <View style={styles.pills}><Pill label="Date consumed" active={sortBy === "consumed_at"} onPress={() => setSortBy("consumed_at")} /><Pill label="Rating" active={sortBy === "rating"} onPress={() => setSortBy("rating")} /><Pill label="Vintage" active={sortBy === "vintage"} onPress={() => setSortBy("vintage")} /></View>
              <Text style={styles.panelLabel}>Order</Text>
              <View style={styles.pills}><Pill label={sortBy === "rating" ? "High to low" : "Newest first"} active={sortOrder === "desc"} onPress={() => setSortOrder("desc")} /><Pill label={sortBy === "rating" ? "Low to high" : "Oldest first"} active={sortOrder === "asc"} onPress={() => setSortOrder("asc")} /></View>
            </View>
          ) : null}

          {activeControlPanel === "filter" ? (
            <View style={styles.panel}>
              <Text style={styles.panelLabel}>Filter by</Text>
              <View style={styles.pills}><Pill label="None" active={filterType === ""} onPress={() => updateFilterType("")} /><Pill label="Country" active={filterType === "country"} onPress={() => updateFilterType("country")} /><Pill label="Vintage range" active={filterType === "vintage"} onPress={() => updateFilterType("vintage")} /><Pill label="Rating range" active={filterType === "rating"} onPress={() => updateFilterType("rating")} /></View>
              {filterType === "country" ? <View style={styles.pills}><Pill label="All countries" active={filterValue === ""} onPress={() => setFilterValue("")} />{uniqueCountries.map((country) => <Pill key={country} label={country} active={filterValue === country} onPress={() => setFilterValue(country)} />)}</View> : null}
              {filterType === "rating" || filterType === "vintage" ? <View style={styles.rangeRow}><DoneTextInput value={filterMin} onChangeText={setFilterMin} placeholder="Min" placeholderTextColor="#71717a" keyboardType="number-pad" style={styles.rangeInput} /><DoneTextInput value={filterMax} onChangeText={setFilterMax} placeholder="Max" placeholderTextColor="#71717a" keyboardType="number-pad" style={styles.rangeInput} /></View> : null}
            </View>
          ) : null}

          {activeControlPanel === "organize" ? (
            <View style={styles.panel}>
              <Text style={styles.panelLabel}>Library view</Text>
              <View style={styles.pills}><Pill label="Grouped" active={libraryViewMode === "grouped"} onPress={() => setLibraryViewMode("grouped")} /><Pill label="Full list" active={libraryViewMode === "all"} onPress={() => setLibraryViewMode("all")} /></View>
              {libraryViewMode === "grouped" ? <View style={styles.pills}><Pill label="Region" active={groupScheme === "region"} onPress={() => setGroupScheme("region")} /><Pill label="Vintage" active={groupScheme === "vintage"} onPress={() => setGroupScheme("vintage")} /><Pill label="Varietal" active={groupScheme === "varietal"} onPress={() => setGroupScheme("varietal")} /></View> : null}
            </View>
          ) : null}
          <Text style={styles.countText}>{sortedEntries.length} {sortedEntries.length === 1 ? "entry" : "entries"}</Text>
        </View>

        {errorMessage ? <Text style={styles.errorText}>{errorMessage}</Text> : null}

        {sortedEntries.length === 0 ? (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyText}>
              {isSearchActive ? "No entries match this search." : isRangeFilterActive ? "There are no wines found in this range." : isFilterActive ? "No entries match this filter." : "Your library is empty. Add your first bottle!"}
            </Text>
          </View>
        ) : libraryViewMode === "grouped" ? (
          <View style={styles.stack}>
            {groupedEntries.map((group) => {
              const expanded = Boolean(expandedGroups[group.id]);
              const visible = expanded ? group.entries : group.entries.slice(0, GROUP_PREVIEW_COUNT);
              return (
                <View key={group.id} style={styles.groupCard}>
                  <View style={styles.groupHeader}>
                    <View>
                      <Text style={styles.groupTitle}>{group.label}</Text>
                      <Text style={styles.groupCount}>{group.entries.length} {group.entries.length === 1 ? "entry" : "entries"}</Text>
                    </View>
                    {group.entries.length > GROUP_PREVIEW_COUNT ? <Pressable style={styles.secondaryBtn} onPress={() => setExpandedGroups((prev) => ({ ...prev, [group.id]: !prev[group.id] }))}><Text style={styles.secondaryBtnText}>{expanded ? "Show less" : "See all"}</Text></Pressable> : null}
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
  screen: { flex: 1, backgroundColor: "#0f0a09" },
  loadingScreen: { flex: 1, backgroundColor: "#0f0a09", alignItems: "center", justifyContent: "center" },
  content: { paddingHorizontal: 18, paddingTop: 16, paddingBottom: 28, gap: 12 },
  secondaryBtn: { borderRadius: 999, borderWidth: 1, borderColor: "rgba(255,255,255,0.14)", paddingHorizontal: 10, paddingVertical: 7 },
  secondaryBtnText: { color: "#e4e4e7", fontSize: 12, fontWeight: "700" },
  header: { gap: 6 },
  eyebrow: { color: "#fcd34d", fontSize: 11, fontWeight: "700", letterSpacing: 2, textTransform: "uppercase" },
  title: { color: "#fafafa", fontSize: 29, fontWeight: "700" },
  subtitle: { color: "#d4d4d8", fontSize: 13, lineHeight: 18 },
  controls: { borderRadius: 16, borderWidth: 1, borderColor: "rgba(255,255,255,0.1)", backgroundColor: "rgba(255,255,255,0.05)", padding: 12, gap: 9 },
  controlButtons: { flexDirection: "row", gap: 8, flexWrap: "wrap" },
  controlBtn: { borderRadius: 999, borderWidth: 1, borderColor: "rgba(255,255,255,0.14)", paddingHorizontal: 11, paddingVertical: 8 },
  controlBtnActive: { borderColor: "rgba(252,211,77,0.7)", backgroundColor: "rgba(251,191,36,0.15)" },
  controlBtnLabel: { color: "#e4e4e7", fontSize: 12, fontWeight: "700" },
  searchRow: { flexDirection: "row", gap: 8, alignItems: "center" },
  searchInput: { flex: 1, borderRadius: 999, borderWidth: 1, borderColor: "rgba(255,255,255,0.1)", backgroundColor: "rgba(0,0,0,0.3)", color: "#f4f4f5", paddingHorizontal: 14, paddingVertical: 10, fontSize: 14 },
  panel: { borderRadius: 12, borderWidth: 1, borderColor: "rgba(255,255,255,0.08)", backgroundColor: "rgba(0,0,0,0.25)", padding: 10, gap: 8 },
  panelLabel: { color: "#a1a1aa", fontSize: 11, fontWeight: "700", letterSpacing: 1.3, textTransform: "uppercase" },
  pills: { flexDirection: "row", gap: 8, flexWrap: "wrap" },
  pill: { borderRadius: 999, borderWidth: 1, borderColor: "rgba(255,255,255,0.15)", paddingHorizontal: 12, paddingVertical: 7 },
  pillActive: { borderColor: "rgba(252,211,77,0.7)", backgroundColor: "rgba(251,191,36,0.15)" },
  pillText: { color: "#d4d4d8", fontSize: 12, fontWeight: "700" },
  pillTextActive: { color: "#fef3c7" },
  rangeRow: { flexDirection: "row", gap: 8 },
  rangeInput: { width: 96, borderRadius: 999, borderWidth: 1, borderColor: "rgba(255,255,255,0.1)", backgroundColor: "rgba(0,0,0,0.3)", color: "#f4f4f5", paddingHorizontal: 12, paddingVertical: 8, fontSize: 13 },
  countText: { color: "#a1a1aa", fontSize: 12 },
  errorText: { color: "#fecdd3", fontSize: 13 },
  emptyCard: { borderRadius: 16, borderWidth: 1, borderColor: "rgba(255,255,255,0.1)", backgroundColor: "rgba(255,255,255,0.05)", paddingHorizontal: 16, paddingVertical: 14 },
  emptyText: { color: "#d4d4d8", fontSize: 14, lineHeight: 20 },
  stack: { gap: 10 },
  groupCard: { borderRadius: 14, borderWidth: 1, borderColor: "rgba(255,255,255,0.1)", backgroundColor: "rgba(255,255,255,0.05)", padding: 10, gap: 8 },
  groupHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 },
  groupTitle: { color: "#fafafa", fontSize: 17, fontWeight: "700" },
  groupCount: { color: "#a1a1aa", fontSize: 11, marginTop: 2 },
  entryCard: { flexDirection: "row", gap: 14, borderRadius: 18, borderWidth: 1, borderColor: "rgba(255,255,255,0.1)", backgroundColor: "rgba(255,255,255,0.05)", padding: 14 },
  photoBox: { width: 82, height: 82, borderRadius: 14, backgroundColor: "rgba(0,0,0,0.35)", alignItems: "center", justifyContent: "center", overflow: "hidden" },
  photoImage: { width: "100%", height: "100%" },
  photoText: { color: "#71717a", fontSize: 11, textAlign: "center", paddingHorizontal: 6 },
  entryMain: { flex: 1, justifyContent: "space-between", gap: 8 },
  entryTitle: { color: "#fafafa", fontSize: 14, fontWeight: "700" },
  entrySubtitle: { marginTop: 3, color: "#a1a1aa", fontSize: 12 },
  ratingWrap: { flexDirection: "row", alignItems: "center", minWidth: 0 },
  ratingStack: { flex: 1, minWidth: 0, gap: 4 },
  qprTag: { alignSelf: "flex-start", borderRadius: 999, borderWidth: 1, paddingHorizontal: 6, paddingVertical: 2, overflow: "hidden", fontSize: 8, fontWeight: "700", letterSpacing: 0.25, textTransform: "uppercase" },
  qpr_extortion: { borderColor: "rgba(251, 113, 133, 0.4)", backgroundColor: "rgba(251, 113, 133, 0.1)", color: "#fecdd3" },
  qpr_pricey: { borderColor: "rgba(248, 113, 113, 0.4)", backgroundColor: "rgba(248, 113, 113, 0.1)", color: "#fecaca" },
  qpr_mid: { borderColor: "rgba(251, 191, 36, 0.4)", backgroundColor: "rgba(251, 191, 36, 0.1)", color: "#fde68a" },
  qpr_good_value: { borderColor: "rgba(74, 222, 128, 0.4)", backgroundColor: "rgba(74, 222, 128, 0.1)", color: "#bbf7d0" },
  qpr_absolute_steal: { borderColor: "rgba(34, 197, 94, 0.4)", backgroundColor: "rgba(34, 197, 94, 0.1)", color: "#86efac" },
  entryMeta: { marginTop: 6, flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between", gap: 10 },
  ratingText: { color: "#fcd34d", fontSize: 12, fontWeight: "800" },
  entryDate: { color: "#a1a1aa", fontSize: 12, flexShrink: 0, textAlign: "right" },
});

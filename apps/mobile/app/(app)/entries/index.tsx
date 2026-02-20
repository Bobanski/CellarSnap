import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { router } from "expo-router";
import type { WineEntrySummary } from "@cellarsnap/shared";
import { supabase } from "@/src/lib/supabase";
import { useAuth } from "@/src/providers/AuthProvider";

type SortBy = "consumed_at" | "rating" | "vintage";
type SortOrder = "asc" | "desc";
type FilterType = "vintage" | "country" | "rating" | "";
type GroupScheme = "region" | "vintage" | "varietal";
type LibraryViewMode = "grouped" | "all";
type ControlPanel = "sort" | "filter" | "organize" | null;
type QprLevel = "extortion" | "pricey" | "mid" | "good_value" | "absolute_steal";

const QPR_LEVEL_LABELS: Record<QprLevel, string> = {
  extortion: "Extortion",
  pricey: "Pricey",
  mid: "Spot on",
  good_value: "Good Value",
  absolute_steal: "Absolute Steal",
};

type MobileEntry = WineEntrySummary & {
  country: string | null;
  region: string | null;
  appellation: string | null;
  classification: string | null;
  qpr_level: QprLevel | null;
};

type EntryGroup = {
  id: string;
  label: string;
  entries: MobileEntry[];
};

const GROUP_PREVIEW_COUNT = 4;

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
  return entry.classification?.trim() || "Unknown varietal";
}

function createGroupId(scheme: GroupScheme, label: string) {
  return `${scheme}:${label.toLowerCase()}`;
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
  return fields.some((field) => includesSearchValue(field, query));
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
  const producerVintage = [item.producer, item.vintage].filter(Boolean).join(" - ");
  const displayRating = getDisplayRating(item.rating);
  return (
    <View style={styles.entryCard}>
      <View style={styles.photoBox}>
        <Text style={styles.photoText}>No photo</Text>
      </View>
      <View style={styles.entryMain}>
        <View>
          <Text style={styles.entryTitle}>{item.wine_name?.trim() || "Untitled wine"}</Text>
          <Text style={styles.entrySubtitle}>{producerVintage || "No producer or vintage"}</Text>
        </View>
        <View style={styles.entryMeta}>
          <View style={styles.ratingWrap}>
            {displayRating ? <Text style={styles.ratingText}>{displayRating}</Text> : null}
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
  const { user, signOut } = useAuth();
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
  const [libraryViewMode, setLibraryViewMode] = useState<LibraryViewMode>("grouped");
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
    sortedGroups.sort((left, right) => left.label.localeCompare(right.label));
    return sortedGroups;
  }, [groupScheme, libraryViewMode, sortedEntries]);

  const loadEntries = useCallback(
    async (refresh = false) => {
      if (!user) return;
      refresh ? setIsRefreshing(true) : setIsLoading(true);
      setErrorMessage(null);

      const { data, error } = await supabase
        .from("wine_entries")
        .select("id, user_id, wine_name, producer, vintage, rating, consumed_at, created_at, country, region, appellation, classification, qpr_level")
        .eq("user_id", user.id)
        .order("consumed_at", { ascending: false })
        .limit(100);

      if (error) setErrorMessage(error.message);
      else setEntries((data ?? []) as MobileEntry[]);

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

  const onSignOut = async () => {
    await signOut();
    router.replace("/(auth)/sign-in");
  };

  if (isLoading) {
    return (
      <View style={styles.loadingScreen}>
        <ActivityIndicator color="#fbbf24" />
      </View>
    );
  }

  const sortSummary = sortBy === "consumed_at" ? "Date" : sortBy === "rating" ? "Rating" : "Vintage";
  const filterSummary = filterType ? (filterType === "country" ? `Country: ${filterValue || "all"}` : `${filterType} range`) : "None";
  const organizeSummary = libraryViewMode === "all" ? "Full list" : `Grouped by ${groupScheme}`;

  return (
    <View style={styles.screen}>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={() => void loadEntries(true)} tintColor="#fbbf24" />}
      >
        <View style={styles.navRow}>
          <Text style={styles.brand}>CellarSnap</Text>
          <View style={styles.navActions}>
            <Pressable style={styles.newBtn} onPress={() => router.push("/(app)/entries/new")}><Text style={styles.newBtnText}>+ New entry</Text></Pressable>
            <Pressable style={styles.secondaryBtn} onPress={() => void onSignOut()}><Text style={styles.secondaryBtnText}>Sign out</Text></Pressable>
          </View>
        </View>

        <View style={styles.header}>
          <Text style={styles.eyebrow}>My library</Text>
          <Text style={styles.title}>Curate your cellar library.</Text>
          <Text style={styles.subtitle}>Organize bottles by region, vintage, or varietal while keeping your filters.</Text>
        </View>

        <View style={styles.controls}>
          <View style={styles.controlButtons}>
            <Pressable onPress={() => setActiveControlPanel((v) => (v === "sort" ? null : "sort"))} style={[styles.controlBtn, activeControlPanel === "sort" && styles.controlBtnActive]}><Text style={styles.controlBtnLabel}>Sort</Text><Text style={styles.controlBtnSummary}>{sortSummary}</Text></Pressable>
            <Pressable onPress={() => setActiveControlPanel((v) => (v === "filter" ? null : "filter"))} style={[styles.controlBtn, activeControlPanel === "filter" && styles.controlBtnActive]}><Text style={styles.controlBtnLabel}>Filter</Text><Text style={styles.controlBtnSummary}>{filterSummary}</Text></Pressable>
            <Pressable onPress={() => setActiveControlPanel((v) => (v === "organize" ? null : "organize"))} style={[styles.controlBtn, activeControlPanel === "organize" && styles.controlBtnActive]}><Text style={styles.controlBtnLabel}>Organize</Text><Text style={styles.controlBtnSummary}>{organizeSummary}</Text></Pressable>
          </View>
          <View style={styles.searchRow}>
            <TextInput value={searchQuery} onChangeText={setSearchQuery} placeholder="Search wine, producer, region, or varietal" placeholderTextColor="#71717a" style={styles.searchInput} autoCapitalize="none" autoCorrect={false} />
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
              {filterType === "rating" || filterType === "vintage" ? <View style={styles.rangeRow}><TextInput value={filterMin} onChangeText={setFilterMin} placeholder="Min" placeholderTextColor="#71717a" keyboardType="number-pad" style={styles.rangeInput} /><TextInput value={filterMax} onChangeText={setFilterMax} placeholder="Max" placeholderTextColor="#71717a" keyboardType="number-pad" style={styles.rangeInput} /></View> : null}
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
  navRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", borderBottomWidth: 1, borderBottomColor: "rgba(255,255,255,0.06)", paddingBottom: 16 },
  brand: { color: "#fafafa", fontSize: 22, fontWeight: "700" },
  navActions: { flexDirection: "row", alignItems: "center", gap: 8 },
  newBtn: { borderRadius: 999, backgroundColor: "#fbbf24", paddingHorizontal: 12, paddingVertical: 8 },
  newBtnText: { color: "#09090b", fontSize: 12, fontWeight: "700" },
  secondaryBtn: { borderRadius: 999, borderWidth: 1, borderColor: "rgba(255,255,255,0.14)", paddingHorizontal: 10, paddingVertical: 7 },
  secondaryBtnText: { color: "#e4e4e7", fontSize: 12, fontWeight: "700" },
  header: { gap: 6 },
  eyebrow: { color: "#fcd34d", fontSize: 11, fontWeight: "700", letterSpacing: 2, textTransform: "uppercase" },
  title: { color: "#fafafa", fontSize: 29, fontWeight: "700" },
  subtitle: { color: "#d4d4d8", fontSize: 14, lineHeight: 20 },
  controls: { borderRadius: 16, borderWidth: 1, borderColor: "rgba(255,255,255,0.1)", backgroundColor: "rgba(255,255,255,0.05)", padding: 12, gap: 9 },
  controlButtons: { flexDirection: "row", gap: 8, flexWrap: "wrap" },
  controlBtn: { borderRadius: 999, borderWidth: 1, borderColor: "rgba(255,255,255,0.14)", paddingHorizontal: 11, paddingVertical: 8, gap: 2 },
  controlBtnActive: { borderColor: "rgba(252,211,77,0.7)", backgroundColor: "rgba(251,191,36,0.15)" },
  controlBtnLabel: { color: "#e4e4e7", fontSize: 12, fontWeight: "700" },
  controlBtnSummary: { color: "#a1a1aa", fontSize: 11 },
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
  groupCount: { color: "#a1a1aa", fontSize: 12, marginTop: 2 },
  entryCard: { flexDirection: "row", gap: 14, borderRadius: 18, borderWidth: 1, borderColor: "rgba(255,255,255,0.1)", backgroundColor: "rgba(255,255,255,0.05)", padding: 14 },
  photoBox: { width: 82, height: 82, borderRadius: 14, backgroundColor: "rgba(0,0,0,0.35)", alignItems: "center", justifyContent: "center", paddingHorizontal: 6 },
  photoText: { color: "#71717a", fontSize: 11, textAlign: "center" },
  entryMain: { flex: 1, justifyContent: "space-between", gap: 8 },
  entryTitle: { color: "#fafafa", fontSize: 17, fontWeight: "700" },
  entrySubtitle: { marginTop: 4, color: "#a1a1aa", fontSize: 13 },
  ratingWrap: { flexDirection: "row", alignItems: "center", gap: 6, flexWrap: "wrap" },
  qprTag: { borderRadius: 999, borderWidth: 1, paddingHorizontal: 8, paddingVertical: 3, overflow: "hidden", fontSize: 10, fontWeight: "700", letterSpacing: 0.4, textTransform: "uppercase" },
  qpr_extortion: { borderColor: "rgba(251, 113, 133, 0.4)", backgroundColor: "rgba(251, 113, 133, 0.1)", color: "#fecdd3" },
  qpr_pricey: { borderColor: "rgba(248, 113, 113, 0.4)", backgroundColor: "rgba(248, 113, 113, 0.1)", color: "#fecaca" },
  qpr_mid: { borderColor: "rgba(251, 191, 36, 0.4)", backgroundColor: "rgba(251, 191, 36, 0.1)", color: "#fde68a" },
  qpr_good_value: { borderColor: "rgba(74, 222, 128, 0.4)", backgroundColor: "rgba(74, 222, 128, 0.1)", color: "#bbf7d0" },
  qpr_absolute_steal: { borderColor: "rgba(34, 197, 94, 0.4)", backgroundColor: "rgba(34, 197, 94, 0.1)", color: "#86efac" },
  entryMeta: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  ratingText: { color: "#fcd34d", fontSize: 17, fontWeight: "800" },
  entryDate: { color: "#a1a1aa", fontSize: 12 },
});

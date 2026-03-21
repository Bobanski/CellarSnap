import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  useWindowDimensions,
  View,
} from "react-native";
import { useLocalSearchParams, router } from "expo-router";
import { Feather } from "@expo/vector-icons";
import {
  buildListScanVarietalAccentMap,
  createDefaultListScanFilters,
  deriveListScanFacets,
  deriveListScanRegionGroups,
  filterListScanWines,
  formatListScanPriceDisplay,
  getListScanStructuredMeta,
  getListScanDisplayLines,
  getListScanFilterAccentTone,
  getListScanVarietalAccentTone,
  getListScanSectionTitle,
  getTopListScanRecommendations,
  listScanWineTypeLabels,
  sanitizeListScanFilters,
  resolveListScanWineType,
  type ListScanFilterAccentTone,
  type ListScanFilters,
  type ListScanFilterableWineType,
  type ListScanResult,
} from "@cellarsnap/shared";
import { AppTopBar } from "@/src/components/AppTopBar";
import { DoneTextInput } from "@/src/components/DoneTextInput";
import { AppText } from "@/src/components/AppText";
import FacetMultiSelect from "@/src/screens/listScan/FacetMultiSelect";
import RegionFilterSelect from "@/src/screens/listScan/RegionFilterSelect";
import { readListScanResult } from "@/src/lib/listScan/storage";
import { colors } from "@/src/lib/theme";

function formatCurrencyValue(value: number | null) {
  return typeof value === "number" && Number.isFinite(value) ? `$${value}` : "";
}

function formatPriceInputValue(value: number | null) {
  return typeof value === "number" && Number.isFinite(value) ? String(value) : "";
}

function formatPriceDisplay(value: string | null, menuLabel?: string) {
  return formatListScanPriceDisplay(value, menuLabel) ?? "-";
}

const EMPTY_WINE_TYPES: ListScanFilterableWineType[] = [];
const EMPTY_STRING_LIST: string[] = [];

function summarizeSelectedLabels(values: string[], emptyLabel: string) {
  if (values.length === 0) {
    return emptyLabel;
  }
  if (values.length <= 2) {
    return values.join(", ");
  }
  return `${values.slice(0, 2).join(", ")} +${values.length - 2}`;
}

function buildPriceSummary(filters: ListScanFilters) {
  if (filters.price_mode === "any") {
    return "Any price";
  }
  if (filters.price_mode === "under") {
    return filters.price_max !== null
      ? `Under ${formatCurrencyValue(filters.price_max)}`
      : "Under a set price";
  }
  if (filters.price_mode === "over") {
    return filters.price_min !== null
      ? `Over ${formatCurrencyValue(filters.price_min)}`
      : "Over a set price";
  }

  const min = filters.price_min !== null ? formatCurrencyValue(filters.price_min) : "min";
  const max = filters.price_max !== null ? formatCurrencyValue(filters.price_max) : "max";
  return `Between ${min} and ${max}`;
}

function buildWineTypeSummary(
  selected: ListScanFilterableWineType[],
  available: ListScanFilterableWineType[]
) {
  const visibleSelected = selected.filter((value) => available.includes(value));
  if (available.length === 0) {
    return "No options found";
  }
  if (visibleSelected.length === 0 || visibleSelected.length === available.length) {
    return "All available";
  }
  return summarizeSelectedLabels(
    visibleSelected.map((value) => listScanWineTypeLabels[value]),
    "All available"
  );
}

function buildMatchSummary(filters: ListScanFilters) {
  return filters.min_match_percent > 0
    ? `Over ${filters.min_match_percent}%`
    : "Any match";
}

function getSegmentToneStyles(
  tone: ListScanFilterAccentTone,
  selected: boolean
) {
  if (tone === "rose") {
    return {
      button: selected ? styles.segmentButtonRoseActive : styles.segmentButtonRose,
      text: selected ? styles.segmentButtonTextRoseActive : styles.segmentButtonTextRose,
    };
  }
  if (tone === "orange") {
    return {
      button: selected ? styles.segmentButtonOrangeActive : styles.segmentButtonOrange,
      text: selected
        ? styles.segmentButtonTextOrangeActive
        : styles.segmentButtonTextOrange,
    };
  }
  if (tone === "white") {
    return {
      button: selected ? styles.segmentButtonWhiteActive : styles.segmentButtonWhite,
      text: selected ? styles.segmentButtonTextWhiteActive : styles.segmentButtonTextWhite,
    };
  }
  if (tone === "red") {
    return {
      button: selected ? styles.segmentButtonRedActive : styles.segmentButtonRed,
      text: selected ? styles.segmentButtonTextRedActive : styles.segmentButtonTextRed,
    };
  }
  return {
    button: selected ? styles.segmentButtonActive : null,
    text: selected ? styles.segmentButtonTextActive : null,
  };
}

function getWineTypeSegmentToneStyles(
  type: ListScanFilterableWineType,
  selected: boolean
) {
  if (type === "dessert_fortified") {
    return getSegmentToneStyles("neutral", selected);
  }
  return getSegmentToneStyles(getListScanFilterAccentTone(type), selected);
}

function hasCustomWineTypeSelection(
  selected: ListScanFilterableWineType[],
  available: ListScanFilterableWineType[]
) {
  if (available.length === 0) {
    return false;
  }

  return !available.every((type) => selected.includes(type));
}

function countActiveFilterGroups(
  filters: ListScanFilters,
  availableWineTypes: ListScanFilterableWineType[]
) {
  let count = 0;

  if (filters.price_mode !== "any") {
    count += 1;
  }
  if (hasCustomWineTypeSelection(filters.included_wine_types, availableWineTypes)) {
    count += 1;
  }
  if (filters.selected_varietals.length > 0) {
    count += 1;
  }
  if (filters.selected_regions.length > 0) {
    count += 1;
  }
  if (filters.min_match_percent > 0) {
    count += 1;
  }

  return count;
}

type FilterDropdownProps = {
  label: string;
  summary: string;
  open: boolean;
  onToggle: () => void;
  onDone?: () => void;
  children: ReactNode;
};

function FilterDropdown({
  label,
  summary,
  open,
  onToggle,
  onDone,
  children,
}: FilterDropdownProps) {
  return (
    <View style={styles.filterDropdown}>
      <Pressable style={styles.filterDropdownHeader} onPress={onToggle}>
        <View style={styles.filterDropdownHeaderText}>
          <AppText style={styles.filterLabel}>{label}</AppText>
          <AppText numberOfLines={1} style={styles.filterSummary}>
            {summary}
          </AppText>
        </View>
        <AppText style={styles.filterChevron}>{open ? "v" : ">"}</AppText>
      </Pressable>

      {open ? (
        <View style={styles.filterDropdownBody}>
          {children}
          <View style={styles.filterDoneRow}>
            <Pressable style={styles.filterDoneButton} onPress={onDone ?? onToggle}>
              <AppText style={styles.filterDoneButtonText}>Done</AppText>
            </Pressable>
          </View>
        </View>
      ) : null}
    </View>
  );
}

export default function ListScanResultsScreen() {
  const params = useLocalSearchParams<{ scanId?: string }>();
  const { width } = useWindowDimensions();
  const [result, setResult] = useState<ListScanResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState<ListScanFilters>(
    createDefaultListScanFilters()
  );
  const [filtersVisible, setFiltersVisible] = useState(false);
  const [priceOpen, setPriceOpen] = useState(false);
  const [wineTypeOpen, setWineTypeOpen] = useState(false);
  const [varietalOpen, setVarietalOpen] = useState(false);
  const [regionOpen, setRegionOpen] = useState(false);
  const [matchOpen, setMatchOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      const scanId = typeof params.scanId === "string" ? params.scanId : "";
      if (!scanId) {
        if (!cancelled) {
          setLoading(false);
        }
        return;
      }

      const nextResult = await readListScanResult(scanId);
      if (cancelled) {
        return;
      }
      setResult(nextResult);
      setFilters(
        createDefaultListScanFilters(
          nextResult ? deriveListScanFacets(nextResult.wines) : undefined
        )
      );
      setLoading(false);
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, [params.scanId]);

  const derivedFacets = useMemo(
    () => (result ? deriveListScanFacets(result.wines) : null),
    [result]
  );
  const varietalAccentMap = useMemo(
    () => (result ? buildListScanVarietalAccentMap(result.wines) : {}),
    [result]
  );
  const regionGroups = useMemo(
    () => (result ? deriveListScanRegionGroups(result.wines) : []),
    [result]
  );
  const visibleFilters = useMemo(
    () =>
      result
        ? sanitizeListScanFilters(
            filters,
            derivedFacets ?? undefined,
            regionGroups
          )
        : filters,
    [derivedFacets, filters, regionGroups, result]
  );
  const availableWineTypes = derivedFacets?.wine_types ?? EMPTY_WINE_TYPES;
  const availableVarietals = derivedFacets?.varietals ?? EMPTY_STRING_LIST;
  const hasWineTypeOptions = availableWineTypes.length > 0;
  const hasVarietalOptions = availableVarietals.length > 0;
  const hasRegionOptions = regionGroups.length > 0;
  const filteredWines = useMemo(
    () => (result ? filterListScanWines(result.wines, visibleFilters) : []),
    [result, visibleFilters]
  );
  const topRecommendations = useMemo(
    () => getTopListScanRecommendations(filteredWines, 3),
    [filteredWines]
  );
  const [recommendationNotes, setRecommendationNotes] = useState<Record<string, string>>({});
  const highlightedIds = useMemo(
    () => new Set(topRecommendations.map((wine) => wine.id)),
    [topRecommendations]
  );
  const activeFilterCount = useMemo(
    () =>
      derivedFacets
        ? countActiveFilterGroups(visibleFilters, availableWineTypes)
        : 0,
    [availableWineTypes, derivedFacets, visibleFilters]
  );

  useEffect(() => {
    let isActive = true;
    const controller = new AbortController();
    const eligibleItems = topRecommendations.filter((wine) => wine.match_percent > 59);

    if (eligibleItems.length === 0) {
      return () => {
        isActive = false;
        controller.abort();
      };
    }

    const timeoutId = setTimeout(() => {
      void (async () => {
        try {
          const response = await fetch("/api/list-scan/recommendation-notes", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ items: eligibleItems }),
            signal: controller.signal,
          });

          if (!response.ok || !isActive) {
            return;
          }

          const payload = (await response.json()) as {
            notes?: Array<{ id: string; note: string | null }>;
          };

          if (!isActive) {
            return;
          }

          const nextNotes: Record<string, string> = {};
          (payload.notes ?? []).forEach((entry) => {
            if (entry.id && typeof entry.note === "string" && entry.note.trim().length > 0) {
              nextNotes[entry.id] = entry.note.trim();
            }
          });
          setRecommendationNotes(nextNotes);
        } catch {
          if (isActive) {
            setRecommendationNotes({});
          }
        }
      })();
    }, 150);

    return () => {
      isActive = false;
      controller.abort();
      clearTimeout(timeoutId);
    };
  }, [topRecommendations]);
  const filterColumns = width >= 320 ? 2 : 1;
  const collapsedFilterCardWidth =
    filterColumns === 2 ? Math.max(140, Math.floor((width - 88) / 2)) : "100%";
  const getFilterCardWidth = (open: boolean) =>
    open || filterColumns === 1 ? "100%" : collapsedFilterCardWidth;

  const toggleFiltersVisibility = () => {
    if (filtersVisible) {
      setPriceOpen(false);
      setWineTypeOpen(false);
      setVarietalOpen(false);
      setRegionOpen(false);
      setMatchOpen(false);
    }
    setFiltersVisible((current) => !current);
  };

  if (loading) {
    return (
      <View style={styles.screen}>
        <ScrollView contentContainerStyle={styles.content}>
          <AppTopBar activeHref="/(app)/home" />
          <View style={styles.infoCard}>
            <AppText style={styles.infoText}>Loading scanned list...</AppText>
          </View>
        </ScrollView>
      </View>
    );
  }

  if (!result) {
    return (
      <View style={styles.screen}>
        <ScrollView contentContainerStyle={styles.content}>
          <AppTopBar activeHref="/(app)/home" />
          <View style={styles.infoCard}>
            <AppText style={styles.infoText}>
              This scan result is no longer available in the current session.
            </AppText>
            <Pressable
              style={styles.primaryButton}
              onPress={() => router.replace("/(app)/list-scan")}
            >
              <AppText style={styles.primaryButtonText}>Start a new scan</AppText>
            </Pressable>
          </View>
        </ScrollView>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.screen}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      keyboardVerticalOffset={Platform.OS === "ios" ? 18 : 0}
    >
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode={Platform.OS === "ios" ? "interactive" : "on-drag"}
        automaticallyAdjustKeyboardInsets
      >
        <AppTopBar activeHref="/(app)/home" />

        <View style={styles.header}>
          <AppText style={styles.eyebrow}>List results</AppText>
          <AppText style={styles.title}>
            {result.venue_name || result.list_title || "Scanned wine list"}
          </AppText>
          <AppText style={styles.subtitle}>
            Filter the parsed list, review the live top 3, and browse the full list
            in original order.
          </AppText>
        </View>

        {result.score_summary.warning ? (
          <View style={styles.warningCard}>
            <AppText style={styles.warningEyebrow}>Match scoring</AppText>
            <AppText style={styles.warningText}>{result.score_summary.warning}</AppText>
          </View>
        ) : null}

        <View style={styles.sectionCard}>
          <View style={styles.filterHeaderRow}>
            <View style={styles.filterHeaderText}>
              <AppText style={styles.sectionEyebrow}>Filters</AppText>
              <AppText style={styles.sectionTitle}>Narrow the scanned list</AppText>
            </View>

            <Pressable
              style={styles.filterToggleButton}
              onPress={toggleFiltersVisibility}
            >
              <View style={styles.filterToggleIconWrap}>
                <Feather name="sliders" size={16} color={colors.textPrimary} />
              </View>
              <AppText style={styles.filterToggleButtonText}>
                {filtersVisible ? "Hide filters" : "Show filters"}
              </AppText>
              {activeFilterCount > 0 ? (
                <View style={styles.filterToggleBadge}>
                  <AppText style={styles.filterToggleBadgeText}>
                    {activeFilterCount}
                  </AppText>
                </View>
              ) : null}
            </Pressable>
          </View>

          {filtersVisible ? (
            <View style={styles.filterGrid}>
              <View style={[styles.filterGridItem, { width: getFilterCardWidth(priceOpen) }]}>
                <FilterDropdown
                  label="Price"
                  summary={buildPriceSummary(visibleFilters)}
                  open={priceOpen}
                  onToggle={() => setPriceOpen((current) => !current)}
                >
                  <View style={styles.segmentRow}>
                    {[
                      { value: "any", label: "Any" },
                      { value: "under", label: "Under" },
                      { value: "between", label: "Between" },
                      { value: "over", label: "Over" },
                    ].map((option) => {
                      const selected = filters.price_mode === option.value;
                      return (
                        <Pressable
                          key={option.value}
                          style={[
                            styles.segmentButton,
                            selected ? styles.segmentButtonActive : null,
                          ]}
                          onPress={() =>
                            setFilters((current) => ({
                              ...current,
                              price_mode: option.value as ListScanFilters["price_mode"],
                            }))
                          }
                        >
                          <AppText
                            style={[
                              styles.segmentButtonText,
                              selected ? styles.segmentButtonTextActive : null,
                            ]}
                          >
                            {option.label}
                          </AppText>
                        </Pressable>
                      );
                    })}
                  </View>

                  {(filters.price_mode === "under" || filters.price_mode === "between") && (
                    <DoneTextInput
                      value={formatPriceInputValue(
                        filters.price_mode === "under" ? filters.price_max : filters.price_min
                      )}
                      onChangeText={(value) =>
                        setFilters((current) => ({
                          ...current,
                          [current.price_mode === "under" ? "price_max" : "price_min"]:
                            value.trim() === "" ? null : Number(value),
                        }))
                      }
                      placeholder={filters.price_mode === "under" ? "Max price" : "Min price"}
                      placeholderTextColor={colors.textSecondary}
                      keyboardType="decimal-pad"
                      style={styles.filterInput}
                    />
                  )}

                  {(filters.price_mode === "between" || filters.price_mode === "over") && (
                    <DoneTextInput
                      value={formatPriceInputValue(
                        filters.price_mode === "over" ? filters.price_min : filters.price_max
                      )}
                      onChangeText={(value) =>
                        setFilters((current) => ({
                          ...current,
                          [current.price_mode === "over" ? "price_min" : "price_max"]:
                            value.trim() === "" ? null : Number(value),
                        }))
                      }
                      placeholder={filters.price_mode === "over" ? "Min price" : "Max price"}
                      placeholderTextColor={colors.textSecondary}
                      keyboardType="decimal-pad"
                      style={styles.filterInput}
                    />
                  )}
                </FilterDropdown>
              </View>

              {hasWineTypeOptions ? (
                <View
                  style={[styles.filterGridItem, { width: getFilterCardWidth(wineTypeOpen) }]}
                >
                  <FilterDropdown
                    label="Wine type"
                    summary={buildWineTypeSummary(
                      visibleFilters.included_wine_types,
                      availableWineTypes
                    )}
                    open={wineTypeOpen}
                    onToggle={() => setWineTypeOpen((current) => !current)}
                  >
                    <View style={styles.segmentRow}>
                      {availableWineTypes.map((type) => {
                        const selected = visibleFilters.included_wine_types.includes(type);
                        const toneStyles = getWineTypeSegmentToneStyles(type, selected);
                        return (
                          <Pressable
                            key={type}
                            style={[
                              styles.segmentButton,
                              toneStyles.button,
                            ]}
                            onPress={() =>
                              setFilters((current) => ({
                                ...current,
                                included_wine_types: current.included_wine_types.includes(type)
                                  ? current.included_wine_types.filter((value) => value !== type)
                                  : [...current.included_wine_types, type],
                              }))
                            }
                          >
                            <AppText
                              style={[styles.segmentButtonText, toneStyles.text]}
                            >
                              {listScanWineTypeLabels[type]}
                            </AppText>
                          </Pressable>
                        );
                      })}
                    </View>
                  </FilterDropdown>
                </View>
              ) : null}

              {hasVarietalOptions ? (
                <View
                  style={[styles.filterGridItem, { width: getFilterCardWidth(varietalOpen) }]}
                >
                  <FacetMultiSelect
                    label="Varietal"
                    placeholder="Type a varietal from this list"
                    options={availableVarietals}
                    selected={visibleFilters.selected_varietals}
                    onChange={(selected_varietals) =>
                      setFilters((current) => ({ ...current, selected_varietals }))
                    }
                    getOptionTone={(option) =>
                      getListScanVarietalAccentTone(option, varietalAccentMap)
                    }
                    open={varietalOpen}
                    onOpenChange={setVarietalOpen}
                  />
                </View>
              ) : null}

              {hasRegionOptions ? (
                <View
                  style={[styles.filterGridItem, { width: getFilterCardWidth(regionOpen) }]}
                >
                  <RegionFilterSelect
                    regionGroups={regionGroups}
                    selected={visibleFilters.selected_regions}
                    onChange={(selected_regions) =>
                      setFilters((current) => ({ ...current, selected_regions }))
                    }
                    open={regionOpen}
                    onOpenChange={setRegionOpen}
                  />
                </View>
              ) : null}

              <View style={[styles.filterGridItem, { width: getFilterCardWidth(matchOpen) }]}>
                <FilterDropdown
                  label="Match"
                  summary={buildMatchSummary(visibleFilters)}
                  open={matchOpen}
                  onToggle={() => setMatchOpen((current) => !current)}
                >
                  <View style={styles.matchInputRow}>
                    <AppText style={styles.matchHelperText}>Show wines over</AppText>
                    <DoneTextInput
                      value={
                        filters.min_match_percent > 0
                          ? String(filters.min_match_percent)
                          : ""
                      }
                      onChangeText={(value) => {
                        const trimmed = value.trim();
                        const nextValue = trimmed === "" ? 0 : Number(trimmed);
                        setFilters((current) => ({
                          ...current,
                          min_match_percent: Number.isFinite(nextValue)
                            ? Math.max(0, Math.min(100, Math.round(nextValue)))
                            : current.min_match_percent,
                        }));
                      }}
                      placeholder="0"
                      placeholderTextColor={colors.textSecondary}
                      keyboardType="number-pad"
                      style={styles.matchInput}
                    />
                    <AppText style={styles.matchHelperText}>%</AppText>
                  </View>

                </FilterDropdown>
              </View>
            </View>
          ) : (
            <View style={styles.filterCollapsedNote}>
              <AppText style={styles.filterCollapsedNoteText}>
                {activeFilterCount > 0
                  ? `${activeFilterCount} filter ${
                      activeFilterCount === 1 ? "setting is" : "settings are"
                    } active. Open the filter icon to adjust them.`
                  : "Filters start hidden to keep the page focused. Open the filter icon whenever you want to narrow by price, wine type, varietal, region, or match."}
              </AppText>
            </View>
          )}
        </View>

        <View style={styles.sectionCard}>
          <View style={styles.sectionHeaderRow}>
            <View>
              <AppText style={styles.sectionEyebrow}>Top 3</AppText>
              <AppText style={styles.sectionTitle}>Current recommendations</AppText>
            </View>
          </View>

          {topRecommendations.length > 0 ? (
            <View style={styles.recommendationStack}>
              {topRecommendations.map((wine, index) => {
                const display = getListScanDisplayLines(wine);
                const structured = getListScanStructuredMeta(wine);
                const detailLine =
                  display.subtitle ??
                  [display.wineName, display.producer].filter(Boolean).join(" · ");
                const metaLine = [structured.primaryVarietal, structured.displayRegion]
                  .filter(Boolean)
                  .join(" · ");
                return (
                  <View key={wine.id} style={styles.recommendationCard}>
                    <View style={styles.recommendationTopRow}>
                      <AppText style={styles.recommendationEyebrow}>
                        Recommendation {index + 1}
                      </AppText>
                      <View style={styles.matchBadge}>
                        <AppText style={styles.matchBadgeText}>{wine.match_percent}%</AppText>
                      </View>
                    </View>

                    <View style={styles.recommendationTitleRow}>
                      <View style={styles.recommendationTitleWrap}>
                        <AppText numberOfLines={2} style={styles.recommendationTitle}>
                          {display.title}
                        </AppText>
                        {detailLine ? (
                          <AppText numberOfLines={2} style={styles.recommendationSubtitle}>
                            {detailLine}
                          </AppText>
                        ) : null}
                        {metaLine ? (
                          <AppText numberOfLines={1} style={styles.recommendationMeta}>
                            {metaLine}
                          </AppText>
                        ) : null}
                      </View>
                      <AppText numberOfLines={1} style={styles.recommendationPrice}>
                        {formatPriceDisplay(wine.price_display, wine.menu_label)}
                      </AppText>
                    </View>

                    {recommendationNotes[wine.id] ? (
                      <View style={styles.recommendationNoteRow}>
                        <AppText style={styles.recommendationNoteBullet}>•</AppText>
                        <AppText style={styles.recommendationNoteText}>
                          {recommendationNotes[wine.id]}
                        </AppText>
                      </View>
                    ) : null}
                  </View>
                );
              })}
            </View>
          ) : (
            <View style={styles.infoCardCompact}>
              <AppText style={styles.infoText}>No wines match the current filters.</AppText>
            </View>
          )}
        </View>

        <View style={styles.sectionCard}>
          <View>
            <AppText style={styles.sectionEyebrow}>Full list</AppText>
            <AppText style={styles.sectionTitle}>
              Filtered wines in uploaded list order
            </AppText>
            <AppText style={styles.sectionCounterBelow}>
              {filteredWines.length} of {result.wines.length} shown
            </AppText>
          </View>

          <View style={styles.tableHead}>
            <AppText style={[styles.tableHeadText, styles.tableWineColumn]}>Wine</AppText>
            <AppText style={[styles.tableHeadText, styles.tablePriceHead]}>Price</AppText>
            <AppText style={[styles.tableHeadText, styles.tableMatchHead]}>% match</AppText>
          </View>

          <View style={styles.tableWrap}>
            <ScrollView nestedScrollEnabled style={styles.tableScroll}>
              {filteredWines.length > 0 ? (
                (() => {
                  let lastSectionType: string | null = null;
                  return filteredWines.map((wine) => {
                    const highlighted = highlightedIds.has(wine.id);
                    const display = getListScanDisplayLines(wine);
                    const structured = getListScanStructuredMeta(wine);
                    const sourceDetailLine = display.subtitle ?? display.wineName;
                    const detailLine =
                      sourceDetailLine &&
                      sourceDetailLine.localeCompare(display.title, undefined, {
                        sensitivity: "base",
                      }) !== 0
                        ? sourceDetailLine
                        : null;
                    const metaLine = [
                      structured.primaryVarietal,
                      structured.displayRegion,
                    ]
                      .filter(Boolean)
                      .join(" · ");
                    const resolvedType = resolveListScanWineType(wine);
                    const showSectionHeader = resolvedType !== lastSectionType;
                    lastSectionType = resolvedType;

                    return (
                      <View key={wine.id}>
                        {showSectionHeader ? (
                          <View style={styles.tableSectionHeader}>
                            <AppText style={styles.tableSectionHeaderText}>
                              {getListScanSectionTitle(resolvedType)}
                            </AppText>
                          </View>
                        ) : null}
                        <View style={styles.tableRow}>
                          <View style={styles.tableWineColumn}>
                            <AppText
                              numberOfLines={3}
                              style={[
                                styles.tableWineText,
                                highlighted ? styles.tableWineTextHighlighted : null,
                              ]}
                            >
                              {display.title}
                            </AppText>
                            {detailLine ? (
                              <AppText numberOfLines={2} style={styles.tableSubText}>
                                {detailLine}
                              </AppText>
                            ) : null}
                            {metaLine ? (
                              <AppText numberOfLines={1} style={styles.tableSubText}>
                                {metaLine}
                              </AppText>
                            ) : null}
                          </View>
                          <View style={styles.tablePriceColumn}>
                            <AppText
                              style={[
                                styles.tableCellText,
                                highlighted ? styles.tableWineTextHighlighted : null,
                              ]}
                            >
                              {formatPriceDisplay(wine.price_display, wine.menu_label)}
                            </AppText>
                          </View>
                          <View style={styles.tableMatchColumn}>
                            <AppText
                              style={[
                                styles.tableMatchText,
                                highlighted ? styles.tableWineTextHighlighted : null,
                              ]}
                            >
                              {wine.match_percent}%
                            </AppText>
                          </View>
                        </View>
                      </View>
                    );
                  });
                })()
              ) : (
                <View style={styles.infoCardCompact}>
                  <AppText style={styles.infoText}>No wines match the current filters.</AppText>
                </View>
              )}
            </ScrollView>
          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.screenBg,
  },
  content: {
    paddingHorizontal: 20,
    paddingTop: 18,
    paddingBottom: 42,
    gap: 18,
  },
  header: {
    gap: 8,
  },
  eyebrow: {
    color: colors.accentSecondary,
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 3,
    textTransform: "uppercase",
  },
  title: {
    color: colors.textPrimary,
    fontSize: 28,
    lineHeight: 34,
    fontWeight: "700",
  },
  subtitle: {
    color: colors.textSecondary,
    fontSize: 14,
    lineHeight: 21,
  },
  warningCard: {
    borderRadius: 24,
    borderWidth: 1,
    borderColor: "rgba(123,29,58,0.24)",
    backgroundColor: "rgba(123,29,58,0.12)",
    padding: 16,
    gap: 8,
  },
  warningEyebrow: {
    color: colors.accentSecondary,
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 2,
    textTransform: "uppercase",
  },
  warningText: {
    color: colors.screenBg,
    fontSize: 13,
    lineHeight: 20,
  },
  sectionCard: {
    borderRadius: 28,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.border,
    padding: 18,
    gap: 14,
  },
  sectionEyebrow: {
    color: colors.textSecondary,
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 2.2,
    textTransform: "uppercase",
  },
  sectionTitle: {
    color: colors.textPrimary,
    fontSize: 22,
    lineHeight: 28,
    fontWeight: "700",
  },
  sectionHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 14,
  },
  filterHeaderRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 14,
  },
  filterHeaderText: {
    flex: 1,
    gap: 4,
  },
  filterToggleButton: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    gap: 10,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    backgroundColor: colors.surfaceTinted,
    paddingLeft: 10,
    paddingRight: 14,
    paddingVertical: 8,
  },
  filterToggleIconWrap: {
    width: 34,
    height: 34,
    borderRadius: 17,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
  },
  filterToggleButtonText: {
    color: colors.textPrimary,
    fontSize: 13,
    fontWeight: "700",
  },
  filterToggleBadge: {
    minWidth: 22,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.border,
    paddingHorizontal: 7,
    paddingVertical: 3,
    alignItems: "center",
  },
  filterToggleBadgeText: {
    color: colors.textPrimary,
    fontSize: 11,
    fontWeight: "700",
  },
  filterCollapsedNote: {
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceTinted,
    paddingHorizontal: 14,
    paddingVertical: 14,
  },
  filterCollapsedNoteText: {
    color: colors.textSecondary,
    fontSize: 13,
    lineHeight: 19,
  },
  filterGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "flex-start",
    justifyContent: "space-between",
    rowGap: 12,
    width: "100%",
  },
  filterGridItem: {
    alignSelf: "flex-start",
  },
  sectionCounter: {
    color: colors.textSecondary,
    fontSize: 12,
    fontWeight: "600",
  },
  sectionCounterBelow: {
    color: colors.textSecondary,
    fontSize: 13,
    fontWeight: "600",
    marginTop: 4,
  },
  tableSectionHeader: {
    paddingVertical: 8,
    paddingHorizontal: 2,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    backgroundColor: colors.border,
  },
  tableSectionHeaderText: {
    color: colors.textSecondary,
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 2.2,
    textTransform: "uppercase",
  },
  filterDropdown: {
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceTinted,
    overflow: "hidden",
  },
  filterDropdownHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 14,
  },
  filterDropdownHeaderText: {
    flex: 1,
    gap: 4,
  },
  filterLabel: {
    color: colors.textSecondary,
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 2,
    textTransform: "uppercase",
  },
  filterSummary: {
    color: colors.textPrimary,
    fontSize: 14,
    lineHeight: 20,
    fontWeight: "600",
  },
  filterChevron: {
    color: colors.textSecondary,
    fontSize: 16,
    fontWeight: "700",
  },
  filterDropdownBody: {
    gap: 10,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    padding: 14,
  },
  filterDoneRow: {
    alignItems: "flex-end",
    marginTop: 2,
  },
  filterDoneButton: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  filterDoneButtonText: {
    color: colors.textPrimary,
    fontSize: 13,
    fontWeight: "700",
  },
  segmentRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  segmentButton: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  segmentButtonActive: {
    borderColor: colors.accentPrimary,
    backgroundColor: colors.accentPrimary,
  },
  segmentButtonWhite: {
    borderColor: "rgba(201,168,76,0.30)",
    backgroundColor: "rgba(201,168,76,0.08)",
  },
  segmentButtonWhiteActive: {
    borderColor: "rgba(201,168,76,0.70)",
    backgroundColor: "rgba(201,168,76,0.18)",
  },
  segmentButtonRose: {
    borderColor: "rgba(199,104,134,0.35)",
    backgroundColor: "rgba(199,104,134,0.10)",
  },
  segmentButtonRoseActive: {
    borderColor: "rgba(199,104,134,0.72)",
    backgroundColor: "rgba(199,104,134,0.18)",
  },
  segmentButtonOrange: {
    borderColor: "rgba(209,122,42,0.35)",
    backgroundColor: "rgba(209,122,42,0.10)",
  },
  segmentButtonOrangeActive: {
    borderColor: "rgba(209,122,42,0.75)",
    backgroundColor: "rgba(209,122,42,0.18)",
  },
  segmentButtonRed: {
    borderColor: colors.borderStrong,
    backgroundColor: colors.accentSoft,
  },
  segmentButtonRedActive: {
    borderColor: colors.accentPurple,
    backgroundColor: colors.accentPurple,
  },
  segmentButtonDisabled: {
    opacity: 0.35,
  },
  segmentButtonText: {
    color: colors.textPrimary,
    fontSize: 13,
    fontWeight: "700",
  },
  segmentButtonTextActive: {
    color: colors.screenBg,
  },
  segmentButtonTextWhite: {
    color: colors.accentGold,
  },
  segmentButtonTextWhiteActive: {
    color: colors.accentGold,
  },
  segmentButtonTextRose: {
    color: "#f1bfd0",
  },
  segmentButtonTextRoseActive: {
    color: "#fde5ec",
  },
  segmentButtonTextOrange: {
    color: colors.accentGold,
  },
  segmentButtonTextOrangeActive: {
    color: "#fde6c7",
  },
  segmentButtonTextRed: {
    color: "#dbcfe7",
  },
  segmentButtonTextRedActive: {
    color: "#f3eef8",
  },
  filterInput: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.screenBg,
    color: colors.textPrimary,
    paddingHorizontal: 12,
    paddingVertical: 11,
    fontSize: 14,
  },
  matchInputRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  matchHelperText: {
    color: colors.textSecondary,
    fontSize: 14,
    lineHeight: 20,
  },
  matchInput: {
    minWidth: 72,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.screenBg,
    color: colors.textPrimary,
    paddingHorizontal: 12,
    paddingVertical: 11,
    fontSize: 14,
    textAlign: "center",
  },
  switchRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 14,
  },
  switchLabel: {
    flex: 1,
    color: colors.textPrimary,
    fontSize: 14,
    lineHeight: 20,
    fontWeight: "600",
  },
  recommendationStack: {
    gap: 8,
  },
  recommendationCard: {
    borderRadius: 24,
    borderWidth: 1,
    borderColor: "rgba(45,125,70,0.22)",
    backgroundColor: "rgba(45,125,70,0.08)",
    padding: 10,
    gap: 6,
  },
  recommendationTopRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
    minWidth: 0,
  },
  recommendationEyebrow: {
    color: colors.success,
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 2,
    textTransform: "uppercase",
  },
  recommendationTitleRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
  },
  recommendationTitleWrap: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  recommendationTitle: {
    color: colors.textPrimary,
    fontSize: 15,
    lineHeight: 20,
    fontWeight: "700",
  },
  recommendationSubtitle: {
    color: colors.textSecondary,
    fontSize: 11,
    lineHeight: 16,
  },
  recommendationMeta: {
    color: colors.textSecondary,
    fontSize: 12,
    lineHeight: 16,
  },
  recommendationPrice: {
    color: colors.success,
    fontSize: 14,
    lineHeight: 20,
    fontWeight: "700",
    textAlign: "right",
  },
  matchBadge: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(45,125,70,0.25)",
    backgroundColor: "rgba(45,125,70,0.14)",
    paddingHorizontal: 10,
    paddingVertical: 6,
    alignSelf: "flex-start",
  },
  matchBadgeText: {
    color: colors.success,
    fontSize: 13,
    fontWeight: "700",
  },
  recommendationBody: {
    color: colors.textPrimary,
    fontSize: 11,
    lineHeight: 16,
  },
  recommendationNoteRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
  },
  recommendationNoteBullet: {
    color: colors.textPrimary,
    fontSize: 16,
    lineHeight: 21,
    fontWeight: "700",
  },
  recommendationNoteText: {
    flex: 1,
    color: colors.textPrimary,
    fontSize: 11,
    lineHeight: 16,
  },
  tableHead: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  tableHeadText: {
    color: colors.textSecondary,
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 2,
    textTransform: "uppercase",
  },
  tablePriceHead: {
    width: 62,
    textAlign: "center",
  },
  tableMatchHead: {
    width: 52,
    fontSize: 10,
    letterSpacing: 1.2,
    textAlign: "right",
  },
  tableWrap: {
    maxHeight: 420,
  },
  tableScroll: {
    flexGrow: 0,
  },
  tableRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  tableWineColumn: {
    flex: 1.85,
    minWidth: 0,
  },
  tablePriceColumn: {
    width: 56,
    alignItems: "flex-end",
  },
  tableMatchColumn: {
    width: 48,
    alignItems: "flex-end",
  },
  tableWineText: {
    color: colors.textPrimary,
    fontSize: 14,
    lineHeight: 19,
    fontWeight: "600",
  },
  tableWineTextHighlighted: {
    color: colors.success,
    fontWeight: "700",
  },
  tableSubText: {
    color: colors.textSecondary,
    fontSize: 11,
    marginTop: 3,
    lineHeight: 15,
  },
  tableCellText: {
    color: colors.textPrimary,
    fontSize: 13,
    fontWeight: "600",
    lineHeight: 18,
  },
  tableMatchText: {
    color: colors.textSecondary,
    fontSize: 13,
    fontWeight: "700",
    lineHeight: 18,
  },
  infoCard: {
    borderRadius: 24,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.border,
    padding: 18,
    gap: 14,
  },
  infoCardCompact: {
    paddingVertical: 16,
  },
  infoText: {
    color: colors.textSecondary,
    fontSize: 14,
    lineHeight: 20,
  },
  primaryButton: {
    alignSelf: "flex-start",
    borderRadius: 999,
    backgroundColor: colors.accentPrimary,
    paddingHorizontal: 18,
    paddingVertical: 12,
  },
  primaryButtonText: {
    color: colors.screenBg,
    fontSize: 15,
    fontWeight: "700",
  },
});

import { useMemo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, View } from "react-native";
import type { ListScanRegionGroup } from "@cellarsnap/shared";
import { AppText } from "@/src/components/AppText";
import { colors } from "@/src/lib/theme";

type RegionFilterSelectProps = {
  regionGroups: ListScanRegionGroup[];
  selected: string[];
  onChange: (next: string[]) => void;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
};

function buildRegionSummary(
  regionGroups: ListScanRegionGroup[],
  selected: string[]
) {
  const allRegions = regionGroups.flatMap((g) => [
    g.country,
    ...g.subRegions,
  ]);
  if (allRegions.length === 0) {
    return "No options found";
  }
  if (selected.length === 0) {
    return "All available";
  }
  if (selected.length <= 2) {
    return selected.join(", ");
  }
  return `${selected.slice(0, 2).join(", ")} +${selected.length - 2}`;
}

export default function RegionFilterSelect({
  regionGroups,
  selected,
  onChange,
  open: controlledOpen,
  onOpenChange,
}: RegionFilterSelectProps) {
  const [internalOpen, setInternalOpen] = useState(false);
  const [expandedCountry, setExpandedCountry] = useState<string | null>(null);

  const open = controlledOpen ?? internalOpen;
  const setOpen = onOpenChange ?? setInternalOpen;

  const summary = useMemo(
    () => buildRegionSummary(regionGroups, selected),
    [regionGroups, selected]
  );

  const selectedSet = useMemo(() => new Set(selected), [selected]);

  const getSelectableRegions = (group: ListScanRegionGroup) =>
    group.subRegions.length > 0 ? group.subRegions : [group.country];

  const isCountryFullySelected = (group: ListScanRegionGroup) => {
    const regions = getSelectableRegions(group);
    return regions.every((r) => selectedSet.has(r));
  };

  const isCountryPartiallySelected = (group: ListScanRegionGroup) => {
    const regions = getSelectableRegions(group);
    return (
      regions.some((r) => selectedSet.has(r)) &&
      !isCountryFullySelected(group)
    );
  };

  const handleCountryPress = (group: ListScanRegionGroup) => {
    const regions = getSelectableRegions(group);

    if (expandedCountry === group.country) {
      const toRemove = new Set(regions);
      onChange(selected.filter((r) => !toRemove.has(r)));
      setExpandedCountry(null);
    } else {
      const newSelected = new Set(selected);
      regions.forEach((r) => newSelected.add(r));
      onChange(Array.from(newSelected));
      setExpandedCountry(group.country);
    }
  };

  const handleSubRegionToggle = (region: string) => {
    if (selectedSet.has(region)) {
      onChange(selected.filter((r) => r !== region));
    } else {
      onChange([...selected, region]);
    }
  };

  const expandedGroup = regionGroups.find(
    (g) => g.country === expandedCountry
  );

  return (
    <View style={styles.card}>
      <Pressable style={styles.header} onPress={() => setOpen(!open)}>
        <View style={styles.headerText}>
          <AppText style={styles.label}>Region</AppText>
          <AppText numberOfLines={1} style={styles.summaryText}>
            {summary}
          </AppText>
        </View>
        <AppText style={styles.chevron}>{open ? "v" : ">"}</AppText>
      </Pressable>

      {open ? (
        <View style={styles.body}>
          {regionGroups.length > 0 ? (
            <>
              {/* Country chips */}
              <View style={styles.countryChipWrap}>
                {regionGroups.map((group) => {
                  const isExpanded = expandedCountry === group.country;
                  const fullySelected = isCountryFullySelected(group);
                  const partiallySelected = isCountryPartiallySelected(group);

                  let chipStyle: typeof styles.countryChip = styles.countryChip;
                  let textStyle: typeof styles.countryChipText | typeof styles.countryChipTextActive = styles.countryChipText;
                  if (isExpanded || fullySelected) {
                    chipStyle = styles.countryChipActive;
                    textStyle = styles.countryChipTextActive;
                  } else if (partiallySelected) {
                    chipStyle = styles.countryChipPartial;
                    textStyle = styles.countryChipTextPartial;
                  }

                  return (
                    <Pressable
                      key={group.country}
                      style={chipStyle}
                      onPress={() => handleCountryPress(group)}
                    >
                      <AppText style={textStyle}>
                        {group.country}
                        {group.subRegions.length > 0
                          ? ` (${group.subRegions.length})`
                          : ""}
                      </AppText>
                    </Pressable>
                  );
                })}
              </View>

              {/* Sub-regions for expanded country */}
              {expandedGroup && expandedGroup.subRegions.length > 0 ? (
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  style={styles.subRegionScroll}
                  contentContainerStyle={styles.subRegionScrollContent}
                >
                  <View style={styles.subRegionColumnWrap}>
                    {expandedGroup.subRegions.map((region) => {
                      const isSelected = selectedSet.has(region);
                      return (
                        <Pressable
                          key={region}
                          style={[
                            styles.subRegionChip,
                            isSelected
                              ? styles.subRegionChipActive
                              : null,
                          ]}
                          onPress={() => handleSubRegionToggle(region)}
                        >
                          <AppText
                            numberOfLines={1}
                            style={[
                              styles.subRegionText,
                              isSelected
                                ? styles.subRegionTextActive
                                : null,
                            ]}
                          >
                            {region}
                          </AppText>
                        </Pressable>
                      );
                    })}
                  </View>
                </ScrollView>
              ) : null}
            </>
          ) : (
            <AppText style={styles.emptyText}>
              No regions were parsed from this list.
            </AppText>
          )}

          <View style={styles.doneRow}>
            <Pressable
              style={styles.doneButton}
              onPress={() => setOpen(false)}
            >
              <AppText style={styles.doneButtonText}>Done</AppText>
            </Pressable>
          </View>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "rgba(44,26,14,0.10)",
    backgroundColor: "rgba(44, 26, 14, 0.05)",
    overflow: "hidden",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 14,
  },
  headerText: {
    flex: 1,
    gap: 4,
  },
  label: {
    color: colors.fog,
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 2,
    textTransform: "uppercase",
  },
  summaryText: {
    color: colors.terroir,
    fontSize: 14,
    lineHeight: 20,
    fontWeight: "600",
  },
  chevron: {
    color: colors.fog,
    fontSize: 16,
    fontWeight: "700",
  },
  body: {
    gap: 10,
    borderTopWidth: 1,
    borderTopColor: "rgba(44,26,14,0.08)",
    padding: 14,
  },
  countryChipWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  countryChip: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(44,26,14,0.10)",
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  countryChipActive: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(45,125,70,0.50)",
    backgroundColor: "rgba(45,125,70,0.12)",
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  countryChipPartial: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(45,125,70,0.25)",
    backgroundColor: "rgba(45,125,70,0.06)",
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  countryChipText: {
    color: colors.terroir,
    fontSize: 12,
    fontWeight: "700",
  },
  countryChipTextActive: {
    color: colors.success,
    fontSize: 12,
    fontWeight: "700",
  },
  countryChipTextPartial: {
    color: colors.success,
    fontSize: 12,
    fontWeight: "700",
  },
  subRegionScroll: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.inputBorder,
    backgroundColor: colors.limestone,
  },
  subRegionScrollContent: {
    padding: 6,
  },
  subRegionColumnWrap: {
    flexDirection: "column",
    flexWrap: "wrap",
    maxHeight: 120,
    gap: 6,
  },
  subRegionChip: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(44,26,14,0.08)",
    backgroundColor: "rgba(44,26,14,0.06)",
    paddingHorizontal: 10,
    paddingVertical: 7,
    width: 130,
  },
  subRegionChipActive: {
    borderColor: "rgba(45,125,70,0.40)",
    backgroundColor: "rgba(45,125,70,0.12)",
  },
  subRegionText: {
    color: colors.fog,
    fontSize: 11,
  },
  subRegionTextActive: {
    color: colors.success,
  },
  emptyText: {
    color: colors.fog,
    fontSize: 13,
    lineHeight: 18,
  },
  doneRow: {
    alignItems: "flex-end",
    marginTop: 2,
  },
  doneButton: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(44,26,14,0.10)",
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  doneButtonText: {
    color: colors.terroir,
    fontSize: 13,
    fontWeight: "700",
  },
});

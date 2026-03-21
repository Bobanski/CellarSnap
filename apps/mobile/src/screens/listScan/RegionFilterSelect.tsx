import { useMemo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, View } from "react-native";
import {
  getListScanRegionSelectionState,
  type ListScanRegionGroup,
} from "@cellarsnap/shared";
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
  if (regionGroups.length === 0) {
    return "No options found";
  }
  const { country, subRegions } = getListScanRegionSelectionState(
    selected,
    regionGroups
  );
  if (!country) {
    return "All available";
  }
  if (subRegions.length === 0) {
    return country;
  }
  if (subRegions.length <= 2) {
    return `${country}, ${subRegions.join(", ")}`;
  }
  return `${country}, ${subRegions.slice(0, 2).join(", ")} +${
    subRegions.length - 2
  }`;
}

export default function RegionFilterSelect({
  regionGroups,
  selected,
  onChange,
  open: controlledOpen,
  onOpenChange,
}: RegionFilterSelectProps) {
  const [internalOpen, setInternalOpen] = useState(false);

  const open = controlledOpen ?? internalOpen;
  const setOpen = onOpenChange ?? setInternalOpen;

  const summary = useMemo(
    () => buildRegionSummary(regionGroups, selected),
    [regionGroups, selected]
  );
  const selectionState = useMemo(
    () => getListScanRegionSelectionState(selected, regionGroups),
    [regionGroups, selected]
  );
  const selectedCountry = selectionState.country;
  const selectedSubRegions = selectionState.subRegions;
  const expandedGroup = selectionState.countryGroup;

  const handleCountryPress = (group: ListScanRegionGroup) => {
    if (selectedCountry === group.country) {
      onChange([]);
      return;
    }

    onChange([group.country]);
  };

  const handleSubRegionToggle = (region: string) => {
    if (!selectedCountry) {
      return;
    }

    if (selectedSubRegions.includes(region)) {
      onChange([
        selectedCountry,
        ...selectedSubRegions.filter((value) => value !== region),
      ]);
    } else {
      onChange([selectedCountry, ...selectedSubRegions, region]);
    }
  };

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
                  const isActive = selectedCountry === group.country;

                  return (
                    <Pressable
                      key={group.country}
                      style={[
                        styles.countryChip,
                        isActive ? styles.countryChipActive : null,
                      ]}
                      onPress={() => handleCountryPress(group)}
                    >
                      <AppText
                        style={[
                          styles.countryChipText,
                          isActive ? styles.countryChipTextActive : null,
                        ]}
                      >
                        {group.country}
                        {group.subRegions.length > 0
                          ? ` (${group.subRegions.length})`
                          : ""}
                      </AppText>
                    </Pressable>
                  );
                })}
              </View>

              {/* Sub-regions for selected country */}
              {selectedCountry && expandedGroup && expandedGroup.subRegions.length > 0 ? (
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  style={styles.subRegionScroll}
                  contentContainerStyle={styles.subRegionScrollContent}
                >
                  <View style={styles.subRegionColumnWrap}>
                    <AppText style={styles.subRegionHeading}>
                      Regions in {selectedCountry}
                    </AppText>
                    {expandedGroup.subRegions.map((region) => {
                      const isSelected = selectedSubRegions.includes(region);
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
              ) : !selectedCountry ? (
                <AppText style={styles.emptyHint}>
                  Select a country to reveal its regions.
                </AppText>
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
    borderColor: colors.border,
    backgroundColor: colors.surfaceTinted,
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
    color: colors.textSecondary,
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 2,
    textTransform: "uppercase",
  },
  summaryText: {
    color: colors.textPrimary,
    fontSize: 14,
    lineHeight: 20,
    fontWeight: "600",
  },
  chevron: {
    color: colors.textSecondary,
    fontSize: 16,
    fontWeight: "700",
  },
  body: {
    gap: 10,
    borderTopWidth: 1,
    borderTopColor: colors.border,
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
    borderColor: colors.border,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  countryChipActive: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(45,125,70,0.22)",
    backgroundColor: "rgba(45,125,70,0.16)",
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  countryChipText: {
    color: colors.textPrimary,
    fontSize: 12,
    fontWeight: "700",
  },
  countryChipTextActive: {
    color: colors.success,
    fontSize: 12,
    fontWeight: "700",
  },
  subRegionScroll: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.inputBorder,
    backgroundColor: colors.surfaceRaised,
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
  subRegionHeading: {
    color: colors.textSecondary,
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 2,
    textTransform: "uppercase",
    width: "100%",
    marginBottom: 2,
  },
  subRegionChip: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.border,
    paddingHorizontal: 10,
    paddingVertical: 7,
    width: 130,
  },
  subRegionChipActive: {
    borderColor: "rgba(45,125,70,0.40)",
    backgroundColor: "rgba(45,125,70,0.12)",
  },
  subRegionText: {
    color: colors.textSecondary,
    fontSize: 11,
  },
  subRegionTextActive: {
    color: colors.success,
  },
  emptyHint: {
    color: colors.textSecondary,
    fontSize: 13,
    lineHeight: 18,
  },
  emptyText: {
    color: colors.textSecondary,
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
    borderColor: colors.border,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  doneButtonText: {
    color: colors.textPrimary,
    fontSize: 13,
    fontWeight: "700",
  },
});

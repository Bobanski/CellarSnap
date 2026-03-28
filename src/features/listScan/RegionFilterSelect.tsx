"use client";

import { useMemo, useState } from "react";
import {
  getListScanRegionSelectionState,
  type ListScanRegionGroup,
} from "@shared";

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
    <div className="w-full overflow-hidden rounded-2xl border border-[var(--color-border)] bg-black/25">
      <button
        type="button"
        className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
      >
        <span className="min-w-0 flex-1">
          <span className="block text-xs font-semibold uppercase tracking-[0.18em] text-[var(--color-text-tertiary)]">
            Region
          </span>
          <span className="mt-1 block truncate text-sm font-semibold text-[var(--color-text-primary)]">
            {summary}
          </span>
        </span>
        <span className="text-sm font-semibold text-[var(--color-text-secondary)]">
          {open ? "v" : ">"}
        </span>
      </button>

      {open ? (
        <div className="space-y-3 border-t border-white/8 p-4">
          {regionGroups.length > 0 ? (
            <>
              {/* Country chips */}
              <div className="flex flex-wrap gap-2">
                {regionGroups.map((group) => {
                  const isActive = selectedCountry === group.country;
                  const chipClasses = isActive
                    ? "border border-[var(--color-success)]/50 bg-[var(--color-success)]/12 text-[var(--color-success)]"
                    : "border border-[var(--color-border)] text-[var(--color-text-primary)] hover:border-white/25";

                  return (
                    <button
                      key={group.country}
                      type="button"
                      className={`rounded-full px-3 py-1.5 text-xs font-semibold transition ${chipClasses}`}
                      onClick={() => handleCountryPress(group)}
                    >
                      {group.country}
                      {group.subRegions.length > 0 ? (
                        <span className="ml-1 text-[10px] opacity-60">
                          ({group.subRegions.length})
                        </span>
                      ) : null}
                    </button>
                  );
                })}
              </div>

              {/* Sub-regions for selected country */}
              {selectedCountry && expandedGroup && expandedGroup.subRegions.length > 0 ? (
                <div className="overflow-x-auto rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface-primary)] p-2">
                  <div className="px-2 pb-2 text-xs font-semibold uppercase tracking-[0.16em] text-[var(--color-text-tertiary)]">
                    Regions in {selectedCountry}
                  </div>
                  <div className="flex max-h-[120px] flex-col flex-wrap gap-1.5">
                    {expandedGroup.subRegions.map((region) => {
                      const isSelected = selectedSubRegions.includes(region);
                      return (
                        <button
                          key={region}
                          type="button"
                          className={`w-[140px] shrink-0 rounded-xl border px-2.5 py-1.5 text-left text-xs transition ${
                            isSelected
                              ? "border-[var(--color-success)]/40 bg-[var(--color-success)]/12 text-[var(--color-success)]"
                              : "border-[var(--color-border)] bg-[var(--color-surface-primary)]/10 text-[var(--color-text-secondary)] hover:border-white/20 hover:bg-white/8"
                          }`}
                          onClick={() => handleSubRegionToggle(region)}
                        >
                          {region}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ) : !selectedCountry ? (
                <p className="text-sm text-[var(--color-text-tertiary)]">
                  Select a country to reveal its regions.
                </p>
              ) : null}
            </>
          ) : (
            <p className="text-sm text-[var(--color-text-tertiary)]">
              No regions were parsed from this list.
            </p>
          )}

          <div className="flex justify-end">
            <button
              type="button"
              className="rounded-full border border-[var(--color-border)] px-4 py-2 text-sm font-semibold text-[var(--color-text-primary)] transition hover:border-[var(--color-border-strong)]"
              onClick={() => setOpen(false)}
            >
              Done
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

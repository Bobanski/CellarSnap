"use client";

import { useMemo, useState } from "react";
import type { ListScanRegionGroup } from "@shared";

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
    return regions.some((r) => selectedSet.has(r)) && !isCountryFullySelected(group);
  };

  const handleCountryPress = (group: ListScanRegionGroup) => {
    const regions = getSelectableRegions(group);

    if (expandedCountry === group.country) {
      // Already expanded - deselect all regions under this country and collapse
      const toRemove = new Set(regions);
      onChange(selected.filter((r) => !toRemove.has(r)));
      setExpandedCountry(null);
    } else {
      // Expand and select all regions under this country
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

  const expandedGroup = regionGroups.find((g) => g.country === expandedCountry);

  return (
    <div className="w-full overflow-hidden rounded-2xl border border-white/10 bg-black/25">
      <button
        type="button"
        className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
      >
        <span className="min-w-0 flex-1">
          <span className="block text-xs font-semibold uppercase tracking-[0.18em] text-zinc-400">
            Region
          </span>
          <span className="mt-1 block truncate text-sm font-semibold text-zinc-100">
            {summary}
          </span>
        </span>
        <span className="text-sm font-semibold text-zinc-300">
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
                  const isExpanded = expandedCountry === group.country;
                  const fullySelected = isCountryFullySelected(group);
                  const partiallySelected = isCountryPartiallySelected(group);

                  let chipClasses =
                    "border border-white/10 text-zinc-200 hover:border-white/25";
                  if (isExpanded || fullySelected) {
                    chipClasses =
                      "border border-emerald-400/50 bg-emerald-400/12 text-emerald-200";
                  } else if (partiallySelected) {
                    chipClasses =
                      "border border-emerald-400/25 bg-emerald-400/6 text-emerald-300/80";
                  }

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

              {/* Sub-regions for expanded country */}
              {expandedGroup && expandedGroup.subRegions.length > 0 ? (
                <div className="overflow-x-auto rounded-2xl border border-white/10 bg-[#171210] p-2">
                  <div className="flex max-h-[120px] flex-col flex-wrap gap-1.5">
                    {expandedGroup.subRegions.map((region) => {
                      const isSelected = selectedSet.has(region);
                      return (
                        <button
                          key={region}
                          type="button"
                          className={`w-[140px] shrink-0 rounded-xl border px-2.5 py-1.5 text-left text-xs transition ${
                            isSelected
                              ? "border-emerald-400/40 bg-emerald-400/12 text-emerald-200"
                              : "border-white/10 bg-white/5 text-zinc-300 hover:border-white/20 hover:bg-white/8"
                          }`}
                          onClick={() => handleSubRegionToggle(region)}
                        >
                          {region}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ) : null}
            </>
          ) : (
            <p className="text-sm text-zinc-500">
              No regions were parsed from this list.
            </p>
          )}

          <div className="flex justify-end">
            <button
              type="button"
              className="rounded-full border border-white/10 px-4 py-2 text-sm font-semibold text-zinc-200 transition hover:border-white/30"
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

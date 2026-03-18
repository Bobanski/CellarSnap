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
  const [expandedCountries, setExpandedCountries] = useState<Set<string>>(
    new Set()
  );

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
      regions.some((r) => selectedSet.has(r)) && !isCountryFullySelected(group)
    );
  };

  const toggleCountryExpanded = (country: string) => {
    setExpandedCountries((prev) => {
      const next = new Set(prev);
      if (next.has(country)) {
        next.delete(country);
      } else {
        next.add(country);
      }
      return next;
    });
  };

  const handleCountryCheckbox = (group: ListScanRegionGroup) => {
    const regions = getSelectableRegions(group);
    if (isCountryFullySelected(group)) {
      const toRemove = new Set(regions);
      onChange(selected.filter((r) => !toRemove.has(r)));
    } else {
      const newSelected = new Set(selected);
      regions.forEach((r) => newSelected.add(r));
      onChange(Array.from(newSelected));
    }
  };

  const handleSubRegionToggle = (region: string) => {
    if (selectedSet.has(region)) {
      onChange(selected.filter((r) => r !== region));
    } else {
      onChange([...selected, region]);
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
        <div className="space-y-1 border-t border-[var(--color-border)] p-3">
          {regionGroups.length > 0 ? (
            <div className="max-h-[320px] space-y-1 overflow-y-auto">
              {regionGroups.map((group) => {
                const isExpanded = expandedCountries.has(group.country);
                const fullySelected = isCountryFullySelected(group);
                const partiallySelected = isCountryPartiallySelected(group);
                const hasSubRegions = group.subRegions.length > 0;

                return (
                  <div key={group.country}>
                    {/* Country row */}
                    <div
                      className={`flex items-center gap-2 rounded-xl px-3 py-2 transition ${
                        fullySelected
                          ? "bg-[var(--color-accent-red)]/20"
                          : partiallySelected
                            ? "bg-[var(--color-accent-red)]/10"
                            : "hover:bg-white/4"
                      }`}
                    >
                      <button
                        type="button"
                        onClick={() => handleCountryCheckbox(group)}
                        className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border transition ${
                          fullySelected
                            ? "border-[var(--color-accent-rose)] bg-[var(--color-accent-rose)] text-white"
                            : partiallySelected
                              ? "border-[var(--color-accent-rose)]/60 bg-[var(--color-accent-rose)]/30 text-white"
                              : "border-white/20 hover:border-white/40"
                        }`}
                        aria-label={`Select all regions in ${group.country}`}
                      >
                        {fullySelected ? (
                          <svg
                            viewBox="0 0 12 12"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                            className="h-2.5 w-2.5"
                          >
                            <path d="M2 6l3 3 5-5" />
                          </svg>
                        ) : partiallySelected ? (
                          <svg
                            viewBox="0 0 12 12"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                            className="h-2.5 w-2.5"
                          >
                            <path d="M3 6h6" />
                          </svg>
                        ) : null}
                      </button>

                      <button
                        type="button"
                        onClick={() =>
                          hasSubRegions
                            ? toggleCountryExpanded(group.country)
                            : handleCountryCheckbox(group)
                        }
                        className="flex min-w-0 flex-1 items-center gap-2 text-left"
                      >
                        <span
                          className={`text-sm font-semibold ${
                            fullySelected || partiallySelected
                              ? "text-[var(--color-text-primary)]"
                              : "text-[var(--color-text-secondary)]"
                          }`}
                        >
                          {group.country}
                        </span>
                        {hasSubRegions ? (
                          <span className="text-[10px] text-[var(--color-text-tertiary)]">
                            {group.subRegions.length}
                          </span>
                        ) : null}
                      </button>

                      {hasSubRegions ? (
                        <button
                          type="button"
                          onClick={() => toggleCountryExpanded(group.country)}
                          className="ml-auto shrink-0 px-1 text-xs text-[var(--color-text-tertiary)] transition hover:text-[var(--color-text-secondary)]"
                          aria-label={
                            isExpanded
                              ? `Collapse ${group.country}`
                              : `Expand ${group.country}`
                          }
                        >
                          <svg
                            viewBox="0 0 12 12"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="1.5"
                            className={`h-3 w-3 transition-transform ${
                              isExpanded ? "rotate-90" : ""
                            }`}
                          >
                            <path d="M4 2l4 4-4 4" />
                          </svg>
                        </button>
                      ) : null}
                    </div>

                    {/* Sub-regions (accordion body) */}
                    {isExpanded && hasSubRegions ? (
                      <div className="ml-6 space-y-0.5 border-l border-[var(--color-border)] py-1 pl-3">
                        {group.subRegions.map((region) => {
                          const isSelected = selectedSet.has(region);
                          return (
                            <button
                              key={region}
                              type="button"
                              onClick={() => handleSubRegionToggle(region)}
                              className={`flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-xs transition ${
                                isSelected
                                  ? "bg-[var(--color-accent-rose)]/10 text-[var(--color-text-primary)]"
                                  : "text-[var(--color-text-tertiary)] hover:bg-white/4 hover:text-[var(--color-text-secondary)]"
                              }`}
                            >
                              <span
                                className={`flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded border transition ${
                                  isSelected
                                    ? "border-[var(--color-accent-rose)] bg-[var(--color-accent-rose)] text-white"
                                    : "border-white/20"
                                }`}
                              >
                                {isSelected ? (
                                  <svg
                                    viewBox="0 0 12 12"
                                    fill="none"
                                    stroke="currentColor"
                                    strokeWidth="2"
                                    className="h-2 w-2"
                                  >
                                    <path d="M2 6l3 3 5-5" />
                                  </svg>
                                ) : null}
                              </span>
                              {region}
                            </button>
                          );
                        })}
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="text-sm text-[var(--color-text-tertiary)]">
              No regions were parsed from this list.
            </p>
          )}

          <div className="flex justify-end pt-2">
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

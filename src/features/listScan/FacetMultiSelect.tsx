"use client";

import { useMemo, useState } from "react";
import type { ListScanFilterAccentTone as FacetOptionTone } from "@shared";

type FacetMultiSelectProps = {
  label: string;
  placeholder: string;
  options: string[];
  selected: string[];
  onChange: (next: string[]) => void;
  getOptionTone?: (option: string) => FacetOptionTone;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
};

function buildSummary(options: string[], selected: string[]) {
  if (options.length === 0) {
    return "No options found";
  }
  if (selected.length === 0 || selected.length === options.length) {
    return "All available";
  }
  if (selected.length <= 2) {
    return selected.join(", ");
  }
  return `${selected.slice(0, 2).join(", ")} +${selected.length - 2}`;
}

export default function FacetMultiSelect({
  label,
  placeholder,
  options,
  selected,
  onChange,
  getOptionTone,
  open: controlledOpen,
  onOpenChange,
}: FacetMultiSelectProps) {
  const [query, setQuery] = useState("");
  const [internalOpen, setInternalOpen] = useState(false);
  const open = controlledOpen ?? internalOpen;
  const setOpen = onOpenChange ?? setInternalOpen;

  const filteredOptions = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return options.filter((option) => {
      if (selected.includes(option)) {
        return false;
      }
      if (!normalizedQuery) {
        return true;
      }
      return option.toLowerCase().includes(normalizedQuery);
    });
  }, [options, query, selected]);

  const summary = useMemo(
    () => buildSummary(options, selected),
    [options, selected]
  );

  const addOption = (value: string) => {
    if (selected.includes(value)) {
      return;
    }
    onChange([...selected, value]);
    setQuery("");
  };

  const removeOption = (value: string) => {
    onChange(selected.filter((item) => item !== value));
  };
  const toggleOpen = () => {
    setOpen(!open);
  };

  const getTokenClasses = (tone: FacetOptionTone) => {
    if (tone === "rose") {
      return "border-[#C76886]/45 bg-[#C76886]/16 text-[#fde5ec]";
    }
    if (tone === "orange") {
      return "border-[#D17A2A]/45 bg-[#D17A2A]/16 text-[#fde6c7]";
    }
    if (tone === "white") {
      return "border-[#C9A84C]/45 bg-[#C9A84C]/16 text-[#f5e8bc]";
    }
    if (tone === "red") {
      return "border-[#4A3060]/60 bg-[#4A3060]/70 text-[#f3eef8]";
    }
    return "border-emerald-400/40 bg-emerald-400/10 text-emerald-100";
  };

  const getSuggestionClasses = (tone: FacetOptionTone) => {
    if (tone === "rose") {
      return "border-[#C76886]/30 bg-[#C76886]/8 text-[#f1bfd0] hover:border-[#C76886]/55 hover:bg-[#C76886]/14";
    }
    if (tone === "orange") {
      return "border-[#D17A2A]/30 bg-[#D17A2A]/8 text-[#f2c78f] hover:border-[#D17A2A]/55 hover:bg-[#D17A2A]/14";
    }
    if (tone === "white") {
      return "border-[#C9A84C]/30 bg-[#C9A84C]/8 text-[#e7d491] hover:border-[#C9A84C]/55 hover:bg-[#C9A84C]/14";
    }
    if (tone === "red") {
      return "border-[#4A3060]/45 bg-[#4A3060]/15 text-[#dbcfe7] hover:border-[#4A3060]/75 hover:bg-[#4A3060]/26";
    }
    return "border-white/10 bg-white/5 text-zinc-200 hover:border-white/20 hover:bg-white/8";
  };

  return (
    <div className="w-full overflow-hidden rounded-2xl border border-white/10 bg-black/25">
      <button
        type="button"
        className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left"
        onClick={toggleOpen}
        aria-expanded={open}
      >
        <span className="min-w-0 flex-1">
          <span className="block text-xs font-semibold uppercase tracking-[0.18em] text-zinc-400">
            {label}
          </span>
          <span className="mt-1 block truncate text-sm font-semibold text-zinc-100">
            {summary}
          </span>
        </span>
        <span className="text-sm font-semibold text-zinc-300">{open ? "v" : ">"}</span>
      </button>

      {open ? (
        <div className="space-y-3 border-t border-white/8 p-4">
          {selected.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {selected.map((value) => {
                const tone = getOptionTone?.(value) ?? "neutral";
                return (
                  <span
                    key={value}
                    className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-semibold ${getTokenClasses(
                      tone
                    )}`}
                  >
                    {value}
                    <button
                      type="button"
                      className="rounded-full border border-white/15 px-1 text-[10px] leading-4 text-zinc-100 transition hover:border-rose-300 hover:text-rose-200"
                      onClick={() => removeOption(value)}
                      aria-label={`Remove ${value}`}
                    >
                      x
                    </button>
                  </span>
                );
              })}
            </div>
          ) : null}

          {options.length > 0 ? (
            <>
              <input
                type="text"
                value={query}
                placeholder={placeholder}
                onChange={(event) => {
                  setQuery(event.target.value);
                }}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && filteredOptions[0]) {
                    event.preventDefault();
                    addOption(filteredOptions[0]);
                  }
                  if (event.key === "Backspace" && query.length === 0 && selected.length > 0) {
                    removeOption(selected[selected.length - 1]);
                  }
                }}
                className="w-full rounded-xl border border-white/10 bg-[#171210] px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-500 focus:border-amber-300/60 focus:outline-none"
              />

              {filteredOptions.length > 0 ? (
                <div className="overflow-x-auto rounded-2xl border border-white/10 bg-[#171210] p-2">
                  <div className="flex max-h-[160px] flex-col flex-wrap gap-1.5">
                    {filteredOptions.map((option) => {
                      const tone = getOptionTone?.(option) ?? "neutral";
                      return (
                        <button
                          key={option}
                          type="button"
                          className={`w-[140px] shrink-0 rounded-xl border px-2.5 py-1.5 text-left text-xs transition ${getSuggestionClasses(
                            tone
                          )}`}
                          onClick={() => addOption(option)}
                        >
                          {option}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ) : (
                <p className="text-sm text-zinc-500">No more matching options.</p>
              )}
            </>
          ) : (
            <p className="text-sm text-zinc-500">No options were parsed from this list.</p>
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

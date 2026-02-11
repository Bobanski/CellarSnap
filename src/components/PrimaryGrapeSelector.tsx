"use client";

import { useEffect, useMemo, useState } from "react";

type GrapeOption = {
  id: string;
  name: string;
};

type PrimaryGrapeSelectorProps = {
  selected: GrapeOption[];
  onChange: (next: GrapeOption[]) => void;
  disabled?: boolean;
};

const MIN_SEARCH_LENGTH = 4;
const MAX_PRIMARY_GRAPES = 3;

export default function PrimaryGrapeSelector({
  selected,
  onChange,
  disabled = false,
}: PrimaryGrapeSelectorProps) {
  const [query, setQuery] = useState("");
  const [isFocused, setIsFocused] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [suggestions, setSuggestions] = useState<GrapeOption[]>([]);

  const canSelectMore = selected.length < MAX_PRIMARY_GRAPES;
  const trimmedQuery = query.trim();
  const shouldSearch =
    !disabled &&
    canSelectMore &&
    trimmedQuery.length >= MIN_SEARCH_LENGTH &&
    isFocused;

  useEffect(() => {
    if (!shouldSearch) {
      setSuggestions([]);
      setIsLoading(false);
      setSearchError(null);
      return;
    }

    const controller = new AbortController();
    const timeout = window.setTimeout(async () => {
      setIsLoading(true);
      setSearchError(null);

      try {
        const response = await fetch(
          `/api/grapes?q=${encodeURIComponent(trimmedQuery)}&limit=8`,
          {
            cache: "no-store",
            signal: controller.signal,
          }
        );

        if (!response.ok) {
          const payload = await response.json().catch(() => null);
          setSuggestions([]);
          setSearchError(
            typeof payload?.error === "string"
              ? payload.error
              : "Unable to search grapes right now."
          );
          return;
        }

        const payload = (await response.json()) as {
          grapes?: GrapeOption[];
        };
        setSuggestions(payload.grapes ?? []);
      } catch (error) {
        if (error instanceof Error && error.name === "AbortError") {
          return;
        }

        setSuggestions([]);
        setSearchError("Unable to search grapes right now.");
      } finally {
        setIsLoading(false);
      }
    }, 180);

    return () => {
      window.clearTimeout(timeout);
      controller.abort();
    };
  }, [shouldSearch, trimmedQuery]);

  const filteredSuggestions = useMemo(
    () => suggestions.filter((option) => !selected.some((item) => item.id === option.id)),
    [selected, suggestions]
  );

  const addSelection = (option: GrapeOption) => {
    if (!canSelectMore || selected.some((item) => item.id === option.id)) {
      return;
    }

    onChange([...selected, option]);
    setQuery("");
    setSuggestions([]);
    setSearchError(null);
  };

  const removeSelection = (id: string) => {
    onChange(selected.filter((item) => item.id !== id));
  };

  const showSuggestions = shouldSearch && (isLoading || filteredSuggestions.length > 0);

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <label className="text-sm font-medium text-zinc-200">Primary grapes</label>
        <span className="text-xs text-zinc-400">
          {selected.length}/{MAX_PRIMARY_GRAPES}
        </span>
      </div>
      <p className="text-xs text-zinc-400">
        Type at least 4 letters to search. Select up to 3 grapes.
      </p>

      <div className="relative rounded-xl border border-white/10 bg-black/30 p-2">
        <div className="flex flex-wrap items-center gap-2">
          {selected.map((item) => (
            <span
              key={item.id}
              className="inline-flex items-center gap-2 rounded-full border border-amber-300/50 bg-amber-300/10 px-3 py-1 text-xs text-amber-100"
            >
              {item.name}
              <button
                type="button"
                className="rounded-full border border-white/20 px-1 text-[10px] leading-4 text-zinc-200 transition hover:border-rose-300 hover:text-rose-200"
                onClick={() => removeSelection(item.id)}
                disabled={disabled}
                aria-label={`Remove ${item.name}`}
              >
                ×
              </button>
            </span>
          ))}

          {canSelectMore ? (
            <input
              type="text"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              onFocus={() => setIsFocused(true)}
              onBlur={() => {
                window.setTimeout(() => setIsFocused(false), 120);
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter" && filteredSuggestions[0]) {
                  event.preventDefault();
                  addSelection(filteredSuggestions[0]);
                }
                if (event.key === "Backspace" && query === "" && selected.length > 0) {
                  removeSelection(selected[selected.length - 1].id);
                }
              }}
              className="min-w-[180px] flex-1 bg-transparent px-2 py-1 text-sm text-zinc-100 placeholder:text-zinc-500 focus:outline-none"
              placeholder="Start typing a grape"
              disabled={disabled}
            />
          ) : (
            <span className="px-2 py-1 text-xs text-zinc-400">
              Maximum primary grapes selected.
            </span>
          )}
        </div>

        {showSuggestions ? (
          <div className="absolute left-2 right-2 top-full z-20 mt-2 max-h-56 overflow-y-auto rounded-xl border border-white/10 bg-[#15100f] p-1 shadow-xl">
            {isLoading ? (
              <p className="px-3 py-2 text-xs text-zinc-400">Searching grapes...</p>
            ) : (
              filteredSuggestions.map((option) => (
                <button
                  key={option.id}
                  type="button"
                  className="block w-full rounded-lg px-3 py-2 text-left text-sm text-zinc-200 transition hover:bg-white/10"
                  onMouseDown={(event) => {
                    event.preventDefault();
                  }}
                  onClick={() => addSelection(option)}
                >
                  {option.name}
                </button>
              ))
            )}
          </div>
        ) : null}
      </div>

      {!isLoading && shouldSearch && filteredSuggestions.length === 0 && !searchError ? (
        <p className="text-xs text-zinc-500">No grape matches found.</p>
      ) : null}

      {searchError ? <p className="text-xs text-rose-300">{searchError}</p> : null}
    </div>
  );
}

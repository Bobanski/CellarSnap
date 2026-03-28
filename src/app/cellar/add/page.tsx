"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  BOTTLE_FORMAT_OPTIONS,
  WINE_REGIONS,
  type BottleFormat,
} from "@shared";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";

const WINE_TYPE_DISPLAY: { value: string; label: string }[] = [
  { value: "red", label: "Red" },
  { value: "white", label: "White" },
  { value: "rose", label: "Rosé" },
  { value: "sparkling", label: "Sparkling" },
  { value: "orange", label: "Orange" },
  { value: "sweet", label: "Sweet / Dessert" },
];

// First ~26 entries in WINE_REGIONS are countries
const WINE_COUNTRIES = WINE_REGIONS.slice(0, 26) as unknown as string[];
const ALL_REGIONS = WINE_REGIONS as unknown as string[];

// ─── AutocompleteInput ─────────────────────────────────────
type AutocompleteInputProps = {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  options?: string[];
  asyncSearch?: (query: string) => Promise<{ label: string; value: string }[]>;
  onSelectItem?: (item: { label: string; value: string }) => void;
  minChars?: number;
  inputClass: string;
};

function AutocompleteInput({
  value,
  onChange,
  placeholder,
  options,
  asyncSearch,
  onSelectItem,
  minChars = 2,
  inputClass,
}: AutocompleteInputProps) {
  const [showDropdown, setShowDropdown] = useState(false);
  const [filteredOptions, setFilteredOptions] = useState<
    { label: string; value: string }[]
  >([]);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const filterOptions = useCallback(
    (query: string) => {
      if (query.length < minChars) {
        setFilteredOptions([]);
        setShowDropdown(false);
        return;
      }

      if (options) {
        const lower = query.toLowerCase();
        const matches = options
          .filter((opt) => opt.toLowerCase().includes(lower))
          .slice(0, 8)
          .map((opt) => ({ label: opt, value: opt }));
        setFilteredOptions(matches);
        setShowDropdown(matches.length > 0);
      }

      if (asyncSearch) {
        if (debounceRef.current) clearTimeout(debounceRef.current);
        debounceRef.current = setTimeout(async () => {
          try {
            const results = await asyncSearch(query);
            setFilteredOptions(results.slice(0, 8));
            setShowDropdown(results.length > 0);
          } catch {
            setFilteredOptions([]);
            setShowDropdown(false);
          }
        }, 250);
      }
    },
    [options, asyncSearch, minChars],
  );

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = e.target.value;
    onChange(newValue);
    filterOptions(newValue);
  };

  const handleSelect = (item: { label: string; value: string }) => {
    onChange(item.label);
    setShowDropdown(false);
    if (onSelectItem) onSelectItem(item);
  };

  // Close dropdown on outside click
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (
        wrapperRef.current &&
        !wrapperRef.current.contains(e.target as Node)
      ) {
        setShowDropdown(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <div ref={wrapperRef} className="relative">
      <input
        type="text"
        value={value}
        onChange={handleChange}
        onFocus={() => {
          if (value.length >= minChars) filterOptions(value);
        }}
        placeholder={placeholder}
        className={inputClass}
        autoComplete="off"
      />
      {showDropdown && filteredOptions.length > 0 && (
        <ul className="absolute z-50 mt-1 w-full overflow-hidden rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-raised)] shadow-lg">
          {filteredOptions.map((item) => (
            <li key={item.value}>
              <button
                type="button"
                className="w-full px-4 py-2.5 text-left text-sm text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-tinted)] transition-colors"
                onMouseDown={(e) => {
                  e.preventDefault();
                  handleSelect(item);
                }}
              >
                {item.label}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ─── Main page ─────────────────────────────────────────────
export default function AddToCellarPage() {
  const router = useRouter();

  const [wineName, setWineName] = useState("");
  const [producer, setProducer] = useState("");
  const [vintage, setVintage] = useState("");
  const [country, setCountry] = useState("");
  const [region, setRegion] = useState("");
  const [wineType, setWineType] = useState("");
  const [varietal, setVarietal] = useState("");
  const [selectedGrapeId, setSelectedGrapeId] = useState<string | null>(null);
  const [quantity, setQuantity] = useState(1);
  const [bottleFormat, setBottleFormat] = useState<BottleFormat>("750ml");

  const [userProducers, setUserProducers] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Fetch user's existing producers on mount for autocomplete
  useEffect(() => {
    async function fetchProducers() {
      try {
        const supabase = createSupabaseBrowserClient();
        const {
          data: { session },
        } = await supabase.auth.getSession();
        if (!session) return;

        const { data } = await supabase
          .from("wine_entries")
          .select("producer")
          .eq("user_id", session.user.id)
          .not("producer", "is", null)
          .order("producer");

        if (data) {
          const producers: string[] = data
            .map((r: { producer: string | null }) => r.producer)
            .filter((p: string | null): p is string =>
              typeof p === "string" && p.trim().length > 0,
            );
          setUserProducers(Array.from(new Set(producers)));
        }
      } catch {
        // Non-critical — autocomplete just won't have suggestions
      }
    }
    fetchProducers();
  }, []);

  // Async grape search via API
  const searchGrapes = useCallback(
    async (query: string): Promise<{ label: string; value: string }[]> => {
      const supabase = createSupabaseBrowserClient();
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) return [];

      const res = await fetch(
        `/api/grapes?q=${encodeURIComponent(query)}&limit=8`,
        {
          headers: { Authorization: `Bearer ${session.access_token}` },
        },
      );
      if (!res.ok) return [];
      const data = await res.json();
      return (data.grapes ?? []).map(
        (g: { id: string; name: string }) => ({
          label: g.name,
          value: g.id,
        }),
      );
    },
    [],
  );

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!wineName.trim()) {
      setError("Wine name is required.");
      return;
    }

    if (vintage && !/^\d{4}$/.test(vintage.trim())) {
      setError("Vintage must be a 4-digit year.");
      return;
    }

    setSubmitting(true);

    try {
      const supabase = createSupabaseBrowserClient();
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session) {
        setError("You must be logged in.");
        setSubmitting(false);
        return;
      }

      const payload: Record<string, unknown> = {
        wine_name: wineName.trim(),
        entry_status: "cellaring",
        cellar_quantity: quantity,
        bottle_format: bottleFormat,
        is_feed_visible: false,
        entry_privacy: "private",
      };

      if (producer.trim()) payload.producer = producer.trim();
      if (vintage.trim()) payload.vintage = vintage.trim();
      if (country.trim()) payload.country = country.trim();
      if (region.trim()) payload.region = region.trim();
      if (wineType) payload.wine_type = wineType;
      if (selectedGrapeId) payload.primary_grape_ids = [selectedGrapeId];

      const res = await fetch("/api/entries", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error || `Failed to save (${res.status})`);
      }

      router.push("/entries");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
      setSubmitting(false);
    }
  }

  const inputClass =
    "w-full rounded-xl border border-[var(--color-border-strong)] bg-[var(--color-surface-raised)] px-4 py-2.5 text-sm text-[var(--color-text-primary)] outline-none focus:border-[var(--color-accent-primary)] transition-colors";

  const labelClass =
    "block text-[9px] font-bold uppercase tracking-[2px] text-[var(--color-text-tertiary)] mb-1.5";

  return (
    <div className="flex min-h-screen flex-col items-center px-4 py-10">
      <div className="w-full max-w-lg">
        {/* Back link */}
        <Link
          href="/entries"
          className="mb-6 inline-flex items-center gap-1 text-xs text-[var(--color-text-tertiary)] hover:text-[var(--color-text-secondary)] transition-colors"
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M19 12H5" />
            <path d="m12 19-7-7 7-7" />
          </svg>
          Back
        </Link>

        {/* Header */}
        <div className="mb-8">
          <p className="text-[9px] font-bold uppercase tracking-[2px] text-[var(--color-text-tertiary)]">
            Cellar
          </p>
          <h1
            className="mt-1 text-2xl font-normal text-[var(--color-text-primary)]"
            style={{ fontFamily: "var(--font-serif)" }}
          >
            Add to your cellar
          </h1>
        </div>

        {/* Error */}
        {error && (
          <div className="mb-4 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">
            {error}
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleSubmit} className="flex flex-col gap-5">
          {/* Wine name */}
          <div>
            <label className={labelClass}>Wine name *</label>
            <input
              type="text"
              value={wineName}
              onChange={(e) => setWineName(e.target.value)}
              placeholder="e.g. Cuvée Les Cailles"
              className={inputClass}
              required
            />
          </div>

          {/* Producer (autocomplete) */}
          <div>
            <label className={labelClass}>Producer</label>
            <AutocompleteInput
              value={producer}
              onChange={setProducer}
              placeholder="e.g. Domaine Robert Chevillon"
              options={userProducers}
              inputClass={inputClass}
            />
          </div>

          {/* Vintage + Wine type row */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelClass}>Vintage</label>
              <input
                type="text"
                value={vintage}
                onChange={(e) => setVintage(e.target.value)}
                placeholder="e.g. 2019"
                maxLength={4}
                inputMode="numeric"
                className={inputClass}
              />
            </div>
            <div>
              <label className={labelClass}>Wine type</label>
              <select
                value={wineType}
                onChange={(e) => setWineType(e.target.value)}
                className={inputClass}
              >
                <option value="">Select...</option>
                {WINE_TYPE_DISPLAY.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Varietal (autocomplete via grape API) */}
          <div>
            <label className={labelClass}>Varietal</label>
            <AutocompleteInput
              value={varietal}
              onChange={(val) => {
                setVarietal(val);
                // Clear grape ID if user edits the text manually
                setSelectedGrapeId(null);
              }}
              placeholder="e.g. Pinot Noir"
              asyncSearch={searchGrapes}
              onSelectItem={(item) => {
                setSelectedGrapeId(item.value);
              }}
              inputClass={inputClass}
            />
          </div>

          {/* Country + Region row (autocomplete) */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelClass}>Country</label>
              <AutocompleteInput
                value={country}
                onChange={setCountry}
                placeholder="e.g. France"
                options={WINE_COUNTRIES}
                inputClass={inputClass}
                minChars={1}
              />
            </div>
            <div>
              <label className={labelClass}>Region</label>
              <AutocompleteInput
                value={region}
                onChange={setRegion}
                placeholder="e.g. Burgundy"
                options={ALL_REGIONS}
                inputClass={inputClass}
              />
            </div>
          </div>

          {/* Quantity + Bottle format row */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelClass}>Quantity</label>
              <input
                type="number"
                value={quantity}
                onChange={(e) =>
                  setQuantity(Math.max(1, parseInt(e.target.value, 10) || 1))
                }
                min={1}
                className={inputClass}
              />
            </div>
            <div>
              <label className={labelClass}>Bottle format</label>
              <select
                value={bottleFormat}
                onChange={(e) => setBottleFormat(e.target.value as BottleFormat)}
                className={inputClass}
              >
                {BOTTLE_FORMAT_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Submit */}
          <button
            type="submit"
            disabled={submitting}
            className="mt-2 flex items-center justify-center rounded-xl bg-[var(--color-accent-primary)] px-5 py-3 text-sm font-semibold text-[var(--color-text-on-accent)] transition-opacity disabled:opacity-50"
          >
            {submitting ? (
              <svg
                className="h-5 w-5 animate-spin"
                viewBox="0 0 24 24"
                fill="none"
              >
                <circle
                  className="opacity-25"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="4"
                />
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                />
              </svg>
            ) : (
              "Add to cellar"
            )}
          </button>
        </form>
      </div>
    </div>
  );
}

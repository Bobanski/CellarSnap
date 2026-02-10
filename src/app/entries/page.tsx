"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { formatConsumedDate } from "@/lib/formatDate";
import Photo from "@/components/Photo";
import NavBar from "@/components/NavBar";
import QprBadge from "@/components/QprBadge";
import RatingBadge from "@/components/RatingBadge";
import type { WineEntryWithUrls } from "@/types/wine";

export default function EntriesPage() {
  const [entries, setEntries] = useState<WineEntryWithUrls[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [sortBy, setSortBy] = useState<"consumed_at" | "rating" | "vintage">(
    "consumed_at"
  );
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");
  const [filterType, setFilterType] = useState<"vintage" | "country" | "rating" | "">("");
  const [filterValue, setFilterValue] = useState<string>("");
  const [filterMin, setFilterMin] = useState<string>("");
  const [filterMax, setFilterMax] = useState<string>("");
  const isRangeFilterActive =
    (filterType === "rating" || filterType === "vintage") &&
    (filterMin !== "" || filterMax !== "");
  const isFilterActive =
    filterType === "country"
      ? filterValue !== ""
      : isRangeFilterActive;

  // Extract unique values for filters
  const uniqueValues = useMemo(() => {
    const vintages = new Set<number>();
    const countries = new Set<string>();
    const ratings = new Set<number>();

    entries.forEach((entry) => {
      if (entry.vintage) vintages.add(Number(entry.vintage));
      if (entry.country) countries.add(entry.country);
      if (entry.rating !== null && entry.rating !== undefined) {
        ratings.add(entry.rating);
      }
    });

    return {
      vintage: Array.from(vintages)
        .sort((a, b) => a - b)
        .map(String),
      country: Array.from(countries).sort(),
      rating: Array.from(ratings)
        .sort((a, b) => a - b)
        .map(String),
    };
  }, [entries]);

  // Filter entries
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
        const value =
          filterType === "vintage"
            ? entry.vintage
              ? Number(entry.vintage)
              : null
            : entry.rating ?? null;
        if (value === null || Number.isNaN(value)) return false;
        return value >= rangeMin && value <= rangeMax;
      });
    }

    return entries;
  }, [entries, filterType, filterValue, filterMin, filterMax]);

  const sortedEntries = useMemo(() => {
    const copy = [...filteredEntries];
    const mult = sortOrder === "asc" ? 1 : -1;

    if (sortBy === "rating") {
      return copy.sort((a, b) => {
        const aValue = a.rating ?? -Infinity;
        const bValue = b.rating ?? -Infinity;
        return mult * (aValue - bValue);
      });
    }

    if (sortBy === "vintage") {
      return copy.sort((a, b) => {
        const aValue = a.vintage ? Number(a.vintage) : -Infinity;
        const bValue = b.vintage ? Number(b.vintage) : -Infinity;
        return mult * (aValue - bValue);
      });
    }

    return copy.sort(
      (a, b) => mult * a.consumed_at.localeCompare(b.consumed_at)
    );
  }, [filteredEntries, sortBy, sortOrder]);

  useEffect(() => {
    let isMounted = true;

    const loadEntries = async () => {
      setLoading(true);
      setErrorMessage(null);
      setNextCursor(null);
      setHasMore(false);

      const response = await fetch("/api/entries?limit=50", { cache: "no-store" });
      if (!response.ok) {
        setErrorMessage("Unable to load entries.");
        setLoading(false);
        return;
      }

      const data = await response.json();
      if (isMounted) {
        setEntries(data.entries ?? []);
        setNextCursor(data.next_cursor ?? null);
        setHasMore(Boolean(data.has_more));
        setLoading(false);
      }
    };

    loadEntries();

    return () => {
      isMounted = false;
    };
  }, []);

  const loadMore = async () => {
    if (!hasMore || loadingMore || !nextCursor) {
      return;
    }

    setLoadingMore(true);
    setErrorMessage(null);
    try {
      const response = await fetch(
        `/api/entries?limit=50&cursor=${encodeURIComponent(nextCursor)}`,
        { cache: "no-store" }
      );
      if (!response.ok) {
        setErrorMessage("Unable to load more entries.");
        return;
      }
      const data = await response.json();
      setEntries((prev) => [...prev, ...(data.entries ?? [])]);
      setNextCursor(data.next_cursor ?? null);
      setHasMore(Boolean(data.has_more));
    } finally {
      setLoadingMore(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#0f0a09] px-6 py-10 text-zinc-100">
      <div className="mx-auto w-full max-w-6xl space-y-8">
        <NavBar />
        <header className="space-y-2">
          <span className="text-xs uppercase tracking-[0.3em] text-amber-300/70">
            Your cellar
          </span>
          <h1 className="text-3xl font-semibold text-zinc-50">
            Curate every pour.
          </h1>
          <p className="text-sm text-zinc-300">
            Track vintage moments, ratings, and places worth revisiting.
          </p>
        </header>

        <section className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-white/10 bg-white/5 p-4 backdrop-blur">
          <div className="flex flex-wrap items-center gap-3">
            <label className="text-xs font-semibold uppercase tracking-[0.2em] text-zinc-400">
              Sort
            </label>
            <select
              className="select-field rounded-full border border-white/10 bg-black/30 px-4 py-2 text-sm text-zinc-200 focus:border-amber-300 focus:outline-none"
              value={sortBy}
              onChange={(event) =>
                setSortBy(
                  event.target.value as "consumed_at" | "rating" | "vintage"
                )
              }
            >
              <option value="consumed_at">Date consumed</option>
              <option value="rating">Rating</option>
              <option value="vintage">Vintage</option>
            </select>
            <select
              className="select-field rounded-full border border-white/10 bg-black/30 px-4 py-2 text-sm text-zinc-200 focus:border-amber-300 focus:outline-none"
              value={sortOrder}
              onChange={(event) =>
                setSortOrder(event.target.value as "asc" | "desc")
              }
            >
              {sortBy === "consumed_at" ? (
                <>
                  <option value="desc">Newest first</option>
                  <option value="asc">Oldest first</option>
                </>
              ) : sortBy === "rating" ? (
                <>
                  <option value="desc">High to low</option>
                  <option value="asc">Low to high</option>
                </>
              ) : (
                <>
                  <option value="desc">Newest first</option>
                  <option value="asc">Oldest first</option>
                </>
              )}
            </select>
          </div>
          <span className="text-xs text-zinc-400">
            {sortedEntries.length} {sortedEntries.length === 1 ? "entry" : "entries"}
          </span>
        </section>

        <section className="flex flex-wrap items-center gap-4 rounded-2xl border border-white/10 bg-white/5 p-4 backdrop-blur">
          <div className="flex flex-wrap items-center gap-3">
            <label className="text-xs font-semibold uppercase tracking-[0.2em] text-zinc-400">
              Filter by
            </label>
            <select
              className="select-field rounded-full border border-white/10 bg-black/30 px-4 py-2 text-sm text-zinc-200 focus:border-amber-300 focus:outline-none"
              value={filterType}
              onChange={(event) => {
                const newFilterType = event.target.value as "vintage" | "country" | "rating" | "";
                setFilterType(newFilterType);
                setFilterValue("");
                setFilterMin("");
                setFilterMax("");
              }}
            >
              <option value="">None</option>
              <option value="vintage">Vintage</option>
              <option value="country">Country</option>
              <option value="rating">Rating</option>
            </select>
            {filterType === "country" && (
              <select
                className="select-field rounded-full border border-white/10 bg-black/30 px-4 py-2 text-sm text-zinc-200 focus:border-amber-300 focus:outline-none"
                value={filterValue}
                onChange={(event) => setFilterValue(event.target.value)}
              >
                <option value="">All</option>
                {uniqueValues.country.map((country) => (
                  <option key={country} value={country}>
                    {country}
                  </option>
                ))}
              </select>
            )}
            {(filterType === "rating" || filterType === "vintage") && (
              <div className="flex flex-wrap items-center gap-2">
                <input
                  className="rounded-full border border-white/10 bg-black/30 px-4 py-2 text-sm text-zinc-200 focus:border-amber-300 focus:outline-none"
                  type="number"
                  inputMode="numeric"
                  placeholder="Min"
                  value={filterMin}
                  onChange={(event) => setFilterMin(event.target.value)}
                />
                <input
                  className="rounded-full border border-white/10 bg-black/30 px-4 py-2 text-sm text-zinc-200 focus:border-amber-300 focus:outline-none"
                  type="number"
                  inputMode="numeric"
                  placeholder="Max"
                  value={filterMax}
                  onChange={(event) => setFilterMax(event.target.value)}
                />
              </div>
            )}
          </div>
        </section>

        {loading ? (
          <div className="rounded-2xl border border-white/10 bg-white/5 p-6 text-sm text-zinc-300">
            Loading entries...
          </div>
        ) : errorMessage ? (
          <div className="rounded-2xl border border-rose-500/30 bg-rose-500/10 p-6 text-sm text-rose-200">
            {errorMessage}
          </div>
        ) : sortedEntries.length === 0 ? (
          <div className="rounded-2xl border border-white/10 bg-white/5 p-8 text-sm text-zinc-300">
            <p>
              {isRangeFilterActive
                ? "There are no wines found in this range."
                : isFilterActive
                  ? hasMore
                    ? "No entries match this filter yet. Try loading more."
                    : "No entries match this filter."
                  : "No entries yet. Add your first bottle!"}
            </p>
            {hasMore ? (
              <button
                type="button"
                onClick={loadMore}
                disabled={loadingMore}
                className="mt-4 inline-flex rounded-full bg-amber-400 px-4 py-2 text-sm font-semibold text-zinc-950 transition hover:bg-amber-300 disabled:opacity-50"
              >
                {loadingMore ? "Loading…" : "Load more"}
              </button>
            ) : null}
          </div>
        ) : (
          <>
            <div className="grid gap-5 md:grid-cols-2">
              {sortedEntries.map((entry) => (
                <Link
                  key={entry.id}
                  href={`/entries/${entry.id}`}
                  className="group flex gap-4 rounded-2xl border border-white/10 bg-white/5 p-5 shadow-[0_20px_50px_-30px_rgba(0,0,0,0.9)] transition hover:-translate-y-0.5 hover:border-amber-300/40"
                >
                  <div className="flex h-24 w-24 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-black/40 text-xs text-zinc-400">
                    {entry.label_image_url ? (
                      <Photo
                        src={entry.label_image_url}
                        alt={entry.wine_name ?? entry.producer ?? "Wine label"}
                        containerClassName="h-full w-full"
                        className="h-full w-full object-cover transition duration-300 group-hover:scale-105"
                        loading="lazy"
                      />
                    ) : (
                      "No photo"
                    )}
                  </div>
                    <div className="flex flex-1 flex-col justify-between">
                      <div>
                        {entry.wine_name ? (
                          <h2 className="text-lg font-semibold text-zinc-50">
                            {entry.wine_name}
                          </h2>
                        ) : null}
                        {entry.producer || entry.vintage ? (
                          <p className="text-sm text-zinc-400">
                            {entry.producer ?? ""}
                            {entry.producer && entry.vintage ? (
                              <span className="text-zinc-500">
                                {" · "}
                                {entry.vintage}
                              </span>
                            ) : entry.vintage ? (
                              <span className="text-zinc-500">{entry.vintage}</span>
                            ) : null}
                          </p>
                        ) : null}
                        {[entry.country, entry.region, entry.appellation].filter(Boolean)
                          .length > 0 ? (
                          <p className="mt-1 text-xs text-zinc-500">
                            {[entry.country, entry.region, entry.appellation]
                              .filter(Boolean)
                              .join(" · ")}
                          </p>
                        ) : null}
                      </div>
                      <div className="flex items-center justify-between gap-2 text-xs text-zinc-400">
                        {((typeof entry.rating === "number" &&
                          !Number.isNaN(entry.rating)) ||
                          entry.qpr_level) ? (
                          <div className="flex flex-wrap items-center gap-1.5">
                            {typeof entry.rating === "number" &&
                            !Number.isNaN(entry.rating) ? (
                              <RatingBadge rating={entry.rating} variant="text" />
                            ) : null}
                            {entry.qpr_level ? <QprBadge level={entry.qpr_level} /> : null}
                          </div>
                        ) : (
                          <span />
                        )}
                        <span>{formatConsumedDate(entry.consumed_at)}</span>
                      </div>
                    </div>
                </Link>
              ))}
            </div>
            {hasMore ? (
              <div className="pt-2">
                <button
                  type="button"
                  onClick={loadMore}
                  disabled={loadingMore}
                  className="inline-flex rounded-full bg-amber-400 px-4 py-2 text-sm font-semibold text-zinc-950 transition hover:bg-amber-300 disabled:opacity-50"
                >
                  {loadingMore ? "Loading…" : "Load more"}
                </button>
              </div>
            ) : null}
          </>
        )}
      </div>
    </div>
  );
}

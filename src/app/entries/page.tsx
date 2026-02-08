"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { formatConsumedDate } from "@/lib/formatDate";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import type { WineEntryWithUrls } from "@/types/wine";

export default function EntriesPage() {
  const router = useRouter();
  const supabase = createSupabaseBrowserClient();
  const [entries, setEntries] = useState<WineEntryWithUrls[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<"consumed_at" | "rating" | "vintage">(
    "consumed_at"
  );
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");

  const sortedEntries = useMemo(() => {
    const copy = [...entries];
    const mult = sortOrder === "asc" ? 1 : -1;

    if (sortBy === "rating") {
      return copy.sort((a, b) => mult * (a.rating - b.rating));
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
  }, [entries, sortBy, sortOrder]);

  useEffect(() => {
    let isMounted = true;

    const loadEntries = async () => {
      setLoading(true);
      setErrorMessage(null);

      const response = await fetch("/api/entries", { cache: "no-store" });
      if (!response.ok) {
        setErrorMessage("Unable to load entries.");
        setLoading(false);
        return;
      }

      const data = await response.json();
      if (isMounted) {
        setEntries(data.entries ?? []);
        setLoading(false);
      }
    };

    loadEntries();

    return () => {
      isMounted = false;
    };
  }, []);

  const onSignOut = async () => {
    await supabase.auth.signOut();
    router.push("/login");
  };

  return (
    <div className="min-h-screen bg-zinc-100 px-6 py-8">
      <div className="mx-auto w-full max-w-5xl space-y-6">
        <header className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold text-zinc-900">Your cellar</h1>
            <p className="text-sm text-zinc-600">
              Track wines, ratings, and memorable sips.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <label className="text-sm font-medium text-zinc-700">
              <span className="sr-only">Sort by</span>
              <select
                className="rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-700"
                value={sortBy}
                onChange={(event) =>
                  setSortBy(
                    event.target.value as "consumed_at" | "rating" | "vintage"
                  )
                }
              >
                <option value="consumed_at">Sort: Date consumed</option>
                <option value="rating">Sort: Rating</option>
                <option value="vintage">Sort: Vintage</option>
              </select>
            </label>
            <label className="text-sm font-medium text-zinc-700">
              <span className="sr-only">Sort order</span>
              <select
                className="rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-700"
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
            </label>
            <Link
              className="rounded-lg border border-zinc-200 px-4 py-2 text-sm font-semibold text-zinc-700 hover:border-zinc-300"
              href="/feed"
            >
              Friends tab
            </Link>
            <Link
              className="text-sm font-medium text-zinc-700"
              href="/profile"
            >
              My profile
            </Link>
            <Link
              className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-zinc-800"
              href="/entries/new"
            >
              New entry
            </Link>
            <button
              className="rounded-lg border border-zinc-200 px-4 py-2 text-sm font-semibold text-zinc-700 hover:border-zinc-300"
              type="button"
              onClick={onSignOut}
            >
              Sign out
            </button>
          </div>
        </header>

        {loading ? (
          <div className="rounded-xl border border-zinc-200 bg-white p-6 text-sm text-zinc-700">
            Loading entries...
          </div>
        ) : errorMessage ? (
          <div className="rounded-xl border border-red-200 bg-white p-6 text-sm text-red-600">
            {errorMessage}
          </div>
        ) : sortedEntries.length === 0 ? (
          <div className="rounded-xl border border-zinc-200 bg-white p-6 text-sm text-zinc-700">
            No entries yet. Add your first bottle!
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            {sortedEntries.map((entry) => (
              <Link
                key={entry.id}
                href={`/entries/${entry.id}`}
                className="flex gap-4 rounded-xl border border-zinc-200 bg-white p-4 shadow-sm transition hover:border-zinc-300"
              >
                <div className="flex h-24 w-24 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-zinc-100 text-xs text-zinc-600">
                  {entry.label_image_url ? (
                    <img
                      src={entry.label_image_url}
                      alt={entry.wine_name ?? entry.producer ?? "Wine label"}
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    "No photo"
                  )}
                </div>
                <div className="flex flex-1 flex-col justify-between">
                  <div>
                    <h2 className="text-lg font-semibold text-zinc-900">
                      {entry.wine_name || "Untitled wine"}
                    </h2>
                    <p className="text-sm text-zinc-500">
                      {entry.producer || "Unknown producer"}
                      {entry.vintage ? (
                        <span className="text-zinc-400">
                          {" · "}
                          {entry.vintage}
                        </span>
                      ) : null}
                    </p>
                  </div>
                  <div className="flex items-center justify-between text-xs text-zinc-500">
                    <span>Rating: {entry.rating}/100</span>
                    <span>{formatConsumedDate(entry.consumed_at)}</span>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

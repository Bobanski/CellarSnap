"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { formatConsumedDate } from "@/lib/formatDate";
import Photo from "@/components/Photo";
import AlertsMenu from "@/components/AlertsMenu";
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
    <div className="min-h-screen bg-[#0f0a09] px-6 py-10 text-zinc-100">
      <div className="mx-auto w-full max-w-6xl space-y-8">
        <header className="flex flex-wrap items-end justify-between gap-6">
          <div className="space-y-2">
            <span className="text-xs uppercase tracking-[0.3em] text-amber-300/70">
              Your cellar
            </span>
            <h1 className="text-3xl font-semibold text-zinc-50">
              Curate every pour.
            </h1>
            <p className="text-sm text-zinc-300">
              Track vintage moments, ratings, and places worth revisiting.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Link
              className="rounded-full border border-amber-300/60 bg-amber-400/10 px-4 py-2 text-sm font-semibold text-amber-200"
              href="/entries"
            >
              My entries
            </Link>
            <Link
              className="rounded-full border border-white/10 px-4 py-2 text-sm font-semibold text-zinc-200 transition hover:border-white/30"
              href="/feed"
            >
              Social Feed
            </Link>
            <Link
              className="rounded-full border border-white/10 px-4 py-2 text-sm font-semibold text-zinc-200 transition hover:border-white/30"
              href="/friends"
            >
              Friends
            </Link>
            <Link
              className="rounded-full border border-white/10 px-4 py-2 text-sm font-semibold text-zinc-200 transition hover:border-white/30"
              href="/entries/new"
            >
              New entry
            </Link>
            <Link
              className="rounded-full border border-white/10 px-4 py-2 text-sm font-semibold text-zinc-200 transition hover:border-white/30"
              href="/profile"
            >
              My profile
            </Link>
            <AlertsMenu />
            <button
              className="rounded-full border border-white/10 px-4 py-2 text-sm font-semibold text-zinc-200 transition hover:border-white/30"
              type="button"
              onClick={onSignOut}
            >
              Sign out
            </button>
          </div>
        </header>

        <section className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-white/10 bg-white/5 p-4 backdrop-blur">
          <div className="flex flex-wrap items-center gap-3">
            <label className="text-xs font-semibold uppercase tracking-[0.2em] text-zinc-400">
              Sort
            </label>
            <select
              className="rounded-full border border-white/10 bg-amber-400 px-4 py-2 text-sm font-semibold text-zinc-950 focus:border-amber-300 focus:outline-none"
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
              className="rounded-full border border-white/10 bg-amber-400 px-4 py-2 text-sm font-semibold text-zinc-950 focus:border-amber-300 focus:outline-none"
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
            No entries yet. Add your first bottle!
          </div>
        ) : (
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
                    <h2 className="text-lg font-semibold text-zinc-50">
                      {entry.wine_name || "Untitled wine"}
                    </h2>
                    <p className="text-sm text-zinc-400">
                      {entry.producer || "Unknown producer"}
                      {entry.vintage ? (
                        <span className="text-zinc-500">
                          {" · "}
                          {entry.vintage}
                        </span>
                      ) : null}
                    </p>
                    <p className="mt-1 text-xs text-zinc-500">
                      {[entry.country, entry.region, entry.appellation]
                        .filter(Boolean)
                        .join(" · ") || "Location not set"}
                    </p>
                  </div>
                  <div className="flex items-center justify-between text-xs text-zinc-400">
                    <span className="rounded-full border border-white/10 px-2 py-1 text-[11px] uppercase tracking-wide">
                      {entry.rating ? `${entry.rating}/100` : "Unrated"}
                    </span>
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

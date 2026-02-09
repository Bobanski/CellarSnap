"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { formatConsumedDate } from "@/lib/formatDate";
import Photo from "@/components/Photo";
import AlertsMenu from "@/components/AlertsMenu";
import type { WineEntryWithUrls } from "@/types/wine";

type FeedEntry = WineEntryWithUrls & {
  author_name: string;
};

type UserOption = {
  id: string;
  display_name: string | null;
};

export default function FeedPage() {
  const [entries, setEntries] = useState<FeedEntry[]>([]);
  const [users, setUsers] = useState<UserOption[]>([]);
  const [currentUserProfile, setCurrentUserProfile] = useState<{
    id: string;
    display_name: string | null;
    email: string | null;
  } | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<UserOption[]>([]);
  const [searching, setSearching] = useState(false);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [feedScope, setFeedScope] = useState<"public" | "friends">("public");

  useEffect(() => {
    const trimmedQuery = searchQuery.trim();
    if (!trimmedQuery) return;

    const timer = setTimeout(async () => {
      setSearching(true);
      const response = await fetch(
        `/api/users?search=${encodeURIComponent(trimmedQuery)}`,
        { cache: "no-store" }
      );
      setSearching(false);
      if (response.ok) {
        const data = await response.json();
        setSearchResults(data.users ?? []);
      } else {
        setSearchResults([]);
      }
    }, 200);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  const userMap = useMemo(() => {
    const map = new Map(users.map((u) => [u.id, u.display_name ?? "Unknown"]));
    if (currentUserProfile) {
      map.set(
        currentUserProfile.id,
        currentUserProfile.display_name ?? "You"
      );
    }
    return map;
  }, [users, currentUserProfile]);

  useEffect(() => {
    let isMounted = true;

    const loadFeed = async () => {
      setLoading(true);
      setErrorMessage(null);

      const [feedResponse, usersResponse, profileResponse] = await Promise.all([
        fetch(`/api/feed?scope=${feedScope}`, { cache: "no-store" }),
        fetch("/api/users", { cache: "no-store" }),
        fetch("/api/profile", { cache: "no-store" }),
      ]);

      if (!feedResponse.ok) {
        setErrorMessage("Unable to load feed.");
        setLoading(false);
        return;
      }

      const feedData = await feedResponse.json();
      const usersData = usersResponse.ok ? await usersResponse.json() : { users: [] };
      const profileData = profileResponse.ok ? await profileResponse.json() : { profile: null };

      if (isMounted) {
        setEntries(feedData.entries ?? []);
        setUsers(usersData.users ?? []);
        setCurrentUserProfile(profileData.profile ?? null);
        setLoading(false);
      }
    };

    loadFeed();

    return () => {
      isMounted = false;
    };
  }, [feedScope]);

  return (
    <div className="min-h-screen bg-[#0f0a09] px-6 py-10 text-zinc-100">
      <div className="mx-auto w-full max-w-6xl space-y-8">
        <header className="flex flex-wrap items-end justify-between gap-6">
          <div className="space-y-2">
            <span className="text-xs uppercase tracking-[0.3em] text-amber-300/70">
              Friends tab
            </span>
            <h1 className="text-3xl font-semibold text-zinc-50">
              What the cellar is sipping.
            </h1>
            <p className="text-sm text-zinc-300">
              Discover what others are enjoying across the app.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <Link
              className="rounded-full border border-white/10 px-4 py-2 text-sm font-semibold text-zinc-200 transition hover:border-white/30"
              href="/entries"
            >
              My entries
            </Link>
            <Link
              className="rounded-full border border-amber-300/60 bg-amber-400/10 px-4 py-2 text-sm font-semibold text-amber-200"
              href="/feed"
            >
              Friends tab
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
          </div>
        </header>

        <div className="rounded-2xl border border-white/10 bg-white/5 p-4 backdrop-blur">
          <label className="mb-2 block text-xs font-semibold uppercase tracking-[0.2em] text-zinc-400">
            Find a friend
          </label>
          <input
            type="search"
            placeholder="Search by username..."
            value={searchQuery}
            onChange={(e) => {
              const value = e.target.value;
              setSearchQuery(value);
              if (!value.trim()) {
                setSearchResults([]);
              }
            }}
            className="w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-500 focus:border-amber-300 focus:outline-none focus:ring-2 focus:ring-amber-300/30"
            aria-describedby="search-results-desc"
          />
          <p id="search-results-desc" className="sr-only">
            Search results appear below; click to open their profile.
          </p>
          {searchQuery.trim() && (
            <div className="mt-3 space-y-1">
              {searching ? (
                <p className="text-sm text-zinc-400">Searching...</p>
              ) : searchResults.length === 0 ? (
                <p className="text-sm text-zinc-400">No friends match your search.</p>
              ) : (
                <ul className="space-y-1">
                  {searchResults.map((u) => (
                    <li key={u.id}>
                      <Link
                        href={`/profile/${u.id}`}
                        className="block rounded-lg px-2 py-1.5 text-sm text-zinc-200 hover:bg-white/10"
                      >
                        {u.display_name ?? "Unknown"}
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setFeedScope("public")}
            className={`rounded-full px-4 py-2 text-sm font-semibold transition ${
              feedScope === "public"
                ? "border border-amber-300/60 bg-amber-400/10 text-amber-200"
                : "border border-white/10 text-zinc-200 hover:border-white/30"
            }`}
          >
            Public feed
          </button>
          <button
            type="button"
            onClick={() => setFeedScope("friends")}
            className={`rounded-full px-4 py-2 text-sm font-semibold transition ${
              feedScope === "friends"
                ? "border border-amber-300/60 bg-amber-400/10 text-amber-200"
                : "border border-white/10 text-zinc-200 hover:border-white/30"
            }`}
          >
            Friends only
          </button>
        </div>

        {loading ? (
          <div className="rounded-2xl border border-white/10 bg-white/5 p-6 text-sm text-zinc-300">
            Loading feed...
          </div>
        ) : errorMessage ? (
          <div className="rounded-2xl border border-rose-500/30 bg-rose-500/10 p-6 text-sm text-rose-200">
            {errorMessage}
          </div>
        ) : entries.length === 0 ? (
          <div className="rounded-2xl border border-white/10 bg-white/5 p-6 text-sm text-zinc-300">
            No entries yet.
          </div>
        ) : (
          <div className="grid gap-5 md:grid-cols-2">
            {entries.map((entry) => (
              <article
                key={entry.id}
                className="group rounded-2xl border border-white/10 bg-white/5 p-5 shadow-[0_20px_50px_-30px_rgba(0,0,0,0.9)] transition hover:-translate-y-0.5 hover:border-amber-300/40"
              >
                <div className="flex items-center justify-between text-xs text-zinc-400">
                  <Link
                    href={`/profile/${entry.user_id}`}
                    className="font-medium text-zinc-200 hover:text-amber-200"
                  >
                    {entry.author_name}
                  </Link>
                  <span>{formatConsumedDate(entry.consumed_at)}</span>
                </div>
                <div className="mt-4 flex gap-4">
                  <div className="flex h-20 w-20 items-center justify-center overflow-hidden rounded-2xl bg-black/40 text-xs text-zinc-400">
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
                      <h2 className="text-base font-semibold text-zinc-50">
                        {entry.wine_name || "Untitled wine"}
                      </h2>
                      <p className="text-sm text-zinc-400">
                        {entry.producer || "Unknown producer"}
                      </p>
                    </div>
                    <div className="text-xs text-zinc-400">
                      <span className="rounded-full border border-white/10 px-2 py-1 text-[11px] uppercase tracking-wide">
                        {entry.rating ? `${entry.rating}/100` : "Unrated"}
                      </span>
                    </div>
                  </div>
                </div>
                <div className="mt-3 text-xs text-zinc-400">
                  Tasted with:{" "}
                  {entry.tasted_with_users && entry.tasted_with_users.length > 0
                    ? entry.tasted_with_users
                        .map(
                          (user) =>
                            user.display_name ?? user.email ?? "Unknown"
                        )
                        .join(", ")
                    : entry.tasted_with_user_ids && entry.tasted_with_user_ids.length > 0
                      ? entry.tasted_with_user_ids
                          .map((id) => userMap.get(id) ?? "Unknown")
                          .join(", ")
                      : "No one listed"}
                </div>
                <div className="mt-4">
                  <Link
                    href={`/entries/${entry.id}`}
                    className="inline-flex rounded-full border border-white/10 px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.18em] text-zinc-200 transition hover:border-amber-300/60 hover:text-amber-200"
                  >
                    View entry
                  </Link>
                </div>
              </article>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

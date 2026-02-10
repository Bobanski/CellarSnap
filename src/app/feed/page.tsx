"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { formatConsumedDate } from "@/lib/formatDate";
import Photo from "@/components/Photo";
import NavBar from "@/components/NavBar";
import QprBadge from "@/components/QprBadge";
import RatingBadge from "@/components/RatingBadge";
import type { WineEntryWithUrls } from "@/types/wine";

const REACTION_EMOJIS = ["🍷", "🔥", "❤️", "👀", "🤝"] as const;

type FeedEntry = WineEntryWithUrls & {
  author_name: string;
  author_avatar_url?: string | null;
  can_react?: boolean;
  reaction_counts?: Record<string, number>;
  my_reactions?: string[];
};

type UserOption = {
  id: string;
  display_name: string | null;
};

export default function FeedPage() {
  const router = useRouter();
  const [entries, setEntries] = useState<FeedEntry[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<UserOption[]>([]);
  const [searching, setSearching] = useState(false);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [feedScope, setFeedScope] = useState<"public" | "friends">("public");
  const [reactionPopupEntryId, setReactionPopupEntryId] = useState<string | null>(null);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);

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

  const toggleReaction = async (entryId: string, emoji: string) => {
    const entry = entries.find((e) => e.id === entryId);
    if (!entry) return;
    const counts = entry.reaction_counts ?? {};
    const mine = entry.my_reactions ?? [];
    const hasMine = mine.includes(emoji);

    const updateEntry = (next: FeedEntry) =>
      setEntries((prev) => prev.map((e) => (e.id === entryId ? next : e)));

    if (hasMine) {
      const res = await fetch(`/api/entries/${entryId}/reactions?emoji=${encodeURIComponent(emoji)}`, {
        method: "DELETE",
      });
      if (!res.ok) return;
      const nextCount = Math.max(0, (counts[emoji] ?? 1) - 1);
      const nextCounts = { ...counts };
      if (nextCount === 0) delete nextCounts[emoji];
      else nextCounts[emoji] = nextCount;
      updateEntry({
        ...entry,
        reaction_counts: nextCounts,
        my_reactions: mine.filter((e) => e !== emoji),
      });
    } else {
      const res = await fetch(`/api/entries/${entryId}/reactions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ emoji }),
      });
      if (!res.ok) return;
      updateEntry({
        ...entry,
        reaction_counts: { ...counts, [emoji]: (counts[emoji] ?? 0) + 1 },
        my_reactions: [...mine, emoji],
      });
    }
    setReactionPopupEntryId(null);
  };

  useEffect(() => {
    let isMounted = true;

    const loadFeed = async () => {
      setLoading(true);
      setErrorMessage(null);
      setNextCursor(null);
      setHasMore(false);

      const feedResponse = await fetch(`/api/feed?scope=${feedScope}&limit=30`, {
        cache: "no-store",
      });

      if (!feedResponse.ok) {
        setErrorMessage("Unable to load feed.");
        setLoading(false);
        return;
      }

      const feedData = await feedResponse.json();

      if (isMounted) {
        setEntries(feedData.entries ?? []);
        setNextCursor(feedData.next_cursor ?? null);
        setHasMore(Boolean(feedData.has_more));
        setLoading(false);
      }
    };

    loadFeed();

    return () => {
      isMounted = false;
    };
  }, [feedScope]);

  const loadMoreFeed = async () => {
    if (!hasMore || loadingMore || !nextCursor) return;
    setLoadingMore(true);
    try {
      const res = await fetch(
        `/api/feed?scope=${feedScope}&limit=30&cursor=${encodeURIComponent(nextCursor)}`,
        { cache: "no-store" }
      );
      if (!res.ok) return;
      const data = await res.json();
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
            Social feed
          </span>
          <h1 className="text-3xl font-semibold text-zinc-50">
            What the cellar is sipping.
          </h1>
          <p className="text-sm text-zinc-300">
            Discover what others are enjoying across the app.
          </p>
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
          <>
          <div className="grid gap-5 md:grid-cols-2">
            {entries.map((entry) => (
              <article
                key={entry.id}
                className="group cursor-pointer rounded-2xl border border-white/10 bg-white/5 p-5 shadow-[0_20px_50px_-30px_rgba(0,0,0,0.9)] transition hover:-translate-y-0.5 hover:border-amber-300/40"
                role="button"
                tabIndex={0}
                onClick={() => router.push(`/entries/${entry.id}?from=feed`)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    router.push(`/entries/${entry.id}?from=feed`);
                  }
                }}
              >
                <div className="flex items-center justify-between gap-3 text-xs text-zinc-400">
                  <div className="flex min-w-0 flex-1 items-center gap-2">
                    <button
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation();
                        router.push(`/profile/${entry.user_id}`);
                      }}
                      className="flex shrink-0 items-center gap-2 rounded-full focus:outline-none focus:ring-2 focus:ring-amber-300/50"
                    >
                      <span className="flex h-8 w-8 shrink-0 overflow-hidden rounded-full border border-white/10 bg-black/40 ring-1 ring-white/5">
                        {entry.author_avatar_url ? (
                          <img
                            src={entry.author_avatar_url}
                            alt=""
                            className="h-full w-full object-cover"
                          />
                        ) : (
                          <span className="flex h-full w-full items-center justify-center text-[10px] font-medium text-zinc-500">
                            {(entry.author_name || "?")[0].toUpperCase()}
                          </span>
                        )}
                      </span>
                      <span className="truncate font-medium text-zinc-200 hover:text-amber-200">
                        {entry.author_name}
                      </span>
                    </button>
                  </div>
                  <span className="shrink-0">{formatConsumedDate(entry.consumed_at)}</span>
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
                      {entry.wine_name ? (
                        <h2 className="text-base font-semibold text-zinc-50">
                          {entry.wine_name}
                        </h2>
                      ) : null}
                      {entry.producer ? (
                        <p className="text-sm text-zinc-400">
                          {entry.producer}
                        </p>
                      ) : null}
                    </div>
                  </div>
                </div>
                {entry.tasted_with_users && entry.tasted_with_users.length > 0 ? (
                  <div className="mt-3 text-xs text-zinc-400">
                    Tasted with:{" "}
                    {entry.tasted_with_users
                      .map((user) => user.display_name ?? user.email ?? "Unknown")
                      .join(", ")}
                  </div>
                ) : null}

                <div className="mt-3 flex flex-wrap items-center justify-between gap-1.5">
                  <div className="flex flex-wrap items-center gap-1.5">
                    {typeof entry.rating === "number" &&
                    !Number.isNaN(entry.rating) ? (
                      <RatingBadge rating={entry.rating} />
                    ) : null}
                    {entry.qpr_level ? <QprBadge level={entry.qpr_level} /> : null}
                  </div>
                  <div className="flex flex-wrap items-center justify-end gap-1.5">
                  {Object.entries(entry.reaction_counts ?? {}).map(([emoji, count]) =>
                    count > 0 ? (
                      entry.can_react ? (
                        <button
                          key={emoji}
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleReaction(entry.id, emoji);
                          }}
                          className={`inline-flex items-baseline gap-0.5 rounded-full border px-2 py-0.5 text-xs transition hover:border-amber-300/50 ${
                            (entry.my_reactions ?? []).includes(emoji)
                              ? "border-amber-300/60 bg-amber-400/20 text-amber-200"
                              : "border-white/10 bg-black/20 text-zinc-300"
                          }`}
                        >
                          <span>{emoji}</span>
                          <span className="text-[10px] font-medium tabular-nums text-zinc-400">
                            {count}
                          </span>
                        </button>
                      ) : (
                        <span
                          key={emoji}
                          className="inline-flex items-baseline gap-0.5 rounded-full border border-white/10 bg-black/20 px-2 py-0.5 text-xs text-zinc-300"
                        >
                          <span>{emoji}</span>
                          <span className="text-[10px] font-medium tabular-nums text-zinc-400">
                            {count}
                          </span>
                        </span>
                      )
                    ) : null
                  )}
                  {entry.can_react ? (
                    <div className="relative">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setReactionPopupEntryId((id) => (id === entry.id ? null : entry.id));
                        }}
                        className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-white/10 bg-black/20 text-zinc-400 transition hover:border-white/20 hover:text-zinc-200"
                        aria-label="Add reaction"
                      >
                        +
                      </button>
                      {reactionPopupEntryId === entry.id ? (
                        <>
                          <div
                            className="fixed inset-0 z-40"
                            aria-hidden
                            onClick={(e) => {
                              e.stopPropagation();
                              setReactionPopupEntryId(null);
                            }}
                          />
                          <div
                            className="absolute bottom-full right-0 z-50 mb-1 flex gap-0.5 rounded-xl border border-white/10 bg-[#1c1917] p-1.5 shadow-xl"
                            role="menu"
                          >
                            {REACTION_EMOJIS.map((emoji) => (
                              <button
                                key={emoji}
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  toggleReaction(entry.id, emoji);
                                }}
                                className={`flex h-8 w-8 items-center justify-center rounded-lg text-lg transition hover:bg-white/10 ${
                                  (entry.my_reactions ?? []).includes(emoji)
                                    ? "bg-amber-400/20"
                                    : ""
                                }`}
                              >
                                {emoji}
                              </button>
                            ))}
                          </div>
                        </>
                      ) : null}
                    </div>
                  ) : null}
                  </div>
                </div>
              </article>
            ))}
          </div>
          {hasMore ? (
            <div className="pt-2">
              <button
                type="button"
                onClick={loadMoreFeed}
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

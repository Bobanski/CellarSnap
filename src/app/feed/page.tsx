"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import type { WineEntryWithUrls } from "@/types/wine";

type FeedEntry = WineEntryWithUrls & {
  author_name: string;
};

export default function FeedPage() {
  const [entries, setEntries] = useState<FeedEntry[]>([]);
  const [users, setUsers] = useState<
    { id: string; display_name: string | null; email: string | null }[]
  >([]);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const userMap = useMemo(
    () =>
      new Map(
        users.map((user) => [
          user.id,
          user.display_name ?? user.email ?? user.id,
        ])
      ),
    [users]
  );

  useEffect(() => {
    let isMounted = true;

    const loadFeed = async () => {
      setLoading(true);
      setErrorMessage(null);

      const [feedResponse, usersResponse] = await Promise.all([
        fetch("/api/feed", { cache: "no-store" }),
        fetch("/api/users", { cache: "no-store" }),
      ]);

      if (!feedResponse.ok) {
        setErrorMessage("Unable to load feed.");
        setLoading(false);
        return;
      }

      const feedData = await feedResponse.json();
      const usersData = usersResponse.ok ? await usersResponse.json() : { users: [] };

      if (isMounted) {
        setEntries(feedData.entries ?? []);
        setUsers(usersData.users ?? []);
        setLoading(false);
      }
    };

    loadFeed();

    return () => {
      isMounted = false;
    };
  }, []);

  return (
    <div className="min-h-screen bg-zinc-100 px-6 py-8">
      <div className="mx-auto w-full max-w-5xl space-y-6">
        <header className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold text-zinc-900">Friends tab</h1>
            <p className="text-sm text-zinc-600">
              See what everyone is tasting right now.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <Link className="text-sm font-medium text-zinc-700" href="/entries">
              My entries
            </Link>
            <Link className="text-sm font-medium text-zinc-700" href="/profile">
              My profile
            </Link>
            <Link
              className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-zinc-800"
              href="/entries/new"
            >
              New entry
            </Link>
          </div>
        </header>

        {loading ? (
          <div className="rounded-xl border border-zinc-200 bg-white p-6 text-sm text-zinc-700">
            Loading feed...
          </div>
        ) : errorMessage ? (
          <div className="rounded-xl border border-red-200 bg-white p-6 text-sm text-red-600">
            {errorMessage}
          </div>
        ) : entries.length === 0 ? (
          <div className="rounded-xl border border-zinc-200 bg-white p-6 text-sm text-zinc-700">
            No entries yet. Be the first to log a wine.
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            {entries.map((entry) => (
              <Link
                key={entry.id}
                href={`/entries/${entry.id}`}
                className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm transition hover:border-zinc-300"
              >
                <div className="flex items-center justify-between text-xs text-zinc-500">
                  <span>{entry.author_name}</span>
                  <span>{entry.consumed_at}</span>
                </div>
                <div className="mt-3 flex gap-4">
                  <div className="flex h-20 w-20 items-center justify-center overflow-hidden rounded-lg bg-zinc-100 text-xs text-zinc-600">
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
                      <h2 className="text-base font-semibold text-zinc-900">
                        {entry.wine_name || "Untitled wine"}
                      </h2>
                      <p className="text-sm text-zinc-500">
                        {entry.producer || "Unknown producer"}
                      </p>
                    </div>
                    <div className="text-xs text-zinc-500">
                      Rating: {entry.rating}/100
                    </div>
                  </div>
                </div>
                <div className="mt-3 text-xs text-zinc-500">
                  Tasted with:{" "}
                  {entry.tasted_with_user_ids && entry.tasted_with_user_ids.length > 0
                    ? entry.tasted_with_user_ids
                        .map((id) => userMap.get(id) ?? id)
                        .join(", ")
                    : "No one listed"}
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

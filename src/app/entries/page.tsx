"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import type { WineEntryWithUrls } from "@/types/wine";

export default function EntriesPage() {
  const router = useRouter();
  const supabase = createSupabaseBrowserClient();
  const [entries, setEntries] = useState<WineEntryWithUrls[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

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
    <div className="min-h-screen bg-zinc-50 px-6 py-8">
      <div className="mx-auto w-full max-w-5xl space-y-6">
        <header className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold text-zinc-900">Your cellar</h1>
            <p className="text-sm text-zinc-500">
              Track wines, ratings, and memorable sips.
            </p>
          </div>
          <div className="flex items-center gap-3">
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
          <div className="rounded-xl border border-zinc-200 bg-white p-6 text-sm text-zinc-500">
            Loading entries...
          </div>
        ) : errorMessage ? (
          <div className="rounded-xl border border-red-200 bg-white p-6 text-sm text-red-600">
            {errorMessage}
          </div>
        ) : entries.length === 0 ? (
          <div className="rounded-xl border border-zinc-200 bg-white p-6 text-sm text-zinc-500">
            No entries yet. Add your first bottle!
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            {entries.map((entry) => (
              <Link
                key={entry.id}
                href={`/entries/${entry.id}`}
                className="flex gap-4 rounded-xl border border-zinc-200 bg-white p-4 shadow-sm transition hover:border-zinc-300"
              >
                <div className="h-24 w-24 shrink-0 overflow-hidden rounded-lg bg-zinc-100">
                  {entry.label_image_url ? (
                    <img
                      src={entry.label_image_url}
                      alt={entry.wine_name ?? entry.producer ?? "Wine label"}
                      className="h-full w-full object-cover"
                    />
                  ) : null}
                </div>
                <div className="flex flex-1 flex-col justify-between">
                  <div>
                    <h2 className="text-lg font-semibold text-zinc-900">
                      {entry.wine_name || "Untitled wine"}
                    </h2>
                    <p className="text-sm text-zinc-500">
                      {entry.producer || "Unknown producer"}
                    </p>
                  </div>
                  <div className="flex items-center justify-between text-xs text-zinc-500">
                    <span>Rating: {entry.rating}/10</span>
                    <span>{entry.consumed_at}</span>
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

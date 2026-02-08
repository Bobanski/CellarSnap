"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { formatConsumedDate } from "@/lib/formatDate";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import type { WineEntryWithUrls } from "@/types/wine";

export default function EntryDetailPage() {
  const router = useRouter();
  const params = useParams<{ id: string | string[] }>();
  const entryId = Array.isArray(params.id) ? params.id[0] : params.id;
  const supabase = createSupabaseBrowserClient();
  const [entry, setEntry] = useState<WineEntryWithUrls | null>(null);
  const [users, setUsers] = useState<
    { id: string; display_name: string | null; email: string | null }[]
  >([]);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const userMap = useMemo(
    () =>
      new Map(
        users.map((user) => [
          user.id,
          user.display_name ?? user.email ?? "Unknown",
        ])
      ),
    [users]
  );

  useEffect(() => {
    let isMounted = true;

    const loadEntry = async () => {
      if (!entryId) {
        setLoading(false);
        setErrorMessage("Entry not found.");
        return;
      }

      setLoading(true);
      setErrorMessage(null);

      const response = await fetch(`/api/entries/${entryId}`, {
        cache: "no-store",
      });

      if (!response.ok) {
        setErrorMessage("Entry not found.");
        setLoading(false);
        return;
      }

      const data = await response.json();
      if (isMounted) {
        setEntry(data.entry);
        setLoading(false);
      }
    };

    loadEntry();

    return () => {
      isMounted = false;
    };
  }, [entryId]);

  useEffect(() => {
    let isMounted = true;

    const loadUsers = async () => {
      const response = await fetch("/api/users", { cache: "no-store" });
      if (!response.ok) {
        return;
      }

      const data = await response.json();
      if (isMounted) {
        setUsers(data.users ?? []);
      }
    };

    loadUsers();

    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    let isMounted = true;

    const loadCurrentUser = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (isMounted) {
        setCurrentUserId(user?.id ?? null);
      }
    };

    loadCurrentUser();

    return () => {
      isMounted = false;
    };
  }, [supabase]);

  const onDelete = async () => {
    if (!entryId) {
      setErrorMessage("Entry not found.");
      return;
    }

    if (!confirm("Delete this entry?")) {
      return;
    }

    const response = await fetch(`/api/entries/${entryId}`, {
      method: "DELETE",
    });

    if (!response.ok) {
      setErrorMessage("Unable to delete entry.");
      return;
    }

    router.push("/entries");
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0f0a09] px-6 py-10 text-zinc-100">
        <div className="mx-auto w-full max-w-3xl rounded-2xl border border-white/10 bg-white/5 p-6 text-sm text-zinc-300">
          Loading entry...
        </div>
      </div>
    );
  }

  if (!entry) {
    return (
      <div className="min-h-screen bg-[#0f0a09] px-6 py-10 text-zinc-100">
        <div className="mx-auto w-full max-w-3xl rounded-2xl border border-rose-500/30 bg-rose-500/10 p-6 text-sm text-rose-200">
          {errorMessage ?? "Entry unavailable."}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0f0a09] px-6 py-10 text-zinc-100">
      <div className="mx-auto w-full max-w-5xl space-y-8">
        <header className="flex flex-wrap items-end justify-between gap-6">
          <div className="space-y-2">
            <span className="text-xs uppercase tracking-[0.3em] text-amber-300/70">
              Cellar entry
            </span>
            <h1 className="text-3xl font-semibold text-zinc-50">
              {entry.wine_name || "Untitled wine"}
            </h1>
            <p className="text-sm text-zinc-300">
              {entry.producer || "Unknown producer"}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            {currentUserId === entry.user_id ? (
              <>
                <Link
                  className="rounded-full border border-white/10 px-4 py-2 text-sm font-semibold text-zinc-200 transition hover:border-white/30"
                  href={`/entries/${entry.id}/edit`}
                >
                  Edit
                </Link>
                <button
                  className="rounded-full border border-rose-500/40 px-4 py-2 text-sm font-semibold text-rose-200 transition hover:border-rose-400"
                  type="button"
                  onClick={onDelete}
                >
                  Delete
                </button>
              </>
            ) : (
              <span className="rounded-full border border-white/10 px-4 py-2 text-xs uppercase tracking-[0.2em] text-zinc-400">
                View only
              </span>
            )}
            <Link
              className="rounded-full border border-white/10 px-4 py-2 text-sm font-semibold text-zinc-200 transition hover:border-white/30"
              href="/entries"
            >
              Back
            </Link>
          </div>
        </header>

        <div className="grid gap-6 lg:grid-cols-2">
          <div className="space-y-5">
            <div className="overflow-hidden rounded-3xl border border-white/10 bg-black/40">
              {entry.label_image_url ? (
                <img
                  src={entry.label_image_url}
                  alt="Wine label"
                  className="h-80 w-full object-cover"
                />
              ) : (
                <div className="flex h-80 items-center justify-center text-sm text-zinc-400">
                  No label photo uploaded.
                </div>
              )}
            </div>
            {entry.place_image_url ? (
              <div className="overflow-hidden rounded-3xl border border-white/10 bg-black/40">
                <img
                  src={entry.place_image_url}
                  alt="Place"
                  className="h-80 w-full object-cover"
                />
              </div>
            ) : null}
          </div>

          <div className="space-y-5 rounded-3xl border border-white/10 bg-white/5 p-6 backdrop-blur">
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <p className="text-xs uppercase tracking-[0.2em] text-zinc-400">
                  Rating
                </p>
                <p className="text-2xl font-semibold text-zinc-50">
                  {entry.rating}/100
                </p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-[0.2em] text-zinc-400">
                  Consumed
                </p>
                <p className="text-lg font-semibold text-zinc-50">
                  {formatConsumedDate(entry.consumed_at)}
                </p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-[0.2em] text-zinc-400">
                  Region
                </p>
                <p className="text-sm text-zinc-200">
                  {entry.region || "Not set"}
                </p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-[0.2em] text-zinc-400">
                  Vintage
                </p>
                <p className="text-sm text-zinc-200">
                  {entry.vintage || "Not set"}
                </p>
              </div>
            </div>

            <div>
              <p className="text-xs uppercase tracking-[0.2em] text-zinc-400">
                Location
              </p>
              <p className="text-sm text-zinc-200">
                {entry.location_text || "Not set"}
              </p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-[0.2em] text-zinc-400">
                Notes
              </p>
              <p className="text-sm text-zinc-200">
                {entry.notes || "Not set"}
              </p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-[0.2em] text-zinc-400">
                Tasted with
              </p>
              <p className="text-sm text-zinc-200">
                {entry.tasted_with_user_ids && entry.tasted_with_user_ids.length > 0
                  ? entry.tasted_with_user_ids
                      .map((id) => userMap.get(id) ?? "Unknown")
                      .join(", ")
                  : "No one listed"}
              </p>
            </div>
          </div>
        </div>

        {errorMessage ? (
          <p className="text-sm text-rose-300">{errorMessage}</p>
        ) : null}
      </div>
    </div>
  );
}

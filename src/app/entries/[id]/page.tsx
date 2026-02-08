"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { formatConsumedDate } from "@/lib/formatDate";
import type { WineEntryWithUrls } from "@/types/wine";

export default function EntryDetailPage() {
  const router = useRouter();
  const params = useParams<{ id: string | string[] }>();
  const entryId = Array.isArray(params.id) ? params.id[0] : params.id;
  const [entry, setEntry] = useState<WineEntryWithUrls | null>(null);
  const [users, setUsers] = useState<
    { id: string; display_name: string | null; email: string | null }[]
  >([]);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

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
      <div className="min-h-screen bg-zinc-100 px-6 py-8">
        <div className="mx-auto w-full max-w-3xl rounded-xl border border-zinc-200 bg-white p-6 text-sm text-zinc-700">
          Loading entry...
        </div>
      </div>
    );
  }

  if (!entry) {
    return (
      <div className="min-h-screen bg-zinc-100 px-6 py-8">
        <div className="mx-auto w-full max-w-3xl rounded-xl border border-red-200 bg-white p-6 text-sm text-red-600">
          {errorMessage ?? "Entry unavailable."}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-100 px-6 py-8">
      <div className="mx-auto w-full max-w-4xl space-y-6">
        <header className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold text-zinc-900">
              {entry.wine_name || "Untitled wine"}
            </h1>
            <p className="text-sm text-zinc-600">
              {entry.producer || "Unknown producer"}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <Link
              className="rounded-lg border border-zinc-200 px-4 py-2 text-sm font-semibold text-zinc-700"
              href={`/entries/${entry.id}/edit`}
            >
              Edit
            </Link>
            <button
              className="rounded-lg border border-red-200 px-4 py-2 text-sm font-semibold text-red-600"
              type="button"
              onClick={onDelete}
            >
              Delete
            </button>
            <Link className="text-sm font-medium text-zinc-600" href="/entries">
              Back
            </Link>
          </div>
        </header>

        <div className="grid gap-6 lg:grid-cols-2">
          <div className="space-y-4">
            <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white">
              {entry.label_image_url ? (
                <img
                  src={entry.label_image_url}
                  alt="Wine label"
                  className="h-72 w-full object-cover"
                />
              ) : (
                <div className="flex h-72 items-center justify-center text-sm text-zinc-600">
                  No label photo uploaded.
                </div>
              )}
            </div>
            {entry.place_image_url ? (
              <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white">
                <img
                  src={entry.place_image_url}
                  alt="Place"
                  className="h-72 w-full object-cover"
                />
              </div>
            ) : null}
          </div>

            <div className="space-y-4 rounded-xl border border-zinc-200 bg-white p-6">
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <p className="text-xs uppercase tracking-wide text-zinc-400">Rating</p>
                <p className="text-lg font-semibold text-zinc-900">
                  {entry.rating}/100
                </p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-wide text-zinc-400">
                  Consumed
                </p>
                <p className="text-lg font-semibold text-zinc-900">
                  {formatConsumedDate(entry.consumed_at)}
                </p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-wide text-zinc-400">Region</p>
                <p className="text-sm text-zinc-700">
                  {entry.region || "Not set"}
                </p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-wide text-zinc-400">Vintage</p>
                <p className="text-sm text-zinc-700">
                  {entry.vintage || "Not set"}
                </p>
              </div>
            </div>

            <div>
              <p className="text-xs uppercase tracking-wide text-zinc-400">Location</p>
              <p className="text-sm text-zinc-700">
                {entry.location_text || "Not set"}
              </p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-wide text-zinc-400">Notes</p>
              <p className="text-sm text-zinc-700">
                {entry.notes || "Not set"}
              </p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-wide text-zinc-400">
                Tasted with
              </p>
              <p className="text-sm text-zinc-700">
                {entry.tasted_with_user_ids && entry.tasted_with_user_ids.length > 0
                  ? entry.tasted_with_user_ids
                      .map((id) => userMap.get(id) ?? id)
                      .join(", ")
                  : "No one listed"}
              </p>
            </div>
          </div>
        </div>

        {errorMessage ? (
          <p className="text-sm text-red-600">{errorMessage}</p>
        ) : null}
      </div>
    </div>
  );
}

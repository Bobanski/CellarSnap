"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { WineEntryWithUrls } from "@/types/wine";

export default function EntryDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const router = useRouter();
  const [entry, setEntry] = useState<WineEntryWithUrls | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;

    const loadEntry = async () => {
      setLoading(true);
      setErrorMessage(null);

      const response = await fetch(`/api/entries/${params.id}`, {
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
  }, [params.id]);

  const onDelete = async () => {
    if (!confirm("Delete this entry?")) {
      return;
    }

    const response = await fetch(`/api/entries/${params.id}`, {
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
      <div className="min-h-screen bg-zinc-50 px-6 py-8">
        <div className="mx-auto w-full max-w-3xl rounded-xl border border-zinc-200 bg-white p-6 text-sm text-zinc-500">
          Loading entry...
        </div>
      </div>
    );
  }

  if (!entry) {
    return (
      <div className="min-h-screen bg-zinc-50 px-6 py-8">
        <div className="mx-auto w-full max-w-3xl rounded-xl border border-red-200 bg-white p-6 text-sm text-red-600">
          {errorMessage ?? "Entry unavailable."}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-50 px-6 py-8">
      <div className="mx-auto w-full max-w-4xl space-y-6">
        <header className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold text-zinc-900">
              {entry.wine_name || "Untitled wine"}
            </h1>
            <p className="text-sm text-zinc-500">
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
              ) : null}
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
                  {entry.rating}/10
                </p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-wide text-zinc-400">
                  Consumed
                </p>
                <p className="text-lg font-semibold text-zinc-900">
                  {entry.consumed_at}
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
          </div>
        </div>

        {errorMessage ? (
          <p className="text-sm text-red-600">{errorMessage}</p>
        ) : null}
      </div>
    </div>
  );
}

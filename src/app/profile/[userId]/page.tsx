"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { formatConsumedDate } from "@/lib/formatDate";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import type { WineEntryWithUrls } from "@/types/wine";

type EntryWithAuthor = WineEntryWithUrls & { author_name?: string };

export default function FriendProfilePage() {
  const router = useRouter();
  const params = useParams<{ userId: string }>();
  const userId = params.userId;
  const supabase = createSupabaseBrowserClient();

  const [profile, setProfile] = useState<{
    id: string;
    display_name: string;
  } | null>(null);
  const [theirEntries, setTheirEntries] = useState<EntryWithAuthor[]>([]);
  const [taggedEntries, setTaggedEntries] = useState<EntryWithAuthor[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    const load = async () => {
      if (!userId) {
        setErrorMessage("Invalid profile.");
        setLoading(false);
        return;
      }

      setLoading(true);
      setErrorMessage(null);

      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        router.push("/login");
        return;
      }

      if (user.id === userId) {
        router.replace("/profile");
        return;
      }

      const [profileRes, entriesRes, taggedRes] = await Promise.all([
        fetch(`/api/users/${userId}`, { cache: "no-store" }),
        fetch(`/api/users/${userId}/entries`, { cache: "no-store" }),
        fetch(`/api/users/${userId}/tagged`, { cache: "no-store" }),
      ]);

      if (!profileRes.ok) {
        if (isMounted) {
          setErrorMessage("Profile not found.");
          setLoading(false);
        }
        return;
      }

      const profileData = await profileRes.json();
      const entriesData = entriesRes.ok ? await entriesRes.json() : { entries: [] };
      const taggedData = taggedRes.ok ? await taggedRes.json() : { entries: [] };

      if (isMounted) {
        setProfile(profileData.profile);
        setTheirEntries(entriesData.entries ?? []);
        setTaggedEntries(taggedData.entries ?? []);
        setLoading(false);
      }
    };

    load();

    return () => {
      isMounted = false;
    };
  }, [userId, router]);

  if (loading) {
    return (
      <div className="min-h-screen bg-zinc-100 px-6 py-8">
        <div className="mx-auto max-w-4xl rounded-xl border border-zinc-200 bg-white p-6 text-sm text-zinc-700">
          Loading profile...
        </div>
      </div>
    );
  }

  if (errorMessage || !profile) {
    return (
      <div className="min-h-screen bg-zinc-100 px-6 py-8">
        <div className="mx-auto max-w-4xl space-y-4">
          <Link
            className="text-sm font-medium text-zinc-600"
            href="/feed"
          >
            ← Back to Friends
          </Link>
          <div className="rounded-xl border border-red-200 bg-white p-6 text-sm text-red-600">
            {errorMessage ?? "Profile not found."}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-100 px-6 py-8">
      <div className="mx-auto max-w-4xl space-y-6">
        <header className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <Link
              className="mb-2 inline-block text-sm font-medium text-zinc-600 hover:text-zinc-900"
              href="/feed"
            >
              ← Back to Friends
            </Link>
            <h1 className="text-2xl font-semibold text-zinc-900">
              {profile.display_name}
            </h1>
            <p className="text-sm text-zinc-600">
              Wines they’ve logged and wines they’ve been tagged in.
            </p>
          </div>
          <Link
            className="rounded-lg border border-zinc-200 px-4 py-2 text-sm font-semibold text-zinc-700 hover:border-zinc-300"
            href="/feed"
          >
            Friends tab
          </Link>
        </header>

        <section className="space-y-4">
          <h2 className="text-lg font-semibold text-zinc-900">
            Wines they’ve uploaded
          </h2>
          {theirEntries.length === 0 ? (
            <div className="rounded-xl border border-zinc-200 bg-white p-6 text-sm text-zinc-500">
              No wines uploaded yet.
            </div>
          ) : (
            <div className="grid gap-4 md:grid-cols-2">
              {theirEntries.map((entry) => (
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
                      <h3 className="font-semibold text-zinc-900">
                        {entry.wine_name || "Untitled wine"}
                      </h3>
                      <p className="text-sm text-zinc-500">
                        {entry.producer || "Unknown producer"}
                        {entry.vintage ? (
                          <span className="text-zinc-400"> · {entry.vintage}</span>
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
        </section>

        <section className="space-y-4">
          <h2 className="text-lg font-semibold text-zinc-900">
            Tagged in by others
          </h2>
          {taggedEntries.length === 0 ? (
            <div className="rounded-xl border border-zinc-200 bg-white p-6 text-sm text-zinc-500">
              Not tagged in any entries yet.
            </div>
          ) : (
            <div className="grid gap-4 md:grid-cols-2">
              {taggedEntries.map((entry) => (
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
                      <p className="text-xs text-zinc-500">
                        Logged by {entry.author_name ?? "Unknown"}
                      </p>
                      <h3 className="font-semibold text-zinc-900">
                        {entry.wine_name || "Untitled wine"}
                      </h3>
                      <p className="text-sm text-zinc-500">
                        {entry.producer || "Unknown producer"}
                        {entry.vintage ? (
                          <span className="text-zinc-400"> · {entry.vintage}</span>
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
        </section>
      </div>
    </div>
  );
}

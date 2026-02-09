"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { formatConsumedDate } from "@/lib/formatDate";
import type { WineEntryWithUrls } from "@/types/wine";
import Photo from "@/components/Photo";
import NavBar from "@/components/NavBar";

type EntryWithAuthor = WineEntryWithUrls & { author_name?: string };

export default function FriendProfilePage() {
  const params = useParams<{ userId: string }>();
  const userId = params.userId;

  const [profile, setProfile] = useState<{
    id: string;
    display_name: string | null;
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
  }, [userId]);

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0f0a09] px-6 py-10 text-zinc-100">
        <div className="mx-auto w-full max-w-6xl space-y-8">
          <NavBar />
          <div className="rounded-2xl border border-white/10 bg-white/5 p-6 text-sm text-zinc-300">
            Loading profile...
          </div>
        </div>
      </div>
    );
  }

  if (errorMessage || !profile) {
    return (
      <div className="min-h-screen bg-[#0f0a09] px-6 py-10 text-zinc-100">
        <div className="mx-auto w-full max-w-6xl space-y-8">
          <NavBar />
          <Link
            className="text-sm font-medium text-zinc-300 hover:text-zinc-50"
            href="/friends"
          >
            ← Back to Friends
          </Link>
          <div className="rounded-2xl border border-rose-500/30 bg-rose-500/10 p-6 text-sm text-rose-200">
            {errorMessage ?? "Profile not found."}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0f0a09] px-6 py-10 text-zinc-100">
      <div className="mx-auto w-full max-w-6xl space-y-8">
        <NavBar />
        <header className="space-y-2">
          <Link
            className="inline-block text-sm font-medium text-zinc-400 hover:text-amber-200"
            href="/friends"
          >
            ← Back to Friends
          </Link>
          <span className="block text-xs uppercase tracking-[0.3em] text-amber-300/70">
            Friend profile
          </span>
          <h1 className="text-3xl font-semibold text-zinc-50">
            {profile.display_name ?? "Unknown"}
          </h1>
          <p className="text-sm text-zinc-300">
            Wines they've logged and wines they've been tagged in.
          </p>
        </header>

        <section className="space-y-4">
          <h2 className="text-lg font-semibold text-zinc-50">
            Wines they've uploaded
          </h2>
          {theirEntries.length === 0 ? (
            <div className="rounded-2xl border border-white/10 bg-white/5 p-6 text-sm text-zinc-400">
              No wines uploaded yet.
            </div>
          ) : (
            <div className="grid gap-5 md:grid-cols-2">
              {theirEntries.map((entry) => (
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
                      <h3 className="font-semibold text-zinc-50">
                        {entry.wine_name || "Untitled wine"}
                      </h3>
                      <p className="text-sm text-zinc-400">
                        {entry.producer || "Unknown producer"}
                        {entry.vintage ? (
                          <span className="text-zinc-500"> · {entry.vintage}</span>
                        ) : null}
                      </p>
                    </div>
                    <div className="flex items-center justify-between text-xs text-zinc-400">
                      <span className="rounded-full border border-white/10 px-2 py-1 text-[11px] uppercase tracking-wide">
                        {entry.rating}/100
                      </span>
                      <span>{formatConsumedDate(entry.consumed_at)}</span>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </section>

        <section className="space-y-4">
          <h2 className="text-lg font-semibold text-zinc-50">
            Tagged in by others
          </h2>
          {taggedEntries.length === 0 ? (
            <div className="rounded-2xl border border-white/10 bg-white/5 p-6 text-sm text-zinc-400">
              Not tagged in any entries yet.
            </div>
          ) : (
            <div className="grid gap-5 md:grid-cols-2">
              {taggedEntries.map((entry) => (
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
                      <p className="text-xs text-zinc-500">
                        Logged by {entry.author_name ?? "Unknown"}
                      </p>
                      <h3 className="font-semibold text-zinc-50">
                        {entry.wine_name || "Untitled wine"}
                      </h3>
                      <p className="text-sm text-zinc-400">
                        {entry.producer || "Unknown producer"}
                        {entry.vintage ? (
                          <span className="text-zinc-500"> · {entry.vintage}</span>
                        ) : null}
                      </p>
                    </div>
                    <div className="flex items-center justify-between text-xs text-zinc-400">
                      <span className="rounded-full border border-white/10 px-2 py-1 text-[11px] uppercase tracking-wide">
                        {entry.rating}/100
                      </span>
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

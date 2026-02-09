"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { formatConsumedDate } from "@/lib/formatDate";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import Photo from "@/components/Photo";
import AlertsMenu from "@/components/AlertsMenu";
import type { WineEntryWithUrls } from "@/types/wine";

type EntryDetail = WineEntryWithUrls & {
  tasted_with_users?: { id: string; display_name: string | null }[];
};

export default function EntryDetailPage() {
  const router = useRouter();
  const params = useParams<{ id: string | string[] }>();
  const entryId = Array.isArray(params.id) ? params.id[0] : params.id;
  const supabase = createSupabaseBrowserClient();
  const [entry, setEntry] = useState<EntryDetail | null>(null);
  const [users, setUsers] = useState<
    { id: string; display_name: string | null }[]
  >([]);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [currentUserProfile, setCurrentUserProfile] = useState<{
    id: string;
    display_name: string | null;
    email: string | null;
  } | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const userMap = useMemo(() => {
    const map = new Map(
      users.map((user) => [
        user.id,
        user.display_name ?? "Unknown",
      ])
    );
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
      const [usersResponse, profileResponse] = await Promise.all([
        fetch("/api/users", { cache: "no-store" }),
        fetch("/api/profile", { cache: "no-store" }),
      ]);
      if (isMounted) {
        if (usersResponse.ok) {
          const data = await usersResponse.json();
          setUsers(data.users ?? []);
        }
        if (profileResponse.ok) {
          const data = await profileResponse.json();
          setCurrentUserProfile(data.profile ?? null);
          setCurrentUserId(data.profile?.id ?? null);
        }
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
        setCurrentUserId((prev) => prev ?? user?.id ?? null);
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

  const isOwner = currentUserId === entry.user_id;

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
            {isOwner ? (
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
            ) : null}
            <Link
              className={
                isOwner
                  ? "rounded-full border border-amber-300/60 bg-amber-400/10 px-4 py-2 text-sm font-semibold text-amber-200"
                  : "rounded-full border border-white/10 px-4 py-2 text-sm font-semibold text-zinc-200 transition hover:border-white/30"
              }
              href="/entries"
            >
              My entries
            </Link>
            <Link
              className={
                !isOwner
                  ? "rounded-full border border-amber-300/60 bg-amber-400/10 px-4 py-2 text-sm font-semibold text-amber-200"
                  : "rounded-full border border-white/10 px-4 py-2 text-sm font-semibold text-zinc-200 transition hover:border-white/30"
              }
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

        <div className="grid gap-6 lg:grid-cols-2">
          <div className="space-y-5">
            <div className="overflow-hidden rounded-3xl border border-white/10 bg-black/40">
              {entry.label_image_url ? (
                <div>
                  <Photo
                    src={entry.label_image_url}
                    alt="Wine label"
                    containerClassName="h-80 w-full"
                    className="h-80 w-full object-cover"
                    loading="eager"
                  />
                  {isOwner ? (
                    <div className="flex items-center justify-between border-t border-white/10 bg-black/30 px-4 py-3 text-xs text-zinc-300">
                      <span>Label photo</span>
                      <a
                        href={entry.label_image_url}
                        download
                        className="rounded-full border border-white/10 px-3 py-1 text-[11px] uppercase tracking-[0.2em] text-zinc-200 transition hover:border-amber-300/60 hover:text-amber-200"
                      >
                        Download
                      </a>
                    </div>
                  ) : (
                    <div className="border-t border-white/10 bg-black/30 px-4 py-3 text-xs text-zinc-300">
                      Label photo
                    </div>
                  )}
                </div>
              ) : (
                <div className="flex h-80 items-center justify-center text-sm text-zinc-400">
                  No label photo uploaded.
                </div>
              )}
            </div>
            {entry.place_image_url ? (
              <div className="overflow-hidden rounded-3xl border border-white/10 bg-black/40">
                <div>
                  <Photo
                    src={entry.place_image_url}
                    alt="Place"
                    containerClassName="h-80 w-full"
                    className="h-80 w-full object-cover"
                    loading="lazy"
                  />
                  {isOwner ? (
                    <div className="flex items-center justify-between border-t border-white/10 bg-black/30 px-4 py-3 text-xs text-zinc-300">
                      <span>Place photo</span>
                      <a
                        href={entry.place_image_url}
                        download
                        className="rounded-full border border-white/10 px-3 py-1 text-[11px] uppercase tracking-[0.2em] text-zinc-200 transition hover:border-amber-300/60 hover:text-amber-200"
                      >
                        Download
                      </a>
                    </div>
                  ) : (
                    <div className="border-t border-white/10 bg-black/30 px-4 py-3 text-xs text-zinc-300">
                      Place photo
                    </div>
                  )}
                </div>
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
                  {entry.rating ? `${entry.rating}/100` : "Unrated"}
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
              <div>
                <p className="text-xs uppercase tracking-[0.2em] text-zinc-400">
                  Country
                </p>
                <p className="text-sm text-zinc-200">
                  {entry.country || "Not set"}
                </p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-[0.2em] text-zinc-400">
                  Appellation
                </p>
                <p className="text-sm text-zinc-200">
                  {entry.appellation || "Not set"}
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
                      .map((id) => {
                        const fromEntry = entry.tasted_with_users?.find(
                          (user) => user.id === id
                        );
                        return (
                          fromEntry?.display_name ??
                          fromEntry?.email ??
                          userMap.get(id) ??
                          "Unknown"
                        );
                      })
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

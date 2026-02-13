"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { formatConsumedDate } from "@/lib/formatDate";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import {
  ADVANCED_NOTE_FIELDS,
  formatAdvancedNoteValue,
  normalizeAdvancedNotes,
  type AdvancedNotes,
} from "@/lib/advancedNotes";
import Photo from "@/components/Photo";
import NavBar from "@/components/NavBar";
import QprBadge from "@/components/QprBadge";
import RatingBadge from "@/components/RatingBadge";
import type { EntryPhoto, WineEntryWithUrls } from "@/types/wine";
import {
  PRICE_PAID_SOURCE_LABELS,
  formatPricePaidAmount,
} from "@/lib/entryMeta";

type EntryDetail = WineEntryWithUrls & {
  tasted_with_users?: { id: string; display_name: string | null }[];
};

type AdvancedNoteField = (typeof ADVANCED_NOTE_FIELDS)[number];
type PopulatedAdvancedNote = AdvancedNoteField & {
  value: NonNullable<AdvancedNotes[AdvancedNoteField["key"]]>;
};

export default function EntryDetailPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const params = useParams<{ id: string | string[] }>();
  const entryId = Array.isArray(params.id) ? params.id[0] : params.id;
  const supabase = createSupabaseBrowserClient();
  const [entry, setEntry] = useState<EntryDetail | null>(null);
  const [photos, setPhotos] = useState<EntryPhoto[]>([]);
  const [photosLoading, setPhotosLoading] = useState(true);
  const [users, setUsers] = useState<
    { id: string; display_name: string | null }[]
  >([]);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [currentUserProfile, setCurrentUserProfile] = useState<{
    id: string;
    display_name: string | null;
    email: string | null;
  } | null>(null);
  const [addingToLog, setAddingToLog] = useState(false);
  const [addToLogEntryId, setAddToLogEntryId] = useState<string | null>(null);
  const [addToLogMessage, setAddToLogMessage] = useState<string | null>(null);
  const [addToLogError, setAddToLogError] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

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

    const loadPhotos = async () => {
      if (!entryId) return;
      setPhotosLoading(true);
      const response = await fetch(`/api/entries/${entryId}/photos`, {
        cache: "no-store",
      });
      if (!response.ok) {
        if (isMounted) {
          setPhotos([]);
          setPhotosLoading(false);
        }
        return;
      }
      const data = await response.json();
      if (isMounted) {
        setPhotos(data.photos ?? []);
        setPhotosLoading(false);
      }
    };

    loadPhotos();

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
        <div className="mx-auto w-full max-w-5xl space-y-8">
          <NavBar />
          <div className="rounded-2xl border border-white/10 bg-white/5 p-6 text-sm text-zinc-300">
            Loading entry...
          </div>
        </div>
      </div>
    );
  }

  if (!entry) {
    return (
      <div className="min-h-screen bg-[#0f0a09] px-6 py-10 text-zinc-100">
        <div className="mx-auto w-full max-w-5xl space-y-8">
          <NavBar />
          <div className="rounded-2xl border border-rose-500/30 bg-rose-500/10 p-6 text-sm text-rose-200">
            {errorMessage ?? "Entry unavailable."}
          </div>
        </div>
      </div>
    );
  }

  const openedFromFeed = searchParams.get("from") === "feed";
  const profileContextUserId = searchParams.get("profile");
  const openedFromProfile =
    searchParams.get("from") === "profile" &&
    typeof profileContextUserId === "string" &&
    /^[0-9a-f-]{36}$/i.test(profileContextUserId);
  const isOwner = currentUserId === entry.user_id;
  const isTagged =
    !isOwner &&
    typeof currentUserId === "string" &&
    Array.isArray(entry.tasted_with_user_ids) &&
    entry.tasted_with_user_ids.includes(currentUserId);
  const backHref = openedFromFeed
    ? "/feed"
    : openedFromProfile
      ? `/profile/${profileContextUserId}`
      : isOwner
        ? "/entries"
        : "/feed";
  const backLabel =
    openedFromFeed || (!isOwner && !openedFromProfile)
      ? "← Back to Social Feed"
      : openedFromProfile
        ? "← Back to Profile"
      : "← Back to My entries";
  const sortByPosition = (list: EntryPhoto[]) =>
    [...list].sort((a, b) => a.position - b.position);
  const labelPhotos = sortByPosition(
    photos.filter((photo) => photo.type === "label")
  );
  const placePhotos = sortByPosition(
    photos.filter((photo) => photo.type === "place")
  );
  const pairingPhotos = sortByPosition(
    photos.filter((photo) => photo.type === "pairing")
  );
  const labelGallery =
    labelPhotos.length > 0
      ? labelPhotos
      : entry.label_image_url
      ? [
          {
            id: "legacy-label",
            entry_id: entry.id,
            type: "label" as const,
            path: "",
            position: 0,
            created_at: entry.created_at,
            signed_url: entry.label_image_url,
          },
        ]
      : [];
  const placeGallery =
    placePhotos.length > 0
      ? placePhotos
      : entry.place_image_url
      ? [
          {
            id: "legacy-place",
            entry_id: entry.id,
            type: "place" as const,
            path: "",
            position: 0,
            created_at: entry.created_at,
            signed_url: entry.place_image_url,
          },
        ]
      : [];
  const pairingGallery =
    pairingPhotos.length > 0
      ? pairingPhotos
      : entry.pairing_image_url
      ? [
          {
            id: "legacy-pairing",
            entry_id: entry.id,
            type: "pairing" as const,
            path: "",
            position: 0,
            created_at: entry.created_at,
            signed_url: entry.pairing_image_url,
          },
        ]
      : [];
  const advancedNotes = normalizeAdvancedNotes(entry.advanced_notes);
  const formattedPricePaid = formatPricePaidAmount(
    entry.price_paid,
    entry.price_paid_currency
  );
  const pricePaidDisplay = formattedPricePaid
    ? entry.price_paid_source
      ? `${formattedPricePaid} (${PRICE_PAID_SOURCE_LABELS[entry.price_paid_source]})`
      : formattedPricePaid
    : null;
  const populatedAdvancedNotes: PopulatedAdvancedNote[] = advancedNotes
    ? ADVANCED_NOTE_FIELDS.reduce<PopulatedAdvancedNote[]>((acc, field) => {
        const value = advancedNotes[field.key];
        if (value !== null) {
          acc.push({ ...field, value });
        }
        return acc;
      }, [])
    : [];
  const primaryGrapeDisplay =
    entry.primary_grapes && entry.primary_grapes.length > 0
      ? [...entry.primary_grapes]
          .sort((a, b) => a.position - b.position)
          .map((grape) => grape.name)
          .join(", ")
      : null;

  return (
    <div className="min-h-screen bg-[#0f0a09] px-6 py-10 text-zinc-100">
      <div className="mx-auto w-full max-w-5xl space-y-8">
        <NavBar activeHrefOverride={openedFromFeed ? "/feed" : null} />
        <div className="flex flex-wrap items-end justify-between gap-6">
          <div className="space-y-2">
            <Link
              className="text-sm font-medium text-zinc-400 hover:text-amber-200"
              href={backHref}
            >
              {backLabel}
            </Link>
            <span className="block text-xs uppercase tracking-[0.3em] text-amber-300/70">
              Cellar entry
            </span>
            <h1 className="text-3xl font-semibold text-zinc-50">
              {entry.wine_name || "Untitled wine"}
            </h1>
            <p className="text-sm text-zinc-300">
              {entry.producer || "Unknown producer"}
            </p>
          </div>
          {isOwner ? (
            <Link
              className="rounded-full border border-white/10 px-4 py-2 text-sm font-semibold text-zinc-200 transition hover:border-white/30"
              href={`/entries/${entry.id}/edit`}
            >
              Edit entry
            </Link>
          ) : null}
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          <div className="space-y-5">
            <div className="overflow-hidden rounded-3xl border border-white/10 bg-black/40">
              {labelGallery.length > 0 ? (
                <div>
                  <Photo
                    src={labelGallery[0].signed_url ?? ""}
                    alt="Wine label"
                    containerClassName="h-80 w-full"
                    className="h-80 w-full object-cover"
                    loading="eager"
                  />
                  <div className="flex items-center justify-between border-t border-white/10 bg-black/30 px-4 py-3 text-xs text-zinc-300">
                    <span>Label photos</span>
                    {isOwner && labelGallery[0].signed_url ? (
                      <a
                        href={labelGallery[0].signed_url}
                        download
                        className="rounded-full border border-white/10 px-3 py-1 text-[11px] uppercase tracking-[0.2em] text-zinc-200 transition hover:border-amber-300/60 hover:text-amber-200"
                      >
                        Download
                      </a>
                    ) : null}
                  </div>
                  {labelGallery.length > 1 ? (
                    <div className="grid gap-2 border-t border-white/10 bg-black/30 p-3 sm:grid-cols-3">
                      {labelGallery.slice(1).map((photo) => (
                        <div
                          key={photo.id}
                          className="overflow-hidden rounded-xl border border-white/10"
                        >
                          {photo.signed_url ? (
                            <img
                              src={photo.signed_url}
                              alt="Label alternate"
                              className="h-24 w-full object-cover"
                            />
                          ) : (
                            <div className="flex h-24 items-center justify-center text-xs text-zinc-400">
                              Photo unavailable
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  ) : null}
                </div>
              ) : photosLoading ? (
                <div className="flex h-80 items-center justify-center text-sm text-zinc-400">
                  Loading photos...
                </div>
              ) : (
                <div className="flex h-80 items-center justify-center text-sm text-zinc-400">
                  No label photo uploaded.
                </div>
              )}
            </div>
            {placeGallery.length > 0 ? (
              <div className="overflow-hidden rounded-3xl border border-white/10 bg-black/40">
                <div>
                  <Photo
                    src={placeGallery[0].signed_url ?? ""}
                    alt="Place"
                    containerClassName="h-80 w-full"
                    className="h-80 w-full object-cover"
                    loading="lazy"
                  />
                  <div className="flex items-center justify-between border-t border-white/10 bg-black/30 px-4 py-3 text-xs text-zinc-300">
                    <span>Place photos</span>
                    {isOwner && placeGallery[0].signed_url ? (
                      <a
                        href={placeGallery[0].signed_url}
                        download
                        className="rounded-full border border-white/10 px-3 py-1 text-[11px] uppercase tracking-[0.2em] text-zinc-200 transition hover:border-amber-300/60 hover:text-amber-200"
                      >
                        Download
                      </a>
                    ) : null}
                  </div>
                  {placeGallery.length > 1 ? (
                    <div className="grid gap-2 border-t border-white/10 bg-black/30 p-3 sm:grid-cols-3">
                      {placeGallery.slice(1).map((photo) => (
                        <div
                          key={photo.id}
                          className="overflow-hidden rounded-xl border border-white/10"
                        >
                          {photo.signed_url ? (
                            <img
                              src={photo.signed_url}
                              alt="Place alternate"
                              className="h-24 w-full object-cover"
                            />
                          ) : (
                            <div className="flex h-24 items-center justify-center text-xs text-zinc-400">
                              Photo unavailable
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  ) : null}
                </div>
              </div>
            ) : null}
            {pairingGallery.length > 0 ? (
              <div className="overflow-hidden rounded-3xl border border-white/10 bg-black/40">
                <div>
                  <Photo
                    src={pairingGallery[0].signed_url ?? ""}
                    alt="Pairing"
                    containerClassName="h-80 w-full"
                    className="h-80 w-full object-cover"
                    loading="lazy"
                  />
                  <div className="flex items-center justify-between border-t border-white/10 bg-black/30 px-4 py-3 text-xs text-zinc-300">
                    <span>Pairing photos</span>
                    {isOwner && pairingGallery[0].signed_url ? (
                      <a
                        href={pairingGallery[0].signed_url}
                        download
                        className="rounded-full border border-white/10 px-3 py-1 text-[11px] uppercase tracking-[0.2em] text-zinc-200 transition hover:border-amber-300/60 hover:text-amber-200"
                      >
                        Download
                      </a>
                    ) : null}
                  </div>
                  {pairingGallery.length > 1 ? (
                    <div className="grid gap-2 border-t border-white/10 bg-black/30 p-3 sm:grid-cols-3">
                      {pairingGallery.slice(1).map((photo) => (
                        <div
                          key={photo.id}
                          className="overflow-hidden rounded-xl border border-white/10"
                        >
                          {photo.signed_url ? (
                            <img
                              src={photo.signed_url}
                              alt="Pairing alternate"
                              className="h-24 w-full object-cover"
                            />
                          ) : (
                            <div className="flex h-24 items-center justify-center text-xs text-zinc-400">
                              Photo unavailable
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  ) : null}
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
                <p className="mt-1 text-sm text-zinc-400">
                  <RatingBadge rating={entry.rating} />
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
              {pricePaidDisplay ? (
                <div>
                  <p className="text-xs uppercase tracking-[0.2em] text-zinc-400">
                    Price paid
                  </p>
                  <p className="text-sm text-zinc-200">{pricePaidDisplay}</p>
                </div>
              ) : null}
              {entry.qpr_level ? (
                <div>
                  <p className="text-xs uppercase tracking-[0.2em] text-zinc-400">
                    QPR
                  </p>
                  <QprBadge level={entry.qpr_level} className="mt-1" />
                </div>
              ) : null}
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
              <div>
                <p className="text-xs uppercase tracking-[0.2em] text-zinc-400">
                  Classification
                </p>
                <p className="text-sm text-zinc-200">
                  {entry.classification || "Not set"}
                </p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-[0.2em] text-zinc-400">
                  Primary grapes
                </p>
                <p className="text-sm text-zinc-200">
                  {primaryGrapeDisplay || "Not set"}
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

            {populatedAdvancedNotes.length > 0 ? (
              <details className="rounded-2xl border border-white/10 bg-black/30 p-4">
                <summary className="cursor-pointer select-none text-sm font-medium text-zinc-200">
                  Advanced notes
                </summary>
                <div className="mt-4 grid gap-4 sm:grid-cols-2">
                  {populatedAdvancedNotes.map((field) => (
                    <div key={field.key}>
                      <p className="text-xs uppercase tracking-[0.2em] text-zinc-400">
                        {field.label}
                      </p>
                      <p className="text-sm text-zinc-200">
                        {formatAdvancedNoteValue(field.key, field.value)}
                      </p>
                    </div>
                  ))}
                </div>
              </details>
            ) : null}
          </div>
        </div>

        {errorMessage ? (
          <p className="text-sm text-rose-300">{errorMessage}</p>
        ) : null}

        {isTagged ? (
          <div className="rounded-2xl border border-amber-400/25 bg-amber-400/10 p-6">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="text-sm font-semibold text-amber-100">
                  You were tagged in this tasting
                </h2>
                <p className="mt-1 text-xs text-amber-100/70">
                  Add it to your cellar without creating a duplicate post in the feed.
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  className="rounded-full bg-amber-400 px-4 py-2 text-sm font-semibold text-zinc-950 transition hover:bg-amber-300 disabled:cursor-not-allowed disabled:opacity-70"
                  disabled={addingToLog}
                  onClick={async () => {
                    if (!entryId) return;
                    setAddToLogError(null);
                    setAddToLogMessage(null);
                    setAddingToLog(true);

                    try {
                      const response = await fetch(
                        `/api/entries/${entryId}/add-to-log`,
                        { method: "POST" }
                      );

                      const payload = await response.json().catch(() => ({}));
                      if (!response.ok) {
                        setAddToLogError(
                          payload.error ?? "Unable to add this tasting right now."
                        );
                        return;
                      }

                      if (typeof payload.entry_id === "string") {
                        setAddToLogEntryId(payload.entry_id);
                      }
                      setAddToLogMessage(
                        payload.already_exists
                          ? "Already in your cellar."
                          : "Added to your cellar."
                      );
                    } catch {
                      setAddToLogError("Unable to add this tasting right now.");
                    } finally {
                      setAddingToLog(false);
                    }
                  }}
                >
                  {addingToLog ? "Adding..." : "Add to my cellar"}
                </button>

                {addToLogEntryId ? (
                  <Link
                    href={`/entries/${addToLogEntryId}/edit`}
                    className="rounded-full border border-white/10 px-4 py-2 text-sm font-semibold text-zinc-100 transition hover:border-white/30"
                  >
                    Add my notes
                  </Link>
                ) : null}
              </div>
            </div>
            {addToLogError ? (
              <p className="mt-3 text-sm text-rose-300">{addToLogError}</p>
            ) : null}
            {addToLogMessage ? (
              <p className="mt-3 text-sm text-emerald-300">{addToLogMessage}</p>
            ) : null}
          </div>
        ) : null}

        {isOwner ? (
          <div className="rounded-2xl border border-rose-500/30 bg-rose-500/10 p-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-sm font-semibold text-rose-100">Delete</h2>
                <p className="text-xs text-rose-200/80">
                  Deleting removes this entry and its photos.
                </p>
              </div>
              <button
                type="button"
                className="rounded-full border border-rose-400/40 px-4 py-2 text-sm font-semibold text-rose-200 transition hover:border-rose-300"
                onClick={() => setShowDeleteConfirm(true)}
              >
                Delete entry
              </button>
            </div>
          </div>
        ) : null}
      </div>

      {showDeleteConfirm ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
          <div
            className="absolute inset-0 bg-black/70"
            onClick={() => setShowDeleteConfirm(false)}
          />
          <div className="relative w-full max-w-md rounded-2xl border border-white/10 bg-[#14100f] p-6 shadow-[0_30px_80px_-40px_rgba(0,0,0,0.9)]">
            <h3 className="text-lg font-semibold text-zinc-50">
              Delete this entry?
            </h3>
            <p className="mt-2 text-sm text-zinc-300">
              This action can’t be undone. The entry and its photos will be removed.
            </p>
            <div className="mt-5 flex items-center justify-end gap-3">
              <button
                type="button"
                className="rounded-full border border-white/10 px-4 py-2 text-sm font-semibold text-zinc-200 transition hover:border-white/30"
                onClick={() => setShowDeleteConfirm(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="rounded-full bg-rose-400 px-4 py-2 text-sm font-semibold text-zinc-950 transition hover:bg-rose-300"
                onClick={async () => {
                  setShowDeleteConfirm(false);
                  await onDelete();
                }}
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

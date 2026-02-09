"use client";

import { useEffect, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import AlertsMenu from "@/components/AlertsMenu";
import type { EntryPhoto, WineEntryWithUrls } from "@/types/wine";

type EditEntryForm = {
  wine_name: string;
  producer: string;
  vintage: string;
  country: string;
  region: string;
  appellation: string;
  rating?: number;
  notes: string;
  location_text: string;
  consumed_at: string;
  entry_privacy: "public" | "friends" | "private";
};

export default function EditEntryPage() {
  const router = useRouter();
  const params = useParams<{ id: string | string[] }>();
  const entryId = Array.isArray(params.id) ? params.id[0] : params.id;
  const supabase = createSupabaseBrowserClient();
  const { register, handleSubmit, reset } = useForm<EditEntryForm>({
    defaultValues: {
      consumed_at: new Date().toISOString().slice(0, 10),
      entry_privacy: "public",
    },
  });
  const [entry, setEntry] = useState<WineEntryWithUrls | null>(null);
  const [photos, setPhotos] = useState<EntryPhoto[]>([]);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const [uploadingType, setUploadingType] = useState<
    "label" | "place" | "pairing" | null
  >(null);
  const labelInputRef = useRef<HTMLInputElement | null>(null);
  const placeInputRef = useRef<HTMLInputElement | null>(null);
  const pairingInputRef = useRef<HTMLInputElement | null>(null);
  const [users, setUsers] = useState<
    { id: string; display_name: string | null }[]
  >([]);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [selectedUserIds, setSelectedUserIds] = useState<string[]>([]);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;

    const loadEntry = async () => {
      if (!entryId) {
        setErrorMessage("Entry not found.");
        setLoading(false);
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
        setSelectedUserIds(data.entry.tasted_with_user_ids ?? []);
        reset({
          wine_name: data.entry.wine_name ?? "",
          producer: data.entry.producer ?? "",
          vintage: data.entry.vintage ?? "",
          country: data.entry.country ?? "",
          region: data.entry.region ?? "",
          appellation: data.entry.appellation ?? "",
          rating: data.entry.rating ?? undefined,
          notes: data.entry.notes ?? "",
          location_text: data.entry.location_text ?? "",
          consumed_at: data.entry.consumed_at,
          entry_privacy: data.entry.entry_privacy ?? "public",
        });
        setLoading(false);
      }
    };

    loadEntry();

    return () => {
      isMounted = false;
    };
  }, [entryId, reset]);

  useEffect(() => {
    let isMounted = true;

    const loadUsers = async () => {
      const response = await fetch("/api/friends", { cache: "no-store" });
      if (!response.ok) {
        return;
      }

      const data = await response.json();
      if (isMounted) {
        setUsers(data.friends ?? []);
      }
    };

    loadUsers();

    return () => {
      isMounted = false;
    };
  }, []);

  const MAX_PHOTOS = 3;

  const loadPhotos = async () => {
    if (!entryId) return;
    setPhotoError(null);
    const response = await fetch(`/api/entries/${entryId}/photos`, {
      cache: "no-store",
    });
    if (!response.ok) {
      setPhotoError("Unable to load photos.");
      return;
    }
    const data = await response.json();
    setPhotos(data.photos ?? []);
  };

  useEffect(() => {
    loadPhotos().catch(() => null);
  }, [entryId]);

  const photosByType = (type: "label" | "place" | "pairing") =>
    photos
      .filter((photo) => photo.type === type)
      .sort((a, b) => a.position - b.position);

  const displayPhotosByType = (type: "label" | "place" | "pairing") => {
    const list = photosByType(type);
    if (list.length > 0 || !entry) {
      return list;
    }
    if (type === "label" && entry.label_image_url) {
      return [
        {
          id: "legacy-label",
          entry_id: entry.id,
          type: "label",
          path: entry.label_image_path ?? "",
          position: 0,
          created_at: entry.created_at,
          signed_url: entry.label_image_url,
        },
      ];
    }
    if (type === "place" && entry.place_image_url) {
      return [
        {
          id: "legacy-place",
          entry_id: entry.id,
          type: "place",
          path: entry.place_image_path ?? "",
          position: 0,
          created_at: entry.created_at,
          signed_url: entry.place_image_url,
        },
      ];
    }
    if (type === "pairing" && entry.pairing_image_url) {
      return [
        {
          id: "legacy-pairing",
          entry_id: entry.id,
          type: "pairing",
          path: entry.pairing_image_path ?? "",
          position: 0,
          created_at: entry.created_at,
          signed_url: entry.pairing_image_url,
        },
      ];
    }
    return list;
  };

  const legacyPhotos = (type: "label" | "place" | "pairing") => {
    if (!entry) return [];
    const legacyUrl =
      type === "label"
        ? entry.label_image_url
        : type === "place"
        ? entry.place_image_url
        : entry.pairing_image_url;
    if (!legacyUrl) return [];
    return [
      {
        id: `legacy-${type}`,
        entry_id: entry.id,
        type,
        path: "",
        position: 0,
        created_at: entry.created_at,
        signed_url: legacyUrl,
      },
    ];
  };

  const galleryForType = (type: "label" | "place" | "pairing") => {
    const list = photosByType(type);
    return list.length > 0 ? list : legacyPhotos(type);
  };

  const uploadPhotos = async (
    type: "label" | "place" | "pairing",
    files: FileList
  ) => {
    if (!entryId) return;
    setUploadingType(type);
    setPhotoError(null);
    const current = photosByType(type);
    const remaining = MAX_PHOTOS - current.length;
    const list = Array.from(files).slice(0, remaining);
    try {
      for (const file of list) {
        const createResponse = await fetch(`/api/entries/${entryId}/photos`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ type }),
        });
        if (!createResponse.ok) {
          const payload = await createResponse.json().catch(() => ({}));
          throw new Error(payload.error ?? "Unable to create photo.");
        }
        const { photo } = await createResponse.json();
        const { error } = await supabase.storage
          .from("wine-photos")
          .upload(photo.path, file, { upsert: true, contentType: file.type });
        if (error) {
          throw new Error(error.message);
        }
      }
      await loadPhotos();
    } catch (error) {
      setPhotoError(
        error instanceof Error ? error.message : "Photo upload failed."
      );
    } finally {
      setUploadingType(null);
    }
  };

  const deletePhoto = async (photoId: string) => {
    if (!entryId) return;
    setPhotoError(null);
    const response = await fetch(
      `/api/entries/${entryId}/photos/${photoId}`,
      {
        method: "DELETE",
      }
    );
    if (!response.ok) {
      const payload = await response.json().catch(() => ({}));
      setPhotoError(payload.error ?? "Unable to delete photo.");
      return;
    }
    await loadPhotos();
  };

  const movePhoto = async (
    type: "label" | "place" | "pairing",
    index: number,
    direction: "up" | "down"
  ) => {
    if (!entryId) return;
    const list = photosByType(type);
    const targetIndex = direction === "up" ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= list.length) return;
    const current = list[index];
    const swap = list[targetIndex];
    if (!current || !swap) return;

    setPhotos((prev) =>
      prev.map((photo) => {
        if (photo.id === current.id) {
          return { ...photo, position: swap.position };
        }
        if (photo.id === swap.id) {
          return { ...photo, position: current.position };
        }
        return photo;
      })
    );

    await Promise.all([
      fetch(`/api/entries/${entryId}/photos/${current.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ position: swap.position }),
      }),
      fetch(`/api/entries/${entryId}/photos/${swap.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ position: current.position }),
      }),
    ]);
  };

  useEffect(() => {
    let isMounted = true;

    const loadCurrentUser = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (isMounted) {
        setCurrentUserId(user?.id ?? null);
        setAuthLoading(false);
      }
    };

    loadCurrentUser();

    return () => {
      isMounted = false;
    };
  }, [supabase]);

  const onSubmit = handleSubmit(async (values) => {
    if (!entry) {
      return;
    }

    setIsSubmitting(true);
    setErrorMessage(null);

    const rating =
      typeof values.rating === "number" && !Number.isNaN(values.rating)
        ? Number(values.rating)
        : undefined;

    const updatePayload: Record<string, unknown> = {
      wine_name: values.wine_name || null,
      producer: values.producer || null,
      vintage: values.vintage || null,
      country: values.country || null,
      region: values.region || null,
      appellation: values.appellation || null,
      rating,
      notes: values.notes || null,
      location_text: values.location_text || null,
      consumed_at: values.consumed_at,
      tasted_with_user_ids: selectedUserIds,
      entry_privacy: values.entry_privacy,
    };

    const response = await fetch(`/api/entries/${entry.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(updatePayload),
    });

    if (!response.ok) {
      const payload = await response.json().catch(() => null);
      const apiError =
        typeof payload?.error === "string"
          ? payload.error
          : payload?.error?.fieldErrors?.rating?.[0] ??
            payload?.error?.formErrors?.[0] ??
            "Unable to update entry.";
      setIsSubmitting(false);
      setErrorMessage(apiError);
      return;
    }

    router.push(`/entries/${entry.id}`);
  });

  if (loading || authLoading) {
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

  if (currentUserId && entry.user_id !== currentUserId) {
    return (
      <div className="min-h-screen bg-[#0f0a09] px-6 py-10 text-zinc-100">
        <div className="mx-auto w-full max-w-3xl space-y-4">
          <Link
            className="text-sm font-medium text-zinc-300 hover:text-zinc-50"
            href={`/entries/${entry.id}`}
          >
            ← Back to entry
          </Link>
          <div className="rounded-2xl border border-rose-500/30 bg-rose-500/10 p-6 text-sm text-rose-200">
            You can only edit your own entries.
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0f0a09] px-6 py-10 text-zinc-100">
      <div className="mx-auto w-full max-w-3xl space-y-8">
        <header className="flex flex-wrap items-end justify-between gap-4">
          <div className="space-y-2">
            <span className="text-xs uppercase tracking-[0.3em] text-amber-300/70">
              Edit entry
            </span>
            <h1 className="text-3xl font-semibold text-zinc-50">
              Refine your tasting notes.
            </h1>
            <p className="text-sm text-zinc-300">Update tasting details or photos.</p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Link
              className="rounded-full border border-amber-300/60 bg-amber-400/10 px-4 py-2 text-sm font-semibold text-amber-200"
              href="/entries"
            >
              My entries
            </Link>
            <Link
              className="rounded-full border border-white/10 px-4 py-2 text-sm font-semibold text-zinc-200 transition hover:border-white/30"
              href="/feed"
            >
              Friends tab
            </Link>
            <Link
              className="rounded-full border border-white/10 px-4 py-2 text-sm font-semibold text-zinc-200 transition hover:border-white/30"
              href="/friends"
            >
              Friends
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

        <form className="space-y-6 rounded-3xl border border-white/10 bg-white/5 p-8 shadow-[0_30px_80px_-40px_rgba(0,0,0,0.8)] backdrop-blur" onSubmit={onSubmit}>
          <div>
            <p className="text-sm font-medium text-zinc-200">Current photos</p>
            {entry.label_image_url || entry.place_image_url || entry.pairing_image_url ? (
              <div className="mt-2 grid gap-4 md:grid-cols-3">
                {entry.label_image_url ? (
                  <div className="overflow-hidden rounded-2xl border border-white/10 bg-black/30">
                    <img
                      src={entry.label_image_url}
                      alt="Current label photo"
                      className="h-36 w-full object-cover"
                    />
                    <div className="flex items-center justify-between px-3 py-2 text-xs text-zinc-300">
                      <span>Label</span>
                      {currentUserId === entry.user_id ? (
                        <a
                          href={entry.label_image_url}
                          download
                          className="rounded-full border border-white/10 px-2 py-1 text-[10px] uppercase tracking-[0.16em] text-zinc-200 transition hover:border-amber-300/60 hover:text-amber-200"
                        >
                          Download
                        </a>
                      ) : null}
                    </div>
                  </div>
                ) : null}
                {entry.place_image_url ? (
                  <div className="overflow-hidden rounded-2xl border border-white/10 bg-black/30">
                    <img
                      src={entry.place_image_url}
                      alt="Current place photo"
                      className="h-36 w-full object-cover"
                    />
                    <div className="flex items-center justify-between px-3 py-2 text-xs text-zinc-300">
                      <span>Place</span>
                      {currentUserId === entry.user_id ? (
                        <a
                          href={entry.place_image_url}
                          download
                          className="rounded-full border border-white/10 px-2 py-1 text-[10px] uppercase tracking-[0.16em] text-zinc-200 transition hover:border-amber-300/60 hover:text-amber-200"
                        >
                          Download
                        </a>
                      ) : null}
                    </div>
                  </div>
                ) : null}
                {entry.pairing_image_url ? (
                  <div className="overflow-hidden rounded-2xl border border-white/10 bg-black/30">
                    <img
                      src={entry.pairing_image_url}
                      alt="Current pairing photo"
                      className="h-36 w-full object-cover"
                    />
                    <div className="flex items-center justify-between px-3 py-2 text-xs text-zinc-300">
                      <span>Pairing</span>
                      {currentUserId === entry.user_id ? (
                        <a
                          href={entry.pairing_image_url}
                          download
                          className="rounded-full border border-white/10 px-2 py-1 text-[10px] uppercase tracking-[0.16em] text-zinc-200 transition hover:border-amber-300/60 hover:text-amber-200"
                        >
                          Download
                        </a>
                      ) : null}
                    </div>
                  </div>
                ) : null}
              </div>
            ) : (
              <p className="mt-2 text-sm text-zinc-400">No photos uploaded yet.</p>
            )}
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <label className="text-sm font-medium text-zinc-200">Wine name</label>
              <input
                className="mt-1 w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-500 focus:border-amber-300 focus:outline-none focus:ring-2 focus:ring-amber-300/30"
                {...register("wine_name")}
              />
            </div>
            <div>
              <label className="text-sm font-medium text-zinc-200">Producer</label>
              <input
                className="mt-1 w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-500 focus:border-amber-300 focus:outline-none focus:ring-2 focus:ring-amber-300/30"
                {...register("producer")}
              />
            </div>
            <div>
              <label className="text-sm font-medium text-zinc-200">Vintage</label>
              <input
                className="mt-1 w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-500 focus:border-amber-300 focus:outline-none focus:ring-2 focus:ring-amber-300/30"
                {...register("vintage")}
              />
            </div>
            <div>
              <label className="text-sm font-medium text-zinc-200">Country</label>
              <input
                className="mt-1 w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-500 focus:border-amber-300 focus:outline-none focus:ring-2 focus:ring-amber-300/30"
                {...register("country")}
              />
            </div>
            <div>
              <label className="text-sm font-medium text-zinc-200">Region</label>
              <input
                className="mt-1 w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-500 focus:border-amber-300 focus:outline-none focus:ring-2 focus:ring-amber-300/30"
                {...register("region")}
              />
            </div>
            <div>
              <label className="text-sm font-medium text-zinc-200">Appellation</label>
              <input
                className="mt-1 w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-500 focus:border-amber-300 focus:outline-none focus:ring-2 focus:ring-amber-300/30"
                {...register("appellation")}
              />
            </div>
            <div>
              <label className="text-sm font-medium text-zinc-200">Rating (1-100)</label>
              <input
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                className="mt-1 w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-zinc-100 focus:border-amber-300 focus:outline-none focus:ring-2 focus:ring-amber-300/30"
                {...register("rating", {
                  setValueAs: (value) => (value === "" ? undefined : Number(value)),
                })}
              />
            </div>
            <div>
              <label className="text-sm font-medium text-zinc-200">Consumed date</label>
              <input
                type="date"
                className="mt-1 w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-zinc-100 focus:border-amber-300 focus:outline-none focus:ring-2 focus:ring-amber-300/30"
                {...register("consumed_at", { required: true })}
              />
            </div>
          </div>

          <div>
            <label className="text-sm font-medium text-zinc-200">
              Tasted with
            </label>
            {users.length === 0 ? (
              <p className="mt-2 text-sm text-zinc-400">No other users yet.</p>
            ) : (
              <div className="mt-2 grid gap-2 rounded-2xl border border-white/10 bg-black/30 p-3">
                {users.map((user) => {
                  const label = user.display_name ?? "Unknown";
                  const isChecked = selectedUserIds.includes(user.id);
                  return (
                    <label key={user.id} className="flex items-center gap-2 text-sm text-zinc-200">
                      <input
                        type="checkbox"
                        className="h-4 w-4 rounded border-white/20 bg-black/40 text-amber-400"
                        checked={isChecked}
                        onChange={(event) => {
                          setSelectedUserIds((prev) =>
                            event.target.checked
                              ? [...prev, user.id]
                              : prev.filter((id) => id !== user.id)
                          );
                        }}
                      />
                      {label}
                    </label>
                  );
                })}
              </div>
            )}
          </div>

          <div>
            <label className="text-sm font-medium text-zinc-200">Notes</label>
            <textarea
              className="mt-1 min-h-[120px] w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-500 focus:border-amber-300 focus:outline-none focus:ring-2 focus:ring-amber-300/30"
              {...register("notes")}
            />
          </div>

          <div>
            <label className="text-sm font-medium text-zinc-200">Location</label>
            <input
              className="mt-1 w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-500 focus:border-amber-300 focus:outline-none focus:ring-2 focus:ring-amber-300/30"
              {...register("location_text")}
            />
          </div>

          <div>
            <label className="text-sm font-medium text-zinc-200">
              Visibility
            </label>
            <select
              className="mt-2 w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-zinc-100 focus:border-amber-300 focus:outline-none focus:ring-2 focus:ring-amber-300/30"
              {...register("entry_privacy")}
            >
              <option value="public">Public</option>
              <option value="friends">Friends only</option>
              <option value="private">Private (only me)</option>
            </select>
          </div>

          <div className="grid gap-4 md:grid-cols-3">
            {(["label", "place", "pairing"] as const).map((type) => {
              const list = displayPhotosByType(type);
              const isUploading = uploadingType === type;
              return (
                <div
                  key={type}
                  className="rounded-2xl border border-white/10 bg-black/30 p-4"
                >
                  <label className="text-sm font-medium text-zinc-200">
                    {type === "label"
                      ? "Label photos"
                      : type === "place"
                      ? "Place photos"
                      : "Pairing photos"}
                  </label>
                  <p className="text-xs text-zinc-400">
                    {list.length === 0
                      ? "Add a photo."
                      : "Add more or reorder them."}
                  </p>
                  {list.length === 0 ? (
                    <p className="mt-2 text-xs text-zinc-500">
                      No photos yet.
                    </p>
                  ) : (
                    <div className="mt-3 space-y-2">
                      {list.map((photo, index) => (
                        <div
                          key={photo.id}
                          className="rounded-xl border border-white/10 bg-black/40 p-2"
                        >
                          {photo.signed_url ? (
                            <img
                              src={photo.signed_url}
                              alt={`${type} photo ${index + 1}`}
                              className="h-28 w-full rounded-lg object-cover"
                            />
                          ) : (
                            <div className="flex h-28 items-center justify-center text-xs text-zinc-400">
                              Photo unavailable
                            </div>
                          )}
                          <div className="mt-2 flex items-center justify-between text-xs text-zinc-300">
                            <div className="flex gap-2">
                              <button
                                type="button"
                                className="rounded-full border border-white/10 px-2 py-1 transition hover:border-white/30"
                                disabled={list.length <= 1 || index === 0}
                                onClick={() => movePhoto(type, index, "up")}
                              >
                                ↑
                              </button>
                              <button
                                type="button"
                                className="rounded-full border border-white/10 px-2 py-1 transition hover:border-white/30"
                                disabled={list.length <= 1 || index === list.length - 1}
                                onClick={() => movePhoto(type, index, "down")}
                              >
                                ↓
                              </button>
                            </div>
                            {photo.id.startsWith("legacy-") ? (
                              <span className="text-[11px] text-zinc-500">
                                Saved from earlier entry
                              </span>
                            ) : (
                              <button
                                type="button"
                                className="rounded-full border border-rose-500/40 px-2 py-1 text-rose-200 transition hover:border-rose-300"
                                onClick={() => deletePhoto(photo.id)}
                              >
                                Delete
                              </button>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                  <input
                    ref={
                      type === "label"
                        ? labelInputRef
                        : type === "place"
                        ? placeInputRef
                        : pairingInputRef
                    }
                    type="file"
                    accept="image/*"
                    multiple
                    className="sr-only"
                    onChange={(event) => {
                      if (!event.target.files) return;
                      uploadPhotos(type, event.target.files);
                      event.target.value = "";
                    }}
                  />
                  <button
                    type="button"
                    className="mt-3 inline-flex w-full items-center justify-center rounded-full border border-white/10 px-4 py-2 text-sm font-semibold text-zinc-200 transition hover:border-amber-300/60 hover:text-amber-200 disabled:cursor-not-allowed disabled:opacity-60"
                    onClick={() => {
                      if (type === "label") labelInputRef.current?.click();
                      if (type === "place") placeInputRef.current?.click();
                      if (type === "pairing") pairingInputRef.current?.click();
                    }}
                    disabled={list.length >= MAX_PHOTOS || isUploading}
                  >
                    {list.length >= MAX_PHOTOS
                      ? "Max photos reached"
                      : isUploading
                      ? "Uploading..."
                      : "Add photo"}
                  </button>
                </div>
              );
            })}
          </div>

          {errorMessage ? (
            <p className="text-sm text-rose-300">{errorMessage}</p>
          ) : null}
          {photoError ? (
            <p className="text-sm text-rose-300">{photoError}</p>
          ) : null}

          <div className="flex items-center gap-3">
            <button
              type="submit"
              className="rounded-full bg-amber-400 px-5 py-2 text-sm font-semibold text-zinc-950 transition hover:bg-amber-300 disabled:cursor-not-allowed disabled:opacity-70"
              disabled={isSubmitting}
            >
              Save changes
            </button>
            <Link className="text-sm font-medium text-zinc-300" href={`/entries/${entry.id}`}>
              Cancel
            </Link>
          </div>
        </form>
      </div>
    </div>
  );
}

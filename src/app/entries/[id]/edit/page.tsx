"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Controller, useForm, useWatch } from "react-hook-form";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import NavBar from "@/components/NavBar";
import DatePicker from "@/components/DatePicker";
import PrivacyBadge from "@/components/PrivacyBadge";
import type { EntryPhoto, WineEntryWithUrls } from "@/types/wine";
import {
  ADVANCED_NOTE_FIELDS,
  ADVANCED_NOTE_OPTIONS,
  EMPTY_ADVANCED_NOTES_FORM_VALUES,
  toAdvancedNotesFormValues,
  toAdvancedNotesPayload,
  type AdvancedNotesFormValues,
} from "@/lib/advancedNotes";
import {
  PRICE_PAID_SOURCE_LABELS,
  PRICE_PAID_SOURCE_VALUES,
  QPR_LEVEL_LABELS,
  type PricePaidSource,
  type QprLevel,
} from "@/lib/entryMeta";

type EditEntryForm = {
  wine_name: string;
  producer: string;
  vintage: string;
  country: string;
  region: string;
  appellation: string;
  rating?: number;
  price_paid?: number;
  price_paid_source: PricePaidSource | "";
  qpr_level: QprLevel | "";
  notes: string;
  location_text: string;
  consumed_at: string;
  entry_privacy: "public" | "friends" | "private";
  advanced_notes: AdvancedNotesFormValues;
};

export default function EditEntryPage() {
  const router = useRouter();
  const params = useParams<{ id: string | string[] }>();
  const entryId = Array.isArray(params.id) ? params.id[0] : params.id;
  const supabase = createSupabaseBrowserClient();
  const { control, register, handleSubmit, reset, setValue } = useForm<EditEntryForm>({
    defaultValues: {
      consumed_at: new Date().toISOString().slice(0, 10),
      entry_privacy: "public",
      price_paid_source: "",
      qpr_level: "",
      advanced_notes: { ...EMPTY_ADVANCED_NOTES_FORM_VALUES },
    },
  });
  const selectedEntryPrivacy =
    useWatch({
      control,
      name: "entry_privacy",
    }) ?? "public";
  const selectedPricePaidSource =
    useWatch({
      control,
      name: "price_paid_source",
    }) ?? "";
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
          price_paid: data.entry.price_paid ?? undefined,
          price_paid_source: data.entry.price_paid_source ?? "",
          qpr_level: data.entry.qpr_level ?? "",
          notes: data.entry.notes ?? "",
          location_text: data.entry.location_text ?? "",
          consumed_at: data.entry.consumed_at,
          entry_privacy: data.entry.entry_privacy ?? "public",
          advanced_notes: toAdvancedNotesFormValues(data.entry.advanced_notes),
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

  const loadPhotos = useCallback(async () => {
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
  }, [entryId]);

  useEffect(() => {
    loadPhotos().catch(() => null);
  }, [loadPhotos]);

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
    const pricePaid =
      typeof values.price_paid === "number" && !Number.isNaN(values.price_paid)
        ? Number(values.price_paid.toFixed(2))
        : undefined;
    const pricePaidSource = values.price_paid_source || undefined;

    if (pricePaid !== undefined && !pricePaidSource) {
      setIsSubmitting(false);
      setErrorMessage("Select retail or restaurant when entering price paid.");
      return;
    }

    if (pricePaid === undefined && pricePaidSource) {
      setIsSubmitting(false);
      setErrorMessage("Enter a price paid amount when selecting retail or restaurant.");
      return;
    }

    const updatePayload: Record<string, unknown> = {
      wine_name: values.wine_name || null,
      producer: values.producer || null,
      vintage: values.vintage || null,
      country: values.country || null,
      region: values.region || null,
      appellation: values.appellation || null,
      rating,
      price_paid: pricePaid ?? null,
      price_paid_source: pricePaidSource ?? null,
      qpr_level: values.qpr_level || null,
      notes: values.notes || null,
      location_text: values.location_text || null,
      consumed_at: values.consumed_at,
      tasted_with_user_ids: selectedUserIds,
      entry_privacy: values.entry_privacy,
      advanced_notes: toAdvancedNotesPayload(values.advanced_notes),
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
        <div className="mx-auto w-full max-w-6xl space-y-8">
          <NavBar />
        </div>
        <div className="mx-auto w-full max-w-3xl space-y-8 pt-8">
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
        <div className="mx-auto w-full max-w-6xl space-y-8">
          <NavBar />
        </div>
        <div className="mx-auto w-full max-w-3xl space-y-8 pt-8">
          <div className="rounded-2xl border border-rose-500/30 bg-rose-500/10 p-6 text-sm text-rose-200">
            {errorMessage ?? "Entry unavailable."}
          </div>
        </div>
      </div>
    );
  }

  if (currentUserId && entry.user_id !== currentUserId) {
    return (
      <div className="min-h-screen bg-[#0f0a09] px-6 py-10 text-zinc-100">
        <div className="mx-auto w-full max-w-6xl space-y-8">
          <NavBar />
        </div>
        <div className="mx-auto w-full max-w-3xl space-y-8 pt-8">
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
      <div className="mx-auto w-full max-w-6xl space-y-8">
        <NavBar />
      </div>
      <div className="mx-auto w-full max-w-3xl space-y-8 pt-8">
        <header className="space-y-2">
          <span className="text-xs uppercase tracking-[0.3em] text-amber-300/70">
            Edit entry
          </span>
          <h1 className="text-3xl font-semibold text-zinc-50">
            Refine your tasting notes.
          </h1>
          <p className="text-sm text-zinc-300">Update tasting details or photos.</p>
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
              <label className="text-sm font-medium text-zinc-200">
                QPR (Quality : Price Ratio)
              </label>
              <select
                className="mt-1 w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-zinc-100 focus:border-amber-300 focus:outline-none focus:ring-2 focus:ring-amber-300/30"
                {...register("qpr_level")}
              >
                <option value="">Not set</option>
                {Object.entries(QPR_LEVEL_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </div>
            <div className="md:col-span-2 rounded-2xl border border-white/10 bg-black/30 p-4">
              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <label className="text-sm font-medium text-zinc-200">Price paid</label>
                  <input
                    type="text"
                    inputMode="decimal"
                    pattern="[0-9]*[.]?[0-9]*"
                    className="mt-1 w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-500 focus:border-amber-300 focus:outline-none focus:ring-2 focus:ring-amber-300/30"
                    placeholder="Optional (e.g. 28.50)"
                    {...register("price_paid", {
                      setValueAs: (value) => {
                        if (value === "") return undefined;
                        const parsed = Number(value);
                        return Number.isFinite(parsed) ? parsed : undefined;
                      },
                    })}
                  />
                </div>
                <div>
                  <div className="flex items-center justify-between gap-2">
                    <label className="text-sm font-medium text-zinc-200">Price source</label>
                    {selectedPricePaidSource ? (
                      <button
                        type="button"
                        className="text-xs text-zinc-400 transition hover:text-zinc-200"
                        onClick={() =>
                          setValue("price_paid_source", "", {
                            shouldDirty: true,
                          })
                        }
                      >
                        Clear
                      </button>
                    ) : null}
                  </div>
                  <input type="hidden" {...register("price_paid_source")} />
                  <div className="mt-2 grid gap-2 sm:grid-cols-2">
                    {PRICE_PAID_SOURCE_VALUES.map((source) => {
                      const selected = selectedPricePaidSource === source;
                      return (
                        <button
                          key={source}
                          type="button"
                          className={`flex items-center gap-2 rounded-xl border px-3 py-2 text-sm transition ${
                            selected
                              ? "border-amber-300/60 bg-amber-400/10 text-amber-200"
                              : "border-white/10 bg-black/30 text-zinc-300 hover:border-white/30"
                          }`}
                          onClick={() =>
                            setValue("price_paid_source", source, {
                              shouldDirty: true,
                            })
                          }
                        >
                          <span
                            className={`inline-flex h-4 w-4 items-center justify-center rounded border text-[10px] ${
                              selected
                                ? "border-amber-300/60 bg-amber-300/20 text-amber-200"
                                : "border-white/20 text-transparent"
                            }`}
                          >
                            ✓
                          </span>
                          {PRICE_PAID_SOURCE_LABELS[source]}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
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
            <label className="text-sm font-medium text-zinc-200">
              Visibility
            </label>
            <p className="mt-1 text-xs text-zinc-400">
              This controls who can view this entry in feeds and on your profile.
            </p>
            <div className="mt-2">
              <PrivacyBadge level={selectedEntryPrivacy} />
            </div>
            <select
              className="mt-3 w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-zinc-100 focus:border-amber-300 focus:outline-none focus:ring-2 focus:ring-amber-300/30"
              {...register("entry_privacy")}
            >
              <option value="public">Public</option>
              <option value="friends">Friends only</option>
              <option value="private">Private (only me)</option>
            </select>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <label className="text-sm font-medium text-zinc-200">Location</label>
              <input
                className="mt-1 w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-500 focus:border-amber-300 focus:outline-none focus:ring-2 focus:ring-amber-300/30"
                {...register("location_text")}
              />
            </div>
            <div>
              <label className="text-sm font-medium text-zinc-200">Consumed date</label>
              <Controller
                control={control}
                name="consumed_at"
                rules={{ required: true }}
                render={({ field }) => (
                  <DatePicker
                    value={field.value}
                    onChange={field.onChange}
                    onBlur={field.onBlur}
                    className="mt-1 w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-zinc-100 focus:border-amber-300 focus:outline-none focus:ring-2 focus:ring-amber-300/30"
                    required
                  />
                )}
              />
            </div>
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

          <details className="rounded-2xl border border-white/10 bg-black/30 p-4">
            <summary className="cursor-pointer select-none text-sm font-medium text-zinc-200">
              Advanced notes
            </summary>
            <p className="mt-2 text-xs text-zinc-400">
              Optional structure for deeper tasting notes.
            </p>
            <div className="mt-4 grid gap-4 md:grid-cols-2">
              {ADVANCED_NOTE_FIELDS.map((field) => (
                <div key={field.key}>
                  <label className="text-sm font-medium text-zinc-200">
                    {field.label}
                  </label>
                  <select
                    className="mt-1 w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-zinc-100 focus:border-amber-300 focus:outline-none focus:ring-2 focus:ring-amber-300/30"
                    {...register(`advanced_notes.${field.key}` as const)}
                  >
                    <option value="">Not set</option>
                    {ADVANCED_NOTE_OPTIONS[field.key].map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </div>
              ))}
            </div>
          </details>

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

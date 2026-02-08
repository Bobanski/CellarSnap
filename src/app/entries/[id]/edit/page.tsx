"use client";

import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import type { WineEntryWithUrls } from "@/types/wine";

type EditEntryForm = {
  wine_name: string;
  producer: string;
  vintage: string;
  region: string;
  rating: number;
  notes: string;
  location_text: string;
  consumed_at: string;
};

export default function EditEntryPage() {
  const router = useRouter();
  const params = useParams<{ id: string | string[] }>();
  const entryId = Array.isArray(params.id) ? params.id[0] : params.id;
  const supabase = createSupabaseBrowserClient();
  const { register, handleSubmit, reset } = useForm<EditEntryForm>({
    defaultValues: {
      rating: 90,
      consumed_at: new Date().toISOString().slice(0, 10),
    },
  });
  const [entry, setEntry] = useState<WineEntryWithUrls | null>(null);
  const [labelFile, setLabelFile] = useState<File | null>(null);
  const [placeFile, setPlaceFile] = useState<File | null>(null);
  const [users, setUsers] = useState<
    { id: string; display_name: string | null; email: string | null }[]
  >([]);
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
          region: data.entry.region ?? "",
          rating: data.entry.rating,
          notes: data.entry.notes ?? "",
          location_text: data.entry.location_text ?? "",
          consumed_at: data.entry.consumed_at,
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

  const onSubmit = handleSubmit(async (values) => {
    if (!entry) {
      return;
    }

    setIsSubmitting(true);
    setErrorMessage(null);

    const updatePayload: Record<string, unknown> = {
      wine_name: values.wine_name || null,
      producer: values.producer || null,
      vintage: values.vintage || null,
      region: values.region || null,
      rating: Number(values.rating),
      notes: values.notes || null,
      location_text: values.location_text || null,
      consumed_at: values.consumed_at,
      tasted_with_user_ids: selectedUserIds,
    };

    if (labelFile) {
      const labelPath = `${entry.user_id}/${entry.id}/label.jpg`;
      const { error: labelError } = await supabase.storage
        .from("wine-photos")
        .upload(labelPath, labelFile, { upsert: true, contentType: labelFile.type });

      if (labelError) {
        setIsSubmitting(false);
        setErrorMessage("Label upload failed.");
        return;
      }

      updatePayload.label_image_path = labelPath;
    }

    if (placeFile) {
      const placePath = `${entry.user_id}/${entry.id}/place.jpg`;
      const { error: placeError } = await supabase.storage
        .from("wine-photos")
        .upload(placePath, placeFile, { upsert: true, contentType: placeFile.type });

      if (placeError) {
        setIsSubmitting(false);
        setErrorMessage("Place upload failed.");
        return;
      }

      updatePayload.place_image_path = placePath;
    }

    const response = await fetch(`/api/entries/${entry.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(updatePayload),
    });

    if (!response.ok) {
      setIsSubmitting(false);
      setErrorMessage("Unable to update entry.");
      return;
    }

    router.push(`/entries/${entry.id}`);
  });

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
          <Link
            className="rounded-full border border-white/10 px-4 py-2 text-sm font-semibold text-zinc-200 transition hover:border-white/30"
            href={`/entries/${entry.id}`}
          >
            Back
          </Link>
        </header>

        <form className="space-y-6 rounded-3xl border border-white/10 bg-white/5 p-8 shadow-[0_30px_80px_-40px_rgba(0,0,0,0.8)] backdrop-blur" onSubmit={onSubmit}>
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
              <label className="text-sm font-medium text-zinc-200">Region</label>
              <input
                className="mt-1 w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-500 focus:border-amber-300 focus:outline-none focus:ring-2 focus:ring-amber-300/30"
                {...register("region")}
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
                  required: true,
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
                  const label = user.display_name ?? user.email ?? user.id;
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

          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <label className="text-sm font-medium text-zinc-200">
                Replace label photo
              </label>
              <input
                type="file"
                accept="image/*"
                className="mt-1 w-full text-sm text-zinc-300"
                onChange={(event) => setLabelFile(event.target.files?.[0] ?? null)}
              />
            </div>
            <div>
              <label className="text-sm font-medium text-zinc-200">
                Replace place photo
              </label>
              <input
                type="file"
                accept="image/*"
                className="mt-1 w-full text-sm text-zinc-300"
                onChange={(event) => setPlaceFile(event.target.files?.[0] ?? null)}
              />
            </div>
          </div>

          {errorMessage ? (
            <p className="text-sm text-rose-300">{errorMessage}</p>
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

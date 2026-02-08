"use client";

import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { useRouter } from "next/navigation";
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

export default function EditEntryPage({
  params,
}: {
  params: { id: string };
}) {
  const router = useRouter();
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
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
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
  }, [params.id, reset]);

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
    <div className="min-h-screen bg-zinc-100 px-6 py-8">
      <div className="mx-auto w-full max-w-3xl space-y-6">
        <header className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-zinc-900">Edit entry</h1>
            <p className="text-sm text-zinc-600">Update tasting details or photos.</p>
          </div>
          <Link className="text-sm font-medium text-zinc-700" href={`/entries/${entry.id}`}>
            Back
          </Link>
        </header>

        <form className="space-y-5 rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm" onSubmit={onSubmit}>
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <label className="text-sm font-medium text-zinc-700">Wine name</label>
              <input
                className="mt-1 w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm text-zinc-900 placeholder:text-zinc-400"
                {...register("wine_name")}
              />
            </div>
            <div>
              <label className="text-sm font-medium text-zinc-700">Producer</label>
              <input
                className="mt-1 w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm text-zinc-900 placeholder:text-zinc-400"
                {...register("producer")}
              />
            </div>
            <div>
              <label className="text-sm font-medium text-zinc-700">Vintage</label>
              <input
                className="mt-1 w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm text-zinc-900 placeholder:text-zinc-400"
                {...register("vintage")}
              />
            </div>
            <div>
              <label className="text-sm font-medium text-zinc-700">Region</label>
              <input
                className="mt-1 w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm text-zinc-900 placeholder:text-zinc-400"
                {...register("region")}
              />
            </div>
            <div>
              <label className="text-sm font-medium text-zinc-700">Rating (1-100)</label>
              <input
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                className="mt-1 w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm text-zinc-900"
                {...register("rating", {
                  required: true,
                  setValueAs: (value) => (value === "" ? undefined : Number(value)),
                })}
              />
            </div>
            <div>
              <label className="text-sm font-medium text-zinc-700">Consumed date</label>
              <input
                type="date"
                className="mt-1 w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm text-zinc-900"
                {...register("consumed_at", { required: true })}
              />
            </div>
          </div>

          <div>
            <label className="text-sm font-medium text-zinc-700">Notes</label>
            <textarea
              className="mt-1 min-h-[120px] w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm text-zinc-900 placeholder:text-zinc-400"
              {...register("notes")}
            />
          </div>

          <div>
            <label className="text-sm font-medium text-zinc-700">Location</label>
            <input
              className="mt-1 w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm text-zinc-900 placeholder:text-zinc-400"
              {...register("location_text")}
            />
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <label className="text-sm font-medium text-zinc-700">
                Replace label photo
              </label>
              <input
                type="file"
                accept="image/*"
                className="mt-1 w-full text-sm"
                onChange={(event) => setLabelFile(event.target.files?.[0] ?? null)}
              />
            </div>
            <div>
              <label className="text-sm font-medium text-zinc-700">
                Replace place photo
              </label>
              <input
                type="file"
                accept="image/*"
                className="mt-1 w-full text-sm"
                onChange={(event) => setPlaceFile(event.target.files?.[0] ?? null)}
              />
            </div>
          </div>

          {errorMessage ? (
            <p className="text-sm text-red-600">{errorMessage}</p>
          ) : null}

          <div className="flex items-center gap-3">
            <button
              type="submit"
              className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-70"
              disabled={isSubmitting}
            >
              Save changes
            </button>
            <Link className="text-sm font-medium text-zinc-700" href={`/entries/${entry.id}`}>
              Cancel
            </Link>
          </div>
        </form>
      </div>
    </div>
  );
}

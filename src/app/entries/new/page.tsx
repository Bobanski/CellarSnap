"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";

type NewEntryForm = {
  wine_name: string;
  producer: string;
  vintage: string;
  region: string;
  rating: number;
  notes: string;
  location_text: string;
  consumed_at: string;
};

export default function NewEntryPage() {
  const router = useRouter();
  const supabase = createSupabaseBrowserClient();
  const { register, handleSubmit } = useForm<NewEntryForm>({
    defaultValues: {
      rating: 7,
      consumed_at: new Date().toISOString().slice(0, 10),
    },
  });
  const [labelFile, setLabelFile] = useState<File | null>(null);
  const [placeFile, setPlaceFile] = useState<File | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const onSubmit = handleSubmit(async (values) => {
    if (!labelFile) {
      setErrorMessage("Label photo is required.");
      return;
    }

    setIsSubmitting(true);
    setErrorMessage(null);

    const response = await fetch("/api/entries", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        wine_name: values.wine_name || null,
        producer: values.producer || null,
        vintage: values.vintage || null,
        region: values.region || null,
        rating: Number(values.rating),
        notes: values.notes || null,
        location_text: values.location_text || null,
        consumed_at: values.consumed_at,
      }),
    });

    if (!response.ok) {
      setIsSubmitting(false);
      setErrorMessage("Unable to create entry.");
      return;
    }

    const { entry } = await response.json();
    const labelPath = `${entry.user_id}/${entry.id}/label.jpg`;
    const placePath = placeFile ? `${entry.user_id}/${entry.id}/place.jpg` : null;

    const { error: labelError } = await supabase.storage
      .from("wine-photos")
      .upload(labelPath, labelFile, { upsert: true, contentType: labelFile.type });

    if (labelError) {
      setIsSubmitting(false);
      setErrorMessage("Label upload failed. Please try again.");
      return;
    }

    if (placeFile && placePath) {
      const { error: placeError } = await supabase.storage
        .from("wine-photos")
        .upload(placePath, placeFile, { upsert: true, contentType: placeFile.type });

      if (placeError) {
        setIsSubmitting(false);
        setErrorMessage("Place photo upload failed. Please try again.");
        return;
      }
    }

    const updateResponse = await fetch(`/api/entries/${entry.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        label_image_path: labelPath,
        place_image_path: placePath,
      }),
    });

    if (!updateResponse.ok) {
      setIsSubmitting(false);
      setErrorMessage("Unable to finalize entry.");
      return;
    }

    router.push(`/entries/${entry.id}`);
  });

  return (
    <div className="min-h-screen bg-zinc-50 px-6 py-8">
      <div className="mx-auto w-full max-w-3xl space-y-6">
        <header className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-zinc-900">New entry</h1>
            <p className="text-sm text-zinc-500">
              Capture the bottle and where you enjoyed it.
            </p>
          </div>
          <Link className="text-sm font-medium text-zinc-600" href="/entries">
            Back to entries
          </Link>
        </header>

        <form className="space-y-5" onSubmit={onSubmit}>
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <label className="text-sm font-medium text-zinc-700">Wine name</label>
              <input
                className="mt-1 w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm"
                placeholder="Optional"
                {...register("wine_name")}
              />
            </div>
            <div>
              <label className="text-sm font-medium text-zinc-700">Producer</label>
              <input
                className="mt-1 w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm"
                placeholder="Optional"
                {...register("producer")}
              />
            </div>
            <div>
              <label className="text-sm font-medium text-zinc-700">Vintage</label>
              <input
                className="mt-1 w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm"
                placeholder="Optional"
                {...register("vintage")}
              />
            </div>
            <div>
              <label className="text-sm font-medium text-zinc-700">Region</label>
              <input
                className="mt-1 w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm"
                placeholder="Optional"
                {...register("region")}
              />
            </div>
            <div>
              <label className="text-sm font-medium text-zinc-700">Rating (1-10)</label>
              <input
                type="number"
                min={1}
                max={10}
                className="mt-1 w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm"
                {...register("rating", { valueAsNumber: true, required: true })}
              />
            </div>
            <div>
              <label className="text-sm font-medium text-zinc-700">Consumed date</label>
              <input
                type="date"
                className="mt-1 w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm"
                {...register("consumed_at", { required: true })}
              />
            </div>
          </div>

          <div>
            <label className="text-sm font-medium text-zinc-700">Notes</label>
            <textarea
              className="mt-1 min-h-[120px] w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm"
              placeholder="Optional tasting notes"
              {...register("notes")}
            />
          </div>

          <div>
            <label className="text-sm font-medium text-zinc-700">Location</label>
            <input
              className="mt-1 w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm"
              placeholder="Optional location"
              {...register("location_text")}
            />
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <label className="text-sm font-medium text-zinc-700">
                Label photo (required)
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
                Place photo (optional)
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
              Save entry
            </button>
            <Link className="text-sm font-medium text-zinc-600" href="/entries">
              Cancel
            </Link>
          </div>
        </form>
      </div>
    </div>
  );
}

"use client";

import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";

type NewEntryForm = {
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
};

export default function NewEntryPage() {
  const router = useRouter();
  const supabase = createSupabaseBrowserClient();
  const { register, handleSubmit, getValues, setValue } = useForm<NewEntryForm>({
    defaultValues: {
      consumed_at: new Date().toISOString().slice(0, 10),
    },
  });
  const [labelFile, setLabelFile] = useState<File | null>(null);
  const [placeFile, setPlaceFile] = useState<File | null>(null);
  const [pairingFile, setPairingFile] = useState<File | null>(null);
  const [autofillStatus, setAutofillStatus] = useState<
    "idle" | "loading" | "success" | "error" | "timeout"
  >("idle");
  const [autofillMessage, setAutofillMessage] = useState<string | null>(null);
  const [users, setUsers] = useState<
    { id: string; display_name: string | null; email: string | null }[]
  >([]);
  const [selectedUserIds, setSelectedUserIds] = useState<string[]>([]);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

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
    setIsSubmitting(true);
    setErrorMessage(null);

    const response = await fetch("/api/entries", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        wine_name: values.wine_name || null,
        producer: values.producer || null,
        vintage: values.vintage || null,
        country: values.country || null,
        region: values.region || null,
        appellation: values.appellation || null,
        rating: values.rating ? Number(values.rating) : null,
        notes: values.notes || null,
        location_text: values.location_text || null,
        consumed_at: values.consumed_at,
        tasted_with_user_ids: selectedUserIds,
      }),
    });

    if (!response.ok) {
      setIsSubmitting(false);
      setErrorMessage("Unable to create entry.");
      return;
    }

    const { entry } = await response.json();
    const labelPath = labelFile
      ? `${entry.user_id}/${entry.id}/label.jpg`
      : null;
    const placePath = placeFile ? `${entry.user_id}/${entry.id}/place.jpg` : null;
    const pairingPath = pairingFile
      ? `${entry.user_id}/${entry.id}/pairing.jpg`
      : null;

    if (labelFile && labelPath) {
      const { error: labelError } = await supabase.storage
        .from("wine-photos")
        .upload(labelPath, labelFile, { upsert: true, contentType: labelFile.type });

      if (labelError) {
        setIsSubmitting(false);
        setErrorMessage("Label upload failed. Please try again.");
        return;
      }
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

    if (pairingFile && pairingPath) {
      const { error: pairingError } = await supabase.storage
        .from("wine-photos")
        .upload(pairingPath, pairingFile, {
          upsert: true,
          contentType: pairingFile.type,
        });

      if (pairingError) {
        setIsSubmitting(false);
        setErrorMessage("Pairing photo upload failed. Please try again.");
        return;
      }
    }

    if (labelPath || placePath || pairingPath) {
      const updateResponse = await fetch(`/api/entries/${entry.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          label_image_path: labelPath,
          place_image_path: placePath,
          pairing_image_path: pairingPath,
        }),
      });

      if (!updateResponse.ok) {
        setIsSubmitting(false);
        setErrorMessage("Unable to finalize entry.");
        return;
      }
    }

    router.push(`/entries/${entry.id}`);
  });

  const applyAutofill = (data: {
    wine_name?: string | null;
    producer?: string | null;
    vintage?: string | null;
    country?: string | null;
    region?: string | null;
    appellation?: string | null;
    notes?: string | null;
  }) => {
    const current = getValues();
    if (!current.wine_name && data.wine_name) {
      setValue("wine_name", data.wine_name);
    }
    if (!current.producer && data.producer) {
      setValue("producer", data.producer);
    }
    if (!current.vintage && data.vintage) {
      setValue("vintage", data.vintage);
    }
    if (!current.country && data.country) {
      setValue("country", data.country);
    }
    if (!current.region && data.region) {
      setValue("region", data.region);
    }
    if (!current.appellation && data.appellation) {
      setValue("appellation", data.appellation);
    }
    if (!current.notes && data.notes) {
      setValue("notes", data.notes);
    }
  };

  const createAutofillImage = async (file: File) => {
    try {
      if (!file.type.startsWith("image/")) {
        return file;
      }

      const imageUrl = URL.createObjectURL(file);
      const image = await new Promise<HTMLImageElement>((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = reject;
        img.src = imageUrl;
      });
      URL.revokeObjectURL(imageUrl);

      const maxSize = 1600;
      const scale = Math.min(1, maxSize / Math.max(image.width, image.height));
      if (scale >= 1) {
        return file;
      }

      const canvas = document.createElement("canvas");
      canvas.width = Math.round(image.width * scale);
      canvas.height = Math.round(image.height * scale);
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        return file;
      }
      ctx.drawImage(image, 0, 0, canvas.width, canvas.height);

      const blob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob(resolve, "image/jpeg", 0.8)
      );

      if (!blob) {
        return file;
      }

      return new File([blob], "label-autofill.jpg", { type: "image/jpeg" });
    } catch {
      return file;
    }
  };

  const runAutofill = async (file: File) => {
    setAutofillStatus("loading");
    setAutofillMessage("Analyzing label...");

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000);

    try {
      const resized = await createAutofillImage(file);
      const formData = new FormData();
      formData.append("label", resized);

      const response = await fetch("/api/label-autofill", {
        method: "POST",
        body: formData,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorPayload = await response.json().catch(() => ({}));
        if (response.status === 413) {
          setAutofillStatus("error");
          setAutofillMessage("Image too large. Try a smaller photo.");
          return;
        }
        if (response.status === 504) {
          setAutofillStatus("timeout");
          setAutofillMessage("Autofill timed out. Try again.");
          return;
        }
        setAutofillStatus("error");
        setAutofillMessage(
          errorPayload.error ?? "Could not read the label. Try again."
        );
        return;
      }

      const data = await response.json();
      applyAutofill(data);
      setAutofillStatus("success");
      setAutofillMessage("Autofill complete. Review the details.");
    } catch (error) {
      clearTimeout(timeoutId);
      if (error instanceof Error && error.name === "AbortError") {
        setAutofillStatus("timeout");
        setAutofillMessage("Autofill timed out. Try again.");
        return;
      }
      setAutofillStatus("error");
      setAutofillMessage("Could not read the label. Try again.");
    }
  };

  return (
    <div className="min-h-screen bg-[#0f0a09] px-6 py-10 text-zinc-100">
      <div className="mx-auto w-full max-w-3xl space-y-8">
        <header className="flex flex-wrap items-end justify-between gap-4">
          <div className="space-y-2">
            <span className="text-xs uppercase tracking-[0.3em] text-amber-300/70">
              New entry
            </span>
            <h1 className="text-3xl font-semibold text-zinc-50">
              Record a new pour.
            </h1>
            <p className="text-sm text-zinc-300">
              Capture the bottle, the place, and the people around it.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Link
              className="rounded-full border border-white/10 px-4 py-2 text-sm font-semibold text-zinc-200 transition hover:border-white/30"
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
              className="rounded-full border border-amber-300/60 bg-amber-400/10 px-4 py-2 text-sm font-semibold text-amber-200"
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
          </div>
        </header>

        <form className="space-y-6 rounded-3xl border border-white/10 bg-white/5 p-8 shadow-[0_30px_80px_-40px_rgba(0,0,0,0.8)] backdrop-blur" onSubmit={onSubmit}>
          <div className="rounded-2xl border border-white/10 bg-black/30 p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <label className="text-sm font-medium text-zinc-200">
                  Label photo (recommended)
                </label>
                <p className="text-xs text-zinc-400">
                  We’ll try to autofill details from the label. You can edit anything after.
                </p>
              </div>
              {labelFile && autofillStatus !== "loading" ? (
                <button
                  type="button"
                  className="rounded-full border border-white/10 px-3 py-1 text-xs uppercase tracking-[0.2em] text-zinc-200 transition hover:border-amber-300/60 hover:text-amber-200"
                  onClick={() => runAutofill(labelFile)}
                >
                  Try again
                </button>
              ) : null}
            </div>
            <input
              id="label-upload"
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(event) => {
                const file = event.target.files?.[0] ?? null;
                setLabelFile(file);
                if (file) {
                  runAutofill(file);
                }
              }}
            />
            <label
              htmlFor="label-upload"
              className="mt-3 inline-flex w-full cursor-pointer items-center justify-center rounded-full border border-white/10 px-4 py-2 text-sm font-semibold text-zinc-200 transition hover:border-amber-300/60 hover:text-amber-200"
            >
              Upload image
            </label>
            {autofillMessage ? (
              <p
                className={`mt-2 text-sm ${
                  autofillStatus === "success"
                    ? "text-emerald-300"
                    : autofillStatus === "loading"
                      ? "text-zinc-200"
                      : "text-rose-300"
                }`}
              >
                {autofillMessage}
                {autofillStatus === "loading" ? " (Please wait up to 15 seconds.)" : ""}
              </p>
            ) : null}
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <label className="text-sm font-medium text-zinc-200">Wine name</label>
              <input
                className="mt-1 w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-500 focus:border-amber-300 focus:outline-none focus:ring-2 focus:ring-amber-300/30"
                placeholder="Optional"
                {...register("wine_name")}
              />
            </div>
            <div>
              <label className="text-sm font-medium text-zinc-200">Producer</label>
              <input
                className="mt-1 w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-500 focus:border-amber-300 focus:outline-none focus:ring-2 focus:ring-amber-300/30"
                placeholder="Optional"
                {...register("producer")}
              />
            </div>
            <div>
              <label className="text-sm font-medium text-zinc-200">Vintage</label>
              <input
                className="mt-1 w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-500 focus:border-amber-300 focus:outline-none focus:ring-2 focus:ring-amber-300/30"
                placeholder="Optional"
                {...register("vintage")}
              />
            </div>
            <div>
              <label className="text-sm font-medium text-zinc-200">Country</label>
              <input
                className="mt-1 w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-500 focus:border-amber-300 focus:outline-none focus:ring-2 focus:ring-amber-300/30"
                placeholder="Optional"
                {...register("country")}
              />
            </div>
            <div>
              <label className="text-sm font-medium text-zinc-200">Region</label>
              <input
                className="mt-1 w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-500 focus:border-amber-300 focus:outline-none focus:ring-2 focus:ring-amber-300/30"
                placeholder="Optional"
                {...register("region")}
              />
            </div>
            <div>
              <label className="text-sm font-medium text-zinc-200">Appellation</label>
              <input
                className="mt-1 w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-500 focus:border-amber-300 focus:outline-none focus:ring-2 focus:ring-amber-300/30"
                placeholder="Optional"
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
            <label className="text-sm font-medium text-zinc-200">Notes</label>
            <textarea
              className="mt-1 min-h-[120px] w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-500 focus:border-amber-300 focus:outline-none focus:ring-2 focus:ring-amber-300/30"
              placeholder="Optional tasting notes"
              {...register("notes")}
            />
          </div>

          <div>
            <label className="text-sm font-medium text-zinc-200">Location</label>
            <input
              className="mt-1 w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-500 focus:border-amber-300 focus:outline-none focus:ring-2 focus:ring-amber-300/30"
              placeholder="Optional location"
              {...register("location_text")}
            />
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="rounded-2xl border border-white/10 bg-black/30 p-4">
              <label className="text-sm font-medium text-zinc-200">
                Place photo (optional)
              </label>
              <p className="text-xs text-zinc-400">
                Add a photo of the place you enjoyed this wine.
              </p>
              <input
                id="place-upload"
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(event) => setPlaceFile(event.target.files?.[0] ?? null)}
              />
              <label
                htmlFor="place-upload"
                className="mt-3 inline-flex w-full cursor-pointer items-center justify-center rounded-full border border-white/10 px-4 py-2 text-sm font-semibold text-zinc-200 transition hover:border-amber-300/60 hover:text-amber-200"
              >
                Upload image
              </label>
            </div>
            <div className="rounded-2xl border border-white/10 bg-black/30 p-4">
              <label className="text-sm font-medium text-zinc-200">
                Pairing photo (optional)
              </label>
              <p className="text-xs text-zinc-400">
                Capture the dish or pairing you enjoyed.
              </p>
              <input
                id="pairing-upload"
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(event) => setPairingFile(event.target.files?.[0] ?? null)}
              />
              <label
                htmlFor="pairing-upload"
                className="mt-3 inline-flex w-full cursor-pointer items-center justify-center rounded-full border border-white/10 px-4 py-2 text-sm font-semibold text-zinc-200 transition hover:border-amber-300/60 hover:text-amber-200"
              >
                Upload image
              </label>
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

          {errorMessage ? (
            <p className="text-sm text-rose-300">{errorMessage}</p>
          ) : null}

          <div className="flex items-center gap-3">
            <button
              type="submit"
              className="rounded-full bg-amber-400 px-5 py-2 text-sm font-semibold text-zinc-950 transition hover:bg-amber-300 disabled:cursor-not-allowed disabled:opacity-70"
              disabled={isSubmitting}
            >
              Save entry
            </button>
            <Link className="text-sm font-medium text-zinc-300" href="/entries">
              Cancel
            </Link>
          </div>
        </form>
      </div>
    </div>
  );
}

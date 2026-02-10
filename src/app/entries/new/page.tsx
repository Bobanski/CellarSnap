"use client";

import { useEffect, useRef, useState } from "react";
import { Controller, useForm, useWatch } from "react-hook-form";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import { formatConsumedDate } from "@/lib/formatDate";
import NavBar from "@/components/NavBar";
import DatePicker from "@/components/DatePicker";
import PrivacyBadge from "@/components/PrivacyBadge";
import PriceCurrencySelect from "@/components/PriceCurrencySelect";
import {
  ADVANCED_NOTE_FIELDS,
  ADVANCED_NOTE_OPTIONS,
  EMPTY_ADVANCED_NOTES_FORM_VALUES,
  type AdvancedNotesFormValues,
  toAdvancedNotesPayload,
} from "@/lib/advancedNotes";
import {
  type PricePaidCurrency,
  PRICE_PAID_SOURCE_LABELS,
  PRICE_PAID_SOURCE_VALUES,
  QPR_LEVEL_LABELS,
  type PricePaidSource,
  type QprLevel,
} from "@/lib/entryMeta";

type NewEntryForm = {
  wine_name: string;
  producer: string;
  vintage: string;
  country: string;
  region: string;
  appellation: string;
  rating?: number;
  price_paid?: number;
  price_paid_currency: PricePaidCurrency;
  price_paid_source: PricePaidSource | "";
  qpr_level: QprLevel | "";
  notes: string;
  location_text: string;
  consumed_at: string;
  entry_privacy: "public" | "friends" | "private";
  advanced_notes: AdvancedNotesFormValues;
};

type EntryComparisonCard = {
  id: string;
  wine_name: string | null;
  producer: string | null;
  vintage: string | null;
};

type ComparisonCandidate = EntryComparisonCard & {
  consumed_at: string;
  label_image_url: string | null;
};

type CreateEntryResponse = {
  entry: EntryComparisonCard;
  comparison_candidate?: ComparisonCandidate | null;
};

type ComparisonResponse = "more" | "less" | "same_or_not_sure";

export default function NewEntryPage() {
  const router = useRouter();
  const supabase = createSupabaseBrowserClient();
  const { control, register, handleSubmit, getValues, setValue, formState: { errors } } = useForm<NewEntryForm>({
    defaultValues: {
      consumed_at: new Date().toISOString().slice(0, 10),
      entry_privacy: "public",
      price_paid_currency: "usd",
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
  const selectedPricePaidCurrency =
    useWatch({
      control,
      name: "price_paid_currency",
    }) || "usd";
  const [labelPhotos, setLabelPhotos] = useState<
    { file: File; preview: string }[]
  >([]);
  const [placePhotos, setPlacePhotos] = useState<
    { file: File; preview: string }[]
  >([]);
  const [pairingPhotos, setPairingPhotos] = useState<
    { file: File; preview: string }[]
  >([]);
  const [autofillStatus, setAutofillStatus] = useState<
    "idle" | "loading" | "success" | "error" | "timeout"
  >("idle");
  const [autofillMessage, setAutofillMessage] = useState<string | null>(null);
  const [hasAutofillRun, setHasAutofillRun] = useState(false);
  const [users, setUsers] = useState<
    { id: string; display_name: string | null; email: string | null }[]
  >([]);
  const [selectedUserIds, setSelectedUserIds] = useState<string[]>([]);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [pendingComparison, setPendingComparison] = useState<{
    entry: EntryComparisonCard;
    candidate: ComparisonCandidate;
  } | null>(null);
  const [comparisonErrorMessage, setComparisonErrorMessage] = useState<
    string | null
  >(null);
  const [isSubmittingComparison, setIsSubmittingComparison] = useState(false);
  const labelInputRef = useRef<HTMLInputElement | null>(null);
  const placeInputRef = useRef<HTMLInputElement | null>(null);
  const pairingInputRef = useRef<HTMLInputElement | null>(null);

  // Fetch user's default privacy preference and friends list on mount
  useEffect(() => {
    let isMounted = true;

    const loadProfile = async () => {
      const response = await fetch("/api/profile", { cache: "no-store" });
      if (!response.ok) return;
      const data = await response.json();
      if (isMounted && data.profile?.default_entry_privacy) {
        setValue("entry_privacy", data.profile.default_entry_privacy);
      }
    };

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

    loadProfile();
    loadUsers();

    return () => {
      isMounted = false;
    };
  }, [setValue]);

  useEffect(() => {
    return () => {
      labelPhotos.forEach((photo) => URL.revokeObjectURL(photo.preview));
      placePhotos.forEach((photo) => URL.revokeObjectURL(photo.preview));
      pairingPhotos.forEach((photo) => URL.revokeObjectURL(photo.preview));
    };
  }, [labelPhotos, placePhotos, pairingPhotos]);

  const MAX_PHOTOS = 3;

  const addPhotos = (type: "label" | "place" | "pairing", files: FileList) => {
    const list = Array.from(files);
    if (list.length === 0) return;

    if (type === "label") {
      setLabelPhotos((prev) => {
        const remaining = MAX_PHOTOS - prev.length;
        if (remaining <= 0) return prev;
        const next = list.slice(0, remaining).map((file) => ({
          file,
          preview: URL.createObjectURL(file),
        }));
        if (!hasAutofillRun && prev.length === 0 && next[0]) {
          runAutofill(next[0].file);
          setHasAutofillRun(true);
        }
        return [...prev, ...next];
      });
      return;
    }

    if (type === "place") {
      setPlacePhotos((prev) => {
        const remaining = MAX_PHOTOS - prev.length;
        if (remaining <= 0) return prev;
        const next = list.slice(0, remaining).map((file) => ({
          file,
          preview: URL.createObjectURL(file),
        }));
        return [...prev, ...next];
      });
      return;
    }

    setPairingPhotos((prev) => {
      const remaining = MAX_PHOTOS - prev.length;
      if (remaining <= 0) return prev;
      const next = list.slice(0, remaining).map((file) => ({
        file,
        preview: URL.createObjectURL(file),
      }));
      return [...prev, ...next];
    });
  };

  const removePhoto = (
    type: "label" | "place" | "pairing",
    index: number
  ) => {
    if (type === "label") {
      setLabelPhotos((prev) => {
        const target = prev[index];
        if (target) URL.revokeObjectURL(target.preview);
        return prev.filter((_, i) => i !== index);
      });
      return;
    }
    if (type === "place") {
      setPlacePhotos((prev) => {
        const target = prev[index];
        if (target) URL.revokeObjectURL(target.preview);
        return prev.filter((_, i) => i !== index);
      });
      return;
    }
    setPairingPhotos((prev) => {
      const target = prev[index];
      if (target) URL.revokeObjectURL(target.preview);
      return prev.filter((_, i) => i !== index);
    });
  };

  const movePhoto = (
    type: "label" | "place" | "pairing",
    index: number,
    direction: "up" | "down"
  ) => {
    const swap = (list: { file: File; preview: string }[]) => {
      const targetIndex = direction === "up" ? index - 1 : index + 1;
      if (targetIndex < 0 || targetIndex >= list.length) return list;
      const copy = [...list];
      const temp = copy[index];
      copy[index] = copy[targetIndex];
      copy[targetIndex] = temp;
      return copy;
    };
    if (type === "label") {
      setLabelPhotos((prev) => swap(prev));
      return;
    }
    if (type === "place") {
      setPlacePhotos((prev) => swap(prev));
      return;
    }
    setPairingPhotos((prev) => swap(prev));
  };

  const uploadPhotos = async (
    entryId: string,
    type: "label" | "place" | "pairing",
    photos: { file: File }[]
  ) => {
    for (const photo of photos) {
      const createResponse = await fetch(`/api/entries/${entryId}/photos`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type }),
      });

      if (!createResponse.ok) {
        const payload = await createResponse.json().catch(() => ({}));
        throw new Error(payload.error ?? "Unable to create photo record.");
      }

      const { photo: created } = await createResponse.json();
      const { error } = await supabase.storage
        .from("wine-photos")
        .upload(created.path, photo.file, {
          upsert: true,
          contentType: photo.file.type,
        });

      if (error) {
        throw new Error(error.message);
      }
    }
  };

  const submitComparison = async (response: ComparisonResponse) => {
    if (!pendingComparison || isSubmittingComparison) {
      return;
    }

    setComparisonErrorMessage(null);
    setIsSubmittingComparison(true);

    try {
      const apiResponse = await fetch(
        `/api/entries/${pendingComparison.entry.id}/comparison`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            comparison_entry_id: pendingComparison.candidate.id,
            response,
          }),
        }
      );

      if (!apiResponse.ok && apiResponse.status !== 409) {
        const payload = await apiResponse.json().catch(() => null);
        const apiError =
          typeof payload?.error === "string"
            ? payload.error
            : "Unable to save comparison response.";
        setComparisonErrorMessage(apiError);
        setIsSubmittingComparison(false);
        return;
      }

      router.push(`/entries/${pendingComparison.entry.id}`);
    } catch {
      setComparisonErrorMessage(
        "Unable to save comparison response. Check your connection and try again."
      );
      setIsSubmittingComparison(false);
    }
  };

  const continueWithoutSavingComparison = () => {
    if (!pendingComparison) {
      return;
    }
    router.push(`/entries/${pendingComparison.entry.id}`);
  };

  const formatWineTitle = (wine: {
    wine_name: string | null;
    producer: string | null;
    vintage: string | null;
  }) => wine.wine_name?.trim() || "Untitled wine";

  const formatWineMeta = (wine: {
    wine_name: string | null;
    producer: string | null;
    vintage: string | null;
  }) => {
    if (wine.producer && wine.vintage) {
      return `${wine.producer} · ${wine.vintage}`;
    }
    if (wine.producer) {
      return wine.producer;
    }
    if (wine.vintage) {
      return wine.vintage;
    }
    return "No producer or vintage";
  };

  const onSubmit = handleSubmit(async (values) => {
    setIsSubmitting(true);
    setErrorMessage(null);
    setPendingComparison(null);
    setComparisonErrorMessage(null);

    const rating =
      typeof values.rating === "number" && !Number.isNaN(values.rating)
        ? Number(values.rating)
        : undefined;
    const pricePaid =
      typeof values.price_paid === "number" && !Number.isNaN(values.price_paid)
        ? Number(values.price_paid.toFixed(2))
        : undefined;
    const pricePaidCurrency = values.price_paid_currency || "usd";
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

    let response: Response;
    try {
      response = await fetch("/api/entries", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          wine_name: values.wine_name.trim(),
          producer: values.producer || null,
          vintage: values.vintage || null,
          country: values.country || null,
          region: values.region || null,
          appellation: values.appellation || null,
          rating,
          price_paid: pricePaid ?? null,
          price_paid_currency:
            pricePaid !== undefined ? pricePaidCurrency : null,
          price_paid_source: pricePaidSource ?? null,
          qpr_level: values.qpr_level || null,
          notes: values.notes || null,
          location_text: values.location_text || null,
          consumed_at: values.consumed_at,
          tasted_with_user_ids: selectedUserIds,
          entry_privacy: values.entry_privacy,
          advanced_notes: toAdvancedNotesPayload(values.advanced_notes),
        }),
      });
    } catch {
      setIsSubmitting(false);
      setErrorMessage("Unable to create entry. Check your connection.");
      return;
    }

    if (!response.ok) {
      const payload = await response.json().catch(() => null);
      const apiError =
        typeof payload?.error === "string"
          ? payload.error
          : payload?.error?.fieldErrors?.rating?.[0] ??
            payload?.error?.formErrors?.[0] ??
            "Unable to create entry.";
      setIsSubmitting(false);
      setErrorMessage(apiError);
      return;
    }

    let createPayload: CreateEntryResponse;
    try {
      createPayload = (await response.json()) as CreateEntryResponse;
    } catch {
      setIsSubmitting(false);
      setErrorMessage("Entry created, but response parsing failed.");
      return;
    }

    const entry = createPayload.entry;
    const comparisonCandidate = createPayload.comparison_candidate ?? null;

    if (!entry?.id) {
      setIsSubmitting(false);
      setErrorMessage("Entry created, but entry ID was missing.");
      return;
    }

    try {
      if (labelPhotos.length > 0) {
        await uploadPhotos(entry.id, "label", labelPhotos);
      }
      if (placePhotos.length > 0) {
        await uploadPhotos(entry.id, "place", placePhotos);
      }
      if (pairingPhotos.length > 0) {
        await uploadPhotos(entry.id, "pairing", pairingPhotos);
      }
    } catch (error) {
      setIsSubmitting(false);
      setErrorMessage(
        error instanceof Error ? error.message : "Photo upload failed."
      );
      return;
    }

    setIsSubmitting(false);

    if (comparisonCandidate) {
      setPendingComparison({
        entry,
        candidate: comparisonCandidate,
      });
      return;
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
        if (response.status === 401) {
          setAutofillStatus("error");
          setAutofillMessage("Your session expired. Sign in again and retry.");
          return;
        }
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
      const confidenceLabel =
        typeof data.confidence === "number"
          ? `Confidence ${Math.round(data.confidence * 100)}%`
          : null;
      const warningCount = Array.isArray(data.warnings) ? data.warnings.length : 0;
      const warningLabel =
        warningCount > 0 ? `${warningCount} field${warningCount > 1 ? "s" : ""} uncertain` : null;
      setAutofillMessage(
        [confidenceLabel, warningLabel]
          .filter(Boolean)
          .join(" • ") || "Autofill complete. Review the details."
      );
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

  const newlyLoggedWinePreviewUrl = labelPhotos[0]?.preview ?? null;

  return (
    <div className="min-h-screen bg-[#0f0a09] px-6 py-10 text-zinc-100">
      <div className="mx-auto w-full max-w-6xl space-y-8">
        <NavBar />
      </div>
      <div className="mx-auto w-full max-w-3xl space-y-8 pt-8">
        <header className="space-y-2">
          <span className="text-xs uppercase tracking-[0.3em] text-amber-300/70">
            New entry
          </span>
          <h1 className="text-3xl font-semibold text-zinc-50">
            Record a new pour.
          </h1>
          <p className="text-sm text-zinc-300">
            Capture the bottle, the place, and the people around it.
          </p>
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
              {labelPhotos.length > 0 && autofillStatus !== "loading" ? (
                <button
                  type="button"
                  className="rounded-full border border-white/10 px-3 py-1 text-xs uppercase tracking-[0.2em] text-zinc-200 transition hover:border-amber-300/60 hover:text-amber-200"
                  onClick={() => {
                    const first = labelPhotos[0];
                    if (first) runAutofill(first.file);
                  }}
                >
                  Try again
                </button>
              ) : null}
            </div>
            <input
              ref={labelInputRef}
              id="label-upload"
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={(event) => {
                if (!event.target.files) return;
                addPhotos("label", event.target.files);
                event.target.value = "";
              }}
            />
            {labelPhotos.length > 0 ? (
              <div className="mt-3 grid gap-2 sm:grid-cols-3">
                {labelPhotos.map((photo, index) => (
                  <div
                    key={photo.preview}
                    className="group relative overflow-hidden rounded-2xl border border-white/10"
                  >
                    <img
                      src={photo.preview}
                      alt={`Label preview ${index + 1}`}
                      className="h-32 w-full object-cover"
                    />
                    {labelPhotos.length > 1 ? (
                      <div className="absolute left-2 top-2 hidden items-center gap-1 group-hover:flex">
                        <button
                          type="button"
                          className="h-7 w-7 rounded-full border border-white/20 bg-black/60 text-xs text-zinc-200 transition hover:border-amber-300/60 hover:text-amber-200"
                          disabled={index === 0}
                          onClick={() => movePhoto("label", index, "up")}
                          aria-label="Move label photo up"
                        >
                          ↑
                        </button>
                        <button
                          type="button"
                          className="h-7 w-7 rounded-full border border-white/20 bg-black/60 text-xs text-zinc-200 transition hover:border-amber-300/60 hover:text-amber-200"
                          disabled={index === labelPhotos.length - 1}
                          onClick={() => movePhoto("label", index, "down")}
                          aria-label="Move label photo down"
                        >
                          ↓
                        </button>
                      </div>
                    ) : null}
                    <button
                      type="button"
                      className="absolute right-2 top-2 hidden h-7 w-7 items-center justify-center rounded-full border border-white/20 bg-black/60 text-sm text-zinc-200 transition hover:border-rose-300 hover:text-rose-200 group-hover:flex"
                      aria-label="Remove label photo"
                      onClick={() => {
                        removePhoto("label", index);
                        if (index === 0) {
                          setAutofillStatus("idle");
                          setAutofillMessage(null);
                        }
                      }}
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            ) : null}
            <button
              type="button"
              className="mt-3 inline-flex w-full items-center justify-center rounded-full border border-white/10 px-4 py-2 text-sm font-semibold text-zinc-200 transition hover:border-amber-300/60 hover:text-amber-200"
              onClick={() => labelInputRef.current?.click()}
              disabled={labelPhotos.length >= MAX_PHOTOS}
            >
              {labelPhotos.length >= MAX_PHOTOS
                ? "Max photos reached"
                : "Upload image"}
            </button>
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
              <label className="text-sm font-medium text-zinc-200">Wine name <span className="text-amber-400">*</span></label>
              <input
                className="mt-1 w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-500 focus:border-amber-300 focus:outline-none focus:ring-2 focus:ring-amber-300/30"
                placeholder="Required"
                {...register("wine_name", { required: "Wine name is required" })}
              />
              {errors.wine_name ? (
                <p className="mt-1 text-xs text-rose-300">{errors.wine_name.message}</p>
              ) : null}
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
                  <div className="mt-1 flex">
                    <input type="hidden" {...register("price_paid_currency")} />
                    <PriceCurrencySelect
                      value={selectedPricePaidCurrency}
                      onChange={(currency) =>
                        setValue("price_paid_currency", currency, {
                          shouldDirty: true,
                        })
                      }
                    />
                    <input
                      type="text"
                      inputMode="decimal"
                      pattern="[0-9]*[.]?[0-9]*"
                      className="h-10 w-full rounded-r-xl border border-white/10 border-l-0 bg-black/30 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-500 focus:border-amber-300 focus:outline-none focus:ring-2 focus:ring-amber-300/30"
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
            <label className="text-sm font-medium text-zinc-200">Notes</label>
            <textarea
              className="mt-1 min-h-[120px] w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-500 focus:border-amber-300 focus:outline-none focus:ring-2 focus:ring-amber-300/30"
              placeholder="Optional tasting notes"
              {...register("notes")}
            />
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <label className="text-sm font-medium text-zinc-200">Location</label>
              <input
                className="mt-1 w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-500 focus:border-amber-300 focus:outline-none focus:ring-2 focus:ring-amber-300/30"
                placeholder="Optional location"
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

          <div className="grid gap-4 md:grid-cols-2">
            <div className="rounded-2xl border border-white/10 bg-black/30 p-4">
              <label className="text-sm font-medium text-zinc-200">
                Place photo (optional)
              </label>
              <p className="text-xs text-zinc-400">
                Add a photo of the place you enjoyed this wine.
              </p>
              <input
                ref={placeInputRef}
                id="place-upload"
                type="file"
                accept="image/*"
                multiple
                className="hidden"
                onChange={(event) => {
                  if (!event.target.files) return;
                  addPhotos("place", event.target.files);
                  event.target.value = "";
                }}
              />
              {placePhotos.length > 0 ? (
                <div className="mt-3 grid gap-2 sm:grid-cols-3">
                {placePhotos.map((photo, index) => (
                    <div
                      key={photo.preview}
                      className="group relative overflow-hidden rounded-2xl border border-white/10"
                    >
                      <img
                        src={photo.preview}
                        alt={`Place preview ${index + 1}`}
                        className="h-32 w-full object-cover"
                      />
                    {placePhotos.length > 1 ? (
                      <div className="absolute left-2 top-2 hidden items-center gap-1 group-hover:flex">
                        <button
                          type="button"
                          className="h-7 w-7 rounded-full border border-white/20 bg-black/60 text-xs text-zinc-200 transition hover:border-amber-300/60 hover:text-amber-200"
                          disabled={index === 0}
                          onClick={() => movePhoto("place", index, "up")}
                          aria-label="Move place photo up"
                        >
                          ↑
                        </button>
                        <button
                          type="button"
                          className="h-7 w-7 rounded-full border border-white/20 bg-black/60 text-xs text-zinc-200 transition hover:border-amber-300/60 hover:text-amber-200"
                          disabled={index === placePhotos.length - 1}
                          onClick={() => movePhoto("place", index, "down")}
                          aria-label="Move place photo down"
                        >
                          ↓
                        </button>
                      </div>
                    ) : null}
                      <button
                        type="button"
                        className="absolute right-2 top-2 hidden h-7 w-7 items-center justify-center rounded-full border border-white/20 bg-black/60 text-sm text-zinc-200 transition hover:border-rose-300 hover:text-rose-200 group-hover:flex"
                        aria-label="Remove place photo"
                        onClick={() => removePhoto("place", index)}
                      >
                        ×
                      </button>
                    </div>
                  ))}
                </div>
              ) : null}
              <button
                type="button"
                className="mt-3 inline-flex w-full items-center justify-center rounded-full border border-white/10 px-4 py-2 text-sm font-semibold text-zinc-200 transition hover:border-amber-300/60 hover:text-amber-200"
                onClick={() => placeInputRef.current?.click()}
                disabled={placePhotos.length >= MAX_PHOTOS}
              >
                {placePhotos.length >= MAX_PHOTOS
                  ? "Max photos reached"
                  : "Upload image"}
              </button>
            </div>
            <div className="rounded-2xl border border-white/10 bg-black/30 p-4">
              <label className="text-sm font-medium text-zinc-200">
                Pairing photo (optional)
              </label>
              <p className="text-xs text-zinc-400">
                Capture the dish or pairing you enjoyed.
              </p>
              <input
                ref={pairingInputRef}
                id="pairing-upload"
                type="file"
                accept="image/*"
                multiple
                className="hidden"
                onChange={(event) => {
                  if (!event.target.files) return;
                  addPhotos("pairing", event.target.files);
                  event.target.value = "";
                }}
              />
              {pairingPhotos.length > 0 ? (
                <div className="mt-3 grid gap-2 sm:grid-cols-3">
                {pairingPhotos.map((photo, index) => (
                    <div
                      key={photo.preview}
                      className="group relative overflow-hidden rounded-2xl border border-white/10"
                    >
                      <img
                        src={photo.preview}
                        alt={`Pairing preview ${index + 1}`}
                        className="h-32 w-full object-cover"
                      />
                    {pairingPhotos.length > 1 ? (
                      <div className="absolute left-2 top-2 hidden items-center gap-1 group-hover:flex">
                        <button
                          type="button"
                          className="h-7 w-7 rounded-full border border-white/20 bg-black/60 text-xs text-zinc-200 transition hover:border-amber-300/60 hover:text-amber-200"
                          disabled={index === 0}
                          onClick={() => movePhoto("pairing", index, "up")}
                          aria-label="Move pairing photo up"
                        >
                          ↑
                        </button>
                        <button
                          type="button"
                          className="h-7 w-7 rounded-full border border-white/20 bg-black/60 text-xs text-zinc-200 transition hover:border-amber-300/60 hover:text-amber-200"
                          disabled={index === pairingPhotos.length - 1}
                          onClick={() => movePhoto("pairing", index, "down")}
                          aria-label="Move pairing photo down"
                        >
                          ↓
                        </button>
                      </div>
                    ) : null}
                      <button
                        type="button"
                        className="absolute right-2 top-2 hidden h-7 w-7 items-center justify-center rounded-full border border-white/20 bg-black/60 text-sm text-zinc-200 transition hover:border-rose-300 hover:text-rose-200 group-hover:flex"
                        aria-label="Remove pairing photo"
                        onClick={() => removePhoto("pairing", index)}
                      >
                        ×
                      </button>
                    </div>
                  ))}
                </div>
              ) : null}
              <button
                type="button"
                className="mt-3 inline-flex w-full items-center justify-center rounded-full border border-white/10 px-4 py-2 text-sm font-semibold text-zinc-200 transition hover:border-amber-300/60 hover:text-amber-200"
                onClick={() => pairingInputRef.current?.click()}
                disabled={pairingPhotos.length >= MAX_PHOTOS}
              >
                {pairingPhotos.length >= MAX_PHOTOS
                  ? "Max photos reached"
                  : "Upload image"}
              </button>
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
            <label className="text-sm font-medium text-zinc-200">
              Visibility
            </label>
            <p className="mt-1 text-xs text-zinc-400">
              This sets who can view this entry in feeds and on your profile.
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

      {pendingComparison ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
          <div className="absolute inset-0 bg-black/75" aria-hidden />
          <div className="relative w-full max-w-3xl rounded-3xl border border-white/10 bg-[#14100f] p-6 shadow-[0_30px_80px_-40px_rgba(0,0,0,0.9)] sm:p-8">
            <button
              type="button"
              className="absolute right-5 top-5 rounded-full border border-white/15 px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-zinc-300 transition hover:border-amber-300/60 hover:text-amber-200 disabled:opacity-50"
              onClick={() => submitComparison("same_or_not_sure")}
              disabled={isSubmittingComparison}
            >
              Skip
            </button>

            <h2 className="text-2xl font-semibold text-zinc-50">
              How did this wine compare?
            </h2>

            <div className="mt-6 flex flex-col items-start gap-3">
              <p className="text-base text-zinc-300 sm:text-lg">
                <span className="font-semibold text-zinc-100">
                  Compared to the previous wine
                </span>
                , I like this wine...
              </p>

              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  className="rounded-full border border-white/10 px-5 py-2.5 text-base font-semibold text-zinc-200 transition hover:border-white/30 disabled:opacity-60"
                  onClick={() => submitComparison("more")}
                  disabled={isSubmittingComparison}
                >
                  More
                </button>
                <button
                  type="button"
                  className="rounded-full border border-white/10 px-5 py-2.5 text-base font-semibold text-zinc-200 transition hover:border-white/30 disabled:opacity-60"
                  onClick={() => submitComparison("same_or_not_sure")}
                  disabled={isSubmittingComparison}
                >
                  Not sure / The same
                </button>
                <button
                  type="button"
                  className="rounded-full border border-white/10 px-5 py-2.5 text-base font-semibold text-zinc-200 transition hover:border-white/30 disabled:opacity-60"
                  onClick={() => submitComparison("less")}
                  disabled={isSubmittingComparison}
                >
                  Less
                </button>
                {comparisonErrorMessage ? (
                  <button
                    type="button"
                    className="rounded-full border border-white/10 px-4 py-2 text-sm font-semibold text-zinc-200 transition hover:border-white/30"
                    onClick={continueWithoutSavingComparison}
                    disabled={isSubmittingComparison}
                  >
                    Continue without saving
                  </button>
                ) : null}
              </div>
            </div>

            {comparisonErrorMessage ? (
              <p className="mt-4 text-sm text-rose-300">{comparisonErrorMessage}</p>
            ) : null}

            <div className="mt-6 grid gap-4 md:grid-cols-2">
              <div className="overflow-hidden rounded-2xl border border-white/10 bg-black/30">
                <div className="h-40 w-full bg-black/40">
                  {newlyLoggedWinePreviewUrl ? (
                    <img
                      src={newlyLoggedWinePreviewUrl}
                      alt="Wine you just logged"
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <div className="flex h-full items-center justify-center text-xs text-zinc-500">
                      No photo
                    </div>
                  )}
                </div>
                <div className="space-y-1 border-t border-white/10 p-4">
                  <p className="text-xs uppercase tracking-[0.2em] text-amber-300/70">
                    Wine you just logged
                  </p>
                  <p className="text-sm font-semibold text-zinc-50">
                    {formatWineTitle(pendingComparison.entry)}
                  </p>
                  <p className="text-xs text-zinc-400">
                    {formatWineMeta(pendingComparison.entry)}
                  </p>
                </div>
              </div>

              <div className="overflow-hidden rounded-2xl border border-white/10 bg-black/30">
                <div className="h-40 w-full bg-black/40">
                  {pendingComparison.candidate.label_image_url ? (
                    <img
                      src={pendingComparison.candidate.label_image_url}
                      alt="Previous wine for comparison"
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <div className="flex h-full items-center justify-center text-xs text-zinc-500">
                      No photo
                    </div>
                  )}
                </div>
                <div className="space-y-1 border-t border-white/10 p-4">
                  <p className="text-xs uppercase tracking-[0.2em] text-zinc-400">
                    Previous wine
                  </p>
                  <p className="text-sm font-semibold text-zinc-50">
                    {formatWineTitle(pendingComparison.candidate)}
                  </p>
                  <p className="text-xs text-zinc-400">
                    {formatWineMeta(pendingComparison.candidate)}
                  </p>
                  <p className="text-xs text-zinc-500">
                    Logged {formatConsumedDate(pendingComparison.candidate.consumed_at)}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

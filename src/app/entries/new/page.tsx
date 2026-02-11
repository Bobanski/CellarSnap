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
import PrimaryGrapeSelector from "@/components/PrimaryGrapeSelector";
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
import { getTodayLocalYmd } from "@/lib/dateYmd";
import type { PrimaryGrape } from "@/types/wine";

type NewEntryForm = {
  wine_name: string;
  producer: string;
  vintage: string;
  country: string;
  region: string;
  appellation: string;
  classification: string;
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
type PrimaryGrapeSelection = Pick<PrimaryGrape, "id" | "name">;

export default function NewEntryPage() {
  const router = useRouter();
  const supabase = createSupabaseBrowserClient();
  const { control, register, handleSubmit, getValues, setValue, formState: { errors } } = useForm<NewEntryForm>({
    defaultValues: {
      consumed_at: getTodayLocalYmd(),
      entry_privacy: "public",
      price_paid_currency: "usd",
      price_paid_source: "",
      qpr_level: "",
      classification: "",
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
  const [users, setUsers] = useState<
    { id: string; display_name: string | null; email: string | null }[]
  >([]);
  const [selectedUserIds, setSelectedUserIds] = useState<string[]>([]);
  const [selectedPrimaryGrapes, setSelectedPrimaryGrapes] = useState<
    PrimaryGrapeSelection[]
  >([]);
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

  // Lineup detection state
  type BottleBbox = {
    x: number;
    y: number;
    width: number;
    height: number;
  };

  type LabelBbox = {
    x: number;
    y: number;
    width: number;
    height: number;
  };

  type LabelAnchor = {
    x: number;
    y: number;
  };

  type LineupApiWine = {
    wine_name?: string | null;
    producer?: string | null;
    vintage?: string | null;
    country?: string | null;
    region?: string | null;
    appellation?: string | null;
    classification?: string | null;
    primary_grape_suggestions?: string[] | null;
    confidence?: number | null;
    bottle_bbox?: BottleBbox | null;
    label_bbox?: LabelBbox | null;
    label_anchor?: LabelAnchor | null;
  };

  type LabelAutofillResult = {
    wine_name?: string | null;
    producer?: string | null;
    vintage?: string | null;
    country?: string | null;
    region?: string | null;
    appellation?: string | null;
    classification?: string | null;
    primary_grape_suggestions?: string[] | null;
    primary_grape_confidence?: number | null;
    confidence?: number | null;
    warnings?: string[] | null;
  };

  type LineupWine = {
    wine_name: string | null;
    producer: string | null;
    vintage: string | null;
    country: string | null;
    region: string | null;
    appellation: string | null;
    classification: string | null;
    primary_grape_suggestions?: string[];
    confidence: number | null;
    bottle_bbox: BottleBbox | null;
    label_bbox: LabelBbox | null;
    label_anchor: LabelAnchor | null;
    included: boolean;
    photoIndex: number;
  };
  const [lineupWines, setLineupWines] = useState<LineupWine[]>([]);
  const [lineupCreating, setLineupCreating] = useState(false);
  const [lineupCreatedCount, setLineupCreatedCount] = useState(0);

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
      let filesToAnalyze: File[] = [];
      setLabelPhotos((prev) => {
        const remaining = MAX_PHOTOS - prev.length;
        if (remaining <= 0) return prev;
        const next = list.slice(0, remaining).map((file) => ({
          file,
          preview: URL.createObjectURL(file),
        }));
        const combined = [...prev, ...next];
        filesToAnalyze = combined.map((photo) => photo.file);
        return combined;
      });
      if (filesToAnalyze.length > 0) {
        runAnalysis(filesToAnalyze);
      }
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

  const normalizeGrapeLookupValue = (value: string) =>
    value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

  const normalizeTextField = (value: unknown) => {
    if (typeof value !== "string") return null;
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  };

  const normalizeBottleBbox = (value: unknown): BottleBbox | null => {
    if (!value || typeof value !== "object") {
      return null;
    }

    const bbox = value as Partial<BottleBbox>;
    const x = Number(bbox.x);
    const y = Number(bbox.y);
    const width = Number(bbox.width);
    const height = Number(bbox.height);

    if (
      !Number.isFinite(x) ||
      !Number.isFinite(y) ||
      !Number.isFinite(width) ||
      !Number.isFinite(height)
    ) {
      return null;
    }

    const clampedX = Math.min(1, Math.max(0, x));
    const clampedY = Math.min(1, Math.max(0, y));
    const clampedWidth = Math.min(1, Math.max(0, width));
    const clampedHeight = Math.min(1, Math.max(0, height));

    const right = Math.min(1, clampedX + clampedWidth);
    const bottom = Math.min(1, clampedY + clampedHeight);
    const normalizedWidth = right - clampedX;
    const normalizedHeight = bottom - clampedY;

    if (normalizedWidth < 0.05 || normalizedHeight < 0.08) {
      return null;
    }

    return {
      x: clampedX,
      y: clampedY,
      width: normalizedWidth,
      height: normalizedHeight,
    };
  };

  const normalizeLabelBbox = (value: unknown): LabelBbox | null => {
    if (!value || typeof value !== "object") {
      return null;
    }

    const bbox = value as Partial<LabelBbox>;
    const x = Number(bbox.x);
    const y = Number(bbox.y);
    const width = Number(bbox.width);
    const height = Number(bbox.height);

    if (
      !Number.isFinite(x) ||
      !Number.isFinite(y) ||
      !Number.isFinite(width) ||
      !Number.isFinite(height)
    ) {
      return null;
    }

    const clampedX = Math.min(1, Math.max(0, x));
    const clampedY = Math.min(1, Math.max(0, y));
    const clampedWidth = Math.min(1, Math.max(0, width));
    const clampedHeight = Math.min(1, Math.max(0, height));

    const right = Math.min(1, clampedX + clampedWidth);
    const bottom = Math.min(1, clampedY + clampedHeight);
    const normalizedWidth = right - clampedX;
    const normalizedHeight = bottom - clampedY;

    if (normalizedWidth < 0.03 || normalizedHeight < 0.03) {
      return null;
    }

    return {
      x: clampedX,
      y: clampedY,
      width: normalizedWidth,
      height: normalizedHeight,
    };
  };

  const normalizeLabelAnchor = (value: unknown): LabelAnchor | null => {
    if (!value || typeof value !== "object") {
      return null;
    }

    const anchor = value as Partial<LabelAnchor>;
    const x = Number(anchor.x);
    const y = Number(anchor.y);
    if (!Number.isFinite(x) || !Number.isFinite(y)) {
      return null;
    }

    return {
      x: Math.min(1, Math.max(0, x)),
      y: Math.min(1, Math.max(0, y)),
    };
  };

  const hasDetectedWineDetails = (wine: {
    wine_name: string | null;
    producer: string | null;
    vintage: string | null;
    country: string | null;
    region: string | null;
    appellation: string | null;
    classification: string | null;
    primary_grape_suggestions?: string[];
  }) => {
    return Boolean(
      wine.wine_name ||
        wine.producer ||
        wine.vintage ||
        wine.country ||
        wine.region ||
        wine.appellation ||
        wine.classification ||
        (wine.primary_grape_suggestions?.length ?? 0) > 0
    );
  };

  const shouldForceLineupForSinglePhoto = (wine: LineupWine | null) => {
    if (!wine?.bottle_bbox) {
      return false;
    }

    const bbox = wine.bottle_bbox;
    // If the only detected bottle is relatively narrow in-frame, treat it as
    // likely lineup framing and avoid single-bottle autofill.
    return bbox.width < 0.42 && bbox.height > 0.45;
  };

  const resolveSuggestedGrapes = async (suggestions: string[]) => {
    const resolved: PrimaryGrapeSelection[] = [];
    const seenIds = new Set<string>();

    for (const suggestion of suggestions) {
      const response = await fetch(
        `/api/grapes?q=${encodeURIComponent(suggestion)}&limit=6`,
        {
          cache: "no-store",
        }
      );

      if (!response.ok) {
        continue;
      }

      const payload = (await response.json()) as {
        grapes?: PrimaryGrapeSelection[];
      };
      const options = payload.grapes ?? [];
      if (options.length === 0) {
        continue;
      }

      const normalizedSuggestion = normalizeGrapeLookupValue(suggestion);
      const exact =
        options.find(
          (option) =>
            normalizeGrapeLookupValue(option.name) === normalizedSuggestion
        ) ?? options[0];

      if (!exact || seenIds.has(exact.id)) {
        continue;
      }

      seenIds.add(exact.id);
      resolved.push(exact);

      if (resolved.length >= 3) {
        break;
      }
    }

    return resolved;
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
          classification: values.classification || null,
          primary_grape_ids: selectedPrimaryGrapes.map((grape) => grape.id),
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

  const applyAutofill = async (data: {
    wine_name?: string | null;
    producer?: string | null;
    vintage?: string | null;
    country?: string | null;
    region?: string | null;
    appellation?: string | null;
    classification?: string | null;
    primary_grape_suggestions?: string[] | null;
    primary_grape_confidence?: number | null;
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
    if (!current.classification && data.classification) {
      setValue("classification", data.classification);
    }

    if (selectedPrimaryGrapes.length > 0) {
      return;
    }

    const grapeSuggestions = Array.isArray(data.primary_grape_suggestions)
      ? data.primary_grape_suggestions
          .map((value) => value.trim())
          .filter((value) => value.length > 0)
      : [];

    if (grapeSuggestions.length === 0) {
      return;
    }

    const seenSuggestions = new Set<string>();
    const uniqueSuggestions = grapeSuggestions
      .filter((suggestion) => {
        const dedupeKey = suggestion.toLowerCase();
        if (seenSuggestions.has(dedupeKey)) {
          return false;
        }
        seenSuggestions.add(dedupeKey);
        return true;
      })
      .slice(0, 3);
    const shouldApplyMultiple =
      typeof data.primary_grape_confidence === "number" &&
      data.primary_grape_confidence >= 0.9 &&
      uniqueSuggestions.length <= 2;
    const suggestionsToApply = shouldApplyMultiple
      ? uniqueSuggestions
      : uniqueSuggestions.slice(0, 1);

    const resolved = await resolveSuggestedGrapes(suggestionsToApply);
    if (resolved.length > 0) {
      setSelectedPrimaryGrapes(resolved);
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

  const createLineupBottleThumbnail = async (
    sourceFile: File,
    bottleBbox: BottleBbox | null,
    labelBbox: LabelBbox | null,
    labelAnchor: LabelAnchor | null,
    outputIndex: number
  ) => {
    if (!sourceFile.type.startsWith("image/") || !bottleBbox) {
      return sourceFile;
    }

    let imageUrl: string | null = null;

    try {
      imageUrl = URL.createObjectURL(sourceFile);
      const image = await new Promise<HTMLImageElement>((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = reject;
        img.src = imageUrl ?? "";
      });

      const boxX = Math.round(bottleBbox.x * image.width);
      const boxY = Math.round(bottleBbox.y * image.height);
      const boxWidth = Math.round(bottleBbox.width * image.width);
      const boxHeight = Math.round(bottleBbox.height * image.height);

      if (boxWidth < 8 || boxHeight < 8) {
        return sourceFile;
      }

      // Keep the original tight X framing so each thumbnail stays isolated
      // to a single bottle even in dense lineups.
      const horizontalPadding = Math.round(boxWidth * 0.16);

      const cropX = Math.max(0, boxX - horizontalPadding);
      const cropRight = Math.min(image.width, boxX + boxWidth + horizontalPadding);
      const cropWidth = cropRight - cropX;
      const side = Math.min(cropWidth, image.width, image.height);

      if (side < 8) {
        return sourceFile;
      }

      const inferredLabelTop = boxY + boxHeight * 0.28;
      const inferredLabelBottom = boxY + boxHeight * 0.82;

      let labelTop = inferredLabelTop;
      let labelBottom = inferredLabelBottom;
      if (labelBbox) {
        const modelLabelTop = labelBbox.y * image.height;
        const modelLabelBottom = (labelBbox.y + labelBbox.height) * image.height;
        const boundedTop = Math.max(
          boxY + boxHeight * 0.12,
          Math.min(boxY + boxHeight * 0.9, modelLabelTop)
        );
        const boundedBottom = Math.max(
          boundedTop + 8,
          Math.min(boxY + boxHeight * 0.95, modelLabelBottom)
        );
        if (boundedBottom - boundedTop >= 8) {
          labelTop = boundedTop;
          labelBottom = boundedBottom;
        }
      }

      const labelHeight = Math.max(8, labelBottom - labelTop);
      const labelCenterY = labelTop + labelHeight / 2;
      const anchorY = labelAnchor ? labelAnchor.y * image.height : null;
      const anchorIsReasonable =
        typeof anchorY === "number" &&
        Number.isFinite(anchorY) &&
        anchorY >= labelTop - boxHeight * 0.08 &&
        anchorY <= labelBottom + boxHeight * 0.18;
      const blendedCenterY = anchorIsReasonable
        ? labelCenterY * 0.7 + anchorY * 0.3
        : labelCenterY;

      // Push slightly lower so the main body label is centered in square feed crops.
      const focusY = blendedCenterY + labelHeight * 0.16;
      const minY = labelTop + labelHeight * 0.2;
      const maxY = labelBottom + labelHeight * 0.9;
      const constrainedFocusY = Math.min(
        maxY,
        Math.max(minY, focusY)
      );
      const cropY = Math.min(
        Math.max(0, Math.round(constrainedFocusY - side / 2)),
        image.height - side
      );

      const canvas = document.createElement("canvas");
      canvas.width = side;
      canvas.height = side;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        return sourceFile;
      }

      ctx.drawImage(
        image,
        cropX,
        cropY,
        side,
        side,
        0,
        0,
        side,
        side
      );

      const blob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob(resolve, "image/jpeg", 0.88)
      );
      if (!blob) {
        return sourceFile;
      }

      const basename = sourceFile.name.replace(/\.[a-z0-9]+$/i, "") || "label";
      return new File([blob], `${basename}-bottle-${outputIndex + 1}.jpg`, {
        type: "image/jpeg",
      });
    } catch {
      return sourceFile;
    } finally {
      if (imageUrl) {
        URL.revokeObjectURL(imageUrl);
      }
    }
  };

  const createLineupEntries = async () => {
    const selected = lineupWines.filter((w) => w.included);
    if (selected.length === 0) return;

    const included = selected.filter((wine) => hasDetectedWineDetails(wine));
    if (included.length === 0) {
      setAutofillStatus("error");
      setAutofillMessage(
        "Selected bottles have no readable label details. Uncheck unknown bottles or retry with a clearer photo."
      );
      return;
    }

    setLineupCreating(true);
    setLineupCreatedCount(0);
    setAutofillMessage("Resolving grape varieties...");

    // Resolve grape suggestions to IDs for all wines in parallel
    const grapeIdsByIndex: Map<number, string[]> = new Map();
    await Promise.all(
      included.map(async (wine, i) => {
        const suggestions = wine.primary_grape_suggestions ?? [];
        if (suggestions.length > 0) {
          const resolved = await resolveSuggestedGrapes(
            suggestions.slice(0, 2)
          );
          if (resolved.length > 0) {
            grapeIdsByIndex.set(i, resolved.map((g) => g.id));
          }
        }
      })
    );

    setAutofillMessage(`Creating entries... (0/${included.length})`);

    const privacy = getValues("entry_privacy") || "public";
    const consumedAt = getValues("consumed_at") || getTodayLocalYmd();
    let created = 0;

    // Create all entries + upload thumbnails in parallel
    const creationResults = await Promise.all(
      included.map(async (wine, i) => {
        try {
          const response = await fetch("/api/entries", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              wine_name:
                wine.wine_name ??
                wine.producer ??
                wine.appellation ??
                wine.region ??
                wine.primary_grape_suggestions?.[0] ??
                "Unknown wine",
              producer: wine.producer || null,
              vintage: wine.vintage || null,
              country: wine.country || null,
              region: wine.region || null,
              appellation: wine.appellation || null,
              classification: wine.classification || null,
              primary_grape_ids: grapeIdsByIndex.get(i) ?? [],
              consumed_at: consumedAt,
              entry_privacy: privacy,
              tasted_with_user_ids: [],
            }),
          });

          if (!response.ok) return null;

          const payload = await response.json();
          const entry = payload.entry;

          // Upload a per-bottle thumbnail (fallback to original source photo)
          const sourcePhoto = labelPhotos[wine.photoIndex];
          if (entry?.id && sourcePhoto) {
            try {
              const thumbnail = await createLineupBottleThumbnail(
                sourcePhoto.file,
                wine.bottle_bbox,
                wine.label_bbox,
                wine.label_anchor,
                i
              );
              await uploadPhotos(entry.id, "label", [{ file: thumbnail }]);
            } catch {
              // Photo upload failed but entry was created, continue
            }
          }

          created++;
          setLineupCreatedCount(created);
          setAutofillMessage(
            `Creating entries... (${created}/${included.length})`
          );
          return typeof entry?.id === "string" ? entry.id : null;
        } catch {
          // Skip failed entries, continue with rest
          return null;
        }
      })
    );

    setLineupCreating(false);

    const createdEntryIds = creationResults.filter(
      (value): value is string => typeof value === "string" && value.length > 0
    );
    if (createdEntryIds.length > 0) {
      setAutofillStatus("success");
      setAutofillMessage(
        `Created ${createdEntryIds.length} entr${
          createdEntryIds.length === 1 ? "y" : "ies"
        }! Opening guided review...`
      );
      const queue = encodeURIComponent(createdEntryIds.join(","));
      setTimeout(() => {
        router.push(
          `/entries/${createdEntryIds[0]}/edit?bulk=1&queue=${queue}&index=0`
        );
      }, 900);
    } else {
      setAutofillStatus("error");
      setAutofillMessage("Failed to create entries. Try again.");
    }
  };

  const runAnalysis = async (files: File[]) => {
    if (files.length === 0) return;

    setAutofillStatus("loading");
    setAutofillMessage(
      files.length === 1
        ? "Analyzing photo..."
        : `Analyzing ${files.length} photos...`
    );
    setLineupWines([]);
    setLineupCreatedCount(0);

    const resized = await Promise.all(
      files.map((f) => createAutofillImage(f))
    );

    const controller = new AbortController();
    const timeoutMs = files.length > 1 ? 65000 + files.length * 7000 : 65000;
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    try {
      // Fire lineup-autofill for every photo in parallel
      const lineupFetches = resized.map((file) => {
        const fd = new FormData();
        fd.append("photo", file);
        return fetch("/api/lineup-autofill", {
          method: "POST",
          body: fd,
          signal: controller.signal,
        });
      });

      // For single photo, also run label-autofill for richer single-bottle data.
      let labelFetch: Promise<Response> | null = null;
      if (files.length === 1) {
        const labelFd = new FormData();
        labelFd.append("label", resized[0]);
        labelFetch = fetch("/api/label-autofill", {
          method: "POST",
          body: labelFd,
          signal: controller.signal,
        });
      }

      // Fast count guardrail: only consumed later if lineup appears ambiguous.
      let countFetch: Promise<Response> | null = null;
      if (files.length === 1) {
        const countFd = new FormData();
        countFd.append("photo", resized[0]);
        countFetch = fetch("/api/bottle-count", {
          method: "POST",
          body: countFd,
          signal: controller.signal,
        });
      }

      const lineupResults = await Promise.allSettled(lineupFetches);

      clearTimeout(timeoutId);

      // Collect all wines from all lineup results, tracking source photo
      const allWines: LineupWine[] = [];
      let detectedBottleCount = 0;
      for (let pi = 0; pi < lineupResults.length; pi++) {
        const result = lineupResults[pi];
        if (result.status === "fulfilled" && result.value.ok) {
          const data = await result.value.json();
          const detectedForPhoto =
            typeof data.total_bottles_detected === "number" &&
            Number.isFinite(data.total_bottles_detected)
              ? Math.max(0, Math.round(data.total_bottles_detected))
              : 0;
          detectedBottleCount += detectedForPhoto;
          const wines: LineupWine[] = (Array.isArray(data.wines)
            ? data.wines
            : []
          ).map((wine: LineupApiWine) => {
            const normalizedWine = {
              wine_name: normalizeTextField(wine.wine_name),
              producer: normalizeTextField(wine.producer),
              vintage: normalizeTextField(wine.vintage),
              country: normalizeTextField(wine.country),
              region: normalizeTextField(wine.region),
              appellation: normalizeTextField(wine.appellation),
              classification: normalizeTextField(wine.classification),
              primary_grape_suggestions: Array.isArray(
                wine.primary_grape_suggestions
              )
                ? wine.primary_grape_suggestions
                    .map((value) => value.trim())
                    .filter((value) => value.length > 0)
                    .slice(0, 3)
                : [],
              confidence:
                typeof wine.confidence === "number" &&
                Number.isFinite(wine.confidence)
                  ? Math.min(1, Math.max(0, wine.confidence))
                  : null,
              bottle_bbox: normalizeBottleBbox(wine.bottle_bbox),
              label_bbox: normalizeLabelBbox(wine.label_bbox),
              label_anchor: normalizeLabelAnchor(wine.label_anchor),
            } satisfies Omit<LineupWine, "included" | "photoIndex">;

            return {
              ...normalizedWine,
              included: hasDetectedWineDetails(normalizedWine),
              photoIndex: pi,
            };
          });

          allWines.push(...wines);
        }
      }

      const inferredBottleCount =
        detectedBottleCount > 0 ? detectedBottleCount : allWines.length;
      let guardrailCount: number | null = null;
      const needsCountGuardrail =
        files.length === 1 &&
        inferredBottleCount <= 1 &&
        allWines.length <= 1 &&
        Boolean(countFetch);
      if (needsCountGuardrail && countFetch) {
        try {
          const countResponse = await countFetch;
          if (countResponse.ok) {
            const countPayload = (await countResponse.json()) as {
              total_bottles_detected?: number;
            };
            if (
              typeof countPayload.total_bottles_detected === "number" &&
              Number.isFinite(countPayload.total_bottles_detected)
            ) {
              guardrailCount = Math.max(
                0,
                Math.round(countPayload.total_bottles_detected)
              );
            }
          }
        } catch {
          guardrailCount = null;
        }
      }
      const effectiveBottleCount = Math.max(
        inferredBottleCount,
        guardrailCount ?? 0
      );
      const singleWine = allWines[0] ?? null;
      const forceLineupFromGeometry =
        files.length === 1 &&
        effectiveBottleCount <= 1 &&
        allWines.length <= 1 &&
        shouldForceLineupForSinglePhoto(singleWine);
      const likelyLineup =
        files.length > 1 ||
        allWines.length > 1 ||
        effectiveBottleCount > 1 ||
        forceLineupFromGeometry;
      const isSingleBottle =
        files.length === 1 && !likelyLineup && allWines.length <= 1;

      if (isSingleBottle) {
        let labelResult: Response | null = null;
        if (labelFetch) {
          try {
            labelResult = await labelFetch;
          } catch {
            labelResult = null;
          }
        }

        // Single photo with single bottle — prefer label-autofill (richer fields),
        // then fall back to lineup if needed.
        if (labelResult && labelResult.ok) {
          const rawLabelData = (await labelResult.json()) as LabelAutofillResult;
          const normalizedLabelData = {
            wine_name: normalizeTextField(rawLabelData.wine_name),
            producer: normalizeTextField(rawLabelData.producer),
            vintage: normalizeTextField(rawLabelData.vintage),
            country: normalizeTextField(rawLabelData.country),
            region: normalizeTextField(rawLabelData.region),
            appellation: normalizeTextField(rawLabelData.appellation),
            classification: normalizeTextField(rawLabelData.classification),
            primary_grape_suggestions: Array.isArray(
              rawLabelData.primary_grape_suggestions
            )
              ? rawLabelData.primary_grape_suggestions
                  .map((value) => value.trim())
                  .filter((value) => value.length > 0)
                  .slice(0, 3)
              : [],
            primary_grape_confidence:
              typeof rawLabelData.primary_grape_confidence === "number" &&
              Number.isFinite(rawLabelData.primary_grape_confidence)
                ? Math.min(1, Math.max(0, rawLabelData.primary_grape_confidence))
                : null,
            confidence:
              typeof rawLabelData.confidence === "number" &&
              Number.isFinite(rawLabelData.confidence)
                ? Math.min(1, Math.max(0, rawLabelData.confidence))
                : null,
            warnings: Array.isArray(rawLabelData.warnings)
              ? rawLabelData.warnings
                  .map((warning) => warning.trim())
                  .filter((warning) => warning.length > 0)
              : [],
          };

          await applyAutofill(normalizedLabelData);
          setAutofillStatus("success");
          const confidenceLabel =
            typeof normalizedLabelData.confidence === "number"
              ? `Confidence ${Math.round(normalizedLabelData.confidence * 100)}%`
              : null;
          const warningCount = normalizedLabelData.warnings.length;
          const warningLabel =
            warningCount > 0
              ? `${warningCount} field${warningCount > 1 ? "s" : ""} uncertain`
              : null;
          setAutofillMessage(
            [confidenceLabel, warningLabel]
              .filter(Boolean)
              .join(" • ") || "Autofill complete. Review the details."
          );
        } else if (allWines[0]) {
          const wine = allWines[0];
          await applyAutofill({
            wine_name: wine.wine_name,
            producer: wine.producer,
            vintage: wine.vintage,
            country: wine.country,
            region: wine.region,
            appellation: wine.appellation,
            classification: wine.classification,
            primary_grape_suggestions: wine.primary_grape_suggestions,
          });
          setAutofillStatus("success");
          const confidenceLabel =
            typeof wine.confidence === "number"
              ? `Confidence ${Math.round(wine.confidence * 100)}%`
              : null;
          setAutofillMessage(
            confidenceLabel ?? "Autofill complete. Review the details."
          );
        } else if (labelResult && !labelResult.ok) {
          const errorPayload = await labelResult.json().catch(() => ({}));
          if (labelResult.status === 401) {
            setAutofillStatus("error");
            setAutofillMessage("Your session expired. Sign in again and retry.");
          } else if (labelResult.status === 413) {
            setAutofillStatus("error");
            setAutofillMessage("Image too large. Try a smaller photo.");
          } else {
            setAutofillStatus("error");
            setAutofillMessage(
              errorPayload.error ?? "Could not read the label. Try again."
            );
          }
        } else {
          // Lineup call failed — surface a useful error
          const firstResult = lineupResults[0];
          if (firstResult?.status === "fulfilled" && !firstResult.value.ok) {
            const status = firstResult.value.status;
            if (status === 401) {
              setAutofillStatus("error");
              setAutofillMessage(
                "Your session expired. Sign in again and retry."
              );
            } else if (status === 413) {
              setAutofillStatus("error");
              setAutofillMessage("Image too large. Try a smaller photo.");
            } else {
              const errorPayload = await firstResult.value
                .json()
                .catch(() => ({}));
              setAutofillStatus("error");
              setAutofillMessage(
                errorPayload.error ??
                  "Could not read the label. Try again."
              );
            }
          } else {
            setAutofillStatus("error");
            setAutofillMessage(
              "Could not analyze the photo. Try again."
            );
          }
        }
      } else {
        // Multiple bottles or multiple photos — lineup mode
        if (allWines.length === 0) {
          setAutofillStatus("error");
          setAutofillMessage(
            "No bottles detected. Try clearer photos."
          );
          return;
        }
        setLineupWines(allWines);
        setAutofillStatus("success");
        const photoLabel =
          files.length > 1
            ? ` across ${files.length} photos`
            : "";
        const identifiedCount = allWines.filter((wine) =>
          hasDetectedWineDetails(wine)
        ).length;
        const unresolvedCount = Math.max(0, effectiveBottleCount - identifiedCount);
        if (
          typeof guardrailCount === "number" &&
          guardrailCount > inferredBottleCount &&
          guardrailCount > 1
        ) {
          setAutofillMessage(
            `Detected ${guardrailCount} bottles in quick count${photoLabel}. Identified ${identifiedCount} label${identifiedCount === 1 ? "" : "s"}; add a clearer shot for missing bottles.`
          );
        } else if (forceLineupFromGeometry) {
          setAutofillMessage(
            "Detected lineup-style framing in this photo. Switched to lineup review to avoid incorrect single-bottle autofill."
          );
        } else if (unresolvedCount > 0) {
          setAutofillMessage(
            `Detected ${effectiveBottleCount} bottles${photoLabel}. Identified ${identifiedCount} label${identifiedCount === 1 ? "" : "s"}; try a clearer photo to capture the rest.`
          );
        } else {
          setAutofillMessage(
            `Detected ${allWines.length} bottle${allWines.length === 1 ? "" : "s"}${photoLabel}. Review and create entries below.`
          );
        }
      }
    } catch (error) {
      clearTimeout(timeoutId);
      if (error instanceof Error && error.name === "AbortError") {
        setAutofillStatus("timeout");
        setAutofillMessage("Analysis timed out. Try again.");
        return;
      }
      setAutofillStatus("error");
      setAutofillMessage("Could not analyze the photos. Try again.");
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
                  One bottle or a full lineup — we’ll identify each wine and fill in the details.
                </p>
              </div>
              {labelPhotos.length > 0 && autofillStatus !== "loading" ? (
                <button
                  type="button"
                  className="rounded-full border border-white/10 px-3 py-1 text-xs uppercase tracking-[0.2em] text-zinc-200 transition hover:border-amber-300/60 hover:text-amber-200"
                  onClick={() => {
                    if (labelPhotos.length > 0) {
                      runAnalysis(labelPhotos.map((p) => p.file));
                    }
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
                          setLineupWines([]);
                          setLineupCreatedCount(0);
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
                {autofillStatus === "loading" && !lineupCreating
                  ? " (Please wait up to about 60 seconds for larger lineups.)"
                  : ""}
              </p>
            ) : null}

            {/* Lineup review: shown when multiple bottles detected */}
            {lineupWines.length > 0 && !lineupCreating && lineupCreatedCount === 0 ? (
              <div className="mt-4 space-y-2">
                {lineupWines.map((wine, index) => (
                  <div
                    key={index}
                    className={`flex items-start gap-3 rounded-xl border p-3 transition ${
                      wine.included
                        ? "border-white/10 bg-black/20"
                        : "border-white/5 bg-black/10 opacity-50"
                    }`}
                  >
                    <button
                      type="button"
                      className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded border text-xs transition ${
                        wine.included
                          ? "border-amber-400 bg-amber-400/20 text-amber-300"
                          : "border-zinc-600 text-zinc-600"
                      }`}
                      onClick={() => {
                        setLineupWines((prev) =>
                          prev.map((w, i) =>
                            i === index ? { ...w, included: !w.included } : w
                          )
                        );
                      }}
                    >
                      {wine.included ? "\u2713" : ""}
                    </button>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-zinc-100">
                        {wine.wine_name || "Unknown wine"}
                      </p>
                      <p className="truncate text-xs text-zinc-400">
                        {[
                          wine.producer,
                          wine.vintage,
                          wine.region,
                          ...(wine.primary_grape_suggestions?.length
                            ? [wine.primary_grape_suggestions.join(", ")]
                            : []),
                        ]
                          .filter(Boolean)
                          .join(" \u00b7 ") || "No details detected"}
                      </p>
                      {wine.confidence !== null ? (
                        <p className="mt-0.5 text-xs text-zinc-500">
                          Confidence: {Math.round(wine.confidence * 100)}%
                        </p>
                      ) : null}
                    </div>
                  </div>
                ))}

                <button
                  type="button"
                  className="mt-3 inline-flex w-full items-center justify-center rounded-full bg-amber-500/90 px-4 py-2.5 text-sm font-semibold text-zinc-950 transition hover:bg-amber-400 disabled:opacity-50"
                  disabled={
                    lineupWines.filter(
                      (w) => w.included && hasDetectedWineDetails(w)
                    ).length === 0
                  }
                  onClick={createLineupEntries}
                >
                  Create{" "}
                  {
                    lineupWines.filter(
                      (w) => w.included && hasDetectedWineDetails(w)
                    ).length
                  }{" "}
                  entr
                  {lineupWines.filter(
                    (w) => w.included && hasDetectedWineDetails(w)
                  ).length === 1
                    ? "y"
                    : "ies"}
                </button>
              </div>
            ) : null}

            {lineupCreating ? (
              <div className="mt-4 flex items-center gap-2">
                <div className="h-4 w-4 animate-spin rounded-full border-2 border-amber-300 border-t-transparent" />
                <span className="text-sm text-zinc-300">
                  Creating entries... ({lineupCreatedCount}/
                  {
                    lineupWines.filter(
                      (w) => w.included && hasDetectedWineDetails(w)
                    ).length
                  }
                  )
                </span>
              </div>
            ) : null}
          </div>

          {/* Hide single-bottle form fields when lineup mode is active */}
          {lineupWines.length === 0 && !lineupCreating ? (
          <>
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
              <label className="text-sm font-medium text-zinc-200">
                Classification
              </label>
              <input
                className="mt-1 w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-500 focus:border-amber-300 focus:outline-none focus:ring-2 focus:ring-amber-300/30"
                placeholder="Optional (e.g. Premier Cru, DOCG)"
                {...register("classification")}
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
            <div className="md:col-span-2">
              <PrimaryGrapeSelector
                selected={selectedPrimaryGrapes}
                onChange={setSelectedPrimaryGrapes}
              />
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
          </>
          ) : null}
        </form>
      </div>

      {pendingComparison ? (
        <div className="fixed inset-0 z-50 overflow-y-auto px-3 py-3 sm:px-4 sm:py-4">
          <div className="fixed inset-0 bg-black/75" aria-hidden />
          <div className="relative flex min-h-full items-start justify-center sm:items-center">
            <div className="relative h-[calc(100dvh-0.75rem)] w-full max-w-3xl overflow-y-auto overscroll-contain rounded-3xl border border-white/10 bg-[#14100f] p-4 shadow-[0_30px_80px_-40px_rgba(0,0,0,0.9)] [scrollbar-gutter:stable] [touch-action:pan-y] [-webkit-overflow-scrolling:touch] sm:h-auto sm:max-h-[calc(100dvh-1.5rem)] sm:p-8">
              <div className="flex items-start justify-between gap-3">
                <h2 className="text-2xl font-semibold text-zinc-50">
                  How did this wine compare?
                </h2>
                <button
                  type="button"
                  className="shrink-0 rounded-full border border-white/15 px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-zinc-300 transition hover:border-amber-300/60 hover:text-amber-200 disabled:opacity-50"
                  onClick={() => submitComparison("same_or_not_sure")}
                  disabled={isSubmittingComparison}
                >
                  Skip
                </button>
              </div>

              <div className="mt-5 flex flex-col items-start gap-3 sm:mt-6">
                <p className="text-lg leading-snug text-zinc-300 sm:text-xl">
                  <span className="font-semibold text-zinc-100">
                    Compared to the previous wine
                  </span>
                  , I like this wine...
                </p>

                <div className="grid w-full max-w-[640px] grid-cols-3 gap-2 sm:gap-3">
                  <button
                    type="button"
                    className="rounded-full border border-white/10 px-3 py-2 text-sm font-semibold leading-tight text-zinc-200 transition hover:border-white/30 disabled:opacity-60 sm:px-5 sm:py-2.5 sm:text-base"
                    onClick={() => submitComparison("more")}
                    disabled={isSubmittingComparison}
                  >
                    More
                  </button>
                  <button
                    type="button"
                    className="rounded-full border border-white/10 px-3 py-2 text-sm font-semibold leading-tight text-zinc-200 transition hover:border-white/30 disabled:opacity-60 sm:px-5 sm:py-2.5 sm:text-base"
                    onClick={() => submitComparison("same_or_not_sure")}
                    disabled={isSubmittingComparison}
                  >
                    Not sure / The same
                  </button>
                  <button
                    type="button"
                    className="rounded-full border border-white/10 px-3 py-2 text-sm font-semibold leading-tight text-zinc-200 transition hover:border-white/30 disabled:opacity-60 sm:px-5 sm:py-2.5 sm:text-base"
                    onClick={() => submitComparison("less")}
                    disabled={isSubmittingComparison}
                  >
                    Less
                  </button>
                </div>

                {comparisonErrorMessage ? (
                  <p className="text-sm text-rose-300">{comparisonErrorMessage}</p>
                ) : null}

                {comparisonErrorMessage ? (
                  <button
                    type="button"
                    className="rounded-full border border-white/10 px-4 py-2 text-sm font-semibold text-zinc-200 transition hover:border-white/30 sm:text-base"
                    onClick={continueWithoutSavingComparison}
                    disabled={isSubmittingComparison}
                  >
                    Continue without saving
                  </button>
                ) : null}
              </div>

              <div className="mt-5 grid gap-3 sm:mt-6 sm:gap-4 md:grid-cols-2">
                <div className="overflow-hidden rounded-2xl border border-white/10 bg-black/30">
                  <div className="h-32 w-full bg-black/40 sm:h-40">
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
                  <div className="space-y-1 border-t border-white/10 p-3 sm:p-4">
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
                  <div className="h-32 w-full bg-black/40 sm:h-40">
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
                  <div className="space-y-1 border-t border-white/10 p-3 sm:p-4">
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
        </div>
      ) : null}
    </div>
  );
}

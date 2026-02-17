"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Controller, useForm, useWatch } from "react-hook-form";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import NavBar from "@/components/NavBar";
import DatePicker from "@/components/DatePicker";
import PrivacyBadge from "@/components/PrivacyBadge";
import PrimaryGrapeSelector from "@/components/PrimaryGrapeSelector";
import LocationAutocomplete from "@/components/LocationAutocomplete";
import SwipePhotoGallery from "@/components/SwipePhotoGallery";
import { extractGpsFromFile } from "@/lib/exifGps";
import type {
  EntryPhoto,
  EntryPhotoType,
  PrimaryGrape,
  PrivacyLevel,
  WineEntryWithUrls,
} from "@/types/wine";
import {
  ADVANCED_NOTE_FIELDS,
  ADVANCED_NOTE_OPTIONS,
  EMPTY_ADVANCED_NOTES_FORM_VALUES,
  toAdvancedNotesFormValues,
  toAdvancedNotesPayload,
  type AdvancedNotesFormValues,
} from "@/lib/advancedNotes";
import {
  type PricePaidCurrency,
  QPR_LEVEL_LABELS,
  type PricePaidSource,
  type QprLevel,
} from "@/lib/entryMeta";
import { getTodayLocalYmd } from "@/lib/dateYmd";
import { MAX_ENTRY_PHOTOS_PER_TYPE } from "@/lib/photoLimits";

type EditEntryForm = {
  wine_name: string;
  producer: string;
  vintage: string;
  country: string;
  region: string;
  appellation: string;
  classification: string;
  rating?: string;
  price_paid?: string;
  price_paid_currency: PricePaidCurrency;
  price_paid_source: PricePaidSource | "";
  qpr_level: QprLevel | "";
  notes: string;
  location_text: string;
  location_place_id: string;
  consumed_at: string;
  entry_privacy: PrivacyLevel;
  reaction_privacy: PrivacyLevel;
  comments_privacy: PrivacyLevel;
  advanced_notes: AdvancedNotesFormValues;
};

const PRIVACY_OPTIONS: { value: PrivacyLevel; label: string }[] = [
  { value: "public", label: "Public" },
  { value: "friends_of_friends", label: "Friends of friends" },
  { value: "friends", label: "Friends only" },
  { value: "private", label: "Private" },
];

type PrimaryGrapeSelection = Pick<PrimaryGrape, "id" | "name">;
type LegacyPhotoType = "label" | "place" | "pairing";
type ContextPhotoTag =
  | "place"
  | "pairing"
  | "people"
  | "other_bottles"
  | "unknown";

const PHOTO_TYPE_LABELS: Record<EntryPhotoType, string> = {
  label: "Label",
  place: "Place",
  people: "People",
  pairing: "Pairing",
  lineup: "Lineup",
  other_bottles: "Other bottles",
};

const PHOTO_TYPE_OPTIONS: { value: EntryPhotoType; label: string }[] = [
  { value: "label", label: "Label" },
  { value: "place", label: "Place" },
  { value: "people", label: "People" },
  { value: "pairing", label: "Pairing" },
  { value: "lineup", label: "Lineup" },
  { value: "other_bottles", label: "Other bottles" },
];

const CONTEXT_TAG_TO_PHOTO_TYPE: Record<ContextPhotoTag, EntryPhotoType> = {
  place: "place",
  pairing: "pairing",
  people: "people",
  other_bottles: "other_bottles",
  unknown: "other_bottles",
};

export default function EditEntryPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const params = useParams<{ id: string | string[] }>();
  const entryId = Array.isArray(params.id) ? params.id[0] : params.id;
  const bulkQueue = useMemo(() => {
    const queueParam = searchParams.get("queue");
    if (!queueParam) return [] as string[];
    let decoded = queueParam;
    try {
      decoded = decodeURIComponent(queueParam);
    } catch {
      decoded = queueParam;
    }
    return decoded
      .split(",")
      .map((id) => id.trim())
      .filter((id) => id.length > 0);
  }, [searchParams]);
  const isBulkReview =
    searchParams.get("bulk") === "1" &&
    typeof entryId === "string" &&
    bulkQueue.includes(entryId);
  const currentBulkIndex =
    isBulkReview && typeof entryId === "string"
      ? Math.max(0, bulkQueue.indexOf(entryId))
      : -1;
  const nextBulkEntryId =
    currentBulkIndex >= 0 && currentBulkIndex < bulkQueue.length - 1
      ? bulkQueue[currentBulkIndex + 1]
      : null;
  const bulkProgressLabel =
    currentBulkIndex >= 0 ? `${currentBulkIndex + 1}/${bulkQueue.length}` : null;
  const supabase = createSupabaseBrowserClient();
  const {
    control,
    register,
    handleSubmit,
    reset,
    setValue,
    setError,
    clearErrors,
    formState: { errors },
  } = useForm<EditEntryForm>({
    defaultValues: {
      consumed_at: getTodayLocalYmd(),
      location_place_id: "",
      entry_privacy: "public",
      reaction_privacy: "public",
      comments_privacy: "public",
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
  const selectedReactionPrivacy =
    useWatch({
      control,
      name: "reaction_privacy",
    }) ?? "public";
  const selectedCommentsPrivacy =
    useWatch({
      control,
      name: "comments_privacy",
    }) ?? "public";
  const currentWineName =
    useWatch({
      control,
      name: "wine_name",
    })?.trim() ?? "";
  const [entry, setEntry] = useState<WineEntryWithUrls | null>(null);
  const [photos, setPhotos] = useState<EntryPhoto[]>([]);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const [uploadingType, setUploadingType] = useState<EntryPhotoType | null>(null);
  const [savingPhotoId, setSavingPhotoId] = useState<string | null>(null);
  const addPhotoInputRef = useRef<HTMLInputElement | null>(null);
  const [users, setUsers] = useState<
    { id: string; display_name: string | null; email: string | null; tasting_count: number }[]
  >([]);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [selectedUserIds, setSelectedUserIds] = useState<string[]>([]);
  const [friendSearch, setFriendSearch] = useState("");
  const [selectedPrimaryGrapes, setSelectedPrimaryGrapes] = useState<
    PrimaryGrapeSelection[]
  >([]);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isDeletingEntry, setIsDeletingEntry] = useState(false);
  const [isDeletingBulkQueue, setIsDeletingBulkQueue] = useState(false);
  const [photoGps, setPhotoGps] = useState<{ lat: number; lng: number } | null>(null);
  const [cropEditorPhoto, setCropEditorPhoto] = useState<EntryPhoto | null>(null);
  const [cropImageNaturalSize, setCropImageNaturalSize] = useState<{
    width: number;
    height: number;
  } | null>(null);
  const [cropCenterX, setCropCenterX] = useState(50);
  const [cropCenterY, setCropCenterY] = useState(50);
  const [cropZoom, setCropZoom] = useState(1);
  const [isDraggingCrop, setIsDraggingCrop] = useState(false);
  const [savingCrop, setSavingCrop] = useState(false);
  const [photoRenderVersion, setPhotoRenderVersion] = useState(0);
  const [cropSourceUrl, setCropSourceUrl] = useState<string | null>(null);
  const [cropSourcePath, setCropSourcePath] = useState<string | null>(null);
  const MIN_CROP_ZOOM = 1;
  const MAX_CROP_ZOOM = 6;
  const cropFrameRef = useRef<HTMLDivElement | null>(null);
  const cropDragRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    startCenterX: number;
    startCenterY: number;
  } | null>(null);
  const cropTouchRef = useRef<
    | {
        mode: "drag";
        startX: number;
        startY: number;
        startCenterX: number;
        startCenterY: number;
      }
    | {
        mode: "pinch";
        startDistance: number;
        startZoom: number;
      }
    | null
  >(null);
  const cropOpenRequestRef = useRef(0);
  const [loading, setLoading] = useState(true);

  const withCacheBust = (url: string | null | undefined) => {
    if (!url) return null;
    return `${url}${url.includes("?") ? "&" : "?"}v=${photoRenderVersion}`;
  };

  const buildOriginalPath = (path: string) => {
    const extensionMatch = path.match(/(\.[a-z0-9]+)$/i);
    if (!extensionMatch) {
      return `${path}__original`;
    }
    return path.replace(/(\.[a-z0-9]+)$/i, "__original$1");
  };

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
        setSelectedPrimaryGrapes(
          Array.isArray(data.entry.primary_grapes)
            ? data.entry.primary_grapes
                .map((grape: PrimaryGrape) => ({
                  id: grape.id,
                  name: grape.name,
                }))
                .slice(0, 3)
            : []
        );
        reset({
          wine_name: data.entry.wine_name ?? "",
          producer: data.entry.producer ?? "",
          vintage: data.entry.vintage ?? "",
          country: data.entry.country ?? "",
          region: data.entry.region ?? "",
          appellation: data.entry.appellation ?? "",
          classification: data.entry.classification ?? "",
          rating:
            typeof data.entry.rating === "number" && Number.isFinite(data.entry.rating)
              ? String(data.entry.rating)
              : "",
          price_paid:
            typeof data.entry.price_paid === "number" &&
            Number.isFinite(data.entry.price_paid)
              ? String(data.entry.price_paid)
              : "",
          price_paid_currency: data.entry.price_paid_currency ?? "usd",
          price_paid_source: data.entry.price_paid_source ?? "",
          qpr_level: data.entry.qpr_level ?? "",
          notes: data.entry.notes ?? "",
          location_text: data.entry.location_text ?? "",
          location_place_id: data.entry.location_place_id ?? "",
          consumed_at: data.entry.consumed_at,
          entry_privacy: data.entry.entry_privacy ?? "public",
          reaction_privacy:
            data.entry.reaction_privacy ?? data.entry.entry_privacy ?? "public",
          comments_privacy:
            data.entry.comments_privacy ??
            (data.entry.comments_scope === "friends" &&
            (data.entry.entry_privacy ?? "public") !== "private"
              ? "friends"
              : data.entry.entry_privacy ?? "public"),
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
        const friends = (data.friends ?? []) as typeof users;
        friends.sort((a, b) => b.tasting_count - a.tasting_count);
        setUsers(friends);
      }
    };

    loadUsers();

    return () => {
      isMounted = false;
    };
  }, []);

  const MAX_PHOTOS = MAX_ENTRY_PHOTOS_PER_TYPE;

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

  const sortPhotos = (list: EntryPhoto[]) =>
    [...list].sort((a, b) => {
      if (a.position !== b.position) {
        return a.position - b.position;
      }
      return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
    });

  const isLegacyPhoto = (photo: EntryPhoto) => photo.id.startsWith("legacy-");
  const isLegacyFieldType = (type: EntryPhotoType): type is LegacyPhotoType =>
    type === "label" || type === "place" || type === "pairing";

  const photosByType = (type: EntryPhotoType): EntryPhoto[] =>
    sortPhotos(photos.filter((photo) => photo.type === type));

  const displayPhotosByType = (type: EntryPhotoType): EntryPhoto[] => {
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

  const uploadSinglePhoto = async (type: EntryPhotoType, file: File) => {
    if (!entryId) {
      throw new Error("Entry not found.");
    }
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
  };

  const createContextImage = async (file: File) => {
    if (!file.type.startsWith("image/")) {
      return file;
    }
    let imageUrl: string | null = null;
    try {
      imageUrl = URL.createObjectURL(file);
      const image = await new Promise<HTMLImageElement>((resolve, reject) => {
        const next = new Image();
        next.onload = () => resolve(next);
        next.onerror = reject;
        next.src = imageUrl ?? "";
      });
      const maxDim = 2200;
      const largest = Math.max(image.width, image.height);
      const scale = largest > maxDim ? maxDim / largest : 1;
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(image.width * scale);
      canvas.height = Math.round(image.height * scale);
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        return file;
      }
      ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
      const blob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob(resolve, "image/jpeg", 0.82)
      );
      if (!blob) {
        return file;
      }
      return new File([blob], "photo-context.jpg", { type: "image/jpeg" });
    } catch {
      return file;
    } finally {
      if (imageUrl) {
        URL.revokeObjectURL(imageUrl);
      }
    }
  };

  const classifyPhotoType = async (file: File): Promise<EntryPhotoType> => {
    const contextFile = await createContextImage(file);
    try {
      const lineupFd = new FormData();
      lineupFd.append("photo", contextFile);
      const lineupResponse = await fetch("/api/lineup-autofill", {
        method: "POST",
        body: lineupFd,
      });
      if (lineupResponse.ok) {
        const lineupPayload = (await lineupResponse.json()) as {
          total_bottles_detected?: number;
          wines?: Array<{
            wine_name?: string | null;
            producer?: string | null;
            vintage?: string | null;
            country?: string | null;
            region?: string | null;
            appellation?: string | null;
            classification?: string | null;
          }>;
        };
        const detectedCount =
          typeof lineupPayload.total_bottles_detected === "number" &&
          Number.isFinite(lineupPayload.total_bottles_detected)
            ? Math.max(0, Math.round(lineupPayload.total_bottles_detected))
            : 0;
        const identifiedCount = Array.isArray(lineupPayload.wines)
          ? lineupPayload.wines.filter((wine) =>
              Boolean(
                wine.wine_name ||
                  wine.producer ||
                  wine.vintage ||
                  wine.country ||
                  wine.region ||
                  wine.appellation ||
                  wine.classification
              )
            ).length
          : 0;

        if (detectedCount >= 2 || identifiedCount >= 2) {
          return "lineup";
        }
        if (detectedCount === 1 || identifiedCount === 1) {
          return "label";
        }
      }
    } catch {
      // Fall through to lightweight context categorization.
    }

    try {
      const contextFd = new FormData();
      contextFd.append("photo", contextFile);
      const contextResponse = await fetch("/api/photo-context", {
        method: "POST",
        body: contextFd,
      });
      if (contextResponse.ok) {
        const payload = (await contextResponse.json()) as {
          tag?: ContextPhotoTag;
        };
        const tag: ContextPhotoTag =
          payload.tag === "place" ||
          payload.tag === "pairing" ||
          payload.tag === "people" ||
          payload.tag === "other_bottles" ||
          payload.tag === "unknown"
            ? payload.tag
            : "unknown";
        return CONTEXT_TAG_TO_PHOTO_TYPE[tag];
      }
    } catch {
      // Final fallback below.
    }

    return "other_bottles";
  };

  const addPhotosWithAiCategorization = async (files: FileList) => {
    if (!entryId) {
      return;
    }
    const list = Array.from(files).slice(0, MAX_PHOTOS);
    if (list.length === 0) {
      return;
    }

    setUploadingType("other_bottles");
    setPhotoError(null);

    if (!photoGps) {
      void (async () => {
        for (const file of list) {
          const coords = await extractGpsFromFile(file);
          if (coords) {
            setPhotoGps(coords);
            break;
          }
        }
      })();
    }

    try {
      for (const file of list) {
        const nextType = await classifyPhotoType(file);
        setUploadingType(nextType);
        await uploadSinglePhoto(nextType, file);
      }
      await loadPhotos();
    } catch (error) {
      setPhotoError(error instanceof Error ? error.message : "Photo upload failed.");
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

  const deleteLegacyPhoto = async (photo: EntryPhoto) => {
    if (!entryId || !entry) {
      return;
    }
    if (!isLegacyFieldType(photo.type)) {
      setPhotoError("Legacy deletion is only supported for label/place/pairing.");
      return;
    }
    const type = photo.type;

    setPhotoError(null);

    try {
      const legacyField =
        type === "label"
          ? "label_image_path"
          : type === "place"
          ? "place_image_path"
          : "pairing_image_path";

      const response = await fetch(`/api/entries/${entry.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [legacyField]: null }),
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        setPhotoError(payload.error ?? "Unable to delete photo.");
        return;
      }

      const payload = await response.json().catch(() => null);
      if (payload?.entry) {
        setEntry(payload.entry);
      } else {
        setEntry((prev) => {
          if (!prev) return prev;
          if (type === "label") {
            return { ...prev, label_image_path: null, label_image_url: null };
          }
          if (type === "place") {
            return { ...prev, place_image_path: null, place_image_url: null };
          }
          return { ...prev, pairing_image_path: null, pairing_image_url: null };
        });
      }

      if (photo.path && photo.path !== "pending") {
        await supabase.storage.from("wine-photos").remove([photo.path]);
      }
    } catch {
      setPhotoError("Unable to delete photo.");
    }
  };

  const deletePhotoItem = async (photo: EntryPhoto) => {
    const confirmed = window.confirm(
      `Delete this ${PHOTO_TYPE_LABELS[photo.type].toLowerCase()} photo?`
    );
    if (!confirmed) {
      return;
    }
    if (isLegacyPhoto(photo)) {
      await deleteLegacyPhoto(photo);
      return;
    }
    await deletePhoto(photo.id);
  };

  const movePhotoInList = async (
    list: EntryPhoto[],
    index: number,
    direction: "up" | "down"
  ) => {
    if (!entryId) return;
    const targetIndex = direction === "up" ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= list.length) return;
    const current = list[index];
    const swap = list[targetIndex];
    if (!current || !swap) return;
    if (isLegacyPhoto(current) || isLegacyPhoto(swap)) return;

    setSavingPhotoId(current.id);
    setPhotoError(null);
    try {
      const reordered = [...list];
      reordered[index] = swap;
      reordered[targetIndex] = current;

      const updates = reordered
        .filter((photo) => !isLegacyPhoto(photo))
        .map((photo, nextPosition) => ({
          photoId: photo.id,
          nextPosition,
        }))
        .filter((item) => {
          const existing = reordered.find((photo) => photo.id === item.photoId);
          return existing ? existing.position !== item.nextPosition : false;
        });

      if (updates.length === 0) {
        return;
      }

      const responses = await Promise.all(
        updates.map((item) =>
          fetch(`/api/entries/${entryId}/photos/${item.photoId}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ position: item.nextPosition }),
          })
        )
      );
      const failedResponse = responses.find((response) => !response.ok);
      if (failedResponse) {
        const payload = await failedResponse.json().catch(() => ({}));
        throw new Error(payload.error ?? "Unable to reorder photos.");
      }

      await loadPhotos();
    } catch (error) {
      setPhotoError(
        error instanceof Error ? error.message : "Unable to reorder photos."
      );
    } finally {
      setSavingPhotoId(null);
    }
  };

  const updatePhotoType = async (
    photo: EntryPhoto,
    nextType: EntryPhotoType
  ) => {
    if (!entryId) return;
    if (photo.type === nextType) return;
    if (isLegacyPhoto(photo)) {
      setPhotoError(
        "Legacy photos cannot be recategorized. Add a new photo to use category editing."
      );
      return;
    }

    setSavingPhotoId(photo.id);
    setPhotoError(null);
    try {
      const response = await fetch(`/api/entries/${entryId}/photos/${photo.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: nextType }),
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload.error ?? "Unable to update photo category.");
      }
      await loadPhotos();
    } catch (error) {
      setPhotoError(
        error instanceof Error ? error.message : "Unable to update photo category."
      );
    } finally {
      setSavingPhotoId(null);
    }
  };

  const openCropEditor = async (photo: EntryPhoto) => {
    if (photo.id.startsWith("legacy-")) {
      setPhotoError(
        "Crop editing is only available for photos in the new photo gallery format."
      );
      return;
    }
    const requestId = cropOpenRequestRef.current + 1;
    cropOpenRequestRef.current = requestId;
    const isCurrentRequest = () => cropOpenRequestRef.current === requestId;

    setCropImageNaturalSize(null);
    setCropCenterX(50);
    setCropCenterY(50);
    setCropZoom(MIN_CROP_ZOOM);
    setIsDraggingCrop(false);
    cropDragRef.current = null;
    cropTouchRef.current = null;
    setPhotoError(null);
    setCropEditorPhoto(photo);
    setCropSourceUrl(withCacheBust(photo.signed_url) ?? photo.signed_url ?? null);
    setCropSourcePath(photo.path);

    if (!photo.path) {
      return;
    }

    const originalPath = buildOriginalPath(photo.path);
    const { data: originalSigned, error: originalError } = await supabase.storage
      .from("wine-photos")
      .createSignedUrl(originalPath, 60 * 60);

    if (!isCurrentRequest()) {
      return;
    }

    if (!originalError && originalSigned?.signedUrl) {
      setCropSourceUrl(originalSigned.signedUrl);
      setCropSourcePath(originalPath);
      return;
    }

    if (photo.type !== "label" || !photo.signed_url) {
      return;
    }

    const lineupSource = photosByType("lineup").find(
      (candidate) =>
        !candidate.id.startsWith("legacy-") &&
        Boolean(candidate.signed_url) &&
        Boolean(candidate.path)
    );
    if (lineupSource?.signed_url && lineupSource.path) {
      setCropSourceUrl(lineupSource.signed_url);
      setCropSourcePath(lineupSource.path);
      return;
    }

    const labelPhotos = photosByType("label").filter(
      (candidate) =>
        !candidate.id.startsWith("legacy-") && Boolean(candidate.signed_url)
    );
    const primaryLabel = labelPhotos[0] ?? null;
    const secondaryLabel = labelPhotos[1] ?? null;

    if (
      primaryLabel?.id !== photo.id ||
      !secondaryLabel?.signed_url ||
      !secondaryLabel.path
    ) {
      return;
    }

    const primarySourceUrl = withCacheBust(photo.signed_url) ?? photo.signed_url;
    const secondarySourceUrl =
      withCacheBust(secondaryLabel.signed_url) ?? secondaryLabel.signed_url;
    if (!primarySourceUrl || !secondarySourceUrl) {
      return;
    }

    try {
      const [primaryImage, secondaryImage] = await Promise.all([
        loadImageElement(primarySourceUrl),
        loadImageElement(secondarySourceUrl),
      ]);
      if (!isCurrentRequest()) {
        return;
      }

      const primaryAspect = primaryImage.naturalWidth / primaryImage.naturalHeight;
      const secondaryAspect =
        secondaryImage.naturalWidth / secondaryImage.naturalHeight;
      const primaryNearSquare = primaryAspect > 0.85 && primaryAspect < 1.15;
      const secondaryClearlyNotSquare =
        secondaryAspect < 0.8 || secondaryAspect > 1.25;
      const secondaryMeaningfullyLarger =
        secondaryImage.naturalHeight > primaryImage.naturalHeight * 1.15 ||
        secondaryImage.naturalWidth > primaryImage.naturalWidth * 1.15;

      if (
        primaryNearSquare &&
        (secondaryClearlyNotSquare || secondaryMeaningfullyLarger)
      ) {
        setCropSourceUrl(secondaryLabel.signed_url);
        setCropSourcePath(secondaryLabel.path);
      }
    } catch {
      // Fall back to the current photo source.
    }
  };

  const closeCropEditor = () => {
    if (savingCrop) {
      return;
    }
    cropOpenRequestRef.current += 1;
    setCropEditorPhoto(null);
    setCropSourceUrl(null);
    setCropSourcePath(null);
    setIsDraggingCrop(false);
    cropDragRef.current = null;
    cropTouchRef.current = null;
  };

  const getCropGeometry = (
    natural = cropImageNaturalSize,
    zoom = cropZoom
  ) => {
    const frameSize = cropFrameRef.current?.clientWidth ?? 0;
    if (!natural || frameSize <= 0) {
      return null;
    }

    const baseScale = Math.min(
      frameSize / natural.width,
      frameSize / natural.height
    );
    const scale = baseScale * zoom;
    const displayWidth = natural.width * scale;
    const displayHeight = natural.height * scale;

    return {
      frameSize,
      baseScale,
      scale,
      displayWidth,
      displayHeight,
      overflowX: Math.max(0, displayWidth - frameSize),
      overflowY: Math.max(0, displayHeight - frameSize),
    };
  };

  const clampCenter = (
    centerX: number,
    centerY: number,
    zoom = cropZoom
  ) => {
    const geometry = getCropGeometry(cropImageNaturalSize, zoom);
    const hasXPan = (geometry?.overflowX ?? 0) > 0;
    const hasYPan = (geometry?.overflowY ?? 0) > 0;
    return {
      x: hasXPan ? Math.max(0, Math.min(100, centerX)) : 50,
      y: hasYPan ? Math.max(0, Math.min(100, centerY)) : 50,
    };
  };

  const clampZoom = (zoom: number) =>
    Math.max(MIN_CROP_ZOOM, Math.min(MAX_CROP_ZOOM, zoom));

  const getTouchDistance = (
    a: { clientX: number; clientY: number },
    b: { clientX: number; clientY: number }
  ) =>
    Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);

  const onCropPointerDown = (event: React.PointerEvent<HTMLImageElement>) => {
    if (!cropSourceUrl || savingCrop || event.pointerType === "touch") {
      return;
    }
    cropDragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      startCenterX: cropCenterX,
      startCenterY: cropCenterY,
    };
    setIsDraggingCrop(true);
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const onCropPointerMove = (event: React.PointerEvent<HTMLImageElement>) => {
    if (event.pointerType === "touch") {
      return;
    }
    const drag = cropDragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) {
      return;
    }
    const geometry = getCropGeometry();
    if (!geometry) {
      return;
    }
    const dx = event.clientX - drag.startX;
    const dy = event.clientY - drag.startY;
    const nextCenterX =
      geometry.overflowX > 0
        ? drag.startCenterX - (dx / geometry.overflowX) * 100
        : 50;
    const nextCenterY =
      geometry.overflowY > 0
        ? drag.startCenterY - (dy / geometry.overflowY) * 100
        : 50;
    const clamped = clampCenter(nextCenterX, nextCenterY);
    setCropCenterX(clamped.x);
    setCropCenterY(clamped.y);
  };

  const onCropPointerUp = (event: React.PointerEvent<HTMLImageElement>) => {
    if (event.pointerType === "touch") {
      return;
    }
    const drag = cropDragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) {
      return;
    }
    cropDragRef.current = null;
    setIsDraggingCrop(false);
    event.currentTarget.releasePointerCapture(event.pointerId);
  };

  const onCropTouchStart = (event: React.TouchEvent<HTMLImageElement>) => {
    if (!cropSourceUrl || savingCrop) {
      return;
    }

    if (event.touches.length >= 2) {
      const [first, second] = [event.touches[0], event.touches[1]];
      if (!first || !second) {
        return;
      }
      const distance = getTouchDistance(first, second);
      if (distance <= 0) {
        return;
      }
      cropTouchRef.current = {
        mode: "pinch",
        startDistance: distance,
        startZoom: cropZoom,
      };
      cropDragRef.current = null;
      setIsDraggingCrop(false);
      event.preventDefault();
      return;
    }

    if (event.touches.length === 1) {
      const touch = event.touches[0];
      if (!touch) {
        return;
      }
      cropTouchRef.current = {
        mode: "drag",
        startX: touch.clientX,
        startY: touch.clientY,
        startCenterX: cropCenterX,
        startCenterY: cropCenterY,
      };
      setIsDraggingCrop(true);
      event.preventDefault();
    }
  };

  const onCropTouchMove = (event: React.TouchEvent<HTMLImageElement>) => {
    const touchState = cropTouchRef.current;
    if (!touchState) {
      return;
    }

    if (touchState.mode === "pinch") {
      if (event.touches.length < 2) {
        return;
      }
      const [first, second] = [event.touches[0], event.touches[1]];
      if (!first || !second || touchState.startDistance <= 0) {
        return;
      }
      const distance = getTouchDistance(first, second);
      const nextZoom = clampZoom(
        touchState.startZoom * (distance / touchState.startDistance)
      );
      setCropZoom(nextZoom);
      const centered = clampCenter(cropCenterX, cropCenterY, nextZoom);
      setCropCenterX(centered.x);
      setCropCenterY(centered.y);
      event.preventDefault();
      return;
    }

    if (event.touches.length !== 1) {
      return;
    }

    const geometry = getCropGeometry();
    const touch = event.touches[0];
    if (!geometry || !touch) {
      return;
    }

    const dx = touch.clientX - touchState.startX;
    const dy = touch.clientY - touchState.startY;
    const nextCenterX =
      geometry.overflowX > 0
        ? touchState.startCenterX - (dx / geometry.overflowX) * 100
        : 50;
    const nextCenterY =
      geometry.overflowY > 0
        ? touchState.startCenterY - (dy / geometry.overflowY) * 100
        : 50;
    const clamped = clampCenter(nextCenterX, nextCenterY);
    setCropCenterX(clamped.x);
    setCropCenterY(clamped.y);
    event.preventDefault();
  };

  const onCropTouchEnd = (event: React.TouchEvent<HTMLImageElement>) => {
    if (event.touches.length >= 2) {
      const [first, second] = [event.touches[0], event.touches[1]];
      if (!first || !second) {
        return;
      }
      const distance = getTouchDistance(first, second);
      if (distance <= 0) {
        return;
      }
      cropTouchRef.current = {
        mode: "pinch",
        startDistance: distance,
        startZoom: cropZoom,
      };
      setIsDraggingCrop(false);
      return;
    }

    if (event.touches.length === 1) {
      const touch = event.touches[0];
      if (!touch) {
        return;
      }
      cropTouchRef.current = {
        mode: "drag",
        startX: touch.clientX,
        startY: touch.clientY,
        startCenterX: cropCenterX,
        startCenterY: cropCenterY,
      };
      setIsDraggingCrop(true);
      return;
    }

    cropTouchRef.current = null;
    setIsDraggingCrop(false);
  };

  const loadImageElement = async (sourceUrl: string) => {
    return new Promise<HTMLImageElement>((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error("Unable to load image."));
      image.src = sourceUrl;
    });
  };

  const saveCrop = async () => {
    if (
      !cropEditorPhoto ||
      cropEditorPhoto.id.startsWith("legacy-") ||
      !cropEditorPhoto.path ||
      !(cropSourceUrl || cropEditorPhoto.signed_url)
    ) {
      return;
    }
    setSavingCrop(true);
    setPhotoError(null);

    try {
      const sourcePath = cropSourcePath ?? cropEditorPhoto.path;
      const originalPath = buildOriginalPath(cropEditorPhoto.path);

      if (sourcePath && originalPath !== sourcePath) {
        const { error: copyError } = await supabase.storage
          .from("wine-photos")
          .copy(sourcePath, originalPath);
        if (copyError) {
          const message = copyError.message.toLowerCase();
          const alreadyExists =
            message.includes("already exists") || message.includes("exists");
          if (!alreadyExists) {
            throw new Error(copyError.message);
          }
        }
      }

      const sourceFetchUrl =
        withCacheBust(cropSourceUrl ?? cropEditorPhoto.signed_url) ??
        cropSourceUrl ??
        cropEditorPhoto.signed_url;
      if (!sourceFetchUrl) {
        throw new Error("Unable to read source photo.");
      }

      const sourceResponse = await fetch(sourceFetchUrl, {
        cache: "no-store",
      });
      if (!sourceResponse.ok) {
        throw new Error("Unable to read source photo.");
      }
      const sourceBlob = await sourceResponse.blob();
      const sourceUrl = URL.createObjectURL(sourceBlob);

      try {
        const sourceImage = await loadImageElement(sourceUrl);
        const outputSize = 1200;
        const canvas = document.createElement("canvas");
        canvas.width = outputSize;
        canvas.height = outputSize;
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          throw new Error("Unable to create crop canvas.");
        }

        const baseScale = Math.min(
          outputSize / sourceImage.width,
          outputSize / sourceImage.height
        );
        const effectiveScale = baseScale * cropZoom;
        const displayWidth = sourceImage.width * effectiveScale;
        const displayHeight = sourceImage.height * effectiveScale;
        const overflowX = Math.max(0, displayWidth - outputSize);
        const overflowY = Math.max(0, displayHeight - outputSize);
        const centerPadX = Math.max(0, (outputSize - displayWidth) / 2);
        const centerPadY = Math.max(0, (outputSize - displayHeight) / 2);
        const drawX = centerPadX - overflowX * (cropCenterX / 100);
        const drawY = centerPadY - overflowY * (cropCenterY / 100);

        ctx.fillStyle = "#000000";
        ctx.fillRect(0, 0, outputSize, outputSize);
        ctx.drawImage(
          sourceImage,
          drawX,
          drawY,
          displayWidth,
          displayHeight
        );

        const croppedBlob = await new Promise<Blob | null>((resolve) =>
          canvas.toBlob(resolve, "image/jpeg", 0.9)
        );
        if (!croppedBlob) {
          throw new Error("Unable to render cropped image.");
        }

        const { error } = await supabase.storage
          .from("wine-photos")
          .upload(cropEditorPhoto.path, croppedBlob, {
            upsert: true,
            contentType: "image/jpeg",
          });
        if (error) {
          throw new Error(error.message);
        }
      } finally {
        URL.revokeObjectURL(sourceUrl);
      }

      setPhotoRenderVersion((current) => current + 1);
      await loadPhotos();
      cropOpenRequestRef.current += 1;
      cropTouchRef.current = null;
      setCropEditorPhoto(null);
    } catch {
      setPhotoError("Unable to save photo crop.");
    } finally {
      setSavingCrop(false);
    }
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

  useEffect(() => {
    if (!cropEditorPhoto) {
      return;
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [cropEditorPhoto]);

  const buildBulkEditHref = (targetEntryId: string, targetIndex: number) => {
    const queue = encodeURIComponent(bulkQueue.join(","));
    return `/entries/${targetEntryId}/edit?bulk=1&queue=${queue}&index=${targetIndex}`;
  };

  const cancelBulkEntry = async () => {
    if (!entry || !entryId || !isBulkReview) {
      return;
    }
    if (isSubmitting || isDeletingEntry || isDeletingBulkQueue) {
      return;
    }

    const confirmed = window.confirm(
      "Cancel this wine from bulk review? This will delete the entry and its photos."
    );
    if (!confirmed) {
      return;
    }

    setIsDeletingEntry(true);
    setErrorMessage(null);
    setPhotoError(null);

    try {
      const response = await fetch(`/api/entries/${entry.id}`, {
        method: "DELETE",
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        setErrorMessage(payload.error ?? "Unable to delete entry.");
        return;
      }

      const nextQueue = bulkQueue.filter((id) => id !== entry.id);
      if (nextQueue.length === 0) {
        router.push("/entries");
        return;
      }

      if (nextBulkEntryId && nextQueue.includes(nextBulkEntryId)) {
        const queueParam = encodeURIComponent(nextQueue.join(","));
        const nextIndex = Math.max(0, nextQueue.indexOf(nextBulkEntryId));
        router.push(
          `/entries/${nextBulkEntryId}/edit?bulk=1&queue=${queueParam}&index=${nextIndex}`
        );
        return;
      }

      router.push("/entries");
    } catch {
      setErrorMessage("Unable to delete entry.");
    } finally {
      setIsDeletingEntry(false);
    }
  };

  const cancelEntireBulkQueue = async () => {
    if (!isBulkReview || bulkQueue.length === 0) {
      return;
    }
    if (isSubmitting || isDeletingEntry || isDeletingBulkQueue) {
      return;
    }

    const confirmed = window.confirm(
      `Cancel bulk review and delete all ${bulkQueue.length} queued entr${
        bulkQueue.length === 1 ? "y" : "ies"
      }? This cannot be undone.`
    );
    if (!confirmed) {
      return;
    }

    setIsDeletingBulkQueue(true);
    setErrorMessage(null);
    setPhotoError(null);

    try {
      const uniqueEntryIds = Array.from(new Set(bulkQueue));
      const results = await Promise.all(
        uniqueEntryIds.map(async (targetEntryId) => {
          try {
            const response = await fetch(`/api/entries/${targetEntryId}`, {
              method: "DELETE",
            });
            if (response.ok || response.status === 404) {
              return { id: targetEntryId, ok: true as const, error: null };
            }
            const payload = await response.json().catch(() => ({}));
            const message =
              typeof payload?.error === "string"
                ? payload.error
                : `Delete failed (${response.status}).`;
            return { id: targetEntryId, ok: false as const, error: message };
          } catch {
            return {
              id: targetEntryId,
              ok: false as const,
              error: "Network error while deleting entry.",
            };
          }
        })
      );

      const failed = results.filter((result) => !result.ok);
      if (failed.length > 0) {
        const firstError = failed[0]?.error ?? "Delete failed.";
        window.alert(
          `Deleted ${uniqueEntryIds.length - failed.length}/${
            uniqueEntryIds.length
          } entries. ${failed.length} failed. First error: ${firstError}`
        );
      }

      router.push("/entries");
    } finally {
      setIsDeletingBulkQueue(false);
    }
  };

  const onSubmit = handleSubmit(async (values, event) => {
    if (!entry) {
      return;
    }

    const submitIntent =
      event?.nativeEvent instanceof SubmitEvent
        ? (
            event.nativeEvent.submitter as HTMLButtonElement | null
          )?.dataset.submitIntent ?? null
        : null;

    setIsSubmitting(true);
    setErrorMessage(null);

    clearErrors(["rating", "price_paid", "price_paid_source"]);

    const ratingRaw = values.rating?.trim() ?? "";
    const pricePaidRaw = values.price_paid?.trim() ?? "";
    const rating = ratingRaw ? Number(ratingRaw) : undefined;
    const pricePaid = pricePaidRaw ? Number(Number(pricePaidRaw).toFixed(2)) : undefined;
    const pricePaidCurrency = values.price_paid_currency || "usd";
    const pricePaidSource = values.price_paid_source || undefined;

    if (pricePaid !== undefined && !pricePaidSource) {
      setIsSubmitting(false);
      setError("price_paid_source", {
        type: "manual",
        message: "Select retail or restaurant when entering price paid.",
      });
      return;
    }

    if (pricePaid === undefined && pricePaidSource) {
      setIsSubmitting(false);
      setError("price_paid", {
        type: "manual",
        message: "Enter a price paid amount when selecting retail or restaurant.",
      });
      return;
    }

    const updatePayload: Record<string, unknown> = {
      wine_name: values.wine_name || null,
      producer: values.producer || null,
      vintage: values.vintage || null,
      country: values.country || null,
      region: values.region || null,
      appellation: values.appellation || null,
      classification: values.classification || null,
      primary_grape_ids: selectedPrimaryGrapes.map((grape) => grape.id),
      rating,
      price_paid: pricePaid ?? null,
      price_paid_currency: pricePaid !== undefined ? pricePaidCurrency : null,
      price_paid_source: pricePaidSource ?? null,
      qpr_level: values.qpr_level || null,
      notes: values.notes || null,
      location_text: values.location_text || null,
      location_place_id: values.location_place_id || null,
      consumed_at: values.consumed_at,
      tasted_with_user_ids: selectedUserIds,
      entry_privacy: values.entry_privacy,
      reaction_privacy: values.reaction_privacy,
      comments_privacy: values.comments_privacy,
      advanced_notes: toAdvancedNotesPayload(values.advanced_notes),
    };

    const entryIsFeedVisibleRaw = (entry as unknown as { is_feed_visible?: unknown })
      .is_feed_visible;
    const entryRootIdRaw = (entry as unknown as { root_entry_id?: unknown })
      .root_entry_id;
    const entryIsFeedVisible =
      typeof entryIsFeedVisibleRaw === "boolean" ? entryIsFeedVisibleRaw : true;
    const entryRootId =
      typeof entryRootIdRaw === "string" && entryRootIdRaw.length > 0
        ? entryRootIdRaw
        : null;

    // Bulk review entries are created as "not yet posted" (is_feed_visible=false).
    // Also publish if the user is saving a hidden canonical entry outside bulk review.
    const shouldPublishOnSave =
      isBulkReview || (entryIsFeedVisible === false && !entryRootId);
    if (shouldPublishOnSave) {
      updatePayload.is_feed_visible = true;
    }

    const response = await fetch(`/api/entries/${entry.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(updatePayload),
    });

    if (!response.ok) {
      const payload = await response.json().catch(() => null);
      const flattened =
        payload?.error && typeof payload.error === "object" ? payload.error : null;
      const fieldErrors =
        flattened && typeof flattened.fieldErrors === "object"
          ? (flattened.fieldErrors as Record<string, string[] | undefined>)
          : null;
      const setFieldError = (
        field: keyof EditEntryForm,
        message: string | undefined
      ) => {
        if (!message) return false;
        setError(field, { type: "server", message });
        return true;
      };

      const hadFieldErrors = Boolean(
        setFieldError("rating", fieldErrors?.rating?.[0]) ||
          setFieldError("price_paid", fieldErrors?.price_paid?.[0]) ||
          setFieldError(
            "price_paid_source",
            fieldErrors?.price_paid_source?.[0]
          ) ||
          setFieldError(
            "price_paid_currency",
            fieldErrors?.price_paid_currency?.[0]
          ) ||
          setFieldError("wine_name", fieldErrors?.wine_name?.[0])
      );

      const apiError =
        typeof payload?.error === "string"
          ? payload.error
          : flattened?.formErrors?.[0] ??
            (hadFieldErrors ? null : "Unable to update entry.");
      setIsSubmitting(false);
      setErrorMessage(apiError);
      return;
    }

    if (isBulkReview) {
      if (submitIntent === "exit") {
        // If the user exits bulk review early, publish the remaining queue as-is.
        // (They can still edit individual entries later.)
        try {
          await fetch("/api/entries/bulk-publish", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ entry_ids: bulkQueue }),
          });
        } catch {
          // Best-effort: if this fails, the queue stays unposted until saved later.
        }
        router.push("/entries");
        return;
      }

      if (nextBulkEntryId && currentBulkIndex >= 0) {
        router.push(buildBulkEditHref(nextBulkEntryId, currentBulkIndex + 1));
        return;
      }

      router.push("/entries");
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

  const allDisplayPhotos = sortPhotos(
    ([
      ...displayPhotosByType("label"),
      ...displayPhotosByType("place"),
      ...displayPhotosByType("people"),
      ...displayPhotosByType("pairing"),
      ...displayPhotosByType("lineup"),
      ...displayPhotosByType("other_bottles"),
    ] as EntryPhoto[]).filter(
      (photo, index, list) => list.findIndex((item) => item.id === photo.id) === index
    )
  );
  const collapsibleSectionClassName =
    "group rounded-2xl border border-white/10 bg-black/30 p-4";
  const collapsibleSummaryClassName =
    "cursor-pointer list-none select-none text-sm font-medium text-zinc-200 [&::-webkit-details-marker]:hidden before:mr-2 before:inline-block before:text-white before:transition-transform before:content-['▸'] group-open:before:rotate-90";
  const showEditPhotosSection = false;

  return (
    <div className="min-h-screen bg-[#0f0a09] px-6 py-10 text-zinc-100">
      <div className="mx-auto w-full max-w-6xl space-y-8">
        <NavBar />
      </div>
      <div className="mx-auto w-full max-w-3xl space-y-8 pt-8">
        <header className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-2">
            <span className="text-xs uppercase tracking-[0.3em] text-amber-300/70">
              {isBulkReview ? "Bulk review" : "Edit entry"}
            </span>
            <h1 className="text-3xl font-semibold text-zinc-50">
              {isBulkReview
                ? "Review this wine before posting."
                : "Refine your tasting notes."}
            </h1>
            <p className="text-sm text-zinc-300">
              {isBulkReview
                ? `Wine ${bulkProgressLabel ?? "1/1"} in your bulk queue.`
                : "Update tasting details or photos."}
            </p>
          </div>
          {isBulkReview ? (
            <div className="flex items-center gap-2">
              <button
                type="submit"
                form="entry-edit-form"
                data-submit-intent="next"
                className="rounded-full bg-amber-500/90 px-4 py-2 text-sm font-semibold text-zinc-950 transition hover:bg-amber-400 disabled:opacity-60"
                disabled={isSubmitting || isDeletingEntry || isDeletingBulkQueue}
              >
                {nextBulkEntryId ? "Next wine" : "Finish review"}
              </button>
              <button
                type="submit"
                form="entry-edit-form"
                data-submit-intent="exit"
                className="rounded-full border border-white/15 px-4 py-2 text-sm font-semibold text-zinc-200 transition hover:border-white/30"
                disabled={isSubmitting || isDeletingEntry || isDeletingBulkQueue}
              >
                Skip all and save
              </button>
              <button
                type="button"
                className="rounded-full border border-rose-500/40 px-4 py-2 text-sm font-semibold text-rose-200 transition hover:border-rose-300 disabled:cursor-not-allowed disabled:opacity-60"
                disabled={isSubmitting || isDeletingEntry || isDeletingBulkQueue}
                onClick={cancelEntireBulkQueue}
              >
                {isDeletingBulkQueue ? "Canceling bulk..." : "Cancel bulk entry"}
              </button>
            </div>
          ) : null}
        </header>

        <form
          id="entry-edit-form"
          noValidate
          className="space-y-6 rounded-3xl border border-white/10 bg-white/5 p-8 shadow-[0_30px_80px_-40px_rgba(0,0,0,0.8)] backdrop-blur"
          onSubmit={onSubmit}
        >
          {currentWineName ? (
            <div className="rounded-2xl border border-amber-300/25 bg-amber-300/5 p-4">
              <p className="text-xs uppercase tracking-[0.2em] text-amber-200/80">
                Wine
              </p>
              <p className="mt-1 text-lg font-semibold text-zinc-50">{currentWineName}</p>
            </div>
          ) : null}

          <div>
            <p className="text-sm font-medium text-zinc-200">Current photos</p>
            <div className="mt-2">
              <SwipePhotoGallery
                items={allDisplayPhotos.map((photo, index) => ({
                  id: photo.id,
                  url: withCacheBust(photo.signed_url) ?? photo.signed_url ?? null,
                  alt: `Current ${PHOTO_TYPE_LABELS[photo.type].toLowerCase()} photo ${index + 1}`,
                  badge: (
                    <label className="relative block">
                      <select
                        value={photo.type}
                        className="max-w-[9rem] appearance-none rounded-full border border-white/10 bg-black/45 py-0.5 pl-2 pr-5 text-[10px] font-medium text-zinc-300 outline-none transition hover:border-white/20 focus:border-amber-300/50 disabled:cursor-not-allowed disabled:opacity-60"
                        disabled={isLegacyPhoto(photo) || savingPhotoId === photo.id}
                        onClick={(event) => event.stopPropagation()}
                        onMouseDown={(event) => event.stopPropagation()}
                        onTouchStart={(event) => event.stopPropagation()}
                        onChange={(event) => {
                          void updatePhotoType(photo, event.target.value as EntryPhotoType);
                        }}
                      >
                        {PHOTO_TYPE_OPTIONS.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                      <span className="pointer-events-none absolute right-1.5 top-1/2 -translate-y-1/2 text-[8px] text-zinc-400">
                        ▾
                      </span>
                    </label>
                  ),
                }))}
                heightClassName="h-72 sm:h-[26rem]"
                empty="No photos uploaded yet."
                footer={(active, activeIndex) => {
                  const activePhoto =
                    allDisplayPhotos.find((photo) => photo.id === active.id) ?? null;
                  const canCrop = Boolean(
                    activePhoto && activePhoto.signed_url && !isLegacyPhoto(activePhoto)
                  );
                  return (
                    <>
                      <span>
                        {activeIndex + 1} of {allDisplayPhotos.length}
                      </span>
                      <div className="flex items-center gap-2">
                        {activePhoto?.signed_url ? (
                          <button
                            type="button"
                            className="rounded-full border border-white/10 px-2 py-1 text-[10px] uppercase tracking-[0.12em] text-zinc-200 transition hover:border-amber-300/60 hover:text-amber-200 disabled:cursor-not-allowed disabled:opacity-60"
                            onClick={() => openCropEditor(activePhoto)}
                            disabled={!canCrop || savingPhotoId === activePhoto.id}
                          >
                            Crop
                          </button>
                        ) : null}
                        {activePhoto?.signed_url ? (
                          <a
                            href={activePhoto.signed_url}
                            download
                            className="rounded-full border border-white/10 px-2 py-1 text-[10px] uppercase tracking-[0.12em] text-zinc-200 transition hover:border-amber-300/60 hover:text-amber-200"
                          >
                            Download
                          </a>
                        ) : null}
                      </div>
                    </>
                  );
                }}
              />
            </div>
          </div>

          <div>
            <label className="text-sm font-medium text-zinc-200">Notes</label>
            <textarea
              className="mt-1 min-h-[120px] w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-500 focus:border-amber-300 focus:outline-none focus:ring-2 focus:ring-amber-300/30"
              {...register("notes")}
            />
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <label className="text-sm font-medium text-zinc-200">Rating (1-100)</label>
              <input
                type="text"
                inputMode="numeric"
                className={`mt-1 w-full rounded-xl border bg-black/30 px-3 py-2 text-sm text-zinc-100 focus:outline-none focus:ring-2 ${
                  errors.rating
                    ? "border-rose-400/50 focus:border-rose-300 focus:ring-rose-300/30"
                    : "border-white/10 focus:border-amber-300 focus:ring-amber-300/30"
                }`}
                {...register("rating", {
                  validate: (value) => {
                    const trimmed = value?.trim() ?? "";
                    if (!trimmed) return true;
                    if (!/^[0-9]+$/.test(trimmed)) {
                      return "Rating must be a whole number (integer).";
                    }
                    const parsed = Number(trimmed);
                    if (!Number.isFinite(parsed) || parsed < 1 || parsed > 100) {
                      return "Rating must be between 1 and 100.";
                    }
                    return true;
                  },
                })}
              />
              {errors.rating?.message ? (
                <p className="mt-1 text-xs font-semibold text-rose-400">
                  {errors.rating.message}
                </p>
              ) : (
                <p className="mt-1 text-xs text-zinc-500">
                  Whole number between 1 and 100.
                </p>
              )}
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
            {/* Price is temporarily hidden but kept registered to preserve existing values. */}
            <input type="hidden" {...register("price_paid")} />
            <input type="hidden" {...register("price_paid_currency")} />
            <input type="hidden" {...register("price_paid_source")} />
          </div>

          <details className={collapsibleSectionClassName}>
            <summary className={collapsibleSummaryClassName}>
              Wine details
            </summary>
            <p className="mt-2 text-xs text-zinc-400">
              Optional identity details for this bottle.
            </p>
            <div className="mt-4 grid gap-4 md:grid-cols-2">
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
                <label className="text-sm font-medium text-zinc-200">
                  Classification
                </label>
                <input
                  className="mt-1 w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-500 focus:border-amber-300 focus:outline-none focus:ring-2 focus:ring-amber-300/30"
                  placeholder="Optional (e.g. Premier Cru, DOCG)"
                  {...register("classification")}
                />
              </div>
              <div className="md:col-span-2">
                <PrimaryGrapeSelector
                  selected={selectedPrimaryGrapes}
                  onChange={setSelectedPrimaryGrapes}
                />
              </div>
            </div>
          </details>

          <details className={collapsibleSectionClassName}>
            <summary className={collapsibleSummaryClassName}>
              Location & date
            </summary>
            <p className="mt-2 text-xs text-zinc-400">
              Where and when this bottle was consumed.
            </p>
            <div className="mt-4 grid gap-4 md:grid-cols-2">
              <div>
                <label className="text-sm font-medium text-zinc-200">Location</label>
                <input type="hidden" {...register("location_place_id")} />
                <Controller
                  control={control}
                  name="location_text"
                  render={({ field }) => (
                    <LocationAutocomplete
                      value={field.value}
                      onChange={field.onChange}
                      onSelectPlaceId={(placeId) =>
                        setValue("location_place_id", placeId ?? "", {
                          shouldDirty: true,
                        })
                      }
                      onBlur={field.onBlur}
                      biasCoords={photoGps}
                    />
                  )}
                />
              </div>
              <div className="md:justify-self-start">
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
          </details>

          <details className={collapsibleSectionClassName}>
            <summary className={collapsibleSummaryClassName}>
              Tasted with
            </summary>
            <p className="mt-2 text-xs text-zinc-400">
              Tag friends who were with you.
            </p>
            {users.length === 0 ? (
              <p className="mt-3 text-sm text-zinc-400">No other users yet.</p>
            ) : (() => {
              const topFriends = users.slice(0, 5);
              const topFriendIds = new Set(topFriends.map((u) => u.id));
              const extraSelected = users.filter(
                (u) => selectedUserIds.includes(u.id) && !topFriendIds.has(u.id)
              );
              const trimmedSearch = friendSearch.trim().toLowerCase();
              const searchResults = trimmedSearch.length >= 2
                ? users.filter(
                    (u) =>
                      !topFriendIds.has(u.id) &&
                      !selectedUserIds.includes(u.id) &&
                      ((u.display_name ?? "").toLowerCase().includes(trimmedSearch) ||
                        (u.email ?? "").toLowerCase().includes(trimmedSearch))
                  )
                : [];

              const renderCheckbox = (user: typeof users[number]) => {
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
                        if (event.target.checked) setFriendSearch("");
                      }}
                    />
                    {label}
                  </label>
                );
              };

              return (
                <div className="mt-3 space-y-2">
                  <div className="grid gap-2 rounded-2xl border border-white/10 bg-black/30 p-3">
                    {topFriends.map(renderCheckbox)}
                    {extraSelected.map(renderCheckbox)}
                  </div>
                  <div className="relative">
                    <input
                      type="text"
                      value={friendSearch}
                      onChange={(e) => setFriendSearch(e.target.value)}
                      placeholder="Search friends..."
                      className="w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-500 focus:border-amber-300 focus:outline-none focus:ring-2 focus:ring-amber-300/30"
                    />
                    {searchResults.length > 0 && (
                      <div className="absolute left-0 right-0 top-full z-20 mt-1 max-h-48 overflow-y-auto rounded-xl border border-white/10 bg-[#15100f] p-1 shadow-xl">
                        {searchResults.map((user) => (
                          <button
                            key={user.id}
                            type="button"
                            className="block w-full rounded-lg px-3 py-2 text-left text-sm text-zinc-200 transition hover:bg-white/10"
                            onMouseDown={(e) => e.preventDefault()}
                            onClick={() => {
                              setSelectedUserIds((prev) => [...prev, user.id]);
                              setFriendSearch("");
                            }}
                          >
                            {user.display_name ?? "Unknown"}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              );
            })()}
          </details>

          <details className={collapsibleSectionClassName}>
            <summary className={collapsibleSummaryClassName}>
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

          <details className={collapsibleSectionClassName}>
            <summary className={collapsibleSummaryClassName}>
              Visibility & interaction
            </summary>
            <p className="mt-2 text-xs text-zinc-400">
              Set who can view the post, view/react to reactions, and view/comment on
              comments.
            </p>
            <div className="mt-4 grid gap-4 md:grid-cols-3">
              <div>
                <div className="flex items-center justify-between gap-2">
                  <label className="text-sm font-medium text-zinc-200">
                    Post visibility
                  </label>
                  <PrivacyBadge level={selectedEntryPrivacy} compact />
                </div>
                <select
                  className="mt-1 w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-zinc-100 focus:border-amber-300 focus:outline-none focus:ring-2 focus:ring-amber-300/30"
                  {...register("entry_privacy")}
                >
                  {PRIVACY_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <div className="flex items-center justify-between gap-2">
                  <label className="text-sm font-medium text-zinc-200">Reactions</label>
                  <PrivacyBadge level={selectedReactionPrivacy} compact />
                </div>
                <select
                  className="mt-1 w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-zinc-100 focus:border-amber-300 focus:outline-none focus:ring-2 focus:ring-amber-300/30"
                  {...register("reaction_privacy")}
                >
                  {PRIVACY_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <div className="flex items-center justify-between gap-2">
                  <label className="text-sm font-medium text-zinc-200">Comments</label>
                  <PrivacyBadge level={selectedCommentsPrivacy} compact />
                </div>
                <select
                  className="mt-1 w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-zinc-100 focus:border-amber-300 focus:outline-none focus:ring-2 focus:ring-amber-300/30"
                  {...register("comments_privacy")}
                >
                  {PRIVACY_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <p className="mt-2 text-xs text-zinc-500">
              Privacy on reactions/comments controls both visibility and participation.
            </p>
          </details>

          {showEditPhotosSection ? (
            <details className={collapsibleSectionClassName}>
              <summary className={collapsibleSummaryClassName}>
                Edit photos
              </summary>
              <p className="mt-2 text-xs text-zinc-400">
                Edit category and order, delete photos, and tap any image to crop.
              </p>

              <div className="mt-3 flex items-center justify-end gap-2">
                <input
                  ref={addPhotoInputRef}
                  type="file"
                  accept="image/*"
                  multiple
                  className="sr-only"
                  onChange={(event) => {
                    if (!event.target.files) return;
                    addPhotosWithAiCategorization(event.target.files);
                    event.target.value = "";
                  }}
                />
                <button
                  type="button"
                  className="inline-flex items-center justify-center rounded-full border border-white/10 px-4 py-2 text-sm font-semibold text-zinc-200 transition hover:border-amber-300/60 hover:text-amber-200 disabled:cursor-not-allowed disabled:opacity-60"
                  onClick={() => addPhotoInputRef.current?.click()}
                  disabled={uploadingType !== null}
                >
                  {uploadingType === null
                    ? "Add photos"
                    : `Categorizing ${PHOTO_TYPE_LABELS[uploadingType]}...`}
                </button>
              </div>

              {allDisplayPhotos.length === 0 ? (
                <p className="mt-3 text-sm text-zinc-500">No photos yet.</p>
              ) : (
                <div className="mt-4 space-y-3">
                  {allDisplayPhotos.map((photo, index) => {
                    const legacy = isLegacyPhoto(photo);
                    const saving = savingPhotoId === photo.id;
                    return (
                      <div
                        key={photo.id}
                        className="rounded-xl border border-white/10 bg-black/40 p-3"
                      >
                        <div className="grid gap-3 sm:grid-cols-[7rem_minmax(0,1fr)]">
                          <button
                            type="button"
                            className="relative block h-28 overflow-hidden rounded-lg border border-white/10 bg-black/50 text-left disabled:cursor-not-allowed disabled:opacity-70"
                            onClick={() => openCropEditor(photo)}
                            disabled={!photo.signed_url || saving}
                            aria-label={`Crop ${PHOTO_TYPE_LABELS[photo.type].toLowerCase()} photo`}
                            title="Tap to crop"
                          >
                            {photo.signed_url ? (
                              <>
                                <img
                                  src={withCacheBust(photo.signed_url) ?? photo.signed_url}
                                  alt={`${PHOTO_TYPE_LABELS[photo.type]} photo ${index + 1}`}
                                  className="h-full w-full object-cover"
                                />
                                <span className="absolute bottom-1 left-1 rounded-full border border-white/10 bg-black/60 px-2 py-0.5 text-[10px] uppercase tracking-[0.12em] text-zinc-200">
                                  Crop
                                </span>
                              </>
                            ) : (
                              <span className="flex h-full w-full items-center justify-center text-xs text-zinc-400">
                                Photo unavailable
                              </span>
                            )}
                          </button>

                          <div className="space-y-3">
                            <div className="flex flex-wrap items-start justify-between gap-2">
                              <div>
                                <p className="text-xs uppercase tracking-[0.12em] text-zinc-400">
                                  Photo {index + 1}
                                </p>
                                <p className="text-sm text-zinc-200">
                                  {PHOTO_TYPE_LABELS[photo.type]}
                                </p>
                              </div>
                              <button
                                type="button"
                                className="rounded-full border border-rose-500/40 px-3 py-1 text-xs font-semibold text-rose-200 transition hover:border-rose-300 disabled:cursor-not-allowed disabled:opacity-60"
                                disabled={saving}
                                onClick={() => deletePhotoItem(photo)}
                              >
                                Delete
                              </button>
                            </div>

                            <div className="grid gap-3 sm:grid-cols-2">
                              <label className="text-xs text-zinc-300">
                                Category
                                <select
                                  className="mt-1 w-full rounded-lg border border-white/10 bg-black/30 px-2 py-2 text-sm text-zinc-100 focus:border-amber-300 focus:outline-none focus:ring-2 focus:ring-amber-300/30 disabled:cursor-not-allowed disabled:opacity-70"
                                  value={photo.type}
                                  disabled={legacy || saving}
                                  onChange={(event) =>
                                    updatePhotoType(
                                      photo,
                                      event.target.value as EntryPhotoType
                                    )
                                  }
                                >
                                  {PHOTO_TYPE_OPTIONS.map((option) => (
                                    <option key={option.value} value={option.value}>
                                      {option.label}
                                    </option>
                                  ))}
                                </select>
                              </label>

                              <div className="text-xs text-zinc-300">
                                Order
                                <div className="mt-1 flex items-center gap-2 rounded-lg border border-white/10 bg-black/30 px-2 py-2">
                                  <span className="w-8 text-center text-sm text-zinc-100">
                                    {index + 1}
                                  </span>
                                  <button
                                    type="button"
                                    className="rounded-full border border-white/10 px-2 py-1 text-xs transition hover:border-white/30 disabled:cursor-not-allowed disabled:opacity-60"
                                    disabled={
                                      legacy ||
                                      saving ||
                                      index === 0 ||
                                      allDisplayPhotos.length <= 1
                                    }
                                    onClick={() =>
                                      movePhotoInList(allDisplayPhotos, index, "up")
                                    }
                                  >
                                    ↑
                                  </button>
                                  <button
                                    type="button"
                                    className="rounded-full border border-white/10 px-2 py-1 text-xs transition hover:border-white/30 disabled:cursor-not-allowed disabled:opacity-60"
                                    disabled={
                                      legacy ||
                                      saving ||
                                      index === allDisplayPhotos.length - 1 ||
                                      allDisplayPhotos.length <= 1
                                    }
                                    onClick={() =>
                                      movePhotoInList(allDisplayPhotos, index, "down")
                                    }
                                  >
                                    ↓
                                  </button>
                                </div>
                              </div>
                            </div>

                            {legacy ? (
                              <p className="text-[11px] text-zinc-500">
                                Saved from an older entry format. Category/order edits and crop
                                are unavailable for this photo.
                              </p>
                            ) : null}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </details>
          ) : null}

          {cropEditorPhoto ? (
            <div className="fixed inset-0 z-50">
              <button
                type="button"
                aria-label="Close crop editor"
                className="absolute inset-0 bg-black/70"
                onClick={closeCropEditor}
                disabled={savingCrop}
              />
              <div className="relative h-full overflow-y-auto p-3 pt-4 sm:flex sm:items-center sm:justify-center sm:p-4">
                <div className="relative z-10 mx-auto max-h-[calc(100dvh-1.5rem)] w-full max-w-2xl overflow-y-auto rounded-2xl border border-white/15 bg-[#161412] p-5 shadow-[0_30px_80px_-40px_rgba(0,0,0,0.9)]">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-xs uppercase tracking-[0.2em] text-amber-200/70">
                      Photo crop
                    </p>
                    <h3 className="mt-1 text-lg font-semibold text-zinc-50">
                      Adjust photo framing
                    </h3>
                    <p className="mt-1 text-sm text-zinc-400">
                      This rewrites the displayed image. Drag to frame it, then save.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={closeCropEditor}
                    disabled={savingCrop}
                    className="rounded-full border border-white/10 px-3 py-1 text-xs font-semibold text-zinc-300 transition hover:border-white/30 disabled:opacity-60"
                  >
                    Close
                  </button>
                </div>

                <div className="mt-4 overflow-hidden rounded-xl border border-white/10 bg-black/40">
                  <div
                    ref={cropFrameRef}
                    className="relative mx-auto aspect-square w-full max-w-[28rem] overflow-hidden bg-black/50"
                  >
                    {cropSourceUrl ? (
                      <img
                        src={
                          withCacheBust(cropSourceUrl) ?? cropSourceUrl
                        }
                        alt="Photo crop preview"
                        draggable={false}
                        onLoad={(event) => {
                          const target = event.currentTarget;
                          setCropImageNaturalSize({
                            width: target.naturalWidth,
                            height: target.naturalHeight,
                          });
                          const centered = clampCenter(cropCenterX, cropCenterY);
                          setCropCenterX(centered.x);
                          setCropCenterY(centered.y);
                        }}
                        onPointerDown={onCropPointerDown}
                        onPointerMove={onCropPointerMove}
                        onPointerUp={onCropPointerUp}
                        onPointerCancel={onCropPointerUp}
                        onTouchStart={onCropTouchStart}
                        onTouchMove={onCropTouchMove}
                        onTouchEnd={onCropTouchEnd}
                        onTouchCancel={onCropTouchEnd}
                        style={(() => {
                          const geometry = getCropGeometry();
                          if (!geometry) {
                            return {
                              width: "100%",
                              height: "100%",
                              objectFit: "contain" as const,
                              touchAction: "none" as const,
                            };
                          }
                          const offsetX = geometry.overflowX * (cropCenterX / 100);
                          const offsetY = geometry.overflowY * (cropCenterY / 100);
                          const centerPadX = Math.max(
                            0,
                            (geometry.frameSize - geometry.displayWidth) / 2
                          );
                          const centerPadY = Math.max(
                            0,
                            (geometry.frameSize - geometry.displayHeight) / 2
                          );
                          return {
                            width: `${geometry.displayWidth}px`,
                            height: `${geometry.displayHeight}px`,
                            maxWidth: "none",
                            transform: `translate(${centerPadX - offsetX}px, ${
                              centerPadY - offsetY
                            }px)`,
                            touchAction: "none" as const,
                          };
                        })()}
                        className={`absolute left-0 top-0 select-none ${
                          isDraggingCrop ? "cursor-grabbing" : "cursor-grab"
                        }`}
                      />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center text-sm text-zinc-400">
                        Photo unavailable
                      </div>
                    )}
                  </div>
                </div>

                <div className="mt-4 space-y-3">
                  <div className="hidden sm:block">
                    <div className="mb-1 flex items-center justify-between text-xs text-zinc-400">
                      <span>Zoom</span>
                      <span>{cropZoom.toFixed(2)}x</span>
                    </div>
                    <input
                      type="range"
                      min={MIN_CROP_ZOOM}
                      max={MAX_CROP_ZOOM}
                      step={0.01}
                      value={cropZoom}
                      onChange={(event) => {
                        const nextZoom = clampZoom(Number(event.target.value));
                        setCropZoom(nextZoom);
                        const centered = clampCenter(cropCenterX, cropCenterY, nextZoom);
                        setCropCenterX(centered.x);
                        setCropCenterY(centered.y);
                      }}
                      className="w-full accent-amber-300"
                    />
                  </div>
                  <p className="hidden text-xs text-zinc-400 sm:block">
                    At 1.00x the full image fits. Zoom in and drag to frame the crop.
                  </p>
                  <p className="text-xs text-zinc-400 sm:hidden">
                    Pinch to zoom, then drag to frame the crop.
                  </p>
                </div>

                <div className="mt-5 flex items-center justify-between gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setCropCenterX(50);
                      setCropCenterY(50);
                      setCropZoom(MIN_CROP_ZOOM);
                      setIsDraggingCrop(false);
                      cropDragRef.current = null;
                      cropTouchRef.current = null;
                    }}
                    disabled={savingCrop}
                    className="rounded-full border border-white/10 px-4 py-2 text-xs font-semibold text-zinc-300 transition hover:border-white/30 disabled:opacity-60"
                  >
                    Reset
                  </button>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={closeCropEditor}
                      disabled={savingCrop}
                      className="rounded-full border border-white/10 px-4 py-2 text-xs font-semibold text-zinc-300 transition hover:border-white/30 disabled:opacity-60"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={saveCrop}
                      disabled={savingCrop}
                      className="rounded-full bg-amber-400 px-4 py-2 text-xs font-semibold text-zinc-950 transition hover:bg-amber-300 disabled:opacity-60"
                    >
                      {savingCrop ? "Saving..." : "Save crop"}
                    </button>
                  </div>
                </div>
              </div>
              </div>
            </div>
          ) : null}

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
              disabled={isSubmitting || isDeletingEntry || isDeletingBulkQueue}
            >
              Save changes
            </button>
            {isBulkReview ? (
              <button
                type="button"
                className="text-sm font-medium text-zinc-300 transition hover:text-zinc-100 disabled:cursor-not-allowed disabled:opacity-60"
                onClick={cancelBulkEntry}
                disabled={isSubmitting || isDeletingEntry || isDeletingBulkQueue}
              >
                Cancel
              </button>
            ) : (
              <Link
                className="text-sm font-medium text-zinc-300"
                href={`/entries/${entry.id}`}
              >
                Cancel
              </Link>
            )}
          </div>
        </form>
      </div>
    </div>
  );
}

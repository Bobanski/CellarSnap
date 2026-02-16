"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Controller, useForm, useWatch } from "react-hook-form";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import NavBar from "@/components/NavBar";
import DatePicker from "@/components/DatePicker";
import PrivacyBadge from "@/components/PrivacyBadge";
import PriceCurrencySelect from "@/components/PriceCurrencySelect";
import PrimaryGrapeSelector from "@/components/PrimaryGrapeSelector";
import type { EntryPhoto, PrimaryGrape, WineEntryWithUrls } from "@/types/wine";
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
  PRICE_PAID_SOURCE_LABELS,
  PRICE_PAID_SOURCE_VALUES,
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
  consumed_at: string;
  entry_privacy: "public" | "friends" | "private";
  advanced_notes: AdvancedNotesFormValues;
};

type PrimaryGrapeSelection = Pick<PrimaryGrape, "id" | "name">;

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
  const currentWineName =
    useWatch({
      control,
      name: "wine_name",
    })?.trim() ?? "";
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
  const [selectedPrimaryGrapes, setSelectedPrimaryGrapes] = useState<
    PrimaryGrapeSelection[]
  >([]);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isDeletingEntry, setIsDeletingEntry] = useState(false);
  const [removingCurrentPhotoType, setRemovingCurrentPhotoType] = useState<
    "label" | "place" | "pairing" | null
  >(null);
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
  const cropFrameRef = useRef<HTMLDivElement | null>(null);
  const cropDragRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    startCenterX: number;
    startCenterY: number;
  } | null>(null);
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

  const photosByType = (type: "label" | "place" | "pairing"): EntryPhoto[] =>
    photos
      .filter((photo) => photo.type === type)
      .sort((a, b) => a.position - b.position);

  const displayPhotosByType = (
    type: "label" | "place" | "pairing"
  ): EntryPhoto[] => {
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

  const removeCurrentPhoto = async (
    type: "label" | "place" | "pairing",
    photo: EntryPhoto
  ) => {
    if (!entryId || !entry) {
      return;
    }
    if (removingCurrentPhotoType) {
      return;
    }

    const label =
      type === "label" ? "label" : type === "place" ? "place" : "pairing";
    const confirmed = window.confirm(`Remove this ${label} photo?`);
    if (!confirmed) {
      return;
    }

    setPhotoError(null);
    setRemovingCurrentPhotoType(type);

    try {
      if (photo.id.startsWith("legacy-")) {
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
          // Fallback: clear it locally if the response didn't include the entry.
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
        return;
      }

      await deletePhoto(photo.id);
    } catch {
      setPhotoError("Unable to delete photo.");
    } finally {
      setRemovingCurrentPhotoType(null);
    }
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
    setCropZoom(1);
    setIsDraggingCrop(false);
    cropDragRef.current = null;
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

  const onCropPointerDown = (event: React.PointerEvent<HTMLImageElement>) => {
    if (!cropSourceUrl || savingCrop) {
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
    const drag = cropDragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) {
      return;
    }
    cropDragRef.current = null;
    setIsDraggingCrop(false);
    event.currentTarget.releasePointerCapture(event.pointerId);
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
      setCropEditorPhoto(null);
    } catch {
      setPhotoError("Unable to save crop thumbnail.");
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

  const buildBulkEditHref = (targetEntryId: string, targetIndex: number) => {
    const queue = encodeURIComponent(bulkQueue.join(","));
    return `/entries/${targetEntryId}/edit?bulk=1&queue=${queue}&index=${targetIndex}`;
  };

  const cancelBulkEntry = async () => {
    if (!entry || !entryId || !isBulkReview) {
      return;
    }
    if (isSubmitting || isDeletingEntry) {
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
      consumed_at: values.consumed_at,
      tasted_with_user_ids: selectedUserIds,
      entry_privacy: values.entry_privacy,
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

  const currentLabelPhoto = displayPhotosByType("label")[0] ?? null;
  const currentPlacePhoto = displayPhotosByType("place")[0] ?? null;
  const currentPairingPhoto = displayPhotosByType("pairing")[0] ?? null;
  const currentPhotoCards: Array<{
    key: "label" | "place" | "pairing";
    label: string;
    photo: EntryPhoto | null;
  }> = [
    { key: "label", label: "Label", photo: currentLabelPhoto },
    { key: "place", label: "Place", photo: currentPlacePhoto },
    { key: "pairing", label: "Pairing", photo: currentPairingPhoto },
  ];
  const hasCurrentPhotos = currentPhotoCards.some((card) => card.photo);

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
                disabled={isSubmitting || isDeletingEntry}
              >
                {nextBulkEntryId ? "Next wine" : "Finish review"}
              </button>
              <button
                type="submit"
                form="entry-edit-form"
                data-submit-intent="exit"
                className="rounded-full border border-white/15 px-4 py-2 text-sm font-semibold text-zinc-200 transition hover:border-white/30"
                disabled={isSubmitting || isDeletingEntry}
              >
                Skip all and save
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
            {hasCurrentPhotos ? (
              <div className="mt-2 grid gap-4 md:grid-cols-3">
                {currentPhotoCards.map((card) => {
                  const photo = card.photo;
                  if (!photo) return null;
                  return (
                    <div
                      key={card.key}
                      className="overflow-hidden rounded-2xl border border-white/10 bg-black/30"
                    >
                      <div className="relative">
                        {photo.signed_url ? (
                          card.key === "label" &&
                          !photo.id.startsWith("legacy-") ? (
                            <button
                              type="button"
                              className="block aspect-square w-full cursor-zoom-in overflow-hidden"
                              onClick={() => openCropEditor(photo)}
                              aria-label="Adjust label crop"
                              title="Click to adjust crop"
                            >
                              <img
                                src={withCacheBust(photo.signed_url) ?? photo.signed_url}
                                alt={`Current ${card.label.toLowerCase()} photo`}
                                className="h-full w-full object-cover"
                              />
                            </button>
                          ) : (
                            <img
                              src={withCacheBust(photo.signed_url) ?? photo.signed_url}
                              alt={`Current ${card.label.toLowerCase()} photo`}
                              className={
                                card.key === "label"
                                  ? "aspect-square w-full object-cover"
                                  : "h-28 w-full object-cover sm:h-36"
                              }
                            />
                          )
                        ) : (
                          <div className="flex h-28 items-center justify-center text-xs text-zinc-400 sm:h-36">
                            Photo unavailable
                          </div>
                        )}
                        {currentUserId === entry.user_id ? (
                          <button
                            type="button"
                            className="absolute right-2 top-2 flex h-7 w-7 items-center justify-center rounded-full border border-white/20 bg-black/60 text-sm text-zinc-200 transition hover:border-rose-300 hover:text-rose-200 disabled:cursor-not-allowed disabled:opacity-60"
                            aria-label={`Remove ${card.label.toLowerCase()} photo`}
                            disabled={removingCurrentPhotoType === card.key}
                            onClick={() => removeCurrentPhoto(card.key, photo)}
                          >
                            ×
                          </button>
                        ) : null}
                      </div>
                      <div className="flex items-center justify-between px-3 py-2 text-xs text-zinc-300">
                        <span>{card.label}</span>
                        {currentUserId === entry.user_id && photo.signed_url ? (
                          <a
                            href={photo.signed_url}
                            download
                            className="rounded-full border border-white/10 px-2 py-1 text-[10px] uppercase tracking-[0.16em] text-zinc-200 transition hover:border-amber-300/60 hover:text-amber-200"
                          >
                            Download
                          </a>
                        ) : null}
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="mt-2 text-sm text-zinc-400">No photos uploaded yet.</p>
            )}
          </div>

          {/* Wine details is intentionally first in the form flow */}
          <details className="rounded-2xl border border-white/10 bg-black/30 p-4">
            <summary className="cursor-pointer select-none text-sm font-medium text-zinc-200">
              Wine details
            </summary>
            <p className="mt-2 text-xs text-zinc-400">
              Optional identity and purchase details for this bottle.
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
                        className={`h-10 w-full rounded-r-xl border border-l-0 bg-black/30 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:ring-2 ${
                          errors.price_paid
                            ? "border-rose-400/50 focus:border-rose-300 focus:ring-rose-300/30"
                            : "border-white/10 focus:border-amber-300 focus:ring-amber-300/30"
                        }`}
                        placeholder="Optional (e.g. 28.50)"
                        {...register("price_paid", {
                          validate: (value) => {
                            const trimmed = value?.trim() ?? "";
                            if (!trimmed) return true;
                            if (!/^[0-9]+(\.[0-9]+)?$/.test(trimmed)) {
                              return "Price paid must be numbers only (no $ or symbols).";
                            }
                            const parsed = Number(trimmed);
                            if (!Number.isFinite(parsed) || parsed < 0) {
                              return "Price paid must be a valid number.";
                            }
                            return true;
                          },
                        })}
                      />
                    </div>
                    {errors.price_paid?.message ? (
                      <p className="mt-1 text-xs font-semibold text-rose-400">
                        {errors.price_paid.message}
                      </p>
                    ) : (
                      <p className="mt-1 text-xs text-zinc-500">
                        Numbers only (no $ or symbols). Example: 28.50
                      </p>
                    )}
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
                                : errors.price_paid_source
                                  ? "border-rose-400/50 bg-black/30 text-zinc-300 hover:border-rose-300/60"
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
                    {errors.price_paid_source?.message ? (
                      <p className="mt-1 text-xs font-semibold text-rose-400">
                        {errors.price_paid_source.message}
                      </p>
                    ) : (
                      <p className="mt-1 text-xs text-zinc-500">
                        Required if you enter a price paid amount.
                      </p>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </details>

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
                            type === "label" &&
                            index === 0 &&
                            !photo.id.startsWith("legacy-") ? (
                              <button
                                type="button"
                                className="block aspect-square w-full cursor-zoom-in overflow-hidden rounded-lg"
                                onClick={() => openCropEditor(photo)}
                                aria-label="Adjust label crop"
                                title="Click to adjust crop"
                              >
                                <img
                                  src={withCacheBust(photo.signed_url) ?? photo.signed_url}
                                  alt={`${type} photo ${index + 1}`}
                                  className="h-full w-full object-cover"
                                />
                              </button>
                            ) : (
                              <img
                                src={withCacheBust(photo.signed_url) ?? photo.signed_url}
                                alt={`${type} photo ${index + 1}`}
                                className={
                                  type === "label" && index === 0
                                    ? "aspect-square w-full rounded-lg object-cover"
                                    : "h-28 w-full rounded-lg object-cover"
                                }
                              />
                            )
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
                              <div className="flex items-center gap-2">
                                <button
                                  type="button"
                                  className="rounded-full border border-rose-500/40 px-2 py-1 text-rose-200 transition hover:border-rose-300"
                                  onClick={() => deletePhoto(photo.id)}
                                >
                                  Delete
                                </button>
                              </div>
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

          {cropEditorPhoto ? (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
              <button
                type="button"
                aria-label="Close crop editor"
                className="absolute inset-0 bg-black/70"
                onClick={closeCropEditor}
                disabled={savingCrop}
              />
              <div className="relative z-10 w-full max-w-2xl rounded-2xl border border-white/15 bg-[#161412] p-5 shadow-[0_30px_80px_-40px_rgba(0,0,0,0.9)]">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-xs uppercase tracking-[0.2em] text-amber-200/70">
                      Label crop
                    </p>
                    <h3 className="mt-1 text-lg font-semibold text-zinc-50">
                      Adjust thumbnail framing
                    </h3>
                    <p className="mt-1 text-sm text-zinc-400">
                      This rewrites the displayed thumbnail image. Drag to frame it, then save.
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
                        alt="Label crop preview"
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
                  <div>
                    <div className="mb-1 flex items-center justify-between text-xs text-zinc-400">
                      <span>Zoom</span>
                      <span>{cropZoom.toFixed(2)}x</span>
                    </div>
                    <input
                      type="range"
                      min={1}
                      max={6}
                      step={0.01}
                      value={cropZoom}
                      onChange={(event) => {
                        const nextZoom = Number(event.target.value);
                        setCropZoom(nextZoom);
                        const centered = clampCenter(cropCenterX, cropCenterY, nextZoom);
                        setCropCenterX(centered.x);
                        setCropCenterY(centered.y);
                      }}
                      className="w-full accent-amber-300"
                    />
                  </div>
                  <p className="text-xs text-zinc-400">
                    At 1.00x the full image fits. Zoom in and drag to frame the thumbnail.
                  </p>
                </div>

                <div className="mt-5 flex items-center justify-between gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setCropCenterX(50);
                      setCropCenterY(50);
                      setCropZoom(1);
                      setIsDraggingCrop(false);
                      cropDragRef.current = null;
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
              disabled={isSubmitting || isDeletingEntry}
            >
              Save changes
            </button>
            {isBulkReview ? (
              <button
                type="button"
                className="text-sm font-medium text-zinc-300 transition hover:text-zinc-100 disabled:cursor-not-allowed disabled:opacity-60"
                onClick={cancelBulkEntry}
                disabled={isSubmitting || isDeletingEntry}
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

"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Controller, useForm, useWatch } from "react-hook-form";
import { useRouter } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import AppImage from "@/components/AppImage";
import AppShell from "@/components/AppShell";
import DatePicker from "@/components/DatePicker";
import PrivacyBadge from "@/components/PrivacyBadge";
import PrimaryGrapeSelector from "@/components/PrimaryGrapeSelector";
import LocationAutocomplete from "@/components/LocationAutocomplete";
import SwipePhotoGallery from "@/components/SwipePhotoGallery";
import EntryPostSaveSurveyModal, {
  type ComparisonResponse,
  type PostSaveSurveySubmission,
  type SurveyComparisonCandidate,
  type SurveyEntryCard,
} from "@/components/EntryPostSaveSurveyModal";
import EntryWineComparisonModal from "@/components/EntryWineComparisonModal";
import { extractGpsFromFile } from "@/lib/exifGps";
import {
  ADVANCED_NOTE_FIELDS,
  ADVANCED_NOTE_OPTIONS,
  EMPTY_ADVANCED_NOTES_FORM_VALUES,
  type AdvancedNotesFormValues,
  toAdvancedNotesPayload,
} from "@/lib/advancedNotes";
import {
  type PricePaidCurrency,
  QPR_LEVEL_LABELS,
  type PricePaidSource,
  type QprLevel,
} from "@/lib/entryMeta";
import { getTodayLocalYmd } from "@/lib/dateYmd";
import { MAX_ENTRY_PHOTOS_PER_TYPE } from "@/lib/photoLimits";
import { isUnknownWineName } from "@/lib/wineText";
import type {
  EntryGroupMode,
  EntryPhotoType,
  PrimaryGrape,
  PrivacyLevel,
} from "@/types/wine";
import {
  buildResolvedPhotoTypeMap,
  hasDominantSingleBottleFrame,
  hasLineupWineDetails,
  isConfidentNonBottleIntentTag,
  isPeoplePlaceOrPairingTag,
  NON_BOTTLE_INTENT_CONFIDENCE_THRESHOLD,
  normalizeBottleBbox,
  normalizeLabelAnchor,
  normalizeLabelBbox,
  normalizeConfidence,
  normalizeContextPhotoTag,
  normalizeGrapeLookupValue,
  normalizeLineupText,
  OTHER_BOTTLES_CONFIDENCE_THRESHOLD,
  resolveSinglePhotoEntryMode,
  resolveSourcePhotoRole,
  resolvePostSaveSurveyTransition,
  runWithConcurrency,
  type ContextPhotoTag,
  type SourcePhotoTypeAnalysis,
} from "@shared/entry-flow";
import { buildOriginalPhotoPath } from "@/lib/entryFlow/web/photoPath";
import { submitPostSaveSurveyRequest } from "@/lib/entryFlow/web/postSaveSurveyClient";
import { snapViewportToTop } from "@/lib/ui/overlayPresentation";

type NewEntryForm = {
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
  drinking_now: boolean;
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

type CreateEntryResponse = {
  entry: SurveyEntryCard;
  comparison_candidate?: SurveyComparisonCandidate | null;
};

type PrimaryGrapeSelection = Pick<PrimaryGrape, "id" | "name">;
type UploadPhotoType = EntryPhotoType;
type ManualUploadPhotoType = "label" | "place" | "pairing";
type UploadPhoto = {
  file: File;
  preview: string;
  originalFile: File;
};
type SavedCropState = {
  centerX: number;
  centerY: number;
  zoom: number;
};

const PHOTO_TYPE_OPTIONS: { value: UploadPhotoType; label: string }[] = [
  { value: "label", label: "Label" },
  { value: "pairing", label: "Pairing" },
  { value: "people", label: "People" },
  { value: "other_bottles", label: "Other bottles" },
  { value: "lineup", label: "Lineup" },
  { value: "place", label: "Place" },
];

const GALLERY_TYPE_PRIORITY: Record<UploadPhotoType, number> = {
  pairing: 0,
  label: 1,
  people: 2,
  other_bottles: 3,
  lineup: 4,
  place: 5,
};
const RESCAN_CONFIDENCE_THRESHOLD = 0.6;

function toOrdinal(value: number) {
  const abs = Math.abs(value);
  const mod100 = abs % 100;
  if (mod100 >= 11 && mod100 <= 13) {
    return `${value}th`;
  }
  const mod10 = abs % 10;
  if (mod10 === 1) return `${value}st`;
  if (mod10 === 2) return `${value}nd`;
  if (mod10 === 3) return `${value}rd`;
  return `${value}th`;
}

export default function NewEntryPage() {
  const router = useRouter();
  const supabase = createSupabaseBrowserClient();
  const {
    control,
    register,
    handleSubmit,
    getValues,
    setValue,
    setError,
    clearErrors,
    formState: { errors },
  } = useForm<NewEntryForm>({
    defaultValues: {
      consumed_at: getTodayLocalYmd(),
      location_place_id: "",
      entry_privacy: "public",
      reaction_privacy: "public",
      comments_privacy: "friends_of_friends",
      price_paid_currency: "usd",
      price_paid_source: "",
      qpr_level: "",
      classification: "",
      drinking_now: false,
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
  const [labelPhotos, setLabelPhotos] = useState<UploadPhoto[]>([]);
  const [placePhotos, setPlacePhotos] = useState<UploadPhoto[]>([]);
  const [pairingPhotos, setPairingPhotos] = useState<UploadPhoto[]>([]);
  const [photoTypeOverrides, setPhotoTypeOverrides] = useState<
    Record<string, UploadPhotoType>
  >({});
  const [uploadOrderOverrides, setUploadOrderOverrides] = useState<
    Record<string, number>
  >({});
  const [autofillStatus, setAutofillStatus] = useState<
    "idle" | "loading" | "success" | "error" | "timeout"
  >("idle");
  const [autofillMessage, setAutofillMessage] = useState<string | null>(null);
  const [lastScanConfidence, setLastScanConfidence] = useState<number | null>(null);
  const [users, setUsers] = useState<
    { id: string; display_name: string | null; email: string | null; tasting_count: number }[]
  >([]);
  const [selectedUserIds, setSelectedUserIds] = useState<string[]>([]);
  const [friendSearch, setFriendSearch] = useState("");
  const [selectedPrimaryGrapes, setSelectedPrimaryGrapes] = useState<
    PrimaryGrapeSelection[]
  >([]);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [pendingPostSaveSurvey, setPendingPostSaveSurvey] = useState<{
    entry: SurveyEntryCard;
    candidate: SurveyComparisonCandidate | null;
    step: "survey" | "comparison";
    surveyAnswers: PostSaveSurveySubmission | null;
  } | null>(null);
  const [postSaveSurveyErrorMessage, setPostSaveSurveyErrorMessage] = useState<
    string | null
  >(null);
  const [isSubmittingPostSaveSurvey, setIsSubmittingPostSaveSurvey] = useState(
    false
  );
  const scrollToTopForOverlay = useCallback(() => {
    snapViewportToTop();
  }, []);
  const [photoGps, setPhotoGps] = useState<{ lat: number; lng: number } | null>(null);
  const labelInputRef = useRef<HTMLInputElement | null>(null);
  const labelPhotosRef = useRef<UploadPhoto[]>([]);
  const [cropPhotoIndex, setCropPhotoIndex] = useState<number | null>(null);
  const [cropImageNaturalSize, setCropImageNaturalSize] = useState<{
    width: number;
    height: number;
  } | null>(null);
  const [cropCenterX, setCropCenterX] = useState(50);
  const [cropCenterY, setCropCenterY] = useState(50);
  const [cropZoom, setCropZoom] = useState(1);
  const [isDraggingCrop, setIsDraggingCrop] = useState(false);
  const [savingCrop, setSavingCrop] = useState(false);
  const [cropSourceUrl, setCropSourceUrl] = useState<string | null>(null);
  const [cropSourceLoading, setCropSourceLoading] = useState(false);
  const [savedCropByPreview, setSavedCropByPreview] = useState<
    Record<string, SavedCropState>
  >({});
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

  type NormalizedLabelAutofillResult = Omit<
    LabelAutofillResult,
    "primary_grape_suggestions" | "primary_grape_confidence" | "confidence" | "warnings"
  > & {
    primary_grape_suggestions: string[];
    primary_grape_confidence: number | null;
    confidence: number | null;
    warnings: string[];
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
  type SourcePhotoAnalysis = SourcePhotoTypeAnalysis & {
    photoIndex: number;
    analysisFailed: boolean;
  };
  const [lineupWines, setLineupWines] = useState<LineupWine[]>([]);
  const [lineupCreating, setLineupCreating] = useState(false);
  const [lineupCreatedCount, setLineupCreatedCount] = useState(0);
  const [lineupSourceAnalysis, setLineupSourceAnalysis] = useState<
    SourcePhotoAnalysis[]
  >([]);
  const [bulkEntryMode, setBulkEntryMode] = useState<EntryGroupMode>("event");
  const [bulkEntryConfigStep, setBulkEntryConfigStep] = useState<
    "group" | "event_details"
  >("group");
  const [bulkEntryTitle, setBulkEntryTitle] = useState("");
  const [bulkEntryConfigError, setBulkEntryConfigError] = useState<string | null>(null);

  // Fetch user's default privacy preference and friends list on mount
  useEffect(() => {
    let isMounted = true;

    const loadProfile = async () => {
      const response = await fetch("/api/profile", { cache: "no-store" });
      if (!response.ok) return;
      const data = await response.json();
      const defaultEntryPrivacy = data.profile?.default_entry_privacy;
      const defaultReactionPrivacy = data.profile?.default_reaction_privacy;
      const defaultCommentsPrivacy = data.profile?.default_comments_privacy;
      if (isMounted) {
        setValue(
          "entry_privacy",
          defaultEntryPrivacy === "public" ||
            defaultEntryPrivacy === "friends_of_friends" ||
            defaultEntryPrivacy === "friends" ||
            defaultEntryPrivacy === "private"
            ? defaultEntryPrivacy
            : "public"
        );
        setValue(
          "reaction_privacy",
          defaultReactionPrivacy === "public" ||
            defaultReactionPrivacy === "friends_of_friends" ||
            defaultReactionPrivacy === "friends" ||
            defaultReactionPrivacy === "private"
            ? defaultReactionPrivacy
            : "public"
        );
        setValue(
          "comments_privacy",
          defaultCommentsPrivacy === "public" ||
            defaultCommentsPrivacy === "friends_of_friends" ||
            defaultCommentsPrivacy === "friends" ||
            defaultCommentsPrivacy === "private"
            ? defaultCommentsPrivacy
            : "friends_of_friends"
        );
      }
    };

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

  useEffect(() => {
    labelPhotosRef.current = labelPhotos;
  }, [labelPhotos]);

  useEffect(() => {
    setUploadOrderOverrides((current) => {
      const validPreviews = new Set(labelPhotos.map((photo) => photo.preview));
      let changed = false;
      const next: Record<string, number> = {};
      for (const [preview, order] of Object.entries(current)) {
        if (!validPreviews.has(preview)) {
          changed = true;
          continue;
        }
        next[preview] = order;
      }
      return changed ? next : current;
    });
  }, [labelPhotos]);

  useEffect(() => {
    setSavedCropByPreview((current) => {
      const validPreviews = new Set(labelPhotos.map((photo) => photo.preview));
      let changed = false;
      const next: Record<string, SavedCropState> = {};
      for (const [preview, state] of Object.entries(current)) {
        if (!validPreviews.has(preview)) {
          changed = true;
          continue;
        }
        next[preview] = state;
      }
      return changed ? next : current;
    });
  }, [labelPhotos]);

  useEffect(() => {
    if (cropPhotoIndex === null) {
      return;
    }
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [cropPhotoIndex]);

  const MAX_PHOTOS = MAX_ENTRY_PHOTOS_PER_TYPE;
  const MAX_UPLOAD_RETRIES = 3;
  const BULK_CREATE_CONCURRENCY = 4;
  const PHOTO_UPLOAD_CONCURRENCY = 2;
  const sleep = (ms: number) =>
    new Promise<void>((resolve) => {
      window.setTimeout(resolve, ms);
    });

  const addPhotos = (type: ManualUploadPhotoType, files: FileList) => {
    const list = Array.from(files);
    if (list.length === 0) return;

    // Fire-and-forget GPS extraction — first valid GPS wins
    if (!photoGps) {
      (async () => {
        for (const file of list) {
          const coords = await extractGpsFromFile(file);
          if (coords) {
            setPhotoGps(coords);
            break;
          }
        }
      })();
    }

    if (type === "label") {
      const current = labelPhotosRef.current;
      const remaining = MAX_PHOTOS - current.length;
      if (remaining <= 0) return;
      const next = list.slice(0, remaining).map((file) => ({
        file,
        preview: URL.createObjectURL(file),
        originalFile: file,
      }));
      if (next.length === 0) return;
      const combined = [...current, ...next];
      labelPhotosRef.current = combined;
      setLabelPhotos(combined);
      runAnalysis(combined.map((photo) => photo.file));
      return;
    }

    if (type === "place") {
      setPlacePhotos((prev) => {
        const remaining = MAX_PHOTOS - prev.length;
        if (remaining <= 0) return prev;
        const next = list.slice(0, remaining).map((file) => ({
          file,
          preview: URL.createObjectURL(file),
          originalFile: file,
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
        originalFile: file,
      }));
      return [...prev, ...next];
    });
  };

  const removeLabelPhotoAtIndex = (index: number) => {
    const current = labelPhotosRef.current;
    const target = current[index];
    if (!target) {
      return;
    }
    URL.revokeObjectURL(target.preview);
    const nextPhotos = current.filter((_, photoIndex) => photoIndex !== index);
    labelPhotosRef.current = nextPhotos;
    setLabelPhotos(nextPhotos);
    setPhotoTypeOverrides((existing) => {
      if (!existing[target.preview]) {
        return existing;
      }
      const next = { ...existing };
      delete next[target.preview];
      return next;
    });
    setUploadOrderOverrides((existing) => {
      if (existing[target.preview] === undefined) {
        return existing;
      }
      const next = { ...existing };
      delete next[target.preview];
      return next;
    });
    if (nextPhotos.length > 0) {
      runAnalysis(nextPhotos.map((photo) => photo.file));
    } else {
      setAutofillStatus("idle");
      setAutofillMessage(null);
      resetAutotagState();
    }
  };

  const loadImageElement = async (sourceUrl: string) => {
    return new Promise<HTMLImageElement>((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error("Unable to load image."));
      image.src = sourceUrl;
    });
  };

  const closeCropEditor = () => {
    if (savingCrop) {
      return;
    }
    setCropPhotoIndex(null);
    setCropSourceUrl(null);
    setCropSourceLoading(false);
    setIsDraggingCrop(false);
    cropDragRef.current = null;
    cropTouchRef.current = null;
  };

  const openCropEditor = (photoIndex: number) => {
    const target = labelPhotos[photoIndex];
    if (!target) {
      return;
    }
    const saved = savedCropByPreview[target.preview];
    setCropPhotoIndex(photoIndex);
    setCropSourceLoading(true);
    setCropSourceUrl(null);
    setCropImageNaturalSize(null);
    setCropCenterX(saved?.centerX ?? 50);
    setCropCenterY(saved?.centerY ?? 50);
    setCropZoom(saved?.zoom ?? MIN_CROP_ZOOM);
    setIsDraggingCrop(false);
    cropDragRef.current = null;
    cropTouchRef.current = null;
    setErrorMessage(null);
    // For unsaved uploads, the current in-memory file is the source.
    setCropSourceUrl(target.preview);
    setCropSourceLoading(false);
  };

  const getCropGeometry = (
    natural = cropImageNaturalSize,
    zoom = cropZoom
  ) => {
    const frameSize = cropFrameRef.current?.clientWidth ?? 0;
    if (!natural || frameSize <= 0) {
      return null;
    }

    const baseScale = Math.min(frameSize / natural.width, frameSize / natural.height);
    const effectiveScale = baseScale * zoom;
    const displayWidth = natural.width * effectiveScale;
    const displayHeight = natural.height * effectiveScale;
    const overflowX = Math.max(0, displayWidth - frameSize);
    const overflowY = Math.max(0, displayHeight - frameSize);

    return {
      frameSize,
      displayWidth,
      displayHeight,
      overflowX,
      overflowY,
    };
  };

  const clampZoom = (zoom: number) =>
    Math.min(MAX_CROP_ZOOM, Math.max(MIN_CROP_ZOOM, zoom));

  const clampCenter = (
    nextCenterX: number,
    nextCenterY: number,
    zoom = cropZoom
  ) => {
    const geometry = getCropGeometry(cropImageNaturalSize, zoom);
    if (!geometry) {
      return { x: nextCenterX, y: nextCenterY };
    }

    const clampValue = (value: number, overflow: number) => {
      if (overflow <= 0) {
        return 50;
      }
      return Math.max(0, Math.min(100, value));
    };

    return {
      x: clampValue(nextCenterX, geometry.overflowX),
      y: clampValue(nextCenterY, geometry.overflowY),
    };
  };

  const onCropPointerDown = (event: React.PointerEvent<HTMLImageElement>) => {
    if (!cropSourceUrl || savingCrop || event.pointerType === "touch") {
      return;
    }
    event.preventDefault();
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
    if (savingCrop || event.pointerType === "touch") {
      return;
    }
    const drag = cropDragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) {
      return;
    }
    event.preventDefault();
    const geometry = getCropGeometry();
    if (!geometry) {
      return;
    }

    const deltaX = event.clientX - drag.startX;
    const deltaY = event.clientY - drag.startY;
    const percentX =
      geometry.overflowX > 0 ? (deltaX / geometry.overflowX) * 100 : 0;
    const percentY =
      geometry.overflowY > 0 ? (deltaY / geometry.overflowY) * 100 : 0;
    const clamped = clampCenter(
      drag.startCenterX - percentX,
      drag.startCenterY - percentY
    );
    setCropCenterX(clamped.x);
    setCropCenterY(clamped.y);
  };

  const onCropPointerUp = (event: React.PointerEvent<HTMLImageElement>) => {
    if (savingCrop || event.pointerType === "touch") {
      return;
    }
    const drag = cropDragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) {
      return;
    }
    cropDragRef.current = null;
    setIsDraggingCrop(false);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };

  const getTouchDistance = (
    a: { clientX: number; clientY: number },
    b: { clientX: number; clientY: number }
  ) =>
    Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);

  const onCropTouchStart = (event: React.TouchEvent<HTMLImageElement>) => {
    if (!cropSourceUrl || savingCrop) {
      return;
    }
    if (event.touches.length >= 2) {
      const first = event.touches[0];
      const second = event.touches[1];
      if (!first || !second) {
        return;
      }
      event.preventDefault();
      cropTouchRef.current = {
        mode: "pinch",
        startDistance: getTouchDistance(first, second),
        startZoom: cropZoom,
      };
      cropDragRef.current = null;
      setIsDraggingCrop(false);
      return;
    }

    const touch = event.touches[0];
    if (!touch) {
      return;
    }
    event.preventDefault();
    cropTouchRef.current = {
      mode: "drag",
      startX: touch.clientX,
      startY: touch.clientY,
      startCenterX: cropCenterX,
      startCenterY: cropCenterY,
    };
    setIsDraggingCrop(true);
  };

  const onCropTouchMove = (event: React.TouchEvent<HTMLImageElement>) => {
    const touchState = cropTouchRef.current;
    if (!touchState || savingCrop) {
      return;
    }

    if (touchState.mode === "pinch") {
      if (event.touches.length < 2) {
        return;
      }
      const first = event.touches[0];
      const second = event.touches[1];
      if (!first || !second) {
        return;
      }
      event.preventDefault();
      const distance = getTouchDistance(first, second);
      if (!Number.isFinite(distance) || distance <= 0) {
        return;
      }
      const scale = distance / Math.max(1, touchState.startDistance);
      const nextZoom = clampZoom(touchState.startZoom * scale);
      setCropZoom(nextZoom);
      const centered = clampCenter(cropCenterX, cropCenterY, nextZoom);
      setCropCenterX(centered.x);
      setCropCenterY(centered.y);
      return;
    }

    const touch = event.touches[0];
    if (!touch) {
      return;
    }
    event.preventDefault();
    const geometry = getCropGeometry();
    if (!geometry) {
      return;
    }
    const deltaX = touch.clientX - touchState.startX;
    const deltaY = touch.clientY - touchState.startY;
    const percentX =
      geometry.overflowX > 0 ? (deltaX / geometry.overflowX) * 100 : 0;
    const percentY =
      geometry.overflowY > 0 ? (deltaY / geometry.overflowY) * 100 : 0;
    const clamped = clampCenter(
      touchState.startCenterX - percentX,
      touchState.startCenterY - percentY
    );
    setCropCenterX(clamped.x);
    setCropCenterY(clamped.y);
  };

  const onCropTouchEnd = (event: React.TouchEvent<HTMLImageElement>) => {
    if (savingCrop) {
      return;
    }
    if (event.touches.length >= 2) {
      const first = event.touches[0];
      const second = event.touches[1];
      if (!first || !second) {
        return;
      }
      cropTouchRef.current = {
        mode: "pinch",
        startDistance: getTouchDistance(first, second),
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

  const saveCrop = async () => {
    if (cropPhotoIndex === null || !cropSourceUrl) {
      return;
    }
    const targetPhoto = labelPhotos[cropPhotoIndex];
    if (!targetPhoto) {
      return;
    }

    setSavingCrop(true);
    setErrorMessage(null);

    try {
      const sourceImage = await loadImageElement(cropSourceUrl);
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
      ctx.drawImage(sourceImage, drawX, drawY, displayWidth, displayHeight);

      const croppedBlob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob(resolve, "image/jpeg", 0.9)
      );
      if (!croppedBlob) {
        throw new Error("Unable to render cropped image.");
      }

      const nextFileName = targetPhoto.file.name.replace(/\.[a-z0-9]+$/i, "") || "photo";
      const croppedFile = new File([croppedBlob], `${nextFileName}-crop.jpg`, {
        type: "image/jpeg",
      });
      const nextPreview = URL.createObjectURL(croppedFile);
      const savedStateForTarget = savedCropByPreview[targetPhoto.preview] ?? {
        centerX: cropCenterX,
        centerY: cropCenterY,
        zoom: cropZoom,
      };

      setLabelPhotos((prev) =>
        prev.map((photo, index) => {
          if (index !== cropPhotoIndex) {
            return photo;
          }
          URL.revokeObjectURL(photo.preview);
          return {
            ...photo,
            file: croppedFile,
            preview: nextPreview,
          };
        })
      );
      setSavedCropByPreview((current) => {
        const next = { ...current };
        delete next[targetPhoto.preview];
        next[nextPreview] = savedStateForTarget;
        return next;
      });
      setPhotoTypeOverrides((current) => {
        const currentOverride = current[targetPhoto.preview];
        if (!currentOverride) {
          return current;
        }
        const next = { ...current };
        delete next[targetPhoto.preview];
        next[nextPreview] = currentOverride;
        return next;
      });
      setUploadOrderOverrides((current) => {
        const currentOrder = current[targetPhoto.preview];
        if (currentOrder === undefined) {
          return current;
        }
        const next = { ...current };
        delete next[targetPhoto.preview];
        next[nextPreview] = currentOrder;
        return next;
      });
      setCropPhotoIndex(null);
      setCropSourceUrl(null);
      setCropSourceLoading(false);
      setIsDraggingCrop(false);
      cropDragRef.current = null;
      cropTouchRef.current = null;
    } catch {
      setErrorMessage("Unable to save photo crop.");
    } finally {
      setSavingCrop(false);
    }
  };

  type UploadPhotoOptions = {
    copyByFile?: WeakMap<File, string>;
    originalCopyByFile?: WeakMap<File, string>;
  };

  const isEntryPhotoTypeConstraintMessage = (message: string) => {
    const lower = message.toLowerCase();
    return (
      lower.includes("entry_photos_type_check") ||
      lower.includes("entry photo types are out of date") ||
      lower.includes("028_entry_photo_context_types.sql")
    );
  };

  const uploadPhotos = async (
    entryId: string,
    type: UploadPhotoType,
    photos: { file: File; originalFile?: File }[],
    options?: UploadPhotoOptions
  ) => {
    const isRetryableStatus = (status: number) =>
      status === 408 ||
      status === 425 ||
      status === 429 ||
      (status >= 500 && status <= 599);

    const copyStorageObject = async (sourcePath: string, targetPath: string) => {
      const { error } = await supabase.storage
        .from("wine-photos")
        .copy(sourcePath, targetPath);
      return !error;
    };

    const uploadSinglePhoto = async (photo: {
      file: File;
      originalFile?: File;
    }) => {
      let createdPath: string | null = null;
      let lastCreateMessage = "Unable to create photo record.";
      for (let attempt = 0; attempt < MAX_UPLOAD_RETRIES; attempt += 1) {
        try {
          const createResponse = await fetch(`/api/entries/${entryId}/photos`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ type }),
          });

          const payload = (await createResponse.json().catch(() => ({}))) as {
            error?: string;
            code?: string;
            photo?: { path?: string | null };
          };

          if (!createResponse.ok) {
            const message =
              typeof payload.error === "string"
                ? payload.error
                : "Unable to create photo record.";
            const code = typeof payload.code === "string" ? payload.code : null;
            lastCreateMessage = message;
            const isPhotoTypeConstraintError =
              code === "ENTRY_PHOTO_TYPES_UNAVAILABLE" ||
              isEntryPhotoTypeConstraintMessage(message);
            if (
              attempt < MAX_UPLOAD_RETRIES - 1 &&
              isRetryableStatus(createResponse.status) &&
              !isPhotoTypeConstraintError
            ) {
              await sleep(250 * (attempt + 1));
              continue;
            }
            if (isPhotoTypeConstraintError) {
              throw new Error(
                "Database photo types are out of date. Run `supabase/sql/028_entry_photo_context_types.sql` and retry."
              );
            }
            throw new Error(
              `${type} photo record failed (${createResponse.status}): ${message}`
            );
          }

          const created = payload.photo;
          createdPath = created?.path ?? null;
          if (!createdPath) {
            throw new Error(`${type} photo record was created without a path.`);
          }
          break;
        } catch (error) {
          if (attempt >= MAX_UPLOAD_RETRIES - 1) {
            if (error instanceof Error) {
              throw error;
            }
            throw new Error(`${type} photo record failed: ${lastCreateMessage}`);
          }
          await sleep(250 * (attempt + 1));
        }
      }
      if (!createdPath) {
        throw new Error(`${type} photo record failed: ${lastCreateMessage}`);
      }

      const uploadToStorage = async (
        path: string,
        fileToUpload: File,
        label: "photo" | "original"
      ) => {
        for (let attempt = 0; attempt < MAX_UPLOAD_RETRIES; attempt += 1) {
          const { error } = await supabase.storage
            .from("wine-photos")
            .upload(path, fileToUpload, {
              upsert: true,
              contentType: fileToUpload.type || "image/jpeg",
            });
          if (!error) {
            return;
          }
          if (attempt >= MAX_UPLOAD_RETRIES - 1) {
            throw new Error(`${type} ${label} upload failed: ${error.message}`);
          }
          await sleep(300 * (attempt + 1));
        }
      };

      let uploadedFromCache = false;
      const cachedPath = options?.copyByFile?.get(photo.file) ?? null;
      if (cachedPath && cachedPath !== createdPath) {
        uploadedFromCache = await copyStorageObject(cachedPath, createdPath);
      }
      if (!uploadedFromCache) {
        await uploadToStorage(createdPath, photo.file, "photo");
      }
      options?.copyByFile?.set(photo.file, createdPath);

      if (type === "label") {
        const originalPath = buildOriginalPhotoPath(createdPath);
        const originalFile = photo.originalFile ?? photo.file;
        let copiedOriginalFromCache = false;
        const cachedOriginalPath =
          options?.originalCopyByFile?.get(originalFile) ?? null;
        if (cachedOriginalPath && cachedOriginalPath !== originalPath) {
          copiedOriginalFromCache = await copyStorageObject(
            cachedOriginalPath,
            originalPath
          );
        }
        if (!copiedOriginalFromCache) {
          await uploadToStorage(originalPath, originalFile, "original");
        }
        options?.originalCopyByFile?.set(originalFile, originalPath);
      }

      return {
        path: createdPath,
        sourceFile: photo.file,
      };
    };

    const photoTasks = photos.map(
      (photo) => async () => {
        return uploadSinglePhoto(photo);
      }
    );
    return runWithConcurrency(photoTasks, PHOTO_UPLOAD_CONCURRENCY);
  };

  const createEntryRecord = async (
    body: Record<string, unknown>
  ): Promise<{ entryId: string }> => {
    let lastStatus: number | null = null;
    let lastMessage = "Unable to create entry.";
    for (let attempt = 0; attempt < MAX_UPLOAD_RETRIES; attempt += 1) {
      try {
        const response = await fetch("/api/entries", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        if (!response.ok) {
          const payload = await response.json().catch(() => ({}));
          const message =
            typeof payload?.error === "string"
              ? payload.error
              : "Unable to create entry.";
          lastStatus = response.status;
          lastMessage = message;
          const retryable =
            response.status === 408 ||
            response.status === 425 ||
            response.status === 429 ||
            (response.status >= 500 && response.status <= 599);
          if (attempt < MAX_UPLOAD_RETRIES - 1 && retryable) {
            await sleep(300 * (attempt + 1));
            continue;
          }
          throw new Error(`Entry create failed (${response.status}): ${message}`);
        }

        const payload = (await response.json()) as {
          entry?: { id?: string | null };
        };
        const entryId = payload.entry?.id;
        if (!entryId) {
          throw new Error("Entry created but missing entry ID.");
        }
        return { entryId };
      } catch (error) {
        if (attempt >= MAX_UPLOAD_RETRIES - 1) {
          if (error instanceof Error) {
            throw error;
          }
          const statusPrefix = lastStatus ? `(${lastStatus}) ` : "";
          throw new Error(`Entry create failed ${statusPrefix}${lastMessage}`);
        }
        await sleep(300 * (attempt + 1));
      }
    }

    throw new Error("Entry create failed.");
  };

  const rollbackCreatedEntry = async (entryId: string) => {
    try {
      const response = await fetch(`/api/entries/${entryId}`, {
        method: "DELETE",
      });
      return response.ok;
    } catch {
      return false;
    }
  };

  const returnToPreviousPage = (fallbackPath: string) => {
    if (typeof window !== "undefined") {
      const { referrer } = document;
      if (referrer) {
        try {
          const referrerUrl = new URL(referrer);
          if (referrerUrl.origin === window.location.origin) {
            const referrerPath = `${referrerUrl.pathname}${referrerUrl.search}${referrerUrl.hash}`;
            if (referrerPath && !referrerPath.startsWith("/entries/new")) {
              router.push(referrerPath);
              return;
            }
          }
        } catch {
          // Fall back to history navigation when referrer cannot be parsed.
        }
      }

      if (window.history.length > 1) {
        router.back();
        return;
      }
    }

    router.push(fallbackPath);
  };

  const returnAfterSave = (entryId: string) => {
    returnToPreviousPage(`/entries/${entryId}`);
  };

  const returnAfterCancel = () => {
    returnToPreviousPage("/entries");
  };

  const skipPostSaveComparison = () => {
    if (!pendingPostSaveSurvey) {
      return;
    }
    returnAfterSave(pendingPostSaveSurvey.entry.id);
  };

  const submitPostSaveSurvey = async (submission: PostSaveSurveySubmission) => {
    if (!pendingPostSaveSurvey || isSubmittingPostSaveSurvey) {
      return;
    }

    setPostSaveSurveyErrorMessage(null);
    setIsSubmittingPostSaveSurvey(true);

    try {
      const result = await submitPostSaveSurveyRequest({
        supabase,
        entryId: pendingPostSaveSurvey.entry.id,
        answers: submission,
      });

      if (!result.ok) {
        const apiError = result.error ?? "Unable to save survey response.";
        setPostSaveSurveyErrorMessage(apiError);
        setIsSubmittingPostSaveSurvey(false);
        return;
      }

      const transition = resolvePostSaveSurveyTransition(
        Boolean(pendingPostSaveSurvey.candidate)
      );
      if (transition.nextStep === "comparison") {
        scrollToTopForOverlay();
        setPendingPostSaveSurvey((current) =>
          current
            ? {
                ...current,
                step: "comparison",
                surveyAnswers: submission,
              }
            : current
        );
        setIsSubmittingPostSaveSurvey(false);
        return;
      }

      setIsSubmittingPostSaveSurvey(false);
      returnAfterSave(pendingPostSaveSurvey.entry.id);
    } catch {
      setPostSaveSurveyErrorMessage(
        "Unable to save survey response. Check your connection and try again."
      );
      setIsSubmittingPostSaveSurvey(false);
    }
  };

  const submitPostSaveComparison = async (response: ComparisonResponse) => {
    if (
      !pendingPostSaveSurvey ||
      !pendingPostSaveSurvey.candidate ||
      !pendingPostSaveSurvey.surveyAnswers ||
      isSubmittingPostSaveSurvey
    ) {
      return;
    }

    setPostSaveSurveyErrorMessage(null);
    setIsSubmittingPostSaveSurvey(true);

    try {
      const result = await submitPostSaveSurveyRequest({
        supabase,
        entryId: pendingPostSaveSurvey.entry.id,
        answers: pendingPostSaveSurvey.surveyAnswers,
        comparisonEntryId: pendingPostSaveSurvey.candidate.id,
        response,
      });

      if (!result.ok) {
        const apiError = result.error ?? "Unable to save comparison response.";
        setPostSaveSurveyErrorMessage(apiError);
        setIsSubmittingPostSaveSurvey(false);
        return;
      }

      setIsSubmittingPostSaveSurvey(false);
      returnAfterSave(pendingPostSaveSurvey.entry.id);
    } catch {
      setPostSaveSurveyErrorMessage(
        "Unable to save comparison response. Check your connection and try again."
      );
      setIsSubmittingPostSaveSurvey(false);
    }
  };

  const clearLineupReviewState = () => {
    setLineupWines([]);
    setLineupCreatedCount(0);
  };

  const resetAutotagState = () => {
    clearLineupReviewState();
    setLineupSourceAnalysis([]);
    setBulkEntryMode("event");
    setBulkEntryConfigStep("group");
    setBulkEntryTitle("");
    setBulkEntryConfigError(null);
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

  const dedupeFiles = (files: File[]) => {
    const seen = new Set<File>();
    return files.filter((file) => {
      if (seen.has(file)) {
        return false;
      }
      seen.add(file);
      return true;
    });
  };

  const toUploads = (files: File[]) =>
    dedupeFiles(files)
      .slice(0, MAX_PHOTOS)
      .map((file) => ({ file }));

  const collectResolvedSourceUploads = ({
    sourcePhotos,
    sourceAnalysisByIndex,
    reserveFallbackLabel,
  }: {
    sourcePhotos: UploadPhoto[];
    sourceAnalysisByIndex: Map<number, SourcePhotoAnalysis>;
    reserveFallbackLabel: boolean;
  }) => {
    const sourceFiles = sourcePhotos.map((photo) => photo.file);
    const resolvedPhotoTypeByIndex = buildResolvedPhotoTypeMap({
      photos: sourcePhotos,
      sourceAnalysisByIndex,
      resolveManualPhotoType: (photo) => photoTypeOverrides[photo.preview],
    });

    const labelIndexes = sourcePhotos
      .map((photo, index) => ({ photo, index }))
      .filter(({ index }) => resolvedPhotoTypeByIndex.get(index) === "label");
    const fallbackLabelIndex =
      reserveFallbackLabel &&
      labelIndexes.length === 0 &&
      sourcePhotos.length > 0
        ? 0
        : -1;
    const shouldSkipFallbackContextIndex: (index: number) => boolean =
      fallbackLabelIndex >= 0 && labelIndexes.length === 0
        ? (index: number) => index === fallbackLabelIndex
        : () => false;
    const labelUploads = (
      labelIndexes.length > 0
        ? labelIndexes.map(({ photo }) => ({
            file: photo.file,
            originalFile: photo.originalFile ?? photo.file,
          }))
        : fallbackLabelIndex >= 0 && sourcePhotos[fallbackLabelIndex]
        ? [
            {
              file: sourcePhotos[fallbackLabelIndex].file,
              originalFile:
                sourcePhotos[fallbackLabelIndex].originalFile ??
                sourcePhotos[fallbackLabelIndex].file,
            },
          ]
        : []
    ).slice(0, MAX_PHOTOS);

    return {
      sourceFiles,
      resolvedPhotoTypeByIndex,
      labelUploads,
      lineupUploads: sourceFiles.filter(
        (_file, index) =>
          !shouldSkipFallbackContextIndex(index) &&
          resolvedPhotoTypeByIndex.get(index) === "lineup"
      ),
      otherBottleUploads: sourceFiles.filter((_file, index) => {
        if (shouldSkipFallbackContextIndex(index)) {
          return false;
        }
        return resolvedPhotoTypeByIndex.get(index) === "other_bottles";
      }),
      placeUploads: dedupeFiles([
        ...placePhotos.map((photo) => photo.file),
        ...sourceFiles.filter(
          (_file, index) =>
            !shouldSkipFallbackContextIndex(index) &&
            resolvedPhotoTypeByIndex.get(index) === "place"
        ),
      ]),
      peopleUploads: sourceFiles.filter(
        (_file, index) =>
          !shouldSkipFallbackContextIndex(index) &&
          resolvedPhotoTypeByIndex.get(index) === "people"
      ),
      pairingUploads: dedupeFiles([
        ...pairingPhotos.map((photo) => photo.file),
        ...sourceFiles.filter(
          (_file, index) =>
            !shouldSkipFallbackContextIndex(index) &&
            resolvedPhotoTypeByIndex.get(index) === "pairing"
        ),
      ]),
    };
  };

  const onSubmit = handleSubmit(async (values) => {
    setIsSubmitting(true);
    setErrorMessage(null);
    setPendingPostSaveSurvey(null);
    setPostSaveSurveyErrorMessage(null);

    clearErrors(["rating", "price_paid", "price_paid_source"]);

    const ratingRaw = values.rating?.trim() ?? "";
    const pricePaidRaw = values.price_paid?.trim() ?? "";
    const rating = Number(ratingRaw);
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
          drinking_now: values.drinking_now === true,
          location_text: values.location_text || null,
          location_place_id: values.location_place_id || null,
          consumed_at: values.consumed_at,
          tasted_with_user_ids: selectedUserIds,
          entry_privacy: values.entry_privacy,
          reaction_privacy: values.reaction_privacy,
          comments_privacy: values.comments_privacy,
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
      const flattened =
        payload?.error && typeof payload.error === "object" ? payload.error : null;
      const fieldErrors =
        flattened && typeof flattened.fieldErrors === "object"
          ? (flattened.fieldErrors as Record<string, string[] | undefined>)
          : null;
      const setFieldError = (
        field: keyof NewEntryForm,
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
            (hadFieldErrors ? null : "Unable to create entry.");
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
      const sourcePhotos = labelPhotos;
      const sourceAnalysisByIndex = new Map(
        lineupSourceAnalysis.map((analysis) => [analysis.photoIndex, analysis])
      );
      const {
        labelUploads,
        lineupUploads,
        otherBottleUploads,
        placeUploads,
        peopleUploads,
        pairingUploads,
      } = collectResolvedSourceUploads({
        sourcePhotos,
        sourceAnalysisByIndex,
        reserveFallbackLabel: true,
      });

      const uploadJobs: Promise<unknown>[] = [];
      if (labelUploads.length > 0) {
        uploadJobs.push(uploadPhotos(entry.id, "label", labelUploads));
      }
      if (lineupUploads.length > 0) {
        uploadJobs.push(uploadPhotos(entry.id, "lineup", toUploads(lineupUploads)));
      }
      if (otherBottleUploads.length > 0) {
        uploadJobs.push(
          uploadPhotos(entry.id, "other_bottles", toUploads(otherBottleUploads))
        );
      }
      if (placeUploads.length > 0) {
        uploadJobs.push(uploadPhotos(entry.id, "place", toUploads(placeUploads)));
      }
      if (peopleUploads.length > 0) {
        uploadJobs.push(uploadPhotos(entry.id, "people", toUploads(peopleUploads)));
      }
      if (pairingUploads.length > 0) {
        uploadJobs.push(uploadPhotos(entry.id, "pairing", toUploads(pairingUploads)));
      }
      await Promise.all(uploadJobs);
    } catch (error) {
      const rolledBack = await rollbackCreatedEntry(entry.id);
      setIsSubmitting(false);
      const uploadErrorMessage =
        error instanceof Error ? error.message : "Photo upload failed.";
      setErrorMessage(
        rolledBack
          ? `${uploadErrorMessage} Entry creation was rolled back.`
          : `${uploadErrorMessage} Entry may have been created without all photos. Please delete it and try again.`
      );
      return;
    }

    setIsSubmitting(false);

    scrollToTopForOverlay();
    setPendingPostSaveSurvey({
      entry,
      candidate: comparisonCandidate,
      step: "survey",
      surveyAnswers: null,
    });
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
    const normalizeAutofillText = (value?: string | null) => {
      if (typeof value !== "string") return "";
      const trimmed = value.trim();
      return trimmed.length > 0 ? trimmed : "";
    };

    const current = getValues();
    const normalizedWineName = normalizeAutofillText(data.wine_name);
    const normalizedProducer = normalizeAutofillText(data.producer);
    if (!current.wine_name) {
      const fallbackWineName =
        normalizedWineName && !isUnknownWineName(normalizedWineName)
          ? normalizedWineName
          : normalizedProducer;
      if (fallbackWineName) {
        setValue("wine_name", fallbackWineName);
      }
    }
    if (!current.producer && normalizedProducer) {
      setValue("producer", normalizedProducer);
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

  const classifyContextPhoto = async (
    file: File,
    signal: AbortSignal
  ): Promise<{ tag: ContextPhotoTag; confidence: number | null }> => {
    const formData = new FormData();
    formData.append("photo", file);
    const response = await fetch("/api/photo-context", {
      method: "POST",
      body: formData,
      signal,
    });
    if (!response.ok) {
      return { tag: "unknown", confidence: null };
    }
    const payload = (await response.json()) as {
      tag?: string;
      confidence?: number | null;
    };
    const tag = normalizeContextPhotoTag(payload.tag);
    const confidence = normalizeConfidence(payload.confidence);
    return { tag, confidence };
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
    const normalizedBulkTitle = bulkEntryTitle.trim();
    if (!normalizedBulkTitle) {
      setBulkEntryConfigError(
        "Add an event or catch-up title before creating the grouped post."
      );
      return;
    }
    setBulkEntryConfigError(null);

    const included = selected.filter((wine) => hasLineupWineDetails(wine));
    if (included.length === 0) {
      setAutofillStatus("error");
      setAutofillMessage(
        "Selected bottles have no readable label details. Uncheck unknown bottles or retry with a clearer photo."
      );
      return;
    }

    setLineupCreating(true);
    setLineupCreatedCount(0);
    setAutofillStatus("loading");
    setAutofillMessage("Resolving grape varieties...");

    const sourcePhotos = labelPhotos;
    const sourceAnalysisByIndex = new Map(
      lineupSourceAnalysis.map((analysis) => [analysis.photoIndex, analysis])
    );
    const getSourceAnalysis = (photoIndex: number): SourcePhotoAnalysis | null =>
      sourceAnalysisByIndex.get(photoIndex) ?? null;
    const {
      sourceFiles,
      resolvedPhotoTypeByIndex,
      lineupUploads: lineupContextFiles,
      placeUploads: placeContextFiles,
      peopleUploads: peopleContextFiles,
      pairingUploads: pairingContextFiles,
    } = collectResolvedSourceUploads({
      sourcePhotos,
      sourceAnalysisByIndex,
      reserveFallbackLabel: false,
    });

    // Resolve grape suggestions to IDs for all wines in parallel, with
    // memoization to avoid duplicate lookups across similar bottles.
    const grapeLookupCache = new Map<string, PrimaryGrapeSelection[]>();
    const resolveSuggestedGrapesCached = async (suggestions: string[]) => {
      const normalizedKey = suggestions
        .map((value) => normalizeGrapeLookupValue(value))
        .filter((value) => value.length > 0)
        .slice(0, 2)
        .join("|");
      if (!normalizedKey) {
        return [] as PrimaryGrapeSelection[];
      }
      const cached = grapeLookupCache.get(normalizedKey);
      if (cached) {
        return cached;
      }
      const resolved = await resolveSuggestedGrapes(suggestions.slice(0, 2));
      grapeLookupCache.set(normalizedKey, resolved);
      return resolved;
    };

    // Resolve grape suggestions to IDs for all wines in parallel
    const grapeIdsByIndex: Map<number, string[]> = new Map();
    await Promise.all(
      included.map(async (wine, i) => {
        const suggestions = wine.primary_grape_suggestions ?? [];
        if (suggestions.length > 0) {
          const resolved = await resolveSuggestedGrapesCached(suggestions);
          if (resolved.length > 0) {
            grapeIdsByIndex.set(i, resolved.map((g) => g.id));
          }
        }
      })
    );

    setAutofillMessage(`Creating entries... (0/${included.length} started)`);

    const privacy = getValues("entry_privacy") || "public";
    const reactionPrivacy = getValues("reaction_privacy") || privacy;
    const commentsPrivacy = getValues("comments_privacy") || privacy;
    const isSharedEvent = bulkEntryMode === "event";
    const consumedAt =
      isSharedEvent && getValues("consumed_at")
        ? getValues("consumed_at")
        : getTodayLocalYmd();
    const locationText = getValues("location_text")?.trim() ?? "";
    const locationPlaceId = getValues("location_place_id")?.trim() ?? "";
    const tastedWithUserIds = isSharedEvent ? Array.from(new Set(selectedUserIds)) : [];
    let created = 0;
    let started = 0;
    const contextCopyCaches = new Map<UploadPhotoType, WeakMap<File, string>>();
    const getCopyCache = (photoType: UploadPhotoType) => {
      const existing = contextCopyCaches.get(photoType);
      if (existing) {
        return existing;
      }
      const next = new WeakMap<File, string>();
      contextCopyCaches.set(photoType, next);
      return next;
    };
    const labelOriginalCopyCache = new WeakMap<File, string>();
    let fatalCreationError: string | null = null;

    type UploadedPhotoRecord = {
      path: string;
      sourceFile: File;
    };

    type LineupCreationResult = {
      entryId: string | null;
      photoIndex: number;
      labelPath: string | null;
      contextUploads: Array<UploadedPhotoRecord & { type: UploadPhotoType }>;
      rollbackFailed: boolean;
      errorMessage: string | null;
    };

    const creationTasks = included.map(
      (wine, i) =>
        async (): Promise<LineupCreationResult> => {
          if (fatalCreationError) {
            return {
              entryId: null,
              photoIndex: wine.photoIndex,
              labelPath: null,
              contextUploads: [],
              rollbackFailed: false,
              errorMessage: fatalCreationError,
            };
          }
          try {
            const { entryId } = await createEntryRecord({
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
              location_text: isSharedEvent && locationText ? locationText : null,
              location_place_id:
                isSharedEvent && locationPlaceId ? locationPlaceId : null,
              entry_privacy: privacy,
              reaction_privacy: reactionPrivacy,
              comments_privacy: commentsPrivacy,
              is_feed_visible: false,
              tasted_with_user_ids: tastedWithUserIds,
              skip_comparison_candidate: true,
            });
            started += 1;
            setAutofillMessage(
              started < included.length
                ? `Creating entries... (${started}/${included.length} started)`
                : "All entries started. Finishing photo uploads..."
            );

            // Upload a per-bottle thumbnail (fallback to original source photo)
            const sourceFile = sourceFiles[wine.photoIndex];
            try {
              let labelPath: string | null = null;
              const otherBottleContextFiles = sourceFiles.filter(
                (_file, photoIndex) =>
                  photoIndex !== wine.photoIndex &&
                  resolvedPhotoTypeByIndex.get(photoIndex) === "other_bottles"
              );
              const contextUploads: Array<
                UploadedPhotoRecord & { type: UploadPhotoType }
              > = [];
              if (sourceFile) {
                const thumbnail = await createLineupBottleThumbnail(
                  sourceFile,
                  wine.bottle_bbox,
                  wine.label_bbox,
                  wine.label_anchor,
                  i
                );
                const labelUploads = await uploadPhotos(
                  entryId,
                  "label",
                  [{ file: thumbnail, originalFile: sourceFile }],
                  {
                    originalCopyByFile: labelOriginalCopyCache,
                  }
                );
                labelPath = labelUploads[0]?.path ?? null;
              }
              const uploadJobs: Array<
                Promise<Array<UploadedPhotoRecord & { type: UploadPhotoType }>>
              > = [];
              if (lineupContextFiles.length > 0) {
                uploadJobs.push(
                  uploadPhotos(entryId, "lineup", toUploads(lineupContextFiles), {
                    copyByFile: getCopyCache("lineup"),
                  }).then((uploads) =>
                    uploads.map((upload) => ({ ...upload, type: "lineup" as const }))
                  )
                );
              }
              if (otherBottleContextFiles.length > 0) {
                uploadJobs.push(
                  uploadPhotos(
                    entryId,
                    "other_bottles",
                    toUploads(otherBottleContextFiles),
                    {
                      copyByFile: getCopyCache("other_bottles"),
                    }
                  ).then((uploads) =>
                    uploads.map((upload) => ({
                      ...upload,
                      type: "other_bottles" as const,
                    }))
                  )
                );
              }
              if (placeContextFiles.length > 0) {
                uploadJobs.push(
                  uploadPhotos(entryId, "place", toUploads(placeContextFiles), {
                    copyByFile: getCopyCache("place"),
                  }).then((uploads) =>
                    uploads.map((upload) => ({ ...upload, type: "place" as const }))
                  )
                );
              }
              if (pairingContextFiles.length > 0) {
                uploadJobs.push(
                  uploadPhotos(entryId, "pairing", toUploads(pairingContextFiles), {
                    copyByFile: getCopyCache("pairing"),
                  }).then((uploads) =>
                    uploads.map((upload) => ({ ...upload, type: "pairing" as const }))
                  )
                );
              }
              if (peopleContextFiles.length > 0) {
                uploadJobs.push(
                  uploadPhotos(entryId, "people", toUploads(peopleContextFiles), {
                    copyByFile: getCopyCache("people"),
                  }).then((uploads) =>
                    uploads.map((upload) => ({ ...upload, type: "people" as const }))
                  )
                );
              }

              const uploadedContextGroups = await Promise.all(uploadJobs);
              uploadedContextGroups.forEach((group) => {
                contextUploads.push(...group);
              });

              if (!labelPath) {
                throw new Error("Label upload failed to return a usable path.");
              }

              created += 1;
              setLineupCreatedCount(created);
              if (started >= included.length) {
                setAutofillMessage(
                  "All entries started. Finishing photo uploads..."
                );
              }
              return {
                entryId,
                photoIndex: wine.photoIndex,
                labelPath,
                contextUploads,
                rollbackFailed: false,
                errorMessage: null,
              };
            } catch (uploadError) {
              const rolledBack = await rollbackCreatedEntry(entryId);
              const uploadMessage =
                uploadError instanceof Error
                  ? uploadError.message
                  : "Photo upload failed.";
              if (isEntryPhotoTypeConstraintMessage(uploadMessage)) {
                fatalCreationError = uploadMessage;
              }
              return {
                entryId: null,
                photoIndex: wine.photoIndex,
                labelPath: null,
                contextUploads: [],
                rollbackFailed: !rolledBack,
                errorMessage: uploadMessage,
              };
            }
          } catch (error) {
            const createMessage =
              error instanceof Error ? error.message : "Entry creation failed.";
            if (isEntryPhotoTypeConstraintMessage(createMessage)) {
              fatalCreationError = createMessage;
            }
            return {
              entryId: null,
              photoIndex: wine.photoIndex,
              labelPath: null,
              contextUploads: [],
              rollbackFailed: false,
              errorMessage: createMessage,
            };
          }
        }
    );

    const creationResults = await runWithConcurrency(
      creationTasks,
      BULK_CREATE_CONCURRENCY
    );

    setLineupCreating(false);

    const successfulCreationResults = creationResults.filter(
      (result): result is LineupCreationResult & { entryId: string; labelPath: string } =>
        typeof result.entryId === "string" &&
        result.entryId.length > 0 &&
        typeof result.labelPath === "string" &&
        result.labelPath.length > 0
    );
    const createdEntryIds = successfulCreationResults
      .map((result) => result.entryId)
      .filter((value): value is string => typeof value === "string" && value.length > 0);
    const rollbackFailureCount = creationResults.filter(
      (result) => result.rollbackFailed
    ).length;
    const failedCount = creationResults.length - createdEntryIds.length;
    const firstFailureMessage =
      creationResults.find(
        (result) => result.entryId === null && Boolean(result.errorMessage)
      )?.errorMessage ?? null;
    const lowConfidenceCount = included.filter(
      (wine) =>
        typeof wine.confidence === "number" &&
        Number.isFinite(wine.confidence) &&
        wine.confidence < OTHER_BOTTLES_CONFIDENCE_THRESHOLD
    ).length;
    const uncertainSourceCount = sourceFiles.filter((_file, photoIndex) => {
      const analysis = getSourceAnalysis(photoIndex);
      if (!analysis) {
        return true;
      }
      return (
        analysis.analysisFailed ||
        analysis.contextTag === "unknown" ||
        (isPeoplePlaceOrPairingTag(analysis.contextTag) &&
          (analysis.contextConfidence === null ||
            analysis.contextConfidence <
              NON_BOTTLE_INTENT_CONFIDENCE_THRESHOLD))
      );
    }).length;
    const uncertaintyNotes: string[] = [];
    if (lowConfidenceCount > 0) {
      uncertaintyNotes.push(
        `${lowConfidenceCount} bottle${
          lowConfidenceCount === 1 ? "" : "s"
        } had low confidence`
      );
    }
    if (uncertainSourceCount > 0) {
      uncertaintyNotes.push(
        `${uncertainSourceCount} source photo${
          uncertainSourceCount === 1 ? "" : "s"
        } had uncertain auto-tagging`
      );
    }
    const uncertaintySuffix =
      uncertaintyNotes.length > 0 ? ` Flagged uncertainty: ${uncertaintyNotes.join(" • ")}.` : "";
    if (createdEntryIds.length > 0) {
      const anchorResult = successfulCreationResults[0] ?? null;
      let groupedPostErrorMessage: string | null = null;
      if (anchorResult) {
        const wineSlidesBySourceIndex = new Map<
          number,
          Array<{
            entry_id: string;
            photo_type: "label";
            path: string;
          }>
        >();
        successfulCreationResults.forEach((result) => {
          const current = wineSlidesBySourceIndex.get(result.photoIndex) ?? [];
          current.push({
            entry_id: result.entryId,
            photo_type: "label",
            path: result.labelPath,
          });
          wineSlidesBySourceIndex.set(result.photoIndex, current);
        });

        const contextUploadsByFile = new WeakMap<
          File,
          Partial<Record<UploadPhotoType, string>>
        >();
        anchorResult.contextUploads.forEach((upload) => {
          const current = contextUploadsByFile.get(upload.sourceFile) ?? {};
          current[upload.type] = upload.path;
          contextUploadsByFile.set(upload.sourceFile, current);
        });

        const groupedSlides: Array<{
          entry_id: string | null;
          photo_type: UploadPhotoType;
          path: string;
        }> = [];

        uploadGalleryItems.forEach((item) => {
          const wineSlides = wineSlidesBySourceIndex.get(item.sourceIndex) ?? [];
          groupedSlides.push(...wineSlides);

          const sourceFile = sourceFiles[item.sourceIndex];
          const contextPaths = sourceFile
            ? contextUploadsByFile.get(sourceFile) ?? {}
            : {};
          const contextPath = sourceFile ? contextPaths[item.resolvedType] ?? null : null;
          const shouldIncludeContextSlide =
            item.resolvedType === "place" ||
            item.resolvedType === "pairing" ||
            item.resolvedType === "people" ||
            ((item.resolvedType === "lineup" || item.resolvedType === "other_bottles") &&
              wineSlides.length === 0);

          if (contextPath && shouldIncludeContextSlide) {
            groupedSlides.push({
              entry_id: null,
              photo_type: item.resolvedType,
              path: contextPath,
            });
          }
        });

        if (groupedSlides.length > 0) {
          const groupResponse = await fetch("/api/entries/bulk-group", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              anchor_entry_id: anchorResult.entryId,
              entry_ids: createdEntryIds,
              mode: bulkEntryMode,
              title: normalizedBulkTitle,
              slides: groupedSlides,
            }),
          });

          if (!groupResponse.ok) {
            const payload = await groupResponse.json().catch(() => ({}));
            groupedPostErrorMessage =
              typeof payload.error === "string"
                ? payload.error
                : "Grouped post setup failed, but the individual entries were created.";
          }
        }
      }

      setAutofillStatus("success");
      setAutofillMessage(
        groupedPostErrorMessage
          ? `${groupedPostErrorMessage}${uncertaintySuffix} Opening guided review...`
          : rollbackFailureCount > 0
          ? `Created ${createdEntryIds.length} entr${
              createdEntryIds.length === 1 ? "y" : "ies"
            }. ${rollbackFailureCount} failed upload${
              rollbackFailureCount === 1 ? "" : "s"
            } could not be rolled back; review your entries list for partial records.${uncertaintySuffix} Opening guided review...`
          : failedCount > 0
          ? `Created ${createdEntryIds.length} entr${
              createdEntryIds.length === 1 ? "y" : "ies"
            }. ${failedCount} could not be created.${
              firstFailureMessage ? ` First issue: ${firstFailureMessage}` : ""
            }${uncertaintySuffix} Opening guided review...`
          : `Created ${createdEntryIds.length} entr${
              createdEntryIds.length === 1 ? "y" : "ies"
            }!${uncertaintySuffix} Opening guided review...`
      );
      const queue = encodeURIComponent(createdEntryIds.join(","));
      setTimeout(() => {
        router.push(
          `/entries/${anchorResult?.entryId ?? createdEntryIds[0]}/edit?bulk=1&queue=${queue}&index=0`
        );
      }, 900);
    } else {
      setAutofillStatus("error");
      setAutofillMessage(
        rollbackFailureCount > 0
          ? "Failed to create entries cleanly. Some failed uploads could not be rolled back; review your entries list and delete partial entries if needed."
          : firstFailureMessage
          ? `Failed to create entries. ${firstFailureMessage}`
          : "Failed to create entries. Try again."
      );
    }
  };

  const runAnalysis = async (files: File[]) => {
    if (files.length === 0) return;

    setAutofillStatus("loading");
    setLastScanConfidence(null);
    setAutofillMessage(
      files.length === 1
        ? "Extracting wine details. Please allow more time for larger lineups."
        : `Extracting wine details from ${files.length} photos. Please allow more time for larger lineups.`
    );
    resetAutotagState();

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

      // Advisory quick-count guardrail: use it for warnings and unresolved-bottle
      // messaging, but do not force single-bottle photos into lineup mode.
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

      const contextResults = await Promise.all(
        resized.map(async (resizedFile, photoIndex) => {
          if (!resizedFile) {
            return {
              photoIndex,
              tag: "unknown" as ContextPhotoTag,
              confidence: null as number | null,
            };
          }
          try {
            const classified = await classifyContextPhoto(
              resizedFile,
              controller.signal
            );
            return { photoIndex, ...classified };
          } catch {
            return {
              photoIndex,
              tag: "unknown" as ContextPhotoTag,
              confidence: null as number | null,
            };
          }
        })
      );
      const contextTagByPhotoIndex = new Map<
        number,
        { tag: ContextPhotoTag; confidence: number | null }
      >(
        contextResults.map((result) => [
          result.photoIndex,
          {
            tag: result.tag,
            confidence: result.confidence,
          },
        ])
      );

      const lineupResults = await Promise.allSettled(lineupFetches);

      clearTimeout(timeoutId);

      // Collect all wines from all lineup results, tracking source photo.
      const allWines: LineupWine[] = [];
      const detectedBottleCountByPhoto = files.map(() => 0);
      const identifiedBottleCountByPhoto = files.map(() => 0);
      const analysisFailedByPhoto = files.map(() => true);
      let detectedBottleCount = 0;
      for (let pi = 0; pi < lineupResults.length; pi++) {
        const classifiedContext = contextTagByPhotoIndex.get(pi) ?? null;
        if (
          classifiedContext &&
          isConfidentNonBottleIntentTag(
            classifiedContext.tag,
            classifiedContext.confidence
          )
        ) {
          analysisFailedByPhoto[pi] = false;
          continue;
        }

        const result = lineupResults[pi];
        if (result.status !== "fulfilled" || !result.value.ok) {
          continue;
        }

        analysisFailedByPhoto[pi] = false;
        const data = await result.value.json();
        const detectedForPhoto =
          typeof data.total_bottles_detected === "number" &&
          Number.isFinite(data.total_bottles_detected)
            ? Math.max(0, Math.round(data.total_bottles_detected))
            : 0;
        detectedBottleCountByPhoto[pi] = detectedForPhoto;
        detectedBottleCount += detectedForPhoto;
        const wines: LineupWine[] = (Array.isArray(data.wines)
          ? data.wines
          : []
        ).map((wine: LineupApiWine) => {
          const normalizedWine = {
            wine_name: normalizeLineupText(wine.wine_name),
            producer: normalizeLineupText(wine.producer),
            vintage: normalizeLineupText(wine.vintage),
            country: normalizeLineupText(wine.country),
            region: normalizeLineupText(wine.region),
            appellation: normalizeLineupText(wine.appellation),
            classification: normalizeLineupText(wine.classification),
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
            included: true,
            photoIndex: pi,
          };
        });

        const winesWithDetails = wines.filter((wine) => hasLineupWineDetails(wine));
        identifiedBottleCountByPhoto[pi] = winesWithDetails.length;
        allWines.push(...winesWithDetails);
      }

      const baseSourcePhotoAnalysis = files.map((_file, photoIndex) => {
        const detectedForPhoto = detectedBottleCountByPhoto[photoIndex] ?? 0;
        const identifiedForPhoto = identifiedBottleCountByPhoto[photoIndex] ?? 0;
        const role = resolveSourcePhotoRole({
          detectedBottleCount: detectedForPhoto,
          identifiedBottleCount: identifiedForPhoto,
        });
        return {
          photoIndex,
          role,
          detectedBottleCount: detectedForPhoto,
          identifiedBottleCount: identifiedForPhoto,
          analysisFailed: analysisFailedByPhoto[photoIndex] ?? true,
          contextTag: role === "individual" ? "other_bottles" : "unknown",
          contextConfidence: null,
        } satisfies SourcePhotoAnalysis;
      });

      const sourcePhotoAnalysis: SourcePhotoAnalysis[] =
        baseSourcePhotoAnalysis.map((analysis) => {
          const classifiedContext = contextTagByPhotoIndex.get(analysis.photoIndex);
          if (!classifiedContext) {
            return analysis;
          }

          let nextRole = analysis.role;
          if (isPeoplePlaceOrPairingTag(classifiedContext.tag)) {
            nextRole = "unknown";
          }

          let nextContextTag = classifiedContext.tag;
          if (
            nextRole === "individual" &&
            !isPeoplePlaceOrPairingTag(classifiedContext.tag)
          ) {
            nextContextTag = "other_bottles";
          }

          return {
            ...analysis,
            role: nextRole,
            contextTag: nextContextTag,
            contextConfidence: classifiedContext.confidence,
          };
        });
      setLineupSourceAnalysis(sourcePhotoAnalysis);

      const singlePhotoContext =
        files.length === 1 ? contextTagByPhotoIndex.get(0) ?? null : null;
      const shouldSkipSinglePhotoBottleExtraction = Boolean(
        singlePhotoContext &&
          isConfidentNonBottleIntentTag(
            singlePhotoContext.tag,
            singlePhotoContext.confidence
          )
      );
      const inferredBottleCount =
        detectedBottleCount > 0 ? detectedBottleCount : allWines.length;
      let guardrailCount: number | null = null;
      const needsCountGuardrail =
        files.length === 1 &&
        !shouldSkipSinglePhotoBottleExtraction &&
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
      let labelResult: Response | null = null;
      if (labelFetch) {
        try {
          labelResult = await labelFetch;
        } catch {
          labelResult = null;
        }
      }
      let normalizedLabelData: NormalizedLabelAutofillResult | null = null;
      if (labelResult?.ok) {
        const rawLabelData = (await labelResult.json()) as LabelAutofillResult;
        normalizedLabelData = {
          wine_name: normalizeLineupText(rawLabelData.wine_name),
          producer: normalizeLineupText(rawLabelData.producer),
          vintage: normalizeLineupText(rawLabelData.vintage),
          country: normalizeLineupText(rawLabelData.country),
          region: normalizeLineupText(rawLabelData.region),
          appellation: normalizeLineupText(rawLabelData.appellation),
          classification: normalizeLineupText(rawLabelData.classification),
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
      }

      const singleWine = allWines[0] ?? null;
      const hasMeaningfulLabelAutofill = Boolean(
        normalizedLabelData &&
          [
            normalizedLabelData.wine_name,
            normalizedLabelData.producer,
            normalizedLabelData.vintage,
            normalizedLabelData.country,
            normalizedLabelData.region,
            normalizedLabelData.appellation,
            normalizedLabelData.classification,
          ].some((value) => typeof value === "string" && value.trim().length > 0)
      );
      const singlePhotoDecision = resolveSinglePhotoEntryMode({
        identifiedBottleCount: allWines.length,
        detectedBottleCount: inferredBottleCount,
        guardrailBottleCount: guardrailCount,
        hasStrongSingleBottleEvidence:
          hasMeaningfulLabelAutofill ||
          hasDominantSingleBottleFrame(singleWine?.bottle_bbox ?? null),
      });
      const effectiveBottleCount = singlePhotoDecision.effectiveBottleCount;
      const likelyLineup = allWines.length > 1 || singlePhotoDecision.likelyLineup;
      const isSingleBottle = !likelyLineup && allWines.length <= 1;
      const possibleExtraBottleSuffix =
        singlePhotoDecision.guardrailSuggestsAdditionalBottles
          ? " Quick count thought there might be another bottle in frame, but only one wine was confidently identified. If this was a lineup, add a clearer photo and re-scan."
          : "";

      if (isSingleBottle) {
        clearLineupReviewState();
        if (shouldSkipSinglePhotoBottleExtraction) {
          setAutofillStatus("success");
          setLastScanConfidence(singlePhotoContext?.confidence ?? null);
          const contextLabel =
            singlePhotoContext?.tag === "people" ||
            singlePhotoContext?.tag === "place" ||
            singlePhotoContext?.tag === "pairing"
              ? singlePhotoContext.tag
              : "place";
          setAutofillMessage(
            `Detected ${contextLabel} intent. Skipped bottle scan for this photo; switch photo type manually if this should be a bottle entry.`
          );
          return;
        }
        // Single photo with single bottle — prefer label-autofill (richer fields),
        // then fall back to lineup if needed.
        if (normalizedLabelData) {
          await applyAutofill(normalizedLabelData);
          setAutofillStatus("success");
          setLastScanConfidence(normalizedLabelData.confidence);
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
            (
              [confidenceLabel, warningLabel]
                .filter(Boolean)
                .join(" • ") || "Autofill complete. Review the details."
            ) + possibleExtraBottleSuffix
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
          setLastScanConfidence(
            typeof wine.confidence === "number" && Number.isFinite(wine.confidence)
              ? wine.confidence
              : null
          );
          const confidenceLabel =
            typeof wine.confidence === "number"
              ? `Confidence ${Math.round(wine.confidence * 100)}%`
              : null;
          setAutofillMessage(
            (confidenceLabel ?? "Autofill complete. Review the details.") +
              possibleExtraBottleSuffix
          );
        } else if (labelResult && !labelResult.ok) {
          setLastScanConfidence(null);
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
          setLastScanConfidence(null);
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
          const confidentNonBottleSourceCount = sourcePhotoAnalysis.filter(
            (analysis) =>
              isConfidentNonBottleIntentTag(
                analysis.contextTag,
                analysis.contextConfidence
              )
          ).length;
          if (confidentNonBottleSourceCount > 0) {
            setAutofillStatus("success");
            const contextConfidenceValues = sourcePhotoAnalysis
              .map((analysis) => analysis.contextConfidence)
              .filter(
                (value): value is number =>
                  typeof value === "number" && Number.isFinite(value)
              );
            setLastScanConfidence(
              contextConfidenceValues.length > 0
                ? contextConfidenceValues.reduce((sum, value) => sum + value, 0) /
                    contextConfidenceValues.length
                : null
            );
            setAutofillMessage(
              "Detected people/place/pairing intent in uploaded photos. Skipped bottle scan for those images; review tags and enter bottle details manually if needed."
            );
            return;
          }
          setAutofillStatus("error");
          setLastScanConfidence(null);
          setAutofillMessage("No bottles detected. Try clearer photos.");
          return;
        }
        setLineupWines(allWines);
        setAutofillStatus("success");
        const confidenceValues = [
          ...allWines.map((wine) =>
            typeof wine.confidence === "number" && Number.isFinite(wine.confidence)
              ? wine.confidence
              : null
          ),
          ...sourcePhotoAnalysis.map((analysis) => analysis.contextConfidence),
        ].filter(
          (value): value is number =>
            typeof value === "number" && Number.isFinite(value)
        );
        setLastScanConfidence(
          confidenceValues.length > 0
            ? confidenceValues.reduce((sum, value) => sum + value, 0) /
                confidenceValues.length
            : null
        );
        const photoLabel =
          files.length > 1
            ? ` across ${files.length} photos`
            : "";
        const identifiedCount = allWines.filter((wine) =>
          hasLineupWineDetails(wine)
        ).length;
        const lowConfidenceCount = allWines.filter(
          (wine) =>
            typeof wine.confidence === "number" &&
            Number.isFinite(wine.confidence) &&
            wine.confidence < OTHER_BOTTLES_CONFIDENCE_THRESHOLD
        ).length;
        const uncertainSourcePhotoCount = sourcePhotoAnalysis.filter(
          (analysis) =>
            analysis.analysisFailed ||
            analysis.contextTag === "unknown" ||
            (isPeoplePlaceOrPairingTag(analysis.contextTag) &&
              (analysis.contextConfidence === null ||
                analysis.contextConfidence <
                  NON_BOTTLE_INTENT_CONFIDENCE_THRESHOLD))
        ).length;
        const unresolvedCount = Math.max(0, effectiveBottleCount - identifiedCount);
        const uncertaintyNotes: string[] = [];
        if (lowConfidenceCount > 0) {
          uncertaintyNotes.push(
            `${lowConfidenceCount} bottle${
              lowConfidenceCount === 1 ? "" : "s"
            } have low confidence`
          );
        }
        if (uncertainSourcePhotoCount > 0) {
          uncertaintyNotes.push(
            `${uncertainSourcePhotoCount} source photo${
              uncertainSourcePhotoCount === 1 ? "" : "s"
            } had uncertain auto-tagging`
          );
        }
        const uncertaintySuffix =
          uncertaintyNotes.length > 0
            ? ` ${uncertaintyNotes.join(" • ")}.`
            : "";
        if (
          typeof guardrailCount === "number" &&
          guardrailCount > inferredBottleCount &&
          guardrailCount > 1
        ) {
          setAutofillMessage(
            `Detected ${guardrailCount} bottles in quick count${photoLabel}. Identified ${identifiedCount} label${identifiedCount === 1 ? "" : "s"}; add a clearer shot for missing bottles.${uncertaintySuffix}`
          );
        } else if (unresolvedCount > 0) {
          setAutofillMessage(
            `Detected ${effectiveBottleCount} bottles${photoLabel}. Identified ${identifiedCount} label${identifiedCount === 1 ? "" : "s"}; try a clearer photo to capture the rest.${uncertaintySuffix}`
          );
        } else {
          setAutofillMessage(
            `Detected ${allWines.length} bottle${allWines.length === 1 ? "" : "s"}${photoLabel}. Review and create entries below.${uncertaintySuffix}`
          );
        }
      }
    } catch (error) {
      clearTimeout(timeoutId);
      if (error instanceof Error && error.name === "AbortError") {
        setAutofillStatus("timeout");
        setLastScanConfidence(null);
        setAutofillMessage("Analysis timed out. Try again.");
        return;
      }
      setAutofillStatus("error");
      setLastScanConfidence(null);
      setAutofillMessage("Could not analyze the photos. Try again.");
    }
  };

  const newlyLoggedWinePreviewUrl = labelPhotos[0]?.preview ?? null;
  const showSingleBottleFields = lineupWines.length === 0 && !lineupCreating;
  const includedLineupWineCount = lineupWines.filter(
    (wine) => wine.included && hasLineupWineDetails(wine)
  ).length;
  const showBulkEventDetailsStep =
    bulkEntryMode === "event" && bulkEntryConfigStep === "event_details";
  const canAddLabelPhoto = labelPhotos.length < MAX_PHOTOS;
  const sourceAnalysisByPhotoIndex = useMemo(
    () =>
      new Map(lineupSourceAnalysis.map((analysis) => [analysis.photoIndex, analysis])),
    [lineupSourceAnalysis]
  );
  const resolvedPhotoTypeByIndex = buildResolvedPhotoTypeMap({
    photos: labelPhotos,
    sourceAnalysisByIndex: sourceAnalysisByPhotoIndex,
    resolveManualPhotoType: (photo) => photoTypeOverrides[photo.preview],
  });
  const collapsibleSectionClassName =
    "group rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface-muted)] p-4";
  const collapsibleSummaryClassName =
    "cursor-pointer list-none select-none text-base font-medium text-[var(--color-text-primary)] [&::-webkit-details-marker]:hidden before:mr-2 before:inline-block before:text-white before:transition-transform before:content-['▸'] group-open:before:rotate-90 sm:text-sm";
  const baseUploadGalleryItems = labelPhotos
    .map((photo, sourceIndex) => {
      const resolvedType =
        resolvedPhotoTypeByIndex.get(sourceIndex) ?? "other_bottles";
      return {
        id: photo.preview,
        sourceIndex,
        resolvedType,
        url: photo.preview,
        alt: `Upload preview ${sourceIndex + 1}`,
        badge: (
          <label className="relative block">
            <select
              value={resolvedType}
              className="max-w-[9rem] appearance-none rounded-full border border-[var(--color-border)] bg-black/45 py-0.5 pl-2 pr-5 text-[10px] font-medium text-[var(--color-text-secondary)] outline-none transition hover:border-white/20 focus:border-[var(--color-accent-primary)]/50"
              onClick={(event) => event.stopPropagation()}
              onMouseDown={(event) => event.stopPropagation()}
              onTouchStart={(event) => event.stopPropagation()}
              onChange={(event) => {
                const nextType = event.target.value as UploadPhotoType;
                setPhotoTypeOverrides((current) => ({
                  ...current,
                  [photo.preview]: nextType,
                }));
              }}
            >
              {PHOTO_TYPE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            <span className="pointer-events-none absolute right-1.5 top-1/2 -translate-y-1/2 text-[8px] text-[var(--color-text-tertiary)]">
              ▾
            </span>
          </label>
        ),
      };
    })
    .sort((a, b) => {
      const typeDiff =
        GALLERY_TYPE_PRIORITY[a.resolvedType] - GALLERY_TYPE_PRIORITY[b.resolvedType];
      if (typeDiff !== 0) {
        return typeDiff;
      }
      return a.sourceIndex - b.sourceIndex;
    });
  const uploadGalleryItems = baseUploadGalleryItems
    .map((item, defaultIndex) => ({
      ...item,
      defaultIndex,
      manualOrder: uploadOrderOverrides[item.id],
    }))
    .sort((a, b) => {
      const aManual = a.manualOrder;
      const bManual = b.manualOrder;
      const aHasManual = typeof aManual === "number";
      const bHasManual = typeof bManual === "number";
      if (aHasManual && bHasManual) {
        return aManual - bManual;
      }
      if (aHasManual) {
        return -1;
      }
      if (bHasManual) {
        return 1;
      }
      return a.defaultIndex - b.defaultIndex;
    });
  const moveUploadGalleryItemToIndex = (itemId: string, targetIndex: number) => {
    if (targetIndex < 0 || targetIndex >= uploadGalleryItems.length) {
      return;
    }
    const fromIndex = uploadGalleryItems.findIndex((item) => item.id === itemId);
    if (fromIndex < 0 || fromIndex === targetIndex) {
      return;
    }
    const reordered = [...uploadGalleryItems];
    const moved = reordered[fromIndex];
    if (!moved) {
      return;
    }
    reordered.splice(fromIndex, 1);
    reordered.splice(targetIndex, 0, moved);
    const nextOverrides: Record<string, number> = {};
    reordered.forEach((item, index) => {
      nextOverrides[item.id] = index;
    });
    setUploadOrderOverrides(nextOverrides);
  };
  const uploadGalleryItemsWithOrderControl = uploadGalleryItems.map((item, index) => ({
    ...item,
    topRightBadge:
      uploadGalleryItems.length > 1 ? (
        <label className="relative block">
          <select
            value={index}
            className="max-w-[4.5rem] appearance-none rounded-full border border-[var(--color-border-strong)] bg-black/55 py-0.5 pl-2 pr-5 text-[10px] font-semibold text-[var(--color-text-primary)] outline-none transition hover:border-[var(--color-border-strong)] focus:border-[var(--color-accent-primary)]/50"
            onClick={(event) => event.stopPropagation()}
            onMouseDown={(event) => event.stopPropagation()}
            onTouchStart={(event) => event.stopPropagation()}
            onChange={(event) => {
              moveUploadGalleryItemToIndex(item.id, Number(event.target.value));
            }}
            aria-label={`Set photo order for ${item.alt}`}
          >
            {uploadGalleryItems.map((_photo, optionIndex) => (
              <option key={optionIndex} value={optionIndex}>
                {toOrdinal(optionIndex + 1)}
              </option>
            ))}
          </select>
          <span className="pointer-events-none absolute right-1.5 top-1/2 -translate-y-1/2 text-[8px] text-[var(--color-text-tertiary)]">
            ▾
          </span>
        </label>
      ) : (
        toOrdinal(index + 1)
      ),
  }));
  const showProcessedGallery =
    uploadGalleryItems.length > 0 && autofillStatus !== "loading";
  const hasLowScanConfidence =
    typeof lastScanConfidence === "number" &&
    Number.isFinite(lastScanConfidence) &&
    lastScanConfidence < RESCAN_CONFIDENCE_THRESHOLD;
  const showRescanButton =
    labelPhotos.length > 0 &&
    autofillStatus !== "loading" &&
    (autofillStatus === "error" || autofillStatus === "timeout" || hasLowScanConfidence);

  return (
    <AppShell>
      <div className="px-6 py-6 text-[var(--color-text-primary)]">
      <div className="mx-auto w-full max-w-3xl space-y-8">
        <header className="space-y-2">
          <span className="text-xs uppercase tracking-[0.3em] text-[var(--color-accent-secondary)]/70">
            New entry
          </span>
          <h1 className="text-3xl font-semibold text-[var(--color-text-primary)]">
            Record a new pour.
          </h1>
          <p className="text-sm text-[var(--color-text-secondary)]">
            Capture the bottle, the place, and the people around it.
          </p>
        </header>

        <form
          noValidate
            className="space-y-6 rounded-3xl border border-[var(--color-border)] bg-[var(--color-surface-primary)]/10 p-8 shadow-[0_30px_80px_-40px_rgba(0,0,0,0.8)] backdrop-blur"
            onSubmit={onSubmit}
          >
            <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface-muted)] p-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0 space-y-1">
                  <label
                    className="block text-sm font-medium text-[var(--color-text-primary)]"
                    htmlFor="label-upload"
                  >
                    Upload images
                  </label>
                  <p className="text-xs text-[var(--color-text-tertiary)]">
                    upload photos of the wine and anything else from the night - pairing, people, place. we&apos;ll tag them
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  {showRescanButton ? (
                    <button
                      type="button"
                      className="rounded-full border border-[var(--color-border)] px-3 py-1.5 text-sm font-semibold uppercase tracking-[0.2em] text-[var(--color-text-primary)] transition hover:border-[var(--color-accent-secondary)]/60 hover:text-[var(--color-accent-secondary)] sm:text-xs"
                      onClick={() => {
                        if (labelPhotos.length > 0) {
                          runAnalysis(labelPhotos.map((photo) => photo.file));
                        }
                      }}
                    >
                      Re-scan
                    </button>
                  ) : null}
                  <button
                    type="button"
                    className="rounded-full border border-[var(--color-border)] px-3 py-1.5 text-sm font-semibold uppercase tracking-[0.2em] text-[var(--color-text-primary)] transition hover:border-[var(--color-accent-secondary)]/60 hover:text-[var(--color-accent-secondary)] disabled:cursor-not-allowed disabled:opacity-60 sm:text-xs"
                    onClick={() => labelInputRef.current?.click()}
                    disabled={!canAddLabelPhoto || autofillStatus === "loading"}
                  >
                    {labelPhotos.length > 0
                      ? "Add images"
                      : "Upload images"}
                  </button>
                </div>
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

              {showProcessedGallery ? (
                <div className="mt-4 space-y-2">
                  <p className="text-sm font-medium text-[var(--color-text-primary)]">Current photos</p>
                  <SwipePhotoGallery
                    items={uploadGalleryItemsWithOrderControl}
                    heightClassName="h-64 sm:h-80"
                    empty="No photos uploaded yet."
                    footer={(active, activeIndex) => {
                      const activePhotoIndex =
                        typeof active.id === "string"
                          ? labelPhotos.findIndex(
                              (photo) => photo.preview === active.id
                            )
                          : -1;
                      const activePhoto =
                        Number.isFinite(activePhotoIndex) && activePhotoIndex >= 0
                          ? labelPhotos[activePhotoIndex] ?? null
                          : null;
                      return (
                        <>
                          <span className="text-xs text-[var(--color-text-secondary)]">
                            {activeIndex + 1} of {uploadGalleryItems.length}
                          </span>
                          <div className="flex items-center gap-2">
                            {activePhoto ? (
                              <button
                                type="button"
                                className="rounded-full border border-[var(--color-border)] px-2 py-1 text-[10px] uppercase tracking-[0.12em] text-[var(--color-text-primary)] transition hover:border-[var(--color-accent-secondary)]/60 hover:text-[var(--color-accent-secondary)] disabled:cursor-not-allowed disabled:opacity-60"
                                onClick={() => openCropEditor(activePhotoIndex)}
                                disabled={savingCrop || cropSourceLoading}
                              >
                                Crop
                              </button>
                            ) : null}
                            <button
                              type="button"
                              className="rounded-full border border-[var(--color-border)] px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--color-text-primary)] transition hover:border-rose-300 hover:text-rose-200"
                              onClick={() => {
                                if (activePhotoIndex >= 0) {
                                  removeLabelPhotoAtIndex(activePhotoIndex);
                                }
                              }}
                            >
                              Remove
                            </button>
                          </div>
                        </>
                      );
                    }}
                  />
                </div>
              ) : labelPhotos.length > 0 ? (
                <p className="mt-3 text-xs text-[var(--color-text-tertiary)]">
                  Photos uploaded. Waiting for AI processing to complete...
                </p>
              ) : null}

              {autofillMessage ? (
                autofillStatus === "loading" ? (
                  <div
                    className="mt-3 flex items-center gap-2 text-sm text-[var(--color-accent-secondary)]"
                    role="status"
                    aria-live="polite"
                  >
                    <div className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-[var(--color-accent-secondary)] border-t-transparent" />
                    <span>{autofillMessage}</span>
                  </div>
                ) : (
                  <p
                    className={`mt-3 text-sm ${
                      autofillStatus === "error" || autofillStatus === "timeout"
                        ? "text-rose-300"
                        : "text-emerald-300"
                    }`}
                    role="status"
                    aria-live="polite"
                  >
                    {autofillMessage}
                  </p>
                )
              ) : null}

              {/* Lineup review: shown when multiple bottles detected */}
              {lineupWines.length > 0 && !lineupCreating && lineupCreatedCount === 0 ? (
                <div className="mt-4 space-y-2">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--color-text-tertiary)]">
                      Lineup preview
                    </p>
                    <button
                      type="button"
                      className="rounded-full border border-[var(--color-border)] px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-[var(--color-text-primary)] transition hover:border-[var(--color-border-strong)]"
                      onClick={() => {
                        resetAutotagState();
                        setAutofillStatus("idle");
                        setAutofillMessage(null);
                      }}
                    >
                      ← Back
                    </button>
                  </div>
                  <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface-muted)] p-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="space-y-1">
                        <p className="text-sm font-medium text-[var(--color-text-primary)]">
                          {showBulkEventDetailsStep
                            ? "Event details"
                            : "Group this bulk upload"}
                        </p>
                        <p className="text-xs text-[var(--color-text-tertiary)]">
                          {showBulkEventDetailsStep
                            ? "These shared details will be copied to every wine in the event before review starts."
                            : "Each wine stays separate in your library, but Home and Feed will show one grouped post."}
                        </p>
                      </div>
                      <div className="group relative">
                        <button
                          type="button"
                          className="flex h-7 w-7 items-center justify-center rounded-full border border-[var(--color-border-strong)] bg-black/40 text-xs font-semibold text-[var(--color-text-primary)] transition hover:border-[var(--color-accent-secondary)]/60 hover:text-[var(--color-accent-secondary)]"
                          aria-label="Explain Event and Catch-up"
                        >
                          i
                        </button>
                        <div className="pointer-events-none absolute right-0 top-9 z-20 hidden w-72 rounded-2xl border border-[var(--color-border)] bg-[#181311] p-3 text-left text-xs text-[var(--color-text-secondary)] shadow-2xl group-hover:block">
                          <p className="font-semibold text-[var(--color-text-primary)]">Event</p>
                          <p className="mt-1">
                            Use this for one tasting, dinner, or wine event. Every wine in the group shares the same consumed date.
                          </p>
                          <p className="mt-3 font-semibold text-[var(--color-text-primary)]">Catch-up</p>
                          <p className="mt-1">
                            Use this when you are logging wines from different days after the fact. Each wine keeps its own consumed date.
                          </p>
                        </div>
                      </div>
                    </div>

                    <div className="mt-4 grid gap-4 md:grid-cols-[auto_minmax(0,1fr)]">
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--color-text-tertiary)]">
                          Mode
                        </p>
                        <div className="mt-2 inline-flex rounded-full border border-[var(--color-border)] bg-black/40 p-1">
                          {[
                            { value: "event", label: "Event" },
                            { value: "catch_up", label: "Catch-up" },
                          ].map((option) => (
                            <button
                              key={option.value}
                              type="button"
                              className={`rounded-full px-4 py-2 text-sm font-semibold transition ${
                                bulkEntryMode === option.value
                                  ? "bg-[var(--color-accent-primary)] text-[var(--color-text-on-accent)]"
                                  : "text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]"
                              }`}
                              onClick={() => {
                                setBulkEntryMode(option.value as EntryGroupMode);
                                setBulkEntryConfigStep("group");
                                setBulkEntryConfigError(null);
                              }}
                            >
                              {option.label}
                            </button>
                          ))}
                        </div>
                      </div>

                      {showBulkEventDetailsStep ? (
                        <div className="md:col-span-2 space-y-4">
                          <div>
                            <label className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--color-text-tertiary)]">
                              Event name
                            </label>
                            <input
                              type="text"
                              value={bulkEntryTitle}
                              onChange={(event) => {
                                setBulkEntryTitle(event.target.value);
                                if (bulkEntryConfigError) {
                                  setBulkEntryConfigError(null);
                                }
                              }}
                              placeholder="Stuytown tasting"
                              className={`mt-2 w-full rounded-xl border bg-[var(--color-surface-muted)] px-3 py-2 text-sm text-[var(--color-text-primary)] placeholder:text-[var(--color-text-tertiary)] focus:outline-none focus:ring-2 ${
                                bulkEntryConfigError
                                  ? "border-rose-400/50 focus:border-rose-300 focus:ring-rose-300/30"
                                  : "border-[var(--color-border)] focus:border-[var(--color-accent-primary)] focus:ring-[var(--color-accent-primary)]/30"
                              }`}
                            />
                            <p className="mt-2 text-xs text-[var(--color-text-tertiary)]">
                              This name becomes the grouped event title in Home and Feed.
                            </p>
                            {bulkEntryConfigError ? (
                              <p className="mt-2 text-xs text-rose-300">
                                {bulkEntryConfigError}
                              </p>
                            ) : null}
                          </div>

                          <div className="grid gap-4 md:grid-cols-2">
                            <div>
                              <label className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--color-text-tertiary)]">
                                Event location
                              </label>
                              <input type="hidden" {...register("location_place_id")} />
                              <div className="mt-2">
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
                            </div>
                            <div>
                              <label className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--color-text-tertiary)]">
                                Event date
                              </label>
                              <Controller
                                control={control}
                                name="consumed_at"
                                rules={{ required: true }}
                                render={({ field }) => (
                                  <DatePicker
                                    value={field.value}
                                    onChange={field.onChange}
                                    onBlur={field.onBlur}
                                    className="mt-2 w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-muted)] px-3 py-2 text-sm text-[var(--color-text-primary)] focus:border-[var(--color-accent-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-accent-primary)]/30"
                                    required
                                  />
                                )}
                              />
                            </div>
                          </div>

                          <div>
                            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--color-text-tertiary)]">
                              Tasted with
                            </p>
                            <p className="mt-2 text-xs text-[var(--color-text-tertiary)]">
                              These people will be tagged on every wine in the event.
                            </p>
                            {users.length === 0 ? (
                              <p className="mt-3 text-sm text-[var(--color-text-tertiary)]">
                                No other users yet.
                              </p>
                            ) : (() => {
                              const topFriends = users.slice(0, 5);
                              const topFriendIds = new Set(topFriends.map((u) => u.id));
                              const extraSelected = users.filter(
                                (u) =>
                                  selectedUserIds.includes(u.id) &&
                                  !topFriendIds.has(u.id)
                              );
                              const trimmedSearch = friendSearch.trim().toLowerCase();
                              const searchResults =
                                trimmedSearch.length >= 2
                                  ? users.filter(
                                      (u) =>
                                        !topFriendIds.has(u.id) &&
                                        !selectedUserIds.includes(u.id) &&
                                        ((u.display_name ?? "")
                                          .toLowerCase()
                                          .includes(trimmedSearch) ||
                                          (u.email ?? "")
                                            .toLowerCase()
                                            .includes(trimmedSearch))
                                    )
                                  : [];

                              const renderCheckbox = (user: (typeof users)[number]) => {
                                const label = user.display_name ?? "Unknown";
                                const isChecked = selectedUserIds.includes(user.id);
                                return (
                                  <label
                                    key={user.id}
                                    className="flex items-center gap-2 text-sm text-[var(--color-text-primary)]"
                                  >
                                    <input
                                      type="checkbox"
                                      className="h-4 w-4 rounded border-white/20 bg-black/40 text-[var(--color-accent-primary)]"
                                      checked={isChecked}
                                      onChange={(event) => {
                                        setSelectedUserIds((prev) =>
                                          event.target.checked
                                            ? [...prev, user.id]
                                            : prev.filter((id) => id !== user.id)
                                        );
                                      }}
                                    />
                                    <span>{label}</span>
                                  </label>
                                );
                              };

                              return (
                                <div className="mt-3 space-y-3">
                                  <div className="flex flex-wrap gap-2">
                                    {topFriends.map(renderCheckbox)}
                                    {extraSelected.map(renderCheckbox)}
                                  </div>
                                  <div>
                                    <input
                                      type="text"
                                      value={friendSearch}
                                      onChange={(event) =>
                                        setFriendSearch(event.target.value)
                                      }
                                      placeholder="Search friends"
                                      className="w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-muted)] px-3 py-2 text-sm text-[var(--color-text-primary)] placeholder:text-[var(--color-text-tertiary)] focus:border-[var(--color-accent-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-accent-primary)]/30"
                                    />
                                    {searchResults.length > 0 ? (
                                      <div className="mt-2 space-y-2 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-muted)] p-3">
                                        {searchResults.map((user) => (
                                          <button
                                            key={user.id}
                                            type="button"
                                            className="flex w-full items-center justify-between text-left text-sm text-[var(--color-text-primary)] transition hover:text-[var(--color-accent-secondary)]"
                                            onClick={() => {
                                              setSelectedUserIds((prev) => [
                                                ...prev,
                                                user.id,
                                              ]);
                                              setFriendSearch("");
                                            }}
                                          >
                                            <span>
                                              {user.display_name ?? user.email ?? "Unknown"}
                                            </span>
                                            <span className="text-xs text-[var(--color-text-tertiary)]">Add</span>
                                          </button>
                                        ))}
                                      </div>
                                    ) : null}
                                  </div>
                                </div>
                              );
                            })()}
                          </div>

                          <div className="flex flex-wrap gap-3">
                            <button
                              type="button"
                              className="rounded-full border border-[var(--color-border-strong)] px-4 py-2 text-sm font-semibold text-[var(--color-text-primary)] transition hover:border-[var(--color-border-strong)]"
                              onClick={() => {
                                setBulkEntryConfigStep("group");
                                setBulkEntryConfigError(null);
                              }}
                            >
                              Back
                            </button>
                            <button
                              type="button"
                              className="inline-flex items-center justify-center rounded-full bg-[var(--color-accent-primary)]/90 px-4 py-2 text-sm font-semibold text-[var(--color-text-on-accent)] transition hover:bg-[var(--color-accent-primary)] disabled:opacity-50"
                              disabled={includedLineupWineCount === 0}
                              onClick={createLineupEntries}
                            >
                              Create {includedLineupWineCount} entr
                              {includedLineupWineCount === 1 ? "y" : "ies"}
                            </button>
                          </div>
                        </div>
                      ) : bulkEntryMode === "event" ? (
                        <div className="md:col-span-2 rounded-xl border border-[var(--color-accent-secondary)]/20 bg-[var(--color-accent-primary)]/10 p-4">
                          <p className="text-sm font-medium text-[var(--color-text-primary)]">Event flow</p>
                          <p className="mt-2 text-sm text-[var(--color-text-secondary)]">
                            Next you’ll set the event name, location, date, and who you tasted
                            with once, then we’ll apply those details to every wine in the
                            event.
                          </p>
                          <button
                            type="button"
                            className="mt-4 inline-flex items-center justify-center rounded-full bg-[var(--color-accent-primary)]/90 px-4 py-2 text-sm font-semibold text-[var(--color-text-on-accent)] transition hover:bg-[var(--color-accent-primary)]"
                            onClick={() => {
                              setBulkEntryConfigStep("event_details");
                              setBulkEntryConfigError(null);
                            }}
                          >
                            Continue to event details
                          </button>
                        </div>
                      ) : (
                        <div>
                          <label className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--color-text-tertiary)]">
                            Group title
                          </label>
                          <input
                            type="text"
                            value={bulkEntryTitle}
                            onChange={(event) => {
                              setBulkEntryTitle(event.target.value);
                              if (bulkEntryConfigError) {
                                setBulkEntryConfigError(null);
                              }
                            }}
                            placeholder="Past 2 weeks"
                            className={`mt-2 w-full rounded-xl border bg-[var(--color-surface-muted)] px-3 py-2 text-sm text-[var(--color-text-primary)] placeholder:text-[var(--color-text-tertiary)] focus:outline-none focus:ring-2 ${
                              bulkEntryConfigError
                                ? "border-rose-400/50 focus:border-rose-300 focus:ring-rose-300/30"
                                : "border-[var(--color-border)] focus:border-[var(--color-accent-primary)] focus:ring-[var(--color-accent-primary)]/30"
                            }`}
                          />
                          <p className="mt-2 text-xs text-[var(--color-text-tertiary)]">
                            This title will be shown on the grouped post in Home and Feed.
                          </p>
                          {bulkEntryConfigError ? (
                            <p className="mt-2 text-xs text-rose-300">
                              {bulkEntryConfigError}
                            </p>
                          ) : null}
                        </div>
                      )}
                    </div>
                  </div>
                  {lineupWines.map((wine, index) => (
                    <div
                      key={index}
                      className={`flex items-start gap-3 rounded-xl border p-3 transition ${
                        wine.included
                          ? "border-[var(--color-border)] bg-[var(--color-surface-muted)]"
                          : "border-white/5 bg-black/10 opacity-50"
                      }`}
                    >
                      <button
                        type="button"
                        className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded border text-xs transition ${
                          wine.included
                            ? "border-[var(--color-accent-primary)] bg-[var(--color-accent-primary)]/20 text-[var(--color-accent-secondary)]"
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
                        <p className="text-sm font-medium text-[var(--color-text-primary)] break-words">
                          {wine.wine_name || "Unknown wine"}
                        </p>
                        <p className="text-xs text-[var(--color-text-tertiary)] break-words">
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
                          <p className="mt-0.5 text-xs text-[var(--color-text-tertiary)]">
                            Confidence: {Math.round(wine.confidence * 100)}%
                          </p>
                        ) : null}
                      </div>
                    </div>
                  ))}

                  {bulkEntryMode === "catch_up" ? (
                    <button
                      type="button"
                      className="mt-3 inline-flex w-full items-center justify-center rounded-full bg-[var(--color-accent-primary)]/90 px-4 py-2.5 text-sm font-semibold text-[var(--color-text-on-accent)] transition hover:bg-[var(--color-accent-primary)] disabled:opacity-50"
                      disabled={includedLineupWineCount === 0}
                      onClick={createLineupEntries}
                    >
                      Create {includedLineupWineCount} entr
                      {includedLineupWineCount === 1 ? "y" : "ies"}
                    </button>
                  ) : null}
                </div>
              ) : null}

              </div>

            {/* Hide single-bottle form fields when lineup mode is active */}
            {showSingleBottleFields ? (
              <>
                <div className="rounded-2xl border border-sky-300/20 bg-sky-950/20 p-4">
                  <div className="flex items-center justify-between gap-4">
                    <div className="space-y-1">
                      <label
                        htmlFor="drinking-now-toggle"
                        className="block text-sm font-medium text-[var(--color-text-primary)]"
                      >
                        Drinking Now
                      </label>
                      <p className="text-xs text-[var(--color-text-tertiary)]">
                        Friends see a light blue glow on Home and Feed for 2.5 hours after you
                        post this pour.
                      </p>
                    </div>
                    <Controller
                      control={control}
                      name="drinking_now"
                      render={({ field }) => (
                        <input
                          id="drinking-now-toggle"
                          type="checkbox"
                          checked={field.value === true}
                          onChange={(event) => field.onChange(event.target.checked)}
                          className="h-5 w-5 rounded border-white/20 bg-black/40 text-sky-300 focus:ring-2 focus:ring-sky-300/40"
                        />
                      )}
                    />
                  </div>
                </div>

                <div>
                  <label className="text-sm font-medium text-[var(--color-text-primary)]">Notes</label>
                  <textarea
                    className="mt-1 min-h-[120px] w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-muted)] px-3 py-2 text-sm text-[var(--color-text-primary)] placeholder:text-[var(--color-text-tertiary)] focus:border-[var(--color-accent-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-accent-primary)]/30"
                    {...register("notes")}
                  />
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <div>
                    <label className="text-sm font-medium text-[var(--color-text-primary)]">
                      Rating (1-100) <span className="text-rose-400">*</span>
                    </label>
                    <input
                      type="text"
                      inputMode="numeric"
                      className={`mt-1 w-full rounded-xl border bg-[var(--color-surface-muted)] px-3 py-2 text-sm text-[var(--color-text-primary)] focus:outline-none focus:ring-2 ${
                        errors.rating
                          ? "border-rose-400/50 focus:border-rose-300 focus:ring-rose-300/30"
                          : "border-[var(--color-border)] focus:border-[var(--color-accent-primary)] focus:ring-[var(--color-accent-primary)]/30"
                      }`}
                      {...register("rating", {
                        validate: (value) => {
                          const trimmed = value?.trim() ?? "";
                          if (!trimmed) return "Rating required.";
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
                      <p className="mt-1 text-xs text-[var(--color-text-tertiary)]">
                        Whole number between 1 and 100.
                      </p>
                    )}
                  </div>
                  <div>
                    <label className="text-sm font-medium text-[var(--color-text-primary)]">
                      QPR (Quality : Price Ratio)
                    </label>
                    <select
                      className="mt-1 w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-muted)] px-3 py-2 text-sm text-[var(--color-text-primary)] focus:border-[var(--color-accent-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-accent-primary)]/30"
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
                  <input type="hidden" {...register("price_paid")} />
                  <input type="hidden" {...register("price_paid_currency")} />
                  <input type="hidden" {...register("price_paid_source")} />
                </div>

                <details className={collapsibleSectionClassName}>
                  <summary className={collapsibleSummaryClassName}>
                    Wine details
                  </summary>
                  <p className="mt-2 text-xs text-[var(--color-text-tertiary)]">
                    Optional identity details for this bottle.
                  </p>
                  <div className="mt-4 grid gap-4 md:grid-cols-2">
                    <div>
                      <label className="text-sm font-medium text-[var(--color-text-primary)]">Wine name</label>
                      <input
                        className="mt-1 w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-muted)] px-3 py-2 text-sm text-[var(--color-text-primary)] placeholder:text-[var(--color-text-tertiary)] focus:border-[var(--color-accent-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-accent-primary)]/30"
                        {...register("wine_name")}
                      />
                      {errors.wine_name ? (
                        <p className="mt-1 text-xs text-rose-300">{errors.wine_name.message}</p>
                      ) : null}
                    </div>
                    <div>
                      <label className="text-sm font-medium text-[var(--color-text-primary)]">Producer</label>
                      <input
                        className="mt-1 w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-muted)] px-3 py-2 text-sm text-[var(--color-text-primary)] placeholder:text-[var(--color-text-tertiary)] focus:border-[var(--color-accent-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-accent-primary)]/30"
                        {...register("producer")}
                      />
                    </div>
                    <div>
                      <label className="text-sm font-medium text-[var(--color-text-primary)]">Vintage</label>
                      <input
                        className="mt-1 w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-muted)] px-3 py-2 text-sm text-[var(--color-text-primary)] placeholder:text-[var(--color-text-tertiary)] focus:border-[var(--color-accent-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-accent-primary)]/30"
                        {...register("vintage")}
                      />
                    </div>
                    <div>
                      <label className="text-sm font-medium text-[var(--color-text-primary)]">Country</label>
                      <input
                        className="mt-1 w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-muted)] px-3 py-2 text-sm text-[var(--color-text-primary)] placeholder:text-[var(--color-text-tertiary)] focus:border-[var(--color-accent-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-accent-primary)]/30"
                        {...register("country")}
                      />
                    </div>
                    <div>
                      <label className="text-sm font-medium text-[var(--color-text-primary)]">Region</label>
                      <input
                        className="mt-1 w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-muted)] px-3 py-2 text-sm text-[var(--color-text-primary)] placeholder:text-[var(--color-text-tertiary)] focus:border-[var(--color-accent-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-accent-primary)]/30"
                        {...register("region")}
                      />
                    </div>
                    <div>
                      <label className="text-sm font-medium text-[var(--color-text-primary)]">
                        Appellation
                      </label>
                      <input
                        className="mt-1 w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-muted)] px-3 py-2 text-sm text-[var(--color-text-primary)] placeholder:text-[var(--color-text-tertiary)] focus:border-[var(--color-accent-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-accent-primary)]/30"
                        {...register("appellation")}
                      />
                    </div>
                    <div>
                      <label className="text-sm font-medium text-[var(--color-text-primary)]">
                        Classification
                      </label>
                      <input
                        className="mt-1 w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-muted)] px-3 py-2 text-sm text-[var(--color-text-primary)] placeholder:text-[var(--color-text-tertiary)] focus:border-[var(--color-accent-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-accent-primary)]/30"
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
                  <p className="mt-2 text-xs text-[var(--color-text-tertiary)]">
                    Where and when this bottle was consumed.
                  </p>
                  <div className="mt-4 grid gap-4 md:grid-cols-2">
                    <div>
                      <label className="text-sm font-medium text-[var(--color-text-primary)]">Location</label>
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
                      <label className="text-sm font-medium text-[var(--color-text-primary)]">
                        Consumed date
                      </label>
                      <Controller
                        control={control}
                        name="consumed_at"
                        rules={{ required: true }}
                        render={({ field }) => (
                          <DatePicker
                            value={field.value}
                            onChange={field.onChange}
                            onBlur={field.onBlur}
                            className="mt-1 w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-muted)] px-3 py-2 text-sm text-[var(--color-text-primary)] focus:border-[var(--color-accent-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-accent-primary)]/30"
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
                  <p className="mt-2 text-xs text-[var(--color-text-tertiary)]">
                    Tag friends who were with you.
                  </p>
                  {users.length === 0 ? (
                    <p className="mt-3 text-sm text-[var(--color-text-tertiary)]">No other users yet.</p>
                  ) : (() => {
                    const topFriends = users.slice(0, 5);
                    const topFriendIds = new Set(topFriends.map((u) => u.id));
                    const extraSelected = users.filter(
                      (u) => selectedUserIds.includes(u.id) && !topFriendIds.has(u.id)
                    );
                    const trimmedSearch = friendSearch.trim().toLowerCase();
                    const searchResults =
                      trimmedSearch.length >= 2
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
                        <label key={user.id} className="flex items-center gap-2 text-sm text-[var(--color-text-primary)]">
                          <input
                            type="checkbox"
                            className="h-4 w-4 rounded border-white/20 bg-black/40 text-[var(--color-accent-primary)]"
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
                        <div className="grid gap-2 rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface-muted)] p-3">
                          {topFriends.map(renderCheckbox)}
                          {extraSelected.map(renderCheckbox)}
                        </div>
                        <div className="relative">
                          <input
                            type="text"
                            value={friendSearch}
                            onChange={(e) => setFriendSearch(e.target.value)}
                            placeholder="Search friends..."
                            className="w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-muted)] px-3 py-2 text-sm text-[var(--color-text-primary)] placeholder:text-[var(--color-text-tertiary)] focus:border-[var(--color-accent-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-accent-primary)]/30"
                          />
                          {searchResults.length > 0 && (
                            <div className="absolute left-0 right-0 top-full z-20 mt-1 max-h-48 overflow-y-auto rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-raised)] p-1 shadow-xl">
                              {searchResults.map((user) => (
                                <button
                                  key={user.id}
                                  type="button"
                                  className="block w-full rounded-lg px-3 py-2 text-left text-sm text-[var(--color-text-primary)] transition hover:bg-[var(--color-surface-hover)]"
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
                  <p className="mt-2 text-xs text-[var(--color-text-tertiary)]">
                    Optional structure for deeper tasting notes.
                  </p>
                  <div className="mt-4 grid gap-4 md:grid-cols-2">
                    {ADVANCED_NOTE_FIELDS.map((field) => (
                      <div key={field.key}>
                        <label className="text-sm font-medium text-[var(--color-text-primary)]">
                          {field.label}
                        </label>
                        <select
                          className="mt-1 w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-muted)] px-3 py-2 text-sm text-[var(--color-text-primary)] focus:border-[var(--color-accent-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-accent-primary)]/30"
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
                  <p className="mt-2 text-xs text-[var(--color-text-tertiary)]">
                    Set who can view the post, view/react to reactions, and view/comment
                    on comments.
                  </p>
                  <div className="mt-4 grid gap-4 md:grid-cols-3">
                    <div>
                      <div className="flex items-center justify-between gap-2">
                        <label className="text-sm font-medium text-[var(--color-text-primary)]">
                          Post visibility
                        </label>
                        <PrivacyBadge level={selectedEntryPrivacy} compact />
                      </div>
                      <select
                        className="mt-1 w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-muted)] px-3 py-2 text-sm text-[var(--color-text-primary)] focus:border-[var(--color-accent-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-accent-primary)]/30"
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
                        <label className="text-sm font-medium text-[var(--color-text-primary)]">Reactions</label>
                        <PrivacyBadge level={selectedReactionPrivacy} compact />
                      </div>
                      <select
                        className="mt-1 w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-muted)] px-3 py-2 text-sm text-[var(--color-text-primary)] focus:border-[var(--color-accent-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-accent-primary)]/30"
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
                        <label className="text-sm font-medium text-[var(--color-text-primary)]">Comments</label>
                        <PrivacyBadge level={selectedCommentsPrivacy} compact />
                      </div>
                      <select
                        className="mt-1 w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-muted)] px-3 py-2 text-sm text-[var(--color-text-primary)] focus:border-[var(--color-accent-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-accent-primary)]/30"
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
                  <p className="mt-2 text-xs text-[var(--color-text-tertiary)]">
                    Privacy on reactions/comments controls both visibility and participation.
                  </p>
                </details>

                {errorMessage ? (
                  <p className="text-sm text-rose-300">{errorMessage}</p>
                ) : null}

                <div className="flex items-center gap-3">
                  <button
                    type="submit"
                    className="rounded-full bg-[var(--color-accent-primary)] px-5 py-2 text-base font-semibold text-[var(--color-text-on-accent)] transition hover:bg-[var(--color-accent-primary)] disabled:cursor-not-allowed disabled:opacity-70 sm:text-sm"
                    disabled={isSubmitting}
                  >
                    Save entry
                  </button>
                  <button
                    type="button"
                    className="text-base font-medium text-[var(--color-text-secondary)] sm:text-sm"
                    onClick={returnAfterCancel}
                  >
                    Cancel
                  </button>
                </div>
          </>
          ) : null}
        </form>
      </div>

      {cropPhotoIndex !== null ? (
        <div className="fixed inset-0 z-50">
          <button
            type="button"
            aria-label="Close crop editor"
            className="absolute inset-0 bg-black/70"
            onClick={closeCropEditor}
            disabled={savingCrop}
          />
          <div className="relative h-full overflow-y-auto p-3 pt-4 sm:flex sm:items-center sm:justify-center sm:p-4">
            <div className="relative z-10 mx-auto max-h-[calc(100dvh-1.5rem)] w-full max-w-2xl overflow-y-auto rounded-2xl border border-[var(--color-border-strong)] bg-[#161412] p-5 shadow-[0_30px_80px_-40px_rgba(0,0,0,0.9)]">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs uppercase tracking-[0.2em] text-[var(--color-accent-secondary)]/70">
                    Photo crop
                  </p>
                  <h3 className="mt-1 text-lg font-semibold text-[var(--color-text-primary)]">
                    Adjust photo framing
                  </h3>
                  <p className="mt-1 text-sm text-[var(--color-text-tertiary)]">
                    This rewrites the uploaded image. Drag to frame it, then save.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={closeCropEditor}
                  disabled={savingCrop}
                  className="rounded-full border border-[var(--color-border)] px-3 py-1 text-xs font-semibold text-[var(--color-text-secondary)] transition hover:border-[var(--color-border-strong)] disabled:opacity-60"
                >
                  Close
                </button>
              </div>

              <div className="mt-4 overflow-hidden rounded-xl border border-[var(--color-border)] bg-black/40">
                <div
                  ref={cropFrameRef}
                  className="relative mx-auto aspect-square w-full max-w-[28rem] overflow-hidden bg-black/50"
                >
                  {cropSourceLoading ? (
                    <div className="flex h-full w-full items-center justify-center gap-2 text-sm text-[var(--color-accent-secondary)]">
                      <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-[var(--color-accent-secondary)] border-t-transparent" />
                      <span>Loading photo...</span>
                    </div>
                  ) : cropSourceUrl ? (
                    <AppImage
                      src={cropSourceUrl}
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
                    <div className="flex h-full w-full items-center justify-center text-sm text-[var(--color-text-tertiary)]">
                      Photo unavailable
                    </div>
                  )}
                </div>
              </div>

              <div className="mt-4 space-y-3">
                <div className="hidden sm:block">
                  <div className="mb-1 flex items-center justify-between text-xs text-[var(--color-text-tertiary)]">
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
                    className="w-full accent-[var(--color-accent-primary)]"
                  />
                </div>
                <p className="hidden text-xs text-[var(--color-text-tertiary)] sm:block">
                  At 1.00x the full image fits. Zoom in and drag to frame the crop.
                </p>
                <p className="text-xs text-[var(--color-text-tertiary)] sm:hidden">
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
                  className="rounded-full border border-[var(--color-border)] px-4 py-2 text-xs font-semibold text-[var(--color-text-secondary)] transition hover:border-[var(--color-border-strong)] disabled:opacity-60"
                >
                  Reset
                </button>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={closeCropEditor}
                    disabled={savingCrop}
                    className="rounded-full border border-[var(--color-border)] px-4 py-2 text-xs font-semibold text-[var(--color-text-secondary)] transition hover:border-[var(--color-border-strong)] disabled:opacity-60"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={saveCrop}
                    disabled={savingCrop || cropSourceLoading || !cropSourceUrl}
                    className="rounded-full bg-[var(--color-accent-primary)] px-4 py-2 text-xs font-semibold text-[var(--color-text-on-accent)] transition hover:bg-[var(--color-accent-primary)] disabled:opacity-60"
                  >
                    {savingCrop ? "Saving..." : "Save crop"}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      <EntryPostSaveSurveyModal
        key={pendingPostSaveSurvey?.entry.id ?? "post-save-survey-closed"}
        isOpen={Boolean(pendingPostSaveSurvey && pendingPostSaveSurvey.step === "survey")}
        entry={pendingPostSaveSurvey?.entry ?? null}
        errorMessage={postSaveSurveyErrorMessage}
        isSubmitting={isSubmittingPostSaveSurvey}
        submitLabel="Save and continue"
        onSubmit={submitPostSaveSurvey}
      />
      <EntryWineComparisonModal
        key={`${pendingPostSaveSurvey?.entry.id ?? "post-save-comparison-closed"}:${pendingPostSaveSurvey?.step ?? "survey"}`}
        isOpen={Boolean(
          pendingPostSaveSurvey &&
            pendingPostSaveSurvey.step === "comparison" &&
            pendingPostSaveSurvey.candidate
        )}
        entry={pendingPostSaveSurvey?.entry ?? null}
        candidate={pendingPostSaveSurvey?.candidate ?? null}
        newWineImageUrl={newlyLoggedWinePreviewUrl}
        errorMessage={postSaveSurveyErrorMessage}
        isSubmitting={isSubmittingPostSaveSurvey}
        onSelect={submitPostSaveComparison}
        onSkip={skipPostSaveComparison}
      />
      </div>
    </AppShell>
  );
}

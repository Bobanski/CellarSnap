import "server-only";
import { unstable_cache } from "next/cache";
import {
  QPR_LEVEL_LABELS,
  QPR_LEVEL_VALUES,
  normalizePrivacyLevel,
  type QprLevel,
} from "@shared";
import { getPublicProfileName } from "@/lib/publicProfiles";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

type ShareRow = {
  id: string;
  post_id: string;
  expires_at: string | null;
  mode: string | null;
};

type EntryRow = {
  id: string;
  user_id: string;
  entry_privacy: string | null;
  wine_name: string | null;
  producer: string | null;
  vintage: string | null;
  rating: number | null;
  notes: string | null;
  consumed_at: string;
  country: string | null;
  region: string | null;
  appellation: string | null;
  qpr_level: string | null;
  label_image_path: string | null;
  entry_group_id: string | null;
};

type PhotoPathRow = {
  path: string;
};

type PublicProfileRow = {
  display_name: string | null;
  username?: string | null;
  first_name?: string | null;
  last_name?: string | null;
  email?: string | null;
  name_display_preference?: "real_name" | "username" | null;
};

type PrimaryGrapeRow = {
  position: number;
  grape_varieties:
    | {
        name: string | null;
      }
    | {
        name: string | null;
      }[]
    | null;
};

export type PublicSharedPost = {
  shareId: string;
  postId: string;
  mode: string;
  expiresAt: string | null;
  authorName: string;
  wineName: string | null;
  producer: string | null;
  vintage: string | null;
  rating: number | null;
  notes: string | null;
  notePreview: string | null;
  consumedAt: string;
  country: string | null;
  region: string | null;
  appellation: string | null;
  primaryGrapes: string[];
  qprLabel: string | null;
  labelImageUrl: string | null;
  labelImageOgUrl: string | null;
  previewImageUrl: string | null;
  previewImageOgUrl: string | null;
  metadataTitle: string;
  metadataDescription: string;
};

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function normalizeText(value: string | null | undefined) {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.replace(/\s+/g, " ").trim();
  return normalized.length > 0 ? normalized : null;
}

function truncateClean(value: string, maxLength: number) {
  const clean = value.trim();
  if (clean.length <= maxLength) {
    return clean;
  }

  const slice = clean.slice(0, maxLength + 1);
  const breakIndex = slice.lastIndexOf(" ");
  const end = breakIndex > Math.floor(maxLength * 0.6) ? breakIndex : maxLength;
  return `${slice.slice(0, end).trimEnd()}…`;
}

function normalizeStoragePath(path: string | null | undefined) {
  const normalized = normalizeText(path);
  if (!normalized || normalized === "pending") {
    return null;
  }
  return normalized;
}

function normalizePrimaryGrape(
  variety: PrimaryGrapeRow["grape_varieties"]
): string | null {
  if (!variety) {
    return null;
  }

  if (Array.isArray(variety)) {
    return normalizeText(variety[0]?.name);
  }

  return normalizeText(variety.name);
}

function normalizeQprLabel(level: string | null | undefined) {
  if (
    level &&
    (QPR_LEVEL_VALUES as readonly string[]).includes(level)
  ) {
    return QPR_LEVEL_LABELS[level as QprLevel];
  }

  return null;
}

function buildMetadataTitle(entry: EntryRow) {
  const name = normalizeText(entry.wine_name) ?? "Untitled wine";
  const vintage = normalizeText(entry.vintage);

  return vintage
    ? `${name} (${vintage}) — Cluster`
    : `${name} — Cluster`;
}

function buildMetadataDescription(entry: EntryRow) {
  const note = normalizeText(entry.notes);
  const fragments: string[] = [];

  if (typeof entry.rating === "number") {
    fragments.push(`Rating ${entry.rating}/100`);
  }

  if (note) {
    fragments.push(note);
  } else {
    const location = [normalizeText(entry.region), normalizeText(entry.country)]
      .filter((value): value is string => Boolean(value))
      .join(", ");
    const producer = normalizeText(entry.producer);

    if (location) {
      fragments.push(location);
    }
    if (producer) {
      fragments.push(producer);
    }
  }

  if (fragments.length === 0) {
    fragments.push("Shared from Cluster.");
  }

  return truncateClean(fragments.join(" • "), 180);
}

async function createSignedImagePair(
  supabase: ReturnType<typeof createSupabaseAdminClient>,
  path: string | null,
  {
    resize,
  }: {
    resize: "contain" | "cover";
  }
) {
  if (!path) {
    return {
      defaultUrl: null,
      ogUrl: null,
    };
  }

  const [defaultSigned, ogSigned] = await Promise.all([
    supabase.storage
      .from("wine-photos")
      .createSignedUrl(path, 60 * 60 * 24 * 7),
    supabase.storage
      .from("wine-photos")
      .createSignedUrl(path, 60 * 60 * 24 * 7, {
        transform: {
          width: 640,
          height: 640,
          resize,
          format: "origin",
          quality: 90,
        },
      }),
  ]);

  const defaultUrl = defaultSigned.data?.signedUrl ?? null;
  const ogUrl = ogSigned.data?.signedUrl ?? defaultUrl;

  return {
    defaultUrl,
    ogUrl,
  };
}

async function resolvePublicPostShareUncached(
  shareId: string
): Promise<PublicSharedPost | null> {
  if (!UUID_PATTERN.test(shareId)) {
    return null;
  }

  const supabase = createSupabaseAdminClient();

  const { data: rawShare, error: shareError } = await supabase
    .from("post_shares")
    .select("id, post_id, expires_at, mode")
    .eq("id", shareId)
    .is("revoked_at", null)
    .maybeSingle();

  if (shareError || !rawShare) {
    return null;
  }

  const share = rawShare as ShareRow;
  if (share.expires_at) {
    const expiresAtMs = Date.parse(share.expires_at);
    if (!Number.isFinite(expiresAtMs) || expiresAtMs <= Date.now()) {
      return null;
    }
  }

  const { data: rawEntry, error: entryError } = await supabase
    .from("wine_entries")
    .select(
      "id, user_id, entry_privacy, wine_name, producer, vintage, rating, notes, consumed_at, country, region, appellation, qpr_level, label_image_path, entry_group_id"
    )
    .eq("id", share.post_id)
    .maybeSingle();

  if (entryError || !rawEntry) {
    return null;
  }

  const entry = rawEntry as EntryRow;
  if (normalizePrivacyLevel(entry.entry_privacy, "public") !== "public") {
    return null;
  }

  let labelPath = normalizeStoragePath(entry.label_image_path);

  const [
    { data: rawLabelPhoto },
    { data: rawFirstPhoto },
    { data: rawProfile },
    { data: rawGroupedPreviewPhoto },
  ] = await Promise.all([
    supabase
      .from("entry_photos")
      .select("path")
      .eq("entry_id", entry.id)
      .eq("type", "label")
      .order("position", { ascending: true })
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("entry_photos")
      .select("path")
      .eq("entry_id", entry.id)
      .order("position", { ascending: true })
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("public_profiles")
      .select(
        "display_name, username, first_name, last_name, email, name_display_preference"
      )
      .eq("id", entry.user_id)
      .maybeSingle(),
    entry.entry_group_id
      ? supabase
          .from("entry_group_slides")
          .select("path")
          .eq("group_id", entry.entry_group_id)
          .order("position", { ascending: true })
          .order("created_at", { ascending: true })
          .limit(1)
          .maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  if (rawLabelPhoto) {
    const labelPhoto = rawLabelPhoto as PhotoPathRow;
    labelPath = normalizeStoragePath(labelPhoto.path) ?? labelPath;
  }

  const groupedPreviewPath = rawGroupedPreviewPhoto
    ? normalizeStoragePath((rawGroupedPreviewPhoto as PhotoPathRow).path)
    : null;
  const firstPhotoPath = rawFirstPhoto
    ? normalizeStoragePath((rawFirstPhoto as PhotoPathRow).path)
    : null;
  const previewPath = groupedPreviewPath ?? firstPhotoPath ?? labelPath;
  const authorName = getPublicProfileName(
    (rawProfile ?? null) as PublicProfileRow | null,
    "Someone from Cluster"
  );

  let primaryGrapes: string[] = [];
  const { data: rawPrimaryGrapes, error: primaryGrapesError } = await supabase
    .from("entry_primary_grapes")
    .select("position, grape_varieties(name)")
    .eq("entry_id", entry.id)
    .order("position", { ascending: true });

  if (!primaryGrapesError && rawPrimaryGrapes) {
    const deduped = new Set<string>();
    (rawPrimaryGrapes as PrimaryGrapeRow[]).forEach((row) => {
      const name = normalizePrimaryGrape(row.grape_varieties);
      if (name) {
        deduped.add(name);
      }
    });
    primaryGrapes = Array.from(deduped);
  }

  const [
    { defaultUrl: labelImageUrl, ogUrl: labelImageOgUrl },
    { defaultUrl: previewImageUrl, ogUrl: previewImageOgUrl },
  ] = await Promise.all([
    createSignedImagePair(supabase, labelPath, { resize: "contain" }),
    createSignedImagePair(supabase, previewPath, { resize: "cover" }),
  ]);

  const normalizedNotes = normalizeText(entry.notes);

  return {
    shareId: share.id,
    postId: share.post_id,
    mode: share.mode ?? "unlisted",
    expiresAt: share.expires_at,
    authorName,
    wineName: entry.wine_name,
    producer: entry.producer,
    vintage: entry.vintage,
    rating: entry.rating,
    notes: entry.notes,
    notePreview: normalizedNotes ? truncateClean(normalizedNotes, 160) : null,
    consumedAt: entry.consumed_at,
    country: entry.country,
    region: entry.region,
    appellation: entry.appellation,
    primaryGrapes,
    qprLabel: normalizeQprLabel(entry.qpr_level),
    labelImageUrl,
    labelImageOgUrl,
    previewImageUrl,
    previewImageOgUrl,
    metadataTitle: buildMetadataTitle(entry),
    metadataDescription: buildMetadataDescription(entry),
  };
}

const resolvePublicPostShareCached = unstable_cache(
  resolvePublicPostShareUncached,
  ["public-post-share"],
  {
    revalidate: 60,
  }
);

export async function resolvePublicPostShare(shareId: string) {
  return resolvePublicPostShareCached(shareId);
}

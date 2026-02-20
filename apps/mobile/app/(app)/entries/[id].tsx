import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Image,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import {
  QPR_LEVEL_LABELS,
  type QprLevel,
} from "@cellarsnap/shared";
import { AppTopBar } from "@/src/components/AppTopBar";
import { AppText } from "@/src/components/AppText";
import { supabase } from "@/src/lib/supabase";
import { useAuth } from "@/src/providers/AuthProvider";

type EntryPhotoType =
  | "label"
  | "place"
  | "people"
  | "pairing"
  | "lineup"
  | "other_bottles";

type EntryDetailRow = {
  id: string;
  user_id: string;
  wine_name: string | null;
  producer: string | null;
  vintage: string | null;
  country: string | null;
  region: string | null;
  appellation: string | null;
  classification: string | null;
  rating: number | null;
  price_paid: number | null;
  price_paid_currency: string | null;
  price_paid_source: "retail" | "restaurant" | null;
  qpr_level: QprLevel | null;
  notes: string | null;
  advanced_notes: Record<string, unknown> | null;
  location_text: string | null;
  location_place_id: string | null;
  consumed_at: string;
  tasted_with_user_ids: string[] | null;
  label_image_path: string | null;
  place_image_path: string | null;
  pairing_image_path: string | null;
  created_at: string;
};

type EntryPhotoRow = {
  id: string;
  entry_id: string;
  type: EntryPhotoType;
  path: string;
  position: number;
  created_at: string;
};

type EntryPrimaryGrapeRow = {
  entry_id: string;
  position: number;
  grape_varieties:
    | {
        id: string;
        name: string;
      }
    | {
        id: string;
        name: string;
      }[]
    | null;
};

type PrimaryGrape = {
  id: string;
  name: string;
  position: number;
};

type ProfileRow = {
  id: string;
  display_name: string | null;
  email: string | null;
  avatar_path?: string | null;
};

type EntryPhotoItem = {
  id: string;
  type: EntryPhotoType;
  url: string | null;
};

const PHOTO_TYPE_LABELS: Record<EntryPhotoType, string> = {
  label: "Label",
  place: "Place",
  people: "People",
  pairing: "Pairing",
  lineup: "Lineup",
  other_bottles: "Other bottle",
};

const ADVANCED_NOTE_FIELDS: Array<{ key: string; label: string }> = [
  { key: "acidity", label: "Acidity" },
  { key: "tannin", label: "Tannin" },
  { key: "alcohol", label: "Alcohol" },
  { key: "sweetness", label: "Sweetness" },
  { key: "body", label: "Body" },
];

const ADVANCED_NOTE_OPTIONS: Record<string, Record<string, string>> = {
  acidity: {
    low: "Low",
    medium_minus: "Medium-",
    medium: "Medium",
    medium_plus: "Medium+",
    high: "High",
  },
  tannin: {
    low: "Low",
    medium_minus: "Medium-",
    medium: "Medium",
    medium_plus: "Medium+",
    high: "High",
  },
  alcohol: {
    low: "Low",
    medium: "Medium",
    high: "High",
  },
  sweetness: {
    dry: "Dry",
    off_dry: "Off-Dry",
    medium_sweet: "Medium-Sweet",
    sweet: "Sweet",
  },
  body: {
    light: "Light",
    medium_minus: "Medium-",
    medium: "Medium",
    medium_plus: "Medium+",
    full: "Full",
  },
};

function formatConsumedDate(raw: string) {
  const dateOnly = raw.slice(0, 10);
  const date = new Date(`${dateOnly}T00:00:00`);
  if (Number.isNaN(date.getTime())) {
    return raw;
  }
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function getDisplayRating(rating: number | null): string | null {
  if (typeof rating !== "number" || Number.isNaN(rating)) {
    return null;
  }
  const normalized = Math.max(0, Math.min(100, Math.round(rating)));
  return `${normalized}/100`;
}

function buildLocationDisplayLabel(locationText: string): string {
  const normalized = locationText.trim();
  if (!normalized) {
    return normalized;
  }

  const parts = normalized
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);

  if (parts.length <= 1) {
    return normalized;
  }

  const name = parts[0];
  const city = parts.length >= 4 ? parts[parts.length - 3] : parts[1];
  if (!city || city.toLowerCase() === name.toLowerCase()) {
    return name;
  }

  return `${name}, ${city}`;
}

function buildGoogleMapsLocationUrl(locationText: string): string {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
    locationText
  )}`;
}

function isMissingAvatarColumn(message: string) {
  return message.includes("avatar_path") || message.includes("column");
}

function normalizeVariety(
  variety: EntryPrimaryGrapeRow["grape_varieties"]
): { id: string; name: string } | null {
  if (!variety) {
    return null;
  }
  if (Array.isArray(variety)) {
    return variety[0] ?? null;
  }
  return variety;
}

async function createSignedUrlMap(paths: string[]) {
  const uniquePaths = Array.from(
    new Set(paths.filter((path) => Boolean(path && path !== "pending")))
  );
  const map = new Map<string, string | null>();

  await Promise.all(
    uniquePaths.map(async (path) => {
      const { data, error } = await supabase.storage
        .from("wine-photos")
        .createSignedUrl(path, 60 * 60);
      map.set(path, error ? null : data.signedUrl);
    })
  );

  return map;
}

function getAdvancedNoteRows(value: unknown): Array<{ label: string; value: string }> {
  if (!value || typeof value !== "object") {
    return [];
  }

  const input = value as Record<string, unknown>;
  return ADVANCED_NOTE_FIELDS.reduce<Array<{ label: string; value: string }>>(
    (rows, field) => {
      const rawValue = input[field.key];
      if (typeof rawValue !== "string" || rawValue.trim().length === 0) {
        return rows;
      }
      const optionLabel = ADVANCED_NOTE_OPTIONS[field.key]?.[rawValue];
      const formattedValue =
        optionLabel ??
        rawValue
          .replace(/_/g, " ")
          .replace(/\b\w/g, (char) => char.toUpperCase());
      rows.push({ label: field.label, value: formattedValue });
      return rows;
    },
    []
  );
}

export default function EntryDetailScreen() {
  const params = useLocalSearchParams<{ id?: string | string[] }>();
  const { user } = useAuth();
  const entryId = Array.isArray(params.id) ? params.id[0] : params.id;
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [entry, setEntry] = useState<(EntryDetailRow & { primary_grapes: PrimaryGrape[] }) | null>(
    null
  );
  const [authorName, setAuthorName] = useState("Unknown");
  const [authorAvatarUrl, setAuthorAvatarUrl] = useState<string | null>(null);
  const [tastedWithNames, setTastedWithNames] = useState<string[]>([]);
  const [photos, setPhotos] = useState<EntryPhotoItem[]>([]);
  const [activePhotoIndex, setActivePhotoIndex] = useState(0);
  const [photoFrameWidth, setPhotoFrameWidth] = useState(0);
  const [advancedNotesOpen, setAdvancedNotesOpen] = useState(false);
  const galleryScrollRef = useRef<ScrollView | null>(null);

  const loadEntry = useCallback(async () => {
    if (!entryId) {
      setErrorMessage("Entry not found.");
      setLoading(false);
      return;
    }

    setLoading(true);
    setErrorMessage(null);

    const { data: entryData, error: entryError } = await supabase
      .from("wine_entries")
      .select(
        "id, user_id, wine_name, producer, vintage, country, region, appellation, classification, rating, price_paid, price_paid_currency, price_paid_source, qpr_level, notes, advanced_notes, location_text, location_place_id, consumed_at, tasted_with_user_ids, label_image_path, place_image_path, pairing_image_path, created_at"
      )
      .eq("id", entryId)
      .maybeSingle();

    if (entryError || !entryData) {
      setErrorMessage(entryError?.message ?? "Entry unavailable.");
      setLoading(false);
      return;
    }

    const nextEntry = entryData as EntryDetailRow;

    const [{ data: photoRows }, { data: grapeRows }] = await Promise.all([
      supabase
        .from("entry_photos")
        .select("id, entry_id, type, path, position, created_at")
        .eq("entry_id", entryId)
        .order("position", { ascending: true })
        .order("created_at", { ascending: true }),
      supabase
        .from("wine_entry_primary_grapes")
        .select("entry_id, position, grape_varieties(id, name)")
        .eq("entry_id", entryId)
        .order("position", { ascending: true }),
    ]);

    const primaryGrapes: PrimaryGrape[] = ((grapeRows ?? []) as EntryPrimaryGrapeRow[])
      .map((row) => {
        const variety = normalizeVariety(row.grape_varieties);
        if (!variety) {
          return null;
        }
        return {
          id: variety.id,
          name: variety.name,
          position: row.position,
        };
      })
      .filter((row): row is PrimaryGrape => Boolean(row));

    const profileIds = Array.from(
      new Set([nextEntry.user_id, ...(nextEntry.tasted_with_user_ids ?? [])])
    );

    const profileResponse = profileIds.length
      ? await supabase
          .from("profiles")
          .select("id, display_name, email, avatar_path")
          .in("id", profileIds)
      : { data: [] as ProfileRow[], error: null };

    let profileRows = (profileResponse.data ?? []) as ProfileRow[];
    if (profileResponse.error && isMissingAvatarColumn(profileResponse.error.message)) {
      const fallback = profileIds.length
        ? await supabase
            .from("profiles")
            .select("id, display_name, email")
            .in("id", profileIds)
        : { data: [] };
      profileRows = (fallback.data ?? []) as ProfileRow[];
    }

    const entryPhotoRows = (photoRows ?? []) as EntryPhotoRow[];
    const legacyPhotoTuples: Array<{ id: string; type: EntryPhotoType; path: string | null }> = [
      { id: "legacy-label", type: "label", path: nextEntry.label_image_path },
      { id: "legacy-place", type: "place", path: nextEntry.place_image_path },
      { id: "legacy-pairing", type: "pairing", path: nextEntry.pairing_image_path },
    ];

    const signedUrlMap = await createSignedUrlMap([
      ...entryPhotoRows.map((photo) => photo.path),
      ...legacyPhotoTuples
        .map((photo) => photo.path)
        .filter((path): path is string => Boolean(path)),
      ...profileRows
        .map((profile) => profile.avatar_path ?? null)
        .filter((path): path is string => Boolean(path)),
    ]);

    const nextPhotos: EntryPhotoItem[] =
      entryPhotoRows.length > 0
        ? entryPhotoRows.map((photo) => ({
            id: photo.id,
            type: photo.type,
            url: signedUrlMap.get(photo.path) ?? null,
          }))
        : legacyPhotoTuples
            .filter((photo) => Boolean(photo.path))
            .map((photo) => ({
              id: photo.id,
              type: photo.type,
              url: photo.path ? signedUrlMap.get(photo.path) ?? null : null,
            }));

    const profileMap = new Map(profileRows.map((row) => [row.id, row]));
    const authorProfile = profileMap.get(nextEntry.user_id);
    setAuthorName(
      authorProfile?.display_name?.trim() || authorProfile?.email?.trim() || "Unknown"
    );
    setAuthorAvatarUrl(
      authorProfile?.avatar_path
        ? signedUrlMap.get(authorProfile.avatar_path) ?? null
        : null
    );

    setTastedWithNames(
      (nextEntry.tasted_with_user_ids ?? []).map((id) => {
        const profile = profileMap.get(id);
        return profile?.display_name?.trim() || profile?.email?.trim() || "Unknown";
      })
    );
    setEntry({ ...nextEntry, primary_grapes: primaryGrapes });
    setPhotos(nextPhotos);
    setActivePhotoIndex(0);
    setAdvancedNotesOpen(false);
    if (galleryScrollRef.current) {
      galleryScrollRef.current.scrollTo({ x: 0, animated: false });
    }
    setLoading(false);
  }, [entryId]);

  useEffect(() => {
    void loadEntry();
  }, [loadEntry]);

  useEffect(() => {
    const maxIndex = Math.max(0, photos.length - 1);
    if (activePhotoIndex > maxIndex) {
      setActivePhotoIndex(maxIndex);
    }
  }, [activePhotoIndex, photos.length]);

  const isOwner = Boolean(user?.id && entry?.user_id === user.id);
  const hasMultiplePhotos = photos.length > 1;
  const activePhoto =
    photos[Math.max(0, Math.min(photos.length - 1, activePhotoIndex))] ?? null;
  const displayRating = getDisplayRating(entry?.rating ?? null);
  const advancedNoteRows = useMemo(
    () => getAdvancedNoteRows(entry?.advanced_notes),
    [entry?.advanced_notes]
  );
  const primaryGrapeDisplay =
    entry && entry.primary_grapes.length > 0
      ? [...entry.primary_grapes]
          .sort((a, b) => a.position - b.position)
          .map((grape) => grape.name)
          .join(", ")
      : null;
  const locationText = entry?.location_text?.trim() ?? "";
  const hasLocation = locationText.length > 0;
  const canOpenLocation = hasLocation && Boolean(entry?.location_place_id?.trim());
  const locationDisplayLabel = hasLocation
    ? buildLocationDisplayLabel(locationText)
    : "";

  const openLocation = async () => {
    if (!canOpenLocation) {
      return;
    }
    const url = buildGoogleMapsLocationUrl(locationText);
    const canOpen = await Linking.canOpenURL(url);
    if (canOpen) {
      await Linking.openURL(url);
    }
  };

  const scrollToPhotoIndex = (index: number, animated = true) => {
    if (!galleryScrollRef.current || photoFrameWidth <= 0) {
      return;
    }
    const maxIndex = Math.max(0, photos.length - 1);
    const nextIndex = Math.max(0, Math.min(maxIndex, index));
    setActivePhotoIndex(nextIndex);
    galleryScrollRef.current.scrollTo({
      x: nextIndex * photoFrameWidth,
      animated,
    });
  };

  const openAuthorProfile = () => {
    if (!entry) {
      return;
    }
    if (user?.id && entry.user_id === user.id) {
      router.push("/(app)/profile");
      return;
    }
    router.push(`/(app)/profile/${entry.user_id}`);
  };

  return (
    <View style={styles.screen}>
      <ScrollView contentContainerStyle={styles.content}>
        <AppTopBar activeHref="/(app)/entries" />

        <Pressable
          style={styles.backLink}
          onPress={() => {
            router.back();
          }}
        >
          <AppText style={styles.backLinkText}>{"\u2190"} Back</AppText>
        </Pressable>

        {loading ? (
          <View style={styles.loadingCard}>
            <ActivityIndicator color="#fbbf24" />
            <AppText style={styles.loadingText}>Loading entry...</AppText>
          </View>
        ) : errorMessage || !entry ? (
          <View style={styles.errorCard}>
            <AppText style={styles.errorText}>{errorMessage ?? "Entry unavailable."}</AppText>
          </View>
        ) : (
          <>
            <View style={styles.headerBlock}>
              <Pressable style={styles.authorRow} onPress={openAuthorProfile}>
                <View style={styles.authorAvatar}>
                  {authorAvatarUrl ? (
                    <Image source={{ uri: authorAvatarUrl }} style={styles.authorAvatarImage} />
                  ) : (
                    <AppText style={styles.authorAvatarFallback}>
                      {(authorName || "?")[0]?.toUpperCase() ?? "?"}
                    </AppText>
                  )}
                </View>
                <View style={styles.authorMeta}>
                  <AppText style={styles.authorName}>{authorName}</AppText>
                  <AppText style={styles.authorDate}>
                    {formatConsumedDate(entry.consumed_at)}
                  </AppText>
                </View>
              </Pressable>
              <AppText style={styles.eyebrow}>Cellar entry</AppText>
              <AppText style={styles.title}>
                {entry.wine_name?.trim() || "Untitled wine"}
              </AppText>
              <AppText style={styles.subtitle}>
                {entry.producer?.trim() || "Unknown producer"}
              </AppText>
            </View>

            <View
              style={styles.photoFrame}
              onLayout={(event) => {
                const width = event.nativeEvent.layout.width;
                if (width > 0 && Math.abs(width - photoFrameWidth) > 0.5) {
                  setPhotoFrameWidth(width);
                  if (galleryScrollRef.current && hasMultiplePhotos) {
                    galleryScrollRef.current.scrollTo({
                      x: activePhotoIndex * width,
                      animated: false,
                    });
                  }
                }
              }}
            >
              {activePhoto?.url ? (
                <>
                  {hasMultiplePhotos && photoFrameWidth > 0 ? (
                    <ScrollView
                      ref={(node) => {
                        galleryScrollRef.current = node;
                      }}
                      horizontal
                      pagingEnabled
                      bounces={false}
                      showsHorizontalScrollIndicator={false}
                      decelerationRate="fast"
                      onMomentumScrollEnd={(event) => {
                        if (photoFrameWidth <= 0) {
                          return;
                        }
                        const offsetX = event.nativeEvent.contentOffset.x;
                        const nextIndex = Math.round(offsetX / photoFrameWidth);
                        const maxIndex = Math.max(0, photos.length - 1);
                        const clampedIndex = Math.max(0, Math.min(maxIndex, nextIndex));
                        setActivePhotoIndex(clampedIndex);
                        const snappedX = clampedIndex * photoFrameWidth;
                        if (Math.abs(offsetX - snappedX) > 0.5 && galleryScrollRef.current) {
                          galleryScrollRef.current.scrollTo({
                            x: snappedX,
                            animated: false,
                          });
                        }
                      }}
                    >
                      {photos.map((photo, index) => (
                        <Image
                          key={`${photo.id}-${index}`}
                          source={{ uri: photo.url ?? undefined }}
                          style={[styles.photoSlide, { width: photoFrameWidth }]}
                          resizeMode="cover"
                        />
                      ))}
                    </ScrollView>
                  ) : (
                    <Image
                      source={{ uri: activePhoto.url }}
                      style={styles.photoStatic}
                      resizeMode="cover"
                    />
                  )}

                  <View style={styles.photoTypeChip}>
                    <AppText style={styles.photoTypeChipText}>
                      {PHOTO_TYPE_LABELS[activePhoto.type]}
                    </AppText>
                  </View>

                  {hasMultiplePhotos ? (
                    <View style={styles.photoDotRow}>
                      {photos.map((_, index) => (
                        <Pressable
                          key={`dot-${index}`}
                          onPress={() => scrollToPhotoIndex(index)}
                          hitSlop={6}
                          style={[
                            styles.photoDot,
                            index === activePhotoIndex ? styles.photoDotActive : null,
                          ]}
                        />
                      ))}
                    </View>
                  ) : null}
                </>
              ) : (
                <View style={styles.photoFallback}>
                  <AppText style={styles.photoFallbackText}>No photos uploaded.</AppText>
                </View>
              )}
            </View>

            <View style={styles.detailsCard}>
              <View style={styles.metaGrid}>
                <View style={styles.metaItem}>
                  <AppText style={styles.metaLabel}>Date consumed</AppText>
                  <AppText style={styles.metaValue}>
                    {formatConsumedDate(entry.consumed_at)}
                  </AppText>
                </View>

                {isOwner || hasLocation ? (
                  <View style={styles.metaItem}>
                    <AppText style={styles.metaLabel}>Location</AppText>
                    {hasLocation ? (
                      canOpenLocation ? (
                        <Pressable onPress={() => void openLocation()}>
                          <AppText style={styles.locationLinkText}>
                            {locationDisplayLabel}
                          </AppText>
                        </Pressable>
                      ) : (
                        <AppText style={styles.metaValue}>{locationDisplayLabel}</AppText>
                      )
                    ) : (
                      <AppText style={styles.metaValue}>Not set</AppText>
                    )}
                  </View>
                ) : null}

                {displayRating ? (
                  <View style={styles.metaItem}>
                    <AppText style={styles.metaLabel}>Rating</AppText>
                    <AppText style={styles.metaValue}>{displayRating}</AppText>
                  </View>
                ) : isOwner ? (
                  <View style={styles.metaItem}>
                    <AppText style={styles.metaLabel}>Rating</AppText>
                    <AppText style={styles.metaValue}>Not set</AppText>
                  </View>
                ) : null}

                {isOwner || entry.qpr_level ? (
                  <View style={styles.metaItem}>
                    <AppText style={styles.metaLabel}>QPR</AppText>
                    {entry.qpr_level ? (
                      <AppText
                        style={[
                          styles.qprTag,
                          styles[`qpr_${entry.qpr_level}` as keyof typeof styles],
                        ]}
                      >
                        {QPR_LEVEL_LABELS[entry.qpr_level]}
                      </AppText>
                    ) : (
                      <AppText style={styles.metaValue}>Not set</AppText>
                    )}
                  </View>
                ) : null}

                {isOwner || entry.country ? (
                  <View style={styles.metaItem}>
                    <AppText style={styles.metaLabel}>Country</AppText>
                    <AppText style={styles.metaValue}>{entry.country || "Not set"}</AppText>
                  </View>
                ) : null}

                {isOwner || entry.region ? (
                  <View style={styles.metaItem}>
                    <AppText style={styles.metaLabel}>Region</AppText>
                    <AppText style={styles.metaValue}>{entry.region || "Not set"}</AppText>
                  </View>
                ) : null}

                {isOwner || entry.appellation ? (
                  <View style={styles.metaItem}>
                    <AppText style={styles.metaLabel}>Appellation</AppText>
                    <AppText style={styles.metaValue}>{entry.appellation || "Not set"}</AppText>
                  </View>
                ) : null}

                {isOwner || entry.classification ? (
                  <View style={styles.metaItem}>
                    <AppText style={styles.metaLabel}>Classification</AppText>
                    <AppText style={styles.metaValue}>
                      {entry.classification || "Not set"}
                    </AppText>
                  </View>
                ) : null}

                {isOwner || primaryGrapeDisplay ? (
                  <View style={styles.metaItem}>
                    <AppText style={styles.metaLabel}>Primary grapes</AppText>
                    <AppText style={styles.metaValue}>
                      {primaryGrapeDisplay || "Not set"}
                    </AppText>
                  </View>
                ) : null}

                {isOwner || entry.vintage ? (
                  <View style={styles.metaItem}>
                    <AppText style={styles.metaLabel}>Vintage</AppText>
                    <AppText style={styles.metaValue}>{entry.vintage || "Not set"}</AppText>
                  </View>
                ) : null}

                {isOwner || Boolean(entry.notes) ? (
                  <View style={styles.metaItem}>
                    <AppText style={styles.metaLabel}>Notes</AppText>
                    <AppText style={styles.metaValue}>{entry.notes || "Not set"}</AppText>
                  </View>
                ) : null}

                {isOwner || tastedWithNames.length > 0 ? (
                  <View style={styles.metaItem}>
                    <AppText style={styles.metaLabel}>Tasted with</AppText>
                    <AppText style={styles.metaValue}>
                      {tastedWithNames.length > 0
                        ? tastedWithNames.join(", ")
                        : "No one listed"}
                    </AppText>
                  </View>
                ) : null}
              </View>

              {advancedNoteRows.length > 0 ? (
                <View style={styles.advancedNotesBlock}>
                  <Pressable
                    style={styles.advancedNotesToggle}
                    onPress={() => setAdvancedNotesOpen((current) => !current)}
                  >
                    <AppText style={styles.advancedNotesTitle}>Advanced notes</AppText>
                    <AppText style={styles.advancedNotesToggleText}>
                      {advancedNotesOpen ? "Hide" : "Show"}
                    </AppText>
                  </Pressable>
                  {advancedNotesOpen ? (
                    <View style={styles.metaGrid}>
                      {advancedNoteRows.map((row) => (
                        <View key={row.label} style={styles.metaItem}>
                          <AppText style={styles.metaLabel}>{row.label}</AppText>
                          <AppText style={styles.metaValue}>{row.value}</AppText>
                        </View>
                      ))}
                    </View>
                  ) : null}
                </View>
              ) : null}
            </View>
          </>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: "#0f0a09",
  },
  content: {
    paddingHorizontal: 18,
    paddingTop: 16,
    paddingBottom: 28,
    gap: 12,
  },
  backLink: {
    alignSelf: "flex-start",
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.14)",
    backgroundColor: "rgba(0,0,0,0.2)",
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  backLinkText: {
    color: "#d4d4d8",
    fontSize: 12,
    fontWeight: "700",
  },
  loadingCard: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    backgroundColor: "rgba(255,255,255,0.05)",
    paddingHorizontal: 16,
    paddingVertical: 18,
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  loadingText: {
    color: "#d4d4d8",
    fontSize: 13,
  },
  errorCard: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(251,113,133,0.35)",
    backgroundColor: "rgba(251,113,133,0.08)",
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  errorText: {
    color: "#fecdd3",
    fontSize: 13,
    lineHeight: 18,
  },
  headerBlock: {
    gap: 6,
  },
  authorRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  authorAvatar: {
    width: 34,
    height: 34,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.14)",
    backgroundColor: "rgba(0,0,0,0.28)",
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  authorAvatarImage: {
    width: "100%",
    height: "100%",
  },
  authorAvatarFallback: {
    color: "#a1a1aa",
    fontSize: 12,
    fontWeight: "700",
  },
  authorMeta: {
    flex: 1,
    gap: 2,
  },
  authorName: {
    color: "#f4f4f5",
    fontSize: 13,
    fontWeight: "700",
  },
  authorDate: {
    color: "#a1a1aa",
    fontSize: 11,
  },
  eyebrow: {
    color: "#fcd34d",
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 1.4,
    textTransform: "uppercase",
  },
  title: {
    color: "#fafafa",
    fontSize: 24,
    fontWeight: "700",
    lineHeight: 30,
  },
  subtitle: {
    color: "#d4d4d8",
    fontSize: 13,
    lineHeight: 18,
  },
  photoFrame: {
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    backgroundColor: "rgba(0,0,0,0.25)",
    overflow: "hidden",
    height: 320,
    position: "relative",
  },
  photoStatic: {
    width: "100%",
    height: "100%",
  },
  photoSlide: {
    height: "100%",
  },
  photoTypeChip: {
    position: "absolute",
    left: 10,
    top: 10,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.18)",
    backgroundColor: "rgba(0,0,0,0.55)",
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  photoTypeChipText: {
    color: "#f4f4f5",
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 0.4,
    textTransform: "uppercase",
  },
  photoDotRow: {
    position: "absolute",
    bottom: 10,
    left: 10,
    right: 10,
    flexDirection: "row",
    justifyContent: "center",
    gap: 6,
  },
  photoDot: {
    width: 7,
    height: 7,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.35)",
  },
  photoDotActive: {
    backgroundColor: "#fcd34d",
  },
  photoFallback: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(0,0,0,0.35)",
    paddingHorizontal: 20,
  },
  photoFallbackText: {
    color: "#71717a",
    fontSize: 12,
    textAlign: "center",
  },
  detailsCard: {
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    backgroundColor: "rgba(255,255,255,0.05)",
    padding: 14,
    gap: 12,
  },
  metaGrid: {
    gap: 10,
  },
  metaItem: {
    gap: 3,
  },
  metaLabel: {
    color: "#a1a1aa",
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 1.4,
    textTransform: "uppercase",
  },
  metaValue: {
    color: "#e4e4e7",
    fontSize: 13,
    lineHeight: 18,
  },
  qprTag: {
    alignSelf: "flex-start",
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 8,
    paddingVertical: 3,
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 0.5,
    textTransform: "uppercase",
  },
  qpr_extortion: {
    borderColor: "rgba(251,113,133,0.4)",
    backgroundColor: "rgba(251,113,133,0.1)",
    color: "#fecdd3",
  },
  qpr_pricey: {
    borderColor: "rgba(248,113,113,0.4)",
    backgroundColor: "rgba(248,113,113,0.1)",
    color: "#fecaca",
  },
  qpr_mid: {
    borderColor: "rgba(251,191,36,0.4)",
    backgroundColor: "rgba(251,191,36,0.1)",
    color: "#fde68a",
  },
  qpr_good_value: {
    borderColor: "rgba(74,222,128,0.4)",
    backgroundColor: "rgba(74,222,128,0.1)",
    color: "#bbf7d0",
  },
  qpr_absolute_steal: {
    borderColor: "rgba(34,197,94,0.4)",
    backgroundColor: "rgba(34,197,94,0.1)",
    color: "#86efac",
  },
  locationLinkText: {
    color: "#fde68a",
    fontSize: 13,
    fontWeight: "600",
    textDecorationLine: "underline",
  },
  advancedNotesBlock: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    backgroundColor: "rgba(0,0,0,0.22)",
    padding: 10,
    gap: 10,
  },
  advancedNotesToggle: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  advancedNotesTitle: {
    color: "#f4f4f5",
    fontSize: 13,
    fontWeight: "700",
  },
  advancedNotesToggleText: {
    color: "#a1a1aa",
    fontSize: 11,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.8,
  },
});

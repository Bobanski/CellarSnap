import { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import {
  COLLECTIONS_COPY,
  type UserCollectionItemSummary,
  type UserCollectionSummary,
} from "@cellarsnap/shared";
import { AppTopBar } from "@/src/components/AppTopBar";
import { AppText } from "@/src/components/AppText";
import { fetchCollectionDetail } from "@/src/lib/api/collections";
import { colors } from "@/src/lib/theme";
import { fonts } from "@/src/lib/typography";

function formatCollectionDate(value: string | null) {
  if (!value) {
    return "Unknown date";
  }

  const dateOnly = value.slice(0, 10);
  const parsed = new Date(`${dateOnly}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  return parsed.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function buildItemSubtitle(item: UserCollectionItemSummary) {
  return [item.producer, item.vintage].filter(Boolean).join(" · ");
}

function CollectionItemCard({ item }: { item: UserCollectionItemSummary }) {
  const previewImageUrl = item.preview_image_url ?? item.label_image_url ?? null;
  const subtitle = buildItemSubtitle(item);

  return (
    <Pressable
      style={styles.itemCard}
      onPress={() => router.push(`/(app)/entries/${item.entry_id}`)}
    >
      <View style={styles.itemImageFrame}>
        {previewImageUrl ? (
          <Image source={{ uri: previewImageUrl }} style={styles.itemImage} resizeMode="cover" />
        ) : (
          <AppText style={styles.itemImagePlaceholder}>No photo</AppText>
        )}
      </View>

      <View style={styles.itemCopy}>
        <AppText style={styles.itemTitle}>{item.wine_name?.trim() || "Untitled wine"}</AppText>
        {subtitle ? <AppText style={styles.itemSubtitle}>{subtitle}</AppText> : null}
        <AppText style={styles.itemMeta}>
          {item.consumed_at ? `Consumed ${formatCollectionDate(item.consumed_at)}` : "Saved to collection"}
        </AppText>
      </View>
    </Pressable>
  );
}

export default function CollectionDetailScreen() {
  const params = useLocalSearchParams<{ collectionId?: string | string[] }>();
  const collectionId = useMemo(() => {
    const raw = params.collectionId;
    return Array.isArray(raw) ? raw[0] : raw;
  }, [params.collectionId]);
  const [collection, setCollection] = useState<UserCollectionSummary | null>(null);
  const [items, setItems] = useState<UserCollectionItemSummary[]>([]);
  const [isLoading, setIsLoading] = useState(Boolean(collectionId));
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!collectionId) {
      return;
    }

    let cancelled = false;

    const load = async () => {
      setIsLoading(true);
      setErrorMessage(null);
      const result = await fetchCollectionDetail(collectionId);

      if (cancelled) {
        return;
      }

      if (!result.ok) {
        setErrorMessage(result.errorMessage);
        setIsLoading(false);
        return;
      }

      setCollection(result.collection);
      setItems(result.items);
      setIsLoading(false);
    };

    void load();

    return () => {
      cancelled = true;
    };
  }, [collectionId]);

  return (
    <View style={styles.screen}>
      <ScrollView contentContainerStyle={styles.content}>
        <AppTopBar />

        <View style={styles.header}>
          <AppText style={styles.eyebrow}>{COLLECTIONS_COPY.tabLabel}</AppText>
          <AppText style={styles.title}>{collection?.name ?? "Collection"}</AppText>
          {collection ? (
            <AppText style={styles.subtitle}>
              {collection.item_count} wine{collection.item_count === 1 ? "" : "s"}
            </AppText>
          ) : null}
        </View>

        {isLoading ? (
          <View style={styles.loadingCard}>
            <ActivityIndicator color={colors.grenache} />
          </View>
        ) : errorMessage || !collectionId ? (
          <View style={styles.messageCard}>
            <AppText style={styles.errorText}>{errorMessage ?? "Collection not found."}</AppText>
          </View>
        ) : collection ? (
          <>
            <View style={styles.heroCard}>
              <View style={styles.heroImageFrame}>
                {collection.cover_image_url ? (
                  <Image
                    source={{ uri: collection.cover_image_url }}
                    style={styles.heroImage}
                    resizeMode="cover"
                  />
                ) : (
                  <AppText style={styles.heroPlaceholder}>No cover selected yet</AppText>
                )}
              </View>
              <View style={styles.heroMetaRow}>
                <View style={styles.heroBadge}>
                  <AppText style={styles.heroBadgeText}>
                    {collection.item_count} wine{collection.item_count === 1 ? "" : "s"}
                  </AppText>
                </View>
                <AppText style={styles.heroDateText}>
                  Updated {formatCollectionDate(collection.updated_at)}
                </AppText>
              </View>
            </View>

            {items.length === 0 ? (
              <View style={styles.messageCard}>
                <AppText style={styles.emptyTitle}>{COLLECTIONS_COPY.detailEmptyTitle}</AppText>
                <AppText style={styles.emptySubtitle}>{COLLECTIONS_COPY.detailEmptySubtitle}</AppText>
              </View>
            ) : (
              <View style={styles.stack}>
                {items.map((item) => (
                  <CollectionItemCard key={item.id} item={item} />
                ))}
              </View>
            )}
          </>
        ) : null}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.screenBg,
  },
  content: {
    paddingHorizontal: 18,
    paddingTop: 16,
    paddingBottom: 28,
    gap: 12,
  },
  header: {
    gap: 6,
  },
  eyebrow: {
    color: colors.accentSecondary,
    fontSize: 9,
    fontWeight: "700",
    letterSpacing: 3,
    textTransform: "uppercase",
  },
  title: {
    color: colors.textPrimary,
    fontFamily: fonts.serif.light,
    fontSize: 30,
    lineHeight: 36,
  },
  subtitle: {
    color: colors.textSecondary,
    fontSize: 13,
    lineHeight: 18,
  },
  loadingCard: {
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfacePrimary,
    paddingVertical: 42,
    alignItems: "center",
    justifyContent: "center",
  },
  messageCard: {
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfacePrimary,
    paddingHorizontal: 16,
    paddingVertical: 18,
    gap: 6,
  },
  errorText: {
    color: colors.error,
    fontSize: 14,
    lineHeight: 20,
  },
  emptyTitle: {
    color: colors.textPrimary,
    fontFamily: fonts.serif.light,
    fontSize: 20,
    lineHeight: 26,
  },
  emptySubtitle: {
    color: colors.textSecondary,
    fontSize: 14,
    lineHeight: 20,
  },
  heroCard: {
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfacePrimary,
    padding: 14,
    gap: 12,
  },
  heroImageFrame: {
    aspectRatio: 1.15,
    borderRadius: 18,
    overflow: "hidden",
    backgroundColor: colors.surfaceTinted,
    alignItems: "center",
    justifyContent: "center",
  },
  heroImage: {
    width: "100%",
    height: "100%",
  },
  heroPlaceholder: {
    color: colors.textSecondary,
    fontSize: 13,
  },
  heroMetaRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 12,
  },
  heroBadge: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    backgroundColor: colors.surfaceTinted,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  heroBadgeText: {
    color: colors.accentSecondary,
    fontSize: 11,
    fontWeight: "700",
  },
  heroDateText: {
    color: colors.textSecondary,
    fontSize: 12,
  },
  stack: {
    gap: 10,
  },
  itemCard: {
    flexDirection: "row",
    gap: 14,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfacePrimary,
    padding: 14,
  },
  itemImageFrame: {
    width: 88,
    height: 88,
    borderRadius: 14,
    overflow: "hidden",
    backgroundColor: colors.surfaceTinted,
    alignItems: "center",
    justifyContent: "center",
  },
  itemImage: {
    width: "100%",
    height: "100%",
  },
  itemImagePlaceholder: {
    color: colors.textSecondary,
    fontSize: 11,
  },
  itemCopy: {
    flex: 1,
    minWidth: 0,
    justifyContent: "center",
    gap: 4,
  },
  itemTitle: {
    color: colors.textPrimary,
    fontFamily: fonts.serif.light,
    fontSize: 20,
    lineHeight: 25,
  },
  itemSubtitle: {
    color: colors.textSecondary,
    fontSize: 12,
    lineHeight: 16,
  },
  itemMeta: {
    color: colors.textTertiary,
    fontSize: 12,
    lineHeight: 16,
  },
});

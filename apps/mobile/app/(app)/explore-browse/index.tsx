import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from "react-native";
import { useRouter } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { toExploreSlug, WINE_REGIONS } from "@cellarsnap/shared";
import { AppText } from "@/src/components/AppText";
import { colors } from "@/src/lib/theme";
import { fonts } from "@/src/lib/typography";
import { getAccessTokenForApi, getWebApiBaseUrl } from "@/src/lib/api/webApi";
import { fetchPalateData, type PalateData } from "@/src/lib/api/palate";

// ─── Constants ─────────────────────────────────────────────

const STARTER_GRAPES = [
  "Pinot Noir",
  "Cabernet Sauvignon",
  "Chardonnay",
  "Sauvignon Blanc",
  "Syrah/Shiraz",
  "Nebbiolo",
  "Riesling",
  "Grenache",
  "Merlot",
  "Malbec",
  "Tempranillo",
  "Sangiovese",
];

const POPULAR_REGIONS = [
  "France",
  "Italy",
  "California",
  "Spain",
  "Bordeaux",
  "Burgundy",
  "Napa Valley",
  "Rh\u00f4ne Valley",
  "Tuscany",
  "Piedmont",
  "Oregon",
  "Barossa Valley",
  "Champagne",
  "Rioja",
];

// ─── Types ─────────────────────────────────────────────────

type SearchResult = {
  type: "grape" | "region" | "producer";
  name: string;
  slug: string;
};

type ForYouCard = {
  type: "grape" | "region";
  name: string;
  slug: string;
  tagline: string;
};

// ─── Section toggle ────────────────────────────────────────

function BrowseSection({
  title,
  defaultOpen = true,
  children,
}: {
  title: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <View style={sectionStyles.container}>
      <Pressable
        style={sectionStyles.header}
        onPress={() => setOpen((v) => !v)}
      >
        <AppText style={sectionStyles.title}>{title}</AppText>
        <Feather
          name={open ? "chevron-up" : "chevron-down"}
          size={14}
          color={colors.textTertiary}
        />
      </Pressable>
      {open ? <View style={sectionStyles.body}>{children}</View> : null}
    </View>
  );
}

const sectionStyles = StyleSheet.create({
  container: { marginBottom: 4 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 12,
  },
  title: {
    fontSize: 9,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 2,
    color: colors.textTertiary,
  },
  body: { paddingBottom: 16 },
});

// ─── Chip ──────────────────────────────────────────────────

function Chip({
  label,
  onPress,
}: {
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable style={chipStyles.chip} onPress={onPress}>
      <AppText style={chipStyles.label}>{label}</AppText>
    </Pressable>
  );
}

const chipStyles = StyleSheet.create({
  chip: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceTinted,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  label: {
    fontSize: 13,
    color: colors.textPrimary,
  },
});

// ─── Type badge ────────────────────────────────────────────

function TypeBadge({ type }: { type: string }) {
  const label = type === "grape" ? "Grape" : type === "region" ? "Region" : "Producer";
  return (
    <View style={badgeStyles.badge}>
      <AppText style={badgeStyles.text}>{label}</AppText>
    </View>
  );
}

const badgeStyles = StyleSheet.create({
  badge: {
    alignSelf: "flex-start",
    borderRadius: 999,
    backgroundColor: colors.surfaceHover,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  text: {
    fontSize: 10,
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 1,
    color: colors.textTertiary,
  },
});

// ─── Main page ─────────────────────────────────────────────

export default function ExploreBrowseScreen() {
  const router = useRouter();
  const WEB_API_BASE_URL = getWebApiBaseUrl();

  // Search state
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // For You state
  const [forYouCards, setForYouCards] = useState<ForYouCard[]>([]);
  const [forYouLoading, setForYouLoading] = useState(true);
  const [hasForYouData, setHasForYouData] = useState(false);

  // Load For You data
  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      const res = await fetchPalateData();
      if (cancelled) return;

      if (!res.ok) {
        setForYouLoading(false);
        return;
      }

      const data = res.data;
      if (data.gated || (!data.topGrapes?.length && !data.regionStats?.length)) {
        setHasForYouData(false);
        setForYouLoading(false);
        return;
      }

      setHasForYouData(true);
      const cards: ForYouCard[] = [];
      data.topGrapes?.slice(0, 2).forEach((g) => {
        cards.push({
          type: "grape",
          name: g.name,
          slug: toExploreSlug(g.name),
          tagline: `Logged ${g.count} times`,
        });
      });
      data.regionStats?.slice(0, 2).forEach((r) => {
        cards.push({
          type: "region",
          name: r.region,
          slug: toExploreSlug(r.region),
          tagline: `Avg rating: ${r.avgRating}`,
        });
      });
      setForYouCards(cards.slice(0, 4));
      setForYouLoading(false);
    };

    void load();
    return () => { cancelled = true; };
  }, []);

  // Search handler
  const doSearch = useCallback(
    async (q: string) => {
      const trimmed = q.trim();
      if (trimmed.length < 2) {
        setResults([]);
        setSearching(false);
        return;
      }

      setSearching(true);
      const lower = trimmed.toLowerCase();

      // Search grapes via API
      let grapes: SearchResult[] = [];
      if (WEB_API_BASE_URL) {
        try {
          const accessToken = await getAccessTokenForApi();
          if (accessToken) {
            const res = await fetch(
              `${WEB_API_BASE_URL}/api/grapes?q=${encodeURIComponent(trimmed)}&limit=6`,
              { headers: { Authorization: `Bearer ${accessToken}` } }
            );
            const data = await res.json().catch(() => ({ grapes: [] }));
            grapes = (data.grapes ?? []).map(
              (g: { id: string; name: string }) => ({
                type: "grape" as const,
                name: g.name,
                slug: toExploreSlug(g.name),
              })
            );
          }
        } catch {
          // Silently fail
        }
      }

      // Filter regions locally
      const regionMatches = WINE_REGIONS.filter((r) =>
        r.toLowerCase().includes(lower)
      )
        .slice(0, 6)
        .map((r) => ({
          type: "region" as const,
          name: r,
          slug: toExploreSlug(r),
        }));

      setResults([...grapes, ...regionMatches]);
      setSearching(false);
    },
    [WEB_API_BASE_URL]
  );

  const onQueryChange = useCallback(
    (value: string) => {
      setQuery(value);
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => void doSearch(value), 300);
    },
    [doSearch]
  );

  const navigateToProfile = (type: string, slug: string) => {
    router.push(`/(app)/explore/${type}/${slug}` as Parameters<typeof router.push>[0]);
  };

  const showSearch = query.trim().length >= 2;

  // Group search results by type
  const grouped: Record<string, SearchResult[]> = {};
  results.forEach((r) => {
    if (!grouped[r.type]) grouped[r.type] = [];
    grouped[r.type].push(r);
  });

  return (
    <View style={styles.screen}>
      {/* Back button */}
      <View style={styles.topBar}>
        <Pressable
          style={styles.backButton}
          onPress={() => router.back()}
          accessibilityRole="button"
          accessibilityLabel="Go back"
        >
          <Feather name="arrow-left" size={18} color={colors.textPrimary} />
        </Pressable>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* Header */}
        <View style={styles.header}>
          <AppText style={styles.eyebrow}>EXPLORE</AppText>
          <AppText style={styles.title}>
            Discover wines matched to your taste.
          </AppText>
          <AppText style={styles.subtitle}>
            Browse grapes, regions, and producers — or let your palate lead the
            way.
          </AppText>
        </View>

        {/* Search bar */}
        <View style={styles.searchContainer}>
          <Feather
            name="search"
            size={16}
            color={colors.textTertiary}
            style={styles.searchIcon}
          />
          <TextInput
            style={styles.searchInput}
            placeholder="Search grapes, regions, producers..."
            placeholderTextColor={colors.textTertiary}
            value={query}
            onChangeText={onQueryChange}
            autoCapitalize="none"
            autoCorrect={false}
          />
        </View>

        {/* Search results */}
        {showSearch ? (
          <View style={styles.searchResults}>
            {searching ? (
              <View style={styles.searchEmpty}>
                <ActivityIndicator color={colors.accentPrimary} />
              </View>
            ) : results.length === 0 ? (
              <View style={styles.searchEmpty}>
                <AppText style={styles.searchEmptyText}>
                  No results for &ldquo;{query.trim()}&rdquo;
                </AppText>
              </View>
            ) : (
              <>
                {(["grape", "region", "producer"] as const).map((type) =>
                  grouped[type]?.length ? (
                    <View key={type}>
                      <AppText style={styles.searchGroupTitle}>
                        {type === "grape"
                          ? "GRAPES"
                          : type === "region"
                            ? "REGIONS"
                            : "PRODUCERS"}
                      </AppText>
                      {grouped[type].map((r) => (
                        <Pressable
                          key={`${r.type}-${r.slug}`}
                          style={styles.searchResultItem}
                          onPress={() => navigateToProfile(r.type, r.slug)}
                        >
                          <AppText style={styles.searchResultText}>
                            {r.name}
                          </AppText>
                        </Pressable>
                      ))}
                    </View>
                  ) : null
                )}
              </>
            )}
          </View>
        ) : null}

        {/* For You section */}
        <View style={styles.section}>
          <AppText style={styles.sectionLabel}>Based on your palate</AppText>

          {forYouLoading ? (
            <View style={styles.emptyCard}>
              <ActivityIndicator color={colors.accentPrimary} />
            </View>
          ) : !hasForYouData ? (
            <View style={styles.emptyCard}>
              <AppText style={styles.emptyCardText}>
                Log a few wines to unlock personalized recommendations
              </AppText>
            </View>
          ) : (
            <View style={styles.cardGrid}>
              {forYouCards.map((card) => (
                <Pressable
                  key={`${card.type}-${card.slug}`}
                  style={styles.card}
                  onPress={() => navigateToProfile(card.type, card.slug)}
                >
                  <TypeBadge type={card.type} />
                  <AppText style={styles.cardName}>{card.name}</AppText>
                  <AppText style={styles.cardTagline}>{card.tagline}</AppText>
                </Pressable>
              ))}
            </View>
          )}
        </View>

        {/* Browse by category */}
        <BrowseSection title="Grapes">
          <View style={styles.chipWrap}>
            {STARTER_GRAPES.map((g) => (
              <Chip
                key={g}
                label={g}
                onPress={() => navigateToProfile("grape", toExploreSlug(g))}
              />
            ))}
          </View>
        </BrowseSection>

        <BrowseSection title="Regions">
          <View style={styles.chipWrap}>
            {POPULAR_REGIONS.map((r) => (
              <Chip
                key={r}
                label={r}
                onPress={() => navigateToProfile("region", toExploreSlug(r))}
              />
            ))}
          </View>
        </BrowseSection>

        <BrowseSection title="Producers">
          <View style={styles.emptyCard}>
            <AppText style={styles.emptyCardText}>
              Your top producers will appear here as you log wines.
            </AppText>
          </View>
        </BrowseSection>
      </ScrollView>
    </View>
  );
}

// ─── Styles ────────────────────────────────────────────────

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.screenBg,
  },
  topBar: {
    height: 50,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingBottom: 80,
  },
  header: {
    marginBottom: 24,
  },
  eyebrow: {
    fontSize: 9,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 2,
    color: colors.textTertiary,
    marginBottom: 8,
  },
  title: {
    fontFamily: fonts.serif.light,
    fontSize: 24,
    color: colors.textPrimary,
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 14,
    color: colors.textSecondary,
    lineHeight: 20,
  },
  searchContainer: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfacePrimary,
    paddingHorizontal: 12,
    marginBottom: 24,
  },
  searchIcon: {
    marginRight: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    color: colors.textPrimary,
    paddingVertical: 12,
  },
  searchResults: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceRaised,
    marginBottom: 24,
    overflow: "hidden",
  },
  searchEmpty: {
    paddingHorizontal: 16,
    paddingVertical: 24,
    alignItems: "center",
  },
  searchEmptyText: {
    fontSize: 13,
    color: colors.textTertiary,
  },
  searchGroupTitle: {
    fontSize: 9,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 2,
    color: colors.textTertiary,
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 4,
  },
  searchResultItem: {
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  searchResultText: {
    fontSize: 14,
    color: colors.textPrimary,
  },
  section: {
    marginBottom: 24,
  },
  sectionLabel: {
    fontSize: 9,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 2,
    color: colors.textTertiary,
    marginBottom: 12,
  },
  emptyCard: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceTinted,
    paddingHorizontal: 16,
    paddingVertical: 28,
    alignItems: "center",
  },
  emptyCardText: {
    fontSize: 13,
    color: colors.textSecondary,
    textAlign: "center",
  },
  cardGrid: {
    gap: 12,
  },
  card: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceTinted,
    padding: 16,
  },
  cardName: {
    fontSize: 16,
    fontWeight: "600",
    color: colors.textPrimary,
    marginTop: 8,
  },
  cardTagline: {
    fontSize: 12,
    color: colors.textSecondary,
    marginTop: 4,
  },
  chipWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
});

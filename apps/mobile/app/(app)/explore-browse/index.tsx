import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from "react-native";
import { router } from "expo-router";
import { toExploreSlug, WINE_REGIONS } from "@cellarsnap/shared";
import { AppText } from "@/src/components/AppText";
import { DoneTextInput } from "@/src/components/DoneTextInput";
import { colors } from "@/src/lib/theme";
import { supabase } from "@/src/lib/supabase";
import { useAuth } from "@/src/providers/AuthProvider";
import { getAccessTokenForApi, getWebApiBaseUrl } from "@/src/lib/api/webApi";

type SearchResult = {
  type: "grape" | "region" | "producer";
  name: string;
};

type PalateEntry = {
  name: string;
  type: "grape" | "region";
};

const WEB_API_BASE_URL = getWebApiBaseUrl();

const POPULAR_GRAPES = [
  "Pinot Noir", "Cabernet Sauvignon", "Chardonnay", "Sauvignon Blanc",
  "Syrah / Shiraz", "Nebbiolo", "Riesling", "Grenache",
  "Merlot", "Malbec", "Tempranillo", "Sangiovese",
];

const POPULAR_REGIONS = [
  "Burgundy", "Bordeaux", "Napa Valley", "Tuscany",
  "Champagne", "Piedmont", "Rioja", "Barossa Valley",
  "Willamette Valley", "Mendoza", "Mosel", "Rhone Valley",
  "Sonoma", "Stellenbosch",
];

export default function ExploreBrowseScreen() {
  const { user } = useAuth();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [palateEntries, setPalateEntries] = useState<PalateEntry[]>([]);
  const [palateLoaded, setPalateLoaded] = useState(false);
  const [producers, setProducers] = useState<string[]>([]);
  const [grapesOpen, setGrapesOpen] = useState(true);
  const [regionsOpen, setRegionsOpen] = useState(true);
  const [producersOpen, setProducersOpen] = useState(true);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Load palate
  useEffect(() => {
    let mounted = true;
    const load = async () => {
      if (!WEB_API_BASE_URL) { setPalateLoaded(true); return; }
      const token = await getAccessTokenForApi();
      if (!token || !mounted) { setPalateLoaded(true); return; }
      try {
        const res = await fetch(`${WEB_API_BASE_URL}/api/palate`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok || !mounted) { setPalateLoaded(true); return; }
        const data = await res.json();
        const entries: PalateEntry[] = [];
        if (Array.isArray(data.top_grapes)) {
          for (const g of data.top_grapes) {
            if (typeof g.name === "string") entries.push({ name: g.name, type: "grape" });
          }
        }
        if (Array.isArray(data.top_regions)) {
          for (const r of data.top_regions) {
            if (typeof r.name === "string") entries.push({ name: r.name, type: "region" });
          }
        }
        if (mounted) { setPalateEntries(entries); setPalateLoaded(true); }
      } catch {
        if (mounted) setPalateLoaded(true);
      }
    };
    load();
    return () => { mounted = false; };
  }, []);

  // Load producers
  useEffect(() => {
    let mounted = true;
    const load = async () => {
      if (!user) return;
      const { data } = await supabase
        .from("wine_entries")
        .select("producer")
        .eq("user_id", user.id)
        .not("producer", "is", null)
        .order("created_at", { ascending: false })
        .limit(200);
      if (!mounted || !data) return;
      const counts = new Map<string, number>();
      for (const row of data) {
        const p = (row.producer as string)?.trim();
        if (p) counts.set(p, (counts.get(p) ?? 0) + 1);
      }
      const sorted = [...counts.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 12)
        .map(([name]) => name);
      if (mounted) setProducers(sorted);
    };
    load();
    return () => { mounted = false; };
  }, [user]);

  const search = useCallback(async (q: string) => {
    const trimmed = q.trim().toLowerCase();
    if (!trimmed) { setResults([]); setSearching(false); return; }
    setSearching(true);
    const found: SearchResult[] = [];

    // Grapes via API
    if (WEB_API_BASE_URL) {
      try {
        const token = await getAccessTokenForApi();
        if (token) {
          const res = await fetch(`${WEB_API_BASE_URL}/api/grapes?q=${encodeURIComponent(trimmed)}`, {
            headers: { Authorization: `Bearer ${token}` },
          });
          if (res.ok) {
            const data = await res.json();
            const grapes = Array.isArray(data.grapes) ? data.grapes : (Array.isArray(data) ? data : []);
            for (const g of grapes.slice(0, 5)) {
              const name = typeof g === "string" ? g : g.name;
              if (name) found.push({ type: "grape", name });
            }
          }
        }
      } catch { /* ignore */ }
    }

    // Regions locally
    const matchedRegions = WINE_REGIONS.filter(r => r.toLowerCase().includes(trimmed)).slice(0, 5);
    for (const r of matchedRegions) found.push({ type: "region", name: r });

    // Producers
    const matchedProducers = producers.filter(p => p.toLowerCase().includes(trimmed)).slice(0, 5);
    for (const p of matchedProducers) found.push({ type: "producer", name: p });

    setResults(found);
    setSearching(false);
  }, [producers]);

  const onQueryChange = (value: string) => {
    setQuery(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => search(value), 300);
  };

  const navigateTo = (type: string, name: string) => {
    router.push(`/(app)/explore/${type}/${toExploreSlug(name)}` as Parameters<typeof router.push>[0]);
  };

  const groupedResults = useMemo(() => {
    const groups: Record<string, SearchResult[]> = {};
    for (const r of results) {
      if (!groups[r.type]) groups[r.type] = [];
      groups[r.type].push(r);
    }
    return groups;
  }, [results]);

  const typeLabels: Record<string, string> = { grape: "Grapes", region: "Regions", producer: "Producers" };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      style={styles.container}
    >
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode={Platform.OS === "ios" ? "interactive" : "on-drag"}
        automaticallyAdjustKeyboardInsets
      >
        {/* Header */}
        <AppText style={styles.eyebrow}>EXPLORE</AppText>
        <AppText style={styles.title}>Discover wines matched to your taste.</AppText>
        <AppText style={styles.subtitle}>
          Browse grapes, regions, and producers — or search for something specific.
        </AppText>

        {/* Search */}
        <DoneTextInput
          style={styles.searchInput}
          value={query}
          onChangeText={onQueryChange}
          placeholder="Search grapes, regions, producers..."
          placeholderTextColor={colors.textTertiary}
          autoCorrect={false}
        />

        {/* Search results */}
        {query.trim() ? (
          <View style={styles.section}>
            {searching ? (
              <AppText style={styles.emptyText}>Searching...</AppText>
            ) : results.length === 0 ? (
              <AppText style={styles.emptyText}>No results found.</AppText>
            ) : (
              Object.entries(groupedResults).map(([type, items]) => (
                <View key={type} style={styles.resultGroup}>
                  <AppText style={styles.sectionLabel}>{typeLabels[type] ?? type}</AppText>
                  {items.map((item) => (
                    <Pressable
                      key={`${item.type}-${item.name}`}
                      style={styles.resultItem}
                      onPress={() => navigateTo(item.type, item.name)}
                    >
                      <AppText style={styles.resultText}>{item.name}</AppText>
                    </Pressable>
                  ))}
                </View>
              ))
            )}
          </View>
        ) : (
          <>
            {/* For You */}
            {palateLoaded && (
              <View style={styles.section}>
                <AppText style={styles.sectionTitle}>For You</AppText>
                {palateEntries.length < 8 ? (
                  <AppText style={styles.emptyText}>
                    Log more wines to unlock personalized recommendations. Your palate profile builds as you explore.
                  </AppText>
                ) : (
                  <View style={styles.chipRow}>
                    {palateEntries.slice(0, 12).map((entry) => (
                      <Pressable
                        key={`${entry.type}-${entry.name}`}
                        style={styles.chip}
                        onPress={() => navigateTo(entry.type, entry.name)}
                      >
                        <AppText style={styles.chipText}>{entry.name}</AppText>
                      </Pressable>
                    ))}
                  </View>
                )}
              </View>
            )}

            {/* Browse by Category */}
            <View style={styles.section}>
              <AppText style={styles.sectionTitle}>Browse by Category</AppText>

              {/* Grapes */}
              <Pressable style={styles.collapseHeader} onPress={() => setGrapesOpen(!grapesOpen)}>
                <AppText style={styles.sectionLabel}>Grapes</AppText>
                <AppText style={styles.collapseIcon}>{grapesOpen ? "\u2212" : "+"}</AppText>
              </Pressable>
              {grapesOpen && (
                <View style={styles.chipRow}>
                  {POPULAR_GRAPES.map((g) => (
                    <Pressable key={g} style={styles.chip} onPress={() => navigateTo("grape", g)}>
                      <AppText style={styles.chipText}>{g}</AppText>
                    </Pressable>
                  ))}
                </View>
              )}

              {/* Regions */}
              <Pressable style={styles.collapseHeader} onPress={() => setRegionsOpen(!regionsOpen)}>
                <AppText style={styles.sectionLabel}>Regions</AppText>
                <AppText style={styles.collapseIcon}>{regionsOpen ? "\u2212" : "+"}</AppText>
              </Pressable>
              {regionsOpen && (
                <View style={styles.chipRow}>
                  {POPULAR_REGIONS.map((r) => (
                    <Pressable key={r} style={styles.chip} onPress={() => navigateTo("region", r)}>
                      <AppText style={styles.chipText}>{r}</AppText>
                    </Pressable>
                  ))}
                </View>
              )}

              {/* Producers */}
              <Pressable style={styles.collapseHeader} onPress={() => setProducersOpen(!producersOpen)}>
                <AppText style={styles.sectionLabel}>Producers</AppText>
                <AppText style={styles.collapseIcon}>{producersOpen ? "\u2212" : "+"}</AppText>
              </Pressable>
              {producersOpen && (
                producers.length === 0 ? (
                  <AppText style={styles.emptyText}>Log wines with producers to see them here.</AppText>
                ) : (
                  <View style={styles.chipRow}>
                    {producers.map((p) => (
                      <Pressable key={p} style={styles.chip} onPress={() => navigateTo("producer", p)}>
                        <AppText style={styles.chipText}>{p}</AppText>
                      </Pressable>
                    ))}
                  </View>
                )
              )}
            </View>
          </>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.screenBg,
  },
  scroll: {
    flex: 1,
  },
  content: {
    paddingHorizontal: 20,
    paddingTop: 60,
    paddingBottom: 80,
  },
  eyebrow: {
    fontSize: 10,
    fontWeight: "600",
    letterSpacing: 2.5,
    textTransform: "uppercase",
    color: colors.textTertiary,
  },
  title: {
    fontSize: 26,
    fontWeight: "300",
    color: colors.textPrimary,
    marginTop: 8,
    lineHeight: 34,
  },
  subtitle: {
    fontSize: 13,
    color: colors.textSecondary,
    marginTop: 8,
    lineHeight: 18,
  },
  searchInput: {
    marginTop: 20,
    backgroundColor: colors.surfaceRaised,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 14,
    color: colors.textPrimary,
  },
  section: {
    marginTop: 28,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: "300",
    color: colors.textPrimary,
    marginBottom: 12,
  },
  sectionLabel: {
    fontSize: 10,
    fontWeight: "600",
    letterSpacing: 2,
    textTransform: "uppercase",
    color: colors.textTertiary,
  },
  chipRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 8,
  },
  chip: {
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceRaised,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  chipText: {
    fontSize: 12,
    color: colors.textPrimary,
  },
  collapseHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 6,
    marginTop: 12,
  },
  collapseIcon: {
    fontSize: 16,
    color: colors.textTertiary,
  },
  emptyText: {
    fontSize: 13,
    color: colors.textTertiary,
    marginTop: 8,
    lineHeight: 18,
  },
  resultGroup: {
    marginBottom: 16,
  },
  resultItem: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
  },
  resultText: {
    fontSize: 14,
    color: colors.textPrimary,
  },
});

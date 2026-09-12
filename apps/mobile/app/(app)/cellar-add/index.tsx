import { useState, useCallback, useRef } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import { AppText } from "@/src/components/AppText";
import { colors } from "@/src/lib/theme";
import { fonts } from "@/src/lib/typography";
import {
  BOTTLE_FORMAT_OPTIONS,
  COMMON_GRAPES,
  WINE_REGIONS,
} from "@cellarsnap/shared";
import { getAccessTokenForApi, getWebApiBaseUrl } from "@/src/lib/api/webApi";

// Baseline top inset on a notchless device — see explanation in AppTopBar.tsx.
const NOTCHLESS_TOP_INSET = 20;
const SCROLL_BASE_PADDING_TOP = 16;

// ─── Constants ──────────────────────────────────────────────
const WINE_TYPES = [
  "Red",
  "White",
  "Rosé",
  "Sparkling",
  "Orange",
  "Sweet/Dessert",
] as const;

// First ~26 entries in WINE_REGIONS are countries
const WINE_COUNTRIES = (WINE_REGIONS as unknown as string[]).slice(0, 26);
const ALL_REGIONS = WINE_REGIONS as unknown as string[];

// ─── AutocompleteInput ─────────────────────────────────────
type AutocompleteItem = { label: string; value: string };

function AutocompleteInput({
  value,
  onChangeText,
  placeholder,
  options,
  asyncSearch,
  onSelectItem,
  minChars = 2,
  returnKeyType = "next",
}: {
  value: string;
  onChangeText: (text: string) => void;
  placeholder?: string;
  options?: string[];
  asyncSearch?: (query: string) => Promise<AutocompleteItem[]>;
  onSelectItem?: (item: AutocompleteItem) => void;
  minChars?: number;
  returnKeyType?: "next" | "done";
}) {
  const [filteredOptions, setFilteredOptions] = useState<AutocompleteItem[]>([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const filterOptions = useCallback(
    (query: string) => {
      if (query.length < minChars) {
        setFilteredOptions([]);
        setShowDropdown(false);
        return;
      }

      if (options) {
        const lower = query.toLowerCase();
        const matches = options
          .filter((opt) => opt.toLowerCase().includes(lower))
          .slice(0, 8)
          .map((opt) => ({ label: opt, value: opt }));
        setFilteredOptions(matches);
        setShowDropdown(matches.length > 0);
      }

      if (asyncSearch) {
        if (debounceRef.current) clearTimeout(debounceRef.current);
        debounceRef.current = setTimeout(async () => {
          try {
            const results = await asyncSearch(query);
            setFilteredOptions(results.slice(0, 8));
            setShowDropdown(results.length > 0);
          } catch {
            setFilteredOptions([]);
            setShowDropdown(false);
          }
        }, 300);
      }
    },
    [options, asyncSearch, minChars],
  );

  const handleChangeText = (text: string) => {
    onChangeText(text);
    filterOptions(text);
  };

  const handleSelect = (item: AutocompleteItem) => {
    onChangeText(item.label);
    setShowDropdown(false);
    setFilteredOptions([]);
    if (onSelectItem) onSelectItem(item);
  };

  return (
    <View style={acStyles.wrapper}>
      <TextInput
        style={styles.input}
        placeholder={placeholder}
        placeholderTextColor={colors.textTertiary}
        value={value}
        onChangeText={handleChangeText}
        onFocus={() => {
          if (value.length >= minChars) filterOptions(value);
        }}
        onBlur={() => {
          // Small delay to allow onPress on results
          setTimeout(() => setShowDropdown(false), 200);
        }}
        autoCapitalize="words"
        autoComplete="off"
        returnKeyType={returnKeyType}
      />
      {showDropdown && filteredOptions.length > 0 && (
        <View style={acStyles.dropdown}>
          {filteredOptions.map((item, index) => (
            <Pressable
              key={item.value + index}
              style={[
                acStyles.dropdownItem,
                index === filteredOptions.length - 1 && acStyles.dropdownItemLast,
              ]}
              onPress={() => handleSelect(item)}
            >
              <AppText style={acStyles.dropdownText}>{item.label}</AppText>
            </Pressable>
          ))}
        </View>
      )}
    </View>
  );
}

// ─── Chip single-select ─────────────────────────────────────
function ChipSingleSelect<T extends string>({
  options,
  selected,
  onSelect,
  getLabel,
}: {
  options: readonly T[];
  selected: T | null;
  onSelect: (item: T | null) => void;
  getLabel?: (item: T) => string;
}) {
  return (
    <View style={styles.chipWrap}>
      {options.map((opt) => {
        const active = selected === opt;
        return (
          <Pressable
            key={opt}
            style={[styles.chip, active && styles.chipActive]}
            onPress={() => onSelect(active ? null : opt)}
          >
            <AppText style={[styles.chipText, active && styles.chipTextActive]}>
              {getLabel ? getLabel(opt) : opt}
            </AppText>
          </Pressable>
        );
      })}
    </View>
  );
}

// ─── Quantity selector ──────────────────────────────────────
function QuantitySelector({
  value,
  onChange,
}: {
  value: number;
  onChange: (v: number) => void;
}) {
  const [text, setText] = useState(String(value));

  const handleChangeText = (t: string) => {
    setText(t);
    const n = parseInt(t, 10);
    if (!isNaN(n) && n >= 1) onChange(n);
  };

  const handleBlur = () => {
    const n = parseInt(text, 10);
    if (isNaN(n) || n < 1) {
      onChange(1);
      setText("1");
    } else {
      onChange(n);
      setText(String(n));
    }
  };

  const handleButton = (next: number) => {
    onChange(next);
    setText(String(next));
  };

  return (
    <View style={styles.quantityRow}>
      <Pressable
        style={[styles.quantityButton, value <= 1 && styles.quantityButtonDisabled]}
        onPress={() => handleButton(Math.max(1, value - 1))}
        disabled={value <= 1}
      >
        <Feather name="minus" size={18} color={value <= 1 ? colors.textTertiary : colors.textPrimary} />
      </Pressable>
      <TextInput
        style={styles.quantityInput}
        value={text}
        onChangeText={handleChangeText}
        onBlur={handleBlur}
        keyboardType="number-pad"
        selectTextOnFocus
        textAlign="center"
      />
      <Pressable
        style={styles.quantityButton}
        onPress={() => handleButton(value + 1)}
      >
        <Feather name="plus" size={18} color={colors.textPrimary} />
      </Pressable>
    </View>
  );
}

// ─── Wine type value mapping ────────────────────────────────
function wineTypeToApiValue(type: string): string {
  const map: Record<string, string> = {
    Red: "red",
    White: "white",
    "Rosé": "rosé",
    Sparkling: "sparkling",
    Orange: "orange",
    "Sweet/Dessert": "sweet/dessert",
  };
  return map[type] ?? type.toLowerCase();
}

// ─── Main screen ────────────────────────────────────────────
export default function CellarAddScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [wineName, setWineName] = useState("");
  const [producer, setProducer] = useState("");
  const [vintage, setVintage] = useState("");
  const [country, setCountry] = useState("");
  const [region, setRegion] = useState("");
  const [wineType, setWineType] = useState<string | null>(null);
  const [varietal, setVarietal] = useState("");
  const [selectedGrapeId, setSelectedGrapeId] = useState<string | null>(null);
  const [quantity, setQuantity] = useState(1);
  const [bottleFormat, setBottleFormat] = useState<string | null>("750ml");

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const canSubmit = wineName.trim().length > 0 && !isSubmitting;

  // Search grapes: try API first, fall back to COMMON_GRAPES
  const searchGrapes = useCallback(
    async (query: string): Promise<AutocompleteItem[]> => {
      const lower = query.toLowerCase();

      // Try API first
      try {
        const baseUrl = getWebApiBaseUrl();
        const accessToken = await getAccessTokenForApi();
        if (baseUrl && accessToken) {
          const res = await fetch(
            `${baseUrl}/api/grapes?q=${encodeURIComponent(query)}&limit=8`,
            {
              headers: { Authorization: `Bearer ${accessToken}` },
            },
          );
          if (res.ok) {
            const data = await res.json();
            if (data.grapes && data.grapes.length > 0) {
              return data.grapes.map((g: { id: string; name: string }) => ({
                label: g.name,
                value: g.id,
              }));
            }
          }
        }
      } catch {
        // Fall through to local fallback
      }

      // Fallback: filter COMMON_GRAPES locally
      return (COMMON_GRAPES as unknown as string[])
        .filter((g) => g.toLowerCase().includes(lower))
        .slice(0, 8)
        .map((g) => ({ label: g, value: g }));
    },
    [],
  );

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setIsSubmitting(true);
    setErrorMessage(null);

    try {
      const baseUrl = getWebApiBaseUrl();
      const accessToken = await getAccessTokenForApi();
      if (!baseUrl || !accessToken) {
        setErrorMessage("Unable to connect. Please try again.");
        setIsSubmitting(false);
        return;
      }

      const body: Record<string, unknown> = {
        wine_name: wineName.trim(),
        entry_status: "cellaring",
        cellar_quantity: quantity,
        bottle_format: bottleFormat ?? "750ml",
        is_feed_visible: false,
        entry_privacy: "private",
      };
      if (producer.trim()) body.producer = producer.trim();
      if (vintage.trim()) body.vintage = vintage.trim();
      if (country.trim()) body.country = country.trim();
      if (region.trim()) body.region = region.trim();
      if (wineType) body.wine_type = wineTypeToApiValue(wineType);
      if (selectedGrapeId) body.primary_grape_ids = [selectedGrapeId];

      const res = await fetch(`${baseUrl}/api/entries`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => null);
        setErrorMessage(data?.error ?? `Failed to save (${res.status})`);
        setIsSubmitting(false);
        return;
      }

      router.replace("/(app)/entries");
    } catch {
      setErrorMessage("Something went wrong. Please try again.");
      setIsSubmitting(false);
    }
  };

  const bottleFormatValues = BOTTLE_FORMAT_OPTIONS.map((o) => o.value);
  const bottleFormatLabels: Record<string, string> = {};
  for (const o of BOTTLE_FORMAT_OPTIONS) {
    bottleFormatLabels[o.value] = o.label;
  }

  return (
    <KeyboardAvoidingView
      style={styles.screen}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScrollView
        contentContainerStyle={[
          styles.scrollContent,
          {
            paddingTop:
              SCROLL_BASE_PADDING_TOP + (insets.top - NOTCHLESS_TOP_INSET),
          },
        ]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* Back button */}
        <Pressable style={styles.backButton} onPress={() => router.back()}>
          <Feather name="arrow-left" size={20} color={colors.textPrimary} />
        </Pressable>

        {/* Header */}
        <View style={styles.headerBlock}>
          <AppText style={styles.eyebrow}>CELLAR</AppText>
          <AppText style={styles.title}>Add to cellar</AppText>
          <AppText style={styles.subtitle}>
            Track wines you're holding in your collection.
          </AppText>
        </View>

        {/* Wine name */}
        <View style={styles.fieldGroup}>
          <AppText style={styles.label}>Wine name *</AppText>
          <TextInput
            style={styles.input}
            placeholder="e.g., Barolo Riserva"
            placeholderTextColor={colors.textTertiary}
            value={wineName}
            onChangeText={setWineName}
            autoCapitalize="words"
            returnKeyType="next"
          />
        </View>

        {/* Producer (plain text — no autocomplete on mobile for v1) */}
        <View style={styles.fieldGroup}>
          <AppText style={styles.label}>Producer</AppText>
          <TextInput
            style={styles.input}
            placeholder="e.g., Giacomo Conterno"
            placeholderTextColor={colors.textTertiary}
            value={producer}
            onChangeText={setProducer}
            autoCapitalize="words"
            returnKeyType="next"
          />
        </View>

        {/* Vintage */}
        <View style={styles.fieldGroup}>
          <AppText style={styles.label}>Vintage</AppText>
          <TextInput
            style={styles.input}
            placeholder="e.g., 2018"
            placeholderTextColor={colors.textTertiary}
            value={vintage}
            onChangeText={setVintage}
            keyboardType="numeric"
            returnKeyType="next"
          />
        </View>

        {/* Country (autocomplete) */}
        <View style={styles.fieldGroup}>
          <AppText style={styles.label}>Country</AppText>
          <AutocompleteInput
            value={country}
            onChangeText={setCountry}
            placeholder="e.g., Italy"
            options={WINE_COUNTRIES}
            minChars={1}
          />
        </View>

        {/* Region (autocomplete) */}
        <View style={styles.fieldGroup}>
          <AppText style={styles.label}>Region</AppText>
          <AutocompleteInput
            value={region}
            onChangeText={setRegion}
            placeholder="e.g., Piedmont"
            options={ALL_REGIONS}
            returnKeyType="done"
          />
        </View>

        {/* Wine type */}
        <View style={styles.fieldGroup}>
          <AppText style={styles.label}>Wine type</AppText>
          <ChipSingleSelect
            options={WINE_TYPES}
            selected={wineType}
            onSelect={setWineType}
          />
        </View>

        {/* Varietal (autocomplete via API + COMMON_GRAPES fallback) */}
        <View style={styles.fieldGroup}>
          <AppText style={styles.label}>Varietal</AppText>
          <AutocompleteInput
            value={varietal}
            onChangeText={(text) => {
              setVarietal(text);
              setSelectedGrapeId(null);
            }}
            placeholder="e.g., Pinot Noir"
            asyncSearch={searchGrapes}
            onSelectItem={(item) => {
              setSelectedGrapeId(item.value);
            }}
          />
        </View>

        {/* Quantity */}
        <View style={styles.fieldGroup}>
          <AppText style={styles.label}>Quantity</AppText>
          <QuantitySelector value={quantity} onChange={setQuantity} />
        </View>

        {/* Bottle format */}
        <View style={styles.fieldGroup}>
          <AppText style={styles.label}>Bottle format</AppText>
          <ChipSingleSelect
            options={bottleFormatValues}
            selected={bottleFormat}
            onSelect={setBottleFormat}
            getLabel={(v) => bottleFormatLabels[v] ?? v}
          />
        </View>

        {/* Error */}
        {errorMessage ? (
          <AppText style={styles.errorText}>{errorMessage}</AppText>
        ) : null}

        {/* Submit */}
        <Pressable
          style={[styles.submitButton, !canSubmit && styles.submitButtonDisabled]}
          onPress={handleSubmit}
          disabled={!canSubmit}
        >
          {isSubmitting ? (
            <ActivityIndicator color={colors.textOnAccent} />
          ) : (
            <AppText style={styles.submitButtonText}>Add to cellar</AppText>
          )}
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

// ─── Autocomplete styles ───────────────────────────────────
const acStyles = StyleSheet.create({
  wrapper: {
    position: "relative",
    zIndex: 10,
  },
  dropdown: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceRaised,
    overflow: "hidden",
    marginTop: 4,
  },
  dropdownItem: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  dropdownItemLast: {
    borderBottomWidth: 0,
  },
  dropdownText: {
    color: colors.textSecondary,
    fontSize: 13,
  },
});

// ─── Styles ─────────────────────────────────────────────────
const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.screenBg,
  },
  scrollContent: {
    paddingHorizontal: 22,
    paddingBottom: 48,
    gap: 20,
  },
  backButton: {
    alignSelf: "flex-start",
    padding: 4,
  },
  headerBlock: {
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
    fontSize: 14,
    lineHeight: 20,
  },
  fieldGroup: {
    gap: 8,
  },
  label: {
    color: colors.textPrimary,
    fontSize: 13,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.8,
  },
  input: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    backgroundColor: colors.surfaceRaised,
    color: colors.textPrimary,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 14,
  },
  chipWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  chip: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceTinted,
    paddingHorizontal: 14,
    paddingVertical: 9,
  },
  chipActive: {
    borderColor: colors.accentPrimary,
    backgroundColor: colors.accentRose,
  },
  chipText: {
    color: colors.textSecondary,
    fontSize: 13,
    fontWeight: "600",
  },
  chipTextActive: {
    color: colors.accentSecondary,
  },
  quantityRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 16,
  },
  quantityButton: {
    width: 40,
    height: 40,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    backgroundColor: colors.surfaceTinted,
    alignItems: "center",
    justifyContent: "center",
  },
  quantityButtonDisabled: {
    opacity: 0.4,
  },
  quantityInput: {
    minWidth: 50,
    color: colors.textPrimary,
    fontFamily: fonts.serif.regular,
    fontSize: 24,
    textAlign: "center",
    paddingVertical: 4,
  },
  errorText: {
    color: colors.error,
    fontSize: 13,
    textAlign: "center",
  },
  submitButton: {
    borderRadius: 12,
    backgroundColor: colors.accentPrimary,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 14,
    marginTop: 8,
  },
  submitButtonDisabled: {
    opacity: 0.5,
  },
  submitButtonText: {
    color: colors.textOnAccent,
    fontSize: 14,
    fontWeight: "700",
  },
});

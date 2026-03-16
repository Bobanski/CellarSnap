import { useMemo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, View } from "react-native";
import type { ListScanFilterAccentTone } from "@cellarsnap/shared";
import { DoneTextInput } from "@/src/components/DoneTextInput";
import { AppText } from "@/src/components/AppText";
import { colors } from "@/src/lib/theme";

type FacetMultiSelectProps = {
  label: string;
  placeholder: string;
  options: string[];
  selected: string[];
  onChange: (next: string[]) => void;
  getOptionTone?: (option: string) => ListScanFilterAccentTone;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
};

function buildSummary(options: string[], selected: string[]) {
  if (options.length === 0) {
    return "No options found";
  }
  if (selected.length === 0 || selected.length === options.length) {
    return "All available";
  }
  if (selected.length <= 2) {
    return selected.join(", ");
  }
  return `${selected.slice(0, 2).join(", ")} +${selected.length - 2}`;
}

export default function FacetMultiSelect({
  label,
  placeholder,
  options,
  selected,
  onChange,
  getOptionTone,
  open: controlledOpen,
  onOpenChange,
}: FacetMultiSelectProps) {
  const [query, setQuery] = useState("");
  const [internalOpen, setInternalOpen] = useState(false);
  const open = controlledOpen ?? internalOpen;
  const setOpen = onOpenChange ?? setInternalOpen;

  const filteredOptions = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return options.filter((option) => {
      if (selected.includes(option)) {
        return false;
      }
      if (!normalized) {
        return true;
      }
      return option.toLowerCase().includes(normalized);
    });
  }, [options, query, selected]);

  const summary = useMemo(
    () => buildSummary(options, selected),
    [options, selected]
  );
  const toggleOpen = () => {
    setOpen(!open);
  };

  return (
    <View style={styles.card}>
      <Pressable style={styles.header} onPress={toggleOpen}>
        <View style={styles.headerText}>
          <AppText style={styles.label}>{label}</AppText>
          <AppText numberOfLines={1} style={styles.summary}>
            {summary}
          </AppText>
        </View>
        <AppText style={styles.chevron}>{open ? "v" : ">"}</AppText>
      </Pressable>

      {open ? (
        <View style={styles.body}>
          {selected.length > 0 ? (
            <View style={styles.tokenWrap}>
              {selected.map((value) => {
                const tone = getOptionTone?.(value) ?? "neutral";
                return (
                  <View
                    key={value}
                    style={[
                      styles.token,
                      tone === "white" ? styles.tokenWhite : null,
                      tone === "rose" ? styles.tokenRose : null,
                      tone === "orange" ? styles.tokenOrange : null,
                      tone === "red" ? styles.tokenRed : null,
                    ]}
                  >
                    <AppText
                      style={[
                        styles.tokenText,
                        tone === "white" ? styles.tokenTextWhite : null,
                        tone === "rose" ? styles.tokenTextRose : null,
                        tone === "orange" ? styles.tokenTextOrange : null,
                        tone === "red" ? styles.tokenTextRed : null,
                      ]}
                    >
                      {value}
                    </AppText>
                    <Pressable
                      onPress={() => onChange(selected.filter((item) => item !== value))}
                    >
                      <AppText style={styles.tokenRemove}>x</AppText>
                    </Pressable>
                  </View>
                );
              })}
            </View>
          ) : null}

          {options.length > 0 ? (
            <>
              <DoneTextInput
                value={query}
                onChangeText={setQuery}
                placeholder={placeholder}
                placeholderTextColor={colors.textSecondary}
                style={styles.input}
              />
              {filteredOptions.length > 0 ? (
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  style={styles.suggestionScroll}
                  contentContainerStyle={styles.suggestionScrollContent}
                >
                  <View style={styles.suggestionColumnWrap}>
                    {filteredOptions.map((option) => {
                      const tone = getOptionTone?.(option) ?? "neutral";
                      return (
                        <Pressable
                          key={option}
                          style={[
                            styles.suggestionButton,
                            tone === "white" ? styles.suggestionButtonWhite : null,
                            tone === "rose" ? styles.suggestionButtonRose : null,
                            tone === "orange" ? styles.suggestionButtonOrange : null,
                            tone === "red" ? styles.suggestionButtonRed : null,
                          ]}
                          onPress={() => {
                            onChange([...selected, option]);
                            setQuery("");
                          }}
                        >
                          <AppText
                            numberOfLines={1}
                            style={[
                              styles.suggestionText,
                              tone === "white" ? styles.suggestionTextWhite : null,
                              tone === "rose" ? styles.suggestionTextRose : null,
                              tone === "orange" ? styles.suggestionTextOrange : null,
                              tone === "red" ? styles.suggestionTextRed : null,
                            ]}
                          >
                            {option}
                          </AppText>
                        </Pressable>
                      );
                    })}
                  </View>
                </ScrollView>
              ) : (
                <AppText style={styles.emptyText}>No more matching options.</AppText>
              )}
            </>
          ) : (
            <AppText style={styles.emptyText}>No options were parsed from this list.</AppText>
          )}

          <View style={styles.doneRow}>
            <Pressable style={styles.doneButton} onPress={() => setOpen(false)}>
              <AppText style={styles.doneButtonText}>Done</AppText>
            </Pressable>
          </View>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceTinted,
    overflow: "hidden",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 14,
  },
  headerText: {
    flex: 1,
    gap: 4,
  },
  label: {
    color: colors.textSecondary,
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 2,
    textTransform: "uppercase",
  },
  summary: {
    color: colors.textPrimary,
    fontSize: 14,
    lineHeight: 20,
    fontWeight: "600",
  },
  chevron: {
    color: colors.textSecondary,
    fontSize: 16,
    fontWeight: "700",
  },
  body: {
    gap: 10,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    padding: 14,
  },
  tokenWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  token: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(45,125,70,0.35)",
    backgroundColor: "rgba(45,125,70,0.12)",
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  tokenWhite: {
    borderColor: "rgba(201,168,76,0.45)",
    backgroundColor: "rgba(201,168,76,0.16)",
  },
  tokenRose: {
    borderColor: "rgba(199,104,134,0.45)",
    backgroundColor: "rgba(199,104,134,0.16)",
  },
  tokenOrange: {
    borderColor: "rgba(209,122,42,0.45)",
    backgroundColor: "rgba(209,122,42,0.16)",
  },
  tokenRed: {
    borderColor: colors.borderAccent,
    backgroundColor: colors.accentSoft,
  },
  tokenText: {
    color: colors.success,
    fontSize: 12,
    fontWeight: "700",
  },
  tokenTextWhite: {
    color: colors.accentGold,
  },
  tokenTextRose: {
    color: colors.accentSecondary,
  },
  tokenTextOrange: {
    color: colors.accentGold,
  },
  tokenTextRed: {
    color: colors.accentPurple,
  },
  tokenRemove: {
    color: colors.textPrimary,
    fontSize: 13,
    fontWeight: "700",
  },
  input: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.inputBorder,
    backgroundColor: colors.inputBg,
    color: colors.textPrimary,
    paddingHorizontal: 12,
    paddingVertical: 11,
    fontSize: 14,
  },
  suggestionScroll: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.inputBorder,
    backgroundColor: colors.surfaceRaised,
  },
  suggestionScrollContent: {
    padding: 6,
  },
  suggestionColumnWrap: {
    flexDirection: "column",
    flexWrap: "wrap",
    maxHeight: 160,
    gap: 6,
  },
  suggestionButton: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.border,
    paddingHorizontal: 10,
    paddingVertical: 7,
    width: 130,
  },
  suggestionButtonWhite: {
    borderColor: "rgba(201,168,76,0.30)",
    backgroundColor: "rgba(201,168,76,0.08)",
  },
  suggestionButtonRose: {
    borderColor: "rgba(199,104,134,0.30)",
    backgroundColor: "rgba(199,104,134,0.08)",
  },
  suggestionButtonOrange: {
    borderColor: "rgba(209,122,42,0.30)",
    backgroundColor: "rgba(209,122,42,0.08)",
  },
  suggestionButtonRed: {
    borderColor: colors.borderStrong,
    backgroundColor: colors.accentSoft,
  },
  suggestionText: {
    color: colors.textPrimary,
    fontSize: 11,
  },
  suggestionTextWhite: {
    color: colors.accentGold,
  },
  suggestionTextRose: {
    color: colors.accentSecondary,
  },
  suggestionTextOrange: {
    color: colors.accentGold,
  },
  suggestionTextRed: {
    color: colors.accentPurple,
  },
  emptyText: {
    color: colors.textSecondary,
    fontSize: 13,
    lineHeight: 18,
  },
  doneRow: {
    alignItems: "flex-end",
    marginTop: 2,
  },
  doneButton: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  doneButtonText: {
    color: colors.textPrimary,
    fontSize: 13,
    fontWeight: "700",
  },
});

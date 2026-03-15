import { useMemo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, View } from "react-native";
import type { ListScanFilterAccentTone } from "@cellarsnap/shared";
import { DoneTextInput } from "@/src/components/DoneTextInput";
import { AppText } from "@/src/components/AppText";

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
                      tone === "red" ? styles.tokenRed : null,
                    ]}
                  >
                    <AppText
                      style={[
                        styles.tokenText,
                        tone === "white" ? styles.tokenTextWhite : null,
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
                placeholderTextColor="#71717a"
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
    borderColor: "rgba(255,255,255,0.10)",
    backgroundColor: "rgba(0,0,0,0.22)",
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
    color: "#a1a1aa",
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 2,
    textTransform: "uppercase",
  },
  summary: {
    color: "#f4f4f5",
    fontSize: 14,
    lineHeight: 20,
    fontWeight: "600",
  },
  chevron: {
    color: "#d4d4d8",
    fontSize: 16,
    fontWeight: "700",
  },
  body: {
    gap: 10,
    borderTopWidth: 1,
    borderTopColor: "rgba(255,255,255,0.08)",
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
    borderColor: "rgba(52,211,153,0.35)",
    backgroundColor: "rgba(16,185,129,0.12)",
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  tokenWhite: {
    borderColor: "rgba(201,168,76,0.45)",
    backgroundColor: "rgba(201,168,76,0.16)",
  },
  tokenRed: {
    borderColor: "rgba(74,48,96,0.60)",
    backgroundColor: "rgba(74,48,96,0.72)",
  },
  tokenText: {
    color: "#d1fae5",
    fontSize: 12,
    fontWeight: "700",
  },
  tokenTextWhite: {
    color: "#f5e8bc",
  },
  tokenTextRed: {
    color: "#f3eef8",
  },
  tokenRemove: {
    color: "#f8fafc",
    fontSize: 13,
    fontWeight: "700",
  },
  input: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
    backgroundColor: "#171210",
    color: "#fafafa",
    paddingHorizontal: 12,
    paddingVertical: 11,
    fontSize: 14,
  },
  suggestionScroll: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
    backgroundColor: "#171210",
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
    borderColor: "rgba(255,255,255,0.08)",
    backgroundColor: "rgba(255,255,255,0.06)",
    paddingHorizontal: 10,
    paddingVertical: 7,
    width: 130,
  },
  suggestionButtonWhite: {
    borderColor: "rgba(201,168,76,0.30)",
    backgroundColor: "rgba(201,168,76,0.08)",
  },
  suggestionButtonRed: {
    borderColor: "rgba(74,48,96,0.45)",
    backgroundColor: "rgba(74,48,96,0.15)",
  },
  suggestionText: {
    color: "#e4e4e7",
    fontSize: 11,
  },
  suggestionTextWhite: {
    color: "#e7d491",
  },
  suggestionTextRed: {
    color: "#dbcfe7",
  },
  emptyText: {
    color: "#71717a",
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
    borderColor: "rgba(255,255,255,0.10)",
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  doneButtonText: {
    color: "#e4e4e7",
    fontSize: 13,
    fontWeight: "700",
  },
});

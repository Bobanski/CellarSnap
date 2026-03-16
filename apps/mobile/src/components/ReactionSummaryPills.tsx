import { useEffect, useMemo, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { AppText } from "@/src/components/AppText";
import { colors } from "@/src/lib/theme";

export function ReactionSummaryPills({
  entryId,
  reactionCounts,
  reactionUsers,
  align = "right",
}: {
  entryId: string;
  reactionCounts: Record<string, number>;
  reactionUsers: Record<string, string[]>;
  align?: "left" | "right";
}) {
  const [selectedReactionEmoji, setSelectedReactionEmoji] = useState<string | null>(null);
  const reactions = useMemo(
    () =>
      Object.entries(reactionCounts)
        .filter(([, count]) => count > 0)
        .sort((left, right) => right[1] - left[1]),
    [reactionCounts]
  );

  useEffect(() => {
    if (!selectedReactionEmoji) {
      return;
    }
    if ((reactionCounts[selectedReactionEmoji] ?? 0) > 0) {
      return;
    }
    setSelectedReactionEmoji(null);
  }, [reactionCounts, selectedReactionEmoji]);

  if (reactions.length === 0) {
    return null;
  }

  const visibleReactions = reactions.slice(0, 3);
  const hiddenReactionCount = Math.max(0, reactions.length - visibleReactions.length);

  return (
    <View
      style={[
        styles.row,
        align === "right" ? styles.rowRight : styles.rowLeft,
      ]}
    >
      {visibleReactions.map(([emoji, count]) => {
        const names = reactionUsers[emoji] ?? [];
        const showNames = selectedReactionEmoji === emoji && names.length > 0;

        return (
          <View key={`${entryId}-${emoji}`} style={styles.reactionWrap}>
            {showNames ? (
              <View pointerEvents="box-none" style={styles.namesAnchor}>
                <View style={styles.namesBubble}>
                  <AppText style={styles.namesText}>{names.join(", ")}</AppText>
                </View>
              </View>
            ) : null}
            <Pressable
              disabled={names.length === 0}
              onPress={(event) => {
                event.stopPropagation();
                setSelectedReactionEmoji((current) => (current === emoji ? null : emoji));
              }}
              style={[
                styles.reactionPill,
                names.length === 0 ? styles.reactionPillDisabled : null,
              ]}
            >
              <AppText style={styles.reactionPillText}>
                {emoji} {count}
              </AppText>
            </Pressable>
          </View>
        );
      })}
      {hiddenReactionCount > 0 ? (
        <View style={styles.reactionPill}>
          <AppText style={styles.reactionPillText}>+{hiddenReactionCount}</AppText>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 6,
  },
  rowRight: {
    justifyContent: "flex-end",
  },
  rowLeft: {
    justifyContent: "flex-start",
  },
  reactionWrap: {
    position: "relative",
    alignItems: "center",
  },
  namesAnchor: {
    position: "absolute",
    bottom: "100%",
    left: -64,
    right: -64,
    marginBottom: 6,
    alignItems: "center",
    zIndex: 20,
  },
  namesBubble: {
    maxWidth: 240,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "rgba(245, 237, 214, 0.15)",
    backgroundColor: colors.limestone,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  namesText: {
    color: colors.textPrimary,
    fontSize: 11,
    lineHeight: 15,
    textAlign: "center",
  },
  reactionPill: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(245, 237, 214, 0.15)",
    backgroundColor: "rgba(232, 226, 217, 0.06)",
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  reactionPillDisabled: {
    opacity: 0.75,
  },
  reactionPillText: {
    color: colors.textSecondary,
    fontSize: 11,
    fontWeight: "600",
  },
});

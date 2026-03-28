import type { ReactNode } from "react";
import { StyleSheet, View } from "react-native";
import { AppText } from "@/src/components/AppText";
import { colors } from "@/src/lib/theme";
import { fonts } from "@/src/lib/typography";

function renderInlineMarkdown(text: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  const regex = /(\*\*([^*]+)\*\*|__([^_]+)__|\*([^*\n]+)\*|_([^_\n]+)_)/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(text)) !== null) {
    const index = match.index;
    if (index > lastIndex) {
      nodes.push(text.slice(lastIndex, index));
    }

    const value = match[2] ?? match[3] ?? match[4] ?? match[5] ?? "";
    nodes.push(
      <AppText key={`${index}-${value}`} style={styles.boldInline}>
        {value}
      </AppText>
    );
    lastIndex = index + match[0].length;
  }

  if (lastIndex < text.length) {
    nodes.push(text.slice(lastIndex));
  }

  return nodes;
}

function renderParagraph(text: string, key: string) {
  const normalized = text.trim();
  if (!normalized) {
    return null;
  }

  return (
    <AppText key={key} style={styles.paragraph}>
      {renderInlineMarkdown(normalized)}
    </AppText>
  );
}

function renderHeading(text: string, key: string) {
  const match = text.match(/^(#{1,3})\s+(.+)$/);
  if (!match) {
    return null;
  }

  const level = match[1].length;
  const content = match[2].trim();
  const headingStyle =
    level === 1 ? styles.heading1 : level === 2 ? styles.heading2 : styles.heading3;

  return (
    <AppText key={key} style={headingStyle}>
      {renderInlineMarkdown(content)}
    </AppText>
  );
}

function renderListItems(lines: string[], ordered: boolean) {
  return lines.map((line, index) => {
    const content = ordered
      ? line.replace(/^\d+\.\s+/, "")
      : line.replace(/^[-*]\s+/, "");
    return (
      <View key={`${ordered ? "ol" : "ul"}-${index}`} style={styles.listItem}>
        <AppText style={styles.bullet}>{ordered ? `${index + 1}.` : "•"}</AppText>
        <AppText style={styles.listItemText}>{renderInlineMarkdown(content.trim())}</AppText>
      </View>
    );
  });
}

export default function SommelierMarkdown({ content }: { content: string }) {
  const normalized = content.replace(/\r\n/g, "\n").trim();
  if (!normalized) {
    return null;
  }

  const blocks = normalized.split(/\n{2,}/);

  return (
    <View style={styles.wrapper}>
      {blocks.map((block, blockIndex) => {
        const lines = block
          .split("\n")
          .map((line) => line.trim())
          .filter(Boolean);

        if (lines.length === 0) {
          return null;
        }

        if (lines.length === 1) {
          const heading = renderHeading(lines[0], `heading-${blockIndex}`);
          if (heading) {
            return (
              <View key={`block-${blockIndex}`} style={styles.block}>
                {heading}
              </View>
            );
          }
        }

        const unorderedList = lines.every((line) => /^[-*]\s+/.test(line));
        if (unorderedList) {
          return (
            <View key={`block-${blockIndex}`} style={styles.block}>
              {renderListItems(lines, false)}
            </View>
          );
        }

        const orderedList = lines.every((line) => /^\d+\.\s+/.test(line));
        if (orderedList) {
          return (
            <View key={`block-${blockIndex}`} style={styles.block}>
              {renderListItems(lines, true)}
            </View>
          );
        }

        return (
          <View key={`block-${blockIndex}`} style={styles.block}>
            {renderParagraph(lines.join("\n"), `para-${blockIndex}`)}
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    gap: 8,
  },
  block: {
    gap: 6,
  },
  paragraph: {
    color: colors.textPrimary,
    fontSize: 13,
    lineHeight: 20,
  },
  heading1: {
    color: colors.textPrimary,
    fontFamily: fonts.serif.light,
    fontSize: 17,
    lineHeight: 22,
  },
  heading2: {
    color: colors.textPrimary,
    fontFamily: fonts.sans.medium,
    fontSize: 14,
    lineHeight: 20,
  },
  heading3: {
    color: colors.textPrimary,
    fontFamily: fonts.sans.medium,
    fontSize: 13,
    lineHeight: 18,
  },
  boldInline: {
    color: colors.textPrimary,
    fontFamily: fonts.sans.medium,
  },
  listItem: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
  },
  bullet: {
    color: colors.textPrimary,
    fontSize: 13,
    lineHeight: 20,
    width: 14,
    textAlign: "center",
    fontFamily: fonts.sans.medium,
  },
  listItemText: {
    flex: 1,
    minWidth: 0,
    color: colors.textPrimary,
    fontSize: 13,
    lineHeight: 20,
  },
});

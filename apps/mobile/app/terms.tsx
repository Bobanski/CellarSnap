import { ScrollView, StyleSheet, View } from "react-native";
import { Link } from "expo-router";
import { AppText } from "@/src/components/AppText";
import { colors } from "@/src/lib/theme";
import { TERMS_CONTACT, TERMS_PARAGRAPHS, TERMS_UPDATED } from "@cellarsnap/shared";

export default function TermsScreen() {
  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <View style={styles.card}>
        <View style={styles.head}>
          <AppText style={styles.eyebrow}>Legal</AppText>
          <AppText style={styles.title}>Terms of Use</AppText>
          <AppText style={styles.updated}>Last updated: {TERMS_UPDATED}</AppText>
        </View>

        <View style={styles.section}>
          {TERMS_PARAGRAPHS.map((paragraph) => (
            <AppText key={paragraph} style={styles.paragraph}>{paragraph}</AppText>
          ))}
          <AppText style={styles.paragraph}>Questions about these terms: {TERMS_CONTACT}.</AppText>
        </View>

        <View style={styles.footerRow}>
          <Link href="/privacy" style={styles.footerLink}>
            Privacy
          </Link>
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.screenBg,
  },
  content: {
    paddingHorizontal: 16,
    paddingVertical: 20,
  },
  card: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfacePrimary,
    padding: 16,
    gap: 14,
  },
  head: {
    gap: 4,
  },
  eyebrow: {
    color: colors.rose,
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 1.6,
    textTransform: "uppercase",
  },
  title: {
    color: colors.textPrimary,
    fontSize: 26,
    fontWeight: "700",
  },
  updated: {
    color: colors.textSecondary,
    fontSize: 12,
  },
  section: {
    gap: 10,
  },
  paragraph: {
    color: colors.textSecondary,
    fontSize: 13,
    lineHeight: 19,
  },
  footerRow: {
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: 10,
    alignItems: "center",
  },
  footerLink: {
    color: colors.textSecondary,
    fontSize: 11,
    letterSpacing: 1.2,
    textTransform: "uppercase",
    fontWeight: "600",
  },
});

import { ScrollView, StyleSheet, View } from "react-native";
import { Link } from "expo-router";
import { AppText } from "@/src/components/AppText";
import { colors } from "@/src/lib/theme";

const LAST_UPDATED = "February 12, 2026";

export default function TermsScreen() {
  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <View style={styles.card}>
        <View style={styles.head}>
          <AppText style={styles.eyebrow}>Legal</AppText>
          <AppText style={styles.title}>Terms of Use</AppText>
          <AppText style={styles.updated}>Last updated: {LAST_UPDATED}</AppText>
        </View>

        <View style={styles.section}>
          <AppText style={styles.paragraph}>
            CellarSnap is currently provided as a friends-and-family test product.
            Features may change quickly, and service availability is not guaranteed.
          </AppText>
          <AppText style={styles.paragraph}>
            You are responsible for the content you upload and share. Do not upload
            unlawful content, private data you do not have permission to share, or
            anything that violates others&apos; rights.
          </AppText>
          <AppText style={styles.paragraph}>
            AI-assisted outputs are suggestions and may be wrong. Please verify wine
            details before relying on them.
          </AppText>
          <AppText style={styles.paragraph}>
            We may suspend accounts or remove content to protect users, data integrity,
            or platform security during testing.
          </AppText>
          <AppText style={styles.paragraph}>
            By using CellarSnap, you agree to these terms and the accompanying privacy
            policy.
          </AppText>
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

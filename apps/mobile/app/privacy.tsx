import { ScrollView, StyleSheet, View } from "react-native";
import { Link } from "expo-router";
import { AppText } from "@/src/components/AppText";
import { colors } from "@/src/lib/theme";

const LAST_UPDATED = "February 12, 2026";

export default function PrivacyScreen() {
  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <View style={styles.card}>
        <View style={styles.head}>
          <AppText style={styles.eyebrow}>Legal</AppText>
          <AppText style={styles.title}>Privacy Policy</AppText>
          <AppText style={styles.updated}>Last updated: {LAST_UPDATED}</AppText>
        </View>

        <View style={styles.section}>
          <AppText style={styles.paragraph}>
            CellarSnap stores the account details and wine-log content needed to run
            the app, including profile info, entries, photos, social relationships,
            and feedback submissions.
          </AppText>
          <AppText style={styles.paragraph}>
            Photos and entry metadata are access-controlled by your privacy settings
            (public, friends, or private). Signed URLs are used for photo delivery.
          </AppText>
          <AppText style={styles.paragraph}>
            AI features process uploaded images and notes through OpenAI APIs to
            provide autofill and summary assistance. Do not upload sensitive personal
            images.
          </AppText>
          <AppText style={styles.paragraph}>
            We use operational logs and error telemetry to keep the product reliable
            during testing. Data is retained as needed for product operation and safety.
          </AppText>
          <AppText style={styles.paragraph}>
            For feedback-related requests during the friends-and-family phase, submit a
            note through the in-app feedback page.
          </AppText>
        </View>

        <View style={styles.footerRow}>
          <Link href="/terms" style={styles.footerLink}>
            Terms
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

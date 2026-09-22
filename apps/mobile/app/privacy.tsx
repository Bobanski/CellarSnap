import { ScrollView, StyleSheet, View } from "react-native";
import { Link } from "expo-router";
import { AppText } from "@/src/components/AppText";
import { colors } from "@/src/lib/theme";

import { PRIVACY_UPDATED, PRIVACY_SECTIONS } from "@cellarsnap/shared";
import { AiConsentCard } from "@/src/components/AiConsentCard";
import { useAuth } from "@/src/providers/AuthProvider";

export default function PrivacyScreen() {
  const { user } = useAuth();
  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <View style={styles.card}>
        <View style={styles.head}>
          <AppText style={styles.eyebrow}>Legal</AppText>
          <AppText style={styles.title}>Privacy Policy</AppText>
          <AppText style={styles.updated}>Last updated: {PRIVACY_UPDATED}</AppText>
        </View>

        {user && <AiConsentCard key={user.id} userId={user.id} />}
        {PRIVACY_SECTIONS.map(section => <View key={section.title} style={styles.section}>
          <AppText accessibilityRole="header" style={styles.sectionTitle}>{section.title}</AppText>
          {section.paragraphs.map(text => <AppText key={text} style={styles.paragraph}>{text}</AppText>)}
        </View>)}

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
  sectionTitle: { color: colors.textPrimary, fontSize: 18, fontWeight: "600" },
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

import { ScrollView, StyleSheet, View } from "react-native";
import { Link } from "expo-router";
import { AppText } from "@/src/components/AppText";
import { colors } from "@/src/lib/theme";

const LAST_UPDATED = "March 2026";
const SUPPORT_EMAIL = "cellarsnap@gmail.com";

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
          <View style={styles.sectionBlock}>
            <AppText style={styles.sectionTitle}>1. Acceptance of Terms</AppText>
            <AppText style={styles.paragraph}>
              By downloading, accessing, or using Cluster, you agree to be bound by
              these Terms of Use and our Privacy Policy. If you do not agree, please do
              not use the app.
            </AppText>
            <AppText style={styles.paragraph}>
              Your continued use of Cluster after updates to the app or these terms
              means you accept the revised terms as well.
            </AppText>
          </View>

          <View style={styles.sectionBlock}>
            <AppText style={styles.sectionTitle}>2. Eligibility</AppText>
            <AppText style={styles.paragraph}>
              Cluster is intended only for people who are at least 21 years old, or
              the legal drinking age where they live, whichever is higher.
            </AppText>
            <AppText style={styles.paragraph}>
              You must also have the legal capacity to enter into a binding agreement,
              and you confirm that you satisfied the age gate when you first used the
              app.
            </AppText>
          </View>

          <View style={styles.sectionBlock}>
            <AppText style={styles.sectionTitle}>3. Account Responsibilities</AppText>
            <AppText style={styles.paragraph}>
              You are responsible for keeping your login credentials secure and for all
              activity that happens under your account. Please use accurate, current
              information when creating and maintaining your profile.
            </AppText>
            <AppText style={styles.paragraph}>
              Accounts are personal to the user who created them. Unless we approve it
              in writing, each person may maintain only one account.
            </AppText>
          </View>

          <View style={styles.sectionBlock}>
            <AppText style={styles.sectionTitle}>4. User-Generated Content</AppText>
            <AppText style={styles.paragraph}>
              You keep ownership of the content you create in Cluster, including wine
              entries, photos, tasting notes, reviews, and comments.
            </AppText>
            <AppText style={styles.paragraph}>
              By posting content, you give Cluster a non-exclusive license to host,
              store, reproduce, display, and process that content as needed to operate,
              improve, and secure the app.
            </AppText>
            <AppText style={styles.paragraph}>
              You may not upload unlawful material, harassment, spam, private
              information you do not have permission to share, or content that infringes
              another person&apos;s intellectual property rights. We may remove content
              that violates these terms or harms the community.
            </AppText>
          </View>

          <View style={styles.sectionBlock}>
            <AppText style={styles.sectionTitle}>5. AI-Powered Features</AppText>
            <AppText style={styles.paragraph}>
              Cluster uses artificial intelligence provided by OpenAI for features
              such as label scanning, wine autofill, and Pocket Sommelier responses.
            </AppText>
            <AppText style={styles.paragraph}>
              AI-generated results are suggestions only and may be incomplete, outdated,
              or incorrect. You are responsible for verifying AI-generated information
              before relying on it.
            </AppText>
            <AppText style={styles.paragraph}>
              Using these features may require us to send images, text, and related
              prompts to third-party AI services. Please do not upload sensitive
              personal images, identity documents, or other confidential material.
            </AppText>
          </View>

          <View style={styles.sectionBlock}>
            <AppText style={styles.sectionTitle}>6. Privacy Controls</AppText>
            <AppText style={styles.paragraph}>
              Your entries may be set to public, friends-only, or private. Public
              entries can be visible to other Cluster users, while private entries
              are intended only for you.
            </AppText>
            <AppText style={styles.paragraph}>
              You can change your privacy settings at any time, but changes may not
              retroactively remove content that was already shared or viewed.
            </AppText>
          </View>

          <View style={styles.sectionBlock}>
            <AppText style={styles.sectionTitle}>7. Intellectual Property</AppText>
            <AppText style={styles.paragraph}>
              Cluster, including its branding, software, design, and related
              materials, is owned by Cluster or its licensors and is protected by
              applicable intellectual property laws.
            </AppText>
            <AppText style={styles.paragraph}>
              You may not copy, modify, reverse-engineer, distribute, resell, or create
              derivative works from the app except where the law clearly allows it. If
              we offer paid features in the future, those features may be subject to
              additional terms presented at the time of purchase.
            </AppText>
          </View>

          <View style={styles.sectionBlock}>
            <AppText style={styles.sectionTitle}>8. Suspension and Termination</AppText>
            <AppText style={styles.paragraph}>
              We may suspend, restrict, or terminate accounts that violate these terms,
              create security risks, abuse the service, or expose other users to harm.
            </AppText>
            <AppText style={styles.paragraph}>
              You may delete your account at any time using the tools available in the
              app. When an account is deleted, related data is handled in accordance
              with our Privacy Policy.
            </AppText>
          </View>

          <View style={styles.sectionBlock}>
            <AppText style={styles.sectionTitle}>9. Disclaimers</AppText>
            <AppText style={styles.paragraph}>
              Cluster is provided on an &quot;as is&quot; and &quot;as available&quot;
              basis without warranties of any kind, to the fullest extent permitted by
              law.
            </AppText>
            <AppText style={styles.paragraph}>
              We may change, add, or remove features at any time. We do not guarantee
              uninterrupted availability, error-free performance, or that every wine
              detail, recommendation, or AI response will be accurate.
            </AppText>
            <AppText style={styles.paragraph}>
              Cluster is not responsible for decisions you make based on tasting
              notes, recommendations, pairings, or AI-generated suggestions.
            </AppText>
          </View>

          <View style={styles.sectionBlock}>
            <AppText style={styles.sectionTitle}>10. Limitation of Liability</AppText>
            <AppText style={styles.paragraph}>
              To the maximum extent permitted by law, Cluster and its affiliates,
              service providers, and licensors will not be liable for indirect,
              incidental, special, consequential, or punitive damages arising from or
              related to your use of the app.
            </AppText>
            <AppText style={styles.paragraph}>
              Where liability cannot be excluded, it will be limited to the smallest
              amount permitted under applicable law.
            </AppText>
          </View>

          <View style={styles.sectionBlock}>
            <AppText style={styles.sectionTitle}>11. Changes to These Terms</AppText>
            <AppText style={styles.paragraph}>
              We may update these Terms of Use from time to time to reflect product
              changes, legal requirements, or operational needs.
            </AppText>
            <AppText style={styles.paragraph}>
              If we make material changes, we will notify you through the app or by
              other reasonable means. Continued use of Cluster after the updated
              terms take effect means you accept the changes.
            </AppText>
          </View>

          <View style={styles.sectionBlock}>
            <AppText style={styles.sectionTitle}>12. Contact</AppText>
            <AppText style={styles.paragraph}>
              Questions, support requests, and legal notices can be sent to
              {" "}{SUPPORT_EMAIL}.
            </AppText>
          </View>
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
  sectionBlock: {
    gap: 6,
    marginBottom: 8,
  },
  sectionTitle: {
    color: colors.textPrimary,
    fontSize: 15,
    fontWeight: "700",
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

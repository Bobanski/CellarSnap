import { ScrollView, StyleSheet, View } from "react-native";
import { Link } from "expo-router";
import { AppText } from "@/src/components/AppText";
import { colors } from "@/src/lib/theme";

const LAST_UPDATED = "March 2026";
const SUPPORT_EMAIL = "cellarsnap@gmail.com";

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
          <View style={styles.sectionBlock}>
            <AppText style={styles.sectionTitle}>1. Introduction</AppText>
            <AppText style={styles.paragraph}>
              Cluster is a wine journal and social sharing app that helps you log
              bottles, capture tasting notes, share entries, and explore AI-powered wine
              tools.
            </AppText>
            <AppText style={styles.paragraph}>
              This Privacy Policy explains what information we collect, how we use it,
              when we share it, and the choices you have when using Cluster.
            </AppText>
          </View>

          <View style={styles.sectionBlock}>
            <AppText style={styles.sectionTitle}>2. Information We Collect</AppText>
            <AppText style={styles.paragraph}>
              We collect account information such as your email address, phone number
              when phone authentication is used, username, and display name. You may
              also provide profile information like an avatar image and bio.
            </AppText>
            <AppText style={styles.paragraph}>
              We collect the content you create in the app, including wine photos,
              tasting notes, ratings, bottle details, and location information if you
              choose to add it.
            </AppText>
            <AppText style={styles.paragraph}>
              We also collect social data such as follows, friends, likes, comments,
              and shared entries, along with usage data like app interactions, feature
              usage, crash reports, and error telemetry.
            </AppText>
            <AppText style={styles.paragraph}>
              When you use AI-powered features, we collect the images and text you
              submit to support label scanning, autofill, and Pocket Sommelier
              experiences.
            </AppText>
          </View>

          <View style={styles.sectionBlock}>
            <AppText style={styles.sectionTitle}>3. How We Use Information</AppText>
            <AppText style={styles.paragraph}>
              We use your information to provide, maintain, and improve Cluster,
              including saving entries, personalizing the app, and supporting social
              discovery features.
            </AppText>
            <AppText style={styles.paragraph}>
              We use submitted text and images to process wine entries and power AI
              features like label scanning, autofill, and Pocket Sommelier responses.
            </AppText>
            <AppText style={styles.paragraph}>
              We also use information to send service messages such as verification
              emails and password resets, maintain security, prevent abuse, and produce
              aggregated or anonymized analytics.
            </AppText>
          </View>

          <View style={styles.sectionBlock}>
            <AppText style={styles.sectionTitle}>4. Third-Party Services</AppText>
            <AppText style={styles.paragraph}>
              We use third-party providers to operate Cluster. Supabase provides
              authentication, database services, and file storage on AWS
              infrastructure.
            </AppText>
            <AppText style={styles.paragraph}>
              OpenAI provides AI services for image analysis and text generation, which
              means images and text you submit to AI features are sent to OpenAI&apos;s
              API for processing.
            </AppText>
            <AppText style={styles.paragraph}>
              We also rely on Vercel for web hosting and Expo or EAS for app build and
              distribution infrastructure. These providers maintain their own privacy
              policies and handling practices.
            </AppText>
          </View>

          <View style={styles.sectionBlock}>
            <AppText style={styles.sectionTitle}>5. Data Storage and Security</AppText>
            <AppText style={styles.paragraph}>
              Cluster data is stored through Supabase on AWS infrastructure in the
              US-West-2 region. Photos are stored in Supabase Storage and served using
              signed URLs where applicable.
            </AppText>
            <AppText style={styles.paragraph}>
              Passwords are hashed and are not stored in plaintext. We use row-level
              security on database tables and HTTPS or TLS to protect data in transit.
            </AppText>
            <AppText style={styles.paragraph}>
              No system is perfectly secure, but we use reasonable safeguards designed
              to protect your information from unauthorized access, loss, misuse, or
              disclosure.
            </AppText>
          </View>

          <View style={styles.sectionBlock}>
            <AppText style={styles.sectionTitle}>6. Your Privacy Controls</AppText>
            <AppText style={styles.paragraph}>
              You can choose whether entries are public, friends-only, or private, and
              you can update profile details at any time from within the app.
            </AppText>
            <AppText style={styles.paragraph}>
              You can delete individual entries, remove your entire account and
              associated data, and use in-app tools to block or report other users.
            </AppText>
          </View>

          <View style={styles.sectionBlock}>
            <AppText style={styles.sectionTitle}>7. Data Retention</AppText>
            <AppText style={styles.paragraph}>
              We keep account information and app content for as long as your account
              remains active or as needed to provide the service.
            </AppText>
            <AppText style={styles.paragraph}>
              Deleted content is removed from active systems, but limited copies may
              remain in backups for a short period. Anonymized or aggregated analytics
              may be retained indefinitely.
            </AppText>
          </View>

          <View style={styles.sectionBlock}>
            <AppText style={styles.sectionTitle}>8. Children&apos;s Privacy</AppText>
            <AppText style={styles.paragraph}>
              Cluster is not intended for anyone under 21 years old or under the
              legal drinking age in their jurisdiction. We do not knowingly collect
              personal information from minors.
            </AppText>
            <AppText style={styles.paragraph}>
              If we learn that we collected personal data from someone who is under the
              applicable legal age, we will take steps to delete that information.
            </AppText>
          </View>

          <View style={styles.sectionBlock}>
            <AppText style={styles.sectionTitle}>9. Changes to This Policy</AppText>
            <AppText style={styles.paragraph}>
              We may update this Privacy Policy from time to time to reflect changes in
              our practices, the app, or applicable law.
            </AppText>
            <AppText style={styles.paragraph}>
              If we make material changes, we will communicate them through the app or
              by other reasonable means. Continued use of Cluster after an update
              means you accept the revised policy.
            </AppText>
          </View>

          <View style={styles.sectionBlock}>
            <AppText style={styles.sectionTitle}>10. Contact</AppText>
            <AppText style={styles.paragraph}>
              Privacy and support requests can be sent to {SUPPORT_EMAIL}.
            </AppText>
            <AppText style={styles.paragraph}>
              For privacy-related requests, including access or deletion requests,
              contact us at the email above or use the in-app feedback feature.
            </AppText>
          </View>
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
    backgroundColor: colors.champagne,
  },
  content: {
    paddingHorizontal: 16,
    paddingVertical: 20,
  },
  card: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(44,26,14,0.1)",
    backgroundColor: "rgba(44,26,14,0.05)",
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
    color: colors.terroir,
    fontSize: 26,
    fontWeight: "700",
  },
  updated: {
    color: colors.fog,
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
    color: colors.terroir,
    fontSize: 15,
    fontWeight: "700",
  },
  paragraph: {
    color: colors.fog,
    fontSize: 13,
    lineHeight: 19,
  },
  footerRow: {
    borderTopWidth: 1,
    borderTopColor: "rgba(44,26,14,0.1)",
    paddingTop: 10,
    alignItems: "center",
  },
  footerLink: {
    color: colors.fog,
    fontSize: 11,
    letterSpacing: 1.2,
    textTransform: "uppercase",
    fontWeight: "600",
  },
});

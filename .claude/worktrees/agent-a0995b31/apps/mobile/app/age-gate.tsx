import { useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from "react-native";
import { router } from "expo-router";
import { AppText } from "@/src/components/AppText";
import { useAgeVerification } from "@/src/lib/ageVerificationContext";
import { colors } from "@/src/lib/theme";

export default function AgeGateScreen() {
  const { confirmAgeVerification } = useAgeVerification();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [declineMessage, setDeclineMessage] = useState<string | null>(null);

  const handleConfirm = async () => {
    setIsSubmitting(true);
    setErrorMessage(null);
    setDeclineMessage(null);

    try {
      await confirmAgeVerification();
      router.replace("/(auth)/sign-in");
    } catch {
      setErrorMessage("We couldn't save your confirmation. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDecline = () => {
    setErrorMessage(null);
    setDeclineMessage("You must be of legal age to use this app.");
  };

  return (
    <View style={styles.screen}>
      <View style={styles.blobTop} />
      <View style={styles.blobBottom} />
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.card}>
          <View style={styles.brandWrap}>
            <AppText style={styles.eyebrow}>Age Verification</AppText>
            <AppText style={styles.wordmark}>Cluster</AppText>
          </View>

          <View style={styles.badgeWrap}>
            <View style={styles.badge}>
              <AppText style={styles.badgeText}>21+</AppText>
            </View>
          </View>

          <View style={styles.copyWrap}>
            <AppText style={styles.title}>
              You must be of legal drinking age in your country to use Cluster.
            </AppText>
            <AppText style={styles.subtitle}>
              By continuing, you confirm you are of legal drinking age in your jurisdiction.
            </AppText>
          </View>

          {errorMessage ? <AppText style={styles.errorText}>{errorMessage}</AppText> : null}
          {declineMessage ? <AppText style={styles.declineText}>{declineMessage}</AppText> : null}

          <Pressable
            accessibilityRole="button"
            disabled={isSubmitting}
            onPress={() => void handleConfirm()}
            style={[styles.primaryButton, isSubmitting ? styles.primaryButtonDisabled : null]}
          >
            {isSubmitting ? (
              <ActivityIndicator color={colors.champagne} />
            ) : (
              <AppText style={styles.primaryButtonText}>I am 21 or older</AppText>
            )}
          </Pressable>

          <Pressable
            accessibilityRole="button"
            disabled={isSubmitting}
            onPress={handleDecline}
            style={styles.secondaryButton}
          >
            <AppText style={styles.secondaryButtonText}>I am under 21</AppText>
          </Pressable>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.champagne,
  },
  blobTop: {
    position: "absolute",
    top: -120,
    right: -60,
    width: 300,
    height: 300,
    borderRadius: 150,
    backgroundColor: "rgba(123, 29, 58, 0.10)",
  },
  blobBottom: {
    position: "absolute",
    bottom: -150,
    left: -80,
    width: 320,
    height: 320,
    borderRadius: 160,
    backgroundColor: "rgba(74, 48, 96, 0.08)",
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: "center",
    paddingHorizontal: 18,
    paddingVertical: 24,
  },
  card: {
    width: "100%",
    maxWidth: 480,
    alignSelf: "center",
    borderRadius: 24,
    borderWidth: 1,
    borderColor: "rgba(44,26,14,0.1)",
    backgroundColor: "rgba(44,26,14,0.05)",
    paddingHorizontal: 20,
    paddingVertical: 24,
    shadowColor: colors.shadowColor,
    shadowOpacity: 0.15,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 12 },
    elevation: 12,
    gap: 18,
  },
  brandWrap: {
    gap: 8,
    alignItems: "center",
  },
  eyebrow: {
    color: colors.rose,
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 2,
    textTransform: "uppercase",
  },
  wordmark: {
    color: colors.terroir,
    fontSize: 30,
    fontWeight: "700",
    textAlign: "center",
  },
  badgeWrap: {
    alignItems: "center",
  },
  badge: {
    width: 108,
    height: 108,
    borderRadius: 54,
    borderWidth: 1,
    borderColor: "rgba(123,29,58,0.4)",
    backgroundColor: "rgba(123,29,58,0.12)",
    alignItems: "center",
    justifyContent: "center",
  },
  badgeText: {
    color: colors.terroir,
    fontSize: 34,
    fontWeight: "700",
    letterSpacing: 1,
  },
  copyWrap: {
    gap: 10,
  },
  title: {
    color: colors.terroir,
    fontSize: 30,
    fontWeight: "700",
    lineHeight: 36,
    textAlign: "center",
  },
  subtitle: {
    color: colors.fog,
    fontSize: 14,
    lineHeight: 20,
    textAlign: "center",
  },
  errorText: {
    color: colors.error,
    fontSize: 13,
    lineHeight: 18,
    textAlign: "center",
  },
  declineText: {
    color: colors.fog,
    fontSize: 13,
    lineHeight: 18,
    textAlign: "center",
  },
  primaryButton: {
    minHeight: 46,
    borderRadius: 12,
    backgroundColor: colors.grenache,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 16,
  },
  primaryButtonDisabled: {
    opacity: 0.72,
  },
  primaryButtonText: {
    color: colors.champagne,
    fontSize: 15,
    fontWeight: "700",
  },
  secondaryButton: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 6,
  },
  secondaryButtonText: {
    color: colors.fog,
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 1.5,
    textTransform: "uppercase",
  },
});

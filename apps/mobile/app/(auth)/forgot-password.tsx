import {
  useMemo,
  useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  View
} from "react-native";
import { Link, router } from "expo-router";
import {
  getAuthMode,
  type AuthMode,
} from "@cellarsnap/shared";
import { startPasswordRecovery } from "@/src/lib/api/auth";
import { DoneTextInput } from "@/src/components/DoneTextInput";
import { AppText } from "@/src/components/AppText";
import { colors } from "@/src/lib/theme";

function getRecoveryHelperText(authMode: AuthMode) {
  if (authMode === "phone") {
    return "Enter your username, phone number, or email. Phone numbers receive a recovery code by SMS. Usernames and emails receive a recovery email.";
  }
  return "Enter your username, phone number, or email. We will send a recovery code to your email.";
}

export default function ForgotPasswordScreen() {
  const authMode = useMemo(
    () => getAuthMode(process.env.EXPO_PUBLIC_AUTH_MODE),
    []
  );
  const [identifier, setIdentifier] = useState("");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [infoMessage, setInfoMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const submitRecovery = async () => {
    const normalizedIdentifier = identifier.trim();
    if (!normalizedIdentifier) {
      setErrorMessage("Enter your username, phone number, or email.");
      return;
    }

    setIsSubmitting(true);
    setErrorMessage(null);
    setInfoMessage(null);

    try {
      const result = await startPasswordRecovery(normalizedIdentifier);
      if (!result.ok) {
        setErrorMessage(result.errorMessage);
        return;
      }

      if (result.channel === "phone") {
        setInfoMessage("Verification code sent to your phone number.");
        router.push({
          pathname: "/(auth)/verify-phone",
          params: { phone: result.phone, mode: "recovery" },
        });
        return;
      }
      setInfoMessage("Recovery email sent. Use the 6-digit code from that email to reset your password.");
      router.push({
        pathname: "/(auth)/reset-password",
        params: {
          email: normalizedIdentifier.includes("@")
            ? normalizedIdentifier.toLowerCase()
            : undefined,
        },
      });
    } catch {
      setErrorMessage("Unable to start recovery. Check your connection and try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      style={styles.screen}
    >
      <View style={styles.blobTop} />
      <View style={styles.blobBottom} />
      <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
        <View style={styles.card}>
          <View style={styles.headBlock}>
            <AppText style={styles.eyebrow}>Reset access</AppText>
            <AppText style={styles.title}>Forgot your password?</AppText>
            <AppText style={styles.subtitle}>{getRecoveryHelperText(authMode)}</AppText>
          </View>

          <View style={styles.formField}>
            <AppText style={styles.label}>Username, phone, or email</AppText>
            <DoneTextInput
              value={identifier}
              onChangeText={setIdentifier}
              autoCapitalize="none"
              autoCorrect={false}
              placeholder="username or (555) 123-4567"
              placeholderTextColor={colors.textTertiary}
              style={styles.input}
            />
          </View>

          {errorMessage ? <AppText style={styles.errorText}>{errorMessage}</AppText> : null}
          {infoMessage ? <AppText style={styles.infoText}>{infoMessage}</AppText> : null}

          <Pressable
            onPress={() => void submitRecovery()}
            disabled={isSubmitting}
            style={[styles.primaryButton, isSubmitting ? styles.disabledButton : null]}
          >
            <AppText style={styles.primaryButtonText}>
              {isSubmitting ? "Sending..." : "Send recovery code"}
            </AppText>
          </Pressable>

          <View style={styles.backRow}>
            <Link href="/(auth)/sign-in" style={styles.backLink}>
              Back to sign in
            </Link>
          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.screenBg,
  },
  blobTop: {
    position: "absolute",
    top: -140,
    right: -60,
    width: 340,
    height: 340,
    borderRadius: 170,
    backgroundColor: "rgba(123, 29, 58, 0.10)",
  },
  blobBottom: {
    position: "absolute",
    bottom: -160,
    left: -90,
    width: 360,
    height: 360,
    borderRadius: 180,
    backgroundColor: colors.accentSoft,
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
    borderColor: colors.border,
    backgroundColor: colors.surfacePrimary,
    paddingHorizontal: 20,
    paddingVertical: 22,
    shadowColor: colors.shadowColor,
    shadowOpacity: 0.15,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 12 },
    elevation: 12,
    gap: 12,
  },
  headBlock: {
    gap: 5,
  },
  eyebrow: {
    color: colors.rose,
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 2,
    textTransform: "uppercase",
  },
  title: {
    color: colors.textPrimary,
    fontSize: 30,
    fontWeight: "700",
  },
  subtitle: {
    color: colors.textSecondary,
    fontSize: 14,
    lineHeight: 20,
  },
  formField: {
    gap: 6,
  },
  label: {
    color: colors.textPrimary,
    fontSize: 14,
    fontWeight: "600",
  },
  input: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.inputBorder,
    backgroundColor: colors.inputBg,
    color: colors.textPrimary,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
  },
  errorText: {
    color: colors.error,
    fontSize: 13,
  },
  infoText: {
    color: colors.success,
    fontSize: 13,
  },
  primaryButton: {
    marginTop: 2,
    borderRadius: 12,
    backgroundColor: colors.grenache,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 12,
    minHeight: 46,
  },
  primaryButtonText: {
    color: colors.textPrimary,
    fontSize: 14,
    fontWeight: "700",
  },
  disabledButton: {
    opacity: 0.55,
  },
  backRow: {
    marginTop: 2,
    alignItems: "center",
  },
  backLink: {
    color: colors.textSecondary,
    fontSize: 11,
    letterSpacing: 1.2,
    textTransform: "uppercase",
    fontWeight: "600",
  },
});

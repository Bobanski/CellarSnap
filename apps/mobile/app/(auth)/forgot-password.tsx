import { useMemo, useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { Link, router } from "expo-router";
import {
  getAuthMode,
  resolveSignInIdentifier,
  type AuthMode,
} from "@cellarsnap/shared";
import { buildAuthRedirectUrl, supabase } from "@/src/lib/supabase";

function getRecoveryHelperText(authMode: AuthMode) {
  if (authMode === "phone") {
    return "Enter your username, phone number, or email. We will send a recovery code to your phone (or email if no phone is available).";
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
      const resolved = await resolveSignInIdentifier({
        client: supabase,
        identifier: normalizedIdentifier,
        mode: "auto",
      });
      const email = resolved.email?.trim().toLowerCase() ?? "";
      const phone = resolved.phone?.trim() ?? "";

      if (!phone && !email) {
        setErrorMessage("No account matches that identifier.");
        return;
      }

      if (authMode === "phone" && phone) {
        const { error } = await supabase.auth.signInWithOtp({
          phone,
          options: { shouldCreateUser: false },
        });
        if (error) {
          setErrorMessage(error.message);
          return;
        }

        setInfoMessage("Verification code sent to your phone number.");
        router.push({
          pathname: "/(auth)/verify-phone",
          params: { phone, mode: "recovery" },
        });
        return;
      }

      if (!email) {
        setErrorMessage(
          authMode === "phone"
            ? "This account does not have a phone number for recovery."
            : "No account matches that identifier."
        );
        return;
      }

      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: buildAuthRedirectUrl(),
      });
      if (error) {
        setErrorMessage(error.message);
        return;
      }

      setInfoMessage("Recovery email sent. Use the 6-digit code from that email to reset your password.");
      router.push({
        pathname: "/(auth)/reset-password",
        params: { email },
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
            <Text style={styles.eyebrow}>Reset access</Text>
            <Text style={styles.title}>Forgot your password?</Text>
            <Text style={styles.subtitle}>{getRecoveryHelperText(authMode)}</Text>
          </View>

          <View style={styles.formField}>
            <Text style={styles.label}>Username, phone, or email</Text>
            <TextInput
              value={identifier}
              onChangeText={setIdentifier}
              autoCapitalize="none"
              autoCorrect={false}
              placeholder="username or (555) 123-4567"
              placeholderTextColor="#71717a"
              style={styles.input}
            />
          </View>

          {errorMessage ? <Text style={styles.errorText}>{errorMessage}</Text> : null}
          {infoMessage ? <Text style={styles.infoText}>{infoMessage}</Text> : null}

          <Pressable
            onPress={() => void submitRecovery()}
            disabled={isSubmitting}
            style={[styles.primaryButton, isSubmitting ? styles.disabledButton : null]}
          >
            <Text style={styles.primaryButtonText}>
              {isSubmitting ? "Sending..." : "Send recovery code"}
            </Text>
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
    backgroundColor: "#0f0a09",
  },
  blobTop: {
    position: "absolute",
    top: -140,
    right: -60,
    width: 340,
    height: 340,
    borderRadius: 170,
    backgroundColor: "rgba(245, 158, 11, 0.15)",
  },
  blobBottom: {
    position: "absolute",
    bottom: -160,
    left: -90,
    width: 360,
    height: 360,
    borderRadius: 180,
    backgroundColor: "rgba(244, 63, 94, 0.12)",
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
    borderColor: "rgba(255, 255, 255, 0.1)",
    backgroundColor: "rgba(255, 255, 255, 0.05)",
    paddingHorizontal: 20,
    paddingVertical: 22,
    shadowColor: "#000000",
    shadowOpacity: 0.45,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 12 },
    elevation: 12,
    gap: 12,
  },
  headBlock: {
    gap: 5,
  },
  eyebrow: {
    color: "#fcd34d",
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 2,
    textTransform: "uppercase",
  },
  title: {
    color: "#fafafa",
    fontSize: 30,
    fontWeight: "700",
  },
  subtitle: {
    color: "#d4d4d8",
    fontSize: 14,
    lineHeight: 20,
  },
  formField: {
    gap: 6,
  },
  label: {
    color: "#e4e4e7",
    fontSize: 14,
    fontWeight: "600",
  },
  input: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.1)",
    backgroundColor: "rgba(0, 0, 0, 0.3)",
    color: "#f4f4f5",
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
  },
  errorText: {
    color: "#fda4af",
    fontSize: 13,
  },
  infoText: {
    color: "#6ee7b7",
    fontSize: 13,
  },
  primaryButton: {
    marginTop: 2,
    borderRadius: 12,
    backgroundColor: "#fbbf24",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 12,
    minHeight: 46,
  },
  primaryButtonText: {
    color: "#09090b",
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
    color: "#a1a1aa",
    fontSize: 11,
    letterSpacing: 1.2,
    textTransform: "uppercase",
    fontWeight: "600",
  },
});

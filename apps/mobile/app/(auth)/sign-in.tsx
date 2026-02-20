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
  resolveSignInIdentifier,
  type AuthMode,
} from "@cellarsnap/shared";
import { supabase } from "@/src/lib/supabase";
import { DoneTextInput } from "@/src/components/DoneTextInput";
import { AppText } from "@/src/components/AppText";

const INPUT_SELECTION_COLOR = "#52525b";

function getCredentialText(authMode: AuthMode) {
  return authMode === "phone" ? "Username or phone number" : "Email or username";
}

export default function SignInScreen() {
  const authMode = useMemo(
    () => getAuthMode(process.env.EXPO_PUBLIC_AUTH_MODE),
    []
  );
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [infoMessage, setInfoMessage] = useState<string | null>(null);

  const canSubmit = !isSubmitting;

  const submitPasswordSignIn = async () => {
    setIsSubmitting(true);
    setErrorMessage(null);
    setInfoMessage("Signing in...");

    try {
      const normalizedIdentifier = identifier.trim();
      if (!normalizedIdentifier) {
        setErrorMessage(
          authMode === "phone"
            ? "Username or phone number is required."
            : "Email or username is required."
        );
        setInfoMessage(null);
        return;
      }

      const resolved = await resolveSignInIdentifier({
        client: supabase,
        identifier: normalizedIdentifier,
        mode: "auto",
      });

      const phone = resolved.phone?.trim() ?? "";
      const email = resolved.email?.trim().toLowerCase() ?? "";
      if (!phone && !email) {
        setErrorMessage("No account matches that sign-in identifier.");
        setInfoMessage(null);
        return;
      }

      const credential =
        authMode === "phone" && phone
          ? { phone, password }
          : email
            ? { email, password }
            : null;

      if (!credential) {
        setErrorMessage("No account matches that sign-in identifier.");
        setInfoMessage(null);
        return;
      }

      const { error } = await supabase.auth.signInWithPassword(credential);
      if (error) {
        setErrorMessage(error.message);
        setInfoMessage(null);
        return;
      }

      router.replace("/(app)/entries");
    } catch {
      setErrorMessage("Unable to sign in. Check your connection and try again.");
      setInfoMessage(null);
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
          <View style={styles.brandRow}>
            <View style={styles.brandTextWrap}>
              <AppText style={styles.brandName}>CellarSnap</AppText>
              <AppText style={styles.brandSubtitle}>
                A private cellar journal with a social pour.
              </AppText>
            </View>
            <View style={styles.betaChip}>
              <AppText style={styles.betaText}>BETA</AppText>
            </View>
          </View>

          <View style={styles.formField}>
            <AppText style={styles.label}>{getCredentialText(authMode)}</AppText>
            <DoneTextInput
              value={identifier}
              onChangeText={setIdentifier}
              autoCapitalize="none"
              autoCorrect={false}
              autoComplete={authMode === "phone" ? "username" : "email"}
              textContentType={authMode === "phone" ? "username" : "emailAddress"}
              selectionColor={INPUT_SELECTION_COLOR}
              placeholder={
                authMode === "phone"
                  ? "username or (555) 123-4567"
                  : "you@example.com or username"
              }
              placeholderTextColor="#71717a"
              style={styles.input}
            />
            <AppText style={styles.helperText}>
              {authMode === "phone"
                ? "You can also paste your email address."
                : "You can sign in with email or username."}
            </AppText>
          </View>

          <View style={styles.formField}>
            <AppText style={styles.label}>Password</AppText>
            <View style={styles.passwordWrap}>
              <DoneTextInput
                value={password}
                onChangeText={setPassword}
                secureTextEntry={!showPassword}
                autoCapitalize="none"
                autoCorrect={false}
                autoComplete="current-password"
                textContentType="password"
                selectionColor={INPUT_SELECTION_COLOR}
                placeholder="********"
                placeholderTextColor="#71717a"
                style={styles.passwordInput}
              />
              <Pressable
                onPress={() => setShowPassword((previous) => !previous)}
                style={styles.passwordToggle}
              >
                <AppText style={styles.passwordToggleText}>{showPassword ? "Hide" : "Show"}</AppText>
              </Pressable>
            </View>
          </View>

          {errorMessage ? <AppText style={styles.errorText}>{errorMessage}</AppText> : null}
          {infoMessage ? <AppText style={styles.infoText}>{infoMessage}</AppText> : null}

          <Pressable
            onPress={() => void submitPasswordSignIn()}
            disabled={!canSubmit}
            style={[styles.primaryButton, !canSubmit ? styles.disabledButton : null]}
          >
            <AppText style={styles.primaryButtonText}>{isSubmitting ? "Signing in..." : "Sign In"}</AppText>
          </Pressable>

          <Link href="/(auth)/sign-up" asChild>
            <Pressable style={styles.secondaryButton}>
              <AppText style={styles.secondaryButtonText}>Create Account</AppText>
            </Pressable>
          </Link>

          <View style={styles.forgotPasswordWrap}>
            <Link href="/(auth)/forgot-password" style={styles.forgotPasswordLink}>
              Forgot password?
            </Link>
          </View>

          <View style={styles.legalRow}>
            <AppText style={styles.legalLink}>Privacy</AppText>
            <AppText style={styles.legalSeparator}> · </AppText>
            <AppText style={styles.legalLink}>Terms</AppText>
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
    gap: 14,
  },
  brandRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  brandTextWrap: {
    flex: 1,
    gap: 6,
  },
  brandName: {
    color: "#fafafa",
    fontSize: 28,
    fontWeight: "700",
  },
  brandSubtitle: {
    color: "#d4d4d8",
    fontSize: 14,
    lineHeight: 20,
  },
  betaChip: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.1)",
    backgroundColor: "rgba(255, 255, 255, 0.1)",
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  betaText: {
    color: "#e4e4e7",
    fontSize: 10,
    letterSpacing: 1.3,
    fontWeight: "700",
  },
  formField: {
    gap: 6,
  },
  label: {
    color: "#e4e4e7",
    fontSize: 14,
    fontWeight: "600",
  },
  helperText: {
    color: "#71717a",
    fontSize: 12,
    lineHeight: 17,
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
  passwordWrap: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.1)",
    backgroundColor: "rgba(0, 0, 0, 0.3)",
    paddingLeft: 12,
    paddingRight: 8,
  },
  passwordInput: {
    flex: 1,
    color: "#f4f4f5",
    paddingVertical: 10,
    fontSize: 14,
  },
  passwordToggle: {
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 5,
  },
  passwordToggleText: {
    color: "#d4d4d8",
    fontSize: 11,
    letterSpacing: 0.8,
    fontWeight: "700",
    textTransform: "uppercase",
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
    borderRadius: 12,
    backgroundColor: "#fbbf24",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 12,
    minHeight: 46,
  },
  disabledButton: {
    opacity: 0.55,
  },
  primaryButtonText: {
    color: "#09090b",
    fontSize: 14,
    fontWeight: "700",
  },
  secondaryButton: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.1)",
    alignItems: "center",
    paddingVertical: 12,
  },
  secondaryButtonText: {
    color: "#e4e4e7",
    fontSize: 14,
    fontWeight: "600",
  },
  forgotPasswordWrap: {
    alignItems: "center",
  },
  forgotPasswordLink: {
    color: "#a1a1aa",
    fontSize: 11,
    letterSpacing: 1.2,
    textTransform: "uppercase",
    fontWeight: "600",
  },
  legalRow: {
    marginTop: 2,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
  },
  legalLink: {
    color: "#71717a",
    fontSize: 11,
    letterSpacing: 1.2,
    textTransform: "uppercase",
    fontWeight: "600",
  },
  legalSeparator: {
    color: "#71717a",
    fontSize: 11,
    letterSpacing: 1.2,
  },
});


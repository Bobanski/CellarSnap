import { useEffect, useMemo, useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Link, router, useLocalSearchParams } from "expo-router";
import { supabase } from "@/src/lib/supabase";
import { DoneTextInput } from "@/src/components/DoneTextInput";

const INPUT_SELECTION_COLOR = "#52525b";

export default function ResetPasswordScreen() {
  const params = useLocalSearchParams<{ email?: string }>();
  const defaultEmail = useMemo(
    () => (typeof params.email === "string" ? params.email.trim().toLowerCase() : ""),
    [params.email]
  );
  const [email, setEmail] = useState(defaultEmail);
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [infoMessage, setInfoMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isReady, setIsReady] = useState(false);
  const [hasSession, setHasSession] = useState(false);

  useEffect(() => {
    let isMounted = true;

    setEmail((previous) => previous || defaultEmail);
    void (async () => {
      try {
        const { data } = await supabase.auth.getSession();
        if (isMounted) {
          setHasSession(Boolean(data.session));
        }
      } finally {
        if (isMounted) {
          setIsReady(true);
        }
      }
    })();

    return () => {
      isMounted = false;
    };
  }, [defaultEmail]);

  const updatePassword = async () => {
    if (password.length < 8) {
      setErrorMessage("Password must be at least 8 characters.");
      return;
    }
    if (password.length > 72) {
      setErrorMessage("Password must be 72 characters or fewer.");
      return;
    }
    if (password !== confirmPassword) {
      setErrorMessage("Passwords do not match.");
      return;
    }

    setIsSubmitting(true);
    setErrorMessage(null);
    setInfoMessage(null);

    try {
      if (!hasSession) {
        const normalizedEmail = email.trim().toLowerCase();
        const normalizedCode = code.trim();

        if (!normalizedEmail || !normalizedEmail.includes("@")) {
          setErrorMessage("A valid email is required.");
          return;
        }
        if (!normalizedCode) {
          setErrorMessage("Recovery code is required.");
          return;
        }

        const { error: verifyError } = await supabase.auth.verifyOtp({
          email: normalizedEmail,
          token: normalizedCode,
          type: "recovery",
        });
        if (verifyError) {
          setErrorMessage(verifyError.message);
          return;
        }

        const { data } = await supabase.auth.getSession();
        if (!data.session) {
          setErrorMessage("Unable to verify recovery code.");
          return;
        }

        setHasSession(true);
      }

      const { error } = await supabase.auth.updateUser({ password });
      if (error) {
        setErrorMessage(error.message);
        return;
      }

      setInfoMessage("Password updated. Redirecting to your cellar...");
      router.replace("/(app)/entries");
    } catch {
      setErrorMessage("Unable to update password right now.");
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
            <Text style={styles.title}>Set a new password</Text>
            <Text style={styles.subtitle}>Choose a new password for your account.</Text>
          </View>

          {!isReady ? (
            <Text style={styles.loadingText}>Preparing reset form...</Text>
          ) : (
            <>
              {!hasSession ? (
                <>
                  <View style={styles.formField}>
                    <Text style={styles.label}>Email address</Text>
                    <DoneTextInput
                      value={email}
                      onChangeText={setEmail}
                      autoCapitalize="none"
                      autoCorrect={false}
                      autoComplete="email"
                      textContentType="emailAddress"
                      selectionColor={INPUT_SELECTION_COLOR}
                      keyboardType="email-address"
                      placeholder="you@example.com"
                      placeholderTextColor="#71717a"
                      style={styles.input}
                    />
                  </View>

                  <View style={styles.formField}>
                    <Text style={styles.label}>Recovery code</Text>
                    <DoneTextInput
                      value={code}
                      onChangeText={setCode}
                      autoCapitalize="none"
                      autoCorrect={false}
                      autoComplete="one-time-code"
                      textContentType="oneTimeCode"
                      selectionColor={INPUT_SELECTION_COLOR}
                      keyboardType="number-pad"
                      placeholder="6-digit code"
                      placeholderTextColor="#71717a"
                      style={styles.input}
                    />
                    <View style={styles.resendRow}>
                      <Text style={styles.resendText}>Need a new code? </Text>
                      <Link href="/(auth)/forgot-password" style={styles.resendLink}>
                        Go back and resend.
                      </Link>
                    </View>
                  </View>
                </>
              ) : null}

              <View style={styles.formField}>
                <Text style={styles.label}>New password</Text>
                <View style={styles.passwordWrap}>
                  <DoneTextInput
                    value={password}
                    onChangeText={setPassword}
                    secureTextEntry={!showPassword}
                    autoCapitalize="none"
                    autoCorrect={false}
                    autoComplete="new-password"
                    textContentType="newPassword"
                    selectionColor={INPUT_SELECTION_COLOR}
                    placeholder="At least 8 characters"
                    placeholderTextColor="#71717a"
                    style={styles.passwordInput}
                  />
                  <Pressable
                    onPress={() => setShowPassword((previous) => !previous)}
                    style={styles.passwordToggle}
                  >
                    <Text style={styles.passwordToggleText}>{showPassword ? "Hide" : "Show"}</Text>
                  </Pressable>
                </View>
              </View>

              <View style={styles.formField}>
                <Text style={styles.label}>Confirm new password</Text>
                <DoneTextInput
                  value={confirmPassword}
                  onChangeText={setConfirmPassword}
                  secureTextEntry={!showPassword}
                  autoCapitalize="none"
                  autoCorrect={false}
                  autoComplete="new-password"
                  textContentType="newPassword"
                  selectionColor={INPUT_SELECTION_COLOR}
                  placeholder="Repeat password"
                  placeholderTextColor="#71717a"
                  style={styles.input}
                />
              </View>

              {errorMessage ? <Text style={styles.errorText}>{errorMessage}</Text> : null}
              {infoMessage ? <Text style={styles.infoText}>{infoMessage}</Text> : null}

              <Pressable
                onPress={() => void updatePassword()}
                disabled={isSubmitting}
                style={[styles.primaryButton, isSubmitting ? styles.disabledButton : null]}
              >
                <Text style={styles.primaryButtonText}>
                  {isSubmitting ? "Updating..." : "Update password"}
                </Text>
              </Pressable>

              <View style={styles.backRow}>
                <Link href="/(auth)/sign-in" style={styles.backLink}>
                  Back to sign in
                </Link>
              </View>
            </>
          )}
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
  loadingText: {
    color: "#d4d4d8",
    fontSize: 14,
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
  resendRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  resendText: {
    color: "#71717a",
    fontSize: 12,
  },
  resendLink: {
    color: "#e4e4e7",
    fontSize: 12,
    fontWeight: "600",
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

import {
  useEffect,
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
import { Link, router, useLocalSearchParams } from "expo-router";
import { normalizePhone, PHONE_FORMAT_MESSAGE } from "@cellarsnap/shared";
import { supabase } from "@/src/lib/supabase";
import { DoneTextInput } from "@/src/components/DoneTextInput";
import { AppText } from "@/src/components/AppText";
import { colors } from "@/src/lib/theme";

const INPUT_SELECTION_COLOR = colors.textSecondary;

export default function ResetPasswordScreen() {
  const params = useLocalSearchParams<{ email?: string; phone?: string }>();
  const defaultEmail = useMemo(
    () => (typeof params.email === "string" ? params.email.trim().toLowerCase() : ""),
    [params.email]
  );
  const defaultPhone = useMemo(() => {
    const raw = typeof params.phone === "string" ? params.phone : "";
    const normalized = normalizePhone(raw);
    return normalized ?? raw;
  }, [params.phone]);
  const isPhoneRecovery = Boolean(defaultPhone);
  const [email, setEmail] = useState(defaultEmail);
  const [phone, setPhone] = useState(defaultPhone);
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
    setPhone((previous) => previous || defaultPhone);
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
  }, [defaultEmail, defaultPhone]);

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
        const normalizedPhone = normalizePhone(phone);
        const normalizedCode = code.trim();

        if (isPhoneRecovery) {
          if (!normalizedPhone) {
            setErrorMessage(PHONE_FORMAT_MESSAGE);
            return;
          }
        } else if (!normalizedEmail || !normalizedEmail.includes("@")) {
          setErrorMessage("A valid email is required.");
          return;
        }

        if (!normalizedCode) {
          setErrorMessage("Recovery code is required.");
          return;
        }

        const { error: verifyError } = await supabase.auth.verifyOtp(
          isPhoneRecovery
            ? {
                phone: normalizedPhone!,
                token: normalizedCode,
                type: "sms",
              }
            : {
                email: normalizedEmail,
                token: normalizedCode,
                type: "recovery",
              }
        );
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

      if (isPhoneRecovery) {
        try {
          window.sessionStorage.removeItem("pendingRecoveryPhone");
        } catch {
          // Ignore storage failures.
        }
      } else {
        try {
          window.sessionStorage.removeItem("pendingRecoveryEmail");
        } catch {
          // Ignore storage failures.
        }
      }

      setInfoMessage("Password updated. Redirecting to your cellar...");
      router.replace("/(app)/home");
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
            <AppText style={styles.eyebrow}>Reset access</AppText>
            <AppText style={styles.title}>Set a new password</AppText>
            <AppText style={styles.subtitle}>Choose a new password for your account.</AppText>
          </View>

          {!isReady ? (
            <AppText style={styles.loadingText}>Preparing reset form...</AppText>
          ) : (
            <>
              {!hasSession ? (
                <>
                  <View style={styles.formField}>
                    <AppText style={styles.label}>
                      {isPhoneRecovery ? "Phone number" : "Email address"}
                    </AppText>
                    <DoneTextInput
                      value={isPhoneRecovery ? phone : email}
                      onChangeText={isPhoneRecovery ? setPhone : setEmail}
                      autoCapitalize="none"
                      autoCorrect={false}
                      autoComplete={isPhoneRecovery ? "tel" : "email"}
                      textContentType={isPhoneRecovery ? "telephoneNumber" : "emailAddress"}
                      selectionColor={INPUT_SELECTION_COLOR}
                      keyboardType={isPhoneRecovery ? "phone-pad" : "email-address"}
                      placeholder={isPhoneRecovery ? "(555) 123-4567" : "you@example.com"}
                      placeholderTextColor={colors.textTertiary}
                      style={styles.input}
                    />
                  </View>

                  <View style={styles.formField}>
                    <AppText style={styles.label}>Recovery code</AppText>
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
                      placeholderTextColor={colors.textTertiary}
                      style={styles.input}
                    />
                    <View style={styles.resendRow}>
                      <AppText style={styles.resendText}>Need a new code? </AppText>
                      <Link href="/(auth)/forgot-password" style={styles.resendLink}>
                        Go back and resend.
                      </Link>
                    </View>
                  </View>
                </>
              ) : null}

              <View style={styles.formField}>
                <AppText style={styles.label}>New password</AppText>
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
                    placeholderTextColor={colors.textTertiary}
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

              <View style={styles.formField}>
                <AppText style={styles.label}>Confirm new password</AppText>
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
                  placeholderTextColor={colors.textTertiary}
                  style={styles.input}
                />
              </View>

              {errorMessage ? <AppText style={styles.errorText}>{errorMessage}</AppText> : null}
              {infoMessage ? <AppText style={styles.infoText}>{infoMessage}</AppText> : null}

              <Pressable
                onPress={() => void updatePassword()}
                disabled={isSubmitting}
                style={[styles.primaryButton, isSubmitting ? styles.disabledButton : null]}
              >
                <AppText style={styles.primaryButtonText}>
                  {isSubmitting ? "Updating..." : "Update password"}
                </AppText>
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
  loadingText: {
    color: colors.textSecondary,
    fontSize: 14,
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
  resendRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  resendText: {
    color: colors.textSecondary,
    fontSize: 12,
  },
  resendLink: {
    color: colors.textPrimary,
    fontSize: 12,
    fontWeight: "600",
  },
  passwordWrap: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.inputBorder,
    backgroundColor: colors.inputBg,
    paddingLeft: 12,
    paddingRight: 8,
  },
  passwordInput: {
    flex: 1,
    color: colors.textPrimary,
    paddingVertical: 10,
    fontSize: 14,
  },
  passwordToggle: {
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 5,
  },
  passwordToggleText: {
    color: colors.textSecondary,
    fontSize: 11,
    letterSpacing: 0.8,
    fontWeight: "700",
    textTransform: "uppercase",
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

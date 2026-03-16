import {
  useEffect,
  useMemo,
  useState,
} from "react";
import * as AppleAuthentication from "expo-apple-authentication";
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
import { signInWithIdentifier } from "@/src/lib/api/auth";
import { signInWithApple } from "@/src/lib/api/appleAuth";
import { DoneTextInput } from "@/src/components/DoneTextInput";
import { AppText } from "@/src/components/AppText";
import { colors } from "@/src/lib/theme";

const INPUT_SELECTION_COLOR = colors.textSecondary;

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
  const [isAppleAuthAvailable, setIsAppleAuthAvailable] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [infoMessage, setInfoMessage] = useState<string | null>(null);

  const canSubmit = !isSubmitting;

  useEffect(() => {
    let isMounted = true;

    if (Platform.OS !== "ios") {
      setIsAppleAuthAvailable(false);
      return () => {
        isMounted = false;
      };
    }

    void AppleAuthentication.isAvailableAsync()
      .then((isAvailable) => {
        if (isMounted) {
          setIsAppleAuthAvailable(isAvailable);
        }
      })
      .catch(() => {
        if (isMounted) {
          setIsAppleAuthAvailable(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, []);

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

      const result = await signInWithIdentifier({
        identifier: normalizedIdentifier,
        password,
        authMode,
      });
      if (!result.ok) {
        setErrorMessage(result.errorMessage);
        setInfoMessage(null);
        return;
      }

      router.replace("/(app)/home");
    } catch {
      setErrorMessage("Unable to sign in. Check your connection and try again.");
      setInfoMessage(null);
    } finally {
      setIsSubmitting(false);
    }
  };

  const submitAppleSignIn = async () => {
    if (isSubmitting) {
      return;
    }

    setIsSubmitting(true);
    setErrorMessage(null);
    setInfoMessage("Signing in...");

    try {
      await signInWithApple();
      router.replace("/(app)/home");
    } catch (error) {
      const errorCode =
        typeof error === "object" &&
        error !== null &&
        "code" in error &&
        typeof error.code === "string"
          ? error.code
          : null;

      if (errorCode === "ERR_REQUEST_CANCELED") {
        setInfoMessage(null);
        return;
      }

      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Unable to sign in with Apple right now."
      );
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
              <AppText style={styles.brandName}>Cluster</AppText>
              <AppText style={styles.brandSubtitle}>
                A private cellar journal with a social pour.
              </AppText>
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
              placeholderTextColor={colors.textTertiary}
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

          {errorMessage ? <AppText style={styles.errorText}>{errorMessage}</AppText> : null}
          {infoMessage ? <AppText style={styles.infoText}>{infoMessage}</AppText> : null}

          <Pressable
            onPress={() => void submitPasswordSignIn()}
            disabled={!canSubmit}
            style={[styles.primaryButton, !canSubmit ? styles.disabledButton : null]}
          >
            <AppText style={styles.primaryButtonText}>{isSubmitting ? "Signing in..." : "Sign In"}</AppText>
          </Pressable>

          {Platform.OS === "ios" && isAppleAuthAvailable ? (
            <>
              <View style={styles.dividerRow}>
                <View style={styles.dividerLine} />
                <AppText style={styles.dividerText}>or</AppText>
                <View style={styles.dividerLine} />
              </View>

              <AppleAuthentication.AppleAuthenticationButton
                buttonType={AppleAuthentication.AppleAuthenticationButtonType.SIGN_IN}
                buttonStyle={AppleAuthentication.AppleAuthenticationButtonStyle.WHITE}
                cornerRadius={12}
                onPress={() => void submitAppleSignIn()}
                style={[
                  styles.appleButton,
                  isSubmitting ? styles.disabledButton : null,
                ]}
              />
            </>
          ) : null}

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
            <Link href="/privacy" style={styles.legalLink}>
              Privacy
            </Link>
            <AppText style={styles.legalSeparator}> · </AppText>
            <Link href="/terms" style={styles.legalLink}>
              Terms
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
    color: colors.textPrimary,
    fontSize: 28,
    fontWeight: "700",
  },
  brandSubtitle: {
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
  helperText: {
    color: colors.textSecondary,
    fontSize: 12,
    lineHeight: 17,
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
    borderRadius: 12,
    backgroundColor: colors.grenache,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 12,
    minHeight: 46,
  },
  disabledButton: {
    opacity: 0.55,
  },
  primaryButtonText: {
    color: colors.textPrimary,
    fontSize: 14,
    fontWeight: "700",
  },
  dividerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 2,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: colors.surfacePrimary,
  },
  dividerText: {
    color: colors.textSecondary,
    fontSize: 11,
    letterSpacing: 1.5,
    textTransform: "uppercase",
  },
  appleButton: {
    width: "100%",
    height: 46,
  },
  secondaryButton: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
    paddingVertical: 12,
  },
  secondaryButtonText: {
    color: colors.textPrimary,
    fontSize: 14,
    fontWeight: "600",
  },
  forgotPasswordWrap: {
    alignItems: "center",
  },
  forgotPasswordLink: {
    color: colors.textSecondary,
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
    color: colors.textSecondary,
    fontSize: 11,
    letterSpacing: 1.2,
    textTransform: "uppercase",
    fontWeight: "600",
  },
  legalSeparator: {
    color: colors.textSecondary,
    fontSize: 11,
    letterSpacing: 1.2,
  },
});

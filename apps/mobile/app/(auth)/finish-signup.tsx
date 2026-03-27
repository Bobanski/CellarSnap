import { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from "react-native";
import { Link, router, useLocalSearchParams } from "expo-router";
import { Linking } from "react-native";
import { handleIncomingAuthUrl } from "@/src/lib/authRedirect";
import { checkUsernameAvailable } from "@/src/lib/api/auth";
import {
  USERNAME_FORMAT_MESSAGE,
  USERNAME_MIN_LENGTH,
  USERNAME_MIN_LENGTH_MESSAGE,
  isUsernameFormatValid,
} from "@cellarsnap/shared";
import { supabase } from "@/src/lib/supabase";
import { DoneTextInput } from "@/src/components/DoneTextInput";
import { AppText } from "@/src/components/AppText";
import { colors } from "@/src/lib/theme";

type FinishSignupParams = {
  email?: string;
};

type VerifyOtpType = "signup" | "invite" | "magiclink" | "recovery" | "email_change" | "email";

export default function FinishSignupScreen() {
  const params = useLocalSearchParams<FinishSignupParams>();
  const defaultEmail = useMemo(
    () => (typeof params.email === "string" ? params.email.trim().toLowerCase() : ""),
    [params.email]
  );
  const [email, setEmail] = useState(defaultEmail);
  const [code, setCode] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [infoMessage, setInfoMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isReady, setIsReady] = useState(false);
  const [hasSession, setHasSession] = useState(false);
  const submitGuardRef = useRef(false);

  useEffect(() => {
    let isMounted = true;

    setEmail((previous) => previous || defaultEmail);

    void (async () => {
      try {
        const initialUrl = await Linking.getInitialURL();
        if (initialUrl) {
          await handleIncomingAuthUrl(initialUrl);
        }
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

  const submit = async () => {
    if (submitGuardRef.current) {
      return;
    }
    submitGuardRef.current = true;

    try {
      const normalizedEmail = email.trim().toLowerCase();
      const normalizedUsername = username.trim();
      const normalizedCode = code.trim();

      if (!normalizedEmail || !normalizedEmail.includes("@")) {
        setErrorMessage("A valid email is required.");
        return;
      }
      if (normalizedUsername.length < USERNAME_MIN_LENGTH) {
        setErrorMessage(USERNAME_MIN_LENGTH_MESSAGE);
        return;
      }
      if (!isUsernameFormatValid(normalizedUsername)) {
        setErrorMessage(USERNAME_FORMAT_MESSAGE);
        return;
      }
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

      const usernameCheck = await checkUsernameAvailable(normalizedUsername);
      if (!usernameCheck.ok) {
        setErrorMessage(usernameCheck.errorMessage);
        return;
      }
      if (!usernameCheck.available) {
        setErrorMessage("That username is already taken.");
        return;
      }

      if (!hasSession) {
        if (!normalizedCode) {
          setErrorMessage("Confirmation code is required.");
          return;
        }

        const verifyTypes: VerifyOtpType[] = ["email", "signup", "magiclink"];
        let verified = false;
        let lastError: string | null = null;

        for (const verifyType of verifyTypes) {
          const { error } = await supabase.auth.verifyOtp({
            email: normalizedEmail,
            token: normalizedCode,
            type: verifyType,
          });
          if (!error) {
            verified = true;
            break;
          }
          lastError = error.message;
        }

        if (!verified) {
          setErrorMessage(lastError ?? "Unable to verify confirmation code.");
          return;
        }

        const { data } = await supabase.auth.getSession();
        if (!data.session) {
          setErrorMessage("Unable to verify confirmation code.");
          return;
        }

        setHasSession(true);
      }

      const { data: authData, error: passwordError } = await supabase.auth.updateUser({
        password,
      });

      if (passwordError) {
        setErrorMessage(passwordError.message);
        return;
      }

      const userId = authData.user?.id ?? (await supabase.auth.getUser()).data.user?.id;
      if (!userId) {
        setErrorMessage("Unable to finish account setup.");
        return;
      }

      const { error: profileError } = await supabase.from("profiles").upsert(
        {
          id: userId,
          display_name: normalizedUsername,
          email: normalizedEmail,
        },
        { onConflict: "id" }
      );
      if (profileError) {
        setErrorMessage(profileError.message);
        return;
      }

      setInfoMessage("Account created. Taking you home...");
      router.replace("/(app)/feed");
    } catch {
      setErrorMessage("Unable to finish signup right now. Please try again.");
    } finally {
      setIsSubmitting(false);
      submitGuardRef.current = false;
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
            <AppText style={styles.eyebrow}>Finish signup</AppText>
            <AppText style={styles.title}>Create your account</AppText>
            <AppText style={styles.subtitle}>
              Enter your email confirmation code, choose a username, and set a password.
            </AppText>
          </View>

          {!isReady ? (
            <AppText style={styles.loadingText}>Preparing signup form...</AppText>
          ) : (
            <>
              <Field
                label="Email address"
                value={email}
                onChange={setEmail}
                keyboardType="email-address"
                autoCapitalize="none"
                autoComplete="email"
                textContentType="emailAddress"
                placeholder="you@example.com"
              />

              {!hasSession ? (
                <Field
                  label="Confirmation code"
                  value={code}
                  onChange={setCode}
                  keyboardType="number-pad"
                  autoCapitalize="none"
                  autoComplete="one-time-code"
                  textContentType="oneTimeCode"
                  placeholder="6-digit code"
                />
              ) : null}

              <Field
                label="Username"
                value={username}
                onChange={setUsername}
                autoCapitalize="none"
                autoComplete="username"
                textContentType="username"
                placeholder="At least 3 characters"
              />

              <View style={styles.formField}>
                <AppText style={styles.label}>Password</AppText>
                <View style={styles.passwordWrap}>
                  <DoneTextInput
                    value={password}
                    onChangeText={setPassword}
                    secureTextEntry={!showPassword}
                    autoCapitalize="none"
                    autoCorrect={false}
                    autoComplete="new-password"
                    textContentType="newPassword"
                    placeholder="At least 8 characters"
                    placeholderTextColor={colors.textTertiary}
                    style={styles.passwordInput}
                  />
                  <Pressable
                    onPress={() => setShowPassword((previous) => !previous)}
                    style={styles.passwordToggle}
                  >
                    <AppText style={styles.passwordToggleText}>
                      {showPassword ? "Hide" : "Show"}
                    </AppText>
                  </Pressable>
                </View>
              </View>

              <Field
                label="Confirm password"
                value={confirmPassword}
                onChange={setConfirmPassword}
                secureTextEntry={!showPassword}
                autoCapitalize="none"
                autoComplete="new-password"
                textContentType="newPassword"
                placeholder="Repeat password"
              />

              {errorMessage ? <AppText style={styles.errorText}>{errorMessage}</AppText> : null}
              {infoMessage ? <AppText style={styles.infoText}>{infoMessage}</AppText> : null}

              <Pressable
                onPress={() => void submit()}
                disabled={isSubmitting}
                style={[styles.primaryButton, isSubmitting ? styles.disabledButton : null]}
              >
                {isSubmitting ? (
                  <ActivityIndicator color={colors.textPrimary} />
                ) : (
                  <AppText style={styles.primaryButtonText}>Finish signup</AppText>
                )}
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

function Field({
  label,
  value,
  onChange,
  secureTextEntry = false,
  autoCapitalize = "sentences",
  autoComplete,
  keyboardType = "default",
  textContentType,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  secureTextEntry?: boolean;
  autoCapitalize?: "none" | "sentences" | "words" | "characters";
  autoComplete?: "email" | "username" | "tel" | "new-password" | "one-time-code" | "off";
  keyboardType?:
    | "default"
    | "email-address"
    | "numeric"
    | "phone-pad"
    | "number-pad";
  textContentType?: "emailAddress" | "username" | "telephoneNumber" | "newPassword" | "oneTimeCode";
  placeholder?: string;
}) {
  return (
    <View style={styles.formField}>
      <AppText style={styles.label}>{label}</AppText>
      <DoneTextInput
        value={value}
        onChangeText={onChange}
        secureTextEntry={secureTextEntry}
        keyboardType={keyboardType}
        autoCapitalize={autoCapitalize}
        autoComplete={autoComplete}
        textContentType={textContentType}
        autoCorrect={false}
        placeholder={placeholder}
        placeholderTextColor={colors.textTertiary}
        style={styles.input}
      />
    </View>
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
    marginBottom: 6,
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
  passwordWrap: {
    position: "relative",
    justifyContent: "center",
  },
  passwordInput: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.inputBorder,
    backgroundColor: colors.inputBg,
    color: colors.textPrimary,
    paddingHorizontal: 12,
    paddingVertical: 10,
    paddingRight: 72,
    fontSize: 14,
  },
  passwordToggle: {
    position: "absolute",
    right: 4,
    top: 4,
    bottom: 4,
    justifyContent: "center",
    paddingHorizontal: 8,
  },
  passwordToggleText: {
    color: colors.textSecondary,
    fontSize: 12,
    letterSpacing: 0.8,
    textTransform: "uppercase",
    fontWeight: "700",
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
    marginTop: 4,
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

import {
  useMemo,
  useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  type TextInputProps,
  View
} from "react-native";
import { Link, router } from "expo-router";
import {
  PHONE_FORMAT_MESSAGE,
  USERNAME_FORMAT_MESSAGE,
  USERNAME_MAX_LENGTH,
  USERNAME_MAX_LENGTH_MESSAGE,
  USERNAME_MIN_LENGTH,
  USERNAME_MIN_LENGTH_MESSAGE,
  getAuthMode,
  isUsernameFormatValid,
  normalizePhone,
} from "@cellarsnap/shared";
import { buildAuthRedirectUrl, supabase } from "@/src/lib/supabase";
import { DoneTextInput } from "@/src/components/DoneTextInput";
import { AppText } from "@/src/components/AppText";

const INPUT_SELECTION_COLOR = "#52525b";

type PhoneSignupFields = {
  username: string;
  phone: string;
  email: string;
};

export default function SignUpScreen() {
  const authMode = useMemo(
    () => getAuthMode(process.env.EXPO_PUBLIC_AUTH_MODE),
    []
  );
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [phoneFields, setPhoneFields] = useState<PhoneSignupFields>({
    username: "",
    phone: "",
    email: "",
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [infoMessage, setInfoMessage] = useState<string | null>(null);

  const submitEmailSignup = async () => {
    const normalizedEmail = email.trim().toLowerCase();
    if (!normalizedEmail.includes("@")) {
      setErrorMessage("A valid email address is required.");
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
    try {
      const { data, error } = await supabase.auth.signUp({
        email: normalizedEmail,
        password,
        options: { emailRedirectTo: buildAuthRedirectUrl() },
      });
      if (error) {
        setErrorMessage(error.message);
        return;
      }

      if (data.session) {
        router.replace("/(app)/entries");
        return;
      }

      setInfoMessage("Check your email to confirm your account.");
    } catch {
      setErrorMessage("Unable to create account right now.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const submitPhoneSignup = async () => {
    const username = phoneFields.username.trim();
    const normalizedPhone = normalizePhone(phoneFields.phone);
    const normalizedEmail = phoneFields.email.trim().toLowerCase();

    if (username.length < USERNAME_MIN_LENGTH) {
      setErrorMessage(USERNAME_MIN_LENGTH_MESSAGE);
      return;
    }
    if (username.length > USERNAME_MAX_LENGTH) {
      setErrorMessage(USERNAME_MAX_LENGTH_MESSAGE);
      return;
    }
    if (!isUsernameFormatValid(username)) {
      setErrorMessage(USERNAME_FORMAT_MESSAGE);
      return;
    }
    if (!normalizedPhone) {
      setErrorMessage(PHONE_FORMAT_MESSAGE);
      return;
    }
    if (!normalizedEmail.includes("@")) {
      setErrorMessage("A valid email address is required.");
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

    try {
      const { data: isUsernameAvailable, error: usernameCheckError } = await supabase.rpc(
        "is_username_available",
        { username }
      );
      if (usernameCheckError) {
        setErrorMessage(usernameCheckError.message);
        return;
      }
      if (!isUsernameAvailable) {
        setErrorMessage("That username is already taken.");
        return;
      }

      const { data: isPhoneAvailable, error: phoneCheckError } = await supabase.rpc(
        "is_phone_available",
        { phone: normalizedPhone }
      );
      if (phoneCheckError) {
        setErrorMessage(phoneCheckError.message);
        return;
      }
      if (!isPhoneAvailable) {
        setErrorMessage("That phone number is already in use.");
        return;
      }

      const { data, error } = await supabase.auth.signUp({
        phone: normalizedPhone,
        password,
      });
      if (error) {
        setErrorMessage(error.message);
        return;
      }

      const userId = data.user?.id;
      if (userId && data.session) {
        const { error: profileError } = await supabase.from("profiles").upsert(
          {
            id: userId,
            display_name: username,
            email: normalizedEmail,
            phone: normalizedPhone,
          },
          { onConflict: "id" }
        );
        if (profileError) {
          setErrorMessage(profileError.message);
          return;
        }
      }

      if (data.session) {
        router.replace("/(app)/entries");
        return;
      }

      router.push({
        pathname: "/(auth)/verify-phone",
        params: {
          phone: normalizedPhone,
          username,
          email: normalizedEmail,
        },
      });
    } catch {
      setErrorMessage("Unable to create account right now.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const onSubmit = async () => {
    if (isSubmitting) {
      return;
    }
    if (authMode === "phone") {
      await submitPhoneSignup();
      return;
    }
    await submitEmailSignup();
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
            <AppText style={styles.eyebrow}>Create account</AppText>
            <AppText style={styles.title}>Join CellarSnap</AppText>
            <AppText style={styles.subtitle}>
              {authMode === "phone"
                ? "Create your account with username, phone, email, and password."
                : "Create your account with email and password."}
            </AppText>
          </View>

          {authMode === "phone" ? (
            <>
              <Field
                label="Username"
                value={phoneFields.username}
                onChange={(value) =>
                  setPhoneFields((previous) => ({ ...previous, username: value }))
                }
                autoCapitalize="none"
                autoComplete="username"
                textContentType="username"
                placeholder="At least 3 characters"
              />
              <Field
                label="Phone number"
                value={phoneFields.phone}
                onChange={(value) =>
                  setPhoneFields((previous) => ({ ...previous, phone: value }))
                }
                keyboardType="phone-pad"
                autoCapitalize="none"
                autoComplete="tel"
                textContentType="telephoneNumber"
                placeholder="(555) 123-4567"
              />
              <Field
                label="Email address"
                value={phoneFields.email}
                onChange={(value) =>
                  setPhoneFields((previous) => ({ ...previous, email: value }))
                }
                keyboardType="email-address"
                autoCapitalize="none"
                autoComplete="email"
                textContentType="emailAddress"
                placeholder="you@example.com"
              />
            </>
          ) : (
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
          )}

          <Field
            label="Password"
            value={password}
            onChange={setPassword}
            secureTextEntry={!showPassword}
            autoCapitalize="none"
            autoComplete="new-password"
            textContentType="newPassword"
            placeholder="********"
          />
          <Pressable onPress={() => setShowPassword((previous) => !previous)}>
            <AppText style={styles.toggleText}>{showPassword ? "Hide password" : "Show password"}</AppText>
          </Pressable>

          <Field
            label="Confirm password"
            value={confirmPassword}
            onChange={setConfirmPassword}
            secureTextEntry={!showPassword}
            autoCapitalize="none"
            autoComplete="new-password"
            textContentType="newPassword"
            placeholder="********"
          />

          {errorMessage ? <AppText style={styles.errorText}>{errorMessage}</AppText> : null}
          {infoMessage ? <AppText style={styles.infoText}>{infoMessage}</AppText> : null}

          <Pressable
            onPress={() => void onSubmit()}
            disabled={isSubmitting}
            style={[styles.primaryButton, isSubmitting ? styles.disabledButton : null]}
          >
            {isSubmitting ? (
              <ActivityIndicator color="#09090b" />
            ) : (
              <AppText style={styles.primaryButtonText}>Create Account</AppText>
            )}
          </Pressable>

          <AppText style={styles.termsText}>
            By selecting Create Account, you agree to our privacy and terms policies.
          </AppText>

          <Link href="/(auth)/sign-in" style={styles.linkButtonText}>
            Back to sign in
          </Link>

          <View style={styles.legalRow}>
            <AppText style={styles.legalLink}>Privacy</AppText>
            <AppText style={styles.legalSeparator}> - </AppText>
            <AppText style={styles.legalLink}>Terms</AppText>
          </View>
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
  autoComplete?: TextInputProps["autoComplete"];
  keyboardType?:
    | "default"
    | "email-address"
    | "numeric"
    | "phone-pad"
    | "number-pad";
  textContentType?: TextInputProps["textContentType"];
  placeholder?: string;
}) {
  return (
    <View style={styles.fieldBlock}>
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
        selectionColor={INPUT_SELECTION_COLOR}
        placeholder={placeholder}
        placeholderTextColor="#71717a"
        style={styles.input}
      />
    </View>
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
    marginBottom: 6,
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
  fieldBlock: {
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
  toggleText: {
    color: "#a1a1aa",
    fontSize: 12,
    letterSpacing: 0.8,
    textTransform: "uppercase",
    fontWeight: "700",
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
    marginTop: 4,
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
  termsText: {
    color: "#a1a1aa",
    fontSize: 12,
    lineHeight: 18,
  },
  linkButtonText: {
    color: "#d4d4d8",
    fontSize: 12,
    letterSpacing: 1.2,
    textTransform: "uppercase",
    textAlign: "center",
    fontWeight: "700",
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


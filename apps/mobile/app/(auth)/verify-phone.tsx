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
  View
} from "react-native";
import { Link, useLocalSearchParams, router } from "expo-router";
import { PHONE_FORMAT_MESSAGE, normalizePhone } from "@cellarsnap/shared";
import { supabase } from "@/src/lib/supabase";
import { DoneTextInput } from "@/src/components/DoneTextInput";
import { AppText } from "@/src/components/AppText";
import { colors } from "@/src/lib/theme";

type VerifyMode = "signup" | "recovery";

export default function VerifyPhoneScreen() {
  const params = useLocalSearchParams<{
    phone?: string;
    username?: string;
    email?: string;
    mode?: string;
  }>();
  const mode = useMemo<VerifyMode>(
    () => (params.mode === "recovery" ? "recovery" : "signup"),
    [params.mode]
  );
  const defaultPhone = useMemo(() => {
    const raw = typeof params.phone === "string" ? params.phone : "";
    const normalized = normalizePhone(raw);
    return normalized ?? raw;
  }, [params.phone]);
  const defaultUsername = useMemo(
    () => (typeof params.username === "string" ? params.username.trim() : ""),
    [params.username]
  );
  const defaultEmail = useMemo(
    () => (typeof params.email === "string" ? params.email.trim().toLowerCase() : ""),
    [params.email]
  );

  const [phone, setPhone] = useState(defaultPhone);
  const [code, setCode] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [infoMessage, setInfoMessage] = useState<string | null>(null);

  const verifyCode = async () => {
    const normalizedPhone = normalizePhone(phone);
    if (!normalizedPhone) {
      setErrorMessage(PHONE_FORMAT_MESSAGE);
      return;
    }
    if (!code.trim()) {
      setErrorMessage("Verification code is required.");
      return;
    }

    setIsSubmitting(true);
    setErrorMessage(null);
    setInfoMessage("Verifying...");
    try {
      const { data, error } = await supabase.auth.verifyOtp({
        phone: normalizedPhone,
        token: code.trim(),
        type: "sms",
      });
      if (error) {
        setErrorMessage(error.message);
        setInfoMessage(null);
        return;
      }

      if (mode === "recovery") {
        router.replace({
          pathname: "/(auth)/reset-password",
          params: { phone: normalizedPhone },
        });
        return;
      }

      const userId = data.user?.id;
      if (userId && defaultUsername) {
        const { error: profileError } = await supabase.from("profiles").upsert(
          {
            id: userId,
            display_name: defaultUsername,
            email: defaultEmail || null,
            phone: normalizedPhone,
          },
          { onConflict: "id" }
        );
        if (profileError) {
          setErrorMessage(profileError.message);
          setInfoMessage(null);
          return;
        }
      }

      router.replace("/(app)/feed");
    } catch {
      setErrorMessage("Unable to verify code right now.");
      setInfoMessage(null);
    } finally {
      setIsSubmitting(false);
    }
  };

  const resendCode = async () => {
    const normalizedPhone = normalizePhone(phone);
    if (!normalizedPhone) {
      setErrorMessage(PHONE_FORMAT_MESSAGE);
      return;
    }

    setIsSubmitting(true);
    setErrorMessage(null);
    setInfoMessage("Sending a new code...");
    try {
      const { error } = await supabase.auth.signInWithOtp({
        phone: normalizedPhone,
        options: mode === "recovery" ? { shouldCreateUser: false } : undefined,
      });
      if (error) {
        setErrorMessage(error.message);
        setInfoMessage(null);
        return;
      }
      setInfoMessage("A new code has been sent.");
    } catch {
      setErrorMessage("Unable to send another code right now.");
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
          <View style={styles.headBlock}>
            <AppText style={styles.eyebrow}>{mode === "recovery" ? "Reset access" : "Verify phone"}</AppText>
            <AppText style={styles.title}>
              {mode === "recovery" ? "Enter your recovery code" : "Enter your confirmation code"}
            </AppText>
            <AppText style={styles.subtitle}>
              {mode === "recovery"
                ? "We sent a recovery code to your phone number."
                : "We sent a verification code to your phone number."}
            </AppText>
          </View>

          <Field
            label="Phone number"
            value={phone}
            onChange={setPhone}
            keyboardType="phone-pad"
            autoCapitalize="none"
          />
          <Field
            label="Verification code"
            value={code}
            onChange={setCode}
            keyboardType="number-pad"
            autoCapitalize="none"
          />

          {errorMessage ? <AppText style={styles.errorText}>{errorMessage}</AppText> : null}
          {infoMessage ? <AppText style={styles.infoText}>{infoMessage}</AppText> : null}

          <Pressable
            onPress={() => void verifyCode()}
            disabled={isSubmitting}
            style={[styles.primaryButton, isSubmitting ? styles.disabledButton : null]}
          >
            {isSubmitting ? (
              <ActivityIndicator color={colors.textPrimary} />
            ) : (
              <AppText style={styles.primaryButtonText}>Confirm code</AppText>
            )}
          </Pressable>

          <Pressable onPress={() => void resendCode()} disabled={isSubmitting} style={styles.secondaryButton}>
            <AppText style={styles.secondaryButtonText}>Resend code</AppText>
          </Pressable>

          <LinkText mode={mode} />
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function Field({
  label,
  value,
  onChange,
  autoCapitalize,
  keyboardType,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  autoCapitalize: "none" | "sentences" | "words" | "characters";
  keyboardType: "default" | "phone-pad" | "number-pad";
}) {
  return (
    <View style={styles.fieldBlock}>
      <AppText style={styles.label}>{label}</AppText>
      <DoneTextInput
        value={value}
        onChangeText={onChange}
        keyboardType={keyboardType}
        autoCapitalize={autoCapitalize}
        autoCorrect={false}
        placeholderTextColor={colors.textTertiary}
        style={styles.input}
      />
    </View>
  );
}

function LinkText({ mode }: { mode: VerifyMode }) {
  if (mode === "recovery") {
    return (
      <View style={styles.legalRow}>
        <AppText style={styles.legalMuted}>Back to </AppText>
        <Link href="/(auth)/sign-in" style={styles.legalLink}>
          sign in
        </Link>
      </View>
    );
  }

  return (
    <View style={styles.legalRow}>
      <AppText style={styles.legalMuted}>Back to </AppText>
      <Link href="/(auth)/sign-up" style={styles.legalLink}>
        create account
      </Link>
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
  fieldBlock: {
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
  secondaryButton: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    alignItems: "center",
    paddingVertical: 12,
  },
  secondaryButtonText: {
    color: colors.textPrimary,
    fontSize: 14,
    fontWeight: "600",
  },
  legalRow: {
    marginTop: 4,
    flexDirection: "row",
    justifyContent: "center",
  },
  legalMuted: {
    color: colors.textSecondary,
    fontSize: 11,
    letterSpacing: 1.2,
    textTransform: "uppercase",
    fontWeight: "600",
  },
  legalLink: {
    color: colors.textSecondary,
    fontSize: 11,
    letterSpacing: 1.2,
    textTransform: "uppercase",
    fontWeight: "700",
  },
});

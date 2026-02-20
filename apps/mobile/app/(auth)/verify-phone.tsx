import { useMemo, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { Link, useLocalSearchParams, router } from "expo-router";
import { PHONE_FORMAT_MESSAGE, normalizePhone } from "@cellarsnap/shared";
import { supabase } from "@/src/lib/supabase";

export default function VerifyPhoneScreen() {
  const params = useLocalSearchParams<{
    phone?: string;
    username?: string;
    email?: string;
  }>();
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

      router.replace("/(app)/entries");
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
            <Text style={styles.eyebrow}>Verify phone</Text>
            <Text style={styles.title}>Enter your confirmation code</Text>
            <Text style={styles.subtitle}>
              We sent a verification code to your phone number.
            </Text>
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

          {errorMessage ? <Text style={styles.errorText}>{errorMessage}</Text> : null}
          {infoMessage ? <Text style={styles.infoText}>{infoMessage}</Text> : null}

          <Pressable
            onPress={() => void verifyCode()}
            disabled={isSubmitting}
            style={[styles.primaryButton, isSubmitting ? styles.disabledButton : null]}
          >
            {isSubmitting ? (
              <ActivityIndicator color="#09090b" />
            ) : (
              <Text style={styles.primaryButtonText}>Confirm code</Text>
            )}
          </Pressable>

          <Pressable onPress={() => void resendCode()} disabled={isSubmitting} style={styles.secondaryButton}>
            <Text style={styles.secondaryButtonText}>Resend code</Text>
          </Pressable>

          <LinkText />
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
      <Text style={styles.label}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChange}
        keyboardType={keyboardType}
        autoCapitalize={autoCapitalize}
        autoCorrect={false}
        placeholderTextColor="#71717a"
        style={styles.input}
      />
    </View>
  );
}

function LinkText() {
  return (
    <View style={styles.legalRow}>
      <Text style={styles.legalMuted}>Back to </Text>
      <Link href="/(auth)/sign-up" style={styles.legalLink}>
        create account
      </Link>
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
  secondaryButton: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.12)",
    alignItems: "center",
    paddingVertical: 12,
  },
  secondaryButtonText: {
    color: "#e4e4e7",
    fontSize: 14,
    fontWeight: "600",
  },
  legalRow: {
    marginTop: 4,
    flexDirection: "row",
    justifyContent: "center",
  },
  legalMuted: {
    color: "#71717a",
    fontSize: 11,
    letterSpacing: 1.2,
    textTransform: "uppercase",
    fontWeight: "600",
  },
  legalLink: {
    color: "#d4d4d8",
    fontSize: 11,
    letterSpacing: 1.2,
    textTransform: "uppercase",
    fontWeight: "700",
  },
});

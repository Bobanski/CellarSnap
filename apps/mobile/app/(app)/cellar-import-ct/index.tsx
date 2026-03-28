import { useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from "react-native";
import { useRouter } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { AppText } from "@/src/components/AppText";
import { colors } from "@/src/lib/theme";
import { fonts } from "@/src/lib/typography";
import { getAccessTokenForApi, getWebApiBaseUrl } from "@/src/lib/api/webApi";

type ImportResult = {
  imported_count: number;
  notes_count?: number;
  grapes_matched?: number;
  skipped_count?: number;
  message?: string;
};

export default function CellarImportCTScreen() {
  const router = useRouter();

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);

  const canSubmit = username.trim().length > 0 && password.trim().length > 0 && !isLoading;

  const handleImport = async () => {
    if (!canSubmit) return;
    setIsLoading(true);
    setError(null);
    setResult(null);

    try {
      const baseUrl = getWebApiBaseUrl();
      const accessToken = await getAccessTokenForApi();
      if (!baseUrl || !accessToken) {
        setError("Unable to connect. Please try again.");
        setIsLoading(false);
        return;
      }

      const res = await fetch(`${baseUrl}/api/cellar/import-cellartracker`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          ct_username: username.trim(),
          ct_password: password,
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => null);
        setError(data?.error ?? `Import failed (${res.status})`);
        setIsLoading(false);
        return;
      }

      const data: ImportResult = await res.json();
      setResult(data);
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleTryAgain = () => {
    setError(null);
    setResult(null);
  };

  return (
    <KeyboardAvoidingView
      style={styles.screen}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* Back button */}
        <Pressable style={styles.backButton} onPress={() => router.back()}>
          <Feather name="arrow-left" size={20} color={colors.textPrimary} />
        </Pressable>

        {/* Header */}
        <View style={styles.headerBlock}>
          <AppText style={styles.eyebrow}>CELLAR</AppText>
          <AppText style={styles.title}>Import from CellarTracker</AppText>
        </View>

        {/* Success state */}
        {result ? (
          <View style={styles.resultBlock}>
            <Feather name="check-circle" size={40} color={colors.accentSecondary} />
            <AppText style={styles.resultTitle}>Import complete</AppText>
            <View style={styles.resultStats}>
              <AppText style={styles.resultStat}>
                {result.imported_count} bottle{result.imported_count !== 1 ? "s" : ""} imported
              </AppText>
              {result.notes_count != null && result.notes_count > 0 && (
                <AppText style={styles.resultStat}>
                  {result.notes_count} tasting note{result.notes_count !== 1 ? "s" : ""}
                </AppText>
              )}
              {result.grapes_matched != null && result.grapes_matched > 0 && (
                <AppText style={styles.resultStat}>
                  {result.grapes_matched} grape{result.grapes_matched !== 1 ? "s" : ""} matched
                </AppText>
              )}
              {result.skipped_count != null && result.skipped_count > 0 && (
                <AppText style={styles.resultStatMuted}>
                  {result.skipped_count} skipped (duplicates)
                </AppText>
              )}
            </View>
            {result.message && (
              <AppText style={styles.resultMessage}>{result.message}</AppText>
            )}
            <Pressable
              style={styles.submitButton}
              onPress={() => router.replace("/(app)/entries")}
            >
              <AppText style={styles.submitButtonText}>Go to cellar</AppText>
            </Pressable>
          </View>
        ) : (
          <>
            {/* Form */}
            <View style={styles.fieldGroup}>
              <AppText style={styles.label}>CellarTracker Username</AppText>
              <TextInput
                style={styles.input}
                placeholder="Your CellarTracker username"
                placeholderTextColor={colors.textTertiary}
                value={username}
                onChangeText={setUsername}
                autoCapitalize="none"
                autoCorrect={false}
                autoComplete="off"
                returnKeyType="next"
                editable={!isLoading}
              />
            </View>

            <View style={styles.fieldGroup}>
              <AppText style={styles.label}>CellarTracker Password</AppText>
              <View style={styles.passwordWrapper}>
                <TextInput
                  style={styles.passwordInput}
                  placeholder="Your CellarTracker password"
                  placeholderTextColor={colors.textTertiary}
                  value={password}
                  onChangeText={setPassword}
                  secureTextEntry={!showPassword}
                  autoCapitalize="none"
                  autoCorrect={false}
                  autoComplete="off"
                  returnKeyType="done"
                  editable={!isLoading}
                />
                <Pressable
                  style={styles.eyeButton}
                  onPress={() => setShowPassword((v) => !v)}
                  hitSlop={8}
                >
                  <Feather
                    name={showPassword ? "eye-off" : "eye"}
                    size={18}
                    color={colors.textTertiary}
                  />
                </Pressable>
              </View>
            </View>

            <AppText style={styles.privacyNotice}>
              Your credentials are used once to fetch your data and are never stored.
            </AppText>

            {/* Error */}
            {error ? (
              <View style={styles.errorBlock}>
                <AppText style={styles.errorText}>{error}</AppText>
                <Pressable onPress={handleTryAgain}>
                  <AppText style={styles.tryAgainText}>Try again</AppText>
                </Pressable>
              </View>
            ) : null}

            {/* Submit */}
            <Pressable
              style={[styles.submitButton, !canSubmit && styles.submitButtonDisabled]}
              onPress={handleImport}
              disabled={!canSubmit}
            >
              {isLoading ? (
                <ActivityIndicator color={colors.textOnAccent} />
              ) : (
                <AppText style={styles.submitButtonText}>Import</AppText>
              )}
            </Pressable>

            <AppText style={styles.csvNote}>
              Prefer not to enter your password? Export your cellar as CSV from CellarTracker on
              desktop and upload it here.
            </AppText>
          </>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.screenBg,
  },
  scrollContent: {
    paddingHorizontal: 22,
    paddingTop: 16,
    paddingBottom: 48,
    gap: 20,
  },
  backButton: {
    alignSelf: "flex-start",
    padding: 4,
  },
  headerBlock: {
    gap: 6,
  },
  eyebrow: {
    color: colors.accentSecondary,
    fontSize: 9,
    fontWeight: "700",
    letterSpacing: 3,
    textTransform: "uppercase",
  },
  title: {
    color: colors.textPrimary,
    fontFamily: fonts.serif.light,
    fontSize: 30,
    lineHeight: 36,
  },
  fieldGroup: {
    gap: 8,
  },
  label: {
    color: colors.textPrimary,
    fontSize: 13,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.8,
  },
  input: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    backgroundColor: colors.surfaceRaised,
    color: colors.textPrimary,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 14,
  },
  passwordWrapper: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    backgroundColor: colors.surfaceRaised,
  },
  passwordInput: {
    flex: 1,
    color: colors.textPrimary,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 14,
  },
  eyeButton: {
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  privacyNotice: {
    color: colors.textTertiary,
    fontSize: 12,
    lineHeight: 17,
    fontStyle: "italic",
  },
  errorBlock: {
    alignItems: "center",
    gap: 8,
  },
  errorText: {
    color: colors.error,
    fontSize: 13,
    textAlign: "center",
  },
  tryAgainText: {
    color: colors.accentSecondary,
    fontSize: 13,
    fontWeight: "700",
    textDecorationLine: "underline",
  },
  submitButton: {
    borderRadius: 12,
    backgroundColor: colors.accentPrimary,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 14,
    marginTop: 8,
  },
  submitButtonDisabled: {
    opacity: 0.5,
  },
  submitButtonText: {
    color: colors.textOnAccent,
    fontSize: 14,
    fontWeight: "700",
  },
  csvNote: {
    color: colors.textTertiary,
    fontSize: 12,
    lineHeight: 17,
    textAlign: "center",
  },
  resultBlock: {
    alignItems: "center",
    gap: 16,
    paddingVertical: 24,
  },
  resultTitle: {
    color: colors.textPrimary,
    fontFamily: fonts.serif.light,
    fontSize: 24,
  },
  resultStats: {
    gap: 6,
    alignItems: "center",
  },
  resultStat: {
    color: colors.textSecondary,
    fontSize: 14,
  },
  resultStatMuted: {
    color: colors.textTertiary,
    fontSize: 13,
  },
  resultMessage: {
    color: colors.textTertiary,
    fontSize: 13,
    textAlign: "center",
  },
});

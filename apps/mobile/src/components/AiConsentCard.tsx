import { useEffect, useRef, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { Link } from "expo-router";
import { AI_CONSENT_TITLE, AI_CONSENT_PARAGRAPHS, requestAiConsent, type AiConsent } from "@cellarsnap/shared";
import { getAccessTokenForApi, getWebApiBaseUrl } from "@/src/lib/api/webApi";
import { AppText } from "./AppText";
import { colors } from "@/src/lib/theme";

export function mobileAiConsent(granted?: boolean, userId?: string) {
  const baseUrl = getWebApiBaseUrl();
  if (!baseUrl) return Promise.reject(new Error("AI settings are temporarily unavailable. Please try again later."));
  return requestAiConsent({ baseUrl, getToken: () => getAccessTokenForApi(userId), granted });
}
export function AiConsentCard({ userId, onComplete }: { userId: string; onComplete?: () => void }) {
  const mounted = useRef(true);
  const [consent, setConsent] = useState<AiConsent | null>(null);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let active = true; mounted.current = true;
    mobileAiConsent(undefined, userId).then(value => { if (active) setConsent(value); })
      .catch(() => { if (active) setError("Unable to load your AI choice. You can try saving it again."); })
      .finally(() => { if (active) setBusy(false); });
    return () => { active = false; mounted.current = false; };
  }, [userId]);
  const save = async (granted: boolean) => {
    setBusy(true); setError(null);
    try { const value = await mobileAiConsent(granted, userId); if (mounted.current) { setConsent(value); onComplete?.(); } }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Please try again."); }
    finally { setBusy(false); }
  };
  return <View style={styles.card}>
    <AppText accessibilityRole="header" style={styles.title}>{AI_CONSENT_TITLE}</AppText>
    {AI_CONSENT_PARAGRAPHS.map(text => <AppText key={text} style={styles.paragraph}>{text}</AppText>)}
    <AppText accessibilityLiveRegion="polite" style={styles.paragraph}>{busy ? "Loading your choice…" : consent ? `AI sharing is ${consent.granted ? "on" : "off"}.` : "AI sharing is off until you allow it."}</AppText>
    {error && <AppText accessibilityRole="alert" style={styles.paragraph}>{error}</AppText>}
    <Pressable accessibilityRole="button" accessibilityState={{ disabled: busy }} disabled={busy} onPress={() => void save(true)} style={[styles.button, styles.primary, busy && styles.disabled]}>
      <AppText style={styles.primaryText}>Allow AI sharing</AppText>
    </Pressable>
    <Pressable accessibilityRole="button" accessibilityState={{ disabled: busy }} disabled={busy} onPress={() => void save(false)} style={[styles.button, busy && styles.disabled]}>
      <AppText style={styles.buttonText}>{consent?.granted ? "Turn off AI sharing" : "Continue without AI"}</AppText>
    </Pressable>
    <Link href="/privacy" onPress={onComplete} style={styles.link}>Read the privacy policy</Link>
  </View>;
}
const styles = StyleSheet.create({
  card: { padding: 20, gap: 14, borderWidth: 1, borderColor: colors.border, borderRadius: 16, backgroundColor: colors.surfacePrimary },
  title: { fontSize: 24, color: colors.textPrimary },
  paragraph: { fontSize: 14, lineHeight: 21, color: colors.textSecondary },
  button: { minHeight: 48, justifyContent: "center", alignItems: "center", padding: 12, borderRadius: 12, borderWidth: 1, borderColor: colors.borderStrong },
  primary: { backgroundColor: colors.accentPrimary },
  primaryText: { color: colors.textOnAccent, fontWeight: "600" },
  buttonText: { color: colors.textPrimary, fontWeight: "600" },
  disabled: { opacity: 0.5 },
  link: { color: colors.textSecondary, textDecorationLine: "underline", minHeight: 44, paddingVertical: 12 },
});

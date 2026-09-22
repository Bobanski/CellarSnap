import { useEffect, useState } from "react";
import { Modal, Pressable, ScrollView, StyleSheet, View } from "react-native";
import { usePathname } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "@/src/providers/AuthProvider";
import { AiConsentCard, mobileAiConsent } from "./AiConsentCard";
import { AppText } from "./AppText";
import { colors } from "@/src/lib/theme";
export function AiConsentPrompt() {
  const { user } = useAuth();
  const path = usePathname();
  const legal = path === "/privacy" || path === "/terms";
  const [open, setOpen] = useState(false);
  const insets = useSafeAreaInsets();
  useEffect(() => {
    let active = true;
    setOpen(false);
    if (user?.id && !legal) void mobileAiConsent(undefined, user.id).then(consent => {
      if (active) setOpen(consent === null);
    }).catch(() => { /* Server fails closed; manual features remain available. */ });
    return () => { active = false; };
  }, [user?.id, legal]);
  if (!user || legal) return null;
  return <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
    <View style={[styles.overlay, { paddingTop: Math.max(insets.top, 20), paddingBottom: Math.max(insets.bottom, 20) }]}>
      <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
        {open && <AiConsentCard key={user.id} userId={user.id} onComplete={() => setOpen(false)} />}
        <Pressable accessibilityRole="button" onPress={() => setOpen(false)} style={styles.later}><AppText style={styles.text}>Decide later</AppText></Pressable>
      </ScrollView>
    </View>
  </Modal>;
}
const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.8)", justifyContent: "center", alignItems: "center", paddingHorizontal: 16 },
  scroll: { width: "100%", maxWidth: 560, flexGrow: 0, backgroundColor: colors.screenBg, borderRadius: 16 },
  content: { paddingBottom: 10 },
  later: { minHeight: 48, padding: 14, alignItems: "center" },
  text: { color: colors.textPrimary, textDecorationLine: "underline" },
});

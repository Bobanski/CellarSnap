import { Platform } from "react-native";
import * as Haptics from "expo-haptics";

/**
 * Centralized haptics wrapper. Fires a light impact tap for small positive
 * / selection moments (entry saved, rating chosen, badge earned, refresh
 * triggered). No-ops on platforms without haptic hardware (web, and any
 * Android device without a vibrator) — expo-haptics itself throws on web,
 * so we guard on Platform.OS rather than relying on it to fail silently.
 */
function isHapticsSupported() {
  return Platform.OS === "ios" || Platform.OS === "android";
}

/** Light tap for routine positive feedback (save success, refresh, badge earn). */
export function lightImpact() {
  if (!isHapticsSupported()) {
    return;
  }
  void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
}

/** Light tap for discrete selection changes (e.g. choosing a rating chip). */
export function selectionTap() {
  if (!isHapticsSupported()) {
    return;
  }
  void Haptics.selectionAsync();
}

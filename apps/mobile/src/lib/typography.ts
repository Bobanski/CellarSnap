export const fonts = {
  /** Display / headlines — Canela approximation */
  serif: {
    light:      "CormorantGaramond_300Light",
    regular:    "CormorantGaramond_400Regular",
    lightItalic:"CormorantGaramond_300Light_Italic",
    italic:     "CormorantGaramond_400Regular_Italic",
  },
  /** UI / body / navigation — Sohne approximation */
  sans: {
    light:   "DMSans_300Light",
    regular: "DMSans_400Regular",
    medium:  "DMSans_500Medium",
  },
} as const;

// Keep this export for backward compat with AppText / DoneTextInput.
// After fonts load, set this to fonts.sans.regular.
export let APP_SANS_FONT_FAMILY: string | undefined = undefined;

export function activateFonts() {
  APP_SANS_FONT_FAMILY = fonts.sans.regular;
}

import { Platform } from "react-native";

// Match the web stack as closely as possible with native platform fonts.
export const APP_SANS_FONT_FAMILY = Platform.select({
  ios: "Avenir Next",
  android: "sans-serif",
  default: undefined,
});


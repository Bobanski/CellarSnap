import { Text as ReactNativeText, type TextProps } from "react-native";
import { APP_SANS_FONT_FAMILY } from "@/src/lib/typography";

// Cache the font-family style object so AppText doesn't allocate a fresh object
// every render. APP_SANS_FONT_FAMILY is a module-level `let` that starts as
// undefined and is mutated once by activateFonts() after fonts load. We resolve
// the cached style lazily on first render after fonts become available, then
// reuse the same object reference forever. Before fonts load the slot is null
// (matching the original behaviour).
let _cachedFontStyle: { fontFamily: string } | null = null;
function getAppFontStyle(): { fontFamily: string } | null {
  if (!APP_SANS_FONT_FAMILY) return null;
  if (!_cachedFontStyle) {
    _cachedFontStyle = { fontFamily: APP_SANS_FONT_FAMILY };
  }
  return _cachedFontStyle;
}

export function AppText({ style, ...props }: TextProps) {
  return (
    <ReactNativeText
      {...props}
      style={[getAppFontStyle(), style]}
    />
  );
}


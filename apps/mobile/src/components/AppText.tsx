import { Text as ReactNativeText, type TextProps } from "react-native";
import { APP_SANS_FONT_FAMILY } from "@/src/lib/typography";

export function AppText({ style, ...props }: TextProps) {
  return (
    <ReactNativeText
      {...props}
      style={[APP_SANS_FONT_FAMILY ? { fontFamily: APP_SANS_FONT_FAMILY } : null, style]}
    />
  );
}


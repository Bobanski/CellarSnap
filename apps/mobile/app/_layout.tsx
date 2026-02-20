import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { AuthProvider } from "@/src/providers/AuthProvider";
import { KeyboardDoneAccessory } from "@/src/components/KeyboardDoneAccessory";
import { APP_SANS_FONT_FAMILY } from "@/src/lib/typography";

export default function RootLayout() {
  return (
    <AuthProvider>
      <StatusBar style="light" />
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: "#0f0a09" },
          headerTintColor: "#f4f4f5",
          headerTitleStyle: APP_SANS_FONT_FAMILY
            ? { fontFamily: APP_SANS_FONT_FAMILY }
            : undefined,
          headerShadowVisible: false,
          contentStyle: { backgroundColor: "#0f0a09" },
        }}
      />
      <KeyboardDoneAccessory />
    </AuthProvider>
  );
}

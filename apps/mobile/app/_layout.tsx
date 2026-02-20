import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { AuthProvider } from "@/src/providers/AuthProvider";

export default function RootLayout() {
  return (
    <AuthProvider>
      <StatusBar style="light" />
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: "#0f0a09" },
          headerTintColor: "#f4f4f5",
          headerShadowVisible: false,
          contentStyle: { backgroundColor: "#0f0a09" },
        }}
      />
    </AuthProvider>
  );
}

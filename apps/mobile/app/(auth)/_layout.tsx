import { ActivityIndicator, View } from "react-native";
import { Redirect, Stack, useSegments } from "expo-router";
import { useAuth } from "@/src/providers/AuthProvider";

export default function AuthLayout() {
  const { isReady, session } = useAuth();
  const segments = useSegments();
  const isResetPasswordScreen = segments[1] === "reset-password";

  if (!isReady) {
    return (
      <View
        style={{
          flex: 1,
          backgroundColor: "#0f0a09",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <ActivityIndicator color="#fbbf24" />
      </View>
    );
  }

  if (session && !isResetPasswordScreen) {
    return <Redirect href="/(app)/entries" />;
  }

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="sign-in" />
      <Stack.Screen name="forgot-password" />
      <Stack.Screen name="sign-up" />
      <Stack.Screen name="verify-phone" />
    </Stack>
  );
}

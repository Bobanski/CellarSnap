import { ActivityIndicator, View } from "react-native";
import { Redirect, Stack, useSegments } from "expo-router";
import { useAuth } from "@/src/providers/AuthProvider";
import { colors } from "@/src/lib/theme";

export default function AuthLayout() {
  const { isReady, session } = useAuth();
  const segments = useSegments();
  const isResetPasswordScreen = segments[segments.length - 1] === "reset-password";

  if (!isReady) {
    return (
      <View
        style={{
          flex: 1,
          backgroundColor: colors.screenBg,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <ActivityIndicator color={colors.grenache} />
      </View>
    );
  }

  if (session && !isResetPasswordScreen) {
    return <Redirect href="/(app)/home" />;
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

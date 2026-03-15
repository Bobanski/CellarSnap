import { ActivityIndicator, View } from "react-native";
import { Redirect, Stack, useSegments } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { AuthProvider } from "@/src/providers/AuthProvider";
import { KeyboardDoneAccessory } from "@/src/components/KeyboardDoneAccessory";
import { AgeVerificationProvider, useAgeVerification } from "@/src/lib/ageVerificationContext";
import { APP_SANS_FONT_FAMILY } from "@/src/lib/typography";

export default function RootLayout() {
  return (
    <AgeVerificationProvider>
      <RootNavigator />
    </AgeVerificationProvider>
  );
}

function RootNavigator() {
  const segments = useSegments();
  const { ageChecked, ageVerified } = useAgeVerification();
  const isAgeGateRoute = segments[segments.length - 1] === "age-gate";

  if (!ageChecked) {
    return (
      <View
        style={{
          flex: 1,
          backgroundColor: "#0f0a09",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <StatusBar style="light" />
        <ActivityIndicator color="#fbbf24" />
      </View>
    );
  }

  if (!ageVerified && !isAgeGateRoute) {
    return <Redirect href="/age-gate" />;
  }

  if (ageVerified && isAgeGateRoute) {
    return <Redirect href="/" />;
  }

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
      >
        <Stack.Screen
          name="age-gate"
          options={{ headerShown: false, gestureEnabled: false }}
        />
      </Stack>
      <KeyboardDoneAccessory />
    </AuthProvider>
  );
}

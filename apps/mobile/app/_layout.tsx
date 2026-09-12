import { ActivityIndicator, View } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { Redirect, Stack, useSegments } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { AuthProvider } from "@/src/providers/AuthProvider";
import { KeyboardDoneAccessory } from "@/src/components/KeyboardDoneAccessory";
import { AgeVerificationProvider, useAgeVerification } from "@/src/lib/ageVerificationContext";
import { APP_SANS_FONT_FAMILY, activateFonts } from "@/src/lib/typography";
import { colors } from "@/src/lib/theme";
import {
  useFonts,
  CormorantGaramond_300Light,
  CormorantGaramond_400Regular,
  CormorantGaramond_300Light_Italic,
  CormorantGaramond_400Regular_Italic,
} from "@expo-google-fonts/cormorant-garamond";
import {
  DMSans_300Light,
  DMSans_400Regular,
  DMSans_500Medium,
} from "@expo-google-fonts/dm-sans";

export default function RootLayout() {
  const [fontsLoaded] = useFonts({
    CormorantGaramond_300Light,
    CormorantGaramond_400Regular,
    CormorantGaramond_300Light_Italic,
    CormorantGaramond_400Regular_Italic,
    DMSans_300Light,
    DMSans_400Regular,
    DMSans_500Medium,
  });

  if (fontsLoaded) activateFonts();

  if (!fontsLoaded) {
    return null;
  }

  return (
    <SafeAreaProvider>
      <AgeVerificationProvider>
        <RootNavigator />
      </AgeVerificationProvider>
    </SafeAreaProvider>
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
          backgroundColor: colors.screenBg,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <StatusBar style="light" />
        <ActivityIndicator color={colors.grenache} />
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
          headerStyle: { backgroundColor: colors.screenBg },
          headerTintColor: colors.textPrimary,
          headerTitleStyle: APP_SANS_FONT_FAMILY
            ? { fontFamily: APP_SANS_FONT_FAMILY }
            : undefined,
          headerShadowVisible: false,
          contentStyle: { backgroundColor: colors.screenBg },
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

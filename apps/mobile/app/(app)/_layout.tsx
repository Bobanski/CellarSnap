import { ActivityIndicator, View } from "react-native";
import { Redirect, Stack } from "expo-router";
import { useAuth } from "@/src/providers/AuthProvider";

export default function AppLayout() {
  const { isReady, session } = useAuth();

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

  if (!session) {
    return <Redirect href="/(auth)/sign-in" />;
  }

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="home/index" />
      <Stack.Screen name="entries/index" />
      <Stack.Screen name="entries/[id]" />
      <Stack.Screen name="feed/index" />
      <Stack.Screen name="profile/index" />
      <Stack.Screen name="entries/new" />
    </Stack>
  );
}

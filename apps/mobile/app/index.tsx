import { ActivityIndicator, View } from "react-native";
import { Redirect } from "expo-router";
import { useAuth } from "@/src/providers/AuthProvider";

export default function Index() {
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

  return <Redirect href={session ? "/(app)/entries" : "/(auth)/sign-in"} />;
}

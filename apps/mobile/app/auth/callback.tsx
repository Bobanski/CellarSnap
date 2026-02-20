import { useEffect, useState } from "react";
import { ActivityIndicator, Text, View } from "react-native";
import { router } from "expo-router";
import * as Linking from "expo-linking";
import { handleIncomingAuthUrl } from "@/src/lib/authRedirect";

export default function AuthCallbackScreen() {
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        const currentUrl = await Linking.getInitialURL();
        if (currentUrl) {
          await handleIncomingAuthUrl(currentUrl);
        }
        router.replace("/(app)/entries");
      } catch (callbackError) {
        setError(
          callbackError instanceof Error
            ? callbackError.message
            : "Unable to complete sign in callback."
        );
      }
    })();
  }, []);

  return (
    <View
      style={{
        flex: 1,
        backgroundColor: "#0f0a09",
        alignItems: "center",
        justifyContent: "center",
        padding: 20,
      }}
    >
      <ActivityIndicator color="#fbbf24" />
      <Text style={{ color: "#f4f4f5", marginTop: 16 }}>Completing sign in...</Text>
      {error ? (
        <Text style={{ color: "#fda4af", marginTop: 8, textAlign: "center" }}>{error}</Text>
      ) : null}
    </View>
  );
}

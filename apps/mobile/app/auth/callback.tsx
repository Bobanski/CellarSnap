import {
  useEffect,
  useState } from "react";
import { ActivityIndicator,
  View
} from "react-native";
import { router } from "expo-router";
import * as Linking from "expo-linking";
import { handleIncomingAuthUrl } from "@/src/lib/authRedirect";
import { AppText } from "@/src/components/AppText";

export default function AuthCallbackScreen() {
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        let isRecovery = false;
        const currentUrl = await Linking.getInitialURL();
        if (currentUrl) {
          const result = await handleIncomingAuthUrl(currentUrl);
          isRecovery = result.isRecovery;
        }
        router.replace(isRecovery ? "/(auth)/reset-password" : "/(app)/entries");
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
      <AppText style={{ color: "#f4f4f5", marginTop: 16 }}>Completing sign in...</AppText>
      {error ? (
        <AppText style={{ color: "#fda4af", marginTop: 8, textAlign: "center" }}>{error}</AppText>
      ) : null}
    </View>
  );
}


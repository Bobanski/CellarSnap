import { ActivityIndicator, View } from "react-native";
import { Redirect } from "expo-router";
import { useAuth } from "@/src/providers/AuthProvider";
import { colors } from "@/src/lib/theme";

export default function Index() {
  const { isReady, session } = useAuth();

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

  return <Redirect href={session ? "/(app)/feed" : "/(auth)/sign-in"} />;
}

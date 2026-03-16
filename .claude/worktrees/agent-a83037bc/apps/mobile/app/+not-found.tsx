import { Link } from "expo-router";
import { Pressable, View } from "react-native";
import { AppText } from "@/src/components/AppText";
import { colors } from "@/src/lib/theme";

export default function NotFoundScreen() {
  return (
    <View
      style={{
        flex: 1,
        backgroundColor: colors.champagne,
        alignItems: "center",
        justifyContent: "center",
        padding: 20,
        gap: 12,
      }}
    >
      <AppText style={{ color: colors.terroir, fontSize: 28, fontWeight: "700" }}>Not found</AppText>
      <AppText style={{ color: colors.fog, textAlign: "center" }}>
        This screen does not exist in the current build.
      </AppText>
      <Link href="/" asChild>
        <Pressable
          style={{
            marginTop: 8,
            backgroundColor: colors.grenache,
            borderRadius: 10,
            paddingHorizontal: 16,
            paddingVertical: 10,
          }}
        >
          <AppText style={{ color: colors.champagne, fontWeight: "700" }}>Go Home</AppText>
        </Pressable>
      </Link>
    </View>
  );
}


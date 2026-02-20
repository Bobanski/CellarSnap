import { Link } from "expo-router";
import { Pressable, Text, View } from "react-native";

export default function NotFoundScreen() {
  return (
    <View
      style={{
        flex: 1,
        backgroundColor: "#0f0a09",
        alignItems: "center",
        justifyContent: "center",
        padding: 20,
        gap: 12,
      }}
    >
      <Text style={{ color: "#f9fafb", fontSize: 28, fontWeight: "700" }}>Not found</Text>
      <Text style={{ color: "#9ca3af", textAlign: "center" }}>
        This screen does not exist in the current build.
      </Text>
      <Link href="/" asChild>
        <Pressable
          style={{
            marginTop: 8,
            backgroundColor: "#fbbf24",
            borderRadius: 10,
            paddingHorizontal: 16,
            paddingVertical: 10,
          }}
        >
          <Text style={{ color: "#09090b", fontWeight: "700" }}>Go Home</Text>
        </Pressable>
      </Link>
    </View>
  );
}

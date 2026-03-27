import { ActivityIndicator, Pressable, StyleSheet, View, type GestureResponderEvent } from "react-native";
import { Redirect, Tabs } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { useAuth } from "@/src/providers/AuthProvider";
import { AppText } from "@/src/components/AppText";
import { colors } from "@/src/lib/theme";

function LogTabButton(props: Record<string, unknown>) {
  const onPress = props.onPress as
    | ((e: GestureResponderEvent) => void)
    | undefined;
  return (
    <Pressable onPress={onPress} style={fabStyles.wrapper}>
      <View style={fabStyles.circle}>
        <Feather name="plus" size={22} color={colors.textPrimary} />
      </View>
      <AppText style={fabStyles.label}>LOG</AppText>
    </Pressable>
  );
}

const fabStyles = StyleSheet.create({
  wrapper: {
    alignItems: "center",
    justifyContent: "flex-end",
    top: -14,
  },
  circle: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: colors.accentPrimary,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: colors.accentPrimary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.45,
    shadowRadius: 10,
    elevation: 8,
  },
  label: {
    fontSize: 8,
    letterSpacing: 1,
    textTransform: "uppercase",
    fontWeight: "500",
    color: colors.accentSecondary,
    marginTop: 4,
  },
});

export default function AppLayout() {
  const { isReady, session, hasPrivateBetaFeatureAccess } = useAuth();

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

  if (!session) {
    return <Redirect href="/(auth)/sign-in" />;
  }

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          backgroundColor: colors.surfacePrimary,
          borderTopColor: "rgba(123, 29, 58, 0.3)",
          borderTopWidth: 0.5,
          paddingTop: 6,
          height: 80,
        },
        tabBarActiveTintColor: colors.accentSecondary,
        tabBarInactiveTintColor: colors.textTertiary,
        tabBarLabelStyle: {
          fontSize: 8,
          letterSpacing: 1,
          textTransform: "uppercase",
          fontWeight: "500",
        },
      }}
    >
      {/* ── Visible tabs ─────────────────────────────── */}
      <Tabs.Screen
        name="home/index"
        options={{
          title: "Feed",
          tabBarIcon: ({ color, size }) => (
            <Feather name="home" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="entries/index"
        options={{
          title: "Cellar",
          tabBarIcon: ({ color, size }) => (
            <Feather name="grid" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="entries/new"
        options={{
          title: "Log",
          tabBarButton: (props) => <LogTabButton {...props} />,
        }}
      />
      <Tabs.Screen
        name="sommelier"
        options={{
          title: "Somm",
          href: hasPrivateBetaFeatureAccess ? undefined : null,
          tabBarIcon: ({ color, size }) => (
            <Feather name="message-circle" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="list-scan/index"
        options={{
          title: "Scan",
          href: hasPrivateBetaFeatureAccess ? undefined : null,
          tabBarIcon: ({ color, size }) => (
            <Feather name="camera" size={size} color={color} />
          ),
        }}
      />

      {/* ── Hidden screens (still navigable, not shown as tabs) ── */}
      <Tabs.Screen
        name="list-scan/results"
        options={{ href: null }}
      />
      <Tabs.Screen
        name="list-scan/history"
        options={{ href: null }}
      />
      <Tabs.Screen
        name="entries/[id]"
        options={{ href: null }}
      />
      <Tabs.Screen
        name="feed/index"
        options={{ href: null }}
      />
      <Tabs.Screen
        name="profile/index"
        options={{ href: null }}
      />
      <Tabs.Screen
        name="profile/[userId]"
        options={{ href: null }}
      />
    </Tabs>
  );
}

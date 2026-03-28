import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  View,
  type GestureResponderEvent,
} from "react-native";
import { Redirect, Tabs } from "expo-router";
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
        <View style={fabStyles.logGlyph}>
          <View style={fabStyles.logInnerCircle} />
          <View style={fabStyles.logStem} />
          <View style={fabStyles.logCrossHorizontal} />
          <View style={fabStyles.logCrossVertical} />
          <View style={fabStyles.logTopArc} />
        </View>
      </View>
      <AppText style={fabStyles.label}>LOG</AppText>
    </Pressable>
  );
}

function FeedIcon({ color }: { color: string }) {
  return (
    <View style={tabIconStyles.feedIcon}>
      <View style={[tabIconStyles.feedDotTop, { backgroundColor: color }]} />
      <View style={[tabIconStyles.feedDotLeft, { backgroundColor: color }]} />
      <View style={[tabIconStyles.feedDotRight, { backgroundColor: color }]} />
      <View style={[tabIconStyles.feedStem, { backgroundColor: color }]} />
      <View style={[tabIconStyles.feedArc, { borderColor: color }]} />
    </View>
  );
}

function CellarIcon({ color }: { color: string }) {
  return (
    <View style={[tabIconStyles.gridIcon, { borderColor: color }]}>
      <View style={[tabIconStyles.gridDividerH, { backgroundColor: color }]} />
      <View style={[tabIconStyles.gridDividerV, { backgroundColor: color }]} />
      <View style={[tabIconStyles.gridDot, tabIconStyles.gridDotTopLeft, { backgroundColor: color }]} />
      <View style={[tabIconStyles.gridDot, tabIconStyles.gridDotTopRight, { backgroundColor: color }]} />
      <View style={[tabIconStyles.gridDot, tabIconStyles.gridDotBottomLeft, { backgroundColor: color }]} />
      <View style={[tabIconStyles.gridDot, tabIconStyles.gridDotBottomRight, { backgroundColor: color }]} />
    </View>
  );
}

function SommIcon({ color }: { color: string }) {
  return (
    <View style={tabIconStyles.sommIcon}>
      <View style={[tabIconStyles.sommBowl, { borderColor: color }]} />
      <View style={[tabIconStyles.sommStem, { backgroundColor: color }]} />
      <View style={[tabIconStyles.sommBase, { backgroundColor: color }]} />
      <View style={[tabIconStyles.sommRim, { backgroundColor: color }]} />
    </View>
  );
}

function ScanIcon({ color }: { color: string }) {
  return (
    <View style={[tabIconStyles.scanIcon, { borderColor: color }]}>
      <View style={[tabIconStyles.scanLine, { backgroundColor: color }]} />
      <View style={[tabIconStyles.scanTickLeft, { backgroundColor: color }]} />
      <View style={[tabIconStyles.scanTickRight, { backgroundColor: color }]} />
    </View>
  );
}

const fabStyles = StyleSheet.create({
  wrapper: {
    alignItems: "center",
    justifyContent: "flex-end",
    top: 4,
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
  logGlyph: {
    width: 26,
    height: 26,
    position: "relative",
    alignItems: "center",
    justifyContent: "center",
  },
  logInnerCircle: {
    position: "absolute",
    width: 16.5,
    height: 16.5,
    borderRadius: 999,
    backgroundColor: "#F5EDD6",
    top: 4.8,
  },
  logStem: {
    position: "absolute",
    top: 6,
    width: 1.2,
    height: 6.2,
    borderRadius: 999,
    backgroundColor: colors.textPrimary,
  },
  logCrossHorizontal: {
    position: "absolute",
    top: 13.2,
    width: 7.8,
    height: 1.2,
    borderRadius: 999,
    backgroundColor: colors.accentPrimary,
  },
  logCrossVertical: {
    position: "absolute",
    top: 10.9,
    width: 1.2,
    height: 6.3,
    borderRadius: 999,
    backgroundColor: colors.accentPrimary,
  },
  logTopArc: {
    position: "absolute",
    top: 4.6,
    width: 7.2,
    height: 1.1,
    borderRadius: 999,
    backgroundColor: colors.textPrimary,
    opacity: 0.45,
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

const tabIconStyles = StyleSheet.create({
  feedIcon: {
    width: 20,
    height: 20,
    position: "relative",
    alignItems: "center",
    justifyContent: "center",
  },
  feedDotTop: {
    position: "absolute",
    top: 2,
    left: 7,
    width: 5,
    height: 5,
    borderRadius: 999,
  },
  feedDotLeft: {
    position: "absolute",
    top: 8,
    left: 3,
    width: 5,
    height: 5,
    borderRadius: 999,
    opacity: 0.82,
  },
  feedDotRight: {
    position: "absolute",
    top: 8,
    right: 3,
    width: 5,
    height: 5,
    borderRadius: 999,
    opacity: 0.68,
  },
  feedStem: {
    position: "absolute",
    top: 1,
    left: 9,
    width: 1.2,
    height: 5,
    borderRadius: 999,
    opacity: 0.8,
  },
  feedArc: {
    position: "absolute",
    top: 1.1,
    left: 10.1,
    width: 5.3,
    height: 2.4,
    borderTopWidth: 1.1,
    borderRightWidth: 1.1,
    borderTopRightRadius: 999,
    transform: [{ rotate: "12deg" }],
    opacity: 0.65,
  },
  gridIcon: {
    width: 18,
    height: 18,
    borderRadius: 4,
    borderWidth: 1,
    position: "relative",
  },
  gridDividerH: {
    position: "absolute",
    left: 2,
    right: 2,
    top: 8.5,
    height: 1,
    opacity: 0.55,
  },
  gridDividerV: {
    position: "absolute",
    top: 2,
    bottom: 2,
    left: 8.5,
    width: 1,
    opacity: 0.55,
  },
  gridDot: {
    position: "absolute",
    width: 2.4,
    height: 2.4,
    borderRadius: 999,
    opacity: 0.75,
  },
  gridDotTopLeft: { top: 4, left: 4 },
  gridDotTopRight: { top: 4, right: 4 },
  gridDotBottomLeft: { bottom: 4, left: 4 },
  gridDotBottomRight: { bottom: 4, right: 4 },
  sommIcon: {
    width: 20,
    height: 20,
    position: "relative",
    alignItems: "center",
    justifyContent: "center",
  },
  sommBowl: {
    position: "absolute",
    top: 3,
    width: 10,
    height: 7,
    borderWidth: 1.2,
    borderBottomWidth: 0,
    borderTopLeftRadius: 999,
    borderTopRightRadius: 999,
    opacity: 0.85,
  },
  sommStem: {
    position: "absolute",
    top: 9,
    width: 1.2,
    height: 5,
    borderRadius: 999,
    opacity: 0.85,
  },
  sommBase: {
    position: "absolute",
    bottom: 4,
    width: 8,
    height: 1.2,
    borderRadius: 999,
    opacity: 0.65,
  },
  sommRim: {
    position: "absolute",
    top: 2,
    width: 6,
    height: 1.1,
    borderRadius: 999,
    opacity: 0.45,
  },
  scanIcon: {
    width: 18,
    height: 18,
    borderRadius: 4,
    borderWidth: 1,
    position: "relative",
  },
  scanLine: {
    position: "absolute",
    left: 3,
    right: 3,
    top: 8.5,
    height: 1.2,
    opacity: 0.55,
  },
  scanTickLeft: {
    position: "absolute",
    left: 3.2,
    top: 4.5,
    width: 3.6,
    height: 1.2,
    borderRadius: 999,
    opacity: 0.75,
  },
  scanTickRight: {
    position: "absolute",
    right: 3.2,
    bottom: 4.5,
    width: 3.6,
    height: 1.2,
    borderRadius: 999,
    opacity: 0.75,
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
        tabBarHideOnKeyboard: true,
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
        name="feed/index"
        options={{
          title: "Feed",
          tabBarIcon: ({ color }) => <FeedIcon color={color} />,
        }}
      />
      <Tabs.Screen
        name="entries/index"
        options={{
          title: "Cellar",
          tabBarIcon: ({ color }) => <CellarIcon color={color} />,
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
          tabBarIcon: ({ color }) => <SommIcon color={color} />,
        }}
      />
      <Tabs.Screen
        name="list-scan/index"
        options={{
          title: "Scan",
          href: hasPrivateBetaFeatureAccess ? undefined : null,
          tabBarIcon: ({ color }) => <ScanIcon color={color} />,
        }}
      />

      {/* ── Hidden screens (still navigable, not shown as tabs) ── */}
      <Tabs.Screen
        name="home/index"
        options={{ href: null }}
      />
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
        name="profile/index"
        options={{ href: null }}
      />
      <Tabs.Screen
        name="friends"
        options={{ href: null }}
      />
      <Tabs.Screen
        name="profile/[userId]"
        options={{ href: null }}
      />
      <Tabs.Screen
        name="taste-survey"
        options={{ href: null }}
      />
      <Tabs.Screen
        name="palate"
        options={{ href: null }}
      />
      <Tabs.Screen
        name="cellar-add"
        options={{ href: null }}
      />
      <Tabs.Screen
        name="cellar-import-ct"
        options={{ href: null }}
      />
    </Tabs>
  );
}

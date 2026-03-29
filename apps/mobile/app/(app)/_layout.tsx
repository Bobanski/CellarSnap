import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  View,
  type GestureResponderEvent,
} from "react-native";
import Svg, { Circle, Rect, Path, Line, Ellipse } from "react-native-svg";
import { Redirect, Tabs } from "expo-router";
import { useAuth } from "@/src/providers/AuthProvider";
import { AppText } from "@/src/components/AppText";
import { colors } from "@/src/lib/theme";

// ─── Brand SVG Icons ─────────────────────────────────────────

function FeedIcon({ color }: { color: string }) {
  const s = 20;
  return (
    <Svg width={s} height={s} viewBox={`0 0 ${s} ${s}`} fill="none">
      <Circle cx={s*.5} cy={s*.32} r={s*.18} fill={color} opacity={0.95} />
      <Circle cx={s*.32} cy={s*.56} r={s*.18} fill={color} opacity={0.8} />
      <Circle cx={s*.68} cy={s*.56} r={s*.18} fill={color} opacity={0.6} />
      <Line x1={s*.5} y1={s*.14} x2={s*.5} y2={s*.1} stroke={color} strokeWidth={s*.045} strokeLinecap="round" opacity={0.8} />
      <Path d={`M${s*.5} ${s*.1} Q${s*.62} ${s*.06} ${s*.66} ${s*.1}`} stroke={color} strokeWidth={s*.035} fill="none" strokeLinecap="round" opacity={0.6} />
    </Svg>
  );
}

function CellarIcon({ color }: { color: string }) {
  // Deep tunnel icon from handover SVG — scaled to 20px
  const s = 20;
  const scale = s / 64;
  return (
    <Svg width={s} height={s} viewBox="0 0 64 64" fill="none">
      <Path d="M5.12 56.32 L5.12 28.16 Q5.12 3.84 32 3.84 Q58.88 3.84 58.88 28.16 L58.88 56.32" fill="none" stroke={color} strokeWidth={2.88} strokeLinecap="round" opacity={0.3} />
      <Path d="M14.08 56.32 L14.08 30.72 Q14.08 11.52 32 11.52 Q49.92 11.52 49.92 30.72 L49.92 56.32" fill="none" stroke={color} strokeWidth={2.88} strokeLinecap="round" opacity={0.55} />
      <Path d="M21.76 56.32 L21.76 33.28 Q21.76 17.92 32 17.92 Q42.24 17.92 42.24 33.28 L42.24 56.32" fill={color} opacity={0.2} />
      <Path d="M21.76 56.32 L21.76 33.28 Q21.76 17.92 32 17.92 Q42.24 17.92 42.24 33.28 L42.24 56.32" fill="none" stroke={color} strokeWidth={2.56} strokeLinecap="round" opacity={0.8} />
      <Circle cx={32} cy={35.84} r={5.12} fill={color} opacity={0.9} />
      <Line x1={5.12} y1={56.32} x2={58.88} y2={56.32} stroke={color} strokeWidth={1.92} strokeLinecap="round" opacity={0.25} />
    </Svg>
  );
}

function SommIcon({ color }: { color: string }) {
  const s = 20;
  return (
    <Svg width={s} height={s} viewBox={`0 0 ${s} ${s}`} fill="none">
      <Ellipse cx={s*.5} cy={s*.72} rx={s*.28} ry={s*.18} fill={color} opacity={0.9} />
      <Path d={`M${s*.44} ${s*.58} Q${s*.44} ${s*.44} ${s*.46} ${s*.3} Q${s*.48} ${s*.2} ${s*.5} ${s*.18} Q${s*.52} ${s*.2} ${s*.54} ${s*.3} Q${s*.56} ${s*.44} ${s*.56} ${s*.58} Z`} fill={color} opacity={0.85} />
      <Circle cx={s*.5} cy={s*.16} r={s*.06} fill={color} opacity={0.8} />
      <Ellipse cx={s*.5} cy={s*.77} rx={s*.18} ry={s*.08} fill={color} opacity={0.45} />
    </Svg>
  );
}

function ScanIcon({ color }: { color: string }) {
  // Uses the Explore icon from brand guide (circle + orbiting dots)
  const s = 20;
  return (
    <Svg width={s} height={s} viewBox={`0 0 ${s} ${s}`} fill="none">
      <Circle cx={s*.44} cy={s*.5} r={s*.3} fill={color} opacity={0.9} />
      <Circle cx={s*.44} cy={s*.5} r={s*.17} fill={color} opacity={0.5} />
      <Circle cx={s*.8} cy={s*.28} r={s*.1} fill={color} opacity={0.85} />
      <Circle cx={s*.82} cy={s*.54} r={s*.08} fill={color} opacity={0.65} />
      <Circle cx={s*.72} cy={s*.78} r={s*.07} fill={color} opacity={0.45} />
      <Line x1={s*.76} y1={s*.34} x2={s*.66} y2={s*.42} stroke={color} strokeWidth={s*.03} opacity={0.35} />
      <Line x1={s*.78} y1={s*.54} x2={s*.66} y2={s*.54} stroke={color} strokeWidth={s*.03} opacity={0.35} />
      <Line x1={s*.72} y1={s*.74} x2={s*.64} y2={s*.67} stroke={color} strokeWidth={s*.03} opacity={0.35} />
    </Svg>
  );
}

function LogTabButton(props: Record<string, unknown>) {
  const onPress = props.onPress as
    | ((e: GestureResponderEvent) => void)
    | undefined;
  const s = 26;
  return (
    <Pressable onPress={onPress} style={fabStyles.wrapper}>
      <View style={fabStyles.circle}>
        <Svg width={s} height={s} viewBox={`0 0 ${s} ${s}`} fill="none">
          <Circle cx={s*.5} cy={s*.54} r={s*.26} fill="#F5EDD6" opacity={0.9} />
          <Line x1={s*.5} y1={s*.28} x2={s*.5} y2={s*.22} stroke="#F5EDD6" strokeWidth={s*.045} strokeLinecap="round" opacity={0.8} />
          <Path d={`M${s*.5} ${s*.22} Q${s*.61} ${s*.17} ${s*.65} ${s*.21}`} stroke="#F5EDD6" strokeWidth={s*.035} fill="none" strokeLinecap="round" opacity={0.65} />
          <Rect x={s*.46} y={s*.42} width={s*.08} height={s*.24} rx={s*.03} fill={colors.accentPrimary} opacity={0.9} />
          <Rect x={s*.38} y={s*.5} width={s*.24} height={s*.08} rx={s*.03} fill={colors.accentPrimary} opacity={0.9} />
        </Svg>
      </View>
      <AppText style={fabStyles.label}>LOG</AppText>
    </Pressable>
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
      <Tabs.Screen
        name="explore"
        options={{ href: null }}
      />
      <Tabs.Screen
        name="explore-browse"
        options={{ href: null }}
      />
    </Tabs>
  );
}

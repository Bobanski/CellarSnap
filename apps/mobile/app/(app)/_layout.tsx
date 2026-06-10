import type { ComponentProps } from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  View,
  type ColorValue,
  type GestureResponderEvent,
} from "react-native";
import Svg, { Circle, Rect, Path, Line, Ellipse } from "react-native-svg";
import { Redirect, Tabs } from "expo-router";
import type { BottomTabNavigationOptions } from "expo-router/build/react-navigation/bottom-tabs";
import { useAuth } from "@/src/providers/AuthProvider";
import { AppText } from "@/src/components/AppText";
import { colors } from "@/src/lib/theme";

// The options prop of Tabs.Screen is BottomTabNavigationOptions extended with
// expo-router's href field. We derive the exact type from the component rather
// than re-declaring it manually.
type TabScreenOptions = NonNullable<ComponentProps<typeof Tabs.Screen>["options"]>;

function FeedIcon({ color }: { color: ColorValue }) {
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

function CellarIcon({ color }: { color: ColorValue }) {
  return (
    <Svg width={20} height={20} viewBox="0 0 64 64" fill="none">
      <Path d="M5.12 56.32 L5.12 28.16 Q5.12 3.84 32 3.84 Q58.88 3.84 58.88 28.16 L58.88 56.32" fill="none" stroke={color} strokeWidth={2.88} strokeLinecap="round" opacity={0.3} />
      <Path d="M14.08 56.32 L14.08 30.72 Q14.08 11.52 32 11.52 Q49.92 11.52 49.92 30.72 L49.92 56.32" fill="none" stroke={color} strokeWidth={2.88} strokeLinecap="round" opacity={0.55} />
      <Path d="M21.76 56.32 L21.76 33.28 Q21.76 17.92 32 17.92 Q42.24 17.92 42.24 33.28 L42.24 56.32" fill={color} opacity={0.2} />
      <Path d="M21.76 56.32 L21.76 33.28 Q21.76 17.92 32 17.92 Q42.24 17.92 42.24 33.28 L42.24 56.32" fill="none" stroke={color} strokeWidth={2.56} strokeLinecap="round" opacity={0.8} />
      <Circle cx={32} cy={35.84} r={5.12} fill={color} opacity={0.9} />
      <Line x1={5.12} y1={56.32} x2={58.88} y2={56.32} stroke={color} strokeWidth={1.92} strokeLinecap="round" opacity={0.25} />
    </Svg>
  );
}

function SommIcon({ color }: { color: ColorValue }) {
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

function ScanIcon({ color }: { color: ColorValue }) {
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

// ── Module-level stable references ──────────────────────────────────────
// tabBarIcon callbacks must be stable so the tab bar doesn't reconcile
// on every auth-state render.
function renderFeedIcon({ color }: { color: ColorValue }) {
  return <FeedIcon color={color} />;
}
function renderCellarIcon({ color }: { color: ColorValue }) {
  return <CellarIcon color={color} />;
}
function renderSommIcon({ color }: { color: ColorValue }) {
  return <SommIcon color={color} />;
}
function renderScanIcon({ color }: { color: ColorValue }) {
  return <ScanIcon color={color} />;
}

const TAB_SCREEN_OPTIONS: BottomTabNavigationOptions = {
  headerShown: false,
  tabBarHideOnKeyboard: true,
  tabBarStyle: {
    // Variant C — translucent over void. Mirror of web .bottom-tab-bar.
    // For true blur, switch to tabBarBackground prop with
    // expo-blur <BlurView intensity={70} tint="dark" /> in a
    // follow-up if this direction lands.
    backgroundColor: "rgba(26, 10, 16, 0.72)",
    borderTopColor: "rgba(196, 96, 122, 0.18)",
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
};

// Per-screen options that contain no render-scope values are hoisted here.
// Screens whose options depend on render-scope values (hasPrivateBetaFeatureAccess,
// href: null) are kept inline since they're static objects anyway (no closures).
const FEED_SCREEN_OPTIONS: BottomTabNavigationOptions = {
  title: "Feed",
  tabBarIcon: renderFeedIcon,
};

const CELLAR_SCREEN_OPTIONS: BottomTabNavigationOptions = {
  title: "Cellar",
  tabBarIcon: renderCellarIcon,
};

const HIDDEN_SCREEN_OPTIONS: TabScreenOptions = { href: null };

const BADGES_SCREEN_OPTIONS: TabScreenOptions = {
  href: null,
  headerShown: false,
};

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

  // Somm/Scan options depend on hasPrivateBetaFeatureAccess (render-scope).
  // The href value changes per-user but is stable within a session, so these
  // objects are created once per mount (not per render — identity is the same
  // object reference across re-renders of the same AppLayout instance because
  // hasPrivateBetaFeatureAccess doesn't change at runtime). They can't be
  // fully hoisted to module scope because they depend on the auth value.
  const sommOptions: TabScreenOptions = {
    title: "Somm",
    href: hasPrivateBetaFeatureAccess ? undefined : null,
    tabBarIcon: renderSommIcon,
  };
  const scanOptions: TabScreenOptions = {
    title: "Scan",
    href: hasPrivateBetaFeatureAccess ? undefined : null,
    tabBarIcon: renderScanIcon,
  };

  return (
    <Tabs screenOptions={TAB_SCREEN_OPTIONS}>
      {/* ── Visible tabs ─────────────────────────────── */}
      <Tabs.Screen name="feed/index" options={FEED_SCREEN_OPTIONS} />
      <Tabs.Screen name="entries/index" options={CELLAR_SCREEN_OPTIONS} />
      <Tabs.Screen
        name="entries/new"
        options={{
          title: "Log",
          tabBarButton: (props) => <LogTabButton {...props} />,
        }}
      />
      <Tabs.Screen name="sommelier" options={sommOptions} />
      <Tabs.Screen name="list-scan/index" options={scanOptions} />

      {/* ── Hidden screens (still navigable, not shown as tabs) ── */}
      <Tabs.Screen name="home/index" options={HIDDEN_SCREEN_OPTIONS} />
      <Tabs.Screen name="list-scan/results" options={HIDDEN_SCREEN_OPTIONS} />
      <Tabs.Screen name="list-scan/history" options={HIDDEN_SCREEN_OPTIONS} />
      <Tabs.Screen name="entries/[id]" options={HIDDEN_SCREEN_OPTIONS} />
      <Tabs.Screen
        name="entries/collections/[collectionId]"
        options={HIDDEN_SCREEN_OPTIONS}
      />
      <Tabs.Screen name="profile/index" options={HIDDEN_SCREEN_OPTIONS} />
      <Tabs.Screen name="friends" options={HIDDEN_SCREEN_OPTIONS} />
      <Tabs.Screen name="profile/[userId]" options={HIDDEN_SCREEN_OPTIONS} />
      <Tabs.Screen name="taste-survey" options={HIDDEN_SCREEN_OPTIONS} />
      <Tabs.Screen name="palate" options={HIDDEN_SCREEN_OPTIONS} />
      <Tabs.Screen name="cellar-add" options={HIDDEN_SCREEN_OPTIONS} />
      <Tabs.Screen name="cellar-import-ct" options={HIDDEN_SCREEN_OPTIONS} />
      <Tabs.Screen name="explore" options={HIDDEN_SCREEN_OPTIONS} />
      <Tabs.Screen name="explore-browse" options={HIDDEN_SCREEN_OPTIONS} />
      <Tabs.Screen name="collections" options={HIDDEN_SCREEN_OPTIONS} />
      <Tabs.Screen name="badges" options={BADGES_SCREEN_OPTIONS} />
    </Tabs>
  );
}

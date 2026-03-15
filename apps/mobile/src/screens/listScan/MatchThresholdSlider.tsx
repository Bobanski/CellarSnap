import { useMemo, useState } from "react";
import { LayoutChangeEvent, PanResponder, StyleSheet, View } from "react-native";
import { AppText } from "@/src/components/AppText";

export default function MatchThresholdSlider({
  value,
  onChange,
}: {
  value: number;
  onChange: (next: number) => void;
}) {
  const [trackWidth, setTrackWidth] = useState(0);

  const updateValue = (locationX: number) => {
    if (trackWidth <= 0) {
      return;
    }
    const clamped = Math.max(0, Math.min(locationX, trackWidth));
    onChange(Math.round((clamped / trackWidth) * 100));
  };

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderGrant: (event) => updateValue(event.nativeEvent.locationX),
        onPanResponderMove: (event) => updateValue(event.nativeEvent.locationX),
      }),
    [trackWidth]
  );

  const handleLayout = (event: LayoutChangeEvent) => {
    setTrackWidth(event.nativeEvent.layout.width);
  };

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <AppText style={styles.label}>Match threshold</AppText>
        <AppText style={styles.value}>{value}%+</AppText>
      </View>
      <View style={styles.trackWrap} onLayout={handleLayout} {...panResponder.panHandlers}>
        <View style={styles.track} />
        <View style={[styles.fill, { width: `${value}%` }]} />
        <View style={[styles.thumb, { left: `${value}%` }]} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
    backgroundColor: "rgba(0,0,0,0.22)",
    padding: 14,
    gap: 10,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  label: {
    color: "#a1a1aa",
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 2,
    textTransform: "uppercase",
  },
  value: {
    color: "#6ee7b7",
    fontSize: 16,
    fontWeight: "700",
  },
  trackWrap: {
    position: "relative",
    height: 34,
    justifyContent: "center",
  },
  track: {
    height: 6,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.10)",
  },
  fill: {
    position: "absolute",
    left: 0,
    height: 6,
    borderRadius: 999,
    backgroundColor: "#34d399",
  },
  thumb: {
    position: "absolute",
    marginLeft: -10,
    width: 20,
    height: 20,
    borderRadius: 999,
    backgroundColor: "#34d399",
    borderWidth: 3,
    borderColor: "#052e16",
  },
});

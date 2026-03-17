import { useEffect, useState } from "react";
import {
  Keyboard,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  type KeyboardEvent,
  View,
} from "react-native";
import { colors } from "@/src/lib/theme";

type KeyboardVisibility = {
  visible: boolean;
  height: number;
};

function getKeyboardHeight(event: KeyboardEvent | undefined) {
  const maybeHeight = event?.endCoordinates?.height;
  if (typeof maybeHeight !== "number" || maybeHeight <= 0) {
    return 0;
  }
  return Math.round(maybeHeight);
}

export function KeyboardDoneAccessory() {
  const [keyboard, setKeyboard] = useState<KeyboardVisibility>({
    visible: false,
    height: 0,
  });

  useEffect(() => {
    if (Platform.OS !== "android") {
      return;
    }

    const handleShow = (event: KeyboardEvent) => {
      setKeyboard({
        visible: true,
        height: getKeyboardHeight(event),
      });
    };
    const handleHide = () => {
      setKeyboard({
        visible: false,
        height: 0,
      });
    };
    const subscriptions = [
      Keyboard.addListener("keyboardDidShow", handleShow),
      Keyboard.addListener("keyboardDidHide", handleHide),
    ];

    return () => {
      subscriptions.forEach((subscription) => subscription.remove());
    };
  }, []);

  if (Platform.OS !== "android" || !keyboard.visible) {
    return null;
  }

  return (
    <View pointerEvents="box-none" style={styles.root}>
      <View
        style={[
          styles.accessory,
          { bottom: keyboard.height },
        ]}
      >
        <Pressable onPress={Keyboard.dismiss} hitSlop={8}>
          <Text style={styles.doneText}>Done</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 999,
    elevation: 999,
  },
  accessory: {
    position: "absolute",
    left: 0,
    right: 0,
    alignItems: "flex-end",
    backgroundColor: "transparent",
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 6,
  },
  doneText: {
    color: colors.grenache,
    fontSize: 17,
    fontWeight: "700",
  },
});

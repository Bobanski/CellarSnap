import { useEffect, useState } from "react";
import {
  Keyboard,
  Platform,
  Pressable,
  StyleSheet,
  type KeyboardEvent,
  View,
} from "react-native";
import { AppText } from "@/src/components/AppText";

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
          <AppText style={styles.doneText}>Done</AppText>
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
    borderTopWidth: 1,
    borderTopColor: "rgba(0, 0, 0, 0.14)",
    backgroundColor: "#f2f2f7",
    paddingHorizontal: 16,
    paddingVertical: 9,
  },
  doneText: {
    color: "#007aff",
    fontSize: 17,
    fontWeight: "700",
  },
});

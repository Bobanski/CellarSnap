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
    if (Platform.OS !== "ios" && Platform.OS !== "android") {
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
    const handleFrameChange = (event: KeyboardEvent) => {
      const nextHeight = getKeyboardHeight(event);
      if (nextHeight <= 0) {
        handleHide();
        return;
      }
      setKeyboard({
        visible: true,
        height: nextHeight,
      });
    };

    const subscriptions =
      Platform.OS === "ios"
        ? [
            Keyboard.addListener("keyboardWillShow", handleShow),
            Keyboard.addListener("keyboardWillHide", handleHide),
            Keyboard.addListener("keyboardWillChangeFrame", handleFrameChange),
          ]
        : [
            Keyboard.addListener("keyboardDidShow", handleShow),
            Keyboard.addListener("keyboardDidHide", handleHide),
          ];

    return () => {
      subscriptions.forEach((subscription) => subscription.remove());
    };
  }, []);

  if (!keyboard.visible) {
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
        <Pressable onPress={Keyboard.dismiss} hitSlop={8} style={styles.doneButton}>
          <View style={styles.checkBox}>
            <AppText style={styles.checkMark}>✓</AppText>
          </View>
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
    borderTopColor: "rgba(255, 255, 255, 0.12)",
    backgroundColor: "#18181b",
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  doneButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  checkBox: {
    width: 18,
    height: 18,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: "rgba(251, 191, 36, 0.75)",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(251, 191, 36, 0.2)",
  },
  checkMark: {
    color: "#fde68a",
    fontSize: 12,
    fontWeight: "700",
    lineHeight: 14,
  },
  doneText: {
    color: "#fcd34d",
    fontSize: 15,
    fontWeight: "700",
  },
});

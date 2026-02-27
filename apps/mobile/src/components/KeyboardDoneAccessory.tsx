import { useEffect, useState } from "react";
import {
  InputAccessoryView,
  Keyboard,
  Platform,
  Pressable,
  StyleSheet,
  View,
} from "react-native";
import { AppText } from "@/src/components/AppText";

export const IOS_KEYBOARD_DONE_ACCESSORY_ID = "cellarsnap-keyboard-done-accessory";

export function KeyboardDoneAccessory() {
  const [androidKeyboardHeight, setAndroidKeyboardHeight] = useState(0);
  const [androidKeyboardVisible, setAndroidKeyboardVisible] = useState(false);

  useEffect(() => {
    if (Platform.OS !== "android") {
      return;
    }

    const showSub = Keyboard.addListener("keyboardDidShow", (event) => {
      setAndroidKeyboardHeight(event.endCoordinates?.height ?? 0);
      setAndroidKeyboardVisible(true);
    });
    const hideSub = Keyboard.addListener("keyboardDidHide", () => {
      setAndroidKeyboardVisible(false);
      setAndroidKeyboardHeight(0);
    });

    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

  if (Platform.OS === "ios") {
    return (
      <InputAccessoryView nativeID={IOS_KEYBOARD_DONE_ACCESSORY_ID}>
        <View style={styles.accessory}>
          <Pressable onPress={Keyboard.dismiss} hitSlop={8}>
            <AppText style={styles.doneText}>Done</AppText>
          </Pressable>
        </View>
      </InputAccessoryView>
    );
  }

  if (Platform.OS === "android" && androidKeyboardVisible) {
    return (
      <View pointerEvents="box-none" style={styles.androidOverlay}>
        <View style={[styles.accessory, styles.androidAccessory, { bottom: androidKeyboardHeight }]}>
          <Pressable onPress={Keyboard.dismiss} hitSlop={8}>
            <AppText style={styles.doneText}>Done</AppText>
          </Pressable>
        </View>
      </View>
    );
  }

  return null;
}

const styles = StyleSheet.create({
  androidOverlay: {
    ...StyleSheet.absoluteFillObject,
  },
  androidAccessory: {
    left: 0,
    right: 0,
    position: "absolute",
  },
  accessory: {
    alignItems: "flex-end",
    borderTopWidth: 1,
    borderTopColor: "rgba(255, 255, 255, 0.12)",
    backgroundColor: "#18181b",
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  doneText: {
    color: "#fcd34d",
    fontSize: 15,
    fontWeight: "700",
  },
});


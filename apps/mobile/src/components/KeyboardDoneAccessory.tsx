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
  if (Platform.OS !== "ios") {
    return null;
  }

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

const styles = StyleSheet.create({
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


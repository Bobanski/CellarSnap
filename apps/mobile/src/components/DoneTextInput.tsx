import { forwardRef, useId, useMemo } from "react";
import {
  InputAccessoryView,
  Keyboard,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput as ReactNativeTextInput,
  View,
  type TextInputProps,
} from "react-native";
import { APP_SANS_FONT_FAMILY } from "@/src/lib/typography";

export const DoneTextInput = forwardRef<ReactNativeTextInput, TextInputProps>(
  (
    {
      returnKeyType,
      blurOnSubmit,
      inputAccessoryViewID,
      keyboardType,
      multiline = false,
      onSubmitEditing,
      style,
      ...props
    },
    ref
  ) => {
    const resolvedBlurOnSubmit = blurOnSubmit ?? !multiline;
    const resolvedReturnKeyType =
      returnKeyType ?? (multiline ? undefined : "done");
    const shouldAttachAccessory = Platform.OS === "ios" && !inputAccessoryViewID;
    const reactId = useId();
    const autoAccessoryId = useMemo(
      () => `cellarsnap-input-done-${reactId.replace(/[^a-zA-Z0-9_-]/g, "")}`,
      [reactId]
    );
    const resolvedAccessoryId = shouldAttachAccessory
      ? autoAccessoryId
      : inputAccessoryViewID;

    return (
      <>
        <ReactNativeTextInput
          {...props}
          ref={ref}
          multiline={multiline}
          keyboardType={keyboardType}
          blurOnSubmit={resolvedBlurOnSubmit}
          returnKeyType={resolvedReturnKeyType}
          inputAccessoryViewID={resolvedAccessoryId}
          style={[
            APP_SANS_FONT_FAMILY ? { fontFamily: APP_SANS_FONT_FAMILY } : null,
            style,
          ]}
          onSubmitEditing={(event) => {
            onSubmitEditing?.(event);
            if (!multiline || resolvedBlurOnSubmit) {
              Keyboard.dismiss();
            }
          }}
        />
        {shouldAttachAccessory ? (
          <InputAccessoryView nativeID={autoAccessoryId}>
            <View style={styles.accessory}>
              <Pressable onPress={Keyboard.dismiss} hitSlop={8}>
                <Text style={styles.doneText}>Done</Text>
              </Pressable>
            </View>
          </InputAccessoryView>
        ) : null}
      </>
    );
  }
);

DoneTextInput.displayName = "DoneTextInput";

const styles = StyleSheet.create({
  accessory: {
    alignItems: "flex-end",
    backgroundColor: "transparent",
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 6,
  },
  doneText: {
    color: "#007aff",
    fontSize: 17,
    fontWeight: "700",
  },
});

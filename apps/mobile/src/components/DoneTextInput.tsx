import { forwardRef } from "react";
import {
  Keyboard,
  Platform,
  TextInput as ReactNativeTextInput,
  type TextInputProps,
} from "react-native";
import { IOS_KEYBOARD_DONE_ACCESSORY_ID } from "@/src/components/KeyboardDoneAccessory";
import { APP_SANS_FONT_FAMILY } from "@/src/lib/typography";

const IOS_KEYBOARDS_WITHOUT_RETURN_KEY = new Set([
  "number-pad",
  "decimal-pad",
  "numeric",
  "phone-pad",
]);

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
    const shouldAttachAccessory =
      Platform.OS === "ios" &&
      !multiline &&
      !inputAccessoryViewID &&
      Boolean(keyboardType) &&
      IOS_KEYBOARDS_WITHOUT_RETURN_KEY.has(String(keyboardType));

    return (
      <ReactNativeTextInput
        {...props}
        ref={ref}
        multiline={multiline}
        keyboardType={keyboardType}
        blurOnSubmit={resolvedBlurOnSubmit}
        returnKeyType={resolvedReturnKeyType}
        inputAccessoryViewID={
          shouldAttachAccessory
            ? IOS_KEYBOARD_DONE_ACCESSORY_ID
            : inputAccessoryViewID
        }
        style={[APP_SANS_FONT_FAMILY ? { fontFamily: APP_SANS_FONT_FAMILY } : null, style]}
        onSubmitEditing={(event) => {
          onSubmitEditing?.(event);
          if (!multiline || resolvedBlurOnSubmit) {
            Keyboard.dismiss();
          }
        }}
      />
    );
  }
);

DoneTextInput.displayName = "DoneTextInput";

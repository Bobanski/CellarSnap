import { forwardRef } from "react";
import {
  Keyboard,
  TextInput as ReactNativeTextInput,
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

    return (
      <ReactNativeTextInput
        {...props}
        ref={ref}
        multiline={multiline}
        keyboardType={keyboardType}
        blurOnSubmit={resolvedBlurOnSubmit}
        returnKeyType={resolvedReturnKeyType}
        inputAccessoryViewID={inputAccessoryViewID}
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

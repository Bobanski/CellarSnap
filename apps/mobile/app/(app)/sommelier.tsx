import { useEffect, useMemo, useRef, useState } from "react";
import {
  Animated,
  Easing,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  SOMMELIER_DEFAULT_SUGGESTIONS,
  SOMMELIER_EYEBROW,
  SOMMELIER_INPUT_PLACEHOLDER,
  SOMMELIER_INTRO_MESSAGE,
  SOMMELIER_SUBTITLE,
  SOMMELIER_TITLE,
} from "@cellarsnap/shared";
import { AppTopBar } from "@/src/components/AppTopBar";
import { AppText } from "@/src/components/AppText";
import { DoneTextInput } from "@/src/components/DoneTextInput";
import SommelierMarkdown from "@/src/components/SommelierMarkdown";
import {
  Redirect,
} from "expo-router";
import {
  sendSommelierChat,
  type MobileSommelierMessage,
} from "@/src/lib/api/sommelier";
import { useAuth } from "@/src/providers/AuthProvider";
import { colors } from "@/src/lib/theme";
import { fonts } from "@/src/lib/typography";

type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
};

function createMessageId(prefix: "user" | "assistant") {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function TypingIndicator() {
  const dots = useMemo(
    () => [
      new Animated.Value(0.45),
      new Animated.Value(0.45),
      new Animated.Value(0.45),
    ],
    []
  );

  useEffect(() => {
    let cancelled = false;
    let timeout: ReturnType<typeof setTimeout> | undefined;

    const baseOpacity = 0.45;
    const activeOpacity = 1;
    const stepDuration = 180;
    const stepPause = 110;

    const runStep = (activeIndex: number) => {
      if (cancelled) {
        return;
      }

      Animated.parallel(
        dots.map((dot, index) =>
          Animated.timing(dot, {
            toValue: index === activeIndex ? activeOpacity : baseOpacity,
            duration: stepDuration,
            easing: Easing.out(Easing.quad),
            useNativeDriver: true,
          })
        )
      ).start(() => {
        if (cancelled) {
          return;
        }
        timeout = setTimeout(() => {
          runStep((activeIndex + 1) % dots.length);
        }, stepPause);
      });
    };

    runStep(0);

    return () => {
      cancelled = true;
      if (timeout) {
        clearTimeout(timeout);
      }
      dots.forEach((dot) => {
        dot.stopAnimation();
      });
    };
  }, [dots]);

  return (
    <View style={styles.typingIndicator}>
      {dots.map((dot, index) => (
        <Animated.View
          key={index}
          style={[
            styles.typingDot,
            {
              opacity: dot,
              transform: [
                {
                  scale: dot.interpolate({
                    inputRange: [0.45, 1],
                    outputRange: [0.82, 1],
                  }),
                },
              ],
            },
          ]}
        />
      ))}
    </View>
  );
}

export default function SommelierScreen() {
  const { hasPrivateBetaFeatureAccess } = useAuth();
  const insets = useSafeAreaInsets();
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: "intro",
      role: "assistant",
      content: SOMMELIER_INTRO_MESSAGE,
    },
  ]);
  const [value, setValue] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [isKeyboardVisible, setIsKeyboardVisible] = useState(false);
  const scrollViewRef = useRef<ScrollView | null>(null);

  useEffect(() => {
    scrollViewRef.current?.scrollToEnd({ animated: true });
  }, [messages, pending, error]);

  useEffect(() => {
    const showKeyboard = () => setIsKeyboardVisible(true);
    const hideKeyboard = () => setIsKeyboardVisible(false);
    const subscriptions = [
      Keyboard.addListener("keyboardDidShow", showKeyboard),
      Keyboard.addListener("keyboardWillShow", showKeyboard),
      Keyboard.addListener("keyboardDidHide", hideKeyboard),
      Keyboard.addListener("keyboardWillHide", hideKeyboard),
    ];

    return () => {
      subscriptions.forEach((subscription) => subscription.remove());
    };
  }, []);

  const resetChat = () => {
    Keyboard.dismiss();
    setMessages([
      {
        id: "intro",
        role: "assistant",
        content: SOMMELIER_INTRO_MESSAGE,
      },
    ]);
    setValue("");
    setPending(false);
    setError(null);
    setConversationId(null);
  };

  const sendMessage = async (content: string) => {
    const trimmed = content.trim();
    if (!trimmed || pending) {
      return;
    }

    const userMessage: ChatMessage = {
      id: createMessageId("user"),
      role: "user",
      content: trimmed,
    };

    const priorMessages: MobileSommelierMessage[] = messages.map((message) => ({
      role: message.role,
      content: message.content,
    }));

    setMessages((current) => [...current, userMessage]);
    setValue("");
    setError(null);
    setPending(true);

    const result = await sendSommelierChat({
      messages: [...priorMessages, { role: "user", content: trimmed }],
      conversationId,
    });

    if (!result.ok) {
      setError(result.errorMessage);
      setPending(false);
      return;
    }

    setConversationId(result.conversationId);
    setMessages((current) => [
      ...current,
      {
        id: createMessageId("assistant"),
        role: "assistant",
        content: result.answer || "I couldn't finish that answer. Try again in a moment.",
      },
    ]);
    setPending(false);
  };

  const showSuggestions =
    messages.filter((message) => message.role === "user").length === 0 && !isKeyboardVisible;

  const renderComposer = () => (
    <View style={styles.composerRow}>
      <DoneTextInput
        value={value}
        onChangeText={setValue}
        placeholder={SOMMELIER_INPUT_PLACEHOLDER}
        placeholderTextColor={colors.textTertiary}
        returnKeyType="send"
        maxLength={1200}
        style={styles.composerInput}
        editable={!pending}
        accessibilityLabel="Ask Pocket Sommelier a question"
      />
      <Pressable
        style={[
          styles.sendButton,
          pending || !value.trim() ? styles.sendButtonDisabled : null,
        ]}
        onPress={() => void sendMessage(value)}
        disabled={pending || !value.trim()}
        accessibilityRole="button"
        accessibilityLabel={pending ? "Pocket Sommelier is responding" : "Send message"}
      >
        <Feather
          name="send"
          size={14}
          color={colors.textOnAccent}
          style={styles.sendButtonIcon}
        />
      </Pressable>
    </View>
  );

  if (!hasPrivateBetaFeatureAccess) {
    return <Redirect href="/(app)/feed" />;
  }

  return (
    <View style={styles.screen}>
      <View style={styles.topBarWrap}>
        <AppTopBar />
      </View>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        keyboardVerticalOffset={Platform.OS === "ios" ? 18 : 0}
      >
        <View style={styles.page}>
          <View style={styles.header}>
            <View style={styles.headerCopy}>
              <AppText style={styles.eyebrow}>{SOMMELIER_EYEBROW}</AppText>
              <AppText style={styles.headingTitle}>{SOMMELIER_TITLE}</AppText>
              <AppText style={styles.headingSubtitle}>{SOMMELIER_SUBTITLE}</AppText>
            </View>

            <Pressable
              style={[styles.clearButton, pending ? styles.clearButtonDisabled : null]}
              onPress={resetChat}
              disabled={pending}
              accessibilityRole="button"
              accessibilityLabel="Clear chat"
            >
              <Feather name="x" size={12} color={colors.textSecondary} />
              <AppText style={styles.clearButtonText}>Clear</AppText>
            </Pressable>
          </View>
          <View style={styles.chatShell}>
            <ScrollView
              ref={scrollViewRef}
              style={styles.flex}
              contentContainerStyle={styles.messageContent}
              keyboardShouldPersistTaps="handled"
            >
              <View style={styles.chatStack}>
                {messages.map((message) => {
                  const isAssistant = message.role === "assistant";
                  return (
                    <View
                      key={message.id}
                      style={[
                        styles.messageBubble,
                        isAssistant ? styles.assistantBubble : styles.userBubble,
                      ]}
                    >
                      <AppText style={[styles.messageLabel, !isAssistant ? styles.userMessageLabel : null]}>
                        {isAssistant ? "Pocket Sommelier" : "You"}
                      </AppText>
                      {isAssistant ? (
                        message.isStreaming && message.content.trim().length === 0 ? (
                          <TypingIndicator />
                        ) : (
                          <SommelierMarkdown content={message.content} />
                        )
                      ) : (
                        <AppText style={[styles.messageText, !isAssistant ? styles.userMessageText : null]}>
                          {message.content}
                        </AppText>
                      )}
                    </View>
                  );
                })}

                {pending ? (
                  <View style={[styles.messageBubble, styles.assistantBubble]}>
                    <AppText style={styles.messageLabel}>Pocket Sommelier</AppText>
                    <TypingIndicator />
                  </View>
                ) : null}
              </View>
            </ScrollView>

            <View style={[styles.bottomDock, { bottom: 12 + insets.bottom }]}>
              {showSuggestions ? (
                <View style={styles.suggestionSection}>
                  <AppText style={styles.suggestionEyebrow}>Try asking</AppText>
                  <View style={styles.suggestionWrap}>
                    {SOMMELIER_DEFAULT_SUGGESTIONS.map((suggestion) => (
                      <Pressable
                        key={suggestion}
                        style={styles.suggestionChip}
                        onPress={() => void sendMessage(suggestion)}
                        accessibilityRole="button"
                        accessibilityLabel={`Ask: ${suggestion}`}
                      >
                        <AppText style={styles.suggestionText}>{suggestion}</AppText>
                      </Pressable>
                    ))}
                  </View>
                </View>
              ) : null}

              {error ? (
                <View style={styles.errorCard}>
                  <AppText style={styles.errorText}>{error}</AppText>
                </View>
              ) : null}

              {renderComposer()}
            </View>
          </View>
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.screenBg,
  },
  topBarWrap: {
    paddingHorizontal: 18,
  },
  flex: {
    flex: 1,
  },
  page: {
    flex: 1,
    paddingHorizontal: 16,
    paddingTop: 12,
  },
  header: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 12,
    marginBottom: 12,
  },
  headerCopy: {
    flex: 1,
    minWidth: 0,
    gap: 4,
  },
  clearButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfacePrimary,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  clearButtonDisabled: {
    opacity: 0.5,
  },
  clearButtonText: {
    color: colors.textSecondary,
    fontSize: 10,
    letterSpacing: 1,
    textTransform: "uppercase",
  },
  chatShell: {
    flex: 1,
    minHeight: 0,
  },
  messageContent: {
    flexGrow: 1,
    paddingBottom: 220,
  },
  eyebrow: {
    color: colors.accentSecondary,
    fontSize: 9,
    fontWeight: "700",
    letterSpacing: 3,
    textTransform: "uppercase",
  },
  headingTitle: {
    color: colors.textPrimary,
    fontFamily: fonts.serif.light,
    fontSize: 24,
    lineHeight: 30,
  },
  headingSubtitle: {
    color: colors.textSecondary,
    fontSize: 13,
    lineHeight: 18,
  },
  suggestionSection: {
    gap: 8,
  },
  suggestionEyebrow: {
    color: colors.textSecondary,
    fontSize: 10,
    letterSpacing: 1.6,
    textTransform: "uppercase",
  },
  suggestionWrap: {
    flexDirection: "row",
    gap: 8,
  },
  suggestionChip: {
    flex: 1,
    minHeight: 64,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    backgroundColor: colors.surfacePrimary,
    paddingHorizontal: 12,
    paddingVertical: 10,
    justifyContent: "center",
    alignItems: "center",
  },
  suggestionText: {
    color: colors.textPrimary,
    fontSize: 10,
    lineHeight: 14,
    textAlign: "center",
  },
  chatStack: {
    gap: 10,
  },
  messageBubble: {
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 12,
    maxWidth: "90%",
  },
  assistantBubble: {
    borderColor: colors.border,
    backgroundColor: colors.surfacePrimary,
    borderRadius: 16,
    borderBottomLeftRadius: 3,
    alignSelf: "flex-start",
  },
  userBubble: {
    borderColor: "rgba(123,29,58,0.3)",
    backgroundColor: colors.accentPrimary,
    borderRadius: 16,
    borderBottomRightRadius: 3,
    alignSelf: "flex-end",
  },
  messageLabel: {
    color: colors.textSecondary,
    fontSize: 10,
    letterSpacing: 1.6,
    textTransform: "uppercase",
    marginBottom: 6,
  },
  messageText: {
    color: colors.textPrimary,
    fontSize: 13,
    lineHeight: 20,
  },
  userMessageLabel: {
    color: colors.textOnAccent,
    opacity: 0.7,
  },
  userMessageText: {
    color: colors.textOnAccent,
  },
  typingIndicator: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingTop: 2,
    paddingBottom: 2,
  },
  typingDot: {
    width: 7,
    height: 7,
    borderRadius: 999,
    backgroundColor: colors.accentSecondary,
  },
  errorCard: {
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "rgba(192,57,43,0.3)",
    backgroundColor: "rgba(192,57,43,0.14)",
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  errorText: {
    color: colors.error,
    fontSize: 13,
    lineHeight: 20,
  },
  bottomDock: {
    position: "absolute",
    left: 16,
    right: 16,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    gap: 10,
    paddingTop: 10,
    paddingBottom: 14,
    backgroundColor: colors.screenBg,
  },
  composerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "rgba(245, 237, 214, 0.04)",
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    paddingLeft: 12,
    paddingRight: 8,
    paddingVertical: 4,
  },
  composerInput: {
    flex: 1,
    minHeight: 34,
    maxHeight: 34,
    borderRadius: 999,
    borderWidth: 0,
    backgroundColor: "transparent",
    color: colors.textSecondary,
    fontSize: 11,
    lineHeight: 16,
    paddingHorizontal: 0,
    paddingVertical: 8,
    textAlignVertical: "center",
  },
  sendButton: {
    width: 30,
    height: 30,
    borderRadius: 999,
    backgroundColor: colors.accentPrimary,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  sendButtonDisabled: {
    opacity: 0.55,
  },
  sendButtonIcon: {
    marginLeft: 1,
  },
});

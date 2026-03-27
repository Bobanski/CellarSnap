import { useEffect, useRef, useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from "react-native";
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

export default function SommelierScreen() {
  const { hasPrivateBetaFeatureAccess } = useAuth();
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
  const scrollViewRef = useRef<ScrollView | null>(null);

  useEffect(() => {
    scrollViewRef.current?.scrollToEnd({ animated: true });
  }, [messages, pending, error]);

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

  const showSuggestions = messages.filter((message) => message.role === "user").length === 0;

  const renderComposer = (inline: boolean) => (
    <View style={[styles.inputShell, inline ? styles.inlineInputShell : null]}>
      <DoneTextInput
        value={value}
        onChangeText={setValue}
        placeholder={SOMMELIER_INPUT_PLACEHOLDER}
        placeholderTextColor={colors.textTertiary}
        multiline
        maxLength={1200}
        style={styles.input}
        editable={!pending}
        accessibilityLabel="Ask Pocket Sommelier a question"
      />
      <Pressable
        style={[styles.sendButton, pending || !value.trim() ? styles.sendButtonDisabled : null]}
        onPress={() => void sendMessage(value)}
        disabled={pending || !value.trim()}
        accessibilityRole="button"
        accessibilityLabel={pending ? "Pocket Sommelier is responding" : "Send message"}
      >
        <AppText style={styles.sendButtonText}>{pending ? "Thinking..." : "Send"}</AppText>
      </Pressable>
    </View>
  );

  if (!hasPrivateBetaFeatureAccess) {
    return <Redirect href="/(app)/home" />;
  }

  return (
    <View style={styles.screen}>
      <AppTopBar />
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView
          ref={scrollViewRef}
          style={styles.flex}
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.header}>
            <AppText style={styles.eyebrow}>{SOMMELIER_EYEBROW}</AppText>
            <AppText style={styles.headingTitle}>{SOMMELIER_TITLE}</AppText>
            <AppText style={styles.headingSubtitle}>{SOMMELIER_SUBTITLE}</AppText>
          </View>
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
                  <AppText style={[styles.messageText, !isAssistant ? styles.userMessageText : null]}>{message.content}</AppText>
                </View>
              );
            })}

            {pending ? (
              <View style={[styles.messageBubble, styles.assistantBubble]}>
                <AppText style={styles.messageLabel}>Pocket Sommelier</AppText>
                <AppText style={styles.typingText}>Thinking...</AppText>
              </View>
            ) : null}
          </View>

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

          {showSuggestions ? renderComposer(true) : null}
        </ScrollView>

        {!showSuggestions ? renderComposer(false) : null}
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.screenBg,
  },
  flex: {
    flex: 1,
  },
  content: {
    paddingHorizontal: 16,
    paddingBottom: 24,
    gap: 16,
  },
  header: {
    gap: 6,
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
    fontSize: 28,
    lineHeight: 34,
  },
  headingSubtitle: {
    color: colors.textSecondary,
    fontSize: 12,
    lineHeight: 18,
  },
  suggestionSection: {
    gap: 10,
  },
  suggestionEyebrow: {
    color: colors.textSecondary,
    fontSize: 11,
    letterSpacing: 1.8,
    textTransform: "uppercase",
  },
  suggestionWrap: {
    flexDirection: "row",
    gap: 12,
  },
  suggestionChip: {
    flex: 1,
    minHeight: 52,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    backgroundColor: colors.surfacePrimary,
    paddingHorizontal: 14,
    paddingVertical: 10,
    justifyContent: "center",
    alignItems: "center",
  },
  suggestionText: {
    color: colors.textPrimary,
    fontSize: 13,
    lineHeight: 18,
  },
  chatStack: {
    gap: 12,
  },
  messageBubble: {
    borderWidth: 1,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  assistantBubble: {
    borderColor: colors.border,
    backgroundColor: colors.surfacePrimary,
    borderRadius: 14,
    borderBottomLeftRadius: 3,
  },
  userBubble: {
    borderColor: "rgba(123,29,58,0.3)",
    backgroundColor: colors.accentPrimary,
    borderRadius: 14,
    borderBottomRightRadius: 3,
  },
  messageLabel: {
    color: colors.textSecondary,
    fontSize: 11,
    letterSpacing: 1.8,
    textTransform: "uppercase",
    marginBottom: 8,
  },
  messageText: {
    color: colors.textPrimary,
    fontSize: 15,
    lineHeight: 24,
  },
  userMessageLabel: {
    color: colors.textOnAccent,
    opacity: 0.7,
  },
  userMessageText: {
    color: colors.textOnAccent,
  },
  typingText: {
    color: colors.rose,
    fontSize: 15,
    lineHeight: 24,
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
  inputShell: {
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.screenBg,
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 14,
    gap: 10,
  },
  inlineInputShell: {
    borderTopWidth: 0,
    paddingHorizontal: 0,
    paddingTop: 2,
    paddingBottom: 6,
  },
  input: {
    minHeight: 116,
    maxHeight: 196,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfacePrimary,
    color: colors.textPrimary,
    fontSize: 15,
    lineHeight: 22,
    paddingHorizontal: 14,
    paddingVertical: 12,
    textAlignVertical: "top",
  },
  sendButton: {
    alignSelf: "flex-end",
    borderRadius: 999,
    backgroundColor: colors.grenache,
    paddingHorizontal: 18,
    paddingVertical: 10,
  },
  sendButtonDisabled: {
    opacity: 0.55,
  },
  sendButtonText: {
    color: colors.textPrimary,
    fontSize: 14,
    fontWeight: "700",
  },
});

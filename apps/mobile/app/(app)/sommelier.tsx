import { useEffect, useRef, useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from "react-native";
import { AppTopBar } from "@/src/components/AppTopBar";
import { AppText } from "@/src/components/AppText";
import {
  Redirect,
} from "expo-router";
import {
  sendSommelierChat,
  type MobileSommelierMessage,
} from "@/src/lib/api/sommelier";
import { useAuth } from "@/src/providers/AuthProvider";
import { colors } from "@/src/lib/theme";

type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
};

const DEFAULT_SUGGESTIONS = [
  "What should I try next based on what I've liked lately?",
  "Tell me about Barolo and what it usually tastes like.",
  "What kind of wine would you pour with steak frites tonight?",
];

function createMessageId(prefix: "user" | "assistant") {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export default function SommelierScreen() {
  const { hasPrivateBetaFeatureAccess } = useAuth();
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: "intro",
      role: "assistant",
      content:
        "Ask about a bottle, a region, a pairing, or what you should try next.",
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

  if (!hasPrivateBetaFeatureAccess) {
    return <Redirect href="/(app)/home" />;
  }

  return (
    <View style={styles.screen}>
      <AppTopBar activeHref="/(app)/sommelier" />
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
                  <AppText style={styles.messageLabel}>
                    {isAssistant ? "Pocket Sommelier" : "You"}
                  </AppText>
                  <AppText style={styles.messageText}>{message.content}</AppText>
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
                {DEFAULT_SUGGESTIONS.map((suggestion) => (
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
        </ScrollView>

        <View style={styles.inputShell}>
          <TextInput
            value={value}
            onChangeText={setValue}
            placeholder="Ask about regions, pairings, or what you should try next..."
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
    flexWrap: "wrap",
    gap: 10,
  },
  suggestionChip: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    backgroundColor: colors.surfacePrimary,
    paddingHorizontal: 14,
    paddingVertical: 10,
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
    borderRadius: 24,
    borderWidth: 1,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  assistantBubble: {
    borderColor: colors.border,
    backgroundColor: colors.surfacePrimary,
  },
  userBubble: {
    borderColor: "rgba(123,29,58,0.3)",
    backgroundColor: "rgba(123,29,58,0.12)",
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
    backgroundColor: colors.limestone,
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 18,
    gap: 12,
  },
  input: {
    minHeight: 96,
    maxHeight: 180,
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

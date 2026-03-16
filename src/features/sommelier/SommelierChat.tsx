"use client";

import { startTransition, useEffect, useRef, useState } from "react";
import SommelierInput from "@/features/sommelier/SommelierInput";
import SommelierMessage from "@/features/sommelier/SommelierMessage";
import SommelierSuggestions from "@/features/sommelier/SommelierSuggestions";

type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  isStreaming?: boolean;
};

function createMessageId(prefix: "user" | "assistant") {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return `${prefix}-${crypto.randomUUID()}`;
  }

  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function parseSseBuffer(
  buffer: string,
  onEvent: (event: string, data: Record<string, unknown>) => void
) {
  let remainder = buffer;

  while (remainder.includes("\n\n")) {
    const separatorIndex = remainder.indexOf("\n\n");
    const rawEvent = remainder.slice(0, separatorIndex);
    remainder = remainder.slice(separatorIndex + 2);

    const eventLine = rawEvent
      .split("\n")
      .find((line) => line.startsWith("event:"))
      ?.slice("event:".length)
      .trim();
    const dataLine = rawEvent
      .split("\n")
      .find((line) => line.startsWith("data:"))
      ?.slice("data:".length)
      .trim();

    if (!eventLine || !dataLine) {
      continue;
    }

    let payload: Record<string, unknown>;
    try {
      payload = JSON.parse(dataLine) as Record<string, unknown>;
    } catch {
      // Ignore malformed frames so the client can keep streaming.
      continue;
    }

    onEvent(eventLine, payload);
  }

  return remainder;
}

export default function SommelierChat() {
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: "intro",
      role: "assistant",
      content:
        "I’m ready. Ask about a bottle, a region, a pairing, or what you should try next.",
    },
  ]);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  // Track content version for each message to prevent race conditions in streaming updates
  const contentVersionRef = useRef<Record<string, number>>({});

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({
      behavior: "auto",
      block: "end",
    });
  }, [messages, pending, error]);

  const sendMessage = async (content: string) => {
    const trimmed = content.trim();
    if (!trimmed || pending) {
      return;
    }

    const assistantId = createMessageId("assistant");
    const userMessage: ChatMessage = {
      id: createMessageId("user"),
      role: "user",
      content: trimmed,
    };

    const priorMessages = messages.map(({ role, content: messageContent }) => ({
      role,
      content: messageContent,
    }));

    startTransition(() => {
      setMessages((current) => [
        ...current,
        userMessage,
        { id: assistantId, role: "assistant", content: "", isStreaming: true },
      ]);
      setError(null);
    });
    setPending(true);
    let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;

    try {
      const payload = {
        messages: [...priorMessages, { role: "user", content: trimmed }],
        stream: true,
        ...(conversationId ? { conversationId } : {}),
      };

      const response = await fetch("/api/sommelier/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as
          | { error?: string }
          | null;
        throw new Error(payload?.error ?? "Pocket Sommelier is temporarily unavailable.");
      }

      if (!response.body) {
        throw new Error("Pocket Sommelier did not return a readable response stream.");
      }

      reader = response.body.getReader();
      const returnedConversationId = response.headers.get("x-sommelier-conversation-id");
      if (returnedConversationId) {
        setConversationId(returnedConversationId);
      }
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) {
          // Warn if there's an incomplete SSE frame at stream end
          if (buffer.trim().length > 0) {
            console.warn(
              "[Sommelier] Incomplete SSE frame discarded at stream end:",
              buffer.slice(0, 100)
            );
          }
          break;
        }

        buffer += decoder.decode(value, { stream: true });
        buffer = parseSseBuffer(buffer, (event, data) => {
          if (event === "delta") {
            const delta = typeof data.text === "string" ? data.text : "";
            // Increment version to ensure atomicity of delta updates
            const currentVersion = (contentVersionRef.current[assistantId] ?? 0) + 1;
            contentVersionRef.current[assistantId] = currentVersion;
            startTransition(() => {
              setMessages((current) =>
                current.map((message) =>
                  message.id === assistantId
                    ? {
                        ...message,
                        content: `${message.content}${delta}`,
                        isStreaming: true,
                      }
                    : message
                )
              );
            });
            return;
          }

          if (event === "done") {
            // Increment version for done event to ensure it's processed after all deltas
            const currentVersion = (contentVersionRef.current[assistantId] ?? 0) + 1;
            contentVersionRef.current[assistantId] = currentVersion;
            startTransition(() => {
              setMessages((current) =>
                current.map((message) =>
                  message.id === assistantId
                    ? {
                        ...message,
                        content:
                          typeof data.text === "string" && data.text.trim().length > 0
                            ? data.text
                            : message.content,
                        isStreaming: false,
                      }
                    : message
                )
              );
            });
            return;
          }

          if (event === "error") {
            throw new Error(
              typeof data.message === "string"
                ? data.message
                : "Pocket Sommelier hit an unexpected error."
            );
          }
        });
      }
    } catch (caughtError) {
      // Clean up the reader to prevent resource leaks
      await reader?.cancel();

      const message =
        caughtError instanceof Error
          ? caughtError.message
          : "Pocket Sommelier hit an unexpected error.";

      setError(message);
      startTransition(() => {
        setMessages((current) =>
          current.map((message) =>
            message.id === assistantId
              ? {
                  ...message,
                  content:
                    message.content.trim().length > 0
                      ? message.content
                      : "I couldn’t finish that answer. Try again in a moment.",
                  isStreaming: false,
                }
              : message
          )
        );
      });
    } finally {
      setPending(false);
    }
  };

  const showSuggestions = messages.filter((message) => message.role === "user").length === 0;

  return (
    <div className="space-y-6">
      {showSuggestions ? (
        <div className="rounded-[1.75rem] border border-[var(--color-accent-secondary)]/20 bg-[radial-gradient(circle_at_top_left,rgba(251,191,36,0.16),transparent_40%),linear-gradient(180deg,rgba(251,191,36,0.10),rgba(120,53,15,0.10))] p-5">
          <p className="text-xs uppercase tracking-[0.24em] text-[var(--color-accent-secondary)]/80">
            Try asking
          </p>
          <div className="mt-4">
            <SommelierSuggestions onSelect={(suggestion) => void sendMessage(suggestion)} />
          </div>
        </div>
      ) : null}

      <div
        role="log"
        aria-live="polite"
        aria-label="Pocket Sommelier conversation"
        aria-relevant="additions text"
        className="space-y-4"
      >
        {messages.map((message) => (
          <SommelierMessage
            key={message.id}
            role={message.role}
            content={message.content}
            isStreaming={Boolean(message.isStreaming)}
          />
        ))}
        <div ref={messagesEndRef} aria-hidden="true" />
      </div>

      {error ? (
        <div className="flex items-start justify-between gap-3 rounded-2xl border border-rose-300/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-100">
          <p>{error}</p>
          <button
            type="button"
            onClick={() => setError(null)}
            className="rounded-full border border-rose-200/25 px-3 py-1 text-xs font-medium text-rose-100 transition hover:border-rose-100/40 hover:bg-rose-200/10 focus:outline-none focus:ring-2 focus:ring-rose-200/40"
          >
            Dismiss
          </button>
        </div>
      ) : null}

      <SommelierInput disabled={pending} onSend={sendMessage} />
    </div>
  );
}

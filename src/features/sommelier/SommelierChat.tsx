"use client";

import { startTransition, useCallback, useEffect, useRef, useState } from "react";
import {
  SOMMELIER_INTRO_MESSAGE,
  SOMMELIER_COLD_GREETINGS,
  SOMMELIER_WARM_GREETINGS,
  type AudienceMode,
} from "@shared";
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

function pickGreeting(
  mode: AudienceMode,
  entryCount: number,
  topPattern: string | null
): string {
  if (entryCount < 3 || !topPattern) {
    return SOMMELIER_COLD_GREETINGS[mode];
  }

  const templates = SOMMELIER_WARM_GREETINGS[mode];
  const picked = templates[Math.floor(Math.random() * templates.length)];
  return picked.replace("{pattern}", topPattern);
}

export default function SommelierChat() {
  const [audienceMode, setAudienceMode] = useState<AudienceMode | null>(null);
  const [greeting, setGreeting] = useState(SOMMELIER_INTRO_MESSAGE);
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: "intro",
      role: "assistant",
      content: SOMMELIER_INTRO_MESSAGE,
    },
  ]);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [lastSubmittedPrompt, setLastSubmittedPrompt] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  // Load user profile (audience_mode) and entry count for greeting
  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const [profileRes, entriesRes] = await Promise.all([
          fetch("/api/profile"),
          fetch("/api/entries?limit=1&count_only=true").catch(() => null),
        ]);

        if (cancelled) return;

        const profileData = profileRes.ok
          ? ((await profileRes.json()) as { profile?: { audience_mode?: string } })
          : null;
        const mode =
          (profileData?.profile?.audience_mode as AudienceMode) ?? "explorer";
        setAudienceMode(mode);

        let entryCount = 0;
        let topPattern: string | null = null;

        if (entriesRes?.ok) {
          const entriesData = (await entriesRes.json()) as {
            count?: number;
            topPattern?: string;
          };
          entryCount = entriesData.count ?? 0;
          topPattern = entriesData.topPattern ?? null;
        }

        const newGreeting = pickGreeting(mode, entryCount, topPattern);
        setGreeting(newGreeting);
        setMessages([{ id: "intro", role: "assistant", content: newGreeting }]);
      } catch {
        // Silently fall back to the default greeting
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  const resetChat = useCallback(() => {
    setMessages([
      {
        id: "intro",
        role: "assistant",
        content: greeting,
      },
    ]);
    setPending(false);
    setError(null);
    setConversationId(null);
    setLastSubmittedPrompt(null);
    messagesEndRef.current?.scrollIntoView({
      behavior: "auto",
      block: "end",
    });
  }, [greeting]);

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
    setLastSubmittedPrompt(trimmed);

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
                      : "I couldn't finish that answer. Try again in a moment.",
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
    <div className="flex h-full min-h-0 flex-1 flex-col gap-4 overflow-hidden">
      <div className="flex items-center justify-end">
        <button
          type="button"
          onClick={resetChat}
          disabled={pending}
          className="inline-flex items-center gap-1.5 rounded-full border border-[var(--color-border)] bg-[var(--color-surface-primary)] px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--color-text-secondary)] transition hover:border-[var(--color-accent-secondary)]/50 hover:text-[var(--color-accent-secondary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-accent-primary)]/35 disabled:cursor-not-allowed disabled:opacity-50"
          aria-label="Clear chat"
        >
          <span aria-hidden="true">×</span>
          <span>Clear chat</span>
        </button>
      </div>

      <div
        role="log"
        aria-live="polite"
        aria-label="Pocket Sommelier conversation"
        aria-relevant="additions text"
        className="min-h-0 flex-1 space-y-4 overflow-y-auto pr-1 pb-6"
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
          <div className="flex items-center gap-2">
            {lastSubmittedPrompt ? (
              <button
                type="button"
                onClick={() => {
                  void sendMessage(lastSubmittedPrompt);
                }}
                disabled={pending}
                className="rounded-full border border-rose-200/25 px-3 py-1 text-xs font-medium text-rose-100 transition hover:border-rose-100/40 hover:bg-rose-200/10 focus:outline-none focus:ring-2 focus:ring-rose-200/40 disabled:cursor-not-allowed disabled:opacity-70"
              >
                Retry last prompt
              </button>
            ) : null}
            <button
              type="button"
              onClick={() => setError(null)}
              className="rounded-full border border-rose-200/25 px-3 py-1 text-xs font-medium text-rose-100 transition hover:border-rose-100/40 hover:bg-rose-200/10 focus:outline-none focus:ring-2 focus:ring-rose-200/40"
            >
              Dismiss
            </button>
          </div>
        </div>
      ) : null}

      <div className="shrink-0 space-y-3">
        {showSuggestions ? (
          <SommelierSuggestions
            onSelect={(suggestion) => void sendMessage(suggestion)}
            audienceMode={audienceMode ?? undefined}
          />
        ) : null}

        <SommelierInput disabled={pending} onSend={sendMessage} />
      </div>
    </div>
  );
}

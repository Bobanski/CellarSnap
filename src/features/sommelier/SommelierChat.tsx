"use client";

import { startTransition, useCallback, useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import {
  SOMMELIER_INTRO_MESSAGE,
  SOMMELIER_COLD_GREETINGS,
  SOMMELIER_WARM_GREETINGS,
  type AudienceMode,
} from "@shared";
import SommelierInput from "@/features/sommelier/SommelierInput";
import SommelierSuggestions from "@/features/sommelier/SommelierSuggestions";
import type { WineCardData } from "@/features/sommelier/WineCardMessage";
import {
  buildIdentifiedWithMatchPrompt,
  buildIdentifiedWithoutMatchPrompt,
  UNREADABLE_BOTTLE_PHOTO_PROMPT,
} from "@/features/sommelier/bottlePhotoContext";
import {
  identifyBottlePhoto,
  IdentifyBottleError,
  isBottleIdentified,
} from "@/lib/sommelier/identifyBottleApi";

const SommelierMessage = dynamic(
  () => import("@/features/sommelier/SommelierMessage"),
  { ssr: false, loading: () => null }
);

const WineCardMessage = dynamic(
  () => import("@/features/sommelier/WineCardMessage"),
  { ssr: false, loading: () => null }
);

type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  isStreaming?: boolean;
  /**
   * When present, this message renders as a compact wine card instead of a
   * markdown bubble. `content` still carries the readable text sent to
   * /api/sommelier/chat (and persisted to the transcript) — never raw image
   * bytes — so conversation history stays consistent for later turns.
   */
  wineCard?: WineCardData;
};

type ApiMessage = {
  role: "user" | "assistant";
  content: string;
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

/**
 * Maps chat history to the API's {role, content} shape, dropping any
 * empty-content entries (e.g. an in-flight "identifying..." wine-card
 * placeholder) so they never trip the chat route's non-empty content
 * validation.
 */
function buildPriorApiMessages(history: ChatMessage[]): ApiMessage[] {
  return history
    .map(({ role, content }) => ({ role, content }))
    .filter((message) => message.content.trim().length > 0);
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
  const messagesRef = useRef<ChatMessage[]>(messages);
  const photoPreviewUrlsRef = useRef<Set<string>>(new Set());

  messagesRef.current = messages;

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

  // Revoke any local photo-thumbnail object URLs on unmount to avoid leaks.
  useEffect(() => {
    const urls = photoPreviewUrlsRef.current;
    return () => {
      urls.forEach((url) => URL.revokeObjectURL(url));
      urls.clear();
    };
  }, []);

  const resetChat = useCallback(() => {
    photoPreviewUrlsRef.current.forEach((url) => URL.revokeObjectURL(url));
    photoPreviewUrlsRef.current.clear();
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

  /**
   * Streams a somm reply for the given API-facing conversation and appends
   * it to the assistant placeholder message with id `assistantId`. Shared by
   * typed messages and the auto-sent bottle-photo context turn — neither
   * pushes anything to `apiMessages` beyond what's already visible/persisted.
   */
  const streamSommelierReply = async (apiMessages: ApiMessage[], assistantId: string) => {
    setPending(true);
    let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
    let accumulated = "";

    try {
      const payload = {
        messages: apiMessages,
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
        const errorPayload = (await response.json().catch(() => null)) as
          | { error?: string }
          | null;
        throw new Error(errorPayload?.error ?? "Pocket Sommelier is temporarily unavailable.");
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
            accumulated += typeof data.text === "string" ? data.text : "";
            return;
          }

          if (event === "done") {
            const finalText =
              typeof data.text === "string" && data.text.trim().length > 0
                ? data.text
                : accumulated;
            startTransition(() => {
              setMessages((current) =>
                current.map((message) =>
                  message.id === assistantId
                    ? {
                        ...message,
                        content: finalText,
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
                    accumulated.trim().length > 0
                      ? accumulated
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

    const apiMessages: ApiMessage[] = [
      ...buildPriorApiMessages(messagesRef.current),
      { role: "user", content: trimmed },
    ];

    startTransition(() => {
      setMessages((current) => [
        ...current,
        userMessage,
        { id: assistantId, role: "assistant", content: "", isStreaming: true },
      ]);
      setError(null);
    });

    await streamSommelierReply(apiMessages, assistantId);
  };

  /**
   * Bottle-photo flow: attach a label photo -> identify-bottle -> render a
   * wine card as the user's turn -> auto-send the somm a readable context
   * block so it can react in-voice. No image bytes ever reach the chat API
   * or the persisted transcript, only the text built from the identified
   * fields (see bottlePhotoContext.ts).
   */
  const attachBottlePhoto = async (file: File) => {
    if (pending) {
      return;
    }
    setError(null);

    const cardId = createMessageId("user");
    const previewUrl = URL.createObjectURL(file);
    photoPreviewUrlsRef.current.add(previewUrl);

    startTransition(() => {
      setMessages((current) => [
        ...current,
        {
          id: cardId,
          role: "user",
          content: "",
          wineCard: { status: "identifying", previewUrl },
        },
      ]);
    });

    setPending(true);

    try {
      const result = await identifyBottlePhoto(file);
      const identified = isBottleIdentified(result.wine);

      const contextText = !identified
        ? UNREADABLE_BOTTLE_PHOTO_PROMPT
        : result.match
          ? buildIdentifiedWithMatchPrompt(result.wine, result.match, result.axis_highlights)
          : buildIdentifiedWithoutMatchPrompt(result.wine);

      const cardWineCard: WineCardData = identified
        ? { status: "identified", wine: result.wine, match: result.match, previewUrl }
        : { status: "unreadable", previewUrl };

      startTransition(() => {
        setMessages((current) =>
          current.map((message) =>
            message.id === cardId
              ? { ...message, content: contextText, wineCard: cardWineCard }
              : message
          )
        );
      });

      setLastSubmittedPrompt(contextText);

      const assistantId = createMessageId("assistant");
      // `messagesRef.current` still holds the "identifying..." placeholder
      // (empty content) for this card at this point — buildPriorApiMessages
      // filters it out so the chat API's non-empty content schema doesn't
      // reject the request. The contextText below is the readable stand-in
      // for that turn instead.
      const apiMessages: ApiMessage[] = [
        ...buildPriorApiMessages(messagesRef.current),
        { role: "user", content: contextText },
      ];

      startTransition(() => {
        setMessages((current) => [
          ...current,
          { id: assistantId, role: "assistant", content: "", isStreaming: true },
        ]);
      });

      await streamSommelierReply(apiMessages, assistantId);
    } catch (caughtError) {
      const message =
        caughtError instanceof IdentifyBottleError || caughtError instanceof Error
          ? caughtError.message
          : "Could not identify that bottle. Try again in a moment.";

      setError(message);
      startTransition(() => {
        setMessages((current) =>
          current.map((message2) =>
            message2.id === cardId
              ? { ...message2, wineCard: { status: "failed", previewUrl } }
              : message2
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
      {!showSuggestions ? (
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
      ) : null}

      <div
        role="log"
        aria-live="polite"
        aria-label="Pocket Sommelier conversation"
        aria-relevant="additions text"
        className="min-h-0 flex-1 space-y-4 overflow-y-auto pr-1 pb-6"
      >
        {messages.map((message) =>
          message.wineCard ? (
            <div key={message.id} className="flex justify-end">
              <WineCardMessage card={message.wineCard} />
            </div>
          ) : (
            <SommelierMessage
              key={message.id}
              role={message.role}
              content={message.content}
              isStreaming={Boolean(message.isStreaming)}
            />
          )
        )}
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
        {showSuggestions && audienceMode ? (
          <SommelierSuggestions
            onSelect={(suggestion) => void sendMessage(suggestion)}
            audienceMode={audienceMode}
          />
        ) : null}

        <SommelierInput
          disabled={pending}
          onSend={sendMessage}
          onAttachPhoto={attachBottlePhoto}
        />
      </div>
    </div>
  );
}

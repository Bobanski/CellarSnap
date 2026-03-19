"use client";

import { useState } from "react";

export default function SommelierInput({
  disabled,
  onSend,
}: {
  disabled?: boolean;
  onSend: (message: string) => Promise<void> | void;
}) {
  const [value, setValue] = useState("");

  const submit = async () => {
    const trimmed = value.trim();
    if (!trimmed || disabled) {
      return;
    }
    setValue("");
    await onSend(trimmed);
  };

  return (
    <div className="rounded-[1.5rem] border border-[var(--color-border)] bg-[var(--color-surface-muted)] p-3 shadow-[0_20px_80px_-45px_rgba(0,0,0,0.9)]">
      <label htmlFor="sommelier-input" className="sr-only">
        Ask Pocket Sommelier a question
      </label>
      <textarea
        id="sommelier-input"
        aria-label="Ask Pocket Sommelier a question"
        value={value}
        onChange={(event) => setValue(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter" && !event.shiftKey) {
            event.preventDefault();
            submit().catch((error) => {
              console.error("[Sommelier Input] Submission failed:", error);
            });
          }
        }}
        disabled={disabled}
        placeholder="Ask your sommelier about regions, pairings, or what you should try next..."
        className="min-h-28 max-h-64 w-full resize-none rounded-xl border border-transparent bg-transparent px-2 py-1 text-sm leading-7 text-[var(--color-text-primary)] outline-none transition placeholder:text-[var(--color-text-tertiary)] focus:border-[var(--color-accent-primary)]/40 focus:bg-white/[0.02] focus:ring-2 focus:ring-[var(--color-accent-primary)]/30"
      />
      <div className="mt-3 flex items-center justify-between gap-3 px-2">
        <p className="text-xs text-[var(--color-text-tertiary)]">
          Shift+Enter for a new line. Responses use your tasting history.
        </p>
        <button
          type="button"
          onClick={() => {
            submit().catch((error) => {
              console.error("[Sommelier Input] Submission failed:", error);
            });
          }}
          disabled={disabled || value.trim().length === 0}
          aria-label={disabled ? "Pocket Sommelier is responding" : "Send message"}
          className="rounded-full bg-[var(--color-accent-primary)] px-4 py-2 text-sm font-semibold text-[var(--color-text-on-accent)] transition hover:bg-[var(--color-accent-hover)] focus:outline-none focus:ring-2 focus:ring-[var(--color-accent-primary)]/60 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {disabled ? "Thinking..." : "Send"}
        </button>
      </div>
    </div>
  );
}

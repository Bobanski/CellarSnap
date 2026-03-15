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
    <div className="rounded-[1.5rem] border border-white/10 bg-black/20 p-3 shadow-[0_20px_80px_-45px_rgba(0,0,0,0.9)]">
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
            void submit();
          }
        }}
        disabled={disabled}
        placeholder="Ask your sommelier about regions, pairings, or what you should try next..."
        className="min-h-28 max-h-64 w-full resize-none rounded-xl border border-transparent bg-transparent px-2 py-1 text-sm leading-7 text-zinc-100 outline-none transition placeholder:text-zinc-500 focus:border-amber-300/40 focus:bg-white/[0.02] focus:ring-2 focus:ring-amber-300/30"
      />
      <div className="mt-3 flex items-center justify-between gap-3 px-2">
        <p className="text-xs text-zinc-500">
          Shift+Enter for a new line. Responses use your tasting history plus the wine knowledge base.
        </p>
        <button
          type="button"
          onClick={() => void submit()}
          disabled={disabled || value.trim().length === 0}
          aria-label={disabled ? "Pocket Sommelier is responding" : "Send message"}
          className="rounded-full bg-amber-300 px-4 py-2 text-sm font-semibold text-zinc-950 transition hover:bg-amber-200 focus:outline-none focus:ring-2 focus:ring-amber-200/60 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {disabled ? "Thinking..." : "Send"}
        </button>
      </div>
    </div>
  );
}

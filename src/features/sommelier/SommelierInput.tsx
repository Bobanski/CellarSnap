"use client";

import { useState } from "react";
import { SOMMELIER_INPUT_PLACEHOLDER } from "@shared";

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
    <div className="flex items-center gap-2">
      <label htmlFor="sommelier-input" className="sr-only">
        Ask Pocket Sommelier a question
      </label>
      <input
        id="sommelier-input"
        type="text"
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
        placeholder={SOMMELIER_INPUT_PLACEHOLDER}
        className="flex-1 outline-none transition focus:border-[rgba(196,96,122,0.35)]"
        style={{
          background: "#180A10",
          border: "0.5px solid rgba(196, 96, 122, 0.12)",
          borderRadius: "20px",
          padding: "8px 13px",
          fontSize: "11px",
          color: "var(--color-text-secondary)",
        }}
      />
      <button
        type="button"
        onClick={() => {
          submit().catch((error) => {
            console.error("[Sommelier Input] Submission failed:", error);
          });
        }}
        disabled={disabled || value.trim().length === 0}
        aria-label={disabled ? "Pocket Sommelier is responding" : "Send message"}
        className="flex-shrink-0 flex items-center justify-center transition hover:opacity-80 focus:outline-none disabled:cursor-not-allowed disabled:opacity-60"
        style={{
          width: "30px",
          height: "30px",
          borderRadius: "50%",
          background: "var(--color-accent-secondary)",
        }}
      >
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="#F5EDD6"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <line x1="22" y1="2" x2="11" y2="13" />
          <polygon points="22 2 15 22 11 13 2 9 22 2" />
        </svg>
      </button>
    </div>
  );
}

"use client";

import { useRef, useState } from "react";
import { SOMMELIER_INPUT_PLACEHOLDER } from "@shared";

export default function SommelierInput({
  disabled,
  onSend,
  onAttachPhoto,
}: {
  disabled?: boolean;
  onSend: (message: string) => Promise<void> | void;
  /** Called with the selected file when the user attaches a bottle photo. */
  onAttachPhoto?: (file: File) => Promise<void> | void;
}) {
  const [value, setValue] = useState("");
  const photoInputRef = useRef<HTMLInputElement | null>(null);

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
      {onAttachPhoto ? (
        <>
          <label htmlFor="sommelier-photo-input" className="sr-only">
            Attach a bottle photo
          </label>
          <input
            id="sommelier-photo-input"
            ref={photoInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            disabled={disabled}
            onChange={(event) => {
              const file = event.target.files?.[0];
              event.target.value = "";
              if (file) {
                void onAttachPhoto(file);
              }
            }}
          />
          <button
            type="button"
            onClick={() => photoInputRef.current?.click()}
            disabled={disabled}
            aria-label="Attach a bottle photo"
            title="Attach a bottle photo"
            className="flex-shrink-0 flex items-center justify-center transition hover:opacity-80 focus:outline-none disabled:cursor-not-allowed disabled:opacity-50"
            style={{
              width: "30px",
              height: "30px",
              borderRadius: "50%",
              border: "0.5px solid rgba(196, 96, 122, 0.25)",
              background: "transparent",
            }}
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="var(--color-accent-secondary)"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2Z" />
              <circle cx="12" cy="13" r="4" />
            </svg>
          </button>
        </>
      ) : null}
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

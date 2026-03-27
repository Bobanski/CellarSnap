"use client";

import { SOMMELIER_DEFAULT_SUGGESTIONS } from "@shared";

export default function SommelierSuggestions({
  onSelect,
}: {
  onSelect: (prompt: string) => void;
}) {
  return (
    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2" aria-label="Suggested prompts">
      {SOMMELIER_DEFAULT_SUGGESTIONS.map((suggestion) => (
        <button
          key={suggestion}
          type="button"
          onClick={() => onSelect(suggestion)}
          style={{
            minHeight: "56px",
            width: "100%",
            background: "var(--color-surface-primary)",
            border: "0.5px solid var(--color-border)",
            borderRadius: "18px",
            padding: "10px 12px",
            fontSize: "11px",
            lineHeight: 1.25,
            color: "var(--color-text-primary)",
            textAlign: "center",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            whiteSpace: "normal",
            textWrap: "balance",
            overflowWrap: "anywhere",
          }}
          className="mx-auto transition hover:border-[var(--color-accent-secondary)]/40 hover:bg-[var(--color-accent-primary)]/10 focus:outline-none focus:ring-2 focus:ring-[var(--color-accent-primary)]/40"
        >
          {suggestion}
        </button>
      ))}
    </div>
  );
}

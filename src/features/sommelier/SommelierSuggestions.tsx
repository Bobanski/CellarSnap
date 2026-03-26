"use client";

const DEFAULT_SUGGESTIONS = [
  "Pair with my dinner",
  "Help me pick a bottle",
] as const;

export default function SommelierSuggestions({
  onSelect,
}: {
  onSelect: (prompt: string) => void;
}) {
  return (
    <div className="flex gap-3" aria-label="Suggested prompts">
      {DEFAULT_SUGGESTIONS.map((suggestion) => (
        <button
          key={suggestion}
          type="button"
          onClick={() => onSelect(suggestion)}
          style={{
            flex: 1,
            minHeight: "52px",
            background: "var(--color-surface-primary)",
            border: "0.5px solid var(--color-border)",
            borderRadius: "11px",
            padding: "10px",
            fontSize: "11px",
            color: "var(--color-text-secondary)",
            textAlign: "center",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
          className="transition hover:border-[var(--color-accent-secondary)]/40 hover:bg-[var(--color-accent-primary)]/10 focus:outline-none focus:ring-2 focus:ring-[var(--color-accent-primary)]/40"
        >
          {suggestion}
        </button>
      ))}
    </div>
  );
}

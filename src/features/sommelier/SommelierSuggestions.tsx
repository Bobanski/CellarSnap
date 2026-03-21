"use client";

const DEFAULT_SUGGESTIONS = [
  "What should I try next based on what I've liked lately?",
  "Tell me about Barolo and what it usually tastes like.",
  "What kind of wine would you pour with steak frites tonight?",
  "What regions should I explore if I like structured red Bordeaux?",
] as const;

export default function SommelierSuggestions({
  onSelect,
}: {
  onSelect: (prompt: string) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2" aria-label="Suggested prompts">
      {DEFAULT_SUGGESTIONS.map((suggestion) => (
        <button
          key={suggestion}
          type="button"
          onClick={() => onSelect(suggestion)}
          className="rounded-full border border-white/12 bg-[var(--color-surface-primary)]/10 px-4 py-2 text-left text-sm text-[var(--color-text-primary)] transition hover:border-[var(--color-accent-secondary)]/40 hover:bg-[var(--color-accent-primary)]/10 hover:text-[var(--color-text-on-accent)] focus:outline-none focus:ring-2 focus:ring-[var(--color-accent-primary)]/40"
        >
          {suggestion}
        </button>
      ))}
    </div>
  );
}

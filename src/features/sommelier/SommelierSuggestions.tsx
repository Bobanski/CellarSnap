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
          className="rounded-full border border-white/12 bg-white/5 px-4 py-2 text-left text-sm text-zinc-200 transition hover:border-amber-300/40 hover:bg-amber-300/10 hover:text-amber-50 focus:outline-none focus:ring-2 focus:ring-amber-300/40"
        >
          {suggestion}
        </button>
      ))}
    </div>
  );
}

"use client";

import Link from "next/link";
import {
  SOMMELIER_DEFAULT_SUGGESTIONS,
  SOMMELIER_SUGGESTIONS_BY_MODE,
  type AudienceMode,
} from "@shared";
import { Chip } from "@/components/ui/Button";

const TOOL_CHIPS: Array<{ label: string; href: string }> = [
  { label: "Scan a wine list", href: "/list-scan" },
];

// Compact chip-scale: text wraps within the pill instead of forcing a
// menu-sized card, and chips flow left-to-right like chat suggestions
// rather than filling a 2-column grid.
const promptChipClassName =
  "max-w-[78vw] whitespace-normal text-left leading-snug sm:max-w-[240px]";

const toolChipClassName =
  "inline-flex max-w-[78vw] items-center rounded-full border text-xs font-semibold leading-snug transition-colors duration-[var(--motion-duration-fast)] ease-[var(--motion-ease-standard)] px-3 py-1.5 whitespace-normal text-left sm:max-w-[240px] border-[var(--color-accent-secondary)]/50 bg-transparent text-[var(--color-text-secondary)] hover:border-[var(--color-accent-secondary)] hover:text-[var(--color-accent-secondary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-accent-primary)]/35";

export default function SommelierSuggestions({
  onSelect,
  audienceMode,
}: {
  onSelect: (prompt: string) => void;
  audienceMode?: AudienceMode;
}) {
  const suggestions = audienceMode
    ? SOMMELIER_SUGGESTIONS_BY_MODE[audienceMode]
    : SOMMELIER_DEFAULT_SUGGESTIONS;

  return (
    <div className="flex flex-wrap gap-1.5" aria-label="Suggested prompts">
      {suggestions.map((suggestion) => (
        <Chip
          key={suggestion}
          variant="filter"
          onClick={() => onSelect(suggestion)}
          className={promptChipClassName}
        >
          {suggestion}
        </Chip>
      ))}
      {TOOL_CHIPS.map((chip) => (
        <Link key={chip.href} href={chip.href} className={toolChipClassName}>
          {chip.label}
        </Link>
      ))}
    </div>
  );
}

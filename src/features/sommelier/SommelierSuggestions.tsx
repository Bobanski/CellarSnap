"use client";

import Link from "next/link";
import {
  SOMMELIER_DEFAULT_SUGGESTIONS,
  SOMMELIER_SUGGESTIONS_BY_MODE,
  type AudienceMode,
} from "@shared";

const TOOL_CHIPS: Array<{ label: string; href: string }> = [
  { label: "Scan a wine list", href: "/list-scan" },
];

const chipStyle = {
  minHeight: "56px",
  width: "100%",
  background: "var(--color-surface-primary)",
  border: "0.5px solid var(--color-border)",
  borderRadius: "18px",
  padding: "10px 12px",
  fontSize: "15px",
  lineHeight: 1.35,
  color: "var(--color-text-primary)",
  textAlign: "center" as const,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  whiteSpace: "normal" as const,
  textWrap: "balance" as const,
  overflowWrap: "anywhere" as const,
};

const chipClassName =
  "mx-auto transition hover:border-[var(--color-accent-secondary)]/40 hover:bg-[var(--color-accent-primary)]/10 focus:outline-none focus:ring-2 focus:ring-[var(--color-accent-primary)]/40";

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
    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2" aria-label="Suggested prompts">
      {suggestions.map((suggestion) => (
        <button
          key={suggestion}
          type="button"
          onClick={() => onSelect(suggestion)}
          style={chipStyle}
          className={chipClassName}
        >
          {suggestion}
        </button>
      ))}
      {TOOL_CHIPS.map((chip) => (
        <Link
          key={chip.href}
          href={chip.href}
          style={{
            ...chipStyle,
            borderColor: "var(--color-accent-secondary)",
            borderWidth: "0.5px",
            borderStyle: "solid",
            textDecoration: "none",
          }}
          className={chipClassName}
        >
          {chip.label}
        </Link>
      ))}
    </div>
  );
}

"use client";

export type PalateSubTab = "palate" | "library" | "cellar" | "badges" | "friends";

const TABS: { id: PalateSubTab; label: string }[] = [
  { id: "palate", label: "Palate" },
  { id: "library", label: "Library" },
  { id: "cellar", label: "Cellar" },
  { id: "badges", label: "Badges" },
  { id: "friends", label: "Friends" },
];

export function PalateSubTabs({
  active,
  onChange,
}: {
  active: PalateSubTab;
  onChange: (tab: PalateSubTab) => void;
}) {
  return (
    <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-none">
      {TABS.map((tab) => (
        <button
          key={tab.id}
          type="button"
          onClick={() => onChange(tab.id)}
          className={`shrink-0 rounded-full px-4 py-1.5 text-xs font-semibold transition ${
            active === tab.id
              ? "bg-[var(--color-accent-primary)] text-[var(--color-text-on-accent)]"
              : "border border-[rgba(196,96,122,0.12)] text-[var(--color-text-tertiary)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-surface-raised)]"
          }`}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}

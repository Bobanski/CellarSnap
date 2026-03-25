"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import AlertsMenu from "@/components/AlertsMenu";

type AppHeaderProps = {
  onMenuOpen: () => void;
};

export default function AppHeader({ onMenuOpen }: AppHeaderProps) {
  const pathname = usePathname();
  const isNewEntry = pathname === "/entries/new";

  return (
    <header className="app-header flex shrink-0 items-center justify-between px-4" style={{ height: 50 }}>
      {/* Left: wordmark */}
      <Link
        href="/feed"
        className="transition hover:opacity-80"
        style={{
          fontFamily: "var(--font-serif)",
          fontSize: 22,
          fontWeight: 300,
          letterSpacing: 7,
          color: "#F5EDD6",
        }}
      >
        cluster
      </Link>

      {/* Right: actions */}
      <div className="flex items-center gap-2">
        {isNewEntry ? (
          <span className="accent-soft-chip rounded-full border px-3 py-1.5 text-sm font-semibold">
            + New
          </span>
        ) : (
          <Link
            href="/entries/new"
            prefetch={false}
            className="accent-solid-button rounded-full px-3 py-1.5 text-sm font-semibold transition"
          >
            + New
          </Link>
        )}

        <AlertsMenu />

        <button
          type="button"
          onClick={onMenuOpen}
          className="relative flex h-10 w-10 items-center justify-center rounded-full border border-[var(--color-border)] text-[var(--color-text-primary)] transition hover:border-[var(--color-border-strong)]"
          aria-label="Open menu"
        >
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <line x1="3" y1="6" x2="21" y2="6" />
            <line x1="3" y1="12" x2="21" y2="12" />
            <line x1="3" y1="18" x2="21" y2="18" />
          </svg>
        </button>
      </div>
    </header>
  );
}

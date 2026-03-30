"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { formatConsumedDate } from "@/lib/formatDate";
import Photo from "@/components/Photo";
import AppShell from "@/components/AppShell";
import GroupedPostGallery from "@/components/GroupedPostGallery";
import CellarTable from "@/features/entries/CellarTable";
import type { WineEntryWithUrls } from "@/types/wine";
import {
  CELLAR_TAB_LABELS,
  CELLAR_COPY,
  type CellarEntry,
  compareEntryChronology,
  createEntryLibraryGroupId,
  entryMatchesLibrarySearch,
  ENTRY_LIBRARY_GROUP_PREVIEW_COUNT,
  ENTRIES_LIBRARY_ACTION_LABELS,
  ENTRIES_LIBRARY_CONTROL_BUTTON_LABELS,
  ENTRIES_LIBRARY_FILTER_OPTIONS,
  ENTRIES_LIBRARY_GROUP_OPTIONS,
  ENTRIES_LIBRARY_HEADER,
  ENTRIES_LIBRARY_INPUT_PLACEHOLDERS,
  ENTRIES_LIBRARY_PANEL_LABELS,
  ENTRIES_LIBRARY_SORT_OPTIONS,
  ENTRIES_LIBRARY_STATS_LABELS,
  ENTRIES_LIBRARY_VIEW_OPTIONS,
  EVENT_TYPE_LABELS,
  getEntriesCollectionStats,
  getEntriesCountLabel,
  getEntriesEmptyStateMessage,
  getEntriesSortOrderOptions,
  getEntryLibraryGroupLabel,
  getEntryListDisplayRating,
  shouldHideProducerInEntryTile,
  toEntryVintageNumber,
  type EntryLibraryControlPanel as ControlPanel,
  type EntryLibraryFilterType as FilterType,
  type EntryLibraryGroupScheme as GroupScheme,
  type EntryLibrarySortBy as SortBy,
  type EntryLibrarySortOrder as SortOrder,
  type EntryLibraryViewMode as LibraryViewMode,
  type EventTypeValue,
} from "@shared";

type EntryGroup = {
  id: string;
  label: string;
  entries: WineEntryWithUrls[];
};

type EventHistoryEntry = WineEntryWithUrls & {
  entry_group_id: string;
};

function entryMatchesSearch(entry: WineEntryWithUrls, query: string): boolean {
  return entryMatchesLibrarySearch(entry, query);
}

/* ─── Compact entry row for the new cellar design ─── */
function EntryRow({ entry }: { entry: WineEntryWithUrls & { comment_count?: number } }) {
  const hideProducer = shouldHideProducerInEntryTile(entry.wine_name, entry.producer);
  const producer = hideProducer ? null : entry.producer;
  const metaParts = [producer, entry.region || entry.country].filter(Boolean);
  const displayRating = getEntryListDisplayRating(entry.rating);

  return (
    <Link
      href={`/entries/${entry.id}`}
      className="group flex items-center gap-3 px-3.5 py-2.5"
      style={{ borderBottom: "0.5px solid rgba(245, 237, 214, 0.04)" }}
    >
      {/* Thumbnail */}
      <div
        className="flex shrink-0 items-center justify-center overflow-hidden bg-black/40"
        style={{
          width: 64,
          height: 76,
          borderRadius: 8,
          border: "0.5px solid var(--color-border)",
        }}
      >
        {entry.label_image_url ? (
          <Photo
            src={entry.label_image_url}
            alt={entry.wine_name ?? entry.producer ?? "Wine label"}
            containerClassName="h-full w-full"
            className="h-full w-full object-cover transition duration-300 group-hover:scale-105"
            loading="lazy"
          />
        ) : (
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2" className="h-4 w-4 text-[var(--color-text-tertiary)]" aria-hidden="true">
            <path d="M12 2C11 2 10 6 10 10c0 2 .5 3 2 3s2-1 2-3c0-4-1-8-2-8z" />
            <path d="M10 13v7a2 2 0 0 0 4 0v-7" />
          </svg>
        )}
      </div>

      {/* Center: name + meta */}
      <div className="flex min-w-0 flex-1 flex-col">
        <span
          className="truncate text-[var(--color-text-primary)]"
          style={{ fontFamily: "var(--font-serif)", fontSize: 18 }}
        >
          {entry.wine_name || "Unnamed wine"}
        </span>
        {metaParts.length > 0 ? (
          <span
            className="truncate text-[var(--color-text-secondary)]"
            style={{ fontSize: 13 }}
          >
            {metaParts.join(" \u00B7 ")}
          </span>
        ) : null}
      </div>

      {/* Right: rating + date */}
      <div className="flex shrink-0 flex-col items-end gap-0.5">
        {displayRating ? (
          <span
            className="inline-flex items-center justify-center"
            style={{
              fontFamily: "var(--font-serif)",
              fontSize: 16,
              background: "rgba(196, 96, 122, 0.12)",
              color: "var(--color-accent-secondary)",
              borderRadius: 4,
              padding: "1px 6px",
              lineHeight: 1.4,
            }}
          >
            {displayRating}
          </span>
        ) : null}
        <span className="text-[var(--color-text-tertiary)]" style={{ fontSize: 12 }}>
          {formatConsumedDate(entry.created_at)}
        </span>
      </div>
    </Link>
  );
}

function getGroupedModeLabel(entry: EventHistoryEntry) {
  if (entry.entry_group?.event_type) {
    return EVENT_TYPE_LABELS[entry.entry_group.event_type as EventTypeValue] ?? "Event";
  }
  return entry.entry_group?.mode === "catch_up" ? "Catch-up" : "Event";
}

function getGroupedTitle(entry: EventHistoryEntry) {
  const title = entry.entry_group?.title?.trim() ?? "";
  if (title) {
    return title;
  }
  return getGroupedModeLabel(entry);
}

function buildGroupedSlideMeta(
  slide: NonNullable<EventHistoryEntry["group_slides"]>[number] | null
) {
  if (!slide) {
    return "";
  }

  return [
    slide.producer && slide.producer !== slide.wine_name ? slide.producer : null,
    slide.vintage,
    slide.appellation || slide.region,
    slide.country,
  ]
    .filter(Boolean)
    .slice(0, 3)
    .join(" · ");
}

function EventHistoryCard({ entry }: { entry: EventHistoryEntry }) {
  const [activeIndex, setActiveIndex] = useState(0);
  const slides = entry.group_slides ?? [];
  const activeSlide = slides[activeIndex] ?? slides[0] ?? null;
  const title = getGroupedTitle(entry);
  const modeLabel = getGroupedModeLabel(entry);
  const previewTitle =
    activeSlide?.wine_name ?? activeSlide?.producer ?? entry.wine_name ?? null;
  const previewMeta = buildGroupedSlideMeta(activeSlide);

  return (
    <div
      style={{
        borderRadius: 16,
        border: "0.5px solid var(--color-border)",
        background: "var(--color-surface-primary)",
        padding: 16,
      }}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <span
            className="inline-flex items-center rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em]"
            style={{
              border: "0.5px solid var(--color-border-strong)",
              background: "var(--color-surface-tinted)",
              color: "var(--color-text-primary)",
            }}
          >
            {modeLabel}
          </span>
          <h2
            className="mt-3 break-words"
            style={{
              fontFamily: "var(--font-serif)",
              fontSize: 26,
              fontWeight: 300,
              color: "var(--color-text-primary)",
              lineHeight: 1.2,
            }}
          >
            {title}
          </h2>
          {entry.entry_group?.event_type && entry.entry_group.title?.trim() ? (
            <p className="mt-1 text-sm text-[var(--color-text-secondary)]">
              {EVENT_TYPE_LABELS[entry.entry_group.event_type as EventTypeValue] ?? "Event"}
            </p>
          ) : null}
        </div>
        <p className="shrink-0 text-sm text-[var(--color-text-tertiary)]">
          {formatConsumedDate(entry.consumed_at)}
        </p>
      </div>

      <div className="mt-4 -mx-4">
        {slides.length > 0 ? (
          <GroupedPostGallery
            title={entry.entry_group?.event_type ? (EVENT_TYPE_LABELS[entry.entry_group.event_type as EventTypeValue] ?? title) : title}
            slides={slides}
            heightClassName=""
            onIndexChange={setActiveIndex}
          />
        ) : (
          <div
            className="mx-4 flex aspect-[4/3] items-center justify-center rounded-2xl"
            style={{
              background: "rgba(245, 237, 214, 0.06)",
              border: "0.5px solid var(--color-border)",
              color: "var(--color-text-secondary)",
            }}
          >
            No photos yet
          </div>
        )}
      </div>

      {previewTitle ? (
        <div className="mt-4 min-w-0">
          <h3 className="break-words text-base font-semibold text-[var(--color-text-primary)]">
            {previewTitle}
          </h3>
          {previewMeta ? (
            <p className="mt-1 break-words text-sm text-[var(--color-text-tertiary)]">
              {previewMeta}
            </p>
          ) : null}
        </div>
      ) : null}

      <div className="mt-4">
        <Link
          href={`/entries/${entry.id}`}
          className="inline-flex rounded-full px-4 py-2 text-sm font-semibold transition"
          style={{
            background: "var(--color-accent-primary)",
            color: "var(--color-text-on-accent)",
          }}
        >
          Open details
        </Link>
      </div>
    </div>
  );
}

type CellarTab = "consumed" | "cellaring" | "events";

/* ─── Cellar entry card for the grid ─── */
function CellarEntryCard({
  entry,
  onSelect,
}: {
  entry: CellarEntry;
  onSelect: (entry: CellarEntry) => void;
}) {
  const formatLabel =
    entry.bottle_format && entry.bottle_format !== "750ml"
      ? entry.bottle_format
      : null;

  return (
    <button
      type="button"
      onClick={() => onSelect(entry)}
      className="group flex items-center gap-3 px-3.5 py-2.5 w-full text-left"
      style={{ borderBottom: "0.5px solid rgba(245, 237, 214, 0.04)" }}
    >
      {/* Thumbnail */}
      <div
        className="flex shrink-0 items-center justify-center overflow-hidden bg-black/40"
        style={{
          width: 64,
          height: 76,
          borderRadius: 8,
          border: "0.5px solid var(--color-border)",
        }}
      >
        {entry.label_image_url ? (
          <Photo
            src={entry.label_image_url}
            alt={entry.wine_name ?? entry.producer ?? "Wine label"}
            containerClassName="h-full w-full"
            className="h-full w-full object-cover transition duration-300 group-hover:scale-105"
            loading="lazy"
          />
        ) : (
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2" className="h-4 w-4 text-[var(--color-text-tertiary)]" aria-hidden="true">
            <path d="M12 2C11 2 10 6 10 10c0 2 .5 3 2 3s2-1 2-3c0-4-1-8-2-8z" />
            <path d="M10 13v7a2 2 0 0 0 4 0v-7" />
          </svg>
        )}
      </div>

      {/* Center: name + meta */}
      <div className="flex min-w-0 flex-1 flex-col">
        <span
          className="truncate text-[var(--color-text-primary)]"
          style={{ fontFamily: "var(--font-serif)", fontSize: 18 }}
        >
          {entry.wine_name || "Unnamed wine"}
        </span>
        {(entry.producer || entry.region || entry.country) ? (
          <span
            className="truncate text-[var(--color-text-secondary)]"
            style={{ fontSize: 13 }}
          >
            {[entry.producer, entry.region || entry.country].filter(Boolean).join(" \u00B7 ")}
          </span>
        ) : null}
      </div>

      {/* Right: quantity + format */}
      <div className="flex shrink-0 flex-col items-end gap-0.5">
        <span
          className="inline-flex items-center justify-center"
          style={{
            fontFamily: "var(--font-serif)",
            fontSize: 14,
            background: "rgba(196, 96, 122, 0.12)",
            color: "var(--color-accent-secondary)",
            borderRadius: 4,
            padding: "1px 6px",
            lineHeight: 1.4,
          }}
        >
          {CELLAR_COPY.bottlesRemaining(entry.cellar_quantity)}
        </span>
        {formatLabel ? (
          <span className="text-[var(--color-text-tertiary)]" style={{ fontSize: 11 }}>
            {formatLabel}
          </span>
        ) : null}
        {entry.vintage ? (
          <span className="text-[var(--color-text-tertiary)]" style={{ fontSize: 12 }}>
            {entry.vintage}
          </span>
        ) : null}
      </div>
    </button>
  );
}

/* ─── Detail overlay for a cellar entry ─── */
function CellarDetailOverlay({
  entry,
  onClose,
  onDrink,
  drinking,
}: {
  entry: CellarEntry;
  onClose: () => void;
  onDrink: (entry: CellarEntry) => void;
  drinking: boolean;
}) {
  const metaParts = [
    entry.producer,
    entry.region,
    entry.country,
    entry.appellation,
  ].filter(Boolean);

  const formatLabel =
    entry.bottle_format && entry.bottle_format !== "750ml"
      ? entry.bottle_format
      : "750ml";

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center sm:items-center"
      style={{ background: "var(--color-overlay)" }}
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-md"
        style={{
          background: "var(--color-surface-primary)",
          border: "0.5px solid var(--color-border-strong)",
          borderRadius: "18px 18px 0 0",
          padding: "28px 24px 32px",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close */}
        <button
          type="button"
          onClick={onClose}
          className="absolute right-4 top-4"
          style={{ color: "var(--color-text-tertiary)", fontSize: 13 }}
          aria-label="Close"
        >
          &#10005;
        </button>

        {/* Wine name */}
        <h2
          style={{
            fontFamily: "var(--font-serif)",
            fontSize: 28,
            fontWeight: 400,
            color: "var(--color-text-primary)",
            lineHeight: 1.2,
          }}
        >
          {entry.wine_name || "Unnamed wine"}
        </h2>

        {/* Meta */}
        {metaParts.length > 0 ? (
          <p
            className="mt-1"
            style={{ fontSize: 14, color: "var(--color-text-secondary)" }}
          >
            {metaParts.join(" \u00B7 ")}
          </p>
        ) : null}

        {/* Details grid */}
        <div
          className="mt-5 grid grid-cols-2 gap-3"
          style={{ fontSize: 13 }}
        >
          {entry.vintage ? (
            <div>
              <span className="block uppercase" style={{ fontSize: 9, letterSpacing: 1.5, color: "var(--color-text-tertiary)" }}>
                Vintage
              </span>
              <span style={{ color: "var(--color-text-primary)" }}>{entry.vintage}</span>
            </div>
          ) : null}
          {entry.wine_type ? (
            <div>
              <span className="block uppercase" style={{ fontSize: 9, letterSpacing: 1.5, color: "var(--color-text-tertiary)" }}>
                Type
              </span>
              <span style={{ color: "var(--color-text-primary)" }}>{entry.wine_type}</span>
            </div>
          ) : null}
          <div>
            <span className="block uppercase" style={{ fontSize: 9, letterSpacing: 1.5, color: "var(--color-text-tertiary)" }}>
              Quantity
            </span>
            <span style={{ color: "var(--color-text-primary)" }}>
              {CELLAR_COPY.bottlesRemaining(entry.cellar_quantity)}
            </span>
          </div>
          <div>
            <span className="block uppercase" style={{ fontSize: 9, letterSpacing: 1.5, color: "var(--color-text-tertiary)" }}>
              Format
            </span>
            <span style={{ color: "var(--color-text-primary)" }}>{formatLabel}</span>
          </div>
        </div>

        {/* Actions */}
        <div className="mt-6 flex gap-3">
          <button
            type="button"
            onClick={() => onDrink(entry)}
            disabled={drinking || entry.cellar_quantity <= 0}
            className="flex-1 transition disabled:opacity-50"
            style={{
              background: "var(--color-accent-primary)",
              color: "var(--color-text-on-accent)",
              borderRadius: 10,
              padding: "12px 16px",
              fontSize: 13,
              fontWeight: 600,
              letterSpacing: 0.5,
              border: "none",
              cursor: drinking ? "wait" : "pointer",
            }}
          >
            {drinking ? "Opening\u2026" : CELLAR_COPY.drinkButton}
          </button>
        </div>
      </div>
    </div>
  );
}

type CellarViewMode = "cards" | "table";

/* ─── Cellar view ─── */
function CellarView() {
  const router = useRouter();
  const [cellarEntries, setCellarEntries] = useState<CellarEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [selectedEntry, setSelectedEntry] = useState<CellarEntry | null>(null);
  const [drinking, setDrinking] = useState(false);
  const [viewMode, setViewMode] = useState<CellarViewMode>("cards");
  const [addMenuOpen, setAddMenuOpen] = useState(false);

  const handleUpdateEntry = useCallback((id: string, updates: Partial<CellarEntry>) => {
    setCellarEntries((prev) =>
      prev.map((e) => (e.id === id ? { ...e, ...updates } : e))
    );
  }, []);

  useEffect(() => {
    let isMounted = true;

    const loadCellar = async () => {
      if (isMounted) {
        setLoading(true);
        setErrorMessage(null);
      }

      try {
        const response = await fetch("/api/cellar", { cache: "no-store" });
        if (!response.ok) {
          if (isMounted) {
            setErrorMessage("Unable to load your cellar.");
            setLoading(false);
          }
          return;
        }

        const data = await response.json();
        if (isMounted) {
          setCellarEntries(data.entries ?? []);
          setLoading(false);
        }
      } catch {
        if (isMounted) {
          setErrorMessage("Unable to load your cellar.");
          setLoading(false);
        }
      }
    };

    loadCellar().catch(() => null);

    return () => {
      isMounted = false;
    };
  }, []);

  const handleDrink = useCallback(
    async (entry: CellarEntry) => {
      setDrinking(true);
      try {
        const response = await fetch("/api/cellar/drink", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ cellar_entry_id: entry.id }),
        });

        if (!response.ok) {
          const data = await response.json().catch(() => ({}));
          alert(data.error || "Something went wrong. Please try again.");
          return;
        }

        const data = await response.json();
        // Navigate to the new consumed entry's edit page for tasting notes
        router.push(`/entries/${data.consumed_entry_id}/edit`);
      } catch {
        alert("Network error. Please try again.");
      } finally {
        setDrinking(false);
      }
    },
    [router]
  );

  if (loading) {
    return (
      <div
        className="text-center"
        style={{
          background: "var(--color-surface-primary)",
          border: "0.5px solid var(--color-border)",
          borderRadius: 14,
          padding: "24px 16px",
          fontSize: 12,
          color: "var(--color-text-secondary)",
        }}
      >
        Loading cellar&hellip;
      </div>
    );
  }

  if (errorMessage) {
    return (
      <div
        style={{
          borderRadius: 14,
          border: "0.5px solid rgba(192, 57, 43, 0.3)",
          background: "rgba(192, 57, 43, 0.08)",
          padding: "24px 16px",
          fontSize: 12,
          color: "#e6a0a0",
        }}
      >
        {errorMessage}
      </div>
    );
  }

  if (cellarEntries.length === 0) {
    return (
      <div
        style={{
          background: "var(--color-surface-primary)",
          border: "0.5px solid var(--color-border)",
          borderRadius: 14,
          padding: "40px 16px",
          textAlign: "center",
        }}
      >
        <p
          style={{
            fontFamily: "var(--font-serif)",
            fontSize: 22,
            fontWeight: 400,
            color: "var(--color-text-primary)",
          }}
        >
          {CELLAR_COPY.emptyTitle}
        </p>
        <p
          className="mt-2"
          style={{ fontSize: 13, color: "var(--color-text-secondary)" }}
        >
          {CELLAR_COPY.emptySubtitle}
        </p>
        <div className="mt-5 flex flex-col items-center gap-3">
          <button
            type="button"
            onClick={() => setAddMenuOpen((v) => !v)}
            className="rounded-xl bg-[var(--color-accent-primary)] px-5 py-2.5 text-sm font-semibold text-[var(--color-text-on-accent)] transition hover:bg-[var(--color-accent-hover)] cursor-pointer"
          >
            {CELLAR_COPY.addButton}
          </button>
          {addMenuOpen && (
            <div className="flex flex-wrap justify-center gap-2">
              <Link
                href="/cellar/add"
                className="rounded-xl border border-[var(--color-border-strong)] bg-[var(--color-surface-tinted)] px-4 py-2 text-xs font-semibold text-[var(--color-text-primary)] transition hover:border-[var(--color-accent-primary)]"
              >
                Enter manually
              </Link>
              <Link
                href="/entries/new?cellar=1"
                className="rounded-xl border border-[var(--color-border-strong)] bg-[var(--color-surface-tinted)] px-4 py-2 text-xs font-semibold text-[var(--color-text-primary)] transition hover:border-[var(--color-accent-primary)]"
              >
                Scan label(s)
              </Link>
              <Link
                href="/cellar/upload"
                className="rounded-xl border border-[var(--color-border-strong)] bg-[var(--color-surface-tinted)] px-4 py-2 text-xs font-semibold text-[var(--color-text-primary)] transition hover:border-[var(--color-accent-primary)]"
              >
                Upload CSV / Excel
              </Link>
              <Link
                href="/cellar/import-cellartracker"
                className="rounded-xl border border-[var(--color-border-strong)] bg-[var(--color-surface-tinted)] px-4 py-2 text-xs font-semibold text-[var(--color-text-primary)] transition hover:border-[var(--color-accent-primary)]"
              >
                Import from CellarTracker
              </Link>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <>
      {/* Add to cellar */}
      <div className="flex flex-col items-center gap-2">
        <button
          type="button"
          onClick={() => setAddMenuOpen((v) => !v)}
          className="rounded-xl bg-[var(--color-accent-primary)] px-4 py-2 text-xs font-semibold text-[var(--color-text-on-accent)] transition hover:bg-[var(--color-accent-hover)] cursor-pointer"
        >
          {CELLAR_COPY.addButton}
        </button>
        {addMenuOpen && (
          <div className="flex flex-wrap justify-center gap-2">
            <Link
              href="/cellar/add"
              className="rounded-xl border border-[var(--color-border-strong)] bg-[var(--color-surface-tinted)] px-3 py-1.5 text-xs font-semibold text-[var(--color-text-primary)] transition hover:border-[var(--color-accent-primary)]"
            >
              Enter manually
            </Link>
            <Link
              href="/entries/new?cellar=1"
              className="rounded-xl border border-[var(--color-border-strong)] bg-[var(--color-surface-tinted)] px-3 py-1.5 text-xs font-semibold text-[var(--color-text-primary)] transition hover:border-[var(--color-accent-primary)]"
            >
              Scan label(s)
            </Link>
            <Link
              href="/cellar/upload"
              className="rounded-xl border border-[var(--color-border-strong)] bg-[var(--color-surface-tinted)] px-3 py-1.5 text-xs font-semibold text-[var(--color-text-primary)] transition hover:border-[var(--color-accent-primary)]"
            >
              Upload CSV / Excel
            </Link>
            <Link
              href="/cellar/import-cellartracker"
              className="rounded-xl border border-[var(--color-border-strong)] bg-[var(--color-surface-tinted)] px-3 py-1.5 text-xs font-semibold text-[var(--color-text-primary)] transition hover:border-[var(--color-accent-primary)]"
            >
              Import from CellarTracker
            </Link>
          </div>
        )}
      </div>

      {/* Count + view toggle */}
      <div className="flex items-center justify-between">
        {/* View toggle */}
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setViewMode("cards")}
            className="flex h-7 w-7 items-center justify-center rounded-md transition"
            style={{
              background: viewMode === "cards" ? "var(--color-surface-hover)" : "transparent",
              color: viewMode === "cards" ? "var(--color-text-primary)" : "var(--color-text-tertiary)",
            }}
            aria-label="Card view"
            title="Card view"
          >
            {/* Grid icon */}
            <svg viewBox="0 0 16 16" fill="currentColor" className="h-3.5 w-3.5" aria-hidden="true">
              <rect x="1" y="1" width="6" height="6" rx="1" />
              <rect x="9" y="1" width="6" height="6" rx="1" />
              <rect x="1" y="9" width="6" height="6" rx="1" />
              <rect x="9" y="9" width="6" height="6" rx="1" />
            </svg>
          </button>
          <button
            type="button"
            onClick={() => setViewMode("table")}
            className="flex h-7 w-7 items-center justify-center rounded-md transition"
            style={{
              background: viewMode === "table" ? "var(--color-surface-hover)" : "transparent",
              color: viewMode === "table" ? "var(--color-text-primary)" : "var(--color-text-tertiary)",
            }}
            aria-label="Table view"
            title="Table view"
          >
            {/* List/table icon */}
            <svg viewBox="0 0 16 16" fill="currentColor" className="h-3.5 w-3.5" aria-hidden="true">
              <rect x="1" y="2" width="14" height="2" rx="0.5" />
              <rect x="1" y="7" width="14" height="2" rx="0.5" />
              <rect x="1" y="12" width="14" height="2" rx="0.5" />
            </svg>
          </button>
        </div>

        <span
          style={{
            fontSize: 9,
            letterSpacing: 1,
            color: "var(--color-text-tertiary)",
            textTransform: "uppercase",
          }}
        >
          {cellarEntries.length} wine{cellarEntries.length === 1 ? "" : "s"}
        </span>
      </div>

      {/* Entry list or table */}
      {viewMode === "table" ? (
        <CellarTable entries={cellarEntries} onUpdateEntry={handleUpdateEntry} />
      ) : (
        <div
          style={{
            background: "var(--color-surface-primary)",
            border: "0.5px solid var(--color-border)",
            borderRadius: 14,
            overflow: "hidden",
          }}
        >
          {cellarEntries.map((entry) => (
            <CellarEntryCard
              key={entry.id}
              entry={entry}
              onSelect={setSelectedEntry}
            />
          ))}
        </div>
      )}

      {/* Detail overlay */}
      {selectedEntry ? (
        <CellarDetailOverlay
          entry={selectedEntry}
          onClose={() => setSelectedEntry(null)}
          onDrink={handleDrink}
          drinking={drinking}
        />
      ) : null}
    </>
  );
}

export default function EntriesPage() {
  const [activeTab, setActiveTab] = useState<CellarTab>("consumed");
  const [entries, setEntries] = useState<WineEntryWithUrls[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchBarVisible, setSearchBarVisible] = useState(false);
  const [sortBy, setSortBy] = useState<SortBy>("consumed_at");
  const [sortOrder, setSortOrder] = useState<SortOrder>("desc");
  const [filterType, setFilterType] = useState<FilterType>("");
  const [filterValue, setFilterValue] = useState<string>("");
  const [filterMin, setFilterMin] = useState<string>("");
  const [filterMax, setFilterMax] = useState<string>("");
  const [libraryViewMode, setLibraryViewMode] =
    useState<LibraryViewMode>("all");
  const [groupScheme, setGroupScheme] = useState<GroupScheme>(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("libraryGroupScheme");
      if (saved === "region" || saved === "vintage" || saved === "varietal") return saved;
    }
    return "region";
  });
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({});
  const [activeControlPanel, setActiveControlPanel] = useState<ControlPanel>(null);

  const isRangeFilterActive =
    (filterType === "rating" || filterType === "vintage") &&
    (filterMin !== "" || filterMax !== "");
  const isFilterActive =
    filterType === "country" ? filterValue !== "" : isRangeFilterActive;
  const normalizedSearchQuery = searchQuery.trim().toLowerCase();
  const isSearchActive = normalizedSearchQuery.length > 0;

  const uniqueValues = useMemo(() => {
    const vintages = new Set<number>();
    const countries = new Set<string>();
    const ratings = new Set<number>();

    entries.forEach((entry) => {
      const vintage = toEntryVintageNumber(entry.vintage);
      if (vintage !== null) {
        vintages.add(vintage);
      }
      if (entry.country) countries.add(entry.country);
      if (entry.rating !== null && entry.rating !== undefined) {
        ratings.add(entry.rating);
      }
    });

    return {
      vintage: Array.from(vintages)
        .sort((a, b) => a - b)
        .map(String),
      country: Array.from(countries).sort(),
      rating: Array.from(ratings)
        .sort((a, b) => a - b)
        .map(String),
    };
  }, [entries]);

  /* ─── Stats computations ─── */
  const stats = useMemo(() => getEntriesCollectionStats(entries), [entries]);

  const filteredEntries = useMemo(() => {
    if (!filterType) return entries;

    if (filterType === "country") {
      if (!filterValue) return entries;
      return entries.filter((entry) => entry.country === filterValue);
    }

    if (filterType === "rating" || filterType === "vintage") {
      if (!filterMin && !filterMax) return entries;
      const min = filterMin ? Number(filterMin) : -Infinity;
      const max = filterMax ? Number(filterMax) : Infinity;
      const rangeMin = Math.min(min, max);
      const rangeMax = Math.max(min, max);

      return entries.filter((entry) => {
        const value =
          filterType === "vintage"
            ? toEntryVintageNumber(entry.vintage)
            : entry.rating ?? null;
        if (value === null || Number.isNaN(value)) return false;
        return value >= rangeMin && value <= rangeMax;
      });
    }

    return entries;
  }, [entries, filterType, filterValue, filterMin, filterMax]);

  const searchedEntries = useMemo(() => {
    if (!isSearchActive) {
      return filteredEntries;
    }

    return filteredEntries.filter((entry) =>
      entryMatchesSearch(entry, normalizedSearchQuery)
    );
  }, [filteredEntries, isSearchActive, normalizedSearchQuery]);

  const sortedEntries = useMemo(() => {
    const copy = [...searchedEntries];
    const mult = sortOrder === "asc" ? 1 : -1;

    if (sortBy === "rating") {
      return copy.sort((a, b) => {
        const aValue = a.rating ?? -Infinity;
        const bValue = b.rating ?? -Infinity;
        const numericSort = aValue - bValue;
        if (numericSort !== 0) {
          return mult * numericSort;
        }
        return mult * compareEntryChronology(a, b);
      });
    }

    if (sortBy === "vintage") {
      return copy.sort((a, b) => {
        const aValue = toEntryVintageNumber(a.vintage) ?? -Infinity;
        const bValue = toEntryVintageNumber(b.vintage) ?? -Infinity;
        const numericSort = aValue - bValue;
        if (numericSort !== 0) {
          return mult * numericSort;
        }
        return mult * compareEntryChronology(a, b);
      });
    }

    return copy.sort((a, b) => mult * compareEntryChronology(a, b));
  }, [searchedEntries, sortBy, sortOrder]);

  const groupedEntries = useMemo<EntryGroup[]>(() => {
    if (libraryViewMode !== "grouped") {
      return [];
    }

    const groups = new Map<string, EntryGroup>();

    sortedEntries.forEach((entry) => {
      const label = getEntryLibraryGroupLabel(entry, groupScheme);
      const id = createEntryLibraryGroupId(groupScheme, label);
      const existing = groups.get(id);
      if (existing) {
        existing.entries.push(entry);
        return;
      }
      groups.set(id, { id, label, entries: [entry] });
    });

    const sorted = Array.from(groups.values());
    sorted.sort((a, b) => {
      if (groupScheme === "vintage") {
        // Reverse chronological: most recent first, "Unknown" last
        if (a.label === "Unknown vintage") return 1;
        if (b.label === "Unknown vintage") return -1;
        return b.label.localeCompare(a.label, undefined, { numeric: true });
      }
      // A-Z for region and varietal, "Unknown" last
      const aUnknown = a.label.startsWith("Unknown ");
      const bUnknown = b.label.startsWith("Unknown ");
      if (aUnknown !== bUnknown) return aUnknown ? 1 : -1;
      return a.label.localeCompare(b.label);
    });
    return sorted;
  }, [groupScheme, libraryViewMode, sortedEntries]);

  const eventEntries = useMemo<EventHistoryEntry[]>(() => {
    const seenGroupIds = new Set<string>();

    return entries
      .filter((entry): entry is EventHistoryEntry => (
        typeof entry.entry_group_id === "string" && entry.entry_group_id.length > 0
      ))
      .filter((entry) => {
        if (seenGroupIds.has(entry.entry_group_id)) {
          return false;
        }

        seenGroupIds.add(entry.entry_group_id);
        return true;
      });
  }, [entries]);

  useEffect(() => {
    let isMounted = true;

    const loadEntries = async () => {
      if (isMounted) {
        setLoading(true);
        setErrorMessage(null);
        setNextCursor(null);
        setHasMore(false);
      }

      try {
        const response = await fetch("/api/entries?limit=50", { cache: "no-store" });
        if (!response.ok) {
          if (isMounted) {
            setErrorMessage("Unable to load your library.");
            setLoading(false);
          }
          return;
        }

        const data = await response.json();
        if (isMounted) {
          setEntries(data.entries ?? []);
          setNextCursor(data.next_cursor ?? null);
          setHasMore(Boolean(data.has_more));
          setLoading(false);
        }
      } catch {
        if (isMounted) {
          setErrorMessage("Unable to load your library.");
          setLoading(false);
        }
      }
    };

    loadEntries().catch(() => null);

    return () => {
      isMounted = false;
    };
  }, []);

  const loadMore = async () => {
    if (!hasMore || loadingMore || !nextCursor) {
      return;
    }

    setLoadingMore(true);
    setErrorMessage(null);
    try {
      const response = await fetch(
        `/api/entries?limit=50&cursor=${encodeURIComponent(nextCursor)}`,
        { cache: "no-store" }
      );
      if (!response.ok) {
        setErrorMessage("Unable to load more entries.");
        return;
      }
      const data = await response.json();
      setEntries((prev) => [...prev, ...(data.entries ?? [])]);
      setNextCursor(data.next_cursor ?? null);
      setHasMore(Boolean(data.has_more));
    } finally {
      setLoadingMore(false);
    }
  };

  const sortByLabel =
    sortBy === "consumed_at"
      ? "Date"
      : ENTRIES_LIBRARY_SORT_OPTIONS.find((option) => option.value === sortBy)?.label ??
        "Date";
  const sortOrderOptions = getEntriesSortOrderOptions(sortBy);
  const sortOrderLabel =
    sortOrderOptions.find((option) => option.value === sortOrder)?.label ??
    "Newest first";
  const sortSummary = `${sortByLabel} \u00B7 ${sortOrderLabel}`;

  const filterSummary = (() => {
    if (!filterType) {
      return "None";
    }

    if (filterType === "country") {
      return filterValue ? `Country: ${filterValue}` : "Country: all";
    }

    const rangeLabel = filterType === "vintage" ? "Vintage" : "Rating";
    if (!filterMin && !filterMax) {
      return `${rangeLabel}: any`;
    }
    const min = filterMin || "Any";
    const max = filterMax || "Any";
    return `${rangeLabel}: ${min} - ${max}`;
  })();

  const organizeSummary =
    libraryViewMode === "all"
      ? ENTRIES_LIBRARY_VIEW_OPTIONS.find((option) => option.value === "all")?.label ??
        "Full list"
      : `Grouped by ${
          ENTRIES_LIBRARY_GROUP_OPTIONS.find((option) => option.value === groupScheme)?.label.toLowerCase() ??
          "region"
        }`;

  const toggleControlPanel = (panel: Exclude<ControlPanel, null>) => {
    setActiveControlPanel((current) => (current === panel ? null : panel));
  };

  const updateFilterType = (newFilterType: FilterType) => {
    setFilterType(newFilterType);
    setFilterValue("");
    setFilterMin("");
    setFilterMax("");
  };

  /* ─── Pill style helpers ─── */
  const pillActive =
    "text-[var(--color-text-on-accent)] uppercase tracking-[1px]";
  const pillInactive =
    "text-[var(--color-text-secondary)] uppercase tracking-[1px]";

  return (
    <AppShell>
      <div className="px-5 pb-8 pt-6 text-[var(--color-text-primary)]">
        <div className="mx-auto w-full max-w-2xl space-y-5">

          {/* ─── Page header ─── */}
          <header>
            <span
              className="block uppercase"
              style={{
                fontSize: 9,
                letterSpacing: 3,
                color: "var(--color-accent-secondary)",
              }}
            >
              {ENTRIES_LIBRARY_HEADER.eyebrow}
            </span>
            <h1
              className="mt-1"
              style={{
                fontFamily: "var(--font-serif)",
                fontSize: 44,
                fontWeight: 300,
                color: "var(--color-text-primary)",
                lineHeight: 1.2,
              }}
            >
              {ENTRIES_LIBRARY_HEADER.title}
            </h1>
          </header>

          {/* ─── Consumed / Cellar tab toggle ─── */}
          <div className="flex items-center justify-center gap-2">
            {(["consumed", "cellaring", "events"] as const).map((tab) => (
              <button
                key={tab}
                type="button"
                onClick={() => setActiveTab(tab)}
                className={`rounded-full px-4 py-1.5 text-sm font-semibold transition ${
                  activeTab === tab
                    ? "bg-[var(--color-surface-hover)] text-[var(--color-text-primary)]"
                    : "text-[var(--color-text-tertiary)] hover:text-[var(--color-text-primary)]"
                }`}
              >
                {CELLAR_TAB_LABELS[tab]}
              </button>
            ))}
          </div>

          {activeTab === "cellaring" ? (
            <CellarView />
          ) : activeTab === "events" ? (
            <>
              {errorMessage ? (
                <div
                  style={{
                    borderRadius: 14,
                    border: "0.5px solid rgba(192, 57, 43, 0.3)",
                    background: "rgba(192, 57, 43, 0.08)",
                    padding: "24px 16px",
                    fontSize: 12,
                    color: "#e6a0a0",
                  }}
                >
                  {errorMessage}
                </div>
              ) : null}

              {eventEntries.length === 0 ? (
                <div
                  style={{
                    background: "var(--color-surface-primary)",
                    border: "0.5px solid var(--color-border)",
                    borderRadius: 14,
                    padding: "32px 18px",
                    textAlign: "center",
                  }}
                >
                  <p
                    style={{
                      fontFamily: "var(--font-serif)",
                      fontSize: 24,
                      fontWeight: 300,
                      color: "var(--color-text-primary)",
                    }}
                  >
                    {CELLAR_COPY.eventsEmptyTitle}
                  </p>
                  <p className="mt-2 text-sm text-[var(--color-text-secondary)]">
                    {CELLAR_COPY.eventsEmptySubtitle}
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  {eventEntries.map((entry) => (
                    <EventHistoryCard key={entry.entry_group_id} entry={entry} />
                  ))}
                </div>
              )}

              {hasMore ? (
                <div className="pt-1 text-center">
                  <button
                    type="button"
                    onClick={() => void loadMore()}
                    disabled={loadingMore}
                    className="rounded-full border border-[var(--color-border)] px-5 py-2 text-sm font-semibold text-[var(--color-text-primary)] transition hover:border-[var(--color-border-strong)] disabled:opacity-60"
                  >
                    {loadingMore ? "Loading..." : "Load more"}
                  </button>
                </div>
              ) : null}
            </>
          ) : (
          <>

          {/* ─── Stats row ─── */}
          <div className="grid grid-cols-3 gap-2.5">
            {[
              {
                value: stats.totalEntries,
                label: ENTRIES_LIBRARY_STATS_LABELS.totalEntries,
              },
              {
                value: stats.avgRating !== null ? stats.avgRating.toFixed(1) : "\u2014",
                label: ENTRIES_LIBRARY_STATS_LABELS.avgRating,
              },
              {
                value: stats.uniqueCountries,
                label: ENTRIES_LIBRARY_STATS_LABELS.countries,
              },
            ].map((stat) => (
              <div
                key={stat.label}
                className="text-center"
                style={{
                  background: "var(--color-surface-primary)",
                  border: "0.5px solid var(--color-border)",
                  borderRadius: 12,
                  padding: "14px 8px",
                }}
              >
                <span
                  className="block"
                  style={{
                    fontFamily: "var(--font-serif)",
                    fontSize: 38,
                    fontWeight: 300,
                    color: "var(--color-text-primary)",
                    lineHeight: 1.2,
                  }}
                >
                  {stat.value}
                </span>
                <span
                  className="mt-1 block uppercase"
                  style={{
                    fontSize: 10,
                    letterSpacing: 1.8,
                    color: "var(--color-text-tertiary)",
                  }}
                >
                  {stat.label}
                </span>
              </div>
            ))}
          </div>

          {/* ─── Search bar ─── */}
          {searchBarVisible && (
            <div className="relative">
              <label htmlFor="library-search" className="sr-only">
                {ENTRIES_LIBRARY_PANEL_LABELS.search}
              </label>
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--color-text-tertiary)]"
                aria-hidden="true"
              >
                <circle cx="11" cy="11" r="8" />
                <path d="m21 21-4.35-4.35" />
              </svg>
              <input
                id="library-search"
                type="search"
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                placeholder={ENTRIES_LIBRARY_INPUT_PLACEHOLDERS.search}
                className="w-full focus:outline-none"
                autoFocus
                style={{
                  background: "rgba(245, 237, 214, 0.04)",
                  border: "0.5px solid var(--color-border-strong)",
                  borderRadius: 10,
                  padding: "9px 12px 9px 32px",
                  fontSize: 12,
                  color: "var(--color-text-secondary)",
                }}
              />
              {isSearchActive ? (
                <button
                  type="button"
                  onClick={() => setSearchQuery("")}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2"
                  style={{
                    fontSize: 9,
                    letterSpacing: 1,
                    color: "var(--color-text-tertiary)",
                    textTransform: "uppercase",
                  }}
                >
                  {ENTRIES_LIBRARY_ACTION_LABELS.clearSearch}
                </button>
              ) : null}
            </div>
          )}

          {/* ─── Sort / Filter / Organize pills ─── */}
          <div className="flex gap-2 overflow-x-auto" style={{ scrollbarWidth: "none" }}>
            {([
              {
                panel: "sort" as const,
                label: ENTRIES_LIBRARY_CONTROL_BUTTON_LABELS.sort,
                summary: sortSummary,
              },
              {
                panel: "filter" as const,
                label: ENTRIES_LIBRARY_CONTROL_BUTTON_LABELS.filter,
                summary: filterSummary,
              },
              {
                panel: "organize" as const,
                label: ENTRIES_LIBRARY_CONTROL_BUTTON_LABELS.organize,
                summary: organizeSummary,
              },
            ]).map((item) => {
              const isActive = activeControlPanel === item.panel;
              return (
                <button
                  key={item.panel}
                  type="button"
                  onClick={() => toggleControlPanel(item.panel)}
                  className={`shrink-0 transition ${isActive ? pillActive : pillInactive}`}
                  style={{
                    background: isActive
                      ? "var(--color-accent-primary)"
                      : "rgba(245, 237, 214, 0.05)",
                    border: isActive
                      ? "none"
                      : "0.5px solid var(--color-border-strong)",
                    borderRadius: 20,
                    padding: "5px 12px",
                    fontSize: 9,
                    letterSpacing: 1,
                  }}
                  aria-expanded={isActive}
                >
                  {item.label}
                </button>
              );
            })}

            <button
              type="button"
              onClick={() => {
                setSearchBarVisible(!searchBarVisible);
                if (!searchBarVisible) {
                  setSearchQuery("");
                }
              }}
              className="shrink-0"
              style={{
                background: "transparent",
                border: "none",
                padding: "4px 8px",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                cursor: "pointer",
              }}
              aria-label="Toggle search"
            >
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
                style={{
                  width: "16px",
                  height: "16px",
                  color: "var(--color-text-tertiary)",
                }}
              >
                <circle cx="11" cy="11" r="8" />
                <path d="m21 21-4.35-4.35" />
              </svg>
            </button>

            <span
              className="ml-auto shrink-0 self-center"
              style={{
                fontSize: 9,
                letterSpacing: 1,
                color: "var(--color-text-tertiary)",
                textTransform: "uppercase",
              }}
            >
              {getEntriesCountLabel(sortedEntries.length)}
            </span>
          </div>

          {/* ─── Control panel drawers ─── */}
          {activeControlPanel ? (
            <div
              style={{
                background: "var(--color-surface-primary)",
                border: "0.5px solid var(--color-border)",
                borderRadius: 14,
                padding: 14,
              }}
            >
              {activeControlPanel === "sort" ? (
                <div className="space-y-4">
                  <div>
                    <p
                      className="uppercase"
                      style={{ fontSize: 8, letterSpacing: 1.5, color: "var(--color-text-tertiary)" }}
                    >
                      {ENTRIES_LIBRARY_PANEL_LABELS.sortBy}
                    </p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {ENTRIES_LIBRARY_SORT_OPTIONS.map((option) => (
                        <button
                          key={option.value}
                          type="button"
                          onClick={() => setSortBy(option.value)}
                          className={`transition uppercase ${sortBy === option.value ? pillActive : pillInactive}`}
                          style={{
                            background:
                              sortBy === option.value
                                ? "var(--color-accent-primary)"
                                : "rgba(245, 237, 214, 0.05)",
                            border:
                              sortBy === option.value
                                ? "none"
                                : "0.5px solid var(--color-border-strong)",
                            borderRadius: 20,
                            padding: "5px 12px",
                            fontSize: 9,
                            letterSpacing: 1,
                          }}
                        >
                          {option.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <p
                      className="uppercase"
                      style={{ fontSize: 8, letterSpacing: 1.5, color: "var(--color-text-tertiary)" }}
                    >
                      {ENTRIES_LIBRARY_PANEL_LABELS.order}
                    </p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {sortOrderOptions.map((option) => (
                        <button
                          key={option.value}
                          type="button"
                          onClick={() => setSortOrder(option.value)}
                          className={`transition uppercase ${sortOrder === option.value ? pillActive : pillInactive}`}
                          style={{
                            background:
                              sortOrder === option.value
                                ? "var(--color-accent-primary)"
                                : "rgba(245, 237, 214, 0.05)",
                            border:
                              sortOrder === option.value
                                ? "none"
                                : "0.5px solid var(--color-border-strong)",
                            borderRadius: 20,
                            padding: "5px 12px",
                            fontSize: 9,
                            letterSpacing: 1,
                          }}
                        >
                          {option.label}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              ) : null}

              {activeControlPanel === "filter" ? (
                <div className="space-y-4">
                  <div>
                    <p
                      className="uppercase"
                      style={{ fontSize: 8, letterSpacing: 1.5, color: "var(--color-text-tertiary)" }}
                    >
                      {ENTRIES_LIBRARY_PANEL_LABELS.filterBy}
                    </p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {ENTRIES_LIBRARY_FILTER_OPTIONS.map((option) => (
                        <button
                          key={option.value || "none"}
                          type="button"
                          onClick={() => updateFilterType(option.value)}
                          className={`transition uppercase ${filterType === option.value ? pillActive : pillInactive}`}
                          style={{
                            background:
                              filterType === option.value
                                ? "var(--color-accent-primary)"
                                : "rgba(245, 237, 214, 0.05)",
                            border:
                              filterType === option.value
                                ? "none"
                                : "0.5px solid var(--color-border-strong)",
                            borderRadius: 20,
                            padding: "5px 12px",
                            fontSize: 9,
                            letterSpacing: 1,
                          }}
                        >
                          {option.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {filterType === "country" ? (
                    <div className="max-w-xs">
                      <label
                        className="mb-1 block uppercase"
                        style={{ fontSize: 8, letterSpacing: 1.5, color: "var(--color-text-tertiary)" }}
                      >
                        {ENTRIES_LIBRARY_PANEL_LABELS.country}
                      </label>
                      <select
                        className="select-field w-full focus:outline-none"
                        value={filterValue}
                        onChange={(event) => setFilterValue(event.target.value)}
                        style={{
                          background: "rgba(245, 237, 214, 0.04)",
                          border: "0.5px solid var(--color-border-strong)",
                          borderRadius: 10,
                          padding: "9px 12px",
                          fontSize: 12,
                          color: "var(--color-text-secondary)",
                        }}
                      >
                        <option value="">{ENTRIES_LIBRARY_ACTION_LABELS.allCountries}</option>
                        {uniqueValues.country.map((country) => (
                          <option key={country} value={country}>
                            {country}
                          </option>
                        ))}
                      </select>
                    </div>
                  ) : null}

                  {filterType === "rating" || filterType === "vintage" ? (
                    <div>
                      <label
                        className="mb-1 block uppercase"
                        style={{ fontSize: 8, letterSpacing: 1.5, color: "var(--color-text-tertiary)" }}
                      >
                        {
                          ENTRIES_LIBRARY_FILTER_OPTIONS.find(
                            (option) => option.value === filterType
                          )?.label
                        }
                      </label>
                      <div className="flex flex-wrap items-center gap-2">
                        <input
                          className="w-28 focus:outline-none"
                          type="number"
                          inputMode="numeric"
                          placeholder={ENTRIES_LIBRARY_INPUT_PLACEHOLDERS.min}
                          value={filterMin}
                          onChange={(event) => setFilterMin(event.target.value)}
                          style={{
                            background: "rgba(245, 237, 214, 0.04)",
                            border: "0.5px solid var(--color-border-strong)",
                            borderRadius: 10,
                            padding: "9px 12px",
                            fontSize: 12,
                            color: "var(--color-text-secondary)",
                          }}
                        />
                        <input
                          className="w-28 focus:outline-none"
                          type="number"
                          inputMode="numeric"
                          placeholder={ENTRIES_LIBRARY_INPUT_PLACEHOLDERS.max}
                          value={filterMax}
                          onChange={(event) => setFilterMax(event.target.value)}
                          style={{
                            background: "rgba(245, 237, 214, 0.04)",
                            border: "0.5px solid var(--color-border-strong)",
                            borderRadius: 10,
                            padding: "9px 12px",
                            fontSize: 12,
                            color: "var(--color-text-secondary)",
                          }}
                        />
                      </div>
                    </div>
                  ) : null}
                </div>
              ) : null}

              {activeControlPanel === "organize" ? (
                <div className="space-y-4">
                  <div>
                    <p
                      className="uppercase"
                      style={{ fontSize: 8, letterSpacing: 1.5, color: "var(--color-text-tertiary)" }}
                    >
                      {ENTRIES_LIBRARY_PANEL_LABELS.libraryView}
                    </p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {ENTRIES_LIBRARY_VIEW_OPTIONS.map((option) => (
                        <button
                          key={option.value}
                          type="button"
                          onClick={() => setLibraryViewMode(option.value)}
                          className={`transition uppercase ${libraryViewMode === option.value ? pillActive : pillInactive}`}
                          style={{
                            background:
                              libraryViewMode === option.value
                                ? "var(--color-accent-primary)"
                                : "rgba(245, 237, 214, 0.05)",
                            border:
                              libraryViewMode === option.value
                                ? "none"
                                : "0.5px solid var(--color-border-strong)",
                            borderRadius: 20,
                            padding: "5px 12px",
                            fontSize: 9,
                            letterSpacing: 1,
                          }}
                        >
                          {option.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {libraryViewMode === "grouped" ? (
                    <div>
                      <p
                        className="uppercase"
                        style={{ fontSize: 8, letterSpacing: 1.5, color: "var(--color-text-tertiary)" }}
                      >
                        {ENTRIES_LIBRARY_PANEL_LABELS.groupBy}
                      </p>
                      <div className="mt-2 flex flex-wrap gap-2">
                        {ENTRIES_LIBRARY_GROUP_OPTIONS.map((option) => (
                          <button
                            key={option.value}
                            type="button"
                            onClick={() => {
                              setGroupScheme(option.value);
                              try { localStorage.setItem("libraryGroupScheme", option.value); } catch { /* noop */ }
                            }}
                            className={`transition uppercase ${groupScheme === option.value ? pillActive : pillInactive}`}
                            style={{
                              background:
                                groupScheme === option.value
                                  ? "var(--color-accent-primary)"
                                  : "rgba(245, 237, 214, 0.05)",
                              border:
                                groupScheme === option.value
                                  ? "none"
                                  : "0.5px solid var(--color-border-strong)",
                              borderRadius: 20,
                              padding: "5px 12px",
                              fontSize: 9,
                              letterSpacing: 1,
                            }}
                          >
                            {option.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  ) : null}
                </div>
              ) : null}
            </div>
          ) : null}

          {/* ─── Entry list ─── */}
          {loading ? (
            <div
              className="text-center"
              style={{
                background: "var(--color-surface-primary)",
                border: "0.5px solid var(--color-border)",
                borderRadius: 14,
                padding: "24px 16px",
                fontSize: 12,
                color: "var(--color-text-secondary)",
              }}
            >
              {ENTRIES_LIBRARY_ACTION_LABELS.loading}
            </div>
          ) : errorMessage ? (
            <div
              style={{
                borderRadius: 14,
                border: "0.5px solid rgba(192, 57, 43, 0.3)",
                background: "rgba(192, 57, 43, 0.08)",
                padding: "24px 16px",
                fontSize: 12,
                color: "#e6a0a0",
              }}
            >
              {errorMessage}
            </div>
          ) : sortedEntries.length === 0 ? (
            <div
              style={{
                background: "var(--color-surface-primary)",
                border: "0.5px solid var(--color-border)",
                borderRadius: 14,
                padding: "32px 16px",
                fontSize: 12,
                color: "var(--color-text-secondary)",
                textAlign: "center",
              }}
            >
              <p>
                {getEntriesEmptyStateMessage({
                  hasMore,
                  isFilterActive,
                  isRangeFilterActive,
                  isSearchActive,
                })}
              </p>
              {hasMore ? (
                <button
                  type="button"
                  onClick={loadMore}
                  disabled={loadingMore}
                  className="mt-4 transition disabled:opacity-50"
                  style={{
                    background: "var(--color-accent-primary)",
                    color: "var(--color-text-on-accent)",
                    borderRadius: 20,
                    padding: "5px 14px",
                    fontSize: 10,
                    fontWeight: 600,
                    letterSpacing: 1,
                    textTransform: "uppercase" as const,
                  }}
                >
                  {loadingMore
                    ? ENTRIES_LIBRARY_ACTION_LABELS.loadingMore
                    : ENTRIES_LIBRARY_ACTION_LABELS.loadMore}
                </button>
              ) : null}
            </div>
          ) : (
            <>
              {libraryViewMode === "grouped" ? (
                <div className="space-y-4">
                  {groupedEntries.map((group) => {
                    const expanded = Boolean(expandedGroups[group.id]);
                    const visibleEntries = expanded
                      ? group.entries
                      : group.entries.slice(0, ENTRY_LIBRARY_GROUP_PREVIEW_COUNT);
                    return (
                      <section
                        key={group.id}
                        style={{
                          background: "var(--color-surface-primary)",
                          border: "0.5px solid var(--color-border)",
                          borderRadius: 14,
                          overflow: "hidden",
                        }}
                      >
                        {/* Group header */}
                        <div
                          className="flex items-center justify-between"
                          style={{ padding: "10px 14px 6px" }}
                        >
                          <span
                            className="uppercase"
                            style={{
                              fontSize: 8,
                              letterSpacing: 2,
                              color: "var(--color-accent-secondary)",
                            }}
                          >
                            {group.label} &middot; {getEntriesCountLabel(group.entries.length)}
                          </span>
                          {group.entries.length > ENTRY_LIBRARY_GROUP_PREVIEW_COUNT ? (
                            <button
                              type="button"
                              onClick={() =>
                                setExpandedGroups((prev) => ({
                                  ...prev,
                                  [group.id]: !prev[group.id],
                                }))
                              }
                              style={{
                                fontSize: 8,
                                letterSpacing: 1,
                                color: "var(--color-text-tertiary)",
                                textTransform: "uppercase" as const,
                              }}
                            >
                              {expanded
                                ? ENTRIES_LIBRARY_ACTION_LABELS.showLess
                                : ENTRIES_LIBRARY_ACTION_LABELS.seeAll}
                            </button>
                          ) : null}
                        </div>
                        {/* Entry rows */}
                        <div>
                          {visibleEntries.map((entry) => (
                            <EntryRow key={entry.id} entry={entry} />
                          ))}
                        </div>
                      </section>
                    );
                  })}
                </div>
              ) : (
                <div
                  style={{
                    background: "var(--color-surface-primary)",
                    border: "0.5px solid var(--color-border)",
                    borderRadius: 14,
                    overflow: "hidden",
                  }}
                >
                  {sortedEntries.map((entry) => (
                    <EntryRow key={entry.id} entry={entry} />
                  ))}
                </div>
              )}
              {hasMore ? (
                <div className="pt-1 text-center">
                  <button
                    type="button"
                    onClick={loadMore}
                    disabled={loadingMore}
                    className="transition disabled:opacity-50"
                    style={{
                      background: "var(--color-accent-primary)",
                      color: "var(--color-text-on-accent)",
                      borderRadius: 20,
                      padding: "5px 14px",
                      fontSize: 10,
                      fontWeight: 600,
                      letterSpacing: 1,
                      textTransform: "uppercase" as const,
                    }}
                  >
                    {loadingMore
                      ? ENTRIES_LIBRARY_ACTION_LABELS.loadingMore
                      : ENTRIES_LIBRARY_ACTION_LABELS.loadMore}
                  </button>
                </div>
              ) : null}
            </>
          )}
          </>
          )}
        </div>
      </div>
    </AppShell>
  );
}

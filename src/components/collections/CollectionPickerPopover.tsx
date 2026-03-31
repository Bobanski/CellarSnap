"use client";

import { useMemo, type ReactNode } from "react";
import {
  COLLECTIONS_COPY,
  type CollectionOption,
} from "@shared";

type CollectionPickerPopoverProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  trigger: (args: { open: boolean; toggle: () => void }) => ReactNode;
  title?: string;
  subtitle?: string | null;
  collections: CollectionOption[];
  selectedIds: string[];
  lockedIds?: string[];
  onToggleCollection: (collectionId: string) => void;
  onCreateCollection: (name: string) => Promise<void>;
  primaryActionLabel?: string;
  onPrimaryAction?: () => void;
  primaryActionDisabled?: boolean;
  busy?: boolean;
  creating?: boolean;
  widthClassName?: string;
  align?: "left" | "right";
};

function buildSummary(collections: CollectionOption[], selectedIds: string[]) {
  if (selectedIds.length === 0) {
    return COLLECTIONS_COPY.fieldPlaceholder;
  }

  const selectedNames = collections
    .filter((collection) => selectedIds.includes(collection.id))
    .map((collection) => collection.name);

  if (selectedNames.length === 0) {
    return COLLECTIONS_COPY.fieldPlaceholder;
  }

  if (selectedNames.length === 1) {
    return selectedNames[0];
  }

  if (selectedNames.length === 2) {
    return selectedNames.join(", ");
  }

  return `${selectedNames.slice(0, 2).join(", ")} +${selectedNames.length - 2}`;
}

export function CollectionFieldTrigger({
  label = COLLECTIONS_COPY.sectionTitle,
  description = COLLECTIONS_COPY.fieldDescription,
  collections,
  selectedIds,
  onPress,
}: {
  label?: string;
  description?: string;
  collections: CollectionOption[];
  selectedIds: string[];
  onPress: () => void;
}) {
  const summary = useMemo(
    () => buildSummary(collections, selectedIds),
    [collections, selectedIds]
  );

  return (
    <div className="space-y-2">
      <div className="space-y-1">
        <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--color-text-tertiary)]">
          {label}
        </p>
        {description ? (
          <p className="text-sm text-[var(--color-text-secondary)]">{description}</p>
        ) : null}
      </div>
      <button
        type="button"
        className="flex w-full items-center justify-between gap-3 rounded-[10px] border border-[var(--color-border-strong)] bg-[rgba(245,237,214,0.04)] px-3 py-[11px] text-left"
        onClick={onPress}
      >
        <span
          className={`min-w-0 flex-1 text-sm ${
            selectedIds.length === 0
              ? "text-[var(--color-text-tertiary)]"
              : "text-[var(--color-text-primary)]"
          }`}
        >
          {summary}
        </span>
        <span className="text-xs font-semibold text-[var(--color-text-secondary)]">v</span>
      </button>
    </div>
  );
}

export default function CollectionPickerPopover({
  open,
  onOpenChange,
  trigger,
  title = COLLECTIONS_COPY.pickerTitle,
  subtitle = null,
  collections,
  selectedIds,
  lockedIds = [],
  onToggleCollection,
  onCreateCollection,
  primaryActionLabel = COLLECTIONS_COPY.doneActionLabel,
  onPrimaryAction,
  primaryActionDisabled = false,
  busy = false,
  creating = false,
  widthClassName = "w-80",
  align = "right",
}: CollectionPickerPopoverProps) {
  const handleCreate = async () => {
    const name =
      typeof window !== "undefined"
        ? window.prompt("New collection name")
        : null;
    if (!name || !name.trim()) {
      return;
    }
    await onCreateCollection(name);
  };

  return (
    <div className="relative">
      {trigger({
        open,
        toggle: () => onOpenChange(!open),
      })}
      {open ? (
        <>
          <button
            type="button"
            className="fixed inset-0 z-30 cursor-default"
            onClick={() => onOpenChange(false)}
            aria-label="Close collections picker"
          />
          <div
            className={`absolute ${
              align === "left" ? "left-0" : "right-0"
            } z-40 mt-2 ${widthClassName} rounded-2xl border border-[var(--color-border-strong)] bg-[var(--color-surface-raised)] p-4 shadow-2xl`}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h3 className="text-lg font-semibold text-[var(--color-text-primary)]">
                  {title}
                </h3>
                {subtitle ? (
                  <p className="mt-1 text-xs leading-relaxed text-[var(--color-text-secondary)]">
                    {subtitle}
                  </p>
                ) : null}
              </div>
              <button
                type="button"
                className="text-xs font-semibold text-[var(--color-text-secondary)] transition hover:text-[var(--color-text-primary)]"
                onClick={() => onOpenChange(false)}
              >
                Close
              </button>
            </div>

            <div className="mt-4 max-h-72 space-y-2 overflow-y-auto pr-1">
              {collections.length > 0 ? (
                collections.map((collection) => {
                  const selected = selectedIds.includes(collection.id);
                  const locked = lockedIds.includes(collection.id) && selected;
                  return (
                    <button
                      key={collection.id}
                      type="button"
                      className={`flex w-full items-center gap-3 rounded-xl border px-3 py-2 text-left transition ${
                        selected
                          ? "border-[var(--color-accent-secondary)]/70 bg-[var(--color-accent-primary)]/14"
                          : "border-[var(--color-border)] bg-[var(--color-surface-muted)] hover:border-[var(--color-border-strong)]"
                      }`}
                      onClick={() => {
                        if (locked) {
                          return;
                        }
                        onToggleCollection(collection.id);
                      }}
                    >
                      <span className="flex h-4 w-4 items-center justify-center rounded-full border border-[var(--color-border-strong)]">
                        {selected ? (
                          <span className="h-2 w-2 rounded-full bg-[var(--color-accent-secondary)]" />
                        ) : null}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span
                          className={`block text-sm ${
                            selected
                              ? "font-semibold text-[var(--color-accent-secondary)]"
                              : "text-[var(--color-text-primary)]"
                          }`}
                        >
                          {collection.name}
                        </span>
                        {locked ? (
                          <span className="mt-0.5 block text-[11px] text-[var(--color-text-secondary)]">
                            Already saved
                          </span>
                        ) : null}
                      </span>
                    </button>
                  );
                })
              ) : (
                <p className="text-sm text-[var(--color-text-secondary)]">
                  {COLLECTIONS_COPY.emptySubtitle}
                </p>
              )}
            </div>

            <div className="mt-4 border-t border-[var(--color-border)] pt-4">
              <button
                type="button"
                className="w-full rounded-xl border border-[var(--color-border-strong)] bg-[var(--color-surface-muted)] px-3 py-2 text-sm font-semibold text-[var(--color-text-primary)] transition hover:border-[var(--color-accent-secondary)]/55 hover:text-[var(--color-accent-secondary)] disabled:opacity-60"
                onClick={() => void handleCreate()}
                disabled={creating}
              >
                {creating ? "Creating..." : COLLECTIONS_COPY.addNewLabel}
              </button>
            </div>

            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                className="rounded-full border border-[var(--color-border)] px-4 py-2 text-sm font-semibold text-[var(--color-text-primary)] transition hover:border-[var(--color-border-strong)]"
                onClick={() => onOpenChange(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="rounded-full bg-[var(--color-accent-primary)] px-4 py-2 text-sm font-semibold text-[var(--color-text-on-accent)] transition disabled:opacity-60"
                onClick={onPrimaryAction ?? (() => onOpenChange(false))}
                disabled={primaryActionDisabled || busy}
              >
                {busy ? "Saving..." : primaryActionLabel}
              </button>
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}

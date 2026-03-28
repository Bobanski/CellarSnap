"use client";

import { useCallback, useRef, useState } from "react";
import { BOTTLE_FORMAT_OPTIONS, type BottleFormat, type CellarEntry } from "@shared";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import { formatConsumedDate } from "@/lib/formatDate";

const WINE_TYPE_OPTIONS: { value: string; label: string }[] = [
  { value: "red", label: "Red" },
  { value: "white", label: "White" },
  { value: "rose", label: "Rosé" },
  { value: "sparkling", label: "Sparkling" },
  { value: "orange", label: "Orange" },
  { value: "sweet", label: "Sweet / Dessert" },
];

type SortKey =
  | "wine_name"
  | "producer"
  | "vintage"
  | "region"
  | "country"
  | "wine_type"
  | "cellar_quantity"
  | "bottle_format"
  | "created_at";

type SortDir = "asc" | "desc";

type EditingCell = {
  entryId: string;
  field: SortKey;
};

const COLUMNS: { key: SortKey; label: string; editable: boolean }[] = [
  { key: "wine_name", label: "Wine", editable: true },
  { key: "producer", label: "Producer", editable: true },
  { key: "vintage", label: "Vintage", editable: true },
  { key: "region", label: "Region", editable: true },
  { key: "country", label: "Country", editable: true },
  { key: "wine_type", label: "Type", editable: true },
  { key: "cellar_quantity", label: "Qty", editable: true },
  { key: "bottle_format", label: "Format", editable: true },
  { key: "created_at", label: "Added", editable: false },
];

function compareCells(a: string | number | null, b: string | number | null): number {
  if (a === null && b === null) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  if (typeof a === "number" && typeof b === "number") return a - b;
  return String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: "base" });
}

export default function CellarTable({
  entries,
  onUpdateEntry,
}: {
  entries: CellarEntry[];
  onUpdateEntry: (id: string, updates: Partial<CellarEntry>) => void;
}) {
  const [sortKey, setSortKey] = useState<SortKey>("created_at");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [editing, setEditing] = useState<EditingCell | null>(null);
  const [editValue, setEditValue] = useState("");
  const [savingId, setSavingId] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement | HTMLSelectElement | null>(null);

  const sortedEntries = [...entries].sort((a, b) => {
    const aVal = a[sortKey];
    const bVal = b[sortKey];
    const cmp = compareCells(aVal, bVal);
    return sortDir === "asc" ? cmp : -cmp;
  });

  const handleHeaderClick = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  };

  const saveField = useCallback(
    async (entryId: string, field: string, value: string | number | null) => {
      setSavingId(entryId);
      try {
        const supabase = createSupabaseBrowserClient();
        const {
          data: { session },
        } = await supabase.auth.getSession();

        if (!session) return;

        const payload: Record<string, unknown> = { [field]: value };

        const res = await fetch(`/api/entries/${entryId}`, {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify(payload),
        });

        if (!res.ok) {
          console.error("Failed to save field", field, res.status);
        }
      } catch (err) {
        console.error("Save error", err);
      } finally {
        setSavingId(null);
      }
    },
    []
  );

  const startEditing = (entryId: string, field: SortKey, currentValue: string | number | null) => {
    setEditing({ entryId, field });
    setEditValue(currentValue != null ? String(currentValue) : "");
    // Focus the input after render
    setTimeout(() => inputRef.current?.focus(), 0);
  };

  const commitEdit = useCallback(async () => {
    if (!editing) return;
    const { entryId, field } = editing;

    let finalValue: string | number | null = editValue.trim() || null;

    if (field === "cellar_quantity") {
      finalValue = parseInt(editValue, 10);
      if (isNaN(finalValue) || finalValue < 0) finalValue = 0;
    }

    // Optimistic update
    onUpdateEntry(entryId, { [field]: finalValue } as Partial<CellarEntry>);
    setEditing(null);

    await saveField(entryId, field, finalValue);
  }, [editing, editValue, onUpdateEntry, saveField]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      commitEdit();
    } else if (e.key === "Escape") {
      setEditing(null);
    }
  };

  const handleQuantityChange = async (entry: CellarEntry, delta: number) => {
    const newQty = Math.max(0, entry.cellar_quantity + delta);
    onUpdateEntry(entry.id, { cellar_quantity: newQty });
    await saveField(entry.id, "cellar_quantity", newQty);
  };

  const renderCell = (entry: CellarEntry, col: (typeof COLUMNS)[number]) => {
    const isEditing = editing?.entryId === entry.id && editing?.field === col.key;
    const isSaving = savingId === entry.id;
    const value = entry[col.key];

    // Read-only: created_at
    if (col.key === "created_at") {
      return (
        <span className="whitespace-nowrap text-sm text-[var(--color-text-secondary)]">
          {formatConsumedDate(entry.created_at)}
        </span>
      );
    }

    // Quantity with +/- buttons
    if (col.key === "cellar_quantity") {
      return (
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              handleQuantityChange(entry, -1);
            }}
            className="flex h-5 w-5 items-center justify-center rounded text-xs text-[var(--color-text-secondary)] transition hover:bg-[var(--color-surface-hover)]"
            disabled={entry.cellar_quantity <= 0}
          >
            -
          </button>
          <span className="min-w-[20px] text-center text-sm text-[var(--color-text-primary)]">
            {entry.cellar_quantity}
          </span>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              handleQuantityChange(entry, 1);
            }}
            className="flex h-5 w-5 items-center justify-center rounded text-xs text-[var(--color-text-secondary)] transition hover:bg-[var(--color-surface-hover)]"
          >
            +
          </button>
        </div>
      );
    }

    // Dropdown: bottle_format
    if (col.key === "bottle_format") {
      if (isEditing) {
        return (
          <select
            ref={(el) => { inputRef.current = el; }}
            value={editValue}
            onChange={(e) => {
              setEditValue(e.target.value);
              // Commit immediately on select change
              const newVal = e.target.value || null;
              onUpdateEntry(entry.id, { bottle_format: newVal as BottleFormat | null });
              setEditing(null);
              saveField(entry.id, "bottle_format", newVal);
            }}
            onBlur={() => setEditing(null)}
            onKeyDown={handleKeyDown}
            className="w-full rounded bg-transparent text-sm text-[var(--color-text-primary)] focus:outline-none"
            style={{
              border: "1px solid var(--color-accent-primary)",
              padding: "2px 4px",
              background: "var(--color-surface-primary)",
            }}
          >
            <option value="">--</option>
            {BOTTLE_FORMAT_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        );
      }

      const formatLabel = BOTTLE_FORMAT_OPTIONS.find((f) => f.value === value)?.label ?? (value || "--");
      return (
        <span
          className="cursor-pointer whitespace-nowrap text-sm text-[var(--color-text-primary)]"
          onClick={() => startEditing(entry.id, col.key, value as string | null)}
        >
          {formatLabel}
        </span>
      );
    }

    // Dropdown: wine_type
    if (col.key === "wine_type") {
      if (isEditing) {
        return (
          <select
            ref={(el) => { inputRef.current = el; }}
            value={editValue}
            onChange={(e) => {
              setEditValue(e.target.value);
              const newVal = e.target.value || null;
              onUpdateEntry(entry.id, { wine_type: newVal });
              setEditing(null);
              saveField(entry.id, "wine_type", newVal);
            }}
            onBlur={() => setEditing(null)}
            onKeyDown={handleKeyDown}
            className="w-full rounded bg-transparent text-sm text-[var(--color-text-primary)] focus:outline-none"
            style={{
              border: "1px solid var(--color-accent-primary)",
              padding: "2px 4px",
              background: "var(--color-surface-primary)",
            }}
          >
            <option value="">--</option>
            {WINE_TYPE_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        );
      }

      const typeLabel = WINE_TYPE_OPTIONS.find((t) => t.value === value)?.label ?? (value || "--");
      return (
        <span
          className="cursor-pointer whitespace-nowrap text-sm text-[var(--color-text-primary)]"
          onClick={() => startEditing(entry.id, col.key, value as string | null)}
        >
          {typeLabel}
        </span>
      );
    }

    // Text fields: wine_name, producer, vintage, region, country
    if (isEditing) {
      return (
        <input
          ref={(el) => { inputRef.current = el; }}
          type="text"
          value={editValue}
          onChange={(e) => setEditValue(e.target.value)}
          onBlur={commitEdit}
          onKeyDown={handleKeyDown}
          className="w-full rounded bg-transparent text-sm text-[var(--color-text-primary)] focus:outline-none"
          style={{
            border: "1px solid var(--color-accent-primary)",
            padding: "2px 4px",
            minWidth: 60,
          }}
        />
      );
    }

    return (
      <span
        className="cursor-pointer truncate text-sm text-[var(--color-text-primary)]"
        onClick={() => startEditing(entry.id, col.key, value as string | null)}
        title={value != null ? String(value) : undefined}
      >
        {value != null ? String(value) : "--"}
      </span>
    );
  };

  const sortArrow = (key: SortKey) => {
    if (sortKey !== key) return null;
    return (
      <span className="ml-0.5 text-[var(--color-accent-primary)]">
        {sortDir === "asc" ? "\u2191" : "\u2193"}
      </span>
    );
  };

  return (
    <div
      className="overflow-x-auto"
      style={{
        background: "var(--color-surface-primary)",
        border: "0.5px solid var(--color-border)",
        borderRadius: 14,
      }}
    >
      <table className="w-full min-w-[700px] border-collapse">
        <thead>
          <tr style={{ borderBottom: "1px solid var(--color-border)" }}>
            {COLUMNS.map((col) => (
              <th
                key={col.key}
                onClick={() => handleHeaderClick(col.key)}
                className="cursor-pointer select-none px-3 py-2.5 text-left"
                style={{
                  fontSize: 9,
                  fontWeight: 700,
                  textTransform: "uppercase",
                  letterSpacing: "2px",
                  color: "var(--color-text-tertiary)",
                  whiteSpace: "nowrap",
                }}
              >
                {col.label}
                {sortArrow(col.key)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sortedEntries.map((entry) => (
            <tr
              key={entry.id}
              className="transition-colors hover:bg-[var(--color-surface-hover)]"
              style={{
                borderBottom: "0.5px solid var(--color-border)",
                position: "relative",
              }}
            >
              {COLUMNS.map((col) => (
                <td
                  key={col.key}
                  className="px-3 py-2"
                  style={{ maxWidth: col.key === "wine_name" ? 200 : col.key === "producer" ? 160 : 120 }}
                >
                  {renderCell(entry, col)}
                </td>
              ))}
              {savingId === entry.id && (
                <td className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2">
                  <span
                    className="text-[var(--color-text-tertiary)]"
                    style={{ fontSize: 9, letterSpacing: 1, textTransform: "uppercase" }}
                  >
                    Saving...
                  </span>
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

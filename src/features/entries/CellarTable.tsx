"use client";

import { useCallback, useEffect, useRef, useState } from "react";
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
  field: string; // SortKey or custom field def id
};

type CustomFieldDef = {
  id: string;
  field_name: string;
  field_type: "text" | "number" | "date";
  position: number;
  created_at: string;
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

async function getAuthHeaders(): Promise<Record<string, string>> {
  const supabase = createSupabaseBrowserClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) return {};
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${session.access_token}`,
  };
}

const FIELD_TYPE_OPTIONS: { value: CustomFieldDef["field_type"]; label: string }[] = [
  { value: "text", label: "Text" },
  { value: "number", label: "Number" },
  { value: "date", label: "Date" },
];

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

  // Custom fields state
  const [customFields, setCustomFields] = useState<CustomFieldDef[]>([]);
  const [customValues, setCustomValues] = useState<Map<string, string>>(new Map());
  const [showAddField, setShowAddField] = useState(false);
  const [newFieldName, setNewFieldName] = useState("");
  const [newFieldType, setNewFieldType] = useState<CustomFieldDef["field_type"]>("text");
  const addFieldRef = useRef<HTMLInputElement | null>(null);

  // Fetch custom field definitions on mount
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const headers = await getAuthHeaders();
      if (!headers.Authorization) return;
      const res = await fetch("/api/cellar/custom-fields", { headers });
      if (!res.ok || cancelled) return;
      const json = await res.json();
      if (!cancelled) setCustomFields(json.fields ?? []);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Fetch custom field values when entries or custom fields change
  useEffect(() => {
    if (customFields.length === 0 || entries.length === 0) return;
    let cancelled = false;
    (async () => {
      const headers = await getAuthHeaders();
      if (!headers.Authorization) return;
      const entryIds = entries.map((e) => e.id).join(",");
      const res = await fetch(`/api/cellar/custom-field-values?entry_ids=${entryIds}`, {
        headers,
      });
      if (!res.ok || cancelled) return;
      const json = await res.json();
      const map = new Map<string, string>();
      for (const v of json.values ?? []) {
        map.set(`${v.entry_id}:${v.field_def_id}`, v.value);
      }
      if (!cancelled) setCustomValues(map);
    })();
    return () => {
      cancelled = true;
    };
  }, [customFields, entries]);

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
        const headers = await getAuthHeaders();
        if (!headers.Authorization) return;

        const payload: Record<string, unknown> = { [field]: value };

        const res = await fetch(`/api/entries/${entryId}`, {
          method: "PUT",
          headers,
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

  const saveCustomFieldValue = useCallback(
    async (entryId: string, fieldDefId: string, value: string) => {
      setSavingId(entryId);
      try {
        const headers = await getAuthHeaders();
        if (!headers.Authorization) return;

        // Optimistic update
        setCustomValues((prev) => {
          const next = new Map(prev);
          next.set(`${entryId}:${fieldDefId}`, value);
          return next;
        });

        const res = await fetch("/api/cellar/custom-field-values", {
          method: "PUT",
          headers,
          body: JSON.stringify({ entry_id: entryId, field_def_id: fieldDefId, value }),
        });

        if (!res.ok) {
          console.error("Failed to save custom field value", res.status);
        }
      } catch (err) {
        console.error("Save custom field error", err);
      } finally {
        setSavingId(null);
      }
    },
    []
  );

  const startEditing = (entryId: string, field: string, currentValue: string | number | null) => {
    setEditing({ entryId, field });
    setEditValue(currentValue != null ? String(currentValue) : "");
    setTimeout(() => inputRef.current?.focus(), 0);
  };

  const commitEdit = useCallback(async () => {
    if (!editing) return;
    const { entryId, field } = editing;

    // Check if this is a custom field (UUID format)
    const isCustomField = customFields.some((cf) => cf.id === field);

    if (isCustomField) {
      const trimmed = editValue.trim();
      setEditing(null);
      await saveCustomFieldValue(entryId, field, trimmed);
      return;
    }

    let finalValue: string | number | null = editValue.trim() || null;

    if (field === "cellar_quantity") {
      finalValue = parseInt(editValue, 10);
      if (isNaN(finalValue) || finalValue < 0) finalValue = 0;
    }

    // Optimistic update
    onUpdateEntry(entryId, { [field]: finalValue } as Partial<CellarEntry>);
    setEditing(null);

    await saveField(entryId, field, finalValue);
  }, [editing, editValue, onUpdateEntry, saveField, saveCustomFieldValue, customFields]);

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

  const handleAddField = async () => {
    const name = newFieldName.trim();
    if (!name) return;

    const headers = await getAuthHeaders();
    if (!headers.Authorization) return;

    const res = await fetch("/api/cellar/custom-fields", {
      method: "POST",
      headers,
      body: JSON.stringify({ field_name: name, field_type: newFieldType }),
    });

    if (!res.ok) {
      const json = await res.json().catch(() => ({}));
      alert(json.error ?? "Failed to create field");
      return;
    }

    const json = await res.json();
    setCustomFields((prev) => [...prev, json.field]);
    setNewFieldName("");
    setNewFieldType("text");
    setShowAddField(false);
  };

  const handleDeleteField = async (fieldId: string) => {
    if (!confirm("Delete this custom field and all its values?")) return;

    const headers = await getAuthHeaders();
    if (!headers.Authorization) return;

    const res = await fetch(`/api/cellar/custom-fields/${fieldId}`, {
      method: "DELETE",
      headers,
    });

    if (!res.ok) {
      console.error("Failed to delete custom field", res.status);
      return;
    }

    setCustomFields((prev) => prev.filter((f) => f.id !== fieldId));
    setCustomValues((prev) => {
      const next = new Map(prev);
      for (const key of next.keys()) {
        if (key.endsWith(`:${fieldId}`)) next.delete(key);
      }
      return next;
    });
  };

  const renderCell = (entry: CellarEntry, col: (typeof COLUMNS)[number]) => {
    const isEditing = editing?.entryId === entry.id && editing?.field === col.key;
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

  const renderCustomCell = (entry: CellarEntry, fieldDef: CustomFieldDef) => {
    const isEditing = editing?.entryId === entry.id && editing?.field === fieldDef.id;
    const value = customValues.get(`${entry.id}:${fieldDef.id}`) ?? "";

    if (isEditing) {
      return (
        <input
          ref={(el) => { inputRef.current = el; }}
          type={fieldDef.field_type === "date" ? "date" : fieldDef.field_type === "number" ? "number" : "text"}
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
        onClick={() => startEditing(entry.id, fieldDef.id, value || null)}
        title={value || undefined}
      >
        {value || "--"}
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
            {customFields.map((cf) => (
              <th
                key={cf.id}
                className="group select-none px-3 py-2.5 text-left"
                style={{
                  fontSize: 9,
                  fontWeight: 700,
                  textTransform: "uppercase",
                  letterSpacing: "2px",
                  color: "var(--color-text-tertiary)",
                  whiteSpace: "nowrap",
                }}
              >
                <span className="flex items-center gap-1">
                  {cf.field_name}
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDeleteField(cf.id);
                    }}
                    className="ml-1 hidden text-[10px] text-[var(--color-text-tertiary)] opacity-60 transition hover:text-red-500 hover:opacity-100 group-hover:inline-block"
                    title="Delete field"
                  >
                    x
                  </button>
                </span>
              </th>
            ))}
            <th
              className="px-3 py-2.5 text-left"
              style={{
                fontSize: 9,
                fontWeight: 700,
                color: "var(--color-text-tertiary)",
                whiteSpace: "nowrap",
              }}
            >
              {showAddField ? (
                <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                  <input
                    ref={addFieldRef}
                    type="text"
                    placeholder="Field name"
                    value={newFieldName}
                    onChange={(e) => setNewFieldName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleAddField();
                      if (e.key === "Escape") setShowAddField(false);
                    }}
                    className="rounded bg-transparent text-[10px] text-[var(--color-text-primary)] focus:outline-none"
                    style={{
                      border: "1px solid var(--color-accent-primary)",
                      padding: "2px 4px",
                      width: 80,
                      textTransform: "none",
                      letterSpacing: "normal",
                      fontWeight: 400,
                    }}
                  />
                  <select
                    value={newFieldType}
                    onChange={(e) => setNewFieldType(e.target.value as CustomFieldDef["field_type"])}
                    className="rounded bg-transparent text-[10px] text-[var(--color-text-primary)] focus:outline-none"
                    style={{
                      border: "1px solid var(--color-border)",
                      padding: "2px 2px",
                      textTransform: "none",
                      letterSpacing: "normal",
                      fontWeight: 400,
                    }}
                  >
                    {FIELD_TYPE_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    onClick={handleAddField}
                    className="rounded px-1.5 py-0.5 text-[10px] text-[var(--color-accent-primary)] transition hover:bg-[var(--color-surface-hover)]"
                    style={{ textTransform: "none", letterSpacing: "normal", fontWeight: 600 }}
                  >
                    Add
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowAddField(false)}
                    className="text-[10px] text-[var(--color-text-tertiary)] transition hover:text-[var(--color-text-primary)]"
                    style={{ textTransform: "none", letterSpacing: "normal", fontWeight: 400 }}
                  >
                    Cancel
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    setShowAddField(true);
                    setTimeout(() => addFieldRef.current?.focus(), 0);
                  }}
                  className="flex h-5 w-5 items-center justify-center rounded text-sm text-[var(--color-text-tertiary)] transition hover:bg-[var(--color-surface-hover)] hover:text-[var(--color-text-primary)]"
                  title="Add custom field"
                >
                  +
                </button>
              )}
            </th>
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
              {customFields.map((cf) => (
                <td key={cf.id} className="px-3 py-2" style={{ maxWidth: 140 }}>
                  {renderCustomCell(entry, cf)}
                </td>
              ))}
              {/* Empty cell for the "+" column */}
              <td className="px-3 py-2" />
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

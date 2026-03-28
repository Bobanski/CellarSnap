"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Papa from "papaparse";
import * as XLSX from "xlsx";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";

// ─── Constants ──────────────────────────────────────────────
const MAX_ROWS = 500;
const SAMPLE_ROW_COUNT = 4;

const TARGET_FIELDS = [
  { value: "wine_name", label: "Wine Name" },
  { value: "producer", label: "Producer" },
  { value: "vintage", label: "Vintage" },
  { value: "country", label: "Country" },
  { value: "region", label: "Region" },
  { value: "appellation", label: "Appellation" },
  { value: "wine_type", label: "Wine Type" },
  { value: "cellar_quantity", label: "Quantity" },
  { value: "bottle_format", label: "Bottle Format" },
  { value: "varietal", label: "Varietal" },
  { value: "classification", label: "Classification" },
  { value: "price_paid", label: "Price Paid" },
  { value: "notes", label: "Notes" },
] as const;

type MappingValue = {
  target: string; // one of TARGET_FIELDS values, "__custom__", or "__skip__"
  customName?: string;
};

// ─── Shared styles ──────────────────────────────────────────
const inputClass =
  "w-full rounded-xl border border-[var(--color-border-strong)] bg-[var(--color-surface-raised)] px-4 py-2.5 text-sm text-[var(--color-text-primary)] outline-none focus:border-[var(--color-accent-primary)] transition-colors";

const labelClass =
  "block text-[9px] font-bold uppercase tracking-[2px] text-[var(--color-text-tertiary)] mb-1.5";

// ─── Helpers ────────────────────────────────────────────────
async function getSession() {
  const supabase = createSupabaseBrowserClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  return session;
}

function parseCSV(file: File): Promise<{ headers: string[]; rows: string[][] }> {
  return new Promise((resolve, reject) => {
    Papa.parse(file, {
      complete: (result) => {
        const data = result.data as string[][];
        if (data.length < 2) {
          reject(new Error("File must have a header row and at least one data row."));
          return;
        }
        const headers = data[0];
        const rows = data.slice(1).filter((row) => row.some((cell) => cell?.trim()));
        resolve({ headers, rows });
      },
      error: (err) => reject(new Error(err.message)),
    });
  });
}

function parseExcel(file: File): Promise<{ headers: string[]; rows: string[][] }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = e.target?.result;
        const workbook = XLSX.read(data, { type: "array" });
        const sheetName = workbook.SheetNames[0];
        const sheet = workbook.Sheets[sheetName];
        const json: string[][] = XLSX.utils.sheet_to_json(sheet, {
          header: 1,
          defval: "",
          raw: false,
        });
        if (json.length < 2) {
          reject(new Error("File must have a header row and at least one data row."));
          return;
        }
        const headers = json[0].map((h) => String(h));
        const rows = json
          .slice(1)
          .filter((row) => row.some((cell) => String(cell).trim()));
        resolve({
          headers,
          rows: rows.map((row) => row.map((cell) => String(cell))),
        });
      } catch {
        reject(new Error("Unable to read the Excel file."));
      }
    };
    reader.onerror = () => reject(new Error("Failed to read file."));
    reader.readAsArrayBuffer(file);
  });
}

// ─── Main page ──────────────────────────────────────────────
export default function CellarUploadPage() {
  const router = useRouter();
  const [step, setStep] = useState(1);

  // Step 1 state
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<string[][]>([]);
  const [fileName, setFileName] = useState<string | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Step 2 state
  const [mappings, setMappings] = useState<Record<string, MappingValue>>({});
  const [garbageColumns, setGarbageColumns] = useState<Set<string>>(new Set());
  const [mappingLoading, setMappingLoading] = useState(false);
  const [mappingError, setMappingError] = useState<string | null>(null);

  // Step 3 state
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<{
    imported: number;
    duplicates: number;
    grapes_matched: number;
    custom_fields_created: number;
    custom_field_names?: string[];
    errors: string[];
  } | null>(null);
  const [importError, setImportError] = useState<string | null>(null);

  // ─── File handling ──────────────────────────────────────────
  const handleFile = useCallback(async (file: File) => {
    setParseError(null);
    setFileName(file.name);

    const ext = file.name.split(".").pop()?.toLowerCase();
    try {
      let result: { headers: string[]; rows: string[][] };
      if (ext === "csv") {
        result = await parseCSV(file);
      } else if (ext === "xlsx" || ext === "xls") {
        result = await parseExcel(file);
      } else {
        setParseError("Unsupported file type. Please upload a .csv, .xlsx, or .xls file.");
        return;
      }

      if (result.rows.length > MAX_ROWS) {
        setParseError(
          `File has ${result.rows.length} data rows, which exceeds the maximum of ${MAX_ROWS}. Please reduce the number of rows and try again.`
        );
        return;
      }

      setHeaders(result.headers);
      setRows(result.rows);
    } catch (err) {
      setParseError(err instanceof Error ? err.message : "Failed to parse file.");
    }
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragOver(false);
      const file = e.dataTransfer.files[0];
      if (file) handleFile(file);
    },
    [handleFile]
  );

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  }, []);

  const handleDragLeave = useCallback(() => {
    setIsDragOver(false);
  }, []);

  const handleFileInput = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) handleFile(file);
    },
    [handleFile]
  );

  // ─── Step 2: Fetch column mappings ─────────────────────────
  const fetchMappings = useCallback(async () => {
    setMappingLoading(true);
    setMappingError(null);
    try {
      const session = await getSession();
      if (!session) {
        setMappingError("You must be logged in.");
        return;
      }

      const sampleRows = rows.slice(0, SAMPLE_ROW_COUNT);
      const res = await fetch("/api/cellar/map-columns", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ headers, sample_rows: sampleRows }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error || `Failed to map columns (${res.status})`);
      }

      const data = await res.json();
      const gpMappings: Record<string, MappingValue> = {};
      for (const header of headers) {
        const suggestion = data.mappings?.[header];
        if (suggestion?.target && suggestion.target !== "skip") {
          // Check if it's a known target field
          const isKnown = TARGET_FIELDS.some((f) => f.value === suggestion.target);
          if (isKnown) {
            gpMappings[header] = { target: suggestion.target };
          } else {
            // Treat as custom field — default name to the CSV header
            gpMappings[header] = {
              target: "__custom__",
              customName: header,
            };
          }
        } else {
          gpMappings[header] = { target: "__skip__" };
        }
      }
      // Detect garbage columns: empty data in sample rows or nonsensical header names
      const garbageHeaders = new Set<string>();
      const sampledRows = rows.slice(0, SAMPLE_ROW_COUNT);

      headers.forEach((header, idx) => {
        const headerTrimmed = header.trim();

        // Check 1: header is empty or very short single char (like "A", "B")
        if (!headerTrimmed || (headerTrimmed.length === 1 && !/[a-zA-Z]/.test(headerTrimmed))) {
          garbageHeaders.add(header);
          return;
        }

        // Check 2: header looks like a cell reference or ID (e.g., "Column1", "Unnamed: 0", "__EMPTY")
        if (/^(column\s*\d+|unnamed|__empty|field\d+|var\d+|col\d+)$/i.test(headerTrimmed)) {
          garbageHeaders.add(header);
          return;
        }

        // Check 3: most sample rows have empty/null values for this column
        const emptyCount = sampledRows.filter((row) => {
          const val = row[idx]?.trim();
          return !val || val === "null" || val === "N/A" || val === "n/a" || val === "-";
        }).length;
        if (emptyCount >= Math.max(2, sampledRows.length - 1)) {
          garbageHeaders.add(header);
          return;
        }

        // Check 4: header is excessively long (likely a data row leaked into headers)
        if (headerTrimmed.length > 60) {
          garbageHeaders.add(header);
        }
      });

      // Default garbage columns to skip
      for (const header of garbageHeaders) {
        gpMappings[header] = { target: "__skip__" };
      }

      // Sort: active mappings first, garbage/skipped at the bottom
      setGarbageColumns(garbageHeaders);
      setMappings(gpMappings);
    } catch (err) {
      setMappingError(err instanceof Error ? err.message : "Failed to map columns.");
    } finally {
      setMappingLoading(false);
    }
  }, [headers, rows]);

  // Enter step 2: fetch mappings
  useEffect(() => {
    if (step === 2) {
      fetchMappings();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step]);

  // ─── Step 3: Import ────────────────────────────────────────
  const handleImport = useCallback(async () => {
    setImporting(true);
    setImportError(null);
    try {
      const session = await getSession();
      if (!session) {
        setImportError("You must be logged in.");
        return;
      }

      // Build the mappings payload in the format the API expects
      const apiMappings: Record<string, { target: string; field_type?: string }> = {};
      let customCounter = 0;
      for (const header of headers) {
        const mapping = mappings[header];
        if (!mapping || mapping.target === "__skip__") continue;
        if (mapping.target === "__custom__") {
          customCounter++;
          const name = (mapping.customName || "").trim() || header.trim() || `Custom ${customCounter}`;
          apiMappings[header] = {
            target: name,
            field_type: "custom",
          };
        } else {
          apiMappings[header] = { target: mapping.target };
        }
      }

      const res = await fetch("/api/cellar/import", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          mappings: apiMappings,
          headers,
          rows,
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error || `Import failed (${res.status})`);
      }

      const result = await res.json();
      setImportResult(result);
    } catch (err) {
      setImportError(err instanceof Error ? err.message : "Import failed.");
    } finally {
      setImporting(false);
    }
  }, [headers, rows, mappings]);

  // ─── Progress bar ──────────────────────────────────────────
  const progress = (step / 3) * 100;

  return (
    <div className="flex min-h-screen flex-col items-center px-4 py-10">
      <div className="w-full max-w-2xl">
        {/* Back link */}
        <Link
          href="/entries"
          className="mb-6 inline-flex items-center gap-1 text-xs text-[var(--color-text-tertiary)] hover:text-[var(--color-text-secondary)] transition-colors"
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M19 12H5" />
            <path d="m12 19-7-7 7-7" />
          </svg>
          Back to cellar
        </Link>

        {/* Header */}
        <div className="mb-6">
          <p className="text-[9px] font-bold uppercase tracking-[2px] text-[var(--color-text-tertiary)]">
            Cellar
          </p>
          <h1
            className="mt-1 text-2xl font-normal text-[var(--color-text-primary)]"
            style={{ fontFamily: "var(--font-serif)" }}
          >
            Import from CSV / Excel
          </h1>
        </div>

        {/* Progress bar */}
        <div className="mb-8 space-y-2">
          <div className="h-[3px] rounded-full bg-[var(--color-surface-raised)] overflow-hidden">
            <div
              className="h-full rounded-full bg-[var(--color-accent-secondary)] transition-all duration-300"
              style={{ width: `${progress}%` }}
            />
          </div>
          <p className="text-[11px] font-semibold tracking-[1px] uppercase text-[var(--color-text-tertiary)]">
            Step {step} of 3
          </p>
        </div>

        {/* Step content */}
        {step === 1 && (
          <StepUpload
            isDragOver={isDragOver}
            onDrop={handleDrop}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onFileInput={handleFileInput}
            fileInputRef={fileInputRef}
            fileName={fileName}
            headers={headers}
            rows={rows}
            parseError={parseError}
            onNext={() => setStep(2)}
            onClearFile={() => {
              setFileName(null);
              setHeaders([]);
              setRows([]);
              setParseError(null);
              if (fileInputRef.current) fileInputRef.current.value = "";
            }}
          />
        )}

        {step === 2 && (
          <StepMapping
            headers={headers}
            rows={rows}
            mappings={mappings}
            setMappings={setMappings}
            garbageColumns={garbageColumns}
            loading={mappingLoading}
            error={mappingError}
            onBack={() => setStep(1)}
            onImport={() => {
              setStep(3);
              handleImport();
            }}
          />
        )}

        {step === 3 && (
          <StepResults
            importing={importing}
            result={importResult}
            error={importError}
            onGoToCellar={() => router.push("/entries")}
          />
        )}
      </div>
    </div>
  );
}

// ─── Step 1: File Upload ────────────────────────────────────
function StepUpload({
  isDragOver,
  onDrop,
  onDragOver,
  onDragLeave,
  onFileInput,
  fileInputRef,
  fileName,
  headers,
  rows,
  parseError,
  onNext,
  onClearFile,
}: {
  isDragOver: boolean;
  onDrop: (e: React.DragEvent) => void;
  onDragOver: (e: React.DragEvent) => void;
  onDragLeave: () => void;
  onFileInput: (e: React.ChangeEvent<HTMLInputElement>) => void;
  fileInputRef: React.RefObject<HTMLInputElement | null>;
  fileName: string | null;
  headers: string[];
  rows: string[][];
  parseError: string | null;
  onNext: () => void;
  onClearFile: () => void;
}) {
  const hasData = headers.length > 0 && rows.length > 0;

  return (
    <div className="flex flex-col gap-5">
      {/* Drag-and-drop zone */}
      <div
        onDrop={onDrop}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onClick={() => !hasData && fileInputRef.current?.click()}
        className={`flex cursor-pointer flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed p-10 transition-colors ${
          isDragOver
            ? "border-[var(--color-accent-primary)] bg-[var(--color-accent-primary)]/10"
            : hasData
              ? "border-[var(--color-accent-primary)]/30 bg-[var(--color-accent-primary)]/5"
              : "border-[var(--color-border)] bg-[var(--color-surface-tinted)] hover:border-[var(--color-accent-primary)]"
        }`}
      >
        {/* Upload icon */}
        <svg
          width="40"
          height="40"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="text-[var(--color-text-tertiary)]"
        >
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
          <polyline points="17 8 12 3 7 8" />
          <line x1="12" y1="3" x2="12" y2="15" />
        </svg>
        <div className="text-center">
          <p className="text-sm font-semibold text-[var(--color-text-primary)]">
            {fileName ? fileName : "Drop your file here"}
          </p>
          <p className="mt-1 text-xs text-[var(--color-text-tertiary)]">
            or click to browse -- .csv, .xlsx, .xls
          </p>
        </div>
        <input
          ref={fileInputRef}
          type="file"
          accept=".csv,.xlsx,.xls"
          onChange={onFileInput}
          className="hidden"
        />
      </div>

      {/* Error */}
      {parseError && (
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">
          {parseError}
        </div>
      )}

      {/* Preview */}
      {hasData && (
        <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface-tinted)] p-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-sm text-[var(--color-text-primary)]">
                Found{" "}
                <span className="font-bold text-[var(--color-accent-secondary)]">
                  {rows.length}
                </span>{" "}
                rows with{" "}
                <span className="font-bold text-[var(--color-accent-secondary)]">
                  {headers.length}
                </span>{" "}
                columns
              </p>
              <p className="mt-1 text-xs text-[var(--color-text-tertiary)]">
                Columns: {headers.join(", ")}
              </p>
            </div>
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); onClearFile(); }}
              className="shrink-0 text-xs font-semibold text-[var(--color-text-tertiary)] hover:text-[var(--color-error)] transition cursor-pointer"
            >
              Clear file
            </button>
          </div>
        </div>
      )}

      {/* Next */}
      <button
        type="button"
        onClick={onNext}
        disabled={!hasData}
        className={`mt-2 rounded-xl py-3.5 text-sm font-bold transition-colors ${
          hasData
            ? "bg-[var(--color-accent-primary)] text-[var(--color-text-on-accent)] hover:bg-[var(--color-accent-hover)] cursor-pointer"
            : "bg-[var(--color-accent-primary)] text-[var(--color-text-on-accent)] opacity-50 cursor-not-allowed"
        }`}
      >
        Next
      </button>
    </div>
  );
}

// ─── Step 2: Column Mapping ─────────────────────────────────
function StepMapping({
  headers,
  rows,
  mappings,
  setMappings,
  loading,
  error,
  onBack,
  onImport,
}: {
  headers: string[];
  rows: string[][];
  mappings: Record<string, MappingValue>;
  setMappings: React.Dispatch<React.SetStateAction<Record<string, MappingValue>>>;
  garbageColumns: Set<string>;
  loading: boolean;
  error: string | null;
  onBack: () => void;
  onImport: () => void;
}) {
  const updateMapping = (header: string, target: string) => {
    setMappings((prev) => ({
      ...prev,
      [header]: {
        target,
        customName: target === "__custom__" ? (prev[header]?.customName || header) : undefined,
      },
    }));
  };

  const updateCustomName = (header: string, name: string) => {
    setMappings((prev) => ({
      ...prev,
      [header]: { ...prev[header], target: "__custom__", customName: name },
    }));
  };

  // Check that at least one column is mapped to a real field
  const hasMappedColumn = Object.values(mappings).some(
    (m) => m.target !== "__skip__"
  );

  if (loading) {
    return (
      <div className="flex flex-col items-center gap-4 py-16">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-[var(--color-accent-secondary)] border-t-transparent" />
        <p className="text-sm text-[var(--color-text-secondary)]">
          Analyzing your columns...
        </p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col gap-4">
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">
          {error}
        </div>
        <button
          type="button"
          onClick={onBack}
          className="rounded-xl border border-[var(--color-border-strong)] bg-[var(--color-surface-tinted)] py-3 text-sm font-bold text-[var(--color-text-primary)] hover:bg-[var(--color-surface-hover)] transition-colors cursor-pointer"
        >
          Back
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="space-y-1.5">
        <h2
          className="text-xl font-normal text-[var(--color-text-primary)]"
          style={{ fontFamily: "var(--font-serif)" }}
        >
          Map your columns
        </h2>
        <p className="text-sm text-[var(--color-text-secondary)]">
          We&apos;ve suggested mappings based on your data. Adjust as needed.
        </p>
      </div>

      {/* Mapping rows */}
      <div className="flex flex-col gap-3">
        {[...headers]
          .map((header, originalIdx) => ({ header, originalIdx }))
          .sort((a, b) => {
            // Active columns first, garbage/skipped at the bottom
            const aSkipped = (mappings[a.header]?.target ?? "__skip__") === "__skip__";
            const bSkipped = (mappings[b.header]?.target ?? "__skip__") === "__skip__";
            if (aSkipped !== bSkipped) return aSkipped ? 1 : -1;
            return a.originalIdx - b.originalIdx;
          })
          .map(({ header, originalIdx: headerIdx }) => {
          const mapping = mappings[header] || { target: "__skip__" };
          const sampleValue = rows[0]?.[headerIdx] || "";
          const isSkipped = mapping.target === "__skip__";

          return (
            <div
              key={`${headerIdx}-${header}`}
              className={`rounded-xl border p-4 transition-opacity ${
                isSkipped
                  ? "border-[var(--color-border)]/50 bg-[var(--color-surface-tinted)]/50 opacity-50"
                  : "border-[var(--color-border)] bg-[var(--color-surface-tinted)]"
              }`}
            >
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:gap-4">
                {/* Left: CSV column info */}
                <div className="flex-1 min-w-0">
                  <p className={labelClass}>CSV Column</p>
                  <p className="text-sm font-semibold text-[var(--color-text-primary)] truncate">
                    {header}
                  </p>
                  {sampleValue && (
                    <p className="mt-0.5 text-xs text-[var(--color-text-tertiary)] truncate">
                      e.g. &quot;{sampleValue}&quot;
                    </p>
                  )}
                </div>

                {/* Right: Target dropdown */}
                <div className="flex-1 min-w-0">
                  <p className={labelClass}>Maps to</p>
                  <select
                    value={mapping.target}
                    onChange={(e) => updateMapping(header, e.target.value)}
                    className={inputClass}
                  >
                    <option value="__skip__">-- Don&apos;t import --</option>
                    <optgroup label="Standard fields">
                      {TARGET_FIELDS.map((field) => (
                        <option key={field.value} value={field.value}>
                          {field.label}
                        </option>
                      ))}
                    </optgroup>
                    <optgroup label="Other">
                      <option value="__custom__">Custom field</option>
                    </optgroup>
                  </select>

                  {/* Custom field name input */}
                  {mapping.target === "__custom__" && (
                    <div className="mt-2">
                      <span className={labelClass}>Custom field name</span>
                      <input
                        type="text"
                        value={mapping.customName || ""}
                        onChange={(e) => updateCustomName(header, e.target.value)}
                        placeholder="Custom name"
                        className={inputClass}
                      />
                    </div>
                  )}
                </div>
              </div>
              {!isSkipped && (
                <button
                  type="button"
                  onClick={() => updateMapping(header, "__skip__")}
                  className="mt-2 text-[11px] font-bold text-[var(--color-text-secondary)] hover:text-[var(--color-error)] transition cursor-pointer"
                >
                  Don&apos;t import this column
                </button>
              )}
              {isSkipped && (
                <button
                  type="button"
                  onClick={() => updateMapping(header, "__custom__")}
                  className="mt-2 text-[11px] font-bold text-[var(--color-accent-secondary)] hover:text-[var(--color-text-primary)] transition cursor-pointer"
                >
                  Include this column
                </button>
              )}
            </div>
          );
        })}
      </div>

      {/* Navigation */}
      <div className="flex gap-3 mt-2">
        <button
          type="button"
          onClick={onBack}
          className="flex-1 rounded-xl border border-[var(--color-border-strong)] bg-[var(--color-surface-tinted)] py-3.5 text-sm font-bold text-[var(--color-text-primary)] hover:bg-[var(--color-surface-hover)] transition-colors cursor-pointer"
        >
          Back
        </button>
        <button
          type="button"
          onClick={onImport}
          disabled={!hasMappedColumn}
          className={`flex-[2] rounded-xl py-3.5 text-sm font-bold transition-colors ${
            hasMappedColumn
              ? "bg-[var(--color-accent-primary)] text-[var(--color-text-on-accent)] hover:bg-[var(--color-accent-hover)] cursor-pointer"
              : "bg-[var(--color-accent-primary)] text-[var(--color-text-on-accent)] opacity-50 cursor-not-allowed"
          }`}
        >
          Import
        </button>
      </div>
    </div>
  );
}

// ─── Step 3: Results ────────────────────────────────────────
function StepResults({
  importing,
  result,
  error,
  onGoToCellar,
}: {
  importing: boolean;
  result: {
    imported: number;
    duplicates: number;
    grapes_matched: number;
    custom_fields_created: number;
    custom_field_names?: string[];
    errors: string[];
  } | null;
  error: string | null;
  onGoToCellar: () => void;
}) {
  if (importing) {
    return (
      <div className="flex flex-col items-center gap-4 py-16">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-[var(--color-accent-secondary)] border-t-transparent" />
        <p className="text-sm text-[var(--color-text-secondary)]">
          Importing your wines...
        </p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col gap-4">
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">
          {error}
        </div>
        <button
          type="button"
          onClick={onGoToCellar}
          className="rounded-xl border border-[var(--color-border-strong)] bg-[var(--color-surface-tinted)] py-3 text-sm font-bold text-[var(--color-text-primary)] hover:bg-[var(--color-surface-hover)] transition-colors cursor-pointer"
        >
          Go to cellar
        </button>
      </div>
    );
  }

  if (!result) return null;

  return (
    <div className="flex flex-col gap-5">
      <div className="space-y-1.5">
        <h2
          className="text-xl font-normal text-[var(--color-text-primary)]"
          style={{ fontFamily: "var(--font-serif)" }}
        >
          Import complete
        </h2>
      </div>

      <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface-tinted)] p-5 space-y-4">
        {/* Imported count */}
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-green-500/20">
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="text-green-400"
            >
              <polyline points="20 6 9 17 4 12" />
            </svg>
          </div>
          <p className="text-sm text-[var(--color-text-primary)]">
            Imported{" "}
            <span className="font-bold text-[var(--color-accent-secondary)]">
              {result.imported}
            </span>{" "}
            wines to your cellar
          </p>
        </div>

        {/* Duplicates */}
        {result.duplicates > 0 && (
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-yellow-500/20">
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="text-yellow-400"
              >
                <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                <line x1="12" y1="9" x2="12" y2="13" />
                <line x1="12" y1="17" x2="12.01" y2="17" />
              </svg>
            </div>
            <p className="text-sm text-[var(--color-text-primary)]">
              <span className="font-bold">{result.duplicates}</span> duplicates
              detected (imported anyway)
            </p>
          </div>
        )}

        {/* Grapes matched */}
        {result.grapes_matched > 0 && (
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[var(--color-accent-primary)]/20">
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="text-[var(--color-accent-secondary)]"
              >
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
              </svg>
            </div>
            <p className="text-sm text-[var(--color-text-primary)]">
              <span className="font-bold">{result.grapes_matched}</span> grapes
              matched to our database
            </p>
          </div>
        )}

        {/* Custom fields */}
        {result.custom_fields_created > 0 && (
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-blue-500/20">
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="text-blue-400"
              >
                <line x1="12" y1="5" x2="12" y2="19" />
                <line x1="5" y1="12" x2="19" y2="12" />
              </svg>
            </div>
            <p className="text-sm text-[var(--color-text-primary)]">
              <span className="font-bold">{result.custom_fields_created}</span>{" "}
              custom fields created
              {result.custom_field_names && result.custom_field_names.length > 0 && (
                <span className="text-[var(--color-text-tertiary)]">
                  {" "}
                  ({result.custom_field_names.join(", ")})
                </span>
              )}
            </p>
          </div>
        )}

        {/* Errors */}
        {result.errors.length > 0 && (
          <div className="mt-2 space-y-1">
            <p className={labelClass}>Errors</p>
            {result.errors.map((err, i) => (
              <p key={i} className="text-xs text-red-400">
                {err}
              </p>
            ))}
          </div>
        )}
      </div>

      {/* Go to cellar */}
      <button
        type="button"
        onClick={onGoToCellar}
        className="mt-2 rounded-xl bg-[var(--color-accent-primary)] py-3.5 text-sm font-bold text-[var(--color-text-on-accent)] hover:bg-[var(--color-accent-hover)] transition-colors cursor-pointer"
      >
        Go to cellar
      </button>
    </div>
  );
}

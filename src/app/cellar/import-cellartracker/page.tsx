"use client";

import { useState } from "react";
import Link from "next/link";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";

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

type ImportTab = "direct" | "manual";

type ImportResult = {
  imported: number;
  tasting_notes: number;
  duplicates: number;
  grapes_matched: number;
  custom_fields_created: number;
  custom_field_names?: string[];
};

// ─── Main page ──────────────────────────────────────────────
export default function ImportCellarTrackerPage() {
  const [activeTab, setActiveTab] = useState<ImportTab>("direct");

  // Direct import state
  const [ctUsername, setCtUsername] = useState("");
  const [ctPassword, setCtPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loadingMessage, setLoadingMessage] = useState("");
  const [result, setResult] = useState<ImportResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleImport = async () => {
    if (!ctUsername.trim() || !ctPassword.trim()) return;

    setLoading(true);
    setError(null);
    setResult(null);
    setLoadingMessage("Connecting to CellarTracker...");

    try {
      const session = await getSession();
      if (!session) {
        setError("You must be logged in to import.");
        setLoading(false);
        return;
      }

      // Brief delay to show the connecting message
      await new Promise((r) => setTimeout(r, 800));
      setLoadingMessage("Importing your wines...");

      const res = await fetch("/api/cellar/import-cellartracker", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          ct_username: ctUsername.trim(),
          ct_password: ctPassword,
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(
          data?.error || `Import failed (${res.status})`
        );
      }

      const data: ImportResult = await res.json();
      setResult(data);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Something went wrong. Please try again."
      );
    } finally {
      setLoading(false);
      setLoadingMessage("");
    }
  };

  const handleReset = () => {
    setError(null);
    setResult(null);
    setCtPassword("");
  };

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
            Import from CellarTracker
          </h1>
        </div>

        {/* Tab toggle */}
        <div className="mb-8 flex items-center justify-center gap-2">
          {(["direct", "manual"] as const).map((tab) => (
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
              {tab === "direct" ? "Direct Import" : "Manual Export"}
            </button>
          ))}
        </div>

        {/* Tab content */}
        {activeTab === "direct" ? (
          <DirectImportTab
            ctUsername={ctUsername}
            setCtUsername={setCtUsername}
            ctPassword={ctPassword}
            setCtPassword={setCtPassword}
            showPassword={showPassword}
            setShowPassword={setShowPassword}
            loading={loading}
            loadingMessage={loadingMessage}
            result={result}
            error={error}
            onImport={handleImport}
            onReset={handleReset}
            onSwitchTab={() => setActiveTab("manual")}
          />
        ) : (
          <ManualExportTab />
        )}
      </div>
    </div>
  );
}

// ─── Direct Import Tab ──────────────────────────────────────
function DirectImportTab({
  ctUsername,
  setCtUsername,
  ctPassword,
  setCtPassword,
  showPassword,
  setShowPassword,
  loading,
  loadingMessage,
  result,
  error,
  onImport,
  onReset,
  onSwitchTab,
}: {
  ctUsername: string;
  setCtUsername: (v: string) => void;
  ctPassword: string;
  setCtPassword: (v: string) => void;
  showPassword: boolean;
  setShowPassword: (v: boolean) => void;
  loading: boolean;
  loadingMessage: string;
  result: ImportResult | null;
  error: string | null;
  onImport: () => void;
  onReset: () => void;
  onSwitchTab: () => void;
}) {
  // ─── Loading state ─────────────────────────────
  if (loading) {
    return (
      <div className="flex flex-col items-center gap-4 py-16">
        {/* Spinner */}
        <div
          className="h-8 w-8 animate-spin rounded-full border-2 border-[var(--color-border-strong)] border-t-[var(--color-accent-primary)]"
        />
        <p className="text-sm text-[var(--color-text-secondary)]">
          {loadingMessage}
        </p>
      </div>
    );
  }

  // ─── Success state ─────────────────────────────
  if (result) {
    return (
      <div className="space-y-4">
        <div
          className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-raised)] p-6"
        >
          <h2
            className="mb-4 text-lg font-normal text-[var(--color-text-primary)]"
            style={{ fontFamily: "var(--font-serif)" }}
          >
            Import Complete
          </h2>
          <ul className="space-y-2 text-sm text-[var(--color-text-secondary)]">
            <li>Imported <strong className="text-[var(--color-text-primary)]">{result.imported}</strong> wines to your cellar</li>
            <li>Imported <strong className="text-[var(--color-text-primary)]">{result.tasting_notes}</strong> tasting notes</li>
            <li><strong className="text-[var(--color-text-primary)]">{result.duplicates}</strong> duplicates detected</li>
            <li><strong className="text-[var(--color-text-primary)]">{result.grapes_matched}</strong> grapes matched</li>
            <li><strong className="text-[var(--color-text-primary)]">{result.custom_fields_created}</strong> custom fields created</li>
          </ul>
        </div>
        <div className="flex justify-center">
          <Link
            href="/entries"
            className="rounded-xl bg-[var(--color-accent-primary)] px-6 py-2.5 text-sm font-semibold text-[var(--color-text-on-accent)] transition hover:bg-[var(--color-accent-hover)]"
          >
            Go to cellar
          </Link>
        </div>
      </div>
    );
  }

  // ─── Error state ───────────────────────────────
  if (error) {
    return (
      <div className="space-y-4">
        <div
          className="rounded-xl border border-red-500/30 bg-red-500/10 p-6"
        >
          <p className="text-sm text-red-400">{error}</p>
        </div>
        <div className="flex flex-wrap justify-center gap-3">
          <button
            type="button"
            onClick={onReset}
            className="rounded-xl bg-[var(--color-accent-primary)] px-5 py-2 text-sm font-semibold text-[var(--color-text-on-accent)] transition hover:bg-[var(--color-accent-hover)] cursor-pointer"
          >
            Try again
          </button>
          <button
            type="button"
            onClick={onSwitchTab}
            className="rounded-xl border border-[var(--color-border-strong)] bg-[var(--color-surface-tinted)] px-5 py-2 text-sm font-semibold text-[var(--color-text-primary)] transition hover:border-[var(--color-accent-primary)] cursor-pointer"
          >
            Export manually instead
          </button>
        </div>
      </div>
    );
  }

  // ─── Form state ────────────────────────────────
  return (
    <div className="space-y-6">
      {/* Username */}
      <div>
        <label htmlFor="ct-username" className={labelClass}>
          CellarTracker Username
        </label>
        <input
          id="ct-username"
          type="text"
          autoComplete="off"
          value={ctUsername}
          onChange={(e) => setCtUsername(e.target.value)}
          className={inputClass}
          placeholder="Your CellarTracker username"
        />
      </div>

      {/* Password */}
      <div>
        <label htmlFor="ct-password" className={labelClass}>
          CellarTracker Password
        </label>
        <div className="relative">
          <input
            id="ct-password"
            type={showPassword ? "text" : "password"}
            autoComplete="off"
            data-1p-ignore
            value={ctPassword}
            onChange={(e) => setCtPassword(e.target.value)}
            className={inputClass}
            style={{ paddingRight: 44 }}
            placeholder="Your CellarTracker password"
          />
          <button
            type="button"
            onClick={() => setShowPassword(!showPassword)}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--color-text-tertiary)] hover:text-[var(--color-text-secondary)] transition-colors cursor-pointer"
            aria-label={showPassword ? "Hide password" : "Show password"}
          >
            {showPassword ? (
              // Eye-off icon
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" />
                <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" />
                <path d="M14.12 14.12a3 3 0 1 1-4.24-4.24" />
                <line x1="1" y1="1" x2="23" y2="23" />
              </svg>
            ) : (
              // Eye icon
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                <circle cx="12" cy="12" r="3" />
              </svg>
            )}
          </button>
        </div>
      </div>

      {/* Privacy notice */}
      <p className="text-xs text-[var(--color-text-tertiary)] leading-relaxed">
        Your CellarTracker credentials are used once to fetch your data and are never stored.
        We do not save your password.
      </p>

      {/* Import button */}
      <button
        type="button"
        onClick={onImport}
        disabled={!ctUsername.trim() || !ctPassword.trim()}
        className="w-full rounded-xl bg-[var(--color-accent-primary)] px-5 py-3 text-sm font-semibold text-[var(--color-text-on-accent)] transition hover:bg-[var(--color-accent-hover)] disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
      >
        Import from CellarTracker
      </button>
    </div>
  );
}

// ─── Manual Export Tab ──────────────────────────────────────
function ManualExportTab() {
  const steps = [
    {
      number: 1,
      title: "Log in",
      description: "Go to cellartracker.com and log in to your account using your desktop browser.",
    },
    {
      number: 2,
      title: "Go to My Cellar",
      description: "Navigate to your cellar by clicking \"My Cellar\" in the top navigation.",
    },
    {
      number: 3,
      title: "Click Export",
      description: "Look for the \"Export\" link in the top right area of your cellar view.",
    },
    {
      number: 4,
      title: "Select CSV format",
      description: "Under \"Export Format\", select \"Comma Separated Values (CSV)\".",
    },
    {
      number: 5,
      title: "Choose your columns",
      description:
        "Under \"Select Columns\", include at minimum: Wine, Vintage, Quantity, Size, Locale, Country, Region, Type, Varietal, and Price.",
    },
    {
      number: 6,
      title: "Download the file",
      description: "Click \"Export\" to download the CSV file to your computer.",
    },
    {
      number: 7,
      title: "Upload here",
      description: "Come back to Cluster and upload the file using our CSV upload tool.",
    },
  ];

  return (
    <div className="space-y-6">
      {/* Steps */}
      <div className="space-y-4">
        {steps.map((step) => (
          <div
            key={step.number}
            className="flex gap-4 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-raised)] p-4"
          >
            <span
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold"
              style={{
                background: "rgba(196, 96, 122, 0.12)",
                color: "var(--color-accent-secondary)",
              }}
            >
              {step.number}
            </span>
            <div>
              <p className="text-sm font-semibold text-[var(--color-text-primary)]">
                {step.title}
              </p>
              <p className="mt-0.5 text-xs text-[var(--color-text-secondary)] leading-relaxed">
                {step.description}
              </p>
            </div>
          </div>
        ))}
      </div>

      {/* Tasting notes tip */}
      <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-tinted)] p-4">
        <p className="text-xs text-[var(--color-text-secondary)] leading-relaxed">
          For tasting notes, repeat the process but go to{" "}
          <strong className="text-[var(--color-text-primary)]">My Tasting Notes</strong>{" "}
          instead of My Cellar before exporting.
        </p>
      </div>

      {/* Upload link */}
      <div className="flex justify-center">
        <Link
          href="/cellar/upload"
          className="inline-flex items-center gap-2 rounded-xl border border-[var(--color-border-strong)] bg-[var(--color-surface-tinted)] px-5 py-2.5 text-sm font-semibold text-[var(--color-text-primary)] transition hover:border-[var(--color-accent-primary)]"
        >
          Upload your exported file
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
            <path d="M5 12h14" />
            <path d="m12 5 7 7-7 7" />
          </svg>
        </Link>
      </div>
    </div>
  );
}

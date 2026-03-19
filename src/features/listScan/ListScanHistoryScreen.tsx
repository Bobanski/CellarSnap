"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import NavBar from "@/components/NavBar";

type ListScanHistoryItem = {
  scan_id: string;
  source_type: "image" | "pdf" | "url";
  source_label: string | null;
  venue_name: string | null;
  list_title: string | null;
  overall_confidence: number | null;
  scanned_at: string;
  wine_count: number;
};

export default function ListScanHistoryScreen() {
  const [items, setItems] = useState<ListScanHistoryItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSignedOut, setIsSignedOut] = useState(false);
  const isMountedRef = useRef(true);

  useEffect(() => {
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const loadHistory = useCallback(async () => {
    setIsLoading(true);
    setErrorMessage(null);
    setIsSignedOut(false);

    let response: Response;
    try {
      response = await fetch("/api/list-scan/scans", {
        cache: "no-store",
      });
    } catch {
      // Network error (timeout, DNS failure, etc.)
      if (!isMountedRef.current) {
        return;
      }
      setErrorMessage("Unable to load saved scans. Please check your connection.");
      setItems([]);
      setIsLoading(false);
      return;
    }

    if (!isMountedRef.current) {
      return;
    }

    if (!response.ok) {
      if (response.status === 401) {
        setIsSignedOut(true);
        setErrorMessage("Sign in to revisit saved wine-list scans.");
      } else if (response.status >= 500) {
        setErrorMessage("Service error. Please try again in a moment.");
      } else {
        setErrorMessage("Unable to load saved scans right now.");
      }
      setItems([]);
      setIsLoading(false);
      return;
    }

    // Parse JSON separately
    let payload: { scans?: ListScanHistoryItem[]; error?: string } | undefined;
    try {
      payload = (await response.json()) as { scans?: ListScanHistoryItem[]; error?: string };
    } catch {
      if (!isMountedRef.current) {
        return;
      }
      setErrorMessage("Error reading scan data. Please refresh the page.");
      setItems([]);
      setIsLoading(false);
      return;
    }

    if (!isMountedRef.current) {
      return;
    }

    setItems(payload?.scans ?? []);
    setIsLoading(false);
  }, []);

  useEffect(() => {
    const timerId = window.setTimeout(() => {
      void loadHistory();
    }, 0);

    return () => {
      window.clearTimeout(timerId);
    };
  }, [loadHistory]);

  return (
    <div className="min-h-screen bg-[var(--color-screen-bg)] px-6 py-10 text-[var(--color-text-primary)]">
      <div className="mx-auto w-full max-w-6xl space-y-8">
        <NavBar />

        <header className="space-y-3">
          <span className="block text-xs uppercase tracking-[0.3em] text-[var(--color-accent-secondary)]/70">
            List scan
          </span>
          <h1 className="text-3xl font-semibold text-[var(--color-text-primary)]">My scans</h1>
          <p className="text-sm text-[var(--color-text-secondary)]">
            Revisit previously scanned wine lists across devices.
          </p>
          <Link
            href="/list-scan"
            className="inline-flex rounded-full bg-[var(--color-accent-primary)] px-4 py-2 text-sm font-semibold text-[var(--color-text-on-accent)] transition hover:bg-[var(--color-accent-primary)]"
          >
            Scan another
          </Link>
        </header>

        {isLoading ? (
          <section className="rounded-3xl border border-[var(--color-border)] bg-[var(--color-surface-primary)]/10 p-8 text-sm text-[var(--color-text-secondary)]">
            Loading saved scans...
          </section>
        ) : errorMessage ? (
          <section className="rounded-3xl border border-[var(--color-border)] bg-[var(--color-surface-primary)]/10 p-8 text-sm text-[var(--color-text-secondary)]">
            <p>{errorMessage}</p>
            <div className="mt-4">
              {isSignedOut ? (
                <Link
                  href="/login"
                  className="inline-flex rounded-full border border-[var(--color-border-strong)] px-4 py-2 text-sm font-semibold text-[var(--color-text-primary)] transition hover:border-[var(--color-accent-secondary)]/60 hover:text-[var(--color-accent-secondary)]"
                >
                  Sign in
                </Link>
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    void loadHistory();
                  }}
                  className="inline-flex rounded-full border border-[var(--color-border-strong)] px-4 py-2 text-sm font-semibold text-[var(--color-text-primary)] transition hover:border-[var(--color-accent-secondary)]/60 hover:text-[var(--color-accent-secondary)]"
                >
                  Try again
                </button>
              )}
            </div>
          </section>
        ) : items.length === 0 ? (
          <section className="rounded-3xl border border-[var(--color-border)] bg-[var(--color-surface-primary)]/10 p-8 text-sm text-[var(--color-text-secondary)]">
            <p>No saved scans yet. Scan a wine list while signed in and it will show up here.</p>
            <Link
              href="/list-scan"
              className="mt-4 inline-flex rounded-full border border-[var(--color-border-strong)] px-4 py-2 text-sm font-semibold text-[var(--color-text-primary)] transition hover:border-[var(--color-accent-secondary)]/60 hover:text-[var(--color-accent-secondary)]"
            >
              Scan your first list
            </Link>
          </section>
        ) : (
          <section className="grid gap-4 md:grid-cols-2">
            {items.map((item) => (
              <Link
                key={item.scan_id}
                href={`/list-scan/results?scanId=${encodeURIComponent(item.scan_id)}`}
                className="rounded-3xl border border-[var(--color-border)] bg-[var(--color-surface-primary)]/10 p-6 transition hover:border-[var(--color-accent-secondary)]/40 hover:bg-white/7"
              >
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--color-text-tertiary)]">
                  {item.source_type}
                </p>
                <h2 className="mt-3 text-xl font-semibold text-[var(--color-text-primary)]">
                  {item.venue_name || item.list_title || item.source_label || "Saved scan"}
                </h2>
                <p className="mt-2 text-sm text-[var(--color-text-secondary)]">
                  {item.wine_count} wine{item.wine_count === 1 ? "" : "s"} scanned
                  {typeof item.overall_confidence === "number"
                    ? `, ${item.overall_confidence}% confidence`
                    : ""}
                </p>
                <p className="mt-3 text-xs text-[var(--color-text-tertiary)]">
                  {new Date(item.scanned_at).toLocaleString()}
                </p>
              </Link>
            ))}
          </section>
        )}
      </div>
    </div>
  );
}

"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import AppShell from "@/components/AppShell";

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
  const searchParams = useSearchParams();
  const [items, setItems] = useState<ListScanHistoryItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSignedOut, setIsSignedOut] = useState(false);
  const [backToScanId, setBackToScanId] = useState<string | null>(null);
  const isMountedRef = useRef(true);
  // Snapshot current time once per data load so we avoid calling Date.now() during render
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const renderNow = useMemo(() => Date.now(), [items]);

  useEffect(() => {
    const timerId = window.setTimeout(() => {
      const fromScanId = searchParams.get("fromScanId");
      if (fromScanId) {
        setBackToScanId(fromScanId);
        return;
      }

      if (typeof window === "undefined" || !document.referrer) {
        setBackToScanId(null);
        return;
      }

      try {
        const referrer = new URL(document.referrer);
        if (
          referrer.origin === window.location.origin &&
          referrer.pathname === "/list-scan/results"
        ) {
          setBackToScanId(referrer.searchParams.get("scanId"));
          return;
        }
      } catch {
        // Ignore malformed referrer values.
      }

      setBackToScanId(null);
    }, 0);

    return () => {
      window.clearTimeout(timerId);
    };
  }, [searchParams]);

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
    <AppShell>
      <div className="px-6 py-6 text-[var(--color-text-primary)]">
      <div className="mx-auto w-full max-w-6xl space-y-8">

        <header className="space-y-1">
          <span
            className="block"
            style={{
              fontSize: "9px",
              textTransform: "uppercase",
              letterSpacing: "3px",
              color: "var(--color-accent-secondary)",
            }}
          >
            List Scan
          </span>
          <h1
            className="font-serif"
            style={{
              fontSize: "28px",
              fontWeight: 300,
              color: "var(--color-text-primary)",
            }}
          >
            My scans
          </h1>
          <p
            style={{
              fontSize: "12px",
              color: "var(--color-text-secondary)",
            }}
          >
            Revisit previously scanned wine lists across devices.
          </p>
          {backToScanId ? (
            <Link
              href={`/list-scan/results?scanId=${encodeURIComponent(backToScanId)}`}
              className="mr-2 inline-flex rounded-full border border-[var(--color-border)] px-4 py-2 text-sm font-semibold text-[var(--color-text-primary)] transition hover:border-[var(--color-border-strong)]"
            >
              Back to current scan
            </Link>
          ) : null}
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
          <section className="flex flex-col">
            {items.map((item) => {
              const title =
                item.venue_name || item.list_title || item.source_label || "Saved scan";
              const elapsed = renderNow - new Date(item.scanned_at).getTime();
              const daysAgo = Math.floor(elapsed / (1000 * 60 * 60 * 24));
              const timeLabel =
                daysAgo === 0
                  ? "today"
                  : daysAgo === 1
                  ? "1 day ago"
                  : `${daysAgo} days ago`;
              const meta = `${item.wine_count} wine${item.wine_count === 1 ? "" : "s"} parsed \u00B7 ${timeLabel}`;

              return (
                <Link
                  key={item.scan_id}
                  href={`/list-scan/results?scanId=${encodeURIComponent(item.scan_id)}`}
                  className="flex items-center transition hover:bg-white/[0.03]"
                  style={{
                    gap: "10px",
                    padding: "11px 14px",
                    borderBottom: "0.5px solid rgba(245, 237, 214, 0.04)",
                  }}
                >
                  <span
                    className="flex items-center justify-center flex-shrink-0"
                    style={{
                      width: "32px",
                      height: "32px",
                      borderRadius: "8px",
                      background: "rgba(123, 29, 58, 0.12)",
                      border: "0.5px solid rgba(196, 96, 122, 0.15)",
                      fontSize: "14px",
                    }}
                    aria-hidden="true"
                  >
                    🍷
                  </span>
                  <div className="flex-1 min-w-0">
                    <p
                      className="truncate"
                      style={{
                        fontSize: "11px",
                        color: "var(--color-text-primary)",
                      }}
                    >
                      {title}
                    </p>
                    <p
                      style={{
                        fontSize: "9px",
                        color: "var(--color-text-tertiary)",
                      }}
                    >
                      {meta}
                    </p>
                  </div>
                  <span
                    className="flex-shrink-0"
                    style={{
                      color: "var(--color-text-tertiary)",
                      fontSize: "14px",
                    }}
                    aria-hidden="true"
                  >
                    ›
                  </span>
                </Link>
              );
            })}
          </section>
        )}
      </div>
      </div>
    </AppShell>
  );
}

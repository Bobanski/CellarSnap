"use client";

import { useEffect, useState } from "react";
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

  useEffect(() => {
    let isActive = true;

    const load = async () => {
      try {
        const response = await fetch("/api/list-scan/scans", {
          cache: "no-store",
        });

        if (!isActive) {
          return;
        }

        const payload = (await response.json().catch(() => ({}))) as
          | { scans?: ListScanHistoryItem[]; error?: string }
          | undefined;

        if (!response.ok) {
          if (response.status === 401) {
            setErrorMessage("Sign in to revisit saved wine-list scans.");
          } else {
            setErrorMessage(payload?.error ?? "Unable to load saved scans right now.");
          }
          setItems([]);
          return;
        }

        setItems(payload?.scans ?? []);
      } catch {
        if (!isActive) {
          return;
        }

        setErrorMessage("Unable to load saved scans right now.");
        setItems([]);
      } finally {
        if (isActive) {
          setIsLoading(false);
        }
      }
    };

    void load();

    return () => {
      isActive = false;
    };
  }, []);

  return (
    <div className="min-h-screen bg-[#0f0a09] px-6 py-10 text-zinc-100">
      <div className="mx-auto w-full max-w-6xl space-y-8">
        <NavBar />

        <header className="space-y-3">
          <span className="block text-xs uppercase tracking-[0.3em] text-amber-300/70">
            List scan
          </span>
          <h1 className="text-3xl font-semibold text-zinc-50">My scans</h1>
          <p className="text-sm text-zinc-300">
            Revisit previously scanned wine lists across devices.
          </p>
          <Link
            href="/list-scan"
            className="inline-flex rounded-full bg-amber-400 px-4 py-2 text-sm font-semibold text-zinc-950 transition hover:bg-amber-300"
          >
            Scan another
          </Link>
        </header>

        {isLoading ? (
          <section className="rounded-3xl border border-white/10 bg-white/5 p-8 text-sm text-zinc-300">
            Loading saved scans...
          </section>
        ) : errorMessage ? (
          <section className="rounded-3xl border border-white/10 bg-white/5 p-8 text-sm text-zinc-300">
            {errorMessage}
          </section>
        ) : items.length === 0 ? (
          <section className="rounded-3xl border border-white/10 bg-white/5 p-8 text-sm text-zinc-300">
            No saved scans yet. Scan a wine list while signed in and it will show up here.
          </section>
        ) : (
          <section className="grid gap-4 md:grid-cols-2">
            {items.map((item) => (
              <Link
                key={item.scan_id}
                href={`/list-scan/results?scanId=${encodeURIComponent(item.scan_id)}`}
                className="rounded-3xl border border-white/10 bg-white/5 p-6 transition hover:border-amber-300/40 hover:bg-white/7"
              >
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-zinc-400">
                  {item.source_type}
                </p>
                <h2 className="mt-3 text-xl font-semibold text-zinc-50">
                  {item.venue_name || item.list_title || item.source_label || "Saved scan"}
                </h2>
                <p className="mt-2 text-sm text-zinc-300">
                  {item.wine_count} wine{item.wine_count === 1 ? "" : "s"} scanned
                  {typeof item.overall_confidence === "number"
                    ? `, ${item.overall_confidence}% confidence`
                    : ""}
                </p>
                <p className="mt-3 text-xs text-zinc-500">
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

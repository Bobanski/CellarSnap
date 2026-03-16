"use client";

import { useEffect, useState } from "react";
import NavBar from "@/components/NavBar";

type KnowledgeDocument = {
  id: string;
  title: string;
  source_filename: string | null;
  content_type: string;
  ingest_status: string;
  chunk_count: number;
  last_ingested_at: string | null;
  created_at: string;
};

type IngestSummary = {
  documentCount: number;
  wineKnowledgeChunkCount: number;
  generalKnowledgeChunkCount: number;
};

export default function SommelierKnowledgeAdmin() {
  const [documents, setDocuments] = useState<KnowledgeDocument[]>([]);
  const [summary, setSummary] = useState<IngestSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [reingestingStructured, setReingestingStructured] = useState(false);
  const [reingestingEntries, setReingestingEntries] = useState(false);
  const [reingestingDocumentId, setReingestingDocumentId] = useState<string | null>(
    null
  );

  const load = async () => {
    setLoading(true);
    setError(null);

    try {
      const [docsResponse, summaryResponse] = await Promise.all([
        fetch("/api/sommelier/upload-document", { cache: "no-store" }),
        fetch("/api/sommelier/ingest", { cache: "no-store" }),
      ]);

      if (!docsResponse.ok) {
        const payload = (await docsResponse.json().catch(() => null)) as { error?: string } | null;
        throw new Error(payload?.error ?? "Unable to load sommelier documents.");
      }

      if (!summaryResponse.ok) {
        const payload = (await summaryResponse.json().catch(() => null)) as
          | { error?: string }
          | null;
        throw new Error(payload?.error ?? "Unable to load sommelier ingestion status.");
      }

      const docsPayload = (await docsResponse.json()) as { documents: KnowledgeDocument[] };
      const summaryPayload = (await summaryResponse.json()) as IngestSummary;
      setDocuments(docsPayload.documents ?? []);
      setSummary(summaryPayload);
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "Unable to load sommelier admin data."
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const uploadDocument = async (formData: FormData) => {
    setUploading(true);
    setError(null);

    try {
      const response = await fetch("/api/sommelier/upload-document", {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(payload?.error ?? "Unable to upload document.");
      }

      await load();
    } catch (caughtError) {
      setError(
        caughtError instanceof Error ? caughtError.message : "Unable to upload document."
      );
    } finally {
      setUploading(false);
    }
  };

  const reingestStructured = async () => {
    setReingestingStructured(true);
    setError(null);

    try {
      const response = await fetch("/api/sommelier/ingest", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ scope: "structured" }),
      });

      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(payload?.error ?? "Unable to re-ingest structured wine knowledge.");
      }

      await load();
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "Unable to re-ingest structured wine knowledge."
      );
    } finally {
      setReingestingStructured(false);
    }
  };

  const reingestEntries = async () => {
    setReingestingEntries(true);
    setError(null);

    try {
      const response = await fetch("/api/sommelier/ingest", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ scope: "entries" }),
      });

      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(payload?.error ?? "Unable to re-ingest cellar entry embeddings.");
      }

      await load();
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "Unable to re-ingest cellar entry embeddings."
      );
    } finally {
      setReingestingEntries(false);
    }
  };

  const reingestDocument = async (documentId: string) => {
    setReingestingDocumentId(documentId);
    setError(null);

    try {
      const response = await fetch("/api/sommelier/ingest", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ scope: "document", documentId }),
      });

      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(payload?.error ?? "Unable to re-ingest the selected document.");
      }

      await load();
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "Unable to re-ingest the selected document."
      );
    } finally {
      setReingestingDocumentId(null);
    }
  };

  return (
    <main className="min-h-screen bg-[var(--color-screen-bg)] px-6 py-10 text-[var(--color-text-primary)]">
      <div className="mx-auto w-full max-w-6xl space-y-8">
        <NavBar activeHrefOverride="/sommelier" />
        <section className="rounded-[2rem] border border-[var(--color-border)] bg-[radial-gradient(circle_at_top_left,rgba(251,191,36,0.18),transparent_30%),linear-gradient(180deg,rgba(255,255,255,0.05),rgba(255,255,255,0.02))] p-7">
          <p className="text-xs uppercase tracking-[0.32em] text-[var(--color-accent-gold)]/70">
            Sommelier Knowledge
          </p>
          <h1 className="mt-3 text-3xl font-semibold text-[var(--color-text-primary)]">
            Manage the RAG knowledge base.
          </h1>
          <p className="mt-3 max-w-3xl text-sm leading-7 text-[var(--color-text-secondary)]">
            Upload markdown, text, or PDF guides for the general knowledge layer, then re-ingest structured wine knowledge or cellar entry embeddings whenever the retrieval corpus changes.
          </p>
        </section>

        {summary ? (
          <section className="grid gap-4 md:grid-cols-3">
            {[
              { label: "Documents", value: summary.documentCount },
              { label: "Structured chunks", value: summary.wineKnowledgeChunkCount },
              { label: "Document chunks", value: summary.generalKnowledgeChunkCount },
            ].map((item) => (
              <div
                key={item.label}
                className="rounded-[1.5rem] border border-[var(--color-border)] bg-[var(--color-surface-primary)]/10 p-5"
              >
                <p className="text-xs uppercase tracking-[0.22em] text-[var(--color-text-tertiary)]">{item.label}</p>
                <p className="mt-3 text-3xl font-semibold text-[var(--color-text-primary)]">{item.value}</p>
              </div>
            ))}
          </section>
        ) : null}

        <section className="rounded-[1.75rem] border border-[var(--color-border)] bg-[var(--color-surface-primary)]/10 p-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h2 className="text-xl font-semibold text-[var(--color-text-primary)]">Upload a document</h2>
              <p className="mt-2 max-w-2xl text-sm leading-7 text-[var(--color-text-secondary)]">
                The server will chunk the text, generate embeddings, and store the document for future chat retrieval.
              </p>
            </div>
            <div className="flex flex-wrap gap-3">
              <button
                type="button"
                onClick={() => void reingestStructured()}
                disabled={reingestingStructured}
                className="rounded-full border border-[var(--color-accent-gold)]/35 bg-[var(--color-accent-primary)]/10 px-4 py-2 text-sm font-semibold text-[var(--color-accent-gold)] transition hover:bg-[var(--color-accent-primary)]/20 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {reingestingStructured ? "Re-ingesting..." : "Re-ingest structured data"}
              </button>
              <button
                type="button"
                onClick={() => void reingestEntries()}
                disabled={reingestingEntries}
                className="rounded-full border border-white/12 bg-[var(--color-surface-primary)]/10 px-4 py-2 text-sm font-semibold text-[var(--color-text-primary)] transition hover:border-[var(--color-accent-gold)]/35 hover:text-[var(--color-accent-gold)] disabled:cursor-not-allowed disabled:opacity-60"
              >
                {reingestingEntries ? "Re-ingesting..." : "Re-ingest cellar entries"}
              </button>
            </div>
          </div>

          <form
            className="mt-5 grid gap-4 md:grid-cols-[1fr_1fr_auto]"
            onSubmit={(event) => {
              event.preventDefault();
              const formData = new FormData(event.currentTarget);
              void uploadDocument(formData);
              event.currentTarget.reset();
            }}
          >
            <label className="block">
              <span className="mb-2 block text-xs uppercase tracking-[0.18em] text-[var(--color-text-tertiary)]">
                Title
              </span>
              <input
                type="text"
                name="title"
                required
                className="w-full rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface-muted)] px-4 py-3 text-sm text-[var(--color-text-primary)] outline-none transition focus:border-[var(--color-accent-primary)]/40"
                placeholder="Old World Regions Primer"
              />
            </label>
            <label className="block">
              <span className="mb-2 block text-xs uppercase tracking-[0.18em] text-[var(--color-text-tertiary)]">
                Optional source URL
              </span>
              <input
                type="url"
                name="source_url"
                className="w-full rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface-muted)] px-4 py-3 text-sm text-[var(--color-text-primary)] outline-none transition focus:border-[var(--color-accent-primary)]/40"
                placeholder="https://..."
              />
            </label>
            <label className="block">
              <span className="mb-2 block text-xs uppercase tracking-[0.18em] text-[var(--color-text-tertiary)]">
                File
              </span>
              <input
                type="file"
                name="file"
                accept=".md,.txt,.pdf,text/markdown,text/plain,application/pdf"
                required
                className="block w-full rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface-muted)] px-4 py-3 text-sm text-[var(--color-text-secondary)]"
              />
            </label>
            <div className="md:col-span-3">
              <button
                type="submit"
                disabled={uploading}
                className="rounded-full bg-[var(--color-accent-primary)] px-5 py-2.5 text-sm font-semibold text-[var(--color-text-on-accent)] transition hover:bg-[var(--color-accent-hover)] disabled:cursor-not-allowed disabled:opacity-60"
              >
                {uploading ? "Uploading..." : "Upload and ingest"}
              </button>
            </div>
          </form>
        </section>

        {error ? (
          <div className="rounded-2xl border border-rose-300/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-100">
            {error}
          </div>
        ) : null}

        <section className="rounded-[1.75rem] border border-[var(--color-border)] bg-[var(--color-surface-primary)]/10 p-6">
          <h2 className="text-xl font-semibold text-[var(--color-text-primary)]">Uploaded documents</h2>
          <p className="mt-2 text-sm leading-7 text-[var(--color-text-secondary)]">
            Review chunk counts and ingest status at a glance.
          </p>

          {loading ? (
            <div className="mt-5 rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface-muted)] px-4 py-6 text-sm text-[var(--color-text-tertiary)]">
              Loading knowledge documents...
            </div>
          ) : documents.length === 0 ? (
            <div className="mt-5 rounded-2xl border border-dashed border-white/12 bg-[var(--color-surface-muted)] px-4 py-6 text-sm text-[var(--color-text-tertiary)]">
              No documents uploaded yet.
            </div>
          ) : (
            <div className="mt-5 space-y-3">
              {documents.map((document) => (
                <div
                  key={document.id}
                  className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface-muted)] px-4 py-4"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="text-base font-semibold text-[var(--color-text-primary)]">{document.title}</p>
                      <p className="mt-1 text-xs uppercase tracking-[0.16em] text-[var(--color-text-tertiary)]">
                        {document.content_type}
                        {document.source_filename ? ` • ${document.source_filename}` : ""}
                      </p>
                    </div>
                    <span className="rounded-full border border-[var(--color-border)] px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] text-[var(--color-text-secondary)]">
                      {document.ingest_status}
                    </span>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-4 text-sm text-[var(--color-text-tertiary)]">
                    <span>{document.chunk_count} chunks</span>
                    <span>
                      Last ingested: {document.last_ingested_at ?? "Not ingested yet"}
                    </span>
                    <button
                      type="button"
                      onClick={() => void reingestDocument(document.id)}
                      disabled={reingestingDocumentId === document.id}
                      className="rounded-full border border-[var(--color-border)] px-3 py-1 text-xs font-semibold text-[var(--color-text-primary)] transition hover:border-[var(--color-accent-gold)]/35 hover:text-[var(--color-accent-gold)] disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {reingestingDocumentId === document.id ? "Re-ingesting..." : "Re-ingest"}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}

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
    <main className="min-h-screen bg-[#0f0a09] px-6 py-10 text-zinc-100">
      <div className="mx-auto w-full max-w-6xl space-y-8">
        <NavBar activeHrefOverride="/sommelier" />
        <section className="rounded-[2rem] border border-white/10 bg-[radial-gradient(circle_at_top_left,rgba(251,191,36,0.18),transparent_30%),linear-gradient(180deg,rgba(255,255,255,0.05),rgba(255,255,255,0.02))] p-7">
          <p className="text-xs uppercase tracking-[0.32em] text-amber-200/70">
            Sommelier Knowledge
          </p>
          <h1 className="mt-3 text-3xl font-semibold text-zinc-50">
            Manage the RAG knowledge base.
          </h1>
          <p className="mt-3 max-w-3xl text-sm leading-7 text-zinc-300">
            Upload markdown, text, or PDF guides for the general knowledge layer, then re-ingest the structured wine dataset whenever the algorithm tables change.
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
                className="rounded-[1.5rem] border border-white/10 bg-white/5 p-5"
              >
                <p className="text-xs uppercase tracking-[0.22em] text-zinc-500">{item.label}</p>
                <p className="mt-3 text-3xl font-semibold text-zinc-50">{item.value}</p>
              </div>
            ))}
          </section>
        ) : null}

        <section className="rounded-[1.75rem] border border-white/10 bg-white/5 p-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h2 className="text-xl font-semibold text-zinc-50">Upload a document</h2>
              <p className="mt-2 max-w-2xl text-sm leading-7 text-zinc-300">
                The server will chunk the text, generate embeddings, and store the document for future chat retrieval.
              </p>
            </div>
            <button
              type="button"
              onClick={() => void reingestStructured()}
              disabled={reingestingStructured}
              className="rounded-full border border-amber-300/35 bg-amber-400/10 px-4 py-2 text-sm font-semibold text-amber-100 transition hover:bg-amber-400/20 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {reingestingStructured ? "Re-ingesting..." : "Re-ingest structured data"}
            </button>
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
              <span className="mb-2 block text-xs uppercase tracking-[0.18em] text-zinc-500">
                Title
              </span>
              <input
                type="text"
                name="title"
                required
                className="w-full rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-zinc-100 outline-none transition focus:border-amber-300/40"
                placeholder="Old World Regions Primer"
              />
            </label>
            <label className="block">
              <span className="mb-2 block text-xs uppercase tracking-[0.18em] text-zinc-500">
                Optional source URL
              </span>
              <input
                type="url"
                name="source_url"
                className="w-full rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-zinc-100 outline-none transition focus:border-amber-300/40"
                placeholder="https://..."
              />
            </label>
            <label className="block">
              <span className="mb-2 block text-xs uppercase tracking-[0.18em] text-zinc-500">
                File
              </span>
              <input
                type="file"
                name="file"
                accept=".md,.txt,.pdf,text/markdown,text/plain,application/pdf"
                required
                className="block w-full rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-zinc-300"
              />
            </label>
            <div className="md:col-span-3">
              <button
                type="submit"
                disabled={uploading}
                className="rounded-full bg-amber-300 px-5 py-2.5 text-sm font-semibold text-zinc-950 transition hover:bg-amber-200 disabled:cursor-not-allowed disabled:opacity-60"
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

        <section className="rounded-[1.75rem] border border-white/10 bg-white/5 p-6">
          <h2 className="text-xl font-semibold text-zinc-50">Uploaded documents</h2>
          <p className="mt-2 text-sm leading-7 text-zinc-300">
            Review chunk counts and ingest status at a glance.
          </p>

          {loading ? (
            <div className="mt-5 rounded-2xl border border-white/10 bg-black/20 px-4 py-6 text-sm text-zinc-400">
              Loading knowledge documents...
            </div>
          ) : documents.length === 0 ? (
            <div className="mt-5 rounded-2xl border border-dashed border-white/12 bg-black/20 px-4 py-6 text-sm text-zinc-400">
              No documents uploaded yet.
            </div>
          ) : (
            <div className="mt-5 space-y-3">
              {documents.map((document) => (
                <div
                  key={document.id}
                  className="rounded-2xl border border-white/10 bg-black/20 px-4 py-4"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="text-base font-semibold text-zinc-50">{document.title}</p>
                      <p className="mt-1 text-xs uppercase tracking-[0.16em] text-zinc-500">
                        {document.content_type}
                        {document.source_filename ? ` • ${document.source_filename}` : ""}
                      </p>
                    </div>
                    <span className="rounded-full border border-white/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] text-zinc-300">
                      {document.ingest_status}
                    </span>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-4 text-sm text-zinc-400">
                    <span>{document.chunk_count} chunks</span>
                    <span>
                      Last ingested: {document.last_ingested_at ?? "Not ingested yet"}
                    </span>
                    <button
                      type="button"
                      onClick={() => void reingestDocument(document.id)}
                      disabled={reingestingDocumentId === document.id}
                      className="rounded-full border border-white/10 px-3 py-1 text-xs font-semibold text-zinc-200 transition hover:border-amber-300/35 hover:text-amber-100 disabled:cursor-not-allowed disabled:opacity-60"
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

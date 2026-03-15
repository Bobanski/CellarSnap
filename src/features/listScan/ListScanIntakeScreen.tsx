"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { LIST_SCAN_MAX_IMAGE_COUNT, type ListScanResult } from "@shared";
import NavBar from "@/components/NavBar";
import { saveListScanResult } from "@/lib/listScan/storage";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";

function createFileKey(file: File) {
  return `${file.name}-${file.size}-${file.lastModified}`;
}

type ScanSourceKind = "image" | "pdf" | "url";

type ScanProgressState = {
  percent: number;
  label: string;
  detail: string;
};

const SCAN_PROGRESS_TIMELINES: Record<
  ScanSourceKind,
  Array<{ until: number; label: string; detail: string }>
> = {
  image: [
    {
      until: 14,
      label: "Uploading photos",
      detail: "Sending your wine-list images and getting the scan started.",
    },
    {
      until: 42,
      label: "Reading the list",
      detail: "Pulling text from the photos and separating likely wine rows.",
    },
    {
      until: 72,
      label: "Cleaning up entries",
      detail: "Filtering out headers and tightening producer, region, and varietal details.",
    },
    {
      until: 94,
      label: "Scoring matches",
      detail: "Finalizing the list and preparing your results.",
    },
  ],
  pdf: [
    {
      until: 12,
      label: "Loading the PDF",
      detail: "Opening the file and checking whether the text can be extracted directly.",
    },
    {
      until: 38,
      label: "Reading the wine list",
      detail: "Pulling text from the PDF and focusing on the wine sections.",
    },
    {
      until: 70,
      label: "Structuring the entries",
      detail: "Turning the list into bottles, vintages, prices, regions, and grapes.",
    },
    {
      until: 94,
      label: "Final checks",
      detail: "Applying cleanup and match scoring before the results load.",
    },
  ],
  url: [
    {
      until: 16,
      label: "Fetching the page",
      detail: "Loading the wine-list link and finding the menu content.",
    },
    {
      until: 44,
      label: "Extracting the list",
      detail: "Pulling the wine section out of the page and removing unrelated content.",
    },
    {
      until: 74,
      label: "Normalizing the entries",
      detail: "Cleaning up rows and sorting bottles into the right regions and styles.",
    },
    {
      until: 94,
      label: "Preparing results",
      detail: "Wrapping up the scan and building the final result set.",
    },
  ],
};

function resolveScanSourceKind(params: {
  selectedImages: File[];
  selectedPdf: File | null;
  urlValue: string;
}): ScanSourceKind | null {
  if (params.selectedImages.length > 0) {
    return "image";
  }
  if (params.selectedPdf) {
    return "pdf";
  }
  if (params.urlValue.trim()) {
    return "url";
  }
  return null;
}

function buildScanProgress(
  kind: ScanSourceKind,
  elapsedMs: number
): ScanProgressState {
  const targetDurationMs =
    kind === "pdf" ? 40_000 : kind === "url" ? 28_000 : 24_000;
  const progressCurve = 1 - Math.exp(-elapsedMs / targetDurationMs);
  const percent = Math.max(6, Math.min(99, Math.round(6 + progressCurve * 93)));
  const timeline =
    SCAN_PROGRESS_TIMELINES[kind].find((step) => percent <= step.until) ??
    SCAN_PROGRESS_TIMELINES[kind][SCAN_PROGRESS_TIMELINES[kind].length - 1];
  const isTakingLongerThanExpected = elapsedMs > targetDurationMs * 1.15;

  return {
    percent,
    label: isTakingLongerThanExpected ? "Still working" : timeline.label,
    detail: isTakingLongerThanExpected
      ? "This one is taking a little longer than usual, but the scan is still running."
      : timeline.detail,
  };
}

export default function ListScanIntakeScreen() {
  const router = useRouter();
  const imageInputRef = useRef<HTMLInputElement | null>(null);
  const pdfInputRef = useRef<HTMLInputElement | null>(null);
  const [selectedImages, setSelectedImages] = useState<File[]>([]);
  const [selectedPdf, setSelectedPdf] = useState<File | null>(null);
  const [urlValue, setUrlValue] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSignedIn, setIsSignedIn] = useState<boolean | null>(null);
  const [scanProgress, setScanProgress] = useState<ScanProgressState | null>(null);

  const imagePreviews = useMemo(
    () =>
      selectedImages.map((file) => ({
        key: createFileKey(file),
        url: URL.createObjectURL(file),
      })),
    [selectedImages]
  );

  useEffect(() => {
    return () => {
      imagePreviews.forEach((preview) => URL.revokeObjectURL(preview.url));
    };
  }, [imagePreviews]);

  useEffect(() => {
    let isActive = true;

    const loadViewer = async () => {
      try {
        const supabase = createSupabaseBrowserClient();
        const {
          data: { user },
        } = await supabase.auth.getUser();

        if (isActive) {
          setIsSignedIn(Boolean(user));
        }
      } catch {
        if (isActive) {
          setIsSignedIn(null);
        }
      }
    };

    void loadViewer();

    return () => {
      isActive = false;
    };
  }, []);

  useEffect(() => {
    if (!isSubmitting) {
      setScanProgress(null);
      return;
    }

    const sourceKind = resolveScanSourceKind({
      selectedImages,
      selectedPdf,
      urlValue,
    });
    if (!sourceKind) {
      setScanProgress(null);
      return;
    }

    const startTime = Date.now();
    setScanProgress(buildScanProgress(sourceKind, 0));

    const interval = window.setInterval(() => {
      setScanProgress(buildScanProgress(sourceKind, Date.now() - startTime));
    }, 700);

    return () => {
      window.clearInterval(interval);
    };
  }, [isSubmitting, selectedImages, selectedPdf, urlValue]);

  const appendImages = (incomingFiles: File[]) => {
    const imageFiles = incomingFiles.filter((file) => file.type.startsWith("image/"));
    if (imageFiles.length === 0) {
      setErrorMessage("Choose one or more images.");
      return;
    }

    setErrorMessage(null);
    setSelectedPdf(null);
    setSelectedImages((current) => {
      const deduped = new Map<string, File>();
      [...current, ...imageFiles].forEach((file) => {
        deduped.set(createFileKey(file), file);
      });
      const merged = Array.from(deduped.values()).slice(0, LIST_SCAN_MAX_IMAGE_COUNT);
      if (deduped.size > LIST_SCAN_MAX_IMAGE_COUNT) {
        setErrorMessage(`Upload up to ${LIST_SCAN_MAX_IMAGE_COUNT} images at a time.`);
      }
      return merged;
    });
  };

  const submitForm = async () => {
    const trimmedUrl = urlValue.trim();
    const formData = new FormData();

    if (selectedImages.length > 0) {
      selectedImages.forEach((file) => {
        formData.append("files", file);
      });
      formData.append(
        "sourceLabel",
        selectedImages.length === 1
          ? selectedImages[0].name
          : `${selectedImages.length} wine-list images`
      );
    } else if (selectedPdf) {
      formData.append("files", selectedPdf);
      formData.append("sourceLabel", selectedPdf.name);
    } else if (trimmedUrl) {
      formData.append("url", trimmedUrl);
    } else {
      setErrorMessage("Upload a list image or PDF, or enter a URL.");
      return;
    }

    setIsSubmitting(true);
    setErrorMessage(null);

    try {
      const response = await fetch("/api/list-scan/parse", {
        method: "POST",
        body: formData,
      });
      const payload = (await response.json().catch(() => ({}))) as
        | ListScanResult
        | { error?: string };

      if (!response.ok) {
        setErrorMessage(
          typeof payload === "object" && payload && "error" in payload
            ? payload.error || "Unable to scan this wine list."
            : "Unable to scan this wine list."
        );
        return;
      }

      const result = payload as ListScanResult;
      setScanProgress({
        percent: 100,
        label: "Opening results",
        detail: "Your wine list is ready.",
      });
      saveListScanResult(result);
      router.push(`/list-scan/results?scanId=${encodeURIComponent(result.scan_id)}`);
    } catch {
      setErrorMessage("Unable to scan this wine list right now.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#0f0a09] px-6 py-8 text-zinc-100">
      <div className="mx-auto w-full max-w-5xl space-y-6">
        <NavBar />

        <div className="mx-auto w-full max-w-3xl space-y-5">
          <header className="space-y-2">
            <span className="block text-xs uppercase tracking-[0.3em] text-amber-300/70">
              List scan
            </span>
            <h1 className="text-3xl font-semibold text-zinc-50">
              Scan or upload a wine list.
            </h1>
            <p className="text-sm text-zinc-300">
              Upload one or more list photos, choose a PDF, or paste a public wine-list
              link.
            </p>
          </header>

          <section className="space-y-5 rounded-3xl border border-white/10 bg-white/5 p-6 shadow-[0_30px_80px_-40px_rgba(0,0,0,0.8)] backdrop-blur">
            {isSignedIn === false ? (
              <div className="rounded-2xl border border-amber-300/25 bg-amber-400/10 px-4 py-4 text-sm text-amber-50">
                <p className="font-semibold text-amber-100">
                  Signed-out scans stay local to this browser.
                </p>
                <p className="mt-1 leading-6 text-amber-50/90">
                  <Link
                    href="/login"
                    className="underline decoration-amber-200/50 underline-offset-4"
                  >
                    Sign in
                  </Link>{" "}
                  to save scans to your history and unlock personalized match scores
                  across devices.
                </p>
              </div>
            ) : null}

            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-zinc-400">
                Upload
              </p>
              <p className="text-sm text-zinc-400">
                Use up to {LIST_SCAN_MAX_IMAGE_COUNT} photos for multi-page lists, or choose one PDF.
              </p>
            </div>

            <div className="flex flex-wrap gap-3">
              <button
                type="button"
                className="rounded-full border border-white/10 px-5 py-2.5 text-sm font-semibold text-zinc-200 transition hover:border-white/30 disabled:cursor-not-allowed disabled:opacity-60"
                onClick={() => imageInputRef.current?.click()}
                disabled={isSubmitting}
              >
                Choose photo
              </button>
              <button
                type="button"
                className="rounded-full border border-white/10 px-5 py-2.5 text-sm font-semibold text-zinc-200 transition hover:border-white/30 disabled:cursor-not-allowed disabled:opacity-60"
                onClick={() => pdfInputRef.current?.click()}
                disabled={isSubmitting}
              >
                Choose PDF
              </button>
            </div>

            <input
              ref={imageInputRef}
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={(event) => {
                const files = Array.from(event.target.files ?? []);
                appendImages(files);
                event.currentTarget.value = "";
              }}
            />

            <input
              ref={pdfInputRef}
              type="file"
              accept="application/pdf"
              className="hidden"
              onChange={(event) => {
                const file = event.target.files?.[0] ?? null;
                if (!file) {
                  return;
                }
                setSelectedImages([]);
                setSelectedPdf(file);
                setErrorMessage(null);
                event.currentTarget.value = "";
              }}
            />

            {selectedImages.length > 0 ? (
              <div className="flex flex-wrap gap-3">
                {imagePreviews.map((preview, index) => (
                  <div
                    key={preview.key}
                    className="relative h-20 w-20 overflow-hidden rounded-2xl border border-white/10 bg-[#171210]"
                  >
                    <div
                      className="absolute inset-0 bg-cover bg-center"
                      style={{ backgroundImage: `url(${preview.url})` }}
                    />
                    <button
                      type="button"
                      className="absolute right-1.5 top-1.5 flex h-6 w-6 items-center justify-center rounded-full bg-black/70 text-xs font-bold text-white transition hover:bg-black/85"
                      onClick={() =>
                        setSelectedImages((current) =>
                          current.filter((_, imageIndex) => imageIndex !== index)
                        )
                      }
                      aria-label={`Remove photo ${index + 1}`}
                    >
                      x
                    </button>
                  </div>
                ))}
              </div>
            ) : null}

            {selectedPdf ? (
              <div className="relative flex items-center gap-3 rounded-2xl border border-white/10 bg-[#171210] px-4 py-3">
                <span className="rounded-full bg-white/8 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-zinc-400">
                  PDF
                </span>
                <span className="min-w-0 flex-1 truncate text-sm font-medium text-zinc-100">
                  {selectedPdf.name}
                </span>
                <button
                  type="button"
                  className="flex h-7 w-7 items-center justify-center rounded-full border border-white/10 text-xs font-bold text-zinc-200 transition hover:border-white/30"
                  onClick={() => setSelectedPdf(null)}
                  aria-label="Remove PDF"
                >
                  x
                </button>
              </div>
            ) : null}

            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-zinc-400">
                Public wine list link
              </p>
              <input
                value={urlValue}
                onChange={(event) => {
                  setUrlValue(event.target.value);
                  setErrorMessage(null);
                }}
                placeholder="https://restaurant.com/wine-list"
                className="w-full rounded-2xl border border-white/10 bg-[#171210] px-4 py-3 text-sm text-zinc-100 placeholder:text-zinc-500 focus:border-amber-300/60 focus:outline-none"
              />
            </div>

            {errorMessage ? (
              <div className="rounded-2xl border border-rose-300/20 bg-rose-400/10 px-4 py-3 text-sm text-rose-100">
                {errorMessage}
              </div>
            ) : null}

            {isSubmitting && scanProgress ? (
              <div className="rounded-2xl border border-amber-300/20 bg-amber-400/10 px-4 py-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-amber-50">
                      {scanProgress.label}
                    </p>
                    <p className="mt-1 text-sm leading-6 text-amber-50/85">
                      {scanProgress.detail}
                    </p>
                  </div>
                  <span className="rounded-full border border-amber-200/20 bg-black/20 px-3 py-1 text-sm font-semibold text-amber-50">
                    {scanProgress.percent}%
                  </span>
                </div>
                <div className="mt-3 h-2.5 overflow-hidden rounded-full bg-black/20">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-amber-200 via-amber-300 to-emerald-300 transition-[width] duration-700 ease-out"
                    style={{ width: `${scanProgress.percent}%` }}
                  />
                </div>
                <p className="mt-3 text-xs text-amber-50/75">
                  Longer PDFs and multi-page lists can take a little while, but the scan is still running.
                </p>
              </div>
            ) : null}

            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={() => void submitForm()}
                disabled={
                  isSubmitting ||
                  (selectedImages.length === 0 && !selectedPdf && !urlValue.trim())
                }
                className="rounded-full bg-amber-400 px-5 py-2.5 text-sm font-semibold text-zinc-950 transition hover:bg-amber-300 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isSubmitting ? "Scanning..." : "Scan list"}
              </button>
              <Link
                href="/"
                className="inline-flex rounded-full border border-white/10 px-4 py-2 text-sm font-semibold text-zinc-200 transition hover:border-white/30"
              >
                Back to Home
              </Link>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}

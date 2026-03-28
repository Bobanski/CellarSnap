"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { LIST_SCAN_MAX_IMAGE_COUNT, type ListScanResult } from "@shared";
import AppShell from "@/components/AppShell";
import { saveListScanResult } from "@/lib/listScan/storage";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";

function createFileKey(file: File) {
  return `${file.name}-${file.size}-${file.lastModified}`;
}

/**
 * Compress an image file to JPEG at a target max dimension and quality.
 * This keeps uploads well under Vercel's 4.5 MB body limit while
 * retaining enough resolution for OCR (Cloud Vision or OpenAI).
 */
async function compressImageFile(
  file: File,
  maxDimension = 2048,
  quality = 0.8
): Promise<File> {
  // Skip if already small enough (< 1 MB)
  if (file.size < 1_000_000) return file;

  return new Promise<File>((resolve) => {
    const img = new Image();
    const url = URL.createObjectURL(file);

    img.onload = () => {
      URL.revokeObjectURL(url);

      let { width, height } = img;
      if (width > maxDimension || height > maxDimension) {
        const scale = maxDimension / Math.max(width, height);
        width = Math.round(width * scale);
        height = Math.round(height * scale);
      }

      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        resolve(file); // Fallback to original
        return;
      }
      ctx.drawImage(img, 0, 0, width, height);

      canvas.toBlob(
        (blob) => {
          if (!blob || blob.size >= file.size) {
            resolve(file); // Keep original if compression didn't help
            return;
          }
          const compressed = new File(
            [blob],
            file.name.replace(/\.\w+$/, ".jpg"),
            { type: "image/jpeg", lastModified: file.lastModified }
          );
          resolve(compressed);
        },
        "image/jpeg",
        quality
      );
    };

    img.onerror = () => {
      URL.revokeObjectURL(url);
      resolve(file); // Fallback to original on error
    };

    img.src = url;
  });
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
      until: 30,
      label: "Reading the list",
      detail: "Extracting text from your photo.",
    },
    {
      until: 70,
      label: "Parsing wines",
      detail: "Identifying entries, prices, and regions.",
    },
    {
      until: 94,
      label: "Scoring matches",
      detail: "Computing your personalized match scores.",
    },
  ],
  pdf: [
    {
      until: 30,
      label: "Reading the PDF",
      detail: "Extracting text and finding the wine section.",
    },
    {
      until: 70,
      label: "Parsing wines",
      detail: "Identifying entries, prices, and regions.",
    },
    {
      until: 94,
      label: "Scoring matches",
      detail: "Computing your personalized match scores.",
    },
  ],
  url: [
    {
      until: 40,
      label: "Fetching the page",
      detail: "Loading the wine-list link.",
    },
    {
      until: 75,
      label: "Parsing wines",
      detail: "Extracting entries from the menu.",
    },
    {
      until: 94,
      label: "Scoring matches",
      detail: "Computing your personalized match scores.",
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
    kind === "image" ? 6_000 : kind === "pdf" ? 4_000 : 8_000;
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

  const clearInputs = () => {
    if (isSubmitting) {
      return;
    }

    setSelectedImages([]);
    setSelectedPdf(null);
    setUrlValue("");
    setErrorMessage(null);
    setScanProgress(null);

    if (imageInputRef.current) {
      imageInputRef.current.value = "";
    }
    if (pdfInputRef.current) {
      pdfInputRef.current.value = "";
    }
  };

  const submitForm = async () => {
    const trimmedUrl = urlValue.trim();
    const formData = new FormData();

    if (selectedImages.length > 0) {
      // Compress images client-side to stay under Vercel's 4.5 MB body limit.
      const compressed = await Promise.all(
        selectedImages.map((file) => compressImageFile(file))
      );
      compressed.forEach((file) => {
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
      const controller = new AbortController();
      const timeout = window.setTimeout(() => controller.abort(), 100_000); // 100 seconds (10s buffer above backend)

      try {
        const response = await fetch("/api/list-scan/parse", {
          method: "POST",
          body: formData,
          signal: controller.signal,
        });
        const payload = (await response.json().catch(() => ({}))) as
          | ListScanResult
          | { error?: string };

      if (!response.ok) {
        const errorFromPayload =
          typeof payload === "object" && payload && "error" in payload
            ? payload.error
            : null;

        const fallback =
          response.status >= 500
            ? `Service error (${response.status}). Please try again later.`
            : response.status === 429
            ? "Too many scans. Please wait a moment and try again."
            : `Unable to scan (error: ${response.status}).`;

        setErrorMessage(errorFromPayload || fallback);

        // Log full error for debugging
        console.warn("Scan failed:", {
          status: response.status,
          error: errorFromPayload,
          payload,
        });
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
      } finally {
        window.clearTimeout(timeout);
      }
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        setErrorMessage(
          "Scan is taking too long. Please try with fewer or shorter wine entries."
        );
      } else {
        setErrorMessage("Unable to scan this wine list right now.");
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const hasIntakeSelection =
    selectedImages.length > 0 ||
    selectedPdf !== null ||
    Boolean(urlValue.trim()) ||
    Boolean(errorMessage) ||
    Boolean(scanProgress);

  return (
    <AppShell>
      <div className="px-6 py-6 text-[var(--color-text-primary)]">
        <div className="mx-auto w-full max-w-3xl space-y-5">
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
              Scan any wine list.
            </h1>
            <p
              style={{
                fontSize: "12px",
                color: "var(--color-text-secondary)",
              }}
            >
              Upload a photo, PDF, or URL and get instant recommendations.
            </p>
          </header>

          <section className="space-y-5 rounded-3xl border border-[var(--color-border)] bg-[var(--color-surface-primary)]/10 p-6 shadow-[0_30px_80px_-40px_rgba(0,0,0,0.8)] backdrop-blur">
            {isSignedIn === false ? (
              <div className="rounded-2xl border border-[var(--color-accent-secondary)]/25 bg-[var(--color-accent-primary)]/10 px-4 py-4 text-sm text-[var(--color-text-on-accent)]">
                <p className="font-semibold text-[var(--color-accent-secondary)]">
                  Signed-out scans stay local to this browser.
                </p>
                <p className="mt-1 leading-6 text-[var(--color-text-on-accent)]/90">
                  <Link
                    href="/login"
                    className="underline decoration-[var(--color-accent-secondary)]/50 underline-offset-4"
                  >
                    Sign in
                  </Link>{" "}
                  to save scans to your history and unlock personalized match scores
                  across devices.
                </p>
              </div>
            ) : null}

            <div className="flex gap-3">
              <button
                type="button"
                className="flex-1 transition hover:border-[var(--color-border-strong)] disabled:cursor-not-allowed disabled:opacity-60"
                style={{
                  background: "var(--color-surface-primary)",
                  border: "0.5px solid var(--color-border)",
                  borderRadius: "12px",
                  padding: "16px 10px",
                  textAlign: "center",
                }}
                onClick={() => imageInputRef.current?.click()}
                disabled={isSubmitting}
              >
                <span style={{ fontSize: "20px", opacity: 0.6 }} aria-hidden="true">
                  📷
                </span>
                <span
                  className="mt-1 block"
                  style={{
                    fontSize: "10px",
                    color: "var(--color-text-primary)",
                    fontWeight: 500,
                  }}
                >
                  Photo
                </span>
                <span
                  className="mt-0.5 block"
                  style={{
                    fontSize: "8px",
                    color: "var(--color-text-tertiary)",
                  }}
                >
                  Up to {LIST_SCAN_MAX_IMAGE_COUNT} images
                </span>
              </button>

              <button
                type="button"
                className="flex-1 transition hover:border-[var(--color-border-strong)] disabled:cursor-not-allowed disabled:opacity-60"
                style={{
                  background: "var(--color-surface-primary)",
                  border: "0.5px solid var(--color-border)",
                  borderRadius: "12px",
                  padding: "16px 10px",
                  textAlign: "center",
                }}
                onClick={() => pdfInputRef.current?.click()}
                disabled={isSubmitting}
              >
                <span style={{ fontSize: "20px", opacity: 0.6 }} aria-hidden="true">
                  📄
                </span>
                <span
                  className="mt-1 block"
                  style={{
                    fontSize: "10px",
                    color: "var(--color-text-primary)",
                    fontWeight: 500,
                  }}
                >
                  PDF
                </span>
                <span
                  className="mt-0.5 block"
                  style={{
                    fontSize: "8px",
                    color: "var(--color-text-tertiary)",
                  }}
                >
                  Single file
                </span>
              </button>

              <button
                type="button"
                className="flex-1 transition hover:border-[var(--color-border-strong)] disabled:cursor-not-allowed disabled:opacity-60"
                style={{
                  background: "var(--color-surface-primary)",
                  border: "0.5px solid var(--color-border)",
                  borderRadius: "12px",
                  padding: "16px 10px",
                  textAlign: "center",
                }}
                onClick={() => {
                  const urlInput = document.getElementById("list-scan-url-input");
                  urlInput?.focus();
                }}
                disabled={isSubmitting}
              >
                <span style={{ fontSize: "20px", opacity: 0.6 }} aria-hidden="true">
                  🔗
                </span>
                <span
                  className="mt-1 block"
                  style={{
                    fontSize: "10px",
                    color: "var(--color-text-primary)",
                    fontWeight: 500,
                  }}
                >
                  URL
                </span>
                <span
                  className="mt-0.5 block"
                  style={{
                    fontSize: "8px",
                    color: "var(--color-text-tertiary)",
                  }}
                >
                  Public link
                </span>
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
                    className="relative h-20 w-20 overflow-hidden rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface-primary)]"
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
              <div className="relative flex items-center gap-3 rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface-primary)] px-4 py-3">
                <span className="rounded-full bg-white/8 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--color-text-tertiary)]">
                  PDF
                </span>
                <span className="min-w-0 flex-1 truncate text-sm font-medium text-[var(--color-text-primary)]">
                  {selectedPdf.name}
                </span>
                <button
                  type="button"
                  className="flex h-7 w-7 items-center justify-center rounded-full border border-[var(--color-border)] text-xs font-bold text-[var(--color-text-primary)] transition hover:border-[var(--color-border-strong)]"
                  onClick={() => setSelectedPdf(null)}
                  aria-label="Remove PDF"
                >
                  x
                </button>
              </div>
            ) : null}

            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--color-text-tertiary)]">
                Or paste a public wine list link
              </p>
              <input
                id="list-scan-url-input"
                value={urlValue}
                onChange={(event) => {
                  setUrlValue(event.target.value);
                  setErrorMessage(null);
                }}
                placeholder="https://restaurant.com/wine-list"
                className="w-full rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface-primary)] px-4 py-3 text-sm text-[var(--color-text-primary)] placeholder:text-[var(--color-text-tertiary)] focus:border-[var(--color-accent-primary)]/60 focus:outline-none"
              />
            </div>

            {errorMessage ? (
              <div className="rounded-2xl border border-[var(--color-error)]/20 bg-[var(--color-error)]/10 px-4 py-3 text-sm text-[var(--color-error)]">
                {errorMessage}
              </div>
            ) : null}

            {isSubmitting && scanProgress ? (
              <div className="rounded-2xl border border-[var(--color-accent-secondary)]/20 bg-[var(--color-accent-primary)]/10 px-4 py-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-[var(--color-text-on-accent)]">
                      {scanProgress.label}
                    </p>
                    <p className="mt-1 text-sm leading-6 text-[var(--color-text-on-accent)]/85">
                      {scanProgress.detail}
                    </p>
                  </div>
                  <span className="rounded-full border border-[var(--color-accent-secondary)]/20 bg-[var(--color-surface-muted)] px-3 py-1 text-sm font-semibold text-[var(--color-text-on-accent)]">
                    {scanProgress.percent}%
                  </span>
                </div>
                <div className="mt-3 h-2.5 overflow-hidden rounded-full bg-[var(--color-surface-muted)]">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-[var(--color-accent-secondary)] via-[var(--color-accent-secondary)] to-emerald-300 transition-[width] duration-700 ease-out"
                    style={{ width: `${scanProgress.percent}%` }}
                  />
                </div>
                <p className="mt-3 text-xs text-[var(--color-text-on-accent)]/75">
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
                className="rounded-full bg-[var(--color-accent-primary)] px-5 py-2.5 text-sm font-semibold text-[var(--color-text-on-accent)] transition hover:bg-[var(--color-accent-primary)] disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isSubmitting ? "Scanning..." : "Scan list"}
              </button>
              <button
                type="button"
                onClick={clearInputs}
                disabled={isSubmitting || !hasIntakeSelection}
                className="inline-flex rounded-full border border-[var(--color-border)] px-4 py-2 text-sm font-semibold text-[var(--color-text-primary)] transition hover:border-[var(--color-border-strong)] disabled:cursor-not-allowed disabled:opacity-50"
              >
                Clear
              </button>
            </div>
          </section>
        </div>
      </div>
    </AppShell>
  );
}

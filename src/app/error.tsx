"use client";

import Link from "next/link";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-[var(--color-screen-bg)] px-6 text-[var(--color-text-primary)]">
      <div className="w-full max-w-md space-y-6 text-center">
        <div className="space-y-2">
          <span className="block text-xs uppercase tracking-[0.3em] text-rose-700/70">
            Something went wrong
          </span>
          <h1 className="text-2xl font-semibold text-[var(--color-text-primary)]">
            We hit an unexpected error.
          </h1>
          <p className="text-sm text-[var(--color-text-tertiary)]">
            {error.message || "An unknown error occurred."}
          </p>
        </div>

        <div className="flex items-center justify-center gap-3">
          <button
            type="button"
            onClick={reset}
            className="rounded-full bg-[var(--color-accent-primary)]/90 px-5 py-2 text-sm font-semibold text-[var(--color-text-on-accent)] transition hover:bg-[var(--color-accent-primary)]"
          >
            Try again
          </button>
          <Link
            href="/"
            className="rounded-full border border-[var(--color-border)] px-5 py-2 text-sm font-semibold text-[var(--color-text-primary)] transition hover:border-[var(--color-border-strong)]"
          >
            Go home
          </Link>
        </div>
      </div>
    </div>
  );
}

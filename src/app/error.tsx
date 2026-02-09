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
    <div className="flex min-h-screen items-center justify-center bg-[#0f0a09] px-6 text-zinc-100">
      <div className="w-full max-w-md space-y-6 text-center">
        <div className="space-y-2">
          <span className="block text-xs uppercase tracking-[0.3em] text-rose-300/70">
            Something went wrong
          </span>
          <h1 className="text-2xl font-semibold text-zinc-50">
            We hit an unexpected error.
          </h1>
          <p className="text-sm text-zinc-400">
            {error.message || "An unknown error occurred."}
          </p>
        </div>

        <div className="flex items-center justify-center gap-3">
          <button
            type="button"
            onClick={reset}
            className="rounded-full bg-[#a44767]/90 px-5 py-2 text-sm font-semibold text-[#fff7fa] transition hover:bg-[#8f3657]"
          >
            Try again
          </button>
          <Link
            href="/"
            className="rounded-full border border-white/10 px-5 py-2 text-sm font-semibold text-zinc-200 transition hover:border-white/30"
          >
            Go home
          </Link>
        </div>
      </div>
    </div>
  );
}

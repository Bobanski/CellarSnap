import Link from "next/link";

export default function NotFound() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-[var(--color-screen-bg)] px-6 text-[var(--color-text-primary)]">
      <div className="w-full max-w-md space-y-6 text-center">
        <div className="space-y-2">
          <span className="block text-xs uppercase tracking-[0.3em] text-[var(--color-accent-secondary)]/70">
            404
          </span>
          <h1 className="text-2xl font-semibold text-[var(--color-text-primary)]">
            Page not found.
          </h1>
          <p className="text-sm text-[var(--color-text-tertiary)]">
            The page you&rsquo;re looking for doesn&rsquo;t exist or has been moved.
          </p>
        </div>

        <Link
          href="/"
          className="inline-block rounded-full bg-[var(--color-accent-primary)]/90 px-5 py-2 text-sm font-semibold text-[var(--color-text-on-accent)] transition hover:bg-[var(--color-accent-primary)]"
        >
          Go home
        </Link>
      </div>
    </div>
  );
}

import Link from "next/link";

function GrapeClusterMark() {
  return (
    <svg
      width="72"
      height="72"
      viewBox="0 0 20 20"
      fill="none"
      className="mx-auto text-[var(--color-accent-secondary)]"
      aria-hidden="true"
    >
      <circle cx="10" cy="6.4" r="3.6" fill="currentColor" opacity="0.9" />
      <circle cx="6.4" cy="11.2" r="3.6" fill="currentColor" opacity="0.7" />
      <circle cx="13.6" cy="11.2" r="3.6" fill="currentColor" opacity="0.5" />
      <circle cx="10" cy="15.6" r="3.2" fill="currentColor" opacity="0.35" />
      <line
        x1="10"
        y1="2.8"
        x2="10"
        y2="1.6"
        stroke="currentColor"
        strokeWidth="0.9"
        strokeLinecap="round"
        opacity="0.6"
      />
    </svg>
  );
}

export default function NotFound() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-[var(--color-screen-bg)] px-6 text-[var(--color-text-primary)]">
      <div className="w-full max-w-md space-y-7 text-center">
        <GrapeClusterMark />

        <div className="space-y-2">
          <span className="block text-xs uppercase tracking-[0.3em] text-[var(--color-accent-secondary)]/70">
            404
          </span>
          <h1
            className="text-[var(--color-text-primary)]"
            style={{ fontFamily: "var(--font-serif)", fontSize: 32, fontWeight: 400 }}
          >
            This one&rsquo;s not on the list.
          </h1>
          <p className="text-sm leading-relaxed text-[var(--color-text-secondary)]">
            The page you&rsquo;re after has been drunk, moved, or never bottled in
            the first place. No judgment &mdash; let&rsquo;s get you back to
            something good.
          </p>
        </div>

        <Link
          href="/feed"
          className="accent-solid-button inline-block rounded-full px-6 py-2.5 text-sm transition"
        >
          Back to your feed
        </Link>
      </div>
    </div>
  );
}

import Link from "next/link";
import WineMatchScore from "@/components/WineMatchScore";

const eyebrowClassName =
  "block text-[10px] uppercase tracking-[0.28em] text-[var(--color-accent-secondary)]";

function ScanGlyph() {
  return (
    <svg width="28" height="28" viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <rect x="2.5" y="3.5" width="15" height="13" rx="2" stroke="currentColor" strokeWidth="1.1" opacity="0.85" />
      <path d="M5.5 7.5h9M5.5 10h9M5.5 12.5h5.5" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" opacity="0.6" />
      <circle cx="10" cy="10" r="8.5" stroke="currentColor" strokeWidth="0.8" opacity="0.2" />
    </svg>
  );
}

function MatchGlyph() {
  return (
    <svg width="28" height="28" viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <circle cx="10" cy="10" r="8" stroke="currentColor" strokeWidth="1.1" opacity="0.35" />
      <path
        d="M10 2a8 8 0 0 1 6.9 12"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        opacity="0.9"
      />
      <path d="M7.2 10.2l2 2 3.6-4.2" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" opacity="0.9" />
    </svg>
  );
}

function PalateGlyph() {
  return (
    <svg width="28" height="28" viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <circle cx="10" cy="6.4" r="3.6" fill="currentColor" opacity="0.9" />
      <circle cx="6.4" cy="11.2" r="3.6" fill="currentColor" opacity="0.7" />
      <circle cx="13.6" cy="11.2" r="3.6" fill="currentColor" opacity="0.5" />
      <circle cx="10" cy="15.6" r="3.2" fill="currentColor" opacity="0.32" />
    </svg>
  );
}

const HOW_IT_WORKS_STEPS = [
  {
    icon: <ScanGlyph />,
    title: "Scan",
    body: "Snap a photo of any wine list, drop in a PDF, or paste a link. No typing required.",
  },
  {
    icon: <MatchGlyph />,
    title: "Matches, with why",
    body: "Every wine on the list gets a match score and a plain-English reason — not just a number.",
  },
  {
    icon: <PalateGlyph />,
    title: "Your palate learns",
    body: "Log what you drink and the read on you gets sharper. Next list, better picks.",
  },
];

const MANIFESTO_LINES = [
  "No wrong answers. No wrong palate.",
  "Specific beats vague — “earthy like wet leaves,” not just “complex.”",
  "Every wine, every budget, equal respect.",
  "We surface what you might like. We never tell you what to like.",
];

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-[var(--color-screen-bg)] text-[var(--color-text-primary)]">
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute -top-40 right-10 h-96 w-96 rounded-full bg-[var(--color-accent-primary)]/10 blur-3xl" />
        <div className="absolute -bottom-40 left-0 h-96 w-96 rounded-full bg-rose-500/10 blur-3xl" />
      </div>

      <div className="relative">
        {/* ── Header ── */}
        <header className="mx-auto flex w-full max-w-6xl items-center justify-between px-6 py-6">
          <span
            className="text-2xl"
            style={{ fontFamily: "var(--font-serif)", fontWeight: 500 }}
          >
            cluster
          </span>
          <Link
            href="/login"
            className="rounded-full border border-[var(--color-border)] px-4 py-2 text-sm font-semibold text-[var(--color-text-primary)] transition hover:border-[var(--color-border-strong)]"
          >
            Sign in
          </Link>
        </header>

        {/* ── Hero: the restaurant moment ── */}
        <section className="mx-auto w-full max-w-4xl px-6 pb-20 pt-10 text-center sm:pt-16">
          <span className={`${eyebrowClassName} mb-4`}>The pocket sommelier</span>
          <h1
            className="mx-auto max-w-3xl text-[var(--color-text-primary)]"
            style={{
              fontFamily: "var(--font-serif)",
              fontWeight: 400,
              fontSize: "clamp(2.25rem, 6vw, 3.25rem)",
              lineHeight: 1.08,
            }}
          >
            Know what to order.
            <br />
            Instantly.
          </h1>
          <p className="mx-auto mt-6 max-w-xl text-base leading-relaxed text-[var(--color-text-secondary)] sm:text-lg">
            Cluster is a somm that learns <em>your</em>{" "}
            palate, not the internet&rsquo;s.
            Scan any restaurant wine list and get picks matched to you &mdash; with a
            reason for each one.
          </p>

          <div className="mt-8 flex flex-col items-center gap-3">
            <Link
              href="/signup?intent=scan"
              className="accent-solid-button inline-block rounded-full px-7 py-3 text-base transition"
            >
              Scan a wine list
            </Link>
            <p className="text-xs text-[var(--color-text-tertiary)]">
              Free account &middot; scan your first list in under a minute
            </p>
          </div>
        </section>

        {/* ── How it works ── */}
        <section className="mx-auto w-full max-w-5xl px-6 pb-20">
          <div className="grid gap-4 sm:grid-cols-3">
            {HOW_IT_WORKS_STEPS.map((step, index) => (
              <div
                key={step.title}
                className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface-primary)]/40 p-6 text-center sm:text-left"
              >
                <div className="flex items-center justify-center gap-3 sm:justify-start">
                  <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[var(--color-accent-soft)] text-[var(--color-accent-secondary)]">
                    {step.icon}
                  </span>
                  <span className="text-xs uppercase tracking-[0.2em] text-[var(--color-text-tertiary)]">
                    Step {index + 1}
                  </span>
                </div>
                <h3
                  className="mt-4 text-[var(--color-text-primary)]"
                  style={{ fontFamily: "var(--font-serif)", fontSize: 22, fontWeight: 400 }}
                >
                  {step.title}
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-[var(--color-text-secondary)]">
                  {step.body}
                </p>
              </div>
            ))}
          </div>
        </section>

        {/* ── Palate story ── */}
        <section className="mx-auto w-full max-w-5xl px-6 pb-20">
          <div className="grid items-center gap-10 rounded-3xl border border-[var(--color-border)] bg-[var(--color-surface-primary)]/40 p-8 sm:grid-cols-[1fr_auto] sm:p-12">
            <div>
              <span className={eyebrowClassName}>The palate engine</span>
              <h2
                className="mt-3 max-w-md text-[var(--color-text-primary)]"
                style={{ fontFamily: "var(--font-serif)", fontSize: "clamp(1.75rem, 4vw, 2.25rem)", fontWeight: 400, lineHeight: 1.15 }}
              >
                Not a score. A read on you.
              </h2>
              <p className="mt-4 max-w-md text-sm leading-relaxed text-[var(--color-text-secondary)] sm:text-base">
                Other apps average a million strangers&rsquo; opinions into one number.
                Cluster builds a private taste profile from what <em>you</em>{" "}
                log and love &mdash; sixteen sensory dimensions, from body to
                minerality &mdash; and reads every wine against it. The more you
                pour, the sharper it gets.
              </p>
              <p className="mt-4 max-w-md text-sm italic leading-relaxed text-[var(--color-text-tertiary)]">
                &ldquo;Bold, structured reds with a savory edge &mdash; like the last
                three Syrahs you loved.&rdquo;
              </p>
            </div>
            <div className="mx-auto w-full max-w-[220px]">
              <WineMatchScore score={94} band="excellent" size="compact" />
            </div>
          </div>
        </section>

        {/* ── Anti-gatekeeping manifesto ── */}
        <section className="mx-auto w-full max-w-4xl px-6 pb-24 text-center">
          <span className={eyebrowClassName}>No gatekeeping</span>
          <h2
            className="mx-auto mt-3 max-w-xl text-[var(--color-text-primary)]"
            style={{ fontFamily: "var(--font-serif)", fontSize: "clamp(1.75rem, 4vw, 2.25rem)", fontWeight: 400, lineHeight: 1.15 }}
          >
            Every palate is equally valid.
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-sm leading-relaxed text-[var(--color-text-secondary)] sm:text-base">
            Cluster isn&rsquo;t a scoring machine, an intimidating wine bible, or
            another app ranking wine for strangers&rsquo; clout. It&rsquo;s wine, made
            fun again &mdash; for the first-timer and the collector, equally.
          </p>

          <ul className="mx-auto mt-8 grid max-w-2xl gap-3 text-left sm:grid-cols-2">
            {MANIFESTO_LINES.map((line) => (
              <li
                key={line}
                className="flex items-start gap-2.5 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-primary)]/30 px-4 py-3 text-sm leading-relaxed text-[var(--color-text-primary)]"
              >
                <span className="mt-0.5 text-[var(--color-accent-secondary)]">+</span>
                {line}
              </li>
            ))}
          </ul>

          <div className="mt-10">
            <Link
              href="/signup?intent=scan"
              className="accent-solid-button inline-block rounded-full px-7 py-3 text-base transition"
            >
              Scan a wine list
            </Link>
          </div>
        </section>

        {/* ── Footer ── */}
        <footer className="mx-auto w-full max-w-6xl border-t border-[var(--color-border)] px-6 py-8">
          <div className="flex flex-col items-center justify-between gap-4 text-center sm:flex-row sm:text-left">
            <span
              className="text-sm text-[var(--color-text-tertiary)]"
              style={{ fontFamily: "var(--font-serif)" }}
            >
              cluster
            </span>
            <div className="flex items-center gap-4 text-[11px] uppercase tracking-[0.2em] text-[var(--color-text-tertiary)]">
              <Link href="/privacy" className="transition hover:text-[var(--color-accent-secondary)]">
                Privacy
              </Link>
              <Link href="/terms" className="transition hover:text-[var(--color-accent-secondary)]">
                Terms
              </Link>
            </div>
          </div>
        </footer>
      </div>
    </div>
  );
}

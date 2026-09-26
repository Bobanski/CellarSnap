import Link from "next/link";
import { TERMS_CONTACT, TERMS_PARAGRAPHS, TERMS_UPDATED } from "@shared";

export default function TermsPage() {
  return (
    <div className="min-h-screen bg-[var(--color-screen-bg)] px-6 py-10 text-[var(--color-text-primary)]">
      <div className="mx-auto w-full max-w-3xl space-y-8">
        <header className="space-y-2">
          <div className="flex items-center justify-between gap-4">
            <p className="text-xs uppercase tracking-[0.25em] text-[var(--color-accent-secondary)]/70">
              Legal
            </p>
            <Link
              href="/"
              className="rounded-full border border-[var(--color-border)] px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.2em] text-[var(--color-text-primary)] transition hover:border-[var(--color-border-strong)] hover:text-[var(--color-accent-secondary)]"
            >
              Home
            </Link>
          </div>
          <h1 className="font-serif text-3xl font-semibold text-[var(--color-text-primary)]">Terms of Use</h1>
          <p className="text-sm text-[var(--color-text-tertiary)]">Last updated: {TERMS_UPDATED}</p>
        </header>

        <section className="space-y-4 rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface-primary)]/10 p-6 text-sm leading-6 text-[var(--color-text-secondary)]">
          {TERMS_PARAGRAPHS.map((paragraph) => <p key={paragraph}>{paragraph}</p>)}
          <p>
            Questions about these terms: <a className="underline" href={`mailto:${TERMS_CONTACT}`}>{TERMS_CONTACT}</a>.
          </p>
        </section>

        <footer className="text-xs uppercase tracking-[0.2em] text-[var(--color-text-tertiary)]">
          <Link href="/privacy" className="transition hover:text-[var(--color-accent-secondary)]">
            Privacy
          </Link>
          {" · "}
          <Link href="/feedback" className="transition hover:text-[var(--color-accent-secondary)]">
            Feedback
          </Link>
        </footer>
      </div>
    </div>
  );
}

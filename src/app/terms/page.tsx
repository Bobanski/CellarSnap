import Link from "next/link";

const LAST_UPDATED = "February 12, 2026";

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
          <p className="text-sm text-[var(--color-text-tertiary)]">Last updated: {LAST_UPDATED}</p>
        </header>

        <section className="space-y-4 rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface-primary)]/10 p-6 text-sm leading-6 text-[var(--color-text-secondary)]">
          <p>
            Cluster is currently provided as a friends-and-family test product.
            Features may change quickly, and service availability is not guaranteed.
          </p>
          <p>
            You are responsible for the content you upload and share. Do not upload
            unlawful content, private data you do not have permission to share, or
            anything that violates others&apos; rights.
          </p>
          <p>
            AI-assisted outputs are suggestions and may be wrong. Please verify wine
            details before relying on them.
          </p>
          <p>
            We may suspend accounts or remove content to protect users, data integrity,
            or platform security during testing.
          </p>
          <p>
            By using Cluster, you agree to these terms and the accompanying privacy
            policy.
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

import Link from "next/link";

const LAST_UPDATED = "February 12, 2026";

export default function PrivacyPage() {
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
          <h1 className="text-3xl font-semibold text-[var(--color-text-primary)]">Privacy Policy</h1>
          <p className="text-sm text-[var(--color-text-tertiary)]">Last updated: {LAST_UPDATED}</p>
        </header>

        <section className="space-y-4 rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface-primary)] p-6 text-sm leading-6 text-[var(--color-text-secondary)]">
          <p>
            Cluster stores the account details and wine-log content needed to run the
            app, including profile info, entries, photos, social relationships, and
            feedback submissions.
          </p>
          <p>
            Photos and entry metadata are access-controlled by your privacy settings
            (public, friends, or private). Signed URLs are used for photo delivery.
          </p>
          <p>
            AI features process uploaded images and notes through OpenAI APIs to provide
            autofill and summary assistance. Do not upload sensitive personal images.
          </p>
          <p>
            We use operational logs and error telemetry to keep the product reliable
            during testing. Data is retained as needed for product operation and safety.
          </p>
          <p>
            For feedback-related requests during the friends-and-family phase, submit a
            note through the in-app feedback page.
          </p>
          <p>
            For more info,{" "}
            <Link href="/privacy/more" className="font-semibold text-[var(--color-accent-secondary)] transition hover:text-[var(--color-accent-secondary)]">
              click here
            </Link>
            .
          </p>
        </section>

        <footer className="text-xs uppercase tracking-[0.2em] text-[var(--color-text-tertiary)]">
          <Link href="/terms" className="transition hover:text-[var(--color-accent-secondary)]">
            Terms
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

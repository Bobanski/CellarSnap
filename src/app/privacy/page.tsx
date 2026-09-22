import Link from "next/link";

import { PRIVACY_UPDATED, PRIVACY_SECTIONS } from "@shared";
import AiConsentSettings from "@/features/privacy/AiConsentSettings";

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
          <h1 className="font-serif text-3xl font-semibold text-[var(--color-text-primary)]">Privacy Policy</h1>
          <p className="text-sm text-[var(--color-text-tertiary)]">Last updated: {PRIVACY_UPDATED}</p>
        </header>

        <AiConsentSettings />
        {PRIVACY_SECTIONS.map(section => <section key={section.title} className="space-y-3 rounded-2xl border border-[var(--color-border)] p-6 text-sm leading-6 text-[var(--color-text-secondary)]">
          <h2 className="text-lg font-semibold text-[var(--color-text-primary)]">{section.title}</h2>
          {section.paragraphs.map(text => <p key={text}>{text}</p>)}
        </section>)}

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

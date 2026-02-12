import Link from "next/link";

const LAST_UPDATED = "February 12, 2026";

export default function TermsPage() {
  return (
    <div className="min-h-screen bg-[#0f0a09] px-6 py-10 text-zinc-100">
      <div className="mx-auto w-full max-w-3xl space-y-8">
        <header className="space-y-2">
          <p className="text-xs uppercase tracking-[0.25em] text-amber-300/70">
            Legal
          </p>
          <h1 className="text-3xl font-semibold text-zinc-50">Terms of Use</h1>
          <p className="text-sm text-zinc-400">Last updated: {LAST_UPDATED}</p>
        </header>

        <section className="space-y-4 rounded-2xl border border-white/10 bg-white/5 p-6 text-sm leading-6 text-zinc-300">
          <p>
            CellarSnap is currently provided as a friends-and-family test product.
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
            By using CellarSnap, you agree to these terms and the accompanying privacy
            policy.
          </p>
        </section>

        <footer className="text-xs uppercase tracking-[0.2em] text-zinc-500">
          <Link href="/privacy" className="transition hover:text-amber-200">
            Privacy
          </Link>
          {" · "}
          <Link href="/feedback" className="transition hover:text-amber-200">
            Feedback
          </Link>
        </footer>
      </div>
    </div>
  );
}

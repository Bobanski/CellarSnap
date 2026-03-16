import Link from "next/link";

const LAST_UPDATED = "February 12, 2026";

export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-[#0f0a09] px-6 py-10 text-zinc-100">
      <div className="mx-auto w-full max-w-3xl space-y-8">
        <header className="space-y-2">
          <div className="flex items-center justify-between gap-4">
            <p className="text-xs uppercase tracking-[0.25em] text-amber-300/70">
              Legal
            </p>
            <Link
              href="/"
              className="rounded-full border border-white/10 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.2em] text-zinc-200 transition hover:border-white/30 hover:text-amber-200"
            >
              Home
            </Link>
          </div>
          <h1 className="text-3xl font-semibold text-zinc-50">Privacy Policy</h1>
          <p className="text-sm text-zinc-400">Last updated: {LAST_UPDATED}</p>
        </header>

        <section className="space-y-4 rounded-2xl border border-white/10 bg-white/5 p-6 text-sm leading-6 text-zinc-300">
          <p>
            CellarSnap stores the account details and wine-log content needed to run the
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
            <Link href="/privacy/more" className="font-semibold text-amber-200 transition hover:text-amber-100">
              click here
            </Link>
            .
          </p>
        </section>

        <footer className="text-xs uppercase tracking-[0.2em] text-zinc-500">
          <Link href="/terms" className="transition hover:text-amber-200">
            Terms
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

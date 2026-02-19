import Link from "next/link";

const LAST_UPDATED = "February 19, 2026";

export default function SmsCompliancePage() {
  return (
    <div className="min-h-screen bg-[#0f0a09] px-6 py-10 text-zinc-100">
      <div className="mx-auto w-full max-w-3xl space-y-8">
        <header className="space-y-2">
          <div className="flex items-center justify-between gap-4">
            <p className="text-xs uppercase tracking-[0.25em] text-amber-300/70">
              Compliance
            </p>
            <Link
              href="/"
              className="rounded-full border border-white/10 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.2em] text-zinc-200 transition hover:border-white/30 hover:text-amber-200"
            >
              Home
            </Link>
          </div>
          <h1 className="text-3xl font-semibold text-zinc-50">
            SMS Compliance and Opt-In
          </h1>
          <p className="text-sm text-zinc-400">Last updated: {LAST_UPDATED}</p>
        </header>

        <section className="space-y-4 rounded-2xl border border-white/10 bg-white/5 p-6 text-sm leading-6 text-zinc-300">
          <h2 className="text-base font-semibold text-zinc-100">Business Information</h2>
          <p>
            Brand name: CellarSnap
            <br />
            Legal entity: Ethan Sneider
            <br />
            Website: https://cellarsnap.app
            <br />
            Support email: cellarsnap@gmail.com
          </p>
        </section>

        <section className="space-y-4 rounded-2xl border border-white/10 bg-white/5 p-6 text-sm leading-6 text-zinc-300">
          <h2 className="text-base font-semibold text-zinc-100">Use Case</h2>
          <p>
            CellarSnap uses SMS only for account authentication and login verification.
            Messages are transactional and user initiated. CellarSnap does not send
            marketing or promotional SMS.
          </p>
        </section>

        <section className="space-y-4 rounded-2xl border border-white/10 bg-white/5 p-6 text-sm leading-6 text-zinc-300">
          <h2 className="text-base font-semibold text-zinc-100">Opt-In Flow</h2>
          <ol className="list-decimal space-y-2 pl-5">
            <li>User opens the signup page: https://cellarsnap.app/signup</li>
            <li>User enters a phone number and submits account creation</li>
            <li>User receives a one-time verification code by SMS</li>
            <li>User enters the code on https://cellarsnap.app/verify-phone</li>
          </ol>
          <p>
            Message frequency varies based on account activity. Message and data rates may
            apply.
          </p>
        </section>

        <section className="space-y-4 rounded-2xl border border-white/10 bg-white/5 p-6 text-sm leading-6 text-zinc-300">
          <h2 className="text-base font-semibold text-zinc-100">Message Samples</h2>
          <p>
            OTP sample: CellarSnap code: 123456. This code expires in 10 minutes.
          </p>
          <p>Help sample: For help, reply HELP or email cellarsnap@gmail.com.</p>
          <p>Opt-out sample: Reply STOP to opt out of SMS messages.</p>
        </section>

        <section className="space-y-4 rounded-2xl border border-white/10 bg-white/5 p-6 text-sm leading-6 text-zinc-300">
          <h2 className="text-base font-semibold text-zinc-100">Policies</h2>
          <p>
            Privacy policy:{" "}
            <Link
              href="/privacy/more"
              className="font-semibold text-amber-200 transition hover:text-amber-100"
            >
              https://cellarsnap.app/privacy/more
            </Link>
          </p>
          <p>
            Terms of use:{" "}
            <Link
              href="/terms"
              className="font-semibold text-amber-200 transition hover:text-amber-100"
            >
              https://cellarsnap.app/terms
            </Link>
          </p>
        </section>
      </div>
    </div>
  );
}

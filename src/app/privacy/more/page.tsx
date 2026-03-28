import Link from "next/link";

const LAST_UPDATED = "February 13, 2026";

export default function PrivacyMorePage() {
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
          <h1 className="text-3xl font-semibold text-[var(--color-text-primary)]">
            Privacy Policy - Cluster
          </h1>
          <p className="text-sm text-[var(--color-text-tertiary)]">Last updated: {LAST_UPDATED}</p>
        </header>

        <section className="space-y-6 rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface-primary)]/10 p-6 text-sm leading-6 text-[var(--color-text-secondary)]">
          <div className="space-y-2">
            <h2 className="text-base font-semibold text-[var(--color-text-primary)]">Overview</h2>
            <p>
              Cluster is a web and mobile application that allows users to log wine entries,
              upload photos, and connect with friends.
            </p>
            <p>This Privacy Policy explains what information we collect and how it is used.</p>
          </div>

          <div className="space-y-2">
            <h2 className="text-base font-semibold text-[var(--color-text-primary)]">Information We Collect</h2>
            <p>
              Cluster stores the account details and wine-log content needed to operate the
              application, including:
            </p>
            <ul className="list-disc space-y-1 pl-5">
              <li>Profile information (username, display name)</li>
              <li>Wine entries and tasting notes</li>
              <li>Uploaded photos</li>
              <li>Social connections</li>
              <li>Feedback submissions</li>
            </ul>
            <p>
              Operational logs and error telemetry may also be collected to maintain system
              reliability.
            </p>
          </div>

          <div className="space-y-2">
            <h2 className="text-base font-semibold text-[var(--color-text-primary)]">SMS Authentication</h2>
            <p>
              If you provide your phone number to log into your account, Cluster may send a
              one-time verification code via SMS to authenticate your login.
            </p>
            <ul className="list-disc space-y-1 pl-5">
              <li>Messages are transactional only</li>
              <li>Messages are sent only when initiated by the user</li>
              <li>Cluster does not send marketing or promotional messages</li>
            </ul>
            <p>
              You may reply STOP to opt out of SMS messages at any time. Reply HELP for
              assistance.
            </p>
            <p>Message frequency varies based on login activity.</p>
          </div>

          <div className="space-y-2">
            <h2 className="text-base font-semibold text-[var(--color-text-primary)]">AI Processing</h2>
            <p>
              Certain features may process uploaded images or tasting notes through third-party AI
              services (such as OpenAI APIs) to provide autofill or summary assistance.
            </p>
            <p>Users should not upload sensitive personal content.</p>
          </div>

          <div className="space-y-2">
            <h2 className="text-base font-semibold text-[var(--color-text-primary)]">Data Sharing</h2>
            <p>Cluster does not sell personal information.</p>
            <p>
              Information may be processed by trusted service providers necessary to operate the
              application, including:
            </p>
            <ul className="list-disc space-y-1 pl-5">
              <li>Hosting infrastructure providers</li>
              <li>Authentication services</li>
              <li>AI processing services</li>
            </ul>
            <p>These providers process data solely to provide application functionality.</p>
          </div>

          <div className="space-y-2">
            <h2 className="text-base font-semibold text-[var(--color-text-primary)]">Data Security</h2>
            <p>
              Reasonable technical and organizational safeguards are implemented to protect user
              information.
            </p>
          </div>

          <div className="space-y-2">
            <h2 className="text-base font-semibold text-[var(--color-text-primary)]">Data Retention</h2>
            <p>
              Information is retained as long as necessary to operate the service and maintain
              account functionality.
            </p>
          </div>

          <div className="space-y-2">
            <h2 className="text-base font-semibold text-[var(--color-text-primary)]">Contact</h2>
            <p>For privacy-related questions, contact:</p>
            <p className="font-medium text-[var(--color-text-primary)]">cellarsnap@gmail.com</p>
          </div>
        </section>

        <footer className="text-xs uppercase tracking-[0.2em] text-[var(--color-text-tertiary)]">
          <Link href="/privacy" className="transition hover:text-[var(--color-accent-secondary)]">
            Privacy
          </Link>
          {" · "}
          <Link href="/terms" className="transition hover:text-[var(--color-accent-secondary)]">
            Terms
          </Link>
        </footer>
      </div>
    </div>
  );
}

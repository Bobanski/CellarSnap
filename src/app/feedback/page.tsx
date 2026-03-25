"use client";

import Link from "next/link";
import { FormEvent, useMemo, useState } from "react";
import AppShell from "@/components/AppShell";

const CATEGORIES = [
  { value: "bug", label: "Bug report" },
  { value: "idea", label: "Feature idea" },
  { value: "ux", label: "UX confusion" },
  { value: "other", label: "Other" },
] as const;

type CategoryValue = (typeof CATEGORIES)[number]["value"];

export default function FeedbackPage() {
  const [category, setCategory] = useState<CategoryValue>("bug");
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const trimmedMessageLength = message.trim().length;
  const remainingChars = useMemo(() => 2000 - message.length, [message.length]);

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setErrorMessage(null);
    setSuccessMessage(null);

    if (trimmedMessageLength < 10) {
      setErrorMessage("Please include a little more detail (at least 10 characters).");
      return;
    }

    setIsSubmitting(true);
    try {
      const response = await fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          category,
          email: email.trim() || undefined,
          message: message.trim(),
          page_path: "/feedback",
        }),
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        setErrorMessage(payload.error ?? "Unable to submit feedback.");
        return;
      }

      setMessage("");
      setSuccessMessage("Thanks. Feedback received.");
    } catch {
      setErrorMessage("Unable to submit feedback. Check your connection and try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <AppShell>
      <div className="px-6 py-6 text-[var(--color-text-primary)]">
      <div className="mx-auto w-full max-w-2xl space-y-8">
        <header className="space-y-2">
          <p className="text-xs uppercase tracking-[0.25em] text-[var(--color-accent-secondary)]/70">
            Feedback
          </p>
          <h1 className="text-3xl font-semibold text-[var(--color-text-primary)]">
            Tell us what felt great and what broke
          </h1>
          <p className="text-sm text-[var(--color-text-secondary)]">
            Lightweight launch feedback form. We read every submission.
          </p>
        </header>

        <form
          onSubmit={onSubmit}
          className="space-y-5 rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface-primary)]/10 p-6"
        >
          <div>
            <label htmlFor="category" className="text-sm font-medium text-[var(--color-text-primary)]">
              Type
            </label>
            <select
              id="category"
              value={category}
              onChange={(event) => setCategory(event.target.value as CategoryValue)}
              className="select-field mt-1 w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-muted)] px-3 py-2 text-sm text-[var(--color-text-primary)] focus:border-[var(--color-accent-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-accent-primary)]/30"
            >
              {CATEGORIES.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="message" className="text-sm font-medium text-[var(--color-text-primary)]">
              What happened?
            </label>
            <textarea
              id="message"
              value={message}
              onChange={(event) => {
                const next = event.target.value;
                setMessage(next);
                if (successMessage) {
                  setSuccessMessage(null);
                }
                if (errorMessage && next.trim().length >= 10) {
                  setErrorMessage(null);
                }
              }}
              rows={7}
              maxLength={2000}
              className="mt-1 w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-muted)] px-3 py-2 text-sm text-[var(--color-text-primary)] placeholder:text-[var(--color-text-tertiary)] focus:border-[var(--color-accent-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-accent-primary)]/30"
              placeholder="Steps, what you expected, what actually happened."
            />
            <p className="mt-1 text-xs text-[var(--color-text-tertiary)]">{remainingChars} characters left</p>
            <p className="mt-1 text-xs text-[var(--color-text-tertiary)]">
              Minimum: 10 characters.
            </p>
          </div>

          <div>
            <label htmlFor="email" className="text-sm font-medium text-[var(--color-text-primary)]">
              Email (optional)
            </label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              className="mt-1 w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-muted)] px-3 py-2 text-sm text-[var(--color-text-primary)] placeholder:text-[var(--color-text-tertiary)] focus:border-[var(--color-accent-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-accent-primary)]/30"
              placeholder="you@example.com"
            />
          </div>

          {errorMessage ? <p className="text-sm text-rose-300">{errorMessage}</p> : null}
          {successMessage ? (
            <p className="text-sm text-emerald-300">{successMessage}</p>
          ) : null}

          <div className="flex flex-wrap items-center gap-3">
            <button
              type="submit"
              disabled={isSubmitting}
              className="rounded-xl bg-[var(--color-accent-primary)] px-4 py-2 text-sm font-semibold text-[var(--color-text-on-accent)] transition hover:bg-[var(--color-accent-primary)] disabled:cursor-not-allowed disabled:opacity-70"
            >
              {isSubmitting ? "Sending..." : "Send feedback"}
            </button>
            <Link
              href="/"
              className="rounded-xl border border-[var(--color-border)] px-4 py-2 text-sm font-semibold text-[var(--color-text-primary)] transition hover:border-[var(--color-border-strong)]"
            >
              Back home
            </Link>
          </div>
        </form>

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
    </AppShell>
  );
}

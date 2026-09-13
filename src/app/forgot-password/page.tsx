"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { useRouter } from "next/navigation";
import Link from "next/link";

type ForgotFormValues = {
  identifier: string;
};

export default function ForgotPasswordPage() {
  const router = useRouter();
  const { register, handleSubmit } = useForm<ForgotFormValues>();
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const onSubmit = handleSubmit(async (values) => {
    const identifier = values.identifier.trim();
    if (!identifier) {
      setErrorMessage("Enter your username, phone number, or email.");
      return;
    }

    setIsSubmitting(true);
    setErrorMessage(null);

    try {
      const response = await fetch("/api/auth/recovery-start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ identifier, redirectTo: `${window.location.origin}/reset-password` }),
      });
      const payload = await response.json();
      if (!response.ok) {
        setErrorMessage(payload.error ?? "Unable to start recovery.");
        return;
      }
      if (payload.channel === "phone" && payload.phone) {
        router.push(`/reset-password/phone?phone=${encodeURIComponent(payload.phone)}`);
        return;
      }
      // Only prefill contact information the person supplied themselves.
      const email = identifier.includes("@") ? identifier.toLowerCase() : "";
      router.push(`/reset-password${email ? `?email=${encodeURIComponent(email)}` : ""}`);
    } catch {
      setErrorMessage("Unable to start recovery. Check your connection and try again.");
    } finally {
      setIsSubmitting(false);
    }
  });

  return (
    <div className="min-h-screen bg-[var(--color-screen-bg)] px-6 py-10 text-[var(--color-text-primary)]">
      <div className="mx-auto w-full max-w-md space-y-6 rounded-3xl border border-[var(--color-border)] bg-[var(--color-surface-primary)]/10 p-8 shadow-[0_30px_80px_-40px_rgba(0,0,0,0.8)] backdrop-blur">
        <div className="space-y-2">
          <span className="text-xs uppercase tracking-[0.3em] text-[var(--color-accent-secondary)]/70">
            Reset access
          </span>
          <h1 className="font-serif text-2xl font-semibold text-[var(--color-text-primary)]">Forgot your password?</h1>
          <p className="text-sm text-[var(--color-text-secondary)]">
            Enter your username, phone number, or email. If an account matches, we will send recovery instructions. Use your phone number for SMS recovery, or your email or username for email recovery.
          </p>
        </div>

        <form className="space-y-4" onSubmit={onSubmit}>
          <div>
            <label className="text-sm font-medium text-[var(--color-text-primary)]" htmlFor="identifier">
              Username, phone, or email
            </label>
            <input
              id="identifier"
              type="text"
              autoComplete="username"
              className="mt-1 w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-muted)] px-3 py-2 text-sm text-[var(--color-text-primary)] placeholder:text-[var(--color-text-tertiary)] focus:border-[var(--color-accent-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-accent-primary)]/30"
              placeholder="username or (555) 123-4567"
              {...register("identifier", { required: true })}
            />
          </div>

          {errorMessage ? <p className="text-sm text-rose-300">{errorMessage}</p> : null}

          <button
            type="submit"
            className="w-full rounded-xl bg-[var(--color-accent-primary)] px-4 py-2 text-sm font-semibold text-[var(--color-text-on-accent)] transition hover:bg-[var(--color-accent-primary)] disabled:cursor-not-allowed disabled:opacity-70"
            disabled={isSubmitting}
          >
            Send recovery code
          </button>
        </form>

        <div className="text-center">
          <Link
            href="/login"
            className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--color-text-tertiary)] transition hover:text-[var(--color-accent-secondary)]"
          >
            Back to sign in
          </Link>
        </div>
      </div>
    </div>
  );
}

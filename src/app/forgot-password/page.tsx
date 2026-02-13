"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import Link from "next/link";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import { normalizePhone } from "@/lib/validation/phone";

type ForgotFormValues = {
  identifier: string;
};

export default function ForgotPasswordPage() {
  const supabase = createSupabaseBrowserClient();
  const { register, handleSubmit } = useForm<ForgotFormValues>();
  const [message, setMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const onSubmit = handleSubmit(async (values) => {
    const identifier = values.identifier.trim();
    if (!identifier) {
      setErrorMessage("Enter your email or phone number to reset your password.");
      return;
    }

    setIsSubmitting(true);
    setErrorMessage(null);
    setMessage(null);

    let targetEmail: string | null = null;
    const normalizedPhone = normalizePhone(identifier);

    if (normalizedPhone) {
      const resolveResponse = await fetch("/api/auth/resolve-identifier", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ identifier: normalizedPhone, mode: "phone" }),
      });

      if (!resolveResponse.ok) {
        const payload = await resolveResponse.json().catch(() => ({}));
        setIsSubmitting(false);
        setErrorMessage(payload.error ?? "No account matches that phone number.");
        return;
      }

      const payload = (await resolveResponse.json()) as { email?: string };
      targetEmail = payload.email?.trim() ?? null;
    } else if (identifier.includes("@")) {
      targetEmail = identifier;
    } else {
      setIsSubmitting(false);
      setErrorMessage("Enter a valid email or phone number.");
      return;
    }

    if (!targetEmail) {
      setIsSubmitting(false);
      setErrorMessage("No account email is available for this reset request.");
      return;
    }

    const { error } = await supabase.auth.resetPasswordForEmail(targetEmail, {
      redirectTo: `${window.location.origin}/reset-password`,
    });

    setIsSubmitting(false);

    if (error) {
      setErrorMessage(error.message);
      return;
    }

    setMessage("Password reset email sent. Check your inbox.");
  });

  return (
    <div className="min-h-screen bg-[#0f0a09] px-6 py-10 text-zinc-100">
      <div className="mx-auto w-full max-w-md space-y-6 rounded-3xl border border-white/10 bg-white/5 p-8 shadow-[0_30px_80px_-40px_rgba(0,0,0,0.8)] backdrop-blur">
        <div className="space-y-2">
          <span className="text-xs uppercase tracking-[0.3em] text-amber-300/70">
            Reset access
          </span>
          <h1 className="text-2xl font-semibold text-zinc-50">
            Forgot your password?
          </h1>
          <p className="text-sm text-zinc-300">
            Enter your account email or phone number and we’ll send a reset link.
          </p>
        </div>

        <form className="space-y-4" onSubmit={onSubmit}>
          <div>
            <label className="text-sm font-medium text-zinc-200" htmlFor="identifier">
              Email or phone
            </label>
            <input
              id="identifier"
              type="text"
              autoComplete="email"
              className="mt-1 w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-500 focus:border-amber-300 focus:outline-none focus:ring-2 focus:ring-amber-300/30"
              placeholder="you@example.com or (555) 123-4567"
              {...register("identifier", { required: true })}
            />
          </div>

          {errorMessage ? (
            <p className="text-sm text-rose-300">{errorMessage}</p>
          ) : null}
          {message ? (
            <p className="text-sm text-emerald-300">{message}</p>
          ) : null}

          <button
            type="submit"
            className="w-full rounded-xl bg-amber-400 px-4 py-2 text-sm font-semibold text-zinc-950 transition hover:bg-amber-300 disabled:cursor-not-allowed disabled:opacity-70"
            disabled={isSubmitting}
          >
            Send reset link
          </button>
        </form>

        <div className="text-center">
          <Link
            href="/login"
            className="text-xs font-semibold uppercase tracking-[0.2em] text-zinc-400 transition hover:text-amber-200"
          >
            Back to sign in
          </Link>
        </div>
      </div>
    </div>
  );
}

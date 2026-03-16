"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import { getAuthMode } from "@/lib/auth/mode";

type ForgotFormValues = {
  identifier: string;
};

type ResolvedIdentifier = {
  email?: string | null;
  phone?: string | null;
};

export default function ForgotPasswordPage() {
  const router = useRouter();
  const supabase = createSupabaseBrowserClient();
  const authMode = getAuthMode();
  const { register, handleSubmit } = useForm<ForgotFormValues>();
  const [message, setMessage] = useState<string | null>(null);
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
    setMessage(null);

    try {
      const resolveResponse = await fetch("/api/auth/resolve-identifier", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ identifier, mode: "auto" }),
      });

      if (!resolveResponse.ok) {
        const payload = await resolveResponse.json().catch(() => ({}));
        setErrorMessage(payload.error ?? "No account matches that identifier.");
        return;
      }

      const payload = (await resolveResponse.json()) as ResolvedIdentifier;
      const phone = payload.phone?.trim() ?? "";
      const email = payload.email?.trim().toLowerCase() ?? "";

      if (authMode !== "phone" || !phone) {
        // Legacy accounts may not have a phone yet; fall back to email reset.
        if (!email) {
          setErrorMessage(
            authMode === "phone"
              ? "This account does not have a phone number for recovery."
              : "No account matches that identifier."
          );
          return;
        }

        const { error: resetError } = await supabase.auth.resetPasswordForEmail(
          email,
          {
            redirectTo: `${window.location.origin}/reset-password`,
          }
        );

        if (resetError) {
          setErrorMessage(resetError.message);
          return;
        }

        if (typeof window !== "undefined") {
          try {
            window.sessionStorage.setItem("pendingRecoveryEmail", email);
          } catch {
            // Ignore client storage failures.
          }
        }

        setMessage("Recovery email sent. Enter the code to reset your password.");
        router.push(`/reset-password?email=${encodeURIComponent(email)}`);
        return;
      }

      const { error } = await supabase.auth.signInWithOtp({
        phone,
        options: { shouldCreateUser: false },
      });

      if (error) {
        setErrorMessage(error.message);
        return;
      }

      if (typeof window !== "undefined") {
        try {
          window.sessionStorage.setItem("pendingRecoveryPhone", phone);
        } catch {
          // Ignore client storage failures.
        }
      }

      setMessage("Verification code sent to your phone number.");
      router.push(`/reset-password/phone?phone=${encodeURIComponent(phone)}`);
    } catch {
      setErrorMessage("Unable to start recovery. Check your connection and try again.");
    } finally {
      setIsSubmitting(false);
    }
  });

  return (
    <div className="min-h-screen bg-[#0f0a09] px-6 py-10 text-zinc-100">
      <div className="mx-auto w-full max-w-md space-y-6 rounded-3xl border border-white/10 bg-white/5 p-8 shadow-[0_30px_80px_-40px_rgba(0,0,0,0.8)] backdrop-blur">
        <div className="space-y-2">
          <span className="text-xs uppercase tracking-[0.3em] text-amber-300/70">
            Reset access
          </span>
          <h1 className="text-2xl font-semibold text-zinc-50">Forgot your password?</h1>
          <p className="text-sm text-zinc-300">
            Enter your username, phone number, or email. We will send a recovery code to your phone
            (or email if your account does not have a phone number yet).
          </p>
        </div>

        <form className="space-y-4" onSubmit={onSubmit}>
          <div>
            <label className="text-sm font-medium text-zinc-200" htmlFor="identifier">
              Username, phone, or email
            </label>
            <input
              id="identifier"
              type="text"
              autoComplete="username"
              className="mt-1 w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-500 focus:border-amber-300 focus:outline-none focus:ring-2 focus:ring-amber-300/30"
              placeholder="username or (555) 123-4567"
              {...register("identifier", { required: true })}
            />
          </div>

          {errorMessage ? <p className="text-sm text-rose-300">{errorMessage}</p> : null}
          {message ? <p className="text-sm text-emerald-300">{message}</p> : null}

          <button
            type="submit"
            className="w-full rounded-xl bg-amber-400 px-4 py-2 text-sm font-semibold text-zinc-950 transition hover:bg-amber-300 disabled:cursor-not-allowed disabled:opacity-70"
            disabled={isSubmitting}
          >
            Send recovery code
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

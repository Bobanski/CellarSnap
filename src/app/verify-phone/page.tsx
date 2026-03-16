"use client";

import { Suspense, useMemo, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import {
  formatPhoneForInput,
  normalizePhone,
  PHONE_FORMAT_MESSAGE,
} from "@/lib/validation/phone";

type VerifyPhoneFormValues = {
  phone: string;
  code: string;
};

export default function VerifyPhonePage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-[var(--color-screen-bg)] px-6 py-10 text-[var(--color-text-primary)]">
          <div className="mx-auto w-full max-w-md rounded-3xl border border-[var(--color-border)] bg-[var(--color-surface-primary)]/10 p-8 text-sm text-[var(--color-text-secondary)] shadow-[0_30px_80px_-40px_rgba(0,0,0,0.8)] backdrop-blur">
            Loading...
          </div>
        </div>
      }
    >
      <VerifyPhoneInner />
    </Suspense>
  );
}

function VerifyPhoneInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const supabase = createSupabaseBrowserClient();

  const initialPhone = useMemo(() => {
    const fromQuery = searchParams.get("phone") ?? "";
    if (fromQuery) {
      return formatPhoneForInput(fromQuery);
    }
    if (typeof window !== "undefined") {
      const fromStorage = window.sessionStorage.getItem("pendingSignupPhone") ?? "";
      return formatPhoneForInput(fromStorage);
    }
    return "";
  }, [searchParams]);

  const { control, register, handleSubmit } = useForm<VerifyPhoneFormValues>({
    defaultValues: {
      phone: initialPhone,
      code: "",
    },
  });

  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const onSubmit = handleSubmit(async (values) => {
    setErrorMessage(null);

    const normalizedPhone = normalizePhone(values.phone);
    if (!normalizedPhone) {
      setErrorMessage(PHONE_FORMAT_MESSAGE);
      return;
    }

    const token = values.code.trim();
    if (!token) {
      setErrorMessage("Verification code is required.");
      return;
    }

    setIsSubmitting(true);

    try {
      const { error: verifyError } = await supabase.auth.verifyOtp({
        phone: normalizedPhone,
        token,
        type: "sms",
      });

      if (verifyError) {
        setErrorMessage(verifyError.message);
        return;
      }

      const pendingUsername =
        typeof window !== "undefined"
          ? window.sessionStorage.getItem("pendingSignupUsername")?.trim() ?? ""
          : "";
      const pendingEmail =
        typeof window !== "undefined"
          ? window.sessionStorage.getItem("pendingSignupEmail")?.trim().toLowerCase() ?? ""
          : "";

      const profileResponse = await fetch("/api/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...(pendingUsername ? { display_name: pendingUsername } : {}),
          ...(pendingEmail ? { email: pendingEmail } : {}),
          phone: normalizedPhone,
        }),
      });

      if (!profileResponse.ok) {
        const payload = await profileResponse.json().catch(() => ({}));
        setErrorMessage(payload.error ?? "Unable to finalize account setup.");
        return;
      }

      if (typeof window !== "undefined") {
        window.sessionStorage.removeItem("pendingSignupUsername");
        window.sessionStorage.removeItem("pendingSignupEmail");
        window.sessionStorage.removeItem("pendingSignupPhone");
      }

      router.push("/");
    } catch {
      setErrorMessage("Unable to verify code right now. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  });

  return (
    <div className="min-h-screen bg-[var(--color-screen-bg)] px-6 py-10 text-[var(--color-text-primary)]">
      <div className="mx-auto w-full max-w-md space-y-6 rounded-3xl border border-[var(--color-border)] bg-[var(--color-surface-primary)]/10 p-8 shadow-[0_30px_80px_-40px_rgba(0,0,0,0.8)] backdrop-blur">
        <div className="space-y-2">
          <span className="text-xs uppercase tracking-[0.3em] text-[var(--color-accent-gold)]/70">Verify phone</span>
          <h1 className="text-2xl font-semibold text-[var(--color-text-primary)]">Enter your confirmation code</h1>
          <p className="text-sm text-[var(--color-text-secondary)]">
            We sent a verification code to your phone number.
          </p>
        </div>

        <form className="space-y-4" onSubmit={onSubmit}>
          <div>
            <label className="text-sm font-medium text-[var(--color-text-primary)]" htmlFor="phone">
              Phone number
            </label>
            <Controller
              name="phone"
              control={control}
              rules={{ required: true }}
              render={({ field }) => (
                <input
                  {...field}
                  id="phone"
                  type="tel"
                  autoComplete="tel"
                  className="mt-1 w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-muted)] px-3 py-2 text-sm text-[var(--color-text-primary)] placeholder:text-[var(--color-text-tertiary)] focus:border-[var(--color-accent-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-accent-primary)]/30"
                  placeholder="(555) 123-4567"
                  value={field.value ?? ""}
                  onChange={(event) => {
                    field.onChange(formatPhoneForInput(event.target.value));
                  }}
                />
              )}
            />
          </div>

          <div>
            <label className="text-sm font-medium text-[var(--color-text-primary)]" htmlFor="code">
              Verification code
            </label>
            <input
              id="code"
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              className="mt-1 w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-muted)] px-3 py-2 text-sm text-[var(--color-text-primary)] placeholder:text-[var(--color-text-tertiary)] focus:border-[var(--color-accent-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-accent-primary)]/30"
              placeholder="6-digit code"
              {...register("code", { required: true })}
            />
          </div>

          {errorMessage ? <p className="text-sm text-rose-300">{errorMessage}</p> : null}

          <button
            type="submit"
            className="w-full rounded-xl bg-[var(--color-accent-primary)] px-4 py-2 text-sm font-semibold text-[var(--color-text-on-accent)] transition hover:bg-[var(--color-accent-primary)] disabled:cursor-not-allowed disabled:opacity-70"
            disabled={isSubmitting}
          >
            Confirm code
          </button>
        </form>

        <div className="text-center">
          <Link
            href="/signup"
            className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--color-text-tertiary)] transition hover:text-[var(--color-accent-gold)]"
          >
            Back to create account
          </Link>
        </div>
      </div>
    </div>
  );
}

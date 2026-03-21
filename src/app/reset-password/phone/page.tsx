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

type PhoneResetFormValues = {
  phone: string;
  code: string;
  password: string;
  confirmPassword: string;
};

export default function PhoneResetPasswordPage() {
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
      <PhoneResetPasswordInner />
    </Suspense>
  );
}

function PhoneResetPasswordInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const supabase = createSupabaseBrowserClient();

  const initialPhone = useMemo(() => {
    const fromQuery = searchParams.get("phone") ?? "";
    if (fromQuery) {
      return formatPhoneForInput(fromQuery);
    }
    if (typeof window !== "undefined") {
      const fromStorage = window.sessionStorage.getItem("pendingRecoveryPhone") ?? "";
      return formatPhoneForInput(fromStorage);
    }
    return "";
  }, [searchParams]);

  const { control, register, handleSubmit } = useForm<PhoneResetFormValues>({
    defaultValues: {
      phone: initialPhone,
      code: "",
      password: "",
      confirmPassword: "",
    },
  });

  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const onSubmit = handleSubmit(async (values) => {
    setErrorMessage(null);
    setSuccessMessage(null);

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

    if (values.password.length < 8) {
      setErrorMessage("Password must be at least 8 characters.");
      return;
    }

    if (values.password !== values.confirmPassword) {
      setErrorMessage("Passwords do not match.");
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

      const { error: updateError } = await supabase.auth.updateUser({
        password: values.password,
      });

      if (updateError) {
        setErrorMessage(updateError.message);
        return;
      }

      if (typeof window !== "undefined") {
        window.sessionStorage.removeItem("pendingRecoveryPhone");
      }

      setSuccessMessage("Password updated. You can now sign in.");
      await supabase.auth.signOut();
      router.push("/login");
    } catch {
      setErrorMessage("Unable to reset password right now. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  });

  return (
    <div className="min-h-screen bg-[var(--color-screen-bg)] px-6 py-10 text-[var(--color-text-primary)]">
      <div className="mx-auto w-full max-w-md space-y-6 rounded-3xl border border-[var(--color-border)] bg-[var(--color-surface-primary)]/10 p-8 shadow-[0_30px_80px_-40px_rgba(0,0,0,0.8)] backdrop-blur">
        <div className="space-y-2">
          <span className="text-xs uppercase tracking-[0.3em] text-[var(--color-accent-secondary)]/70">
            Reset password
          </span>
          <h1 className="text-2xl font-semibold text-[var(--color-text-primary)]">Enter code and new password</h1>
          <p className="text-sm text-[var(--color-text-secondary)]">
            Use the code sent to your phone number.
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

          <div>
            <label className="text-sm font-medium text-[var(--color-text-primary)]" htmlFor="password">
              New password
            </label>
            <div className="relative mt-1">
              <input
                id="password"
                type={showPassword ? "text" : "password"}
                autoComplete="new-password"
                className="w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-muted)] px-3 py-2 pr-20 text-sm text-[var(--color-text-primary)] placeholder:text-[var(--color-text-tertiary)] focus:border-[var(--color-accent-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-accent-primary)]/30"
                placeholder="********"
                {...register("password", { required: true })}
              />
              <button
                type="button"
                onClick={() => setShowPassword((prev) => !prev)}
                className="absolute inset-y-0 right-2 my-1 rounded-lg px-2 text-xs font-semibold uppercase tracking-[0.14em] text-[var(--color-text-secondary)] transition hover:text-[var(--color-accent-secondary)]"
                aria-label={showPassword ? "Hide password" : "Show password"}
              >
                {showPassword ? "Hide" : "Show"}
              </button>
            </div>
          </div>

          <div>
            <label className="text-sm font-medium text-[var(--color-text-primary)]" htmlFor="confirmPassword">
              Confirm new password
            </label>
            <div className="relative mt-1">
              <input
                id="confirmPassword"
                type={showConfirmPassword ? "text" : "password"}
                autoComplete="new-password"
                className="w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-muted)] px-3 py-2 pr-20 text-sm text-[var(--color-text-primary)] placeholder:text-[var(--color-text-tertiary)] focus:border-[var(--color-accent-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-accent-primary)]/30"
                placeholder="********"
                {...register("confirmPassword", { required: true })}
              />
              <button
                type="button"
                onClick={() => setShowConfirmPassword((prev) => !prev)}
                className="absolute inset-y-0 right-2 my-1 rounded-lg px-2 text-xs font-semibold uppercase tracking-[0.14em] text-[var(--color-text-secondary)] transition hover:text-[var(--color-accent-secondary)]"
                aria-label={showConfirmPassword ? "Hide confirm password" : "Show confirm password"}
              >
                {showConfirmPassword ? "Hide" : "Show"}
              </button>
            </div>
          </div>

          {errorMessage ? <p className="text-sm text-rose-300">{errorMessage}</p> : null}
          {successMessage ? <p className="text-sm text-emerald-300">{successMessage}</p> : null}

          <button
            type="submit"
            className="w-full rounded-xl bg-[var(--color-accent-primary)] px-4 py-2 text-sm font-semibold text-[var(--color-text-on-accent)] transition hover:bg-[var(--color-accent-primary)] disabled:cursor-not-allowed disabled:opacity-70"
            disabled={isSubmitting}
          >
            Reset password
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

"use client";

import { useEffect, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";

type ResetFormValues = {
  email: string;
  code: string;
  password: string;
  confirmPassword: string;
};

type VerifyOtpType =
  | "signup"
  | "invite"
  | "magiclink"
  | "recovery"
  | "email_change"
  | "email";

export default function ResetPasswordPage() {
  const router = useRouter();
  const supabase = createSupabaseBrowserClient();
  const { register, handleSubmit, setValue } = useForm<ResetFormValues>();
  const [message, setMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [ready, setReady] = useState(false);
  const [hasSession, setHasSession] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const submitGuardRef = useRef(false);

  useEffect(() => {
    let isMounted = true;

    const initSession = async () => {
      const url = new URL(window.location.href);
      const params = url.searchParams;

      const emailFromQuery = params.get("email") ?? "";
      let emailFromStorage = "";
      try {
        emailFromStorage = window.sessionStorage.getItem("pendingRecoveryEmail") ?? "";
      } catch {
        // Ignore storage failures.
      }
      const emailPrefill = (emailFromQuery || emailFromStorage).trim().toLowerCase();
      if (emailPrefill) {
        setValue("email", emailPrefill);
      }

      const code = params.get("code");
      const tokenHash = params.get("token_hash");
      const type = params.get("type");
      const allowedVerifyTypes = new Set([
        "signup",
        "invite",
        "magiclink",
        "recovery",
        "email_change",
        "email",
      ]);
      const otpType: VerifyOtpType | null =
        type && allowedVerifyTypes.has(type) ? (type as VerifyOtpType) : null;
      const sessionExists = async () => {
        const { data } = await supabase.auth.getSession();
        return Boolean(data.session);
      };
      const hadCallbackParams = Boolean(
        code ||
          (tokenHash && otpType) ||
          window.location.hash?.includes("access_token=")
      );

      // Supabase can send different link formats depending on auth flow/settings:
      // - PKCE: ?code=...
      // - Verify OTP: ?token_hash=...&type=recovery
      // - Implicit: #access_token=...&refresh_token=...
      try {
        // If Supabase auto-detected the session from the URL already, trust it.
        if (await sessionExists()) {
          if (isMounted) {
            setHasSession(true);
            setReady(true);
          }
          return;
        }

        if (code) {
          await supabase.auth.exchangeCodeForSession(window.location.href);
          const valid = await sessionExists();
          if (isMounted) {
            setHasSession(valid);
            setReady(true);
          }
          return;
        }

        if (tokenHash && otpType) {
          await supabase.auth.verifyOtp({
            token_hash: tokenHash,
            type: otpType,
          });
          const valid = await sessionExists();
          if (isMounted) {
            setHasSession(valid);
            setReady(true);
          }
          return;
        }

        if (window.location.hash?.includes("access_token=")) {
          const hashParams = new URLSearchParams(window.location.hash.slice(1));
          const access_token = hashParams.get("access_token");
          const refresh_token = hashParams.get("refresh_token");

          if (access_token && refresh_token) {
            await supabase.auth.setSession({ access_token, refresh_token });
          }

          const valid = await sessionExists();
          if (isMounted) {
            setHasSession(valid);
            setReady(true);
          }
          return;
        }
      } catch {
        // Fall back to showing the OTP entry form below.
      }

      const valid = await sessionExists();
      if (isMounted) {
        setHasSession(valid);
        if (!valid && hadCallbackParams) {
          setErrorMessage(
            "This reset link is invalid or expired. You can still enter the recovery code from your email below."
          );
        }
        setReady(true);
      }
    };

    initSession();

    return () => {
      isMounted = false;
    };
  }, [setValue, supabase]);

  const onSubmit = handleSubmit(async (values) => {
    if (submitGuardRef.current) return;
    submitGuardRef.current = true;

    try {
    const email = values.email.trim().toLowerCase();
    const code = values.code.trim();

    if (values.password.length < 8) {
      setErrorMessage("Password must be at least 8 characters.");
      return;
    }

    if (values.password !== values.confirmPassword) {
      setErrorMessage("Passwords do not match.");
      return;
    }

    setIsSubmitting(true);
    setErrorMessage(null);
    setMessage(null);

    if (!hasSession) {
      if (!email || !email.includes("@")) {
        setIsSubmitting(false);
        setErrorMessage("A valid email is required.");
        return;
      }

      if (!code) {
        setIsSubmitting(false);
        setErrorMessage("Recovery code is required.");
        return;
      }

      const { error: verifyError } = await supabase.auth.verifyOtp({
        email,
        token: code,
        type: "recovery",
      });

      if (verifyError) {
        setIsSubmitting(false);
        setErrorMessage(verifyError.message);
        return;
      }

      const { data } = await supabase.auth.getSession();
      if (!data.session) {
        setIsSubmitting(false);
        setErrorMessage("Unable to verify recovery code.");
        return;
      }

      setHasSession(true);
    }

    const { error } = await supabase.auth.updateUser({
      password: values.password,
    });

    setIsSubmitting(false);

    if (error) {
      setErrorMessage(error.message);
      return;
    }

    try {
      window.sessionStorage.removeItem("pendingRecoveryEmail");
    } catch {
      // Ignore storage failures.
    }

    setMessage("Password updated. Redirecting to your cellar...");
    router.push("/entries");
    } finally {
      submitGuardRef.current = false;
    }
  });

  return (
    <div className="min-h-screen bg-[#0f0a09] px-6 py-10 text-zinc-100">
      <div className="mx-auto w-full max-w-md space-y-6 rounded-3xl border border-white/10 bg-white/5 p-8 shadow-[0_30px_80px_-40px_rgba(0,0,0,0.8)] backdrop-blur">
        <div className="space-y-2">
          <span className="text-xs uppercase tracking-[0.3em] text-amber-300/70">
            Reset password
          </span>
          <h1 className="text-2xl font-semibold text-zinc-50">
            Set a new password
          </h1>
          <p className="text-sm text-zinc-300">
            Choose a new password to regain access to CellarSnap.
          </p>
        </div>

        {!ready ? (
          <p className="text-sm text-zinc-300">Preparing reset form...</p>
        ) : (
          <form className="space-y-4" onSubmit={onSubmit}>
            {!hasSession ? (
              <>
                <div>
                  <label className="text-sm font-medium text-zinc-200" htmlFor="email">
                    Email address
                  </label>
                  <input
                    id="email"
                    type="email"
                    autoComplete="email"
                    className="mt-1 w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-500 focus:border-amber-300 focus:outline-none focus:ring-2 focus:ring-amber-300/30"
                    placeholder="you@example.com"
                    {...register("email", { required: true })}
                  />
                </div>

                <div>
                  <label className="text-sm font-medium text-zinc-200" htmlFor="code">
                    Recovery code
                  </label>
                  <input
                    id="code"
                    type="text"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    className="mt-1 w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-500 focus:border-amber-300 focus:outline-none focus:ring-2 focus:ring-amber-300/30"
                    placeholder="6-digit code"
                    {...register("code", { required: true })}
                  />
                  <p className="mt-1 text-xs text-zinc-500">
                    Need a new code?{" "}
                    <Link
                      href="/forgot-password"
                      className="font-medium text-zinc-200 transition hover:text-amber-200"
                    >
                      Go back and resend.
                    </Link>
                  </p>
                </div>
              </>
            ) : null}

            <div>
              <label className="text-sm font-medium text-zinc-200" htmlFor="password">
                New password
              </label>
              <div className="relative mt-1">
                <input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  autoComplete="new-password"
                  className="w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 pr-16 text-sm text-zinc-100 placeholder:text-zinc-500 focus:border-amber-300 focus:outline-none focus:ring-2 focus:ring-amber-300/30"
                  placeholder="At least 8 characters"
                  {...register("password", { required: true })}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((p) => !p)}
                  className="absolute inset-y-0 right-2 my-1 rounded-lg px-2 text-xs font-semibold uppercase tracking-[0.14em] text-zinc-400 transition hover:text-amber-200"
                  aria-label={showPassword ? "Hide password" : "Show password"}
                >
                  {showPassword ? "Hide" : "Show"}
                </button>
              </div>
            </div>
            <div>
              <label
                className="text-sm font-medium text-zinc-200"
                htmlFor="confirmPassword"
              >
                Confirm password
              </label>
              <div className="relative mt-1">
                <input
                  id="confirmPassword"
                  type={showConfirm ? "text" : "password"}
                  autoComplete="new-password"
                  className="w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 pr-16 text-sm text-zinc-100 placeholder:text-zinc-500 focus:border-amber-300 focus:outline-none focus:ring-2 focus:ring-amber-300/30"
                  placeholder="Repeat password"
                  {...register("confirmPassword", { required: true })}
                />
                <button
                  type="button"
                  onClick={() => setShowConfirm((p) => !p)}
                  className="absolute inset-y-0 right-2 my-1 rounded-lg px-2 text-xs font-semibold uppercase tracking-[0.14em] text-zinc-400 transition hover:text-amber-200"
                  aria-label={showConfirm ? "Hide password" : "Show password"}
                >
                  {showConfirm ? "Hide" : "Show"}
                </button>
              </div>
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
              Update password
            </button>

            <p className="text-center text-sm text-zinc-400">
              <Link
                href="/login"
                className="font-medium text-zinc-200 transition hover:text-amber-200"
              >
                ← Back to login
              </Link>
            </p>
          </form>
        )}
      </div>
    </div>
  );
}
